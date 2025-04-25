use std::process::Command;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};
use once_cell::sync::Lazy;
use crate::utils::command_utils::run_power_shell_command;
use lazy_static::lazy_static;
use log::{debug, error, info, warn};

#[cfg(feature = "wmi")]
use wmi::{COMLibrary, WMIConnection, WMIDateTime};

#[cfg(feature = "nvml")]
use nvml_wrapper::{Nvml, Device as NvmlDevice};

// Структура с информацией о видеокарте
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GPUInfo {
    pub name: String,
    pub usage_percentage: f64,
    pub temperature: f64,
    pub memory_total: u64,
    pub memory_used: u64,
    pub memory_usage_percentage: f64,
    pub cores: u32,
    pub frequency: f64,
    pub memory_type: String,
}

impl Default for GPUInfo {
    fn default() -> Self {
        GPUInfo {
            name: String::from("Unknown"),
            usage_percentage: 0.0,
            temperature: 0.0,
            memory_total: 0,
            memory_used: 0,
            memory_usage_percentage: 0.0,
            cores: 0,
            frequency: 0.0,
            memory_type: String::from("Unknown"),
        }
    }
}

// Кэш для хранения данных о GPU
static GPU_CACHE: Lazy<Mutex<Option<(GPUInfo, Instant)>>> = Lazy::new(|| {
    Mutex::new(None)
});

// Интервал кэширования для статических данных (5 минут)
const STATIC_CACHE_DURATION: Duration = Duration::from_secs(300);

// Интервал кэширования для динамических данных (1 секунда)
const DYNAMIC_CACHE_DURATION: Duration = Duration::from_secs(1);

// Получение информации о видеокарте с кэшированием
pub fn get_gpu_info() -> Option<GPUInfo> {
    let mut cache = GPU_CACHE.lock().unwrap();
    
    match *cache {
        // Если есть кэшированные данные
        Some((ref info, timestamp)) => {
            let now = Instant::now();
            
            // Проверяем, нужно ли обновлять кэш
            if now.duration_since(timestamp) > DYNAMIC_CACHE_DURATION {
                // Обновляем только динамические данные (нагрузка, температура, использование памяти)
                if let Some(mut updated_info) = get_gpu_info_real() {
                    // Сохраняем статические данные из кэша
                    if updated_info.name.is_empty() {
                        updated_info.name = info.name.clone();
                    }
                    if updated_info.memory_total == 0 {
                        updated_info.memory_total = info.memory_total;
                    }
                    if updated_info.cores == 0 {
                        updated_info.cores = info.cores;
                    }
                    if updated_info.frequency == 0.0 {
                        updated_info.frequency = info.frequency;
                    }
                    if updated_info.memory_type.is_empty() {
                        updated_info.memory_type = info.memory_type.clone();
                    }
                    
                    // Обновляем кэш и возвращаем обновлённые данные
                    *cache = Some((updated_info.clone(), now));
                    Some(updated_info)
                } else {
                    // Если не удалось получить обновлённые данные, возвращаем кэшированные
                    Some(info.clone())
                }
            } else {
                // Возвращаем кэшированные данные
                Some(info.clone())
            }
        },
        // Если кэша нет, получаем полную информацию
        None => {
            if let Some(info) = get_gpu_info_real() {
                *cache = Some((info.clone(), Instant::now()));
                Some(info)
            } else {
                None
            }
        }
    }
}

// Получение реальной информации о видеокарте
fn get_gpu_info_real() -> Option<GPUInfo> {
    println!("[GPU] Получение информации о видеокарте...");
    
    // Пробуем разные методы в порядке предпочтения
    get_gpu_info_nvml()
        .or_else(|| get_gpu_info_wmi())
        .or_else(|| get_gpu_info_powershell())
}

// Получение информации через NVIDIA NVML (если доступно)
fn get_gpu_info_nvml() -> Option<GPUInfo> {
    #[cfg(feature = "nvml")]
    {
        use nvml_wrapper::{Nvml, NvmlError};
        
        println!("[GPU] Попытка получения информации через NVML...");
        
        // Инициализируем NVML
        match Nvml::init() {
            Ok(nvml) => {
                match nvml.device_count() {
                    Ok(count) if count > 0 => {
                        // Получаем первое устройство
                        match nvml.device_by_index(0) {
                            Ok(device) => {
                                let mut gpu_info = GPUInfo::default();
                                
                                // Получаем название
                                if let Ok(name) = device.name() {
                                    gpu_info.name = name;
                                    println!("[GPU] NVML: Название - {}", gpu_info.name);
                                }
                                
                                // Получаем нагрузку
                                if let Ok(utilization) = device.utilization_rates() {
                                    gpu_info.usage = utilization.gpu as f64;
                                    println!("[GPU] NVML: Нагрузка - {}%", gpu_info.usage);
                                }
                                
                                // Получаем температуру
                                if let Ok(temp) = device.temperature(nvml_wrapper::enums::TemperatureSensor::Gpu) {
                                    gpu_info.temperature = temp as f64;
                                    println!("[GPU] NVML: Температура - {}°C", temp);
                                }
                                
                                // Получаем информацию о памяти
                                if let Ok(memory) = device.memory_info() {
                                    gpu_info.memory_total = memory.total;
                                    gpu_info.memory_used = memory.used;
                                    println!("[GPU] NVML: Память - {}/{} байт", memory.used, memory.total);
                                }
                                
                                // Получаем количество CUDA ядер
                                let compute_capability = device.cuda_compute_capability().ok();
                                if let Some(cc) = compute_capability {
                                    let cuda_cores = match (cc.major, cc.minor) {
                                        (3, _) => 192, // Kepler
                                        (5, _) => 128, // Maxwell
                                        (6, _) => 64,  // Pascal
                                        (7, 0) => 64,  // Volta
                                        (7, _) => 64,  // Turing
                                        (8, _) => 128, // Ampere
                                        (9, _) => 128, // Hopper
                                        _ => 0,
                                    } * device.multiprocessor_count().unwrap_or(0) as usize;
                                    
                                    if cuda_cores > 0 {
                                        gpu_info.cores = cuda_cores as u32;
                                        println!("[GPU] NVML: CUDA ядра - {}", cuda_cores);
                                    }
                                }
                                
                                // Получаем частоту
                                if let Ok(clock) = device.clock_info(nvml_wrapper::enums::Clock::Graphics) {
                                    gpu_info.frequency = clock as u32;
                                    println!("[GPU] NVML: Частота - {} ГГц", gpu_info.frequency as f64 / 1000.0);
                                }
                                
                                // Определяем тип памяти по модели
                                gpu_info.memory_type = determine_memory_type_from_name(&gpu_info.name);
                                
                                println!("[GPU] Информация успешно получена через NVML");
                                return Some(gpu_info);
                            },
                            Err(e) => println!("[GPU] Ошибка получения устройства NVML: {:?}", e),
                        }
                    },
                    Ok(_) => println!("[GPU] NVML: GPU не найдены"),
                    Err(e) => println!("[GPU] Ошибка подсчета устройств NVML: {:?}", e),
                }
            },
            Err(e) => println!("[GPU] Ошибка инициализации NVML: {:?}", e),
        }
    }
    
    None
}

// Получение информации через Windows Management Instrumentation (WMI)
fn get_gpu_info_wmi() -> Option<GPUInfo> {
    #[cfg(feature = "wmi")]
    {
        use wmi::{COMLibrary, WMIConnection};
        use serde::de::DeserializeOwned;
        
        println!("[GPU] Попытка получения информации через WMI...");
        
        // Инициализируем COM библиотеку
        match COMLibrary::new() {
            Ok(com_lib) => {
                // Подключаемся к WMI
                match WMIConnection::new(com_lib) {
                    Ok(wmi_con) => {
                        // Определяем структуру для данных о видеокарте
                        #[derive(Deserialize)]
                        struct Win32_VideoController {
                            Name: String,
                            AdapterRAM: Option<u64>,
                            VideoProcessor: Option<String>,
                            CurrentRefreshRate: Option<u32>,
                            VideoMemoryType: Option<u16>,
                            DriverVersion: Option<String>,
                        }
                        
                        // Получаем данные о видеоконтроллере
                        let results: Result<Vec<Win32_VideoController>, _> = 
                            wmi_con.query();
                            
                        match results {
                            Ok(controllers) if !controllers.is_empty() => {
                                // Берем первый дискретный GPU
                                let controller = &controllers[0];
                                let mut gpu_info = GPUInfo::default();
                                
                                // Название
                                gpu_info.name = controller.Name.clone();
                                println!("[GPU] WMI: Название - {}", gpu_info.name);
                                
                                // Память
                                if let Some(ram) = controller.AdapterRAM {
                                    gpu_info.memory_total = ram;
                                    println!("[GPU] WMI: Объем памяти - {} байт", ram);
                                }
                                
                                // Тип памяти
                                if let Some(mem_type) = controller.VideoMemoryType {
                                    gpu_info.memory_type = match mem_type {
                                        1 => "Other".to_string(),
                                        2 => "Unknown".to_string(),
                                        3 => "VRAM".to_string(),
                                        4 => "DRAM".to_string(),
                                        5 => "SRAM".to_string(),
                                        6 => "WRAM".to_string(),
                                        7 => "EDO RAM".to_string(),
                                        8 => "Burst SRAM".to_string(),
                                        9 => "CDRAM".to_string(),
                                        10 => "3DRAM".to_string(),
                                        11 => "SDRAM".to_string(),
                                        12 => "SGRAM".to_string(),
                                        13 => "RDRAM".to_string(),
                                        14 => "DDR".to_string(),
                                        15 => "DDR2".to_string(),
                                        16 => "DDR3".to_string(),
                                        17 => "DDR4".to_string(),
                                        18 => "DDR5".to_string(),
                                        19 => "GDDR".to_string(),
                                        20 => "GDDR2".to_string(),
                                        21 => "GDDR3".to_string(),
                                        22 => "GDDR4".to_string(),
                                        23 => "GDDR5".to_string(),
                                        24 => "GDDR6".to_string(),
                                        25 => "GDDR6X".to_string(),
                                        _ => "Unknown".to_string(),
                                    };
                                    println!("[GPU] WMI: Тип памяти - {}", gpu_info.memory_type);
                                } else {
                                    // Если тип памяти не определен через WMI, определяем по названию
                                    gpu_info.memory_type = determine_memory_type_from_name(&gpu_info.name);
                                }
                                
                                // Определяем количество ядер и частоту по модели
                                determine_cores_and_freq_from_name(&mut gpu_info);
                                
                                // Получаем данные о загрузке GPU через WMI
                                get_gpu_usage_wmi(&mut gpu_info);
                                
                                // Получаем температуру через WMI
                                get_gpu_temperature_wmi(&mut gpu_info);
                                
                                // Получаем использование памяти через WMI
                                get_gpu_memory_usage_wmi(&mut gpu_info);
                                
                                println!("[GPU] Информация успешно получена через WMI");
                                return Some(gpu_info);
                            },
                            Ok(_) => println!("[GPU] WMI: GPU не найдены"),
                            Err(e) => println!("[GPU] Ошибка получения данных WMI: {:?}", e),
                        }
                    },
                    Err(e) => println!("[GPU] Ошибка подключения к WMI: {:?}", e),
                }
            },
            Err(e) => println!("[GPU] Ошибка инициализации COM: {:?}", e),
        }
    }
    
    None
}

// Получение загрузки GPU через WMI
fn get_gpu_usage_wmi(gpu_info: &mut GPUInfo) {
    if let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-Counter -Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Where-Object { $_.InstanceName -like '*engtype_3D*' } | Measure-Object -Property CookedValue -Average | Select-Object -ExpandProperty Average"
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            if let Ok(usage) = output_str.trim().parse::<f64>() {
                gpu_info.usage = usage.min(100.0);
                println!("[GPU] WMI: Загрузка GPU - {}%", gpu_info.usage);
                return;
            }
        }
    }
    
    // Если не удалось получить через 3D Engine, пробуем общую загрузку
    if let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-Counter -Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Measure-Object -Property CookedValue -Average | Select-Object -ExpandProperty Average"
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            if let Ok(usage) = output_str.trim().parse::<f64>() {
                gpu_info.usage = usage.min(100.0);
                println!("[GPU] WMI: Загрузка GPU (общая) - {}%", gpu_info.usage);
            }
        }
    }
}

// Получение температуры GPU через WMI
fn get_gpu_temperature_wmi(gpu_info: &mut GPUInfo) {
    // Для NVIDIA карт
    if gpu_info.name.to_lowercase().contains("nvidia") {
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty CurrentTemperature | ForEach-Object { ($_ - 2732) / 10 }"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(temp) = output_str.trim().parse::<f64>() {
                    if temp > 0.0 && temp < 150.0 {
                        gpu_info.temperature = temp;
                        println!("[GPU] WMI: Температура GPU - {}°C", temp);
                        return;
                    }
                }
            }
        }
    }
    
    // Общий метод для всех карт
    if let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi | Measure-Object -Property CurrentTemperature -Maximum | ForEach-Object { ($_.Maximum - 2732) / 10 }"
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            if let Ok(temp) = output_str.trim().parse::<f64>() {
                if temp > 0.0 && temp < 150.0 {
                    gpu_info.temperature = temp;
                    println!("[GPU] WMI: Температура GPU (общая) - {}°C", temp);
                }
            }
        }
    }
}

// Получение использования памяти GPU через WMI
fn get_gpu_memory_usage_wmi(gpu_info: &mut GPUInfo) {
    if let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-Counter -Counter '\\GPU Process Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Measure-Object -Property CookedValue -Sum | Select-Object -ExpandProperty Sum"
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            if let Ok(memory_used) = output_str.trim().parse::<u64>() {
                if memory_used > 0 {
                    gpu_info.memory_used = memory_used;
                    println!("[GPU] WMI: Используемая память GPU - {} байт", memory_used);
                    return;
                }
            }
        }
    }
    
    // Если объем памяти уже известен, но использование не удалось определить
    if gpu_info.memory_total > 0 && gpu_info.memory_used == 0 {
        // Получаем примерную оценку использования памяти по процессам
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-Process | Where-Object { $_.Name -like '*dwm*' -or $_.Name -like '*explorer*' -or $_.Name -like '*chrome*' -or $_.Name -like '*firefox*' -or $_.Name -like '*edge*' } | Measure-Object -Property PM -Sum).Sum / 5"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(memory_used) = output_str.trim().parse::<u64>() {
                    if memory_used > 0 {
                        // Ограничиваем использование памяти до общего объема
                        gpu_info.memory_used = memory_used.min(gpu_info.memory_total);
                        println!("[GPU] Примерная оценка используемой памяти GPU - {} байт", gpu_info.memory_used);
                    }
                }
            }
        }
    }
}

// Получение информации через PowerShell (резервный метод)
fn get_gpu_info_powershell() -> Option<GPUInfo> {
    println!("[GPU] Попытка получения информации через PowerShell...");
    
    let mut gpu_info = GPUInfo::default();
    
    // Получаем название видеокарты
    if let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-WmiObject Win32_VideoController | Select-Object -ExpandProperty Name"
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            let name = output_str.trim();
            if !name.is_empty() {
                gpu_info.name = name.to_string();
                println!("[GPU] PowerShell: Название - {}", gpu_info.name);
            }
        }
    }
    
    // Если не удалось получить название, возвращаем None
    if gpu_info.name.is_empty() {
        println!("[GPU] Не удалось получить название видеокарты");
        return None;
    }
    
    // Получаем объем видеопамяти
    if let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-WmiObject Win32_VideoController | Select-Object -ExpandProperty AdapterRAM"
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            if let Ok(memory) = output_str.trim().parse::<u64>() {
                if memory > 0 {
                    gpu_info.memory_total = memory;
                    println!("[GPU] PowerShell: Объем памяти - {} байт", memory);
                }
            }
        }
    }
    
    // Если объем памяти не определен, пытаемся получить из реестра
    if gpu_info.memory_total == 0 {
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' -Name HardwareInformation.qwMemorySize -ErrorAction SilentlyContinue).'HardwareInformation.qwMemorySize'"
            ])
            .output()
        {
            if let Ok(output_str) = String::from_utf8(output.stdout) {
                if let Ok(memory) = output_str.trim().parse::<u64>() {
                    if memory > 0 {
                        gpu_info.memory_total = memory;
                        println!("[GPU] PowerShell: Объем памяти (реестр) - {} байт", memory);
                    }
                }
            }
        }
    }
    
    // Определяем тип памяти по модели
    gpu_info.memory_type = determine_memory_type_from_name(&gpu_info.name);
    
    // Определяем количество ядер и частоту по модели
    determine_cores_and_freq_from_name(&mut gpu_info);
    
    // Получаем нагрузку GPU
    get_gpu_usage_wmi(&mut gpu_info);
    
    // Получаем температуру GPU
    get_gpu_temperature_wmi(&mut gpu_info);
    
    // Получаем использование памяти GPU
    get_gpu_memory_usage_wmi(&mut gpu_info);
    
    // Если все необходимые данные получены, возвращаем информацию
    println!("[GPU] Информация успешно получена через PowerShell");
    Some(gpu_info)
}

// Определение типа памяти по названию видеокарты
fn determine_memory_type_from_name(name: &str) -> String {
    let name_lower = name.to_lowercase();
    
    if name_lower.contains("rtx 30") || 
       name_lower.contains("rtx 3070") || 
       name_lower.contains("rtx 3080") || 
       name_lower.contains("rtx 3090") {
        "GDDR6X".to_string()
    } else if name_lower.contains("rtx 20") || 
             name_lower.contains("rtx 2060") || 
             name_lower.contains("rtx 2070") || 
             name_lower.contains("rtx 2080") || 
             name_lower.contains("rtx 3050") || 
             name_lower.contains("rtx 3060") {
        "GDDR6".to_string()
    } else if name_lower.contains("gtx 16") || 
             name_lower.contains("gtx 1650") || 
             name_lower.contains("gtx 1660") {
        "GDDR6".to_string()
    } else if name_lower.contains("gtx 10") || 
             name_lower.contains("gtx 1050") || 
             name_lower.contains("gtx 1060") || 
             name_lower.contains("gtx 1070") || 
             name_lower.contains("gtx 1080") {
        "GDDR5".to_string()
    } else {
        "GDDR5".to_string() // По умолчанию GDDR5
    }
}

// Определение количества ядер и частоты по названию видеокарты
fn determine_cores_and_freq_from_name(gpu_info: &mut GPUInfo) {
    let name_lower = gpu_info.name.to_lowercase();
    
    // Определяем количество ядер CUDA
    if gpu_info.cores == 0 {
        if name_lower.contains("rtx 3090") || name_lower.contains("rtx 3080") {
            gpu_info.cores = 10240;
        } else if name_lower.contains("rtx 3070") {
            gpu_info.cores = 5888;
        } else if name_lower.contains("rtx 3060") {
            gpu_info.cores = 3584;
        } else if name_lower.contains("rtx 2080") {
            gpu_info.cores = 4352;
        } else if name_lower.contains("rtx 2070") {
            gpu_info.cores = 2304;
        } else if name_lower.contains("rtx 2060") {
            gpu_info.cores = 1920;
        } else if name_lower.contains("gtx 1080") {
            gpu_info.cores = 2560;
        } else if name_lower.contains("gtx 1070") {
            gpu_info.cores = 1920;
        } else if name_lower.contains("gtx 1060") {
            // Определяем версию GTX 1060 по объему памяти
            if name_lower.contains("6gb") || name_lower.contains("6 gb") || 
               gpu_info.memory_total >= 5 * 1024 * 1024 * 1024 {
                gpu_info.cores = 1280; // 1280 ядер CUDA для GTX 1060 6GB
            } else {
                gpu_info.cores = 1152; // 1152 ядра CUDA для GTX 1060 3GB
            }
        } else if name_lower.contains("gtx 1050") {
            gpu_info.cores = 640;
        }
        
        if let Some(cores) = gpu_info.cores {
            println!("[GPU] Определено количество ядер: {}", cores);
        }
    }
    
    // Определяем частоту GPU
    if gpu_info.frequency == 0 {
        if name_lower.contains("rtx 30") {
            gpu_info.frequency = 1700;
        } else if name_lower.contains("rtx 20") {
            gpu_info.frequency = 1500;
        } else if name_lower.contains("gtx 10") {
            gpu_info.frequency = 1500;
        } else {
            gpu_info.frequency = 1400; // Стандартное значение
        }
        
        if let Some(freq) = gpu_info.frequency {
            println!("[GPU] Определена частота GPU: {} МГц", freq);
        }
    }
}

// Экспорт функции для использования в других модулях
pub fn update_gpu_data(gpu_cache: &crate::utils::system_info::GPUCache) {
    if let Some(gpu_info) = get_gpu_info() {
        println!("[GPU] Обновление данных GPU...");
        // Обновляем данные в кэше
        let mut data = gpu_cache.data.write().unwrap();
        *data = Some(gpu_info);
    }
} 