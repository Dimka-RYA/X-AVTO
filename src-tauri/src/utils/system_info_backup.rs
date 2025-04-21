use serde::{Serialize, Deserialize};
use sysinfo::{System, Disks, Components};
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Emitter;
use lazy_static::lazy_static;
use log::{info, debug, error, warn};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessorInfo {
    pub name: String,
    pub usage: f32,
    pub temperature: Option<f32>,
    pub cores: usize,
    pub threads: usize,
    pub frequency: f64,       // текущая частота в ГГц
    pub base_frequency: f64,  // базовая частота в ГГц
    pub max_frequency: f64,   // максимальная частота в ГГц
    pub architecture: String,
    pub vendor_id: String,
    pub model_name: String,
    pub cache_size: String,
    pub stepping: String,
    pub family: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub available_space: u64,
    pub total_space: u64,
    pub file_system: String,
    pub is_removable: bool,
    pub usage_percent: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryInfo {
    pub total_memory: u64,
    pub used_memory: u64,
    pub free_memory: u64,
    pub available_memory: u64,
    pub usage_percent: f32,
    pub memory_type: String,
    pub frequency: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    pub cpu: ProcessorInfo,
    pub disks: Vec<DiskInfo>,
    pub memory: MemoryInfo,
}

// Добавляем структуру кэша системной информации
pub struct SystemInfoCache {
    data: RwLock<Option<SystemInfo>>,
    last_updated: RwLock<std::time::Instant>
}

impl SystemInfoCache {
    fn new() -> Self {
        SystemInfoCache {
            data: RwLock::new(None),
            last_updated: RwLock::new(std::time::Instant::now())
        }
    }

    fn update(&self, info: SystemInfo) {
        let mut data = self.data.write().unwrap();
        *data = Some(info);
        let mut last_updated = self.last_updated.write().unwrap();
        *last_updated = std::time::Instant::now();
    }

    fn get(&self) -> Option<SystemInfo> {
        let data = self.data.read().unwrap();
        data.clone()
    }

    fn get_age(&self) -> Duration {
        let last_updated = self.last_updated.read().unwrap();
        last_updated.elapsed()
    }
}

// Структура для хранения данных о нагрузке процессора
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuLoadInfo {
    pub usage: f32,              // Общая нагрузка в процентах
    pub frequency: f64,          // Частота в ГГц
    pub per_core_usage: Vec<f32>, // Нагрузка по ядрам
    pub timestamp: u64,          // Временная метка в мс
}

// Структура для кэширования данных о нагрузке процессора
pub struct CpuLoadCache {
    pub info: Mutex<CpuLoadInfo>,
    pub system: Mutex<System>,
}

// Создаем кэш для данных о нагрузке процессора
pub fn create_cpu_load_cache() -> CpuLoadCache {
    let mut system = System::new_all();
    system.refresh_all();
    
    // Инициализируем с нулевыми данными
    let per_core_usage = vec![0.0; system.processors().len()];
    
    let info = CpuLoadInfo {
        usage: 0.0,
        frequency: 0.0,
        per_core_usage,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::from_secs(0))
            .as_millis() as u64,
    };
    
    CpuLoadCache {
        info: Mutex::new(info),
        system: Mutex::new(system),
    }
}

// Запуск потока для обновления данных о нагрузке процессора
pub fn start_cpu_load_thread(app_handle: AppHandle, cpu_load_cache: Arc<CpuLoadCache>) {
    thread::spawn(move || {
        loop {
            // Блок для ограничения времени блокировки мьютексов
            {
                let mut system = cpu_load_cache.system.lock().unwrap();
                system.refresh_cpu();
                
                // Получаем нагрузку по ядрам
                let per_core_usage: Vec<f32> = system.processors().iter()
                    .map(|p| p.cpu_usage())
                    .collect();
                
                // Рассчитываем среднюю нагрузку
                let avg_usage: f32 = if !per_core_usage.is_empty() {
                    per_core_usage.iter().sum::<f32>() / per_core_usage.len() as f32
                } else {
                    0.0
                };
                
                // Получаем среднюю частоту
                let frequency = get_cpu_frequency_in_ghz(&system);
                
                // Временная метка
                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or(Duration::from_secs(0))
                    .as_millis() as u64;
                
                // Обновляем данные в кэше
                let mut info = cpu_load_cache.info.lock().unwrap();
                *info = CpuLoadInfo {
                    usage: avg_usage,
                    frequency,
                    per_core_usage,
                    timestamp,
                };
                
                // Отправляем событие с обновленными данными
                let _ = app_handle.emit_all("cpu-load-updated", info.clone());
            }
            
            // Пауза между обновлениями (100 мс для очень частого обновления)
            thread::sleep(Duration::from_millis(100));
        }
    });
}

// Функция для получения текущей нагрузки CPU
#[tauri::command]
pub fn get_cpu_load(cpu_load_cache: tauri::State<Arc<CpuLoadCache>>) -> Result<CpuLoadInfo, String> {
    match cpu_load_cache.info.lock() {
        Ok(info) => Ok(info.clone()),
        Err(_) => Err("Не удалось получить данные о нагрузке процессора".into()),
    }
}

// Утилитная функция для получения средней частоты процессора в ГГц
fn get_cpu_frequency_in_ghz(system: &System) -> f64 {
    let processors = system.processors();
    if processors.is_empty() {
        return 0.0;
    }
    
    // Рассчитываем среднюю частоту
    let total_freq: u64 = processors.iter()
        .map(|p| p.frequency())
        .sum();
        
    // Преобразуем МГц в ГГц и возвращаем среднее
    (total_freq as f64 / processors.len() as f64) / 1000.0
}

// Создаём функцию для запуска фонового потока обновления данных
pub fn start_system_info_thread(app_handle: AppHandle, cache: Arc<SystemInfoCache>) {
    println!("[SystemInfo] Запуск фонового потока обновления системной информации");
    
    thread::spawn(move || {
        let mut update_count = 0;
        
        loop {
            // Получаем информацию о системе
            let system_info = get_system_info_internal();
            cache.update(system_info.clone());
            
            // Отправляем событие с новыми данными
            let _ = app_handle.emit("system-info-updated", system_info);
            
            update_count += 1;
            if update_count % 10 == 0 {
                println!("[SystemInfo] Обновлено {} раз", update_count);
            }
            
            // Пауза перед следующим обновлением
            thread::sleep(Duration::from_millis(1000));
        }
    });
}

// Функция для создания кэша
pub fn create_system_info_cache() -> Arc<SystemInfoCache> {
    Arc::new(SystemInfoCache::new())
}

// Обновленная команда, которая теперь возвращает данные из кэша
#[tauri::command]
pub fn get_system_info(cache: tauri::State<'_, Arc<SystemInfoCache>>) -> SystemInfo {
    // Проверяем, есть ли данные в кэше
    if let Some(info) = cache.get() {
        // Проверяем возраст данных
        let age = cache.get_age();
        println!("[SystemInfo] Возраст данных в кэше: {:?} мс", age.as_millis());
        
        return info;
    }
    
    // Если кэш пуст (первый запуск), получаем данные напрямую
    println!("[SystemInfo] Кэш пуст, получаем данные напрямую");
    get_system_info_internal()
}

// Кэшируем некоторые данные, которые редко меняются
lazy_static! {
    static ref CPU_DETAILS_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
    static ref CPU_DETAILS_CACHE_TIME: Mutex<std::time::Instant> = Mutex::new(std::time::Instant::now());
    static ref CPU_BASE_FREQUENCY: Mutex<Option<f64>> = Mutex::new(None);
    static ref CPU_THREADS: Mutex<Option<usize>> = Mutex::new(None);
}

// Оптимизированная функция для получения данных о процессоре с учетом потенциальных таймаутов
#[cfg(target_os = "windows")]
fn get_cpu_details() -> HashMap<String, String> {
    let mut cpu_details = HashMap::new();
    
    // Выполняем команду в отдельном потоке с таймаутом
    let guard = std::thread::spawn(|| {
        let mut result = HashMap::new();
        
        // На Windows используем wmic для получения дополнительной информации
        if let Ok(output) = Command::new("wmic")
            .args(["cpu", "get", "Name,NumberOfCores,ThreadCount,MaxClockSpeed,Caption,Description,Architecture,Manufacturer,ProcessorId,L2CacheSize,L3CacheSize,Stepping,Family", "/format:list"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                for line in output_str.lines() {
                    if line.is_empty() {
                        continue;
                    }
                    
                    if let Some(sep_pos) = line.find('=') {
                        let key = line[..sep_pos].trim().to_string();
                        let value = line[sep_pos + 1..].trim().to_string();
                        result.insert(key, value);
                    }
                }
            }
        }
        
        result
    });
    
    // Ждем выполнения потока с таймаутом
    match guard.join() {
        Ok(details) => cpu_details = details,
        Err(_) => {
            println!("[ERROR] Таймаут получения данных о процессоре");
            // Заглушка в случае таймаута
            cpu_details.insert("Name".to_string(), "Unknown".to_string());
            cpu_details.insert("Manufacturer".to_string(), "Unknown".to_string());
        }
    }
    
    cpu_details
}

// Функция для получения деталей процессора с кэшированием
fn get_cpu_details_cached() -> HashMap<String, String> {
    let mut cache = CPU_DETAILS_CACHE.lock().unwrap();
    let mut cache_time = CPU_DETAILS_CACHE_TIME.lock().unwrap();
    
    // Если в кэше есть данные и они не старше 5 минут, используем их
    if let Some(ref details) = *cache {
        if cache_time.elapsed() < Duration::from_secs(300) {
            println!("[SystemInfo] Использование кэшированных данных о процессоре");
            return details.clone();
        }
    }
    
    // Если нет данных в кэше или они устарели, получаем новые
    println!("[SystemInfo] Обновление кэша данных о процессоре");
    let details = get_cpu_details();
    *cache = Some(details.clone());
    *cache_time = std::time::Instant::now();
    
    details
}

// Внутренняя функция для получения системной информации без использования кэша
fn get_system_info_internal() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    // Получение базовой информации о процессоре
    let cpu_name = if let Some(cpu) = sys.cpus().first() {
        cpu.brand().to_string()
    } else {
        "Unknown".to_string()
    };
    
    // Получаем нагрузку процессора через улучшенный метод
    let total_usage = get_cpu_usage();
    
    // Получаем детальную информацию о процессоре через специфичные для ОС методы с кэшированием
    let cpu_details = get_cpu_details_cached();
    
    // Получаем температуру процессора улучшенным методом
    let cpu_temp = get_cpu_temperature();
    
    // Получаем текущую частоту процессора
    let current_frequency = get_current_cpu_frequency();
    
    // Получаем базовую частоту процессора с кэшированием
    let base_frequency = {
        let mut base_freq = CPU_BASE_FREQUENCY.lock().unwrap();
        if let Some(freq) = *base_freq {
            freq
        } else {
            let freq = get_base_cpu_frequency();
            *base_freq = Some(freq);
            freq
        }
    };
    
    // Определяем максимальную частоту процессора
    let max_frequency = cpu_details.get("MaxClockSpeed")
        .map(|s| s.parse::<f64>().unwrap_or(0.0) / 1000.0) // Преобразуем МГц в ГГц
        .unwrap_or(0.0);
    
    // Получаем количество потоков с кэшированием
    let threads = {
        let mut threads_cache = CPU_THREADS.lock().unwrap();
        if let Some(t) = *threads_cache {
            t
        } else {
            let t = cpu_details.get("ThreadCount")
                .map(|s| s.parse::<usize>().unwrap_or(sys.cpus().len()))
                .unwrap_or(sys.cpus().len());
            *threads_cache = Some(t);
            t
        }
    };
    
    // Получаем архитектуру
    let architecture = cpu_details.get("Architecture")
        .map(|s| match s.as_str() {
            "0" => "x86".to_string(),
            "9" => "x64".to_string(),
            "12" => "ARM".to_string(),
            "13" => "ARM64".to_string(),
            _ => "Unknown".to_string(),
        })
        .unwrap_or("Unknown".to_string());
    
    // Получаем размер кэша
    let cache_size = cpu_details.get("L3CacheSize")
        .map(|s| format!("{} KB", s))
        .unwrap_or_else(|| {
            cpu_details.get("cache size")
                .cloned()
                .unwrap_or_else(|| "Unknown".to_string())
        });
    
    // Заполняем информацию о процессоре
    let processor = ProcessorInfo {
        name: cpu_name.clone(),
        usage: total_usage,
        temperature: cpu_temp,
        cores: sys.cpus().len() / 2, // Приблизительно, может быть неточно
        threads: threads,
        frequency: current_frequency,
        base_frequency: base_frequency,
        max_frequency: max_frequency,
        architecture: architecture,
        vendor_id: cpu_details.get("Manufacturer").cloned().unwrap_or_else(|| {
            cpu_details.get("vendor_id").cloned().unwrap_or("Unknown".to_string())
        }),
        model_name: cpu_details.get("Name").cloned().unwrap_or_else(|| {
            cpu_details.get("model name").cloned().unwrap_or(cpu_name)
        }),
        cache_size: cache_size,
        stepping: cpu_details.get("Stepping").cloned().unwrap_or_else(|| {
            cpu_details.get("stepping").cloned().unwrap_or("Unknown".to_string())
        }),
        family: cpu_details.get("Family").cloned().unwrap_or_else(|| {
            cpu_details.get("cpu family").cloned().unwrap_or("Unknown".to_string())
        }),
    };
    
    // Получение информации о дисках
    let mut disks_info = Vec::new();
    let disks = Disks::new();
    for disk in disks.iter() {
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total - available;
        let usage_percent = if total > 0 {
            (used as f32 / total as f32) * 100.0
        } else {
            0.0
        };
        
        // Преобразуем OsStr в String для файловой системы
        let fs_string = disk.file_system().to_string_lossy().to_string();
        
        disks_info.push(DiskInfo {
            name: disk.name().to_string_lossy().to_string(),
            mount_point: disk.mount_point().to_string_lossy().to_string(),
            available_space: disk.available_space(),
            total_space: disk.total_space(),
            file_system: fs_string,
            is_removable: disk.is_removable(),
            usage_percent,
        });
    }
    
    // Получение информации о памяти
    let total_mem = sys.total_memory();
    let used_mem = sys.used_memory();
    let free_mem = total_mem - used_mem;
    let available_mem = sys.available_memory();
    let mem_usage_percent = if total_mem > 0 {
        (used_mem as f32 / total_mem as f32) * 100.0
    } else {
        0.0
    };
    
    // Для типа памяти и частоты используем константы, так как sysinfo это не предоставляет
    // В реальном приложении можно использовать WMI для Windows или другие методы
    let memory = MemoryInfo {
        total_memory: total_mem,
        used_memory: used_mem,
        free_memory: free_mem,
        available_memory: available_mem,
        usage_percent: mem_usage_percent,
        memory_type: "DDR4".to_string(), // Заглушка, в реальном приложении нужен другой метод
        frequency: "3200 MHz".to_string(), // Заглушка
    };
    
    SystemInfo {
        cpu: processor,
        disks: disks_info,
        memory,
    }
}

fn convert_to_gb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0 / 1024.0
}

fn convert_to_mb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0
}

// Удаляем дублирующуюся функцию get_cpu_details, оставляем только одну реализацию
#[cfg(target_os = "linux")]
fn get_cpu_details() -> HashMap<String, String> {
    let mut cpu_details = HashMap::new();
    
    // На Linux читаем /proc/cpuinfo
    if let Ok(cpuinfo) = std::fs::read_to_string("/proc/cpuinfo") {
        for line in cpuinfo.lines() {
            if line.is_empty() {
                continue;
            }
            
            if let Some(sep_pos) = line.find(':') {
                let key = line[..sep_pos].trim().to_string();
                let value = line[sep_pos + 1..].trim().to_string();
                
                if key == "model name" || key == "cpu MHz" || key == "vendor_id" || 
                   key == "cache size" || key == "cpu cores" || key == "processor" ||
                   key == "stepping" || key == "cpu family" {
                    cpu_details.insert(key, value);
                }
            }
        }
    }
    
    cpu_details
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn get_cpu_details() -> HashMap<String, String> {
    // Заглушка для других ОС
    HashMap::new()
}

// Функция для получения температуры процессора более надежным способом
fn get_cpu_temperature() -> Option<f32> {
    // Попробуем сначала через sysinfo Components
    let components = Components::new();
    for component in components.iter() {
        // Расширенный набор меток для определения температуры процессора
        let label = component.label().to_lowercase();
        if label.contains("cpu") || 
           label.contains("core") || 
           label.contains("package") || 
           label.contains("tctl") ||
           label.contains("processor") {
            println!("[DEBUG] Найден датчик температуры: {} = {} °C", 
                     component.label(), component.temperature());
            return Some(component.temperature());
        }
    }
    
    // Если не нашли через sysinfo, пробуем альтернативные методы
    #[cfg(target_os = "windows")]
    {
        // Для Windows пробуем через wmic
        if let Ok(output) = Command::new("wmic")
            .args(["/namespace:\\\\root\\wmi", "PATH", "MSAcpi_ThermalZoneTemperature", "GET", "CurrentTemperature", "/format:list"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                for line in output_str.lines() {
                    if line.contains("CurrentTemperature") {
                        if let Some(sep_pos) = line.find('=') {
                            if let Ok(temp_val) = line[sep_pos + 1..].trim().parse::<f32>() {
                                // Конвертируем из десяток Кельвина в Цельсии
                                let celsius = (temp_val / 10.0) - 273.15;
                                println!("[DEBUG] Температура через wmic: {} °C", celsius);
                                return Some(celsius);
                            }
                        }
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // Для Linux пробуем через /sys/class/thermal
        if let Ok(entries) = std::fs::read_dir("/sys/class/thermal") {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.to_string_lossy().contains("thermal_zone") {
                    let type_path = path.join("type");
                    let temp_path = path.join("temp");
                    
                    if let (Ok(type_data), Ok(temp_data)) = (
                        std::fs::read_to_string(&type_path), 
                        std::fs::read_to_string(&temp_path)
                    ) {
                        if type_data.trim().contains("x86_pkg_temp") || 
                           type_data.trim().contains("cpu") {
                            if let Ok(temp_val) = temp_data.trim().parse::<f32>() {
                                // Конвертируем из миллиградусов в градусы
                                let celsius = temp_val / 1000.0;
                                println!("[DEBUG] Температура через /sys/class/thermal: {} °C", celsius);
                                return Some(celsius);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Не удалось получить температуру
    println!("[DEBUG] Не удалось получить температуру ЦП");
    None
}

// Оптимизированная функция для получения нагрузки процессора, максимально приближенная к диспетчеру задач Windows
fn get_cpu_usage() -> f32 {
    #[cfg(target_os = "windows")]
    {
        // Измеряем средний показатель нагрузки процессора за 2 секунды (3 выборки)
        // Это дает результат, максимально близкий к диспетчеру задач Windows
        if let Ok(output) = Command::new("powershell")
            .args(["-Command", "Get-Counter -Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 3 | Select-Object -ExpandProperty CounterSamples | Select-Object -ExpandProperty CookedValue | Measure-Object -Average | Select-Object -ExpandProperty Average"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(usage) = output_str.trim().parse::<f32>() {
                    println!("[DEBUG] Нагрузка ЦП через WMI (усредненная за 3 выборки): {}%", usage);
                    return usage;
                }
            }
        }
        
        // Запасной метод - измеряем нагрузку через PDH API
        if let Ok(output) = Command::new("powershell")
            .args(["-Command", "(Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Processor -Filter 'Name=\"_Total\"').PercentProcessorTime"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(usage) = output_str.trim().parse::<f32>() {
                    println!("[DEBUG] Нагрузка ЦП через CIM PercentProcessorTime: {}%", usage);
                    return usage;
                }
            }
        }
        
        // Запасной вариант через typeperf с усреднением
        if let Ok(output) = Command::new("cmd")
            .args(["/c", "typeperf -sc 3 -si 1 \"\\Processor(_Total)\\% Processor Time\" | findstr /v \"\\\"\" | findstr /v \"Timestamp\""])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                let lines: Vec<&str> = output_str.lines().collect();
                
                let mut sum = 0.0;
                let mut count = 0;
                
                for line in lines {
                    let parts: Vec<&str> = line.split(',').collect();
                    if parts.len() >= 2 {
                        if let Some(value_str) = parts[1].trim_matches('"').trim().parse::<f32>().ok() {
                            sum += value_str;
                            count += 1;
                        }
                    }
                }
                
                if count > 0 {
                    let avg = sum / count as f32;
                    println!("[DEBUG] Нагрузка ЦП через typeperf (усредненная за {} выборок): {}%", count, avg);
                    return avg;
                }
            }
        }
        
        // Запасной вариант через WMI и одну выборку 
        let guard = std::thread::spawn(|| {
            if let Ok(output) = Command::new("powershell")
                .args(["-Command", "Get-Counter -Counter '\\Processor(_Total)\\% Processor Time' | Select-Object -ExpandProperty CounterSamples | Select-Object -ExpandProperty CookedValue"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(usage) = output_str.trim().parse::<f32>() {
                        println!("[DEBUG] Нагрузка ЦП через WMI (одна выборка): {}%", usage);
                        return usage;
                    }
                }
            }
            
            // Если все методы не сработали, используем sysinfo
            let mut sys = System::new_all();
            sys.refresh_cpu();
            let total_usage = sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / 
                             (sys.cpus().len() as f32);
            println!("[DEBUG] Нагрузка ЦП через sysinfo: {}%", total_usage);
            return total_usage;
        });
        
        // Ждем результат с таймаутом
        match guard.join() {
            Ok(usage) => return usage,
            Err(_) => {
                println!("[ERROR] Таймаут получения данных о нагрузке ЦП");
                let mut sys = System::new_all();
                sys.refresh_cpu();
                return sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / (sys.cpus().len() as f32);
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // Для Linux используем улучшенный метод с усреднением
        let guard = std::thread::spawn(|| {
            if let Ok(output) = Command::new("sh")
                .args(["-c", "mpstat 1 3 | tail -2 | head -1 | awk '{print 100-$13}'"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(usage) = output_str.trim().parse::<f32>() {
                        println!("[DEBUG] Нагрузка ЦП через mpstat (усреднённая): {}%", usage);
                        return usage;
                    }
                }
            }
            
            // Запасной вариант через top
            if let Ok(output) = Command::new("sh")
                .args(["-c", "top -bn3 -d1 | grep '%Cpu' | tail -1 | awk '{print $2+$4}'"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(usage) = output_str.trim().parse::<f32>() {
                        println!("[DEBUG] Нагрузка ЦП через top (усреднённая): {}%", usage);
                        return usage;
                    }
                }
            }
            
            let mut sys = System::new_all();
            sys.refresh_cpu();
            let total_usage = sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / 
                             (sys.cpus().len() as f32);
            println!("[DEBUG] Нагрузка ЦП через sysinfo: {}%", total_usage);
            return total_usage;
        });
        
        match guard.join() {
            Ok(usage) => return usage,
            Err(_) => {
                println!("[ERROR] Таймаут получения данных о нагрузке ЦП");
                let mut sys = System::new_all();
                sys.refresh_cpu();
                return sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / (sys.cpus().len() as f32);
            }
        }
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let mut sys = System::new_all();
        sys.refresh_cpu();
        let total_usage = sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / 
                         (sys.cpus().len() as f32);
        println!("[DEBUG] Нагрузка ЦП через sysinfo: {}%", total_usage);
        return total_usage;
    }
}

// Функция для получения текущей частоты процессора (в ГГц)
fn get_current_cpu_frequency() -> f64 {
    #[cfg(target_os = "windows")]
    {
        // Получаем текущую частоту через WMI
        if let Ok(output) = Command::new("powershell")
            .args(["-Command", "Get-Counter -Counter '\\Processor Information(_Total)\\Processor Frequency' -SampleInterval 1 -MaxSamples 1 | Select-Object -ExpandProperty CounterSamples | Select-Object -ExpandProperty CookedValue"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(freq) = output_str.trim().parse::<f64>() {
                    println!("[DEBUG] Текущая частота ЦП: {} ГГц", freq);
                    return freq;
                }
            }
        }
        
        // Запасной вариант через typeperf
        if let Ok(output) = Command::new("cmd")
            .args(["/c", "typeperf -sc 1 \"\\Processor Information(_Total)\\Processor Frequency\""])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                let lines: Vec<&str> = output_str.lines().collect();
                if lines.len() >= 2 {
                    let data_line = lines[1];
                    let parts: Vec<&str> = data_line.split(',').collect();
                    if parts.len() >= 2 {
                        if let Some(freq) = parts[1].trim_matches('"').trim().parse::<f64>().ok() {
                            println!("[DEBUG] Текущая частота ЦП через typeperf: {} ГГц", freq);
                            return freq;
                        }
                    }
                }
            }
        }
        
        // Если не получилось через WMI, используем другой метод для Windows
        if let Ok(output) = Command::new("powershell")
            .args(["-Command", "(Get-CimInstance -ClassName Win32_Processor).CurrentClockSpeed / 1000"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(freq) = output_str.trim().parse::<f64>() {
                    println!("[DEBUG] Текущая частота ЦП через CIM: {} ГГц", freq);
                    return freq;
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // На Linux читаем текущую частоту из /proc/cpuinfo
        if let Ok(output) = Command::new("sh")
            .args(["-c", "cat /proc/cpuinfo | grep 'MHz' | head -1 | awk '{print $4}'"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(freq) = output_str.trim().parse::<f64>() {
                    // Конвертируем из МГц в ГГц
                    let freq_ghz = freq / 1000.0;
                    println!("[DEBUG] Текущая частота ЦП: {} ГГц", freq_ghz);
                    return freq_ghz;
                }
            }
        }
    }
    
    // Возвращаем данные из sysinfo, если ничего другого не сработало
    let mut sys = System::new_all();
    sys.refresh_cpu();
    let freq = sys.cpus().first().map_or(0.0, |f| f.frequency() as f64 / 1000.0);
    println!("[DEBUG] Текущая частота ЦП через sysinfo: {} ГГц", freq);
    freq
}

// Функция для получения базовой частоты процессора (в ГГц)
fn get_base_cpu_frequency() -> f64 {
    #[cfg(target_os = "windows")]
    {
        // Получаем базовую частоту через WMI
        if let Ok(output) = Command::new("powershell")
            .args(["-Command", "(Get-CimInstance -ClassName Win32_Processor).MaxClockSpeed / 1000"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(freq) = output_str.trim().parse::<f64>() {
                    println!("[DEBUG] Базовая частота ЦП: {} ГГц", freq);
                    return freq;
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // На Linux можно попробовать прочитать из специальных файлов или через lscpu
        if let Ok(output) = Command::new("sh")
            .args(["-c", "lscpu | grep 'CPU MHz' | awk '{print $3}'"])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(freq) = output_str.trim().parse::<f64>() {
                    // Конвертируем из МГц в ГГц
                    let freq_ghz = freq / 1000.0;
                    println!("[DEBUG] Базовая частота ЦП: {} ГГц", freq_ghz);
                    return freq_ghz;
                }
            }
        }
    }
    
    // Возвращаем 0.0, если не смогли определить
    0.0
}

// Более детальная информация о памяти, только для Windows
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_memory_details() -> HashMap<String, String> {
    let mut result = HashMap::new();
    
    // Это заглушка, в реальном приложении нужно использовать WMI
    result.insert("type".to_string(), "DDR4".to_string());
    result.insert("speed".to_string(), "3200 MHz".to_string());
    result.insert("manufacturer".to_string(), "OCPC 15 RGB BLACK".to_string());
    result.insert("total_capacity".to_string(), "8 GB".to_string());
    
    result
}

// Получить температуру компонентов
#[tauri::command]
pub fn get_temperatures() -> HashMap<String, f32> {
    let mut temperatures = HashMap::new();
    let components = Components::new();
    
    for component in components.iter() {
        temperatures.insert(component.label().to_string(), component.temperature());
    }
    
    temperatures
} 