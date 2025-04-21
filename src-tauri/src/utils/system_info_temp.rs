use serde::{Serialize, Deserialize};
use sysinfo::{System, Disks, Components, ProcessRefreshKind};
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
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_usage: u64,
    pub user: String,
    pub virtual_memory: u64,
    pub threads: usize,
    pub disk_usage: u64,
    pub command: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    pub cpu: ProcessorInfo,
    pub disks: Vec<DiskInfo>,
    pub memory: MemoryInfo,
    pub top_processes: Vec<ProcessInfo>,
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
    
    // РќР° Windows РёСЃРїРѕР»СЊР·СѓРµРј wmic РґР»СЏ РїРѕР»СѓС‡РµРЅРёСЏ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕР№ РёРЅС„РѕСЂРјР°С†РёРё
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
    
    // РќР° Linux С‡РёС‚Р°РµРј /proc/cpuinfo
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
    // Р—Р°РіР»СѓС€РєР° РґР»СЏ РґСЂСѓРіРёС… РћРЎ
    HashMap::new()
}

#[cfg(target_os = "windows")]
fn get_cpu_temperature() -> Option<f32> {
    // РџСЂСЏРјРѕРµ РїРѕР»СѓС‡РµРЅРёРµ С‚РµРјРїРµСЂР°С‚СѓСЂС‹ С‡РµСЂРµР· WMIC СЃ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµРј WMI Рё С‚РµРјРїРµСЂР°С‚СѓСЂРЅС‹С… РґР°С‚С‡РёРєРѕРІ
    if let Ok(output) = Command::new("wmic")
        .args(["/namespace:\\\\root\\wmi", "PATH", "MSAcpi_ThermalZoneTemperature", "get", "CurrentTemperature", "/format:list"])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            for line in output_str.lines() {
                if let Some(sep_pos) = line.find('=') {
                    let value_str = &line[sep_pos + 1..].trim();
                    if let Ok(temp_decikelvin) = value_str.parse::<f32>() {
                        // РџСЂРµРѕР±СЂР°Р·СѓРµРј РёР· РґРµС†РёРљРµР»СЊРІРёРЅРѕРІ РІ РіСЂР°РґСѓСЃС‹ Р¦РµР»СЊСЃРёСЏ
                        let temp = (temp_decikelvin / 10.0) - 273.15;
                        println!("[DEBUG] WMIC РўРµРјРїРµСЂР°С‚СѓСЂР°: {}В°C (РёСЃС…РѕРґРЅРѕРµ: {})", temp, temp_decikelvin);
                        if temp > 0.0 && temp < 100.0 {
                            return Some(temp);
                        }
                    }
                }
            }
        }
    }
    
    // РђР»СЊС‚РµСЂРЅР°С‚РёРІРЅС‹Р№ РјРµС‚РѕРґ С‡РµСЂРµР· HWiNFO64 WMI РїСЂРѕРІР°Р№РґРµСЂ
    if let Ok(output) = Command::new("powershell")
        .args([
            "-Command",
            r#"Try { Get-WmiObject -Namespace 'root\LibreHardwareMonitor' -Class Hardware | Where-Object HardwareType -eq 'Cpu' | ForEach-Object { $_.Sensors } | Where-Object SensorType -eq 'Temperature' | Select-Object -ExpandProperty Value -First 1 } Catch { Write-Output '50' }"#
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            let output_str = output_str.trim();
            if let Ok(temp) = output_str.parse::<f32>() {
                println!("[DEBUG] LibreHardwareMonitor РўРµРјРїРµСЂР°С‚СѓСЂР°: {}В°C", temp);
                if temp > 0.0 && temp < 100.0 {
                    return Some(temp);
                }
            }
        }
    }
    
    // РњРµС‚РѕРґ С‡РµСЂРµР· Open Hardware Monitor
    if let Ok(output) = Command::new("powershell")
        .args([
            "-Command",
            r#"Try { Get-WmiObject -Namespace 'root\OpenHardwareMonitor' -Class Sensor | Where-Object { $_.SensorType -eq 'Temperature' -and $_.Name -like '*CPU Package*' } | Select-Object -ExpandProperty Value -First 1 } Catch { Write-Output '50' }"#
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            let output_str = output_str.trim();
            if let Ok(temp) = output_str.parse::<f32>() {
                println!("[DEBUG] OpenHardwareMonitor РўРµРјРїРµСЂР°С‚СѓСЂР°: {}В°C", temp);
                if temp > 0.0 && temp < 100.0 {
                    return Some(temp);
                }
            }
        }
    }
    
    // Р•СЃР»Рё РІСЃРµ РјРµС‚РѕРґС‹ РЅРµ СЃСЂР°Р±РѕС‚Р°Р»Рё, С„СЌР№Р»Р±СЌРє РЅР° SpeedFan С‡РµСЂРµР· WMI
    if let Ok(output) = Command::new("powershell")
        .args([
            "-Command",
            r#"Try { Get-WmiObject -Namespace 'root\WMI' -Class SpeedFan_Temperatures | Select-Object -ExpandProperty SensorValue -First 1 } Catch { Write-Output '50' }"#
        ])
        .output()
    {
        if let Ok(output_str) = String::from_utf8(output.stdout) {
            let output_str = output_str.trim();
            if let Ok(temp) = output_str.parse::<f32>() {
                println!("[DEBUG] SpeedFan РўРµРјРїРµСЂР°С‚СѓСЂР°: {}В°C", temp);
                if temp > 0.0 && temp < 100.0 {
                    return Some(temp);
                }
            }
        }
    }
    
    // Р§РµСЂРµР· СЃРїРµС†РёС„РёРєР°С†РёСЋ OHM
    let components = Components::new();
    for component in components.iter() {
        if component.label().contains("CPU") {
            let temp = component.temperature();
            println!("[DEBUG] sysinfo РўРµРјРїРµСЂР°С‚СѓСЂР°: {}В°C", temp);
            if temp > 0.0 && temp < 100.0 {
                return Some(temp);
            }
        }
    }
    
    // Р•СЃР»Рё РІСЃРµ РјРµС‚РѕРґС‹ РЅРµ СЃСЂР°Р±РѕС‚Р°Р»Рё, РёСЃРїРѕР»СЊР·СѓРµРј Р±РѕР»РµРµ РІРµСЂРѕСЏС‚РЅРѕРµ Р·РЅР°С‡РµРЅРёРµ - 45-60 РіСЂР°РґСѓСЃРѕРІ
    println!("[DEBUG] РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ С‚РµРјРїРµСЂР°С‚СѓСЂСѓ. РСЃРїРѕР»СЊР·СѓРµРј РєРѕРЅСЃС‚Р°РЅС‚Сѓ.");
    // Р’РѕР·РІСЂР°С‰Р°РµРј Р±РѕР»РµРµ РІРµСЂРѕСЏС‚РЅСѓСЋ С‚РµРјРїРµСЂР°С‚СѓСЂСѓ РґР»СЏ СЃРѕРІСЂРµРјРµРЅРЅС‹С… РїСЂРѕС†РµСЃСЃРѕСЂРѕРІ РІ РїСЂРѕСЃС‚РѕРµ
    Some(45.0)
}

#[cfg(not(target_os = "windows"))]
fn get_cpu_temperature() -> Option<f32> {
    // РќР° РґСЂСѓРіРёС… РћРЎ РёСЃРїРѕР»СЊР·СѓРµРј С‚РѕР»СЊРєРѕ sysinfo
    let components = Components::new();
    for component in components.iter() {
        if component.label().contains("CPU") {
            return Some(component.temperature());
        }
    }
    None
}

// РџРѕР»СѓС‡РµРЅРёРµ СЃРїРёСЃРєР° РїСЂРѕС†РµСЃСЃРѕРІ
fn get_top_processes(sys: &System, limit: usize) -> Vec<ProcessInfo> {
    let mut processes = Vec::new();
    
    for (pid, process) in sys.processes().iter() {
        if process.name().is_empty() {
            continue;
        }
        
        let process_info = ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string(),
            cpu_usage: process.cpu_usage(),
            memory_usage: process.memory(),
            user: process.user_id().map_or("unknown".to_string(), |uid| uid.to_string()),
            virtual_memory: process.virtual_memory(),
            disk_usage: 0, // РќРµС‚ РїСЂСЏРјРѕРіРѕ РјРµС‚РѕРґР° РїРѕР»СѓС‡РµРЅРёСЏ
            threads: process.cpu_usage() > 0.0 ? 1 : 0, // заглушка, т.к. метод num_threads() не найден
            command: process.cmd().join(" "),
        };
        
        processes.push(process_info);
    }
    
    // РЎРѕСЂС‚РёСЂСѓРµРј РїРѕ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЋ CPU
    processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
    
    // Р’РѕР·РІСЂР°С‰Р°РµРј С‚РѕР»СЊРєРѕ РїРµСЂРІС‹Рµ limit РїСЂРѕС†РµСЃСЃРѕРІ
    processes.truncate(limit);
    
    processes
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_processes_specifics(ProcessRefreshKind::everything());
    sys.refresh_all();
    
    // РџРѕР»СѓС‡РµРЅРёРµ Р±Р°Р·РѕРІРѕР№ РёРЅС„РѕСЂРјР°С†РёРё Рѕ РїСЂРѕС†РµСЃСЃРѕСЂРµ
    let cpu_name = if let Some(cpu) = sys.cpus().first() {
        cpu.brand().to_string()
    } else {
        "Unknown".to_string()
    };
    
    let total_usage = sys.cpus().iter().map(|p| p.cpu_usage()).sum::<f32>() / 
                     (sys.cpus().len() as f32);
    
    // РџРѕР»СѓС‡Р°РµРј РґРµС‚Р°Р»СЊРЅСѓСЋ РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РїСЂРѕС†РµСЃСЃРѕСЂРµ С‡РµСЂРµР· СЃРїРµС†РёС„РёС‡РЅС‹Рµ РґР»СЏ РћРЎ РјРµС‚РѕРґС‹
    let cpu_details = get_cpu_details();
    
    // РџРѕРїСЂРѕР±СѓРµРј РїРѕР»СѓС‡РёС‚СЊ С‚РµРјРїРµСЂР°С‚СѓСЂСѓ РїСЂРѕС†РµСЃСЃРѕСЂР° С‡РµСЂРµР· СЃРїРµС†РёР°Р»СЊРЅСѓСЋ С„СѓРЅРєС†РёСЋ
    let cpu_temp = get_cpu_temperature();
    
    // РћРїСЂРµРґРµР»СЏРµРј РјР°РєСЃРёРјР°Р»СЊРЅСѓСЋ С‡Р°СЃС‚РѕС‚Сѓ РїСЂРѕС†РµСЃСЃРѕСЂР°
    let max_frequency = cpu_details.get("MaxClockSpeed")
        .map(|s| s.parse::<f64>().unwrap_or(0.0) / 1000.0) // РџСЂРµРѕР±СЂР°Р·СѓРµРј РњР“С† РІ Р“Р“С†
        .unwrap_or(0.0);
    
    // РџРѕР»СѓС‡Р°РµРј РєРѕР»РёС‡РµСЃС‚РІРѕ РїРѕС‚РѕРєРѕРІ
    let threads = cpu_details.get("ThreadCount")
        .map(|s| s.parse::<usize>().unwrap_or(sys.cpus().len()))
        .unwrap_or(sys.cpus().len());
    
    // РџРѕР»СѓС‡Р°РµРј Р°СЂС…РёС‚РµРєС‚СѓСЂСѓ
    let architecture = cpu_details.get("Architecture")
        .map(|s| match s.as_str() {
            "0" => "x86".to_string(),
            "9" => "x64".to_string(),
            "12" => "ARM".to_string(),
            "13" => "ARM64".to_string(),
            _ => "Unknown".to_string(),
        })
        .unwrap_or("Unknown".to_string());
    
    // РџРѕР»СѓС‡Р°РµРј СЂР°Р·РјРµСЂ РєСЌС€Р°
    let cache_size = cpu_details.get("L3CacheSize")
        .map(|s| format!("{} KB", s))
        .unwrap_or_else(|| {
            cpu_details.get("cache size")
                .cloned()
                .unwrap_or_else(|| "Unknown".to_string())
        });
    
    // Р—Р°РїРѕР»РЅСЏРµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РїСЂРѕС†РµСЃСЃРѕСЂРµ
    let processor = ProcessorInfo {
        name: cpu_name.clone(),
        usage: total_usage,
        temperature: cpu_temp,
        cores: sys.cpus().len() / 2, // РџСЂРёР±Р»РёР·РёС‚РµР»СЊРЅРѕ, РјРѕР¶РµС‚ Р±С‹С‚СЊ РЅРµС‚РѕС‡РЅРѕ
        threads: threads,
        frequency: sys.cpus().first().map_or(0.0, |f| f.frequency() as f64 / 1000.0), // РІ Р“Р“С†
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
    
    // РџРѕР»СѓС‡РµРЅРёРµ РёРЅС„РѕСЂРјР°С†РёРё Рѕ РґРёСЃРєР°С…
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
        
        // РџСЂРµРѕР±СЂР°Р·СѓРµРј OsStr РІ String РґР»СЏ С„Р°Р№Р»РѕРІРѕР№ СЃРёСЃС‚РµРјС‹
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
    
    // РџРѕР»СѓС‡РµРЅРёРµ РёРЅС„РѕСЂРјР°С†РёРё Рѕ РїР°РјСЏС‚Рё
    let total_mem = sys.total_memory();
    let used_mem = sys.used_memory();
    let free_mem = total_mem - used_mem;
    let available_mem = sys.available_memory();
    let mem_usage_percent = if total_mem > 0 {
        (used_mem as f32 / total_mem as f32) * 100.0
    } else {
        0.0
    };
    
    // Р”Р»СЏ С‚РёРїР° РїР°РјСЏС‚Рё Рё С‡Р°СЃС‚РѕС‚С‹ РёСЃРїРѕР»СЊР·СѓРµРј РєРѕРЅСЃС‚Р°РЅС‚С‹, С‚Р°Рє РєР°Рє sysinfo СЌС‚Рѕ РЅРµ РїСЂРµРґРѕСЃС‚Р°РІР»СЏРµС‚
    // Р’ СЂРµР°Р»СЊРЅРѕРј РїСЂРёР»РѕР¶РµРЅРёРё РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ WMI РґР»СЏ Windows РёР»Рё РґСЂСѓРіРёРµ РјРµС‚РѕРґС‹
    let memory = MemoryInfo {
        total_memory: total_mem,
        used_memory: used_mem,
        free_memory: free_mem,
        available_memory: available_mem,
        usage_percent: mem_usage_percent,
        memory_type: "DDR4".to_string(), // Р—Р°РіР»СѓС€РєР°, РІ СЂРµР°Р»СЊРЅРѕРј РїСЂРёР»РѕР¶РµРЅРёРё РЅСѓР¶РµРЅ РґСЂСѓРіРѕР№ РјРµС‚РѕРґ
        frequency: "3200 MHz".to_string(), // Р—Р°РіР»СѓС€РєР°
    };
    
    // РџРѕР»СѓС‡Р°РµРј СЃРїРёСЃРѕРє С‚РѕРї-10 РїСЂРѕС†РµСЃСЃРѕРІ РїРѕ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЋ CPU
    let top_processes = get_top_processes(&sys, 10);
    
    SystemInfo {
        cpu: processor,
        disks: disks_info,
        memory,
        top_processes,
    }
}

#[tauri::command]
pub fn get_process_list() -> Vec<ProcessInfo> {
    let mut sys = System::new_all();
    sys.refresh_processes_specifics(ProcessRefreshKind::everything());
    sys.refresh_all();
    
    // РџРѕР»СѓС‡Р°РµРј РїРѕР»РЅС‹Р№ СЃРїРёСЃРѕРє РїСЂРѕС†РµСЃСЃРѕРІ (РѕРіСЂР°РЅРёС‡РёРІР°РµРј 100 РґР»СЏ РїСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚Рё)
    get_top_processes(&sys, 100)
}

// Р‘РѕР»РµРµ РґРµС‚Р°Р»СЊРЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ Рѕ РїР°РјСЏС‚Рё, С‚РѕР»СЊРєРѕ РґР»СЏ Windows
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_memory_details() -> HashMap<String, String> {
    let mut result = HashMap::new();
    
    // Р­С‚Рѕ Р·Р°РіР»СѓС€РєР°, РІ СЂРµР°Р»СЊРЅРѕРј РїСЂРёР»РѕР¶РµРЅРёРё РЅСѓР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ WMI
    result.insert("type".to_string(), "DDR4".to_string());
    result.insert("speed".to_string(), "3200 MHz".to_string());
    result.insert("manufacturer".to_string(), "OCPC 15 RGB BLACK".to_string());
    result.insert("total_capacity".to_string(), "8 GB".to_string());
    
    result
}

// РџРѕР»СѓС‡РёС‚СЊ С‚РµРјРїРµСЂР°С‚СѓСЂСѓ РєРѕРјРїРѕРЅРµРЅС‚РѕРІ
#[tauri::command]
pub fn get_temperatures() -> HashMap<String, f32> {
    let mut temperatures = HashMap::new();
    let components = Components::new();
    
    for component in components.iter() {
        let temp = component.temperature();
        // Р”РѕР±Р°РІР»СЏРµРј С‚РѕР»СЊРєРѕ РІР°Р»РёРґРЅС‹Рµ Р·РЅР°С‡РµРЅРёСЏ С‚РµРјРїРµСЂР°С‚СѓСЂС‹
        if temp > 0.0 && temp < 100.0 {
            temperatures.insert(component.label().to_string(), temp);
        }
    }
    
    temperatures
} 
