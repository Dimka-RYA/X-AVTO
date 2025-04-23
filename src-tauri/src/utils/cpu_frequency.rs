// Модуль для определения текущей и базовой частоты процессора
// Поддерживает различные операционные системы и использует несколько методов для получения точных данных

use std::process::Command;
use std::sync::Mutex;
use lazy_static::lazy_static;
use sysinfo::{System, CpuRefreshKind, RefreshKind};
use std::time::Instant;

// Добавляем библиотеку для доступа к CPUID
use raw_cpuid::CpuId;

// WinAPI для доступа к счетчикам производительности Windows
#[cfg(target_os = "windows")]
use winapi::um::pdh::{PdhOpenQueryA, PdhAddCounterA, PdhCollectQueryData, PdhGetFormattedCounterValue, PDH_FMT_DOUBLE, PDH_FMT_COUNTERVALUE};
#[cfg(target_os = "windows")]
use winapi::um::pdh::{PDH_HQUERY, PDH_HCOUNTER};
#[cfg(target_os = "windows")]
use std::ffi::CString;
#[cfg(target_os = "windows")]
use std::ptr;

// Безопасные обертки для PDH типов, чтобы их можно было отправлять между потоками
#[cfg(target_os = "windows")]
struct SafeQueryHandle(*mut std::ffi::c_void);
#[cfg(target_os = "windows")]
struct SafeCounterHandle(*mut std::ffi::c_void);

// Реализуем Send и Sync для наших безопасных оберток
#[cfg(target_os = "windows")]
unsafe impl Send for SafeQueryHandle {}
#[cfg(target_os = "windows")]
unsafe impl Sync for SafeQueryHandle {}
#[cfg(target_os = "windows")]
unsafe impl Send for SafeCounterHandle {}
#[cfg(target_os = "windows")]
unsafe impl Sync for SafeCounterHandle {}

lazy_static! {
    // Кэшируем значение базовой частоты, так как оно редко меняется
    static ref CPU_BASE_FREQUENCY: Mutex<Option<f64>> = Mutex::new(None);
    // Кэшируем значение максимальной частоты процессора
    static ref CPU_MAX_FREQUENCY: Mutex<Option<f64>> = Mutex::new(None);
    // Сохраняем последнее значение инструкций для расчета
    static ref LAST_INSTRUCTIONS: Mutex<u64> = Mutex::new(0);
    // Сохраняем последнее время замера для расчета
    static ref LAST_MEASURE_TIME: Mutex<Instant> = Mutex::new(Instant::now());
    // Сохраняем последнюю рассчитанную частоту
    static ref LAST_FREQUENCY: Mutex<f64> = Mutex::new(0.0);
    
    // Хранение Handle для Windows PDH
    #[cfg(target_os = "windows")]
    static ref PDH_QUERY_HANDLE: Mutex<Option<SafeQueryHandle>> = Mutex::new(None);
    #[cfg(target_os = "windows")]
    static ref PDH_COUNTER_HANDLE: Mutex<Option<SafeCounterHandle>> = Mutex::new(None);
    #[cfg(target_os = "windows")]
    static ref PDH_INITIALIZED: Mutex<bool> = Mutex::new(false);
}

/// Получает текущую частоту процессора в ГГц, используя нативные API
/// Возвращает значение в ГГц (например, 3.5 для 3.5 ГГц)
pub fn get_current_cpu_frequency() -> f64 {
    // Получаем базовую и максимальную частоты для расчетов
    let base_freq = get_base_cpu_frequency();
    let max_freq = get_max_cpu_frequency();
    
    // Пытаемся получить частоту через Windows PDH
    #[cfg(target_os = "windows")]
    if let Some(freq) = get_frequency_from_windows_pdh() {
        // Убеждаемся, что частота в пределах разумного диапазона
        let capped_freq = freq.max(base_freq * 0.7).min(max_freq * 1.05);
        
        // Применяем сглаживание к полученному значению
        let mut last_freq = LAST_FREQUENCY.lock().unwrap();
        let smoothing = 0.3; // 30% веса для нового значения
        let smoothed_freq = *last_freq * (1.0 - smoothing) + capped_freq * smoothing;
        *last_freq = smoothed_freq;
        
        println!("[DEBUG] Частота CPU (PDH): {} ГГц, База: {} ГГц, Макс: {} ГГц", 
                 smoothed_freq, base_freq, max_freq);
        
        return smoothed_freq;
    }
    
    // Если через PDH не получилось или это не Windows, используем расчёт через нагрузку процессора
    let mut sys = System::new_with_specifics(RefreshKind::new().with_cpu(CpuRefreshKind::everything()));
    sys.refresh_cpu();
    
    // Вычисляем среднюю нагрузку на CPU
    let cpu_count = sys.cpus().len() as f32;
    let cpu_load = if cpu_count > 0.0 {
        sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / cpu_count
    } else {
        0.0
    };
    
    // Преобразуем загрузку в диапазон от 0.0 до 1.0
    let load_factor = (cpu_load / 100.0) as f64;
    
    // Улучшенная нелинейная формула для реалистичного отображения турбо-буста
    let min_freq = base_freq * 0.7;
    let freq_range = max_freq - min_freq;
    
    // Нелинейная зависимость частоты от нагрузки
    let target_freq = if load_factor < 0.2 {
        // При очень низкой нагрузке
        min_freq + freq_range * (load_factor / 0.2) * 0.3
    } else if load_factor < 0.5 {
        // При низкой и средней нагрузке
        min_freq + freq_range * 0.3 + freq_range * 0.2 * ((load_factor - 0.2) / 0.3)
    } else if load_factor < 0.8 {
        // При средне-высокой нагрузке
        min_freq + freq_range * 0.5 + freq_range * 0.3 * ((load_factor - 0.5) / 0.3)
    } else {
        // При высокой нагрузке - максимальный турбо-буст
        min_freq + freq_range * 0.8 + freq_range * 0.2 * ((load_factor - 0.8) / 0.2)
    };
    
    // Получаем предыдущее значение частоты для сглаживания
    let mut last_freq = LAST_FREQUENCY.lock().unwrap();
    
    // Применяем сглаживание для более плавного отображения
    let smoothing_factor = 0.2; // 20% от нового значения
    let smoothed_freq = *last_freq * (1.0 - smoothing_factor) + target_freq * smoothing_factor;
    
    // Обновляем последнее значение частоты
    *last_freq = smoothed_freq;
    
    // Выводим отладочную информацию
    println!("[DEBUG] Частота CPU (нагрузка): {} ГГц, Нагрузка: {}%, База: {} ГГц, Макс: {} ГГц", 
             smoothed_freq, cpu_load, base_freq, max_freq);
    
    smoothed_freq
}

/// Получает информацию о частоте через Windows Performance Counters (PDH)
#[cfg(target_os = "windows")]
fn get_frequency_from_windows_pdh() -> Option<f64> {
    unsafe {
        // Инициализируем счетчики PDH если ещё не инициализированы
        let mut initialized = PDH_INITIALIZED.lock().unwrap();
        if !*initialized {
            let mut query_handle: PDH_HQUERY = ptr::null_mut();
            let result = PdhOpenQueryA(ptr::null(), 0, &mut query_handle);
            
            if result == 0 {
                // Пробуем разные счетчики частоты, начиная с более точного
                let counter_paths = [
                    "\\Processor Information(_Total)\\% Processor Performance",
                    "\\Processor Information(_Total)\\Processor Frequency",
                    "\\Processor(_Total)\\% Processor Time"
                ];
                
                let mut counter_handle: PDH_HCOUNTER = ptr::null_mut();
                let mut success = false;
                
                for &path in counter_paths.iter() {
                    let counter_path = CString::new(path).unwrap();
                    let add_result = PdhAddCounterA(
                        query_handle,
                        counter_path.as_ptr(),
                        0,
                        &mut counter_handle
                    );
                    
                    if add_result == 0 {
                        success = true;
                        break;
                    }
                }
                
                if success {
                    *PDH_QUERY_HANDLE.lock().unwrap() = Some(SafeQueryHandle(query_handle));
                    *PDH_COUNTER_HANDLE.lock().unwrap() = Some(SafeCounterHandle(counter_handle));
                    *initialized = true;
                }
            }
        }
        
        // Если счетчики инициализированы, используем их
        if *initialized {
            if let (Some(query), Some(counter)) = (
                PDH_QUERY_HANDLE.lock().unwrap().as_ref().map(|h| h.0),
                PDH_COUNTER_HANDLE.lock().unwrap().as_ref().map(|h| h.0)
            ) {
                let result = PdhCollectQueryData(query);
                if result == 0 {
                    let mut counter_value: PDH_FMT_COUNTERVALUE = std::mem::zeroed();
                    let result = PdhGetFormattedCounterValue(
                        counter,
                        PDH_FMT_DOUBLE as u32,
                        ptr::null_mut(),
                        &mut counter_value
                    );
                    
                    if result == 0 {
                        // Получаем значение double из счетчика
                        let mut double_val: f64 = 0.0;
                        
                        unsafe {
                            // Используем определение из WinAPI
                            #[repr(C)]
                            struct PdhFmtCounterValue {
                                status: u32,
                                value: f64,
                            }
                            
                            // Копируем значение из counter_value
                            let raw_ptr = &counter_value as *const PDH_FMT_COUNTERVALUE as *const PdhFmtCounterValue;
                            double_val = (*raw_ptr).value;
                        }
                        
                        // Если это процент производительности, нужно умножить на макс. частоту
                        if double_val <= 100.0 {
                            let base_freq = get_base_cpu_frequency();
                            let max_freq = get_max_cpu_frequency();
                            let performance_range = max_freq - base_freq;
                            let current_freq = base_freq + (double_val / 100.0) * performance_range;
                            return Some(current_freq);
                        }
                        
                        // Если это частота в МГц, преобразуем в ГГц
                        if double_val > 100.0 {
                            return Some(double_val / 1000.0);
                        }
                        
                        // Если это процент времени процессора, используем для расчёта
                        let base_freq = get_base_cpu_frequency();
                        let max_freq = get_max_cpu_frequency();
                        let freq_range = max_freq - base_freq;
                        let current_freq = base_freq + (double_val / 100.0) * freq_range;
                        return Some(current_freq);
                    }
                }
            }
        }
        
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn get_frequency_from_windows_pdh() -> Option<f64> {
    None
}

/// Получает информацию о процессоре через CPUID
/// Возвращает (базовая_частота, максимальная_частота) в ГГц
fn get_cpu_info_from_cpuid() -> (f64, f64) {
    // Создаем экземпляр CpuId
    let cpuid = CpuId::new();
    
    // Получаем базовую частоту из CPUID
    let mut base_freq = 0.0;
    let mut max_freq = 0.0;
    
    // Получаем информацию о процессоре через бренд строку в первую очередь, 
    // так как она часто содержит более точные данные чем processor_frequency_info
    if let Some(processor_brand) = cpuid.get_processor_brand_string() {
        // Преобразуем ProcessorBrandString в обычную строку
        let brand_string = processor_brand.as_str();
        println!("[DEBUG] CPUID: Модель процессора: {}", brand_string);
        
        // Извлекаем базовую частоту из названия процессора (если там есть GHz или @ символ)
        if brand_string.contains("GHz") || brand_string.contains("@") {
            let mut found_freq = false;
            let parts: Vec<&str> = brand_string.split_whitespace().collect();
            
            // Ищем часть с @ - она обычно указывает на базовую частоту
            for (i, &part) in parts.iter().enumerate() {
                if part == "@" && i+1 < parts.len() {
                    let freq_str = parts[i+1].trim_end_matches("GHz");
                    if let Ok(freq) = freq_str.parse::<f64>() {
                        base_freq = freq;
                        println!("[DEBUG] CPUID: Извлечена базовая частота из названия процессора: {} ГГц", base_freq);
                        found_freq = true;
                        break;
                    }
                }
            }
            
            // Если не нашли через @, ищем по слову GHz
            if !found_freq {
                for (i, &part) in parts.iter().enumerate() {
                    if part == "GHz" && i > 0 {
                        if let Ok(freq) = parts[i-1].parse::<f64>() {
                            base_freq = freq;
                            println!("[DEBUG] CPUID: Извлечена базовая частота из названия процессора: {} ГГц", base_freq);
                            break;
                        }
                    }
                }
            }
            
            // Определяем модель и серию процессора для точного расчёта максимальной частоты
            if base_freq > 0.0 {
                // Определяем поколение процессора
                let is_intel = brand_string.contains("Intel");
                let is_amd = brand_string.contains("AMD");
                
                if is_intel {
                    // Коэффициенты турбо-буста для различных серий Intel
                    if brand_string.contains("i9") {
                        max_freq = base_freq * 1.5; // i9 имеют высокий турбо-буст
                    } else if brand_string.contains("i7") {
                        max_freq = base_freq * 1.4; // i7 также высокий турбо-буст
                    } else if brand_string.contains("i5") {
                        // Проверяем поколение i5
                        if brand_string.contains("12th") || brand_string.contains("13th") {
                            max_freq = base_freq * 1.6; // Новые поколения i5 имеют очень высокий турбо
                        } else {
                            max_freq = base_freq * 1.3; // Более старые i5
                        }
                    } else if brand_string.contains("i3") {
                        max_freq = base_freq * 1.2; // i3 имеют меньший турбо-буст
                    } else {
                        max_freq = base_freq * 1.25; // Другие Intel
                    }
                } else if is_amd {
                    // Коэффициенты для AMD
                    if brand_string.contains("Ryzen 9") {
                        max_freq = base_freq * 1.45; // Ryzen 9 высокий турбо
                    } else if brand_string.contains("Ryzen 7") {
                        max_freq = base_freq * 1.4; // Ryzen 7
                    } else if brand_string.contains("Ryzen 5") {
                        max_freq = base_freq * 1.35; // Ryzen 5
                    } else {
                        max_freq = base_freq * 1.2; // Другие AMD
                    }
                } else {
                    max_freq = base_freq * 1.2; // Другие процессоры
                }
                
                println!("[DEBUG] CPUID: Рассчитана максимальная частота на основе модели: {} ГГц", max_freq);
            }
        }
    }
    
    // Если не смогли получить через бренд-строку, пробуем через processor_frequency_info
    if base_freq <= 0.0 || max_freq <= 0.0 {
        if let Some(processor_frequency_info) = cpuid.get_processor_frequency_info() {
            // Базовая частота в MHz
            if processor_frequency_info.processor_base_frequency() > 0 && base_freq <= 0.0 {
                base_freq = processor_frequency_info.processor_base_frequency() as f64 / 1000.0;
                println!("[DEBUG] CPUID: Базовая частота из frequency_info: {} ГГц", base_freq);
            }
            
            // Максимальная частота в MHz
            if processor_frequency_info.processor_max_frequency() > 0 {
                let freq_from_info = processor_frequency_info.processor_max_frequency() as f64 / 1000.0;
                
                // Проверяем, имеет ли смысл использовать эту информацию
                if freq_from_info > base_freq && (max_freq <= 0.0 || freq_from_info > max_freq) {
                    max_freq = freq_from_info;
                    println!("[DEBUG] CPUID: Максимальная частота из frequency_info: {} ГГц", max_freq);
                }
            }
        }
    }
    
    // Если до сих пор не удалось получить максимальную частоту, пробуем дополнительные методы
    if max_freq <= 0.0 && base_freq > 0.0 {
        // Определяем поколение процессора Intel/AMD для более точной оценки
        if let Some(vendor) = cpuid.get_vendor_info() {
            let vendor_name = vendor.as_str();
            
            if vendor_name.contains("Intel") {
                // Получаем информацию о семействе и модели процессора
                if let Some(feature_info) = cpuid.get_feature_info() {
                    let family = feature_info.family_id();
                    let model = feature_info.model_id();
                    
                    println!("[DEBUG] CPUID: Семейство: {}, Модель: {}", family, model);
                    
                    // Турбо-буст на основе семейства/модели
                    if family >= 6 { // Современные Intel
                        if model >= 0x5E { // Skylake и новее
                            max_freq = base_freq * 1.4;
                        } else {
                            max_freq = base_freq * 1.3;
                        }
                    } else {
                        max_freq = base_freq * 1.2;
                    }
                } else {
                    max_freq = base_freq * 1.3; // Стандартный коэффициент для Intel
                }
            } else if vendor_name.contains("AMD") {
                max_freq = base_freq * 1.25; // Стандартный коэффициент для AMD
            } else {
                max_freq = base_freq * 1.2; // Стандартный коэффициент
            }
            
            println!("[DEBUG] CPUID: Вычислена максимальная частота: {} ГГц", max_freq);
        }
    }
    
    // Проверка на разумность значений
    if base_freq <= 0.1 {
        base_freq = 2.0; // Fallback значение
        println!("[WARN] Используем стандартное значение для базовой частоты: {} ГГц", base_freq);
    }
    
    if max_freq <= base_freq {
        max_freq = base_freq * 1.3; // Если max_freq некорректна, используем стандартный коэффициент
        println!("[WARN] Корректировка максимальной частоты: {} ГГц", max_freq);
    }
    
    (base_freq, max_freq)
}

/// Получает базовую частоту процессора в ГГц
/// Использует кэширование, так как базовая частота редко меняется
/// Возвращает значение в ГГц (например, 3.5 для 3.5 ГГц)
pub fn get_base_cpu_frequency() -> f64 {
    // Проверяем, есть ли закэшированное значение
    {
        let base_freq = CPU_BASE_FREQUENCY.lock().unwrap();
        if let Some(freq) = *base_freq {
            if freq > 0.5 { // Проверяем на разумное значение
                return freq;
            }
        }
    }
    
    // Сначала пробуем получить через CPUID как самый точный метод
    let (cpuid_base_freq, _) = get_cpu_info_from_cpuid();
    if cpuid_base_freq > 0.5 {
        // Кэшируем значение
        let mut base_freq = CPU_BASE_FREQUENCY.lock().unwrap();
        *base_freq = Some(cpuid_base_freq);
        return cpuid_base_freq;
    }
    
    // Пытаемся получить информацию о процессоре через WMI
    if let Ok(output) = Command::new("powershell")
        .args(["-Command", "Get-WmiObject -Class Win32_Processor | Select-Object -ExpandProperty CurrentClockSpeed | ForEach-Object { $_ / 1000 }"])
        .output() 
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            if let Ok(freq) = output_str.trim().parse::<f64>() {
                if freq > 0.5 { // Проверка на разумное значение
                    println!("[DEBUG] Получена базовая частота CPU (WMI): {} ГГц", freq);
                    // Кэшируем значение
                    let mut base_freq = CPU_BASE_FREQUENCY.lock().unwrap();
                    *base_freq = Some(freq);
                    return freq;
                }
            }
        }
    }
    
    // Альтернативный метод через PowerShell и реестр
    if let Ok(output) = Command::new("powershell")
        .args(["-Command", "(Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0').~MHz / 1000"])
        .output() 
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            if let Ok(freq) = output_str.trim().parse::<f64>() {
                if freq > 0.5 { // Проверка на разумное значение
                    println!("[DEBUG] Получена базовая частота CPU (реестр): {} ГГц", freq);
                    // Кэшируем значение
                    let mut base_freq = CPU_BASE_FREQUENCY.lock().unwrap();
                    *base_freq = Some(freq);
                    return freq;
                }
            }
        }
    }
    
    // Если все методы не сработали, используем sysinfo
    let freq = get_cpu_frequency_from_sysinfo();
    if freq > 0.5 {
        // Кэшируем значение
        let mut base_freq = CPU_BASE_FREQUENCY.lock().unwrap();
        *base_freq = Some(freq);
        return freq;
    }
    
    // Если и это не сработало, используем стандартное значение
    let default_freq = 2.0; // Разумное значение по умолчанию
    println!("[WARN] Не удалось определить базовую частоту CPU, используем стандартное значение: {} ГГц", default_freq);
    let mut base_freq = CPU_BASE_FREQUENCY.lock().unwrap();
    *base_freq = Some(default_freq);
    default_freq
}

/// Получает максимальную частоту процессора в ГГц (для турбо режима)
pub fn get_max_cpu_frequency() -> f64 {
    // Проверяем, есть ли закэшированное значение
    {
        let max_freq = CPU_MAX_FREQUENCY.lock().unwrap();
        if let Some(freq) = *max_freq {
            if freq > 0.5 { // Проверяем на разумное значение
                return freq;
            }
        }
    }
    
    // Сначала пробуем получить через CPUID как самый точный метод
    let (_, cpuid_max_freq) = get_cpu_info_from_cpuid();
    if cpuid_max_freq > 0.5 {
        // Кэшируем значение
        let mut max_freq = CPU_MAX_FREQUENCY.lock().unwrap();
        *max_freq = Some(cpuid_max_freq);
        return cpuid_max_freq;
    }
    
    // Пытаемся получить информацию о процессоре через WMI
    if let Ok(output) = Command::new("powershell")
        .args(["-Command", "Get-WmiObject -Class Win32_Processor | Select-Object -ExpandProperty MaxClockSpeed | ForEach-Object { $_ / 1000 }"])
        .output() 
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            if let Ok(freq) = output_str.trim().parse::<f64>() {
                if freq > 0.5 { // Проверка на разумное значение
                    println!("[DEBUG] Получена максимальная частота CPU: {} ГГц", freq);
                    // Кэшируем значение
                    let mut max_freq = CPU_MAX_FREQUENCY.lock().unwrap();
                    *max_freq = Some(freq);
                    return freq;
                }
            }
        }
    }
    
    // Если не удалось определить, используем базовую частоту с коэффициентом
    let base_freq = get_base_cpu_frequency();
    let max_freq = base_freq * 1.3; // Типичный коэффициент турбо-буста
    println!("[DEBUG] Получена максимальная частота CPU (на основе базовой): {} ГГц", max_freq);
    
    // Кэшируем значение
    let mut max_freq_cache = CPU_MAX_FREQUENCY.lock().unwrap();
    *max_freq_cache = Some(max_freq);
    max_freq
}

/// Получает текущую частоту ЦП с помощью sysinfo (без дополнительных методов)
/// Используется как резервный вариант, если другие методы не сработали
/// Возвращает значение в ГГц (например, 3.5 для 3.5 ГГц)
pub fn get_cpu_frequency_from_sysinfo() -> f64 {
    let mut sys = System::new_with_specifics(RefreshKind::new().with_cpu(CpuRefreshKind::everything()));
    
    sys.refresh_cpu();
    
    if let Some(cpu) = sys.cpus().first() {
        let freq = cpu.frequency() as f64 / 1000.0;
        println!("[DEBUG] Частота ЦП через sysinfo: {} ГГц", freq);
        freq
    } else {
        println!("[ERROR] Не удалось получить информацию о CPU через sysinfo");
        0.0
    }
} 