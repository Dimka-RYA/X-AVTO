use serde::{Serialize, Deserialize};
use sysinfo::{System, Disks, Components};
use std::collections::HashMap;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessorInfo {
    pub name: String,
    pub usage: f32,
    pub temperature: Option<f32>,
    pub cores: usize,
    pub threads: usize,
    pub frequency: f64,
    pub max_frequency: f64,
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

fn convert_to_gb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0 / 1024.0
}

fn convert_to_mb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0
}

#[cfg(target_os = "windows")]
fn get_cpu_details() -> HashMap<String, String> {
    let mut cpu_details = HashMap::new();
    
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
                    cpu_details.insert(key, value);
                }
            }
        }
    }
    
    cpu_details
}

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

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    // Получение базовой информации о процессоре
    let cpu_name = if let Some(cpu) = sys.cpus().first() {
        cpu.brand().to_string()
    } else {
        "Unknown".to_string()
    };
    
    let total_usage = sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / 
                     (sys.cpus().len() as f32);
    
    // Получаем детальную информацию о процессоре через специфичные для ОС методы
    let cpu_details = get_cpu_details();
    
    // Попробуем получить температуру процессора
    let components = Components::new();
    let mut cpu_temp = None;
    for component in components.iter() {
        if component.label().contains("CPU") {
            cpu_temp = Some(component.temperature());
            break;
        }
    }
    
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
    
    // Заполняем информацию о процессоре
    let processor = ProcessorInfo {
        name: cpu_name.clone(),
        usage: total_usage,
        temperature: cpu_temp,
        cores: sys.cpus().len() / 2, // Приблизительно, может быть неточно
        threads: threads,
        frequency: sys.cpus().first().map_or(0.0, |f| f.frequency() as f64 / 1000.0), // в ГГц
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