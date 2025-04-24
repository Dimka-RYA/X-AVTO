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
use std::sync::atomic::{AtomicBool, Ordering};

// Добавляем импорт нового модуля
use crate::utils::cpu_frequency::{get_current_cpu_frequency, get_base_cpu_frequency, get_cpu_physical_cores, get_cpu_logical_cores};

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
    pub processes: usize,     // количество процессов в системе
    pub system_threads: usize, // количество потоков в системе
    pub handles: usize,       // количество дескрипторов в системе
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

// Структура для хранения данных о памяти (внутренняя)
struct MemoryData {
    total: u64,       // общая память в байтах
    used: u64,        // использованная память в байтах
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

// Конвертер из внутренней структуры в публичную
impl From<MemoryData> for MemoryInfo {
    fn from(data: MemoryData) -> Self {
        MemoryInfo {
            total: data.total,
            used: data.used,
            free: data.total.saturating_sub(data.used),
            available: data.total.saturating_sub(data.used),
            usage_percentage: data.usage_percent,
            type_ram: String::from("Unknown"),
            swap_total: 0,
            swap_used: 0,
            swap_free: 0,
            swap_usage_percentage: 0.0,
            memory_speed: String::from("Unknown"),
            slots_total: 0,
            slots_used: 0,
            memory_name: String::from("Unknown"),
            memory_part_number: String::from("Unknown"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub total: u64,
    pub available: u64,
    pub used: u64,
    pub free: u64,
    pub usage_percentage: f64,
    pub type_ram: String,
    pub swap_total: u64,
    pub swap_used: u64,
    pub swap_free: u64,
    pub swap_usage_percentage: f64,
    pub memory_speed: String,     // Скорость памяти (МГц)
    pub slots_total: u32,         // Общее количество слотов памяти
    pub slots_used: u32,          // Используемые слоты памяти
    pub memory_name: String,      // Название/производитель памяти
    pub memory_part_number: String, // Номер модели памяти
}

impl Default for MemoryInfo {
    fn default() -> Self {
        Self {
            total: 0,
            available: 0,
            used: 0,
            free: 0,
            usage_percentage: 0.0,
            type_ram: String::from("Unknown"),
            swap_total: 0,
            swap_used: 0,
            swap_free: 0,
            swap_usage_percentage: 0.0,
            memory_speed: String::from("Unknown"),
            slots_total: 0,
            slots_used: 0,
            memory_name: String::from("Unknown"),
            memory_part_number: String::from("Unknown"),
        }
    }
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

// Глобальное состояние мониторинга - активен ли он
lazy_static! {
    static ref MONITORING_ACTIVE: AtomicBool = AtomicBool::new(false);
    static ref CPU_DETAILS_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
    static ref CPU_DETAILS_CACHE_TIME: Mutex<std::time::Instant> = Mutex::new(std::time::Instant::now());
    static ref CPU_TEMPERATURE: Mutex<Option<f32>> = Mutex::new(None);
    static ref CPU_THREADS: Mutex<Option<usize>> = Mutex::new(None);
}

// Команда для включения/выключения мониторинга
#[tauri::command]
pub fn set_monitoring_active(active: bool) {
    println!("[SystemInfo] Установка активности мониторинга: {}", active);
    MONITORING_ACTIVE.store(active, Ordering::SeqCst);
}

// Функция для проверки активности мониторинга
fn is_monitoring_active() -> bool {
    MONITORING_ACTIVE.load(Ordering::SeqCst)
}

// Создаём функцию для запуска фонового потока обновления данных
pub fn start_system_info_thread(app_handle: AppHandle, cache: Arc<SystemInfoCache>) {
    println!("[SystemInfo] Запуск многопоточной системы мониторинга");
    
    // Изначально устанавливаем мониторинг как неактивный
    MONITORING_ACTIVE.store(false, Ordering::SeqCst);
    
    // Сразу обновляем статические данные CPU при запуске, не дожидаясь первого цикла
    update_cpu_static_data(&cache.cpu);
    println!("[SystemInfo] Выполнено начальное обновление статических данных CPU");
    
    // Поток для обновления данных CPU (максимально частое обновление)
    let cpu_cache = cache.cpu.clone();
    let cpu_app_handle = app_handle.clone();
    thread::spawn(move || {
        loop {
            // Проверяем активен ли мониторинг
            if is_monitoring_active() {
                // Обновляем только динамические данные CPU (нагрузку и текущую частоту)
                update_cpu_dynamic_data(&cpu_cache);
                
                // Отправляем событие обновления CPU
                let cpu_data = cpu_cache.data.read().unwrap().clone();
                let _ = cpu_app_handle.emit("cpu-info-updated", cpu_data);
            }
            
            // Минимальная задержка для максимальной частоты обновления
            thread::sleep(Duration::from_millis(1));
        }
    });
    
    // Поток для обновления статических данных CPU (более частое обновление на старте)
    let cpu_static_cache = cache.cpu.clone();
    thread::spawn(move || {
        // Первые несколько минут обновляем чаще для гарантии получения данных
        let mut fast_updates = 5; // Количество быстрых обновлений
        
        loop {
            // Проверяем активен ли мониторинг
            if is_monitoring_active() {
                // Обновляем статические данные CPU (модель, архитектура, и т.д.)
                update_cpu_static_data(&cpu_static_cache);
                println!("[SystemInfo] Обновлены статические данные CPU");
                
                // Уменьшаем счетчик быстрых обновлений
                if fast_updates > 0 {
                    fast_updates -= 1;
                    // Быстрое обновление каждые 10 секунд в начале
                    thread::sleep(Duration::from_secs(10));
                } else {
                    // Эти данные редко меняются, обновляем раз в 5 минут после начальных обновлений
                    thread::sleep(Duration::from_secs(300));
                }
            } else {
                // Если мониторинг не активен, проверяем каждую секунду
                thread::sleep(Duration::from_secs(1));
            }
        }
    });
    
    // Поток для обновления данных памяти (частое обновление)
    let memory_cache = cache.memory.clone();
    let memory_app_handle = app_handle.clone();
    thread::spawn(move || {
        loop {
            // Проверяем активен ли мониторинг
            if is_monitoring_active() {
                // Обновляем данные о памяти
                update_memory_data(&memory_cache);
                
                // Отправляем событие обновления памяти
                let memory_data = memory_cache.data.read().unwrap().clone();
                let _ = memory_app_handle.emit("memory-info-updated", memory_data);
            }
            
            // Минимальная задержка для максимальной частоты обновления
            thread::sleep(Duration::from_millis(1));
        }
    });
    
    // Поток для обновления данных дисков (увеличена частота)
    let disks_cache = cache.disk.clone();
    let disks_app_handle = app_handle.clone();
    thread::spawn(move || {
        loop {
            // Проверяем активен ли мониторинг
            if is_monitoring_active() {
                // Обновляем данные о дисках
                update_disk_data(&disks_cache);
                
                // Отправляем событие обновления дисков
                let disks_data = disks_cache.data.read().unwrap().clone();
                let _ = disks_app_handle.emit("disks-info-updated", disks_data);
            }
            
            // Уменьшаем интервал обновления дисков до 100мс для более частых обновлений
            thread::sleep(Duration::from_millis(100));
        }
    });
    
    // Главный поток для отправки полной системной информации
    let main_cache = cache.clone();
    let main_app_handle = app_handle.clone();
    thread::spawn(move || {
        loop {
            // Проверяем активен ли мониторинг
            if is_monitoring_active() {
                // Получаем полную системную информацию из кэшей
                let system_info = main_cache.get_system_info();
                
                // Обновляем время последнего полного обновления
                {
                    let mut last_update = main_cache.last_full_update.write().unwrap();
                    *last_update = Instant::now();
                }
                
                // Отправляем событие с полной системной информацией
                let _ = main_app_handle.emit("system-info-updated", system_info);
            }
            
            // Минимальная задержка для максимальной частоты обновления
            thread::sleep(Duration::from_millis(500));
        }
    });
    
    // Изначально активируем мониторинг, чтобы наполнить кеш начальными данными
    MONITORING_ACTIVE.store(true, Ordering::SeqCst);
    
    // Через 2 секунды деактивируем мониторинг если пользователь еще не переключился на вкладку
    let init_app_handle = app_handle.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(2));
        // Отправляем событие, что мониторинг готов и можно его деактивировать
        let _ = init_app_handle.emit("monitoring-initialized", true);
        MONITORING_ACTIVE.store(false, Ordering::SeqCst);
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

// Функция для обновления динамических данных CPU - оптимизированная версия
fn update_cpu_dynamic_data(cache: &CpuCache) {
    // Проверяем активен ли мониторинг, если нет - не обновляем
    if !is_monitoring_active() {
        return;
    }

    // Оптимизируем получение данных о CPU - используем один экземпляр System
    let mut sys = System::new_all();
    sys.refresh_cpu(); // Обновляем только CPU, а не все данные
    
    // Вычисляем среднюю нагрузку ЦП
    let cpu_count = sys.cpus().len() as f32;
    let total_usage = if cpu_count > 0.0 {
        sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / cpu_count
    } else {
        0.0
    };
    
    // Получаем текущую частоту процессора
    let frequency = get_current_cpu_frequency();
    
    // Получаем температуру процессора, но реже (каждые 5 секунд)
    let temp;
    {
        let last_update = cache.last_update.read().unwrap();
        if last_update.elapsed() > Duration::from_secs(5) {
            temp = get_cpu_temperature();
        } else {
            let data = cache.data.read().unwrap();
            temp = data.temperature;
        }
    }
    
    // Получаем данные о процессах, потоках и дескрипторах (оптимизированно)
    let (processes, system_threads, handles) = get_system_process_info_optimized_fast();
    
    // Обновляем данные в кэше
    let mut data = cache.data.write().unwrap();
    data.usage = total_usage;
    
    if frequency > 0.1 {
        data.frequency = frequency;
    }
    
    if temp.is_some() {
        data.temperature = temp;
    }
    
    data.processes = processes;
    data.system_threads = system_threads;
    data.handles = handles;
    
    // Обновляем время последнего обновления
    let mut last_update = cache.last_update.write().unwrap();
    *last_update = Instant::now();
}

// Максимально быстрая версия получения информации о процессах, потоках и дескрипторах
fn get_system_process_info_optimized_fast() -> (usize, usize, usize) {
    static mut LAST_UPDATE_TIME: Option<Instant> = None;
    static mut CACHED_RESULT: (usize, usize, usize) = (0, 0, 0);
    
    // Используем кэширование с ограничением частоты вызова внешних команд
    unsafe {
        let now = Instant::now();
        if let Some(last_time) = LAST_UPDATE_TIME {
            // Обновляем данные не чаще, чем раз в 1 секунду
            if now.duration_since(last_time) < Duration::from_secs(1) {
                return CACHED_RESULT;
            }
        }
        
        // Обновляем данные
        let result = get_system_process_info_internal();
        CACHED_RESULT = result;
        LAST_UPDATE_TIME = Some(now);
        return result;
    }
}

// Внутренняя функция, которая делает реальную работу по получению данных
fn get_system_process_info_internal() -> (usize, usize, usize) {
    #[cfg(target_os = "windows")]
    {
        let mut processes = 0;
        let mut threads = 0;
        let mut handles = 0;
        
        // Объединяем запросы для получения всех данных за один вызов cmd
        if let Ok(output) = Command::new("cmd")
            .args(["/c", "wmic process get ThreadCount,HandleCount /value && tasklist /nh | find /c /v \"\""])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                // Обрабатываем count процессов (последняя строка)
                if let Some(last_line) = output_str.lines().last() {
                    if let Ok(count) = last_line.trim().parse::<usize>() {
                        processes = count;
                    }
                }
                
                // Обрабатываем threads и handles
                let mut total_threads = 0;
                let mut total_handles = 0;
                
                for line in output_str.lines() {
                    if line.starts_with("ThreadCount=") {
                        if let Ok(count) = line.trim_start_matches("ThreadCount=").trim().parse::<usize>() {
                            total_threads += count;
                        }
                    } else if line.starts_with("HandleCount=") {
                        if let Ok(count) = line.trim_start_matches("HandleCount=").trim().parse::<usize>() {
                            total_handles += count;
                        }
                    }
                }
                
                if total_threads > 0 {
                    threads = total_threads;
                }
                
                if total_handles > 0 {
                    handles = total_handles;
                }
            }
        }
        
        // Если не удалось получить через команду, используем приблизительные оценки
        if processes == 0 {
            let mut sys = System::new_all();
            sys.refresh_processes();
            processes = sys.processes().len();
        }
        
        if threads == 0 && processes > 0 {
            // Приблизительная оценка количества потоков
            threads = processes * 10;
        }
        
        if handles == 0 && threads > 0 {
            // Приблизительная оценка количества дескрипторов
            handles = threads * 30;
        }
        
        return (processes, threads, handles);
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // Для других ОС используем упрощенный подход
        let mut sys = System::new_all();
        sys.refresh_processes();
        let processes = sys.processes().len();
        let threads = processes * 10;
        let handles = threads * 30;
        
        return (processes, threads, handles);
    }
}

// Функция для обновления статических данных CPU
fn update_cpu_static_data(cache: &CpuCache) {
    println!("[SystemInfo] Начало обновления статических данных CPU");
    
    // Получаем данные о CPU
    let mut sys = System::new_all();
    sys.refresh_all();
    
    // Получаем базовую информацию о процессоре
    let cpu_name = if let Some(cpu) = sys.cpus().first() {
        cpu.brand().to_string()
    } else {
        "Unknown".to_string()
    };
    println!("[SystemInfo] Имя CPU: {}", cpu_name);
    
    // Получаем детальную информацию о процессоре с гарантированным запросом
    let cpu_details = get_cpu_details_cached();
    println!("[SystemInfo] Получены детали CPU: {} полей", cpu_details.len());
    
    // Получаем базовую частоту процессора из отдельного модуля
    let base_frequency = get_base_cpu_frequency();
    println!("[SystemInfo] Базовая частота: {} ГГц", base_frequency);
    
    // Определяем максимальную частоту процессора
    let max_frequency = cpu_details.get("MaxClockSpeed")
        .map(|s| s.parse::<f64>().unwrap_or(0.0) / 1000.0) // Преобразуем МГц в ГГц
        .unwrap_or(0.0);
    println!("[SystemInfo] Максимальная частота: {} ГГц", max_frequency);
    
    // Получаем количество логических процессоров (потоков)
    let threads = get_cpu_logical_cores();
    println!("[SystemInfo] Логические ядра (потоки): {}", threads);
    
    // Получаем количество физических ядер из специализированной функции
    let cores = get_cpu_physical_cores();
    println!("[SystemInfo] Физические ядра: {}", cores);
    
    // Получаем архитектуру
    let architecture = cpu_details.get("Architecture")
        .map(|s| match s.as_str() {
            "0" => "x86".to_string(),
            "9" => "x64".to_string(),
            "12" => "ARM".to_string(),
            "13" => "ARM64".to_string(),
            _ => "Unknown".to_string(),
        })
        .unwrap_or_else(|| {
            // Резервный способ определения архитектуры
            if let Ok(output) = Command::new("cmd")
                .args(["/c", "echo %PROCESSOR_ARCHITECTURE%"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    let arch = output_str.trim().to_lowercase();
                    if arch.contains("amd64") || arch.contains("x64") {
                        return "x64".to_string();
                    } else if arch.contains("x86") {
                        return "x86".to_string();
                    } else if arch.contains("arm") {
                        return if arch.contains("64") { "ARM64".to_string() } else { "ARM".to_string() };
                    }
                }
            }
            "Unknown".to_string()
        });
    println!("[SystemInfo] Архитектура: {}", architecture);
    
    // Получаем размер кэша
    let cache_size = cpu_details.get("L3CacheSize")
        .map(|s| format!("{} KB", s))
        .unwrap_or_else(|| {
            cpu_details.get("L2CacheSize")
                .map(|s| format!("{} KB", s))
                .unwrap_or_else(|| {
                    // Резервный способ получения размера кэша
                    if let Ok(output) = Command::new("wmic")
                        .args(["cpu", "get", "L2CacheSize,L3CacheSize", "/format:list"])
                        .output() 
                    {
                        if let Ok(output_str) = String::from_utf8(output.stdout) {
                            for line in output_str.lines() {
                                if line.starts_with("L3CacheSize=") {
                                    let size = line.trim_start_matches("L3CacheSize=").trim();
                                    if !size.is_empty() && size != "0" {
                                        return format!("{} KB", size);
                                    }
                                } else if line.starts_with("L2CacheSize=") {
                                    let size = line.trim_start_matches("L2CacheSize=").trim();
                                    if !size.is_empty() && size != "0" {
                                        return format!("{} KB", size);
                                    }
                                }
                            }
                        }
                    }
                    "Unknown".to_string()
                })
        });
    println!("[SystemInfo] Размер кэша: {}", cache_size);
    
    // Получаем производителя
    let vendor = cpu_details.get("Manufacturer")
        .cloned()
        .unwrap_or_else(|| {
            cpu_details.get("vendor_id")
                .cloned()
                .unwrap_or_else(|| {
                    // Резервный способ получения производителя
                    if let Ok(output) = Command::new("wmic")
                        .args(["cpu", "get", "Manufacturer", "/format:list"])
                        .output() 
                    {
                        if let Ok(output_str) = String::from_utf8(output.stdout) {
                            for line in output_str.lines() {
                                if line.starts_with("Manufacturer=") {
                                    let manufacturer = line.trim_start_matches("Manufacturer=").trim();
                                    if !manufacturer.is_empty() {
                                        return manufacturer.to_string();
                                    }
                                }
                            }
                        }
                    }
                    "Unknown".to_string()
                })
        });
    println!("[SystemInfo] Производитель: {}", vendor);
    
    // Обновляем данные в кэше
    {
        let mut data = cache.data.write().unwrap();
        data.name = cpu_name.clone();
        data.cores = cores;
        data.threads = threads;
        data.base_frequency = base_frequency;
        data.max_frequency = max_frequency;
        data.architecture = architecture;
        data.vendor_id = vendor;
        data.model_name = cpu_details.get("Name").cloned().unwrap_or_else(|| {
            cpu_details.get("model name").cloned().unwrap_or(cpu_name)
        });
        data.cache_size = cache_size;
        println!("[SystemInfo] Данные обновлены в кэше");
    }
    
    // Обновляем время последнего обновления
    let mut last_update = cache.static_data_last_update.write().unwrap();
    *last_update = Instant::now();
}

// Функция для получения свежих данных о процессоре без кэширования
fn get_cpu_details_fresh() -> HashMap<String, String> {
    // На Windows используем wmic для получения дополнительной информации
    let mut result: HashMap<String, String> = HashMap::new();
    
    #[cfg(target_os = "windows")]
    {
        // Основной метод через wmic
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
        
        // Резервный метод через systeminfo
        if result.is_empty() {
            if let Ok(output) = Command::new("systeminfo")
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    for line in output_str.lines() {
                        if line.contains("Processor") {
                            let parts: Vec<&str> = line.split(':').collect();
                            if parts.len() >= 2 {
                                result.insert("Name".to_string(), parts[1].trim().to_string());
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
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
                        result.insert(key, value);
                    }
                }
            }
        }
    }
    
    result
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
    let details = get_cpu_details_fresh();
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
    let base_frequency = get_base_cpu_frequency();
    
    // Определяем максимальную частоту процессора
    let max_frequency = cpu_details.get("MaxClockSpeed")
        .map(|s| s.parse::<f64>().unwrap_or(0.0) / 1000.0) // Преобразуем МГц в ГГц
        .unwrap_or(0.0);
    
    // Используем специализированные функции из модуля cpu_frequency
    let cores = get_cpu_physical_cores();
    let threads = get_cpu_logical_cores();
    
    // Получаем информацию о процессах, потоках и дескрипторах
    let (processes, system_threads, handles) = get_system_process_info();
    
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
        cores: cores,
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
        processes: processes,
        system_threads: system_threads,
        handles: handles,
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
    
    // Создаем объект системной информации
    let memory = MemoryInfo {
        total: total_mem,
        used: used_mem,
        free: free_mem,
        available: available_mem,
        usage_percentage: mem_usage_percent as f64,
        type_ram: String::from("Unknown"),
        swap_total: 0,
        swap_used: 0,
        swap_free: 0,
        swap_usage_percentage: 0.0,
        memory_speed: String::from("Unknown"),
        slots_total: 0,
        slots_used: 0,
        memory_name: String::from("Unknown"),
        memory_part_number: String::from("Unknown"),
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

// Оптимизированная функция для получения нагрузки процессора
fn get_cpu_usage() -> f32 {
    #[cfg(target_os = "windows")]
    {
        // Используем более быстрый метод через cmd и typeperf вместо PowerShell
        if let Ok(output) = Command::new("cmd")
            .args(["/c", "typeperf \"\\Processor(_Total)\\% Processor Time\" -sc 1 | findstr \"\\\""])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                let parts: Vec<&str> = output_str.split(',').collect();
                if parts.len() >= 2 {
                    if let Ok(usage) = parts[1].trim().trim_matches('"').parse::<f32>() {
                        return usage;
                    }
                }
            }
        }
        
        // Используем встроенный sysinfo как резервный вариант
        let mut sys = System::new_all();
        sys.refresh_cpu();
        let cpu_count = sys.cpus().len() as f32;
        if cpu_count > 0.0 {
            return sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / cpu_count;
        }
        return 0.0;
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let mut sys = System::new_all();
        sys.refresh_cpu();
        let cpu_count = sys.cpus().len() as f32;
        if cpu_count > 0.0 {
            return sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / cpu_count;
        }
        return 0.0;
    }
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

// Функция для получения информации о процессах, потоках и дескрипторах
fn get_system_process_info() -> (usize, usize, usize) {
    let mut processes = 0;
    let mut threads = 0;
    let mut handles = 0;
    
    #[cfg(target_os = "windows")]
    {
        // Используем PowerShell для получения данных через WMI
        // Получаем все три значения одновременно для оптимизации
        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-Command", "
                $processCount = (Get-Process).Count;
                $threadCount = (Get-Process | Measure-Object -Property Threads -Sum).Sum;
                $handleCount = (Get-Process | Measure-Object -Property Handles -Sum).Sum;
                Write-Output \"$processCount,$threadCount,$handleCount\"
            "])
            .output() 
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                let parts: Vec<&str> = output_str.trim().split(',').collect();
                if parts.len() == 3 {
                    if let Ok(p_count) = parts[0].parse::<usize>() {
                        processes = p_count;
                    }
                    if let Ok(t_count) = parts[1].parse::<usize>() {
                        threads = t_count;
                        println!("[DEBUG] Обнаружено потоков (оптимизированный метод): {}", threads);
                    }
                    if let Ok(h_count) = parts[2].parse::<usize>() {
                        handles = h_count;
                    }
                }
            }
        }
        
        // Резервный способ получения потоков, если первый не сработал
        if threads == 0 {
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", "$sum = 0; Get-Process | ForEach-Object { $sum += $_.Threads.Count }; $sum"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(count) = output_str.trim().parse::<usize>() {
                        threads = count;
                        println!("[DEBUG] Обнаружено потоков (резервный метод): {}", threads);
                    }
                }
            }
        }
        
        // Резервные методы для других значений
        if processes == 0 {
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", "Get-Process | Measure-Object | Select-Object -ExpandProperty Count"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(count) = output_str.trim().parse::<usize>() {
                        processes = count;
                    }
                }
            }
        }
        
        if handles == 0 {
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", "(Get-Process | Measure-Object -Property Handles -Sum).Sum"])
                .output() 
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    if let Ok(count) = output_str.trim().parse::<usize>() {
                        handles = count;
                    }
                }
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // На других ОС используем sysinfo для процессов
        let mut sys = System::new_all();
        sys.refresh_processes();
        processes = sys.processes().len();
        
        // Пытаемся подсчитать потоки на других ОС - используем приблизительную оценку
        threads = processes * 10; // Приблизительная оценка: 10 потоков на процесс
        
        // Заглушка для дескрипторов на других ОС
        handles = 0;
    }
    
    println!("[DEBUG] Статистика процессов: {} процессов, {} потоков, {} дескрипторов", 
           processes, threads, handles);
    
    (processes, threads, handles)
}

// Функция для обновления данных о памяти - оптимизированная версия
fn update_memory_data(cache: &MemoryCache) {
    // Проверяем активен ли мониторинг, если нет - не обновляем
    if !is_monitoring_active() {
        return;
    }

    // Ограничиваем частоту обновления данных о памяти
    {
        let last_update = cache.last_update.read().unwrap();
        if last_update.elapsed() < Duration::from_millis(100) {
            // Возвращаемся без обновления при слишком частых вызовах
            return;
        }
    }

    // Получаем данные о памяти
    let mut sys = System::new_all();
    sys.refresh_memory(); // Только память обновляем
    
    // Конвертируем в нужные единицы
    let total = sys.total_memory();
    let used = sys.used_memory();
    let free = sys.free_memory();
    let available = sys.available_memory();
    
    // Получаем информацию о виртуальной памяти
    let mut swap_total = sys.total_swap();
    let mut swap_used = sys.used_swap();
    let swap_free = swap_total.saturating_sub(swap_used);
    
    // Вычисляем процент использования
    let usage_percent = if total > 0 {
        (used as f32 / total as f32) * 100.0
    } else {
        0.0
    };
    
    // Вычисляем процент использования виртуальной памяти
    let mut virtual_memory_percent = if swap_total > 0 {
        (swap_used as f32 / swap_total as f32) * 100.0
    } else {
        0.0
    };
    
    // Получаем дополнительную информацию о памяти через WMI
    let mut memory_type = String::from("Unknown");
    let mut memory_speed = String::from("Unknown");
    let mut memory_slots_total: u32 = 0;
    let mut memory_slots_used: u32 = 0;
    let mut memory_name = String::from("Unknown");
    let mut memory_part_number = String::from("Unknown");
    
    #[cfg(target_os = "windows")]
    {
        // Получаем тип оперативной памяти
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance -ClassName Win32_PhysicalMemory | Select-Object -First 1 -ExpandProperty SMBIOSMemoryType"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                let memory_type_id = output_str.trim().parse::<u32>().unwrap_or(0);
                memory_type = match memory_type_id {
                    0 => String::from("Unknown"),
                    1 => String::from("Other"),
                    2 => String::from("DRAM"),
                    3 => String::from("Synchronous DRAM"),
                    4 => String::from("Cache DRAM"),
                    5 => String::from("EDO"),
                    6 => String::from("EDRAM"),
                    7 => String::from("VRAM"),
                    8 => String::from("SRAM"),
                    9 => String::from("RAM"),
                    10 => String::from("ROM"),
                    11 => String::from("Flash"),
                    12 => String::from("EEPROM"),
                    13 => String::from("FEPROM"),
                    14 => String::from("EPROM"),
                    15 => String::from("CDRAM"),
                    16 => String::from("3DRAM"),
                    17 => String::from("SDRAM"),
                    18 => String::from("SGRAM"),
                    19 => String::from("RDRAM"),
                    20 => String::from("DDR"),
                    21 => String::from("DDR2"),
                    22 => String::from("DDR2 FB-DIMM"),
                    24 => String::from("DDR3"),
                    26 => String::from("DDR4"),
                    34 => String::from("DDR5"),
                    _ => format!("Type_{}", memory_type_id),
                };
            }
        }
        
        // Получаем скорость памяти (в МГц)
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance -ClassName Win32_PhysicalMemory | Select-Object -First 1 -ExpandProperty Speed"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(speed) = output_str.trim().parse::<u32>() {
                    memory_speed = format!("{} МГц", speed);
                }
            }
        }
        
        // Получаем производителя памяти
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance -ClassName Win32_PhysicalMemory | Select-Object -First 1 -ExpandProperty Manufacturer"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                let manufacturer = output_str.trim();
                if !manufacturer.is_empty() {
                    memory_name = manufacturer.to_string();
                }
            }
        }
        
        // Получаем номер модели памяти (Part Number)
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance -ClassName Win32_PhysicalMemory | Select-Object -First 1 -ExpandProperty PartNumber"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                let part_number = output_str.trim();
                if !part_number.is_empty() {
                    memory_part_number = part_number.to_string();
                }
            }
        }
        
        // Подсчитываем количество слотов памяти
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance -ClassName Win32_PhysicalMemoryArray | Select-Object -ExpandProperty MemoryDevices"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(slots) = output_str.trim().parse::<u32>() {
                    memory_slots_total = slots;
                }
            }
        }
        
        // Подсчитываем занятые слоты
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance -ClassName Win32_PhysicalMemory).Count"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(used_slots) = output_str.trim().parse::<u32>() {
                    memory_slots_used = used_slots;
                }
            }
        }
        
        // Проверяем файл подкачки, если данные еще не получены
        if swap_total == 0 {
            if let Ok(output) = Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_PageFileUsage | Select-Object -Property AllocatedBaseSize, CurrentUsage | ConvertTo-Json"
                ])
                .output()
            {
                if let Ok(output_str) = String::from_utf8(output.stdout) {
                    // Ищем значения AllocatedBaseSize и CurrentUsage в JSON
                    if let Some(allocated_pos) = output_str.find("\"AllocatedBaseSize\":") {
                        if let Some(end_pos) = output_str[allocated_pos..].find(',') {
                            let allocated_str = &output_str[allocated_pos + 21..allocated_pos + end_pos];
                            if let Ok(allocated) = allocated_str.trim().parse::<u64>() {
                                // Преобразуем МБ в байты
                                let total_mb = allocated * 1024 * 1024;
                                
                                if let Some(current_pos) = output_str.find("\"CurrentUsage\":") {
                                    if let Some(end_pos) = output_str[current_pos..].find('\n') {
                                        let current_str = &output_str[current_pos + 15..current_pos + end_pos];
                                        if let Ok(usage) = current_str.trim().trim_matches(',').trim_matches('}').parse::<u64>() {
                                            // Преобразуем МБ в байты
                                            let used_mb = usage * 1024 * 1024;
                                            
                                            swap_total = total_mb;
                                            swap_used = used_mb;
                                            virtual_memory_percent = if total_mb > 0 {
                                                (used_mb as f32 / total_mb as f32) * 100.0
                                            } else {
                                                0.0
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Если тип памяти не определен, пытаемся определить через косвенные признаки
    if memory_type == "Unknown" {
        // Современные системы обычно используют DDR4 или DDR5
        if available > 32 * 1024 * 1024 * 1024 { // Если памяти больше 32 ГБ, вероятно DDR5
            memory_type = String::from("DDR5");
        } else {
            memory_type = String::from("DDR4");
        }
    }
    
    // Если слоты все еще не определены, используем приблизительную оценку
    if memory_slots_total == 0 {
        // Большинство современных ПК имеют 2-4 слота памяти
        memory_slots_total = 4;
        memory_slots_used = 2; // Предполагаем, что используется половина слотов
    }
    
    // Проверяем, нужно ли обновлять данные (изменение > 0.5%)
    let mut need_update = false;
    {
        let current_data = cache.data.read().unwrap();
        // Обновляем только если процент использования изменился существенно
        if (current_data.usage_percentage - usage_percent as f64).abs() > 0.5 {
            need_update = true;
        }
    }
    
    if need_update {
        // Обновляем данные в кэше только при существенных изменениях
        let mut data = cache.data.write().unwrap();
        data.total = total;
        data.used = used;
        data.free = free;
        data.available = available;
        data.usage_percentage = usage_percent as f64;
        
        data.swap_total = swap_total;
        data.swap_used = swap_used;
        data.swap_free = swap_free;
        data.swap_usage_percentage = virtual_memory_percent as f64;
        
        // Обновляем статические данные о памяти
        data.type_ram = memory_type;
        data.memory_speed = memory_speed;
        data.slots_total = memory_slots_total;
        data.slots_used = memory_slots_used;
        data.memory_name = memory_name;
        data.memory_part_number = memory_part_number;
    }
    
    // Обновляем время последнего обновления
    let mut last_update = cache.last_update.write().unwrap();
    *last_update = Instant::now();
}

// Функция для обновления данных о дисках - с оптимизацией
fn update_disk_data(cache: &DiskCache) {
    // Проверяем активен ли мониторинг, если нет - не обновляем
    if !is_monitoring_active() {
        return;
    }

    // Ограничиваем частоту реального обновления данных о дисках, 
    // но при этом сохраняем частоту вызова для UI
    {
        let last_update = cache.last_update.read().unwrap();
        if last_update.elapsed() < Duration::from_millis(500) {
            // Просто возвращаемся без обновления, чтобы не тратить ресурсы
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
        
        let name = disk.name().to_string_lossy().to_string();
        let mount_point = disk.mount_point().to_string_lossy().to_string();
        let fs_string = disk.file_system().to_string_lossy().to_string();
        
        disks_info.push(DiskInfo {
            name,
            mount_point,
            available_space: available,
            total_space: total,
            file_system: fs_string,
            is_removable: disk.is_removable(),
            usage_percent,
        });
    }
    
    // Проверяем, изменились ли данные существенно, чтобы не обновлять без необходимости
    let mut need_update = true;
    {
        let current_disks = cache.data.read().unwrap();
        if current_disks.len() == disks_info.len() {
            // Обновляем только если данные изменились более чем на 1%
            need_update = false;
            for (i, disk) in current_disks.iter().enumerate() {
                if (disk.usage_percent - disks_info[i].usage_percent).abs() > 1.0 ||
                   (disk.available_space as f64 / disk.total_space as f64) - 
                   (disks_info[i].available_space as f64 / disks_info[i].total_space as f64) > 0.01 {
                    need_update = true;
                    break;
                }
            }
        }
    }
    
    if need_update {
        // Обновляем данные в кэше только если есть реальные изменения
        let mut data = cache.data.write().unwrap();
        *data = disks_info;
    }
    
    // Обновляем время последнего обновления в любом случае
    let mut last_update = cache.last_update.write().unwrap();
    *last_update = Instant::now();
} 