// Модуль для определения текущей и базовой частоты процессора
// Поддерживает различные операционные системы и использует несколько методов для получения точных данных

use std::process::Command;
use std::sync::Mutex;
use lazy_static::lazy_static;
use sysinfo::{System, RefreshKind, CpuRefreshKind};
use raw_cpuid::CpuId;
use std::time::Instant;
use std::collections::VecDeque;
use std::ptr::null_mut;

// WinAPI для доступа к счетчикам производительности Windows
#[cfg(target_os = "windows")]
use winapi::um::pdh::{PdhOpenQueryA, PdhAddEnglishCounterA, PdhCollectQueryData, PdhGetFormattedCounterValue, PDH_FMT_DOUBLE, PDH_FMT_COUNTERVALUE, PDH_HQUERY, PDH_HCOUNTER};
#[cfg(target_os = "windows")]
use winapi::shared::ntdef::NULL;
#[cfg(target_os = "windows")]
use std::ffi::CString;

// Безопасные обертки для PDH типов с правильными типами данных, чтобы их можно было отправлять между потоками
#[cfg(target_os = "windows")]
struct SafeQueryHandle(PDH_HQUERY);
#[cfg(target_os = "windows")]
struct SafeCounterHandle(PDH_HCOUNTER);

#[cfg(target_os = "windows")]
unsafe impl Send for SafeQueryHandle {}
#[cfg(target_os = "windows")]
unsafe impl Sync for SafeQueryHandle {}
#[cfg(target_os = "windows")]
unsafe impl Send for SafeCounterHandle {}
#[cfg(target_os = "windows")]
unsafe impl Sync for SafeCounterHandle {}

// Определяем структуру для доступа к значению счетчика
#[cfg(target_os = "windows")]
#[repr(C)]
struct PdhFmtCounterValue {
    status: u32,
    value: f64,
}

// Константы определенные из данных Get-CimInstance
const INTEL_I5_13400_BASE_SPEED: f64 = 2.5; // ГГц
const INTEL_I5_13400_MAX_SPEED: f64 = 4.6; // ГГц для P-core Turbo
const INTEL_I5_13400_E_CORE_MAX_SPEED: f64 = 3.3; // ГГц для E-core

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
    // Храним историю частот для более плавного отображения
    static ref FREQUENCY_HISTORY: Mutex<VecDeque<f64>> = Mutex::new(VecDeque::with_capacity(10));
    
    // Хранение Handle для Windows PDH
    #[cfg(target_os = "windows")]
    static ref PDH_QUERY_HANDLE: Mutex<Option<SafeQueryHandle>> = Mutex::new(None);
    #[cfg(target_os = "windows")]
    static ref PDH_COUNTER_HANDLE: Mutex<Option<SafeCounterHandle>> = Mutex::new(None);
    #[cfg(target_os = "windows")]
    static ref PDH_INITIALIZED: Mutex<bool> = Mutex::new(false);
    
    // Идентификация процессора
    static ref CPU_MODEL: Mutex<String> = Mutex::new(String::new());
    static ref CPU_PHYSICAL_CORES: Mutex<usize> = Mutex::new(0);
    static ref CPU_LOGICAL_CORES: Mutex<usize> = Mutex::new(0);
}

/// Функция для получения загрузки CPU через sysinfo
fn get_sysinfo_cpu_load() -> f64 {
    let mut sys = System::new_with_specifics(RefreshKind::new().with_cpu(CpuRefreshKind::everything()));
    // Первое считывание (может быть неточным)
    sys.refresh_cpu();
    
    // Необходимо дать время на сбор данных между измерениями
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    // Второе считывание для более точных данных
    sys.refresh_cpu();
    
    let cpu_count = sys.cpus().len() as f32;
    if cpu_count > 0.0 {
        // Собираем нагрузку со всех ядер и вычисляем среднее
        let load = sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / cpu_count;
        
        // Ограничиваем значение диапазоном 0-100
        let load = load.max(0.0).min(100.0);
        
        println!("[DEBUG] Нагрузка CPU (sysinfo): {}%", load);
        return load as f64;
    }
    
    0.0
}

/// Получает частоту CPU через sysinfo
/// Возвращает значение в ГГц (например, 3.5 для 3.5 ГГц)
fn get_sysinfo_cpu_frequency() -> Option<f64> {
    let mut sys = System::new_with_specifics(RefreshKind::new().with_cpu(CpuRefreshKind::everything()));
    sys.refresh_cpu();
    
    // Получаем базовую и максимальную частоты для проверки
    let _base_freq = get_base_cpu_frequency();
    let max_freq = get_max_cpu_frequency();
    
    // В sysinfo частота обычно доступна через .frequency() метод для процессоров
    // Однако в разных версиях и на разных системах она может быть недоступной
    
    let frequencies: Vec<u64> = sys.cpus().iter()
        .map(|cpu| cpu.frequency())
        .collect();
    
    // Проверка, если частоты доступны
    if !frequencies.is_empty() && frequencies.iter().any(|&f| f > 0) {
        // Отфильтровываем нулевые значения и считаем среднее
        let valid_freqs: Vec<u64> = frequencies.into_iter().filter(|&f| f > 0).collect();
        if !valid_freqs.is_empty() {
            let avg_freq = valid_freqs.iter().sum::<u64>() as f64 / valid_freqs.len() as f64;
            
            // sysinfo возвращает частоту в МГц, переводим в ГГц
            let freq_ghz = avg_freq / 1000.0;
            
            // Проверка на разумность значения
            if freq_ghz >= 0.5 && freq_ghz <= max_freq * 1.2 {
                println!("[DEBUG] Частота CPU из sysinfo: {} ГГц (из {} ядер)", freq_ghz, valid_freqs.len());
                return Some(freq_ghz);
            }
        }
    }
    
    None
}

/// Получает текущую частоту процессора в ГГц, полностью используя sysinfo
/// Возвращает значение в ГГц (например, 3.5 для 3.5 ГГц)
pub fn get_current_cpu_frequency() -> f64 {
    // Инициализация информации о процессоре, если это первый запуск
    initialize_cpu_info_if_needed();
    
    // Получаем базовую и максимальную частоты для расчетов
    let base_freq = get_base_cpu_frequency();
    let max_freq = get_max_cpu_frequency();
    
    // Получим нагрузку из Task Manager
    let load = get_task_manager_cpu_load();
    
    // Считаем частоту по нагрузке из sysinfo
    let current_freq = get_cpu_frequency_from_sysinfo();
    
    // Добавляем в историю для сглаживания
    let mut history = FREQUENCY_HISTORY.lock().unwrap();
    if history.len() >= 10 {
        history.pop_front();
    }
    history.push_back(current_freq);
    
    // Вычисляем среднее для сглаживания
    let smoothed_freq = history.iter().sum::<f64>() / history.len() as f64;
    
    // Обновляем последнее значение
    *LAST_FREQUENCY.lock().unwrap() = smoothed_freq;
    
    // Выводим отладочную информацию
    println!("[DEBUG] Частота CPU: {} ГГц, Нагрузка: {}%, База: {} ГГц, Макс: {} ГГц", 
            smoothed_freq, load, base_freq, max_freq);
    
    smoothed_freq
}

/// Получает информацию о частоте через Windows Performance Counters (PDH)
#[cfg(target_os = "windows")]
fn get_frequency_from_windows_pdh() -> Option<f64> {
    unsafe {
        // Инициализируем счетчики PDH если ещё не инициализированы
        let mut initialized = PDH_INITIALIZED.lock().unwrap();
        if !*initialized {
            // Используем правильный тип для query_handle
            let mut query_handle: PDH_HQUERY = null_mut();
            let result = PdhOpenQueryA(NULL as *const i8, 0, &mut query_handle);
            
            if result == 0 {
                // Пробуем разные счетчики частоты, начиная с более точного
                let counter_paths = [
                    "\\Processor Information(_Total)\\% Processor Performance",
                    "\\Processor Information(_Total)\\Processor Frequency",
                    "\\Processor(_Total)\\% Processor Time"
                ];
                
                let mut counter_handle: PDH_HCOUNTER = null_mut();
                let mut success = false;
                
                for &path in counter_paths.iter() {
                    let counter_path = CString::new(path).unwrap();
                    let add_result = PdhAddEnglishCounterA(
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
                PDH_QUERY_HANDLE.lock().unwrap().as_ref(),
                PDH_COUNTER_HANDLE.lock().unwrap().as_ref()
            ) {
                // Передаем правильный тип в функцию
                let result = PdhCollectQueryData(query.0);
                if result == 0 {
                    let mut counter_value: PDH_FMT_COUNTERVALUE = std::mem::zeroed();
                    // Передаем правильный тип в функцию
                    let result = PdhGetFormattedCounterValue(
                        counter.0,
                        PDH_FMT_DOUBLE as u32,
                        null_mut(),
                        &mut counter_value
                    );
                    
                    if result == 0 {
                        // Получаем значение из объединения через безопасное приведение типа
                        // Используем тип PdhFmtCounterValue для доступа к полю value
                        let raw_ptr = &counter_value as *const PDH_FMT_COUNTERVALUE as *const PdhFmtCounterValue;
                        let double_val = (*raw_ptr).value;
                        
                        // Получаем кэшированные значения базовой и максимальной частоты
                        let base_freq = get_base_cpu_frequency();
                        let max_freq = get_max_cpu_frequency();
                        
                        // Расчет частоты
                        // Полученное значение - это % производительности процессора, переводим его в частоту
                        let freq = base_freq + (max_freq - base_freq) * (double_val / 100.0);
                        
                        return Some(freq.min(max_freq).max(base_freq));
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

/// Получает информацию о процессоре через CPUID и WMI
/// Возвращает (базовая_частота, максимальная_частота) в ГГц
fn get_cpu_info_from_cpuid() -> (f64, f64) {
    let mut base_freq = 0.0;
    let mut max_freq = 0.0;
    
    #[cfg(target_arch = "x86_64")]
    {
        let cpuid = CpuId::new();
        
        // Пытаемся получить информацию через brand string (самый надежный метод)
        if let Some(brand_info) = cpuid.get_processor_brand_string() {
            let brand_str = brand_info.as_str();
            *CPU_MODEL.lock().unwrap() = brand_str.to_string();
            
            // Проверяем, есть ли в строке процессор i5-13400
            if brand_str.contains("i5-13400") {
                println!("[DEBUG] Обнаружен процессор Intel i5-13400");
                base_freq = INTEL_I5_13400_BASE_SPEED;
                max_freq = INTEL_I5_13400_MAX_SPEED;
                return (base_freq, max_freq);
            }
            
            // Ищем частоту в строке (например "@ 3.60GHz")
            if let Some(idx) = brand_str.find('@') {
                let freq_part = &brand_str[idx + 1..];
                if let Some(end_idx) = freq_part.find("GHz") {
                    let freq_str = &freq_part[..end_idx].trim();
                    if let Ok(freq) = freq_str.parse::<f64>() {
                        base_freq = freq;
                        
                        // Определяем максимальную частоту на основе базовой
                        if brand_str.contains("Intel") {
                            if brand_str.contains("i9") {
                                max_freq = base_freq * 1.5;
                            } else if brand_str.contains("i7") {
                                max_freq = base_freq * 1.4;
                            } else if brand_str.contains("i5") {
                                max_freq = base_freq * 1.35;
                            } else if brand_str.contains("i3") {
                                max_freq = base_freq * 1.25;
                            } else {
                                max_freq = base_freq * 1.2;
                            }
                        } else if brand_str.contains("AMD") {
                            if brand_str.contains("Ryzen 9") {
                                max_freq = base_freq * 1.5;
                            } else if brand_str.contains("Ryzen 7") {
                                max_freq = base_freq * 1.4;
                            } else if brand_str.contains("Ryzen 5") {
                                max_freq = base_freq * 1.35;
                            } else if brand_str.contains("Ryzen 3") {
                                max_freq = base_freq * 1.25;
                            } else {
                                max_freq = base_freq * 1.2;
                            }
                        } else {
                            max_freq = base_freq * 1.2;
                        }
                    }
                }
            }
        }
        
        // Запасной вариант - CPUID leaf 0x16
        if base_freq <= 0.0 {
            if let Some(frequency_info) = cpuid.get_processor_frequency_info() {
                let base_freq_mhz = frequency_info.processor_base_frequency();
                if base_freq_mhz > 0 {
                    base_freq = base_freq_mhz as f64 / 1000.0;
                    
                    // Пытаемся получить максимальную частоту
                    let max_freq_mhz = frequency_info.processor_max_frequency();
                    if max_freq_mhz > 0 {
                        max_freq = max_freq_mhz as f64 / 1000.0;
                    } else {
                        // Если не удалось, предполагаем на основе базовой
                        max_freq = base_freq * 1.3;
                    }
                }
            }
        }
    }
    
    // Если не удалось определить через CPUID, попробуем WMI (Windows)
    if base_freq <= 0.0 || max_freq <= 0.0 {
        #[cfg(target_os = "windows")]
        {
            // Получаем базовую частоту через WMI
            if let Ok(output) = Command::new("powershell")
                .args(["-Command", "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty CurrentClockSpeed | ForEach-Object { $_ / 1000 }"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(freq) = output_str.trim().parse::<f64>() {
                        if freq > 0.5 {
                            base_freq = freq;
                        }
                    }
                }
            }
            
            // Получаем максимальную частоту через WMI
            if let Ok(output) = Command::new("powershell")
                .args(["-Command", "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty MaxClockSpeed | ForEach-Object { $_ / 1000 }"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(freq) = output_str.trim().parse::<f64>() {
                        if freq > 0.5 {
                            // WMI возвращает базовую частоту, а не max turbo
                            // Для современных процессоров добавляем коэффициент
                            max_freq = freq * 1.2;
                        }
                    }
                }
            }
            
            // Получаем имя процессора
            if CPU_MODEL.lock().unwrap().is_empty() {
                if let Ok(output) = Command::new("powershell")
                    .args(["-Command", "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty Name"])
                    .output() 
                {
                    if let Ok(output_str) = String::from_utf8(output.stdout) {
                        *CPU_MODEL.lock().unwrap() = output_str.trim().to_string();
                        
                        // Если это i5-13400, установим известные значения
                        if output_str.contains("i5-13400") {
                            base_freq = INTEL_I5_13400_BASE_SPEED;
                            max_freq = INTEL_I5_13400_MAX_SPEED;
                        }
                    }
                }
            }
            
            // Получаем количество ядер
            if *CPU_PHYSICAL_CORES.lock().unwrap() == 0 {
                if let Ok(output) = Command::new("powershell")
                    .args(["-Command", "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty NumberOfCores"])
                    .output() 
                {
                    if let Ok(output_str) = String::from_utf8(output.stdout) {
                        if let Ok(cores) = output_str.trim().parse::<usize>() {
                            *CPU_PHYSICAL_CORES.lock().unwrap() = cores;
                        }
                    }
                }
            }
            
            // Получаем количество логических ядер
            if *CPU_LOGICAL_CORES.lock().unwrap() == 0 {
                if let Ok(output) = Command::new("powershell")
                    .args(["-Command", "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty NumberOfLogicalProcessors"])
                    .output() 
                {
                    if let Ok(output_str) = String::from_utf8(output.stdout) {
                        if let Ok(cores) = output_str.trim().parse::<usize>() {
                            *CPU_LOGICAL_CORES.lock().unwrap() = cores;
                        }
                    }
                }
            }
        }
    }
    
    // Если всё ещё не определены, используем значения по умолчанию
    if base_freq <= 0.5 {
        base_freq = 2.0;
    }
    
    if max_freq <= 0.5 || max_freq < base_freq {
        max_freq = base_freq * 1.3;
    }
    
    (base_freq, max_freq)
}

/// Инициализирует информацию о процессоре при первом запуске
fn initialize_cpu_info_if_needed() {
    // Проверяем, инициализирована ли информация о процессоре
    let base_freq_initialized = CPU_BASE_FREQUENCY.lock().unwrap().is_some();
    let max_freq_initialized = CPU_MAX_FREQUENCY.lock().unwrap().is_some();
    
    if !base_freq_initialized || !max_freq_initialized {
        // Сначала проверяем модель процессора
        let mut processor_model = String::new();
        
        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty Name"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    processor_model = output_str.trim().to_string();
                    *CPU_MODEL.lock().unwrap() = processor_model.clone();
                }
            }
        }
        
        // Проверяем, является ли процессор Intel i5-13400
        if processor_model.contains("i5-13400") {
            println!("[DEBUG] Обнаружен процессор Intel i5-13400");
            
            // Принудительно задаем значения для i5-13400
            *CPU_PHYSICAL_CORES.lock().unwrap() = 10;  // 6 P-cores + 4 E-cores
            *CPU_LOGICAL_CORES.lock().unwrap() = 16;   // 6 P-cores с HT (12 потоков) + 4 E-cores без HT
            *CPU_BASE_FREQUENCY.lock().unwrap() = Some(INTEL_I5_13400_BASE_SPEED);
            *CPU_MAX_FREQUENCY.lock().unwrap() = Some(INTEL_I5_13400_MAX_SPEED);
            
            println!("[DEBUG] Инициализация i5-13400: База: {} ГГц, Макс: {} ГГц, Физические ядра: {}, Логические ядра: {}", 
                 INTEL_I5_13400_BASE_SPEED, INTEL_I5_13400_MAX_SPEED, 10, 16);
                 
            return;
        }
        
        // Стандартная инициализация для других процессоров
        let (base_freq, max_freq) = get_cpu_info_from_cpuid();
        
        // Сохраняем базовую частоту
        if !base_freq_initialized {
            *CPU_BASE_FREQUENCY.lock().unwrap() = Some(base_freq);
        }
        
        // Сохраняем максимальную частоту
        if !max_freq_initialized {
            *CPU_MAX_FREQUENCY.lock().unwrap() = Some(max_freq);
        }
        
        println!("[DEBUG] Инициализация процессора: Модель: {}, База: {} ГГц, Макс: {} ГГц, Физические ядра: {}, Логические ядра: {}", 
             CPU_MODEL.lock().unwrap(), base_freq, max_freq, 
             CPU_PHYSICAL_CORES.lock().unwrap(), CPU_LOGICAL_CORES.lock().unwrap());
    }
}

/// Получает базовую частоту процессора
pub fn get_base_cpu_frequency() -> f64 {
    let mut base_frequency = 0.0;
    
    #[cfg(target_os = "windows")]
    {
        // Метод 1: через WMI с прямым запросом в cmd (самый быстрый)
        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/c", "wmic cpu get CurrentClockSpeed,MaxClockSpeed /format:list"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                for line in output_str.lines() {
                    if line.starts_with("MaxClockSpeed=") {
                        if let Ok(speed) = line.trim_start_matches("MaxClockSpeed=").trim().parse::<f64>() {
                            // Преобразуем МГц в ГГц
                            base_frequency = speed / 1000.0;
                            println!("[CPU] Базовая частота из WMI (MaxClockSpeed): {} ГГц", base_frequency);
                            break;
                        }
                    }
                }
            }
        }
        
        // Метод 2: через системный реестр (если первый не сработал)
        if base_frequency == 0.0 {
            if let Ok(output) = std::process::Command::new("reg")
                .args(["query", "HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", "/v", "~MHz"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    for line in output_str.lines() {
                        if line.contains("~MHz") {
                            let parts: Vec<&str> = line.split_whitespace().collect();
                            if parts.len() >= 3 {
                                if let Ok(speed) = parts[parts.len()-1].trim().parse::<f64>() {
                                    // Преобразуем МГц в ГГц
                                    base_frequency = speed / 1000.0;
                                    println!("[CPU] Базовая частота из реестра: {} ГГц", base_frequency);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Метод 3: через PowerShell (если предыдущие не сработали)
        if base_frequency == 0.0 {
            if let Ok(output) = std::process::Command::new("powershell")
                .args(["-Command", "Get-WmiObject -Class Win32_Processor | Select-Object -ExpandProperty MaxClockSpeed"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(speed) = output_str.trim().parse::<f64>() {
                        // Преобразуем МГц в ГГц
                        base_frequency = speed / 1000.0;
                        println!("[CPU] Базовая частота из PowerShell: {} ГГц", base_frequency);
                    }
                }
            }
        }
    }
    
    // Если все методы не сработали или мы на другой ОС
    if base_frequency == 0.0 {
        base_frequency = match std::env::consts::OS {
            "windows" => 3.4, // Примерное значение для Windows
            "linux" => {
                // На Linux читаем из /proc/cpuinfo
                if let Ok(cpuinfo) = std::fs::read_to_string("/proc/cpuinfo") {
                    let mut max_freq = 0.0;
                    for line in cpuinfo.lines() {
                        if line.starts_with("cpu MHz") {
                            if let Some(value) = line.split(':').nth(1) {
                                if let Ok(freq) = value.trim().parse::<f64>() {
                                    if freq > max_freq {
                                        max_freq = freq;
                                    }
                                }
                            }
                        }
                    }
                    if max_freq > 0.0 {
                        max_freq / 1000.0 // Преобразуем МГц в ГГц
                    } else {
                        2.0 // Заглушка для Linux
                    }
                } else {
                    2.0 // Заглушка для Linux
                }
            },
            _ => 2.0, // Заглушка для других ОС
        };
        println!("[CPU] Базовая частота из заглушки: {} ГГц", base_frequency);
    }
    
    base_frequency
}

/// Получает максимальную частоту процессора
pub fn get_max_cpu_frequency() -> f64 {
    // Инициализируем при необходимости
    if CPU_MAX_FREQUENCY.lock().unwrap().is_none() {
        initialize_cpu_info_if_needed();
    }
    
    // Возвращаем кэшированное значение или определяем заново
    CPU_MAX_FREQUENCY.lock().unwrap().unwrap_or_else(|| {
        let (_, max_freq) = get_cpu_info_from_cpuid();
        *CPU_MAX_FREQUENCY.lock().unwrap() = Some(max_freq);
        max_freq
    })
}

/// Проверяет, имеет ли процессор гибридную архитектуру (P-cores + E-cores)
fn has_hybrid_cores() -> bool {
    let model = CPU_MODEL.lock().unwrap();
    
    // 12th+ Gen Intel имеют гибридную архитектуру
    model.contains("Intel") && (
        model.contains("12") || 
        model.contains("13") || 
        model.contains("14")
    )
}

/// Получает примерное количество производительных ядер (P-cores)
fn get_p_core_count() -> usize {
    let physical_cores = *CPU_PHYSICAL_CORES.lock().unwrap();
    
    if has_hybrid_cores() {
        // Для i5-13400 известно, что P-cores = 6
        let model = CPU_MODEL.lock().unwrap();
        if model.contains("i5-13400") {
            return 6;
        }
        
        // Для других моделей с гибридной архитектурой оцениваем количество P-cores
        // типичное соотношение для Intel 12/13 gen:
        if physical_cores > 10 {
            physical_cores / 2 + 2 // Для i9/i7 обычно примерно половина + 2
        } else if physical_cores > 6 {
            physical_cores / 2 + 1 // Для i5 обычно примерно половина + 1
        } else {
            physical_cores / 2 // Для i3 обычно половина
        }
    } else {
        // Для не-гибридных архитектур все ядра - P-cores
        physical_cores
    }
}

/// Получает частоту процессора из системной информации
/// Это не очень точный метод, но может использоваться как резервный
pub fn get_cpu_frequency_from_sysinfo() -> f64 {
    // Получаем базовую и максимальную частоты для расчетов
    let base_freq = get_base_cpu_frequency();
    let max_freq = get_max_cpu_frequency();
    
    // Получаем нагрузку CPU
    let cpu_load = get_sysinfo_cpu_load();
    
    // Минимальная частота обычно составляет 60-70% от базовой
    let min_freq = base_freq * 0.65;
    
    // Доработанная нелинейная зависимость частоты от нагрузки
    let current_freq = if cpu_load < 1.0 {
        // При почти нулевой нагрузке - минимальная частота
        min_freq
    } else if cpu_load < 5.0 {
        // 1-5% нагрузки - плавный переход от минимальной к базовой
        min_freq + (base_freq - min_freq) * ((cpu_load - 1.0) / 4.0)
    } else if cpu_load < 20.0 {
        // 5-20% нагрузки - частота около базовой
        base_freq * (0.95 + (cpu_load - 5.0) / 300.0)
    } else if cpu_load < 50.0 {
        // 20-50% нагрузки - начало турбо-режима
        base_freq + (max_freq - base_freq) * ((cpu_load - 20.0) / 30.0) * 0.5
    } else {
        // 50-100% нагрузки - рост до максимальной частоты
        let boost_factor = (cpu_load - 50.0) / 50.0;
        base_freq + (max_freq - base_freq) * (0.5 + 0.5 * boost_factor)
    };
    
    // Проверяем на разумность полученного значения
    let result = current_freq.max(min_freq).min(max_freq);
    
    println!("[DEBUG] get_cpu_frequency_from_sysinfo: Нагрузка: {}%, Частота: {} ГГц", 
           cpu_load, result);
    
    result
}

/// Получает количество физических ядер процессора
pub fn get_cpu_physical_cores() -> usize {
    #[cfg(target_os = "windows")]
    {
        // Метод 1: через WMI напрямую через cmd
        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/c", "wmic cpu get NumberOfCores /format:list"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                for line in output_str.lines() {
                    if line.starts_with("NumberOfCores=") {
                        if let Ok(cores) = line.trim_start_matches("NumberOfCores=").trim().parse::<usize>() {
                            println!("[CPU] Физические ядра из WMI: {}", cores);
                            return cores;
                        }
                    }
                }
            }
        }
        
        // Метод 2: через системную информацию
        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/c", "echo %NUMBER_OF_PROCESSORS%"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(cores) = output_str.trim().parse::<usize>() {
                    println!("[CPU] Ядра через NUMBER_OF_PROCESSORS: {}", cores);
                    // Обычно NUMBER_OF_PROCESSORS дает число логических ядер, делим на 2 если > 1
                    if cores > 1 {
                        return cores / 2;
                    }
                    return cores;
                }
            }
        }
        
        // Метод 3: через sysinfo
        if let Ok(cores) = std::thread::available_parallelism() {
            let physical_cores = cores.get() / 2;
            if physical_cores > 0 {
                println!("[CPU] Физические ядра через available_parallelism: {}", physical_cores);
                return physical_cores;
            }
        }
        
        // Заглушка, если не смогли получить
        println!("[CPU] Используем заглушку: 4 физических ядра");
        return 4; // Типичное значение как заглушка
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // На других ОС используем std::thread::available_parallelism() и делим на 2
        // так как обычно это количество логических ядер
        if let Ok(cores) = std::thread::available_parallelism() {
            let physical_cores = cores.get() / 2;
            if physical_cores > 0 {
                return physical_cores;
            }
        }
        return 2; // Заглушка
    }
}

/// Получает количество логических процессоров (потоков) процессора
pub fn get_cpu_logical_cores() -> usize {
    #[cfg(target_os = "windows")]
    {
        // Метод 1: через WMI напрямую через cmd
        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/c", "wmic cpu get NumberOfLogicalProcessors /format:list"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                for line in output_str.lines() {
                    if line.starts_with("NumberOfLogicalProcessors=") {
                        if let Ok(cores) = line.trim_start_matches("NumberOfLogicalProcessors=").trim().parse::<usize>() {
                            println!("[CPU] Логические ядра из WMI: {}", cores);
                            return cores;
                        }
                    }
                }
            }
        }
        
        // Метод 2: через системную информацию
        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/c", "echo %NUMBER_OF_PROCESSORS%"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(cores) = output_str.trim().parse::<usize>() {
                    println!("[CPU] Логические ядра через NUMBER_OF_PROCESSORS: {}", cores);
                    return cores;
                }
            }
        }
        
        // Метод 3: через std::thread::available_parallelism()
        if let Ok(cores) = std::thread::available_parallelism() {
            println!("[CPU] Логические ядра через available_parallelism: {}", cores.get());
            return cores.get();
        }
        
        // Заглушка, если не смогли получить
        println!("[CPU] Используем заглушку: 8 логических ядер");
        return 8; // Типичное значение как заглушка
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // На других ОС используем std::thread::available_parallelism()
        if let Ok(cores) = std::thread::available_parallelism() {
            return cores.get();
        }
        return 4; // Заглушка
    }
}

/// Получает название модели процессора
pub fn get_cpu_model() -> String {
    // Инициализируем информацию о процессоре, если это первый запуск
    initialize_cpu_info_if_needed();
    
    CPU_MODEL.lock().unwrap().clone()
}

pub fn get_task_manager_cpu_load() -> f64 {
    let mut sys = System::new_with_specifics(sysinfo::RefreshKind::new().with_cpu(sysinfo::CpuRefreshKind::everything()));
    sys.refresh_cpu();
    
    // Метод 1: Получение нагрузки через sysinfo
    // Часто это наиболее точный способ
    let mut total_load = 0.0;
    let cpu_count = sys.cpus().len();
    
    if cpu_count > 0 {
        for cpu in sys.cpus() {
            total_load += cpu.cpu_usage() as f64;
        }
        
        let average_load = total_load / cpu_count as f64;
        println!("CPU load from sysinfo: {}%", average_load);
        
        if average_load > 0.0 {
            return average_load;
        }
    }
    
    // Метод 2: Получение нагрузки через WMI (только для Windows)
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("powershell")
            .args(["-Command", "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty LoadPercentage"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(usage) = output_str.trim().parse::<f64>() {
                    println!("CPU load from WMI: {}%", usage);
                    return usage;
                }
            }
        }
    }
    
    // Метод 3: Получение нагрузки через PDH API (только для Windows)
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("powershell")
            .args(["-Command", "Get-Counter -Counter '\\Processor(_Total)\\% Processor Time' | Select-Object -ExpandProperty CounterSamples | Select-Object -ExpandProperty CookedValue"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(usage) = output_str.trim().parse::<f64>() {
                    println!("CPU load from PDH: {}%", usage);
                    return usage;
                }
            }
        }
    }
    
    // Запасной метод для других ОС или если все методы выше не сработали
    #[cfg(not(target_os = "windows"))]
    {
        let mut sys = System::new_all();
        sys.refresh_cpu();
        let total_usage = sys.cpus().iter().map(|p| p.cpu_usage() as f64).sum::<f64>() / 
                         (sys.cpus().len() as f64);
        println!("CPU load from sysinfo (fallback): {}%", total_usage);
        return total_usage;
    }
    
    // Если все методы не сработали, возвращаем 0
    println!("Failed to get CPU load, returning 0");
    0.0
} 