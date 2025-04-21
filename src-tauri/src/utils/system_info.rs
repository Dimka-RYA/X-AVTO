use serde::{Serialize, Deserialize};
use sysinfo::{System, Disks, Components};
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri::Emitter;
use lazy_static::lazy_static;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
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

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub available_space: u64,
    pub total_space: u64,
    pub file_system: String,
    pub is_removable: bool,
    pub usage_percent: f32,
}

#[derive(Debug, Clone)]
struct MemoryData {
    total: u64,       // общая память в МБ
    used: u64,        // использованная память в МБ
    usage_percent: f64, // процент использования
}

impl Default for MemoryData {
    fn default() -> Self {
        Self {
            total: 0,
            used: 0,
            usage_percent: 0.0,
        }
    }
}

impl From<MemoryData> for MemoryInfo {
    fn from(data: MemoryData) -> Self {
        MemoryInfo {
            total_memory: data.total * 1024 * 1024,  // Преобразуем обратно в байты
            used_memory: data.used * 1024 * 1024,    // Преобразуем обратно в байты
            free_memory: (data.total - data.used) * 1024 * 1024, // Преобразуем обратно в байты
            available_memory: (data.total - data.used) * 1024 * 1024, // Преобразуем обратно в байты
            usage_percent: data.usage_percent as f32,
            memory_type: "DDR4".to_string(), // Заглушка
            frequency: "3200 MHz".to_string(), // Заглушка
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MemoryInfo {
    pub total_memory: u64,
    pub used_memory: u64,
    pub free_memory: u64,
    pub available_memory: u64,
    pub usage_percent: f32,
    pub memory_type: String,
    pub frequency: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SystemInfo {
    pub cpu: ProcessorInfo,
    pub disks: Vec<DiskInfo>,
    pub memory: MemoryInfo,
}

// Улучшенная многопоточная система кэширования и обновления
#[derive(Clone)]
pub struct CpuCache {
    pub data: Arc<RwLock<ProcessorInfo>>,
    pub static_data: Arc<RwLock<HashMap<String, String>>>,
    pub last_update: Arc<RwLock<Instant>>,
    pub static_data_last_update: Arc<RwLock<Instant>>,
}

impl Default for CpuCache {
    fn default() -> Self {
        Self {
            data: Arc::new(RwLock::new(ProcessorInfo::default())),
            static_data: Arc::new(RwLock::new(HashMap::new())),
            last_update: Arc::new(RwLock::new(Instant::now())),
            static_data_last_update: Arc::new(RwLock::new(Instant::now())),
        }
    }
}

#[derive(Clone)]
pub struct MemoryCache {
    pub data: Arc<RwLock<MemoryInfo>>,
    pub last_update: Arc<RwLock<Instant>>,
}

impl Default for MemoryCache {
    fn default() -> Self {
        Self {
            data: Arc::new(RwLock::new(MemoryInfo::default())),
            last_update: Arc::new(RwLock::new(Instant::now())),
        }
    }
}

#[derive(Clone)]
pub struct DiskCache {
    pub data: Arc<RwLock<Vec<DiskInfo>>>,
    pub last_update: Arc<RwLock<Instant>>,
}

impl Default for DiskCache {
    fn default() -> Self {
        Self {
            data: Arc::new(RwLock::new(Vec::new())),
            last_update: Arc::new(RwLock::new(Instant::now())),
        }
    }
}

#[derive(Clone)]
pub struct SystemInfoCache {
    pub cpu: CpuCache,
    pub memory: MemoryCache,
    pub disk: DiskCache,
    pub last_full_update: Arc<RwLock<Instant>>,
}

impl Default for SystemInfoCache {
    fn default() -> Self {
        Self {
            cpu: CpuCache::default(),
            memory: MemoryCache::default(),
            disk: DiskCache::default(),
            last_full_update: Arc::new(RwLock::new(Instant::now())),
        }
    }
}

impl SystemInfoCache {
    pub fn new() -> Self {
        Self {
            cpu: CpuCache { 
                data: Arc::new(RwLock::new(ProcessorInfo::default())),
                static_data: Arc::new(RwLock::new(HashMap::new())),
                last_update: Arc::new(RwLock::new(Instant::now())),
                static_data_last_update: Arc::new(RwLock::new(Instant::now())),
            },
            memory: MemoryCache {
                data: Arc::new(RwLock::new(MemoryInfo::default())),
                last_update: Arc::new(RwLock::new(Instant::now())),
            },
            disk: DiskCache {
                data: Arc::new(RwLock::new(Vec::new())),
                last_update: Arc::new(RwLock::new(Instant::now())),
            },
            last_full_update: Arc::new(RwLock::new(Instant::now())),
        }
    }

    // Получить полную системную информацию из кэшей
    pub fn get_system_info(&self) -> SystemInfo {
        let cpu_data = self.cpu.data.read().unwrap().clone();
        let memory_data = self.memory.data.read().unwrap().clone();
        let disks_data = self.disk.data.read().unwrap().clone();
        
        SystemInfo {
            cpu: cpu_data,
            memory: memory_data,
            disks: disks_data,
        }
    }
}

// Создаём функцию для запуска фонового потока обновления данных
pub fn start_system_info_thread(app_handle: AppHandle, cache: Arc<SystemInfoCache>) {
    println!("[SystemInfo] Запуск многопоточной системы мониторинга");
    
    // Поток для обновления данных CPU (частое обновление)
    let cpu_cache = cache.cpu.clone();
    let cpu_app_handle = app_handle.clone();
    thread::spawn(move || {
        let mut update_count = 0;
        loop {
            // Обновляем только динамические данные CPU (нагрузку и текущую частоту)
            update_cpu_dynamic_data(&cpu_cache);
            
            // Отправляем событие обновления CPU
            let cpu_data = cpu_cache.data.read().unwrap().clone();
            let _ = cpu_app_handle.emit("cpu-info-updated", cpu_data);
            
            update_count += 1;
            if update_count % 100 == 0 {
                println!("[SystemInfo] CPU данные обновлены {} раз", update_count);
            }
            
            // Оптимальная задержка для обновления CPU (100мс даёт 10 обновлений в секунду)
            thread::sleep(Duration::from_millis(100));
        }
    });
    
    // Поток для обновления статических данных CPU (редкое обновление)
    let cpu_static_cache = cache.cpu.clone();
    thread::spawn(move || {
        loop {
            // Обновляем статические данные CPU (модель, архитектура, и т.д.)
            update_cpu_static_data(&cpu_static_cache);
            
            // Эти данные редко меняются, обновляем раз в 5 минут
            thread::sleep(Duration::from_secs(300));
        }
    });
    
    // Поток для обновления данных памяти (частое обновление)
    let memory_cache = cache.memory.clone();
    let memory_app_handle = app_handle.clone();
    thread::spawn(move || {
        let mut update_count = 0;
        loop {
            // Обновляем данные о памяти
            update_memory_data(&memory_cache);
            
            // Отправляем событие обновления памяти
            let memory_data = memory_cache.data.read().unwrap().clone();
            let _ = memory_app_handle.emit("memory-info-updated", memory_data);
            
            update_count += 1;
            if update_count % 100 == 0 {
                println!("[SystemInfo] Данные памяти обновлены {} раз", update_count);
            }
            
            // Память обновляем раз в 500мс (2 обновления в секунду)
            thread::sleep(Duration::from_millis(500));
        }
    });
    
    // Поток для обновления данных дисков (частое обновление)
    let disks_cache = cache.disk.clone();
    let disks_app_handle = app_handle.clone();
    thread::spawn(move || {
        let mut update_count = 0;
        loop {
            // Обновляем данные о дисках
            update_disk_data(&disks_cache);
            
            // Отправляем событие обновления дисков
            let disks_data = disks_cache.data.read().unwrap().clone();
            let _ = disks_app_handle.emit("disks-info-updated", disks_data);
            
            update_count += 1;
            if update_count % 100 == 0 {
                println!("[SystemInfo] Данные дисков обновлены {} раз", update_count);
            }
            
            // Диски обновляем раз в секунду, частые обновления не нужны
            thread::sleep(Duration::from_secs(1));
        }
    });
    
    // Главный поток для отправки полной системной информации
    let main_cache = cache.clone();
    thread::spawn(move || {
        let mut update_count = 0;
        loop {
            // Получаем полную системную информацию из кэшей
            let system_info = main_cache.get_system_info();
            
            // Обновляем время последнего полного обновления
            {
                let mut last_update = main_cache.last_full_update.write().unwrap();
                *last_update = Instant::now();
            }
            
            // Отправляем событие с полной системной информацией
            let _ = app_handle.emit("system-info-updated", system_info);
            
            update_count += 1;
            if update_count % 100 == 0 {
                println!("[SystemInfo] Полная системная информация обновлена {} раз", update_count);
            }
            
            // UI обновляем раз в 200мс (5 обновлений в секунду)
            thread::sleep(Duration::from_millis(200));
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
    cache.get_system_info()
}

// Функция для обновления динамических данных CPU
fn update_cpu_dynamic_data(cache: &CpuCache) {
    // Проверяем время последнего обновления - не чаще чем раз в 50 мс
    {
        let last_update = cache.last_update.read().unwrap();
        if last_update.elapsed() < Duration::from_millis(50) {
            return;
        }
    }

    // Получаем данные о ЦП, делаем это в одном потоке, чтобы уменьшить нагрузку
    let mut sys = System::new_all();
    sys.refresh_cpu();
    
    // Вычисляем среднюю нагрузку ЦП
    let cpu_count = sys.cpus().len() as f32;
    let total_usage = if cpu_count > 0.0 {
        sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / cpu_count
    } else {
        0.0
    };
    
    // Получаем текущую частоту процессора
    let mut frequency = 0.0;
    if let Some(cpu) = sys.cpus().first() {
        frequency = cpu.frequency() as f64 / 1000.0;
    }
    
    // Получаем температуру процессора (редко и только если было последнее обновление давно)
    let temp;
    {
        let last_update = cache.last_update.read().unwrap();
        if last_update.elapsed() > Duration::from_secs(5) {
            temp = get_cpu_temperature();
        } else {
            // Используем закэшированное значение
            let data = cache.data.read().unwrap();
            temp = data.temperature;
        }
    }
    
    // Обновляем данные в кэше
    let mut data = cache.data.write().unwrap();
    data.usage = total_usage;
    
    // Только обновляем частоту, если получили валидное значение
    if frequency > 0.1 {
        data.frequency = frequency;
    }
    
    // Обновляем температуру только если она изменилась
    if temp.is_some() {
        data.temperature = temp;
    }
    
    // Обновляем время последнего обновления
    let mut last_update = cache.last_update.write().unwrap();
    *last_update = Instant::now();
}

// Функция для обновления статических данных CPU
fn update_cpu_static_data(cache: &CpuCache) {
    // Получаем данные о CPU
    let mut sys = System::new_all();
    sys.refresh_all();
    
    // Получаем базовую информацию о процессоре
    let cpu_name = if let Some(cpu) = sys.cpus().first() {
        cpu.brand().to_string()
    } else {
        "Unknown".to_string()
    };
    
    // Получаем детальную информацию о процессоре
    let cpu_details = get_cpu_details_cached();
    
    // Получаем базовую частоту процессора
    let base_frequency = get_base_cpu_frequency();
    
    // Определяем максимальную частоту процессора
    let max_frequency = cpu_details.get("MaxClockSpeed")
        .map(|s| s.parse::<f64>().unwrap_or(0.0) / 1000.0) // Преобразуем МГц в ГГц
        .unwrap_or(0.0);
    
    // Получаем количество потоков
    let threads = cpu_details.get("ThreadCount")
        .map(|s| s.parse::<usize>().unwrap_or(sys.cpus().len()))
        .unwrap_or(sys.cpus().len());
    
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
    
    // Обновляем данные в кэше
    {
        let mut data = cache.data.write().unwrap();
        data.name = cpu_name.clone();
        data.cores = sys.cpus().len() / 2;
        data.threads = threads;
        data.base_frequency = base_frequency;
        data.max_frequency = max_frequency;
        data.architecture = architecture;
        data.vendor_id = cpu_details.get("Manufacturer").cloned().unwrap_or_else(|| {
            cpu_details.get("vendor_id").cloned().unwrap_or("Unknown".to_string())
        });
        data.model_name = cpu_details.get("Name").cloned().unwrap_or_else(|| {
            cpu_details.get("model name").cloned().unwrap_or(cpu_name)
        });
        data.cache_size = cache_size;
        data.stepping = cpu_details.get("Stepping").cloned().unwrap_or_else(|| {
            cpu_details.get("stepping").cloned().unwrap_or("Unknown".to_string())
        });
        data.family = cpu_details.get("Family").cloned().unwrap_or_else(|| {
            cpu_details.get("cpu family").cloned().unwrap_or("Unknown".to_string())
        });
    }
    
    // Обновляем время последнего обновления
    let mut last_update = cache.static_data_last_update.write().unwrap();
    *last_update = Instant::now();
}

// Функция для обновления данных о памяти - оптимизированная версия
fn update_memory_data(cache: &MemoryCache) {
    // Проверяем время последнего обновления - не чаще чем раз в 100 мс
    {
        let last_update = cache.last_update.read().unwrap();
        if last_update.elapsed() < Duration::from_millis(100) {
            return;
        }
    }

    // Получаем данные о памяти напрямую из System для снижения накладных расходов
    let mut sys = System::new_all();
    sys.refresh_memory();
    
    // Конвертируем в нужные единицы
    let total = sys.total_memory();
    let used = sys.used_memory();
    let free = sys.free_memory();
    let available = sys.available_memory();
    
    // Вычисляем процент использования
    let usage_percent = if total > 0 {
        (used as f32 / total as f32) * 100.0
    } else {
        0.0
    };
    
    // Обновляем данные в кэше
    let mut data = cache.data.write().unwrap();
    data.total_memory = total;
    data.used_memory = used;
    data.free_memory = free;
    data.available_memory = available;
    data.usage_percent = usage_percent;
    
    // Обновляем время последнего обновления
    let mut last_update = cache.last_update.write().unwrap();
    *last_update = Instant::now();
}

// Функция для обновления данных о дисках - оптимизированная версия
fn update_disk_data(cache: &DiskCache) {
    // Проверяем время последнего обновления - не чаще чем раз в 500 мс
    {
        let last_update = cache.last_update.read().unwrap();
        if last_update.elapsed() < Duration::from_millis(500) {
            return;
        }
    }

    // Получаем данные о дисках
    let disks = Disks::new();
    let mut disks_info = Vec::new();
    
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
    
    // Обновляем данные в кэше только если они изменились
    let mut need_update = true;
    {
        let current_disks = cache.data.read().unwrap();
        if current_disks.len() == disks_info.len() {
            // Проверяем, изменились ли данные существенно
            need_update = false;
            for (i, disk) in current_disks.iter().enumerate() {
                if (disk.usage_percent - disks_info[i].usage_percent).abs() > 0.5 ||
                   disk.available_space != disks_info[i].available_space {
                    need_update = true;
                    break;
                }
            }
        }
    }
    
    if need_update {
        // Обновляем данные в кэше
        let mut data = cache.data.write().unwrap();
        *data = disks_info;
        
        // Обновляем время последнего обновления
        let mut last_update = cache.last_update.write().unwrap();
        *last_update = Instant::now();
    }
}

// ------ Утилиты для получения данных ------

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
    // Выполняем команду в отдельном потоке с таймаутом
    let guard = std::thread::spawn(|| {
        let mut result: HashMap<String, String> = HashMap::new();
        
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
        Ok(details) => details,
        Err(_) => {
            println!("[ERROR] Таймаут получения данных о процессоре");
            // Заглушка в случае таймаута
            HashMap::new()
        }
    }
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
    let cpu_details = HashMap::new();
    
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

// Функция для получения температуры процессора - упрощенная версия для экономии ресурсов
fn get_cpu_temperature() -> Option<f32> {
    // Ограничиваем количество способов получения температуры
    
    // Сначала пробуем через sysinfo, это самый быстрый способ
    let components = Components::new();
    for component in components.iter() {
        let label = component.label().to_lowercase();
        if label.contains("cpu") || label.contains("core") || label.contains("package") {
            return Some(component.temperature());
        }
    }
    
    // Если не удалось получить через sysinfo, возвращаем None
    // Более сложные методы убраны для экономии ресурсов
    None
}

// Оптимизированная функция для получения нагрузки процессора на основе
// формулы: Process CPU Usage = (Cycles for processes over last X seconds)/(Total cycles for last X seconds)
fn get_cpu_usage() -> f32 {
    #[cfg(target_os = "windows")]
    {
        // Разработанная формула для расчета нагрузки по циклам процессора за последний период времени
        // Используем более точный подход через счетчики производительности
        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-Command", "
                # Получаем базовые значения счетчиков 
                $initialIdleTime = (Get-Counter '\\Processor(_Total)\\% Idle Time').CounterSamples.CookedValue
                $initialProcTime = 100.0
                
                # Ждем для измерения дельты (минимальная задержка)
                Start-Sleep -Milliseconds 10
                
                # Получаем новые значения
                $currentIdleTime = (Get-Counter '\\Processor(_Total)\\% Idle Time').CounterSamples.CookedValue
                
                # Расчет времени, затраченного процессами и общего времени процессора
                $totalTime = 100.0
                $cyclesUsedByProcesses = $totalTime - $currentIdleTime
                
                # Результат по формуле: процент циклов, использованных процессами
                $cpuUsage = $cyclesUsedByProcesses
                Write-Output $cpuUsage
            "])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(usage) = output_str.trim().parse::<f32>() {
                    println!("[DEBUG] Нагрузка ЦП по циклам процессора: {}%", usage);
                    return usage;
                }
            }
        }
        
        // Альтернативный подход через Processor Time и временной интервал
        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-Command", "
                # Измеряем время начала
                $startTime = Get-Date
                
                # Получаем начальные значения счетчиков
                $startProc = (Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples.CookedValue
                
                # Ждем для измерения дельты (минимальная задержка)
                Start-Sleep -Milliseconds 10
                
                # Получаем итоговые значения
                $endProc = (Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples.CookedValue
                
                # Считаем время замера
                $timeSpan = (Get-Date) - $startTime
                $seconds = $timeSpan.TotalSeconds
                
                # Результат: среднее значение загрузки за измеренный период
                $usagePerSecond = ($endProc + $startProc) / 2
                Write-Output $usagePerSecond
            "])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(usage) = output_str.trim().parse::<f32>() {
                    println!("[DEBUG] Нагрузка ЦП по времени процессора: {}%", usage);
                    return usage;
                }
            }
        }
        
        // Запасной метод - получение через PDH API с более быстрым обновлением
        if let Ok(output) = Command::new("powershell")
            .args(["-Command", "
                # Создаем запрос с двумя замерами для расчета относительной нагрузки
                $pdh = New-Object System.Diagnostics.PerformanceCounter
                $pdh.CategoryName = 'Processor'
                $pdh.CounterName = '% Processor Time'
                $pdh.InstanceName = '_Total'
                
                # Делаем первый замер
                $firstSample = $pdh.NextValue()
                
                # Ждем для расчета дельты (минимальная задержка)
                Start-Sleep -Milliseconds 10
                
                # Делаем второй замер
                $secondSample = $pdh.NextValue()
                
                # Возвращаем результат
                Write-Output $secondSample
            "])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(usage) = output_str.trim().parse::<f32>() {
                    println!("[DEBUG] Нагрузка ЦП через PDH API: {}%", usage);
                    return usage;
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
        
        // Ждем результат с минимальным таймаутом
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
        // Для Linux используем подход через /proc/stat для получения данных о циклах
        let guard = std::thread::spawn(|| {
            if let Ok(output) = Command::new("sh")
                .args(["-c", "
                    # Получаем первый замер циклов CPU
                    read user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
                    total_start=$((user + nice + system + idle + iowait + irq + softirq + steal))
                    idle_start=$((idle + iowait))
                    
                    # Ждем для расчета дельты (минимальная задержка)
                    sleep 0.01
                    
                    # Получаем второй замер
                    read user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
                    total_end=$((user + nice + system + idle + iowait + irq + softirq + steal))
                    idle_end=$((idle + iowait))
                    
                    # Расчет дельты
                    total_delta=$((total_end - total_start))
                    idle_delta=$((idle_end - idle_start))
                    
                    # Расчет загрузки по формуле: (общие циклы - простой) / общие циклы
                    if [ $total_delta -gt 0 ]; then
                        usage=$(( 100 * (total_delta - idle_delta) / total_delta ))
                        echo $usage
                    else
                        echo 0
                    fi
                "])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(usage) = output_str.trim().parse::<f32>() {
                        println!("[DEBUG] Нагрузка ЦП через /proc/stat (циклы): {}%", usage);
                        return usage;
                    }
                }
            }
            
            // Запасной вариант через mpstat
            if let Ok(output) = Command::new("sh")
                .args(["-c", "mpstat 0.01 2 | tail -1 | awk '{print 100-$12}'"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(usage) = output_str.trim().parse::<f32>() {
                        println!("[DEBUG] Нагрузка ЦП через mpstat (циклы): {}%", usage);
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
        // Улучшенный метод для Windows - через WMI с более надежным запросом
        let guard = std::thread::spawn(|| {
            // Метод 1: PowerShell и WMI
            if let Ok(output) = Command::new("powershell")
                .args(["-Command", "(Get-WmiObject -Class Win32_Processor).CurrentClockSpeed / 1000.0"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(freq) = output_str.trim().parse::<f64>() {
                        if freq > 0.1 {  // Проверяем, что получено разумное значение
                            println!("[DEBUG] Метод 1: Текущая частота ЦП через WMI: {} ГГц", freq);
                            return freq;
                        }
                    }
                }
            }
            
            // Метод 2: используем другой PowerShell-запрос для текущей частоты
            if let Ok(output) = Command::new("powershell")
                .args(["-Command", "Get-Counter -Counter '\\Processor Information(_Total)\\Processor Frequency' | Select-Object -ExpandProperty CounterSamples | Select-Object -ExpandProperty CookedValue"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(freq) = output_str.trim().parse::<f64>() {
                        if freq > 0.1 {  // Валидное значение
                            println!("[DEBUG] Метод 2: Текущая частота ЦП через CounterSamples: {} ГГц", freq);
                            return freq / 1000.0; // может вернуться в МГц
                        }
                    }
                }
            }
            
            // Метод 3: Прямой запрос к реестру для максимальной совместимости
            if let Ok(output) = Command::new("powershell")
                .args(["-Command", 
                    "try { $currSpeed = Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0' | Select-Object -ExpandProperty ~MHz; $currSpeed / 1000.0 } catch { $null }"
                ])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(freq) = output_str.trim().parse::<f64>() {
                        if freq > 0.1 {  // Валидное значение
                            println!("[DEBUG] Метод 3: Текущая частота ЦП через реестр: {} ГГц", freq);
                            return freq;
                        }
                    }
                }
            }
            
            // Метод 4: используем WMIC как более стабильный вариант
            if let Ok(output) = Command::new("wmic")
                .args(["cpu", "get", "CurrentClockSpeed"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    let lines: Vec<&str> = output_str.lines().collect();
                    if lines.len() >= 2 {
                        if let Ok(freq) = lines[1].trim().parse::<f64>() {
                            println!("[DEBUG] Метод 4: Текущая частота ЦП через WMIC: {} ГГц", freq / 1000.0);
                            return freq / 1000.0; // WMIC возвращает в МГц
                        }
                    }
                }
            }
            
            // Резервный метод: возвращаем максимальную частоту как приближение
            println!("[DEBUG] Не удалось получить текущую частоту, возвращаем базовую частоту");
            get_base_cpu_frequency()
        });
        
        // Ждем результат с таймаутом
        match guard.join() {
            Ok(freq) => freq,
            Err(_) => {
                println!("[ERROR] Таймаут получения данных о частоте ЦП");
                // Возвращаем данные из sysinfo, если ничего другого не сработало
                let mut sys = System::new_all();
                sys.refresh_cpu();
                let freq = sys.cpus().first().map_or(0.0, |f| f.frequency() as f64 / 1000.0);
                println!("[DEBUG] Резервный метод: Текущая частота ЦП через sysinfo: {} ГГц", freq);
                freq
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // Улучшенный метод для Linux с большим количеством альтернатив
        let guard = std::thread::spawn(|| {
            // Метод 1: Более надежное чтение из scaling_cur_freq
            if let Ok(output) = Command::new("sh")
                .args(["-c", "cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq 2>/dev/null | head -1"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if !output_str.trim().is_empty() {
                        if let Ok(freq) = output_str.trim().parse::<f64>() {
                            let freq_ghz = freq / 1000000.0; // Конвертируем из Гц в ГГц
                            println!("[DEBUG] Метод 1: Текущая частота ЦП: {} ГГц", freq_ghz);
                            return freq_ghz;
                        }
                    }
                }
            }
            
            // Метод 2: Чтение через cpuinfo
            if let Ok(output) = Command::new("sh")
                .args(["-c", "grep -i 'cpu MHz' /proc/cpuinfo | head -1 | awk '{print $4}'"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if !output_str.trim().is_empty() {
                        if let Ok(freq) = output_str.trim().parse::<f64>() {
                            // Конвертируем из МГц в ГГц
                            let freq_ghz = freq / 1000.0;
                            println!("[DEBUG] Метод 2: Текущая частота ЦП: {} ГГц", freq_ghz);
                            return freq_ghz;
                        }
                    }
                }
            }
            
            // Метод 3: Использование lscpu
            if let Ok(output) = Command::new("sh")
                .args(["-c", "lscpu | grep -i 'CPU MHz' | awk '{print $3}'"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if !output_str.trim().is_empty() {
                        if let Ok(freq) = output_str.trim().parse::<f64>() {
                            // Конвертируем из МГц в ГГц
                            let freq_ghz = freq / 1000.0;
                            println!("[DEBUG] Метод 3: Текущая частота ЦП через lscpu: {} ГГц", freq_ghz);
                            return freq_ghz;
                        }
                    }
                }
            }
            
            // Резервный метод: возвращаем максимальную частоту как приближение
            println!("[DEBUG] Не удалось получить текущую частоту, возвращаем базовую частоту");
            get_base_cpu_frequency()
        });
        
        match guard.join() {
            Ok(freq) => freq,
            Err(_) => {
                println!("[ERROR] Таймаут получения данных о частоте ЦП");
                let mut sys = System::new_all();
                sys.refresh_cpu();
                if let Some(cpu) = sys.cpus().first() {
                    let freq = cpu.frequency() as f64 / 1000.0;
                    println!("[DEBUG] Резервный метод: Текущая частота ЦП через sysinfo: {} ГГц", freq);
                    freq
                } else {
                    0.0
                }
            }
        }
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        // Резервный метод для других ОС
        let mut sys = System::new_all();
        sys.refresh_cpu();
        let freq = sys.cpus().first().map_or(0.0, |f| f.frequency() as f64 / 1000.0);
        println!("[DEBUG] Текущая частота ЦП через sysinfo: {} ГГц", freq);
        freq
    }
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

#[derive(Debug, Clone)]
pub struct ProcessorData {
    pub usage: f32,           // Процент использования ЦПУ
    pub frequency: f64,       // Частота в ГГц
    pub temperature: Option<f32>,     // Температура в градусах Цельсия
}

impl Default for ProcessorData {
    fn default() -> Self {
        Self {
            usage: 0.0,
            frequency: 0.0,
            temperature: None,
        }
    }
}

// Функция для обновления динамических данных в ProcessorInfo
pub fn update_processor_info_with_dynamic_data(
    mut processor_info: ProcessorInfo,
    dynamic_data: &ProcessorData,
) -> ProcessorInfo {
    processor_info.usage = dynamic_data.usage;
    processor_info.frequency = dynamic_data.frequency;
    processor_info.temperature = dynamic_data.temperature;
    processor_info
} 