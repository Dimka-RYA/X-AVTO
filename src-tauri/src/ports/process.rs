use std::process::Command;

use crate::ports::types::ProcessInfoCache;

/// Получить имя процесса и путь к исполняемому файлу по PID
pub fn get_process_name(
    pid: &str,
    process_cache: &mut ProcessInfoCache
) -> (String, String) {
    // Для быстродействия используем статический кэш имен процессов
    if let Some(cached_info) = process_cache.get(pid) {
        return cached_info.clone();
    }
    
    // Значения по умолчанию
    let mut process_name = "Unknown".to_string();
    let mut process_path = String::new();
    
    // Если PID это "0" или "4", то это системный процесс
    if pid == "0" || pid == "4" {
        process_name = "System Idle Process".to_string();
        process_path = "Windows System".to_string();
        process_cache.insert(pid.to_string(), (process_name.clone(), process_path.clone()));
        return (process_name, process_path);
    }
    
    // Получение имени процесса зависит от платформы
    if cfg!(target_os = "windows") {
        // На Windows можно использовать tasklist или PowerShell
        // Сначала пробуем быстрый вариант через tasklist
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV"])
            .output();
            
        if let Ok(output) = output {
            let output_str = String::from_utf8_lossy(&output.stdout);
            // Формат вывода tasklist: "Image Name","PID","Session Name","Session#","Mem Usage"
            for line in output_str.lines().skip(1) { // пропускаем заголовок
                if let Some(index) = line.find(',') {
                    let name = line[1..index-1].to_string(); // отсекаем кавычки
                    process_name = name;
                    break;
                }
            }
        }
        
        // Затем пробуем получить путь через PowerShell (более медленный, но подробный метод)
        let output = Command::new("powershell")
            .args(["-Command", &format!("Get-Process -Id {} | Select-Object Path", pid)])
            .output();
            
        if let Ok(output) = output {
            let output_str = String::from_utf8_lossy(&output.stdout);
            for line in output_str.lines() {
                let line = line.trim();
                if !line.is_empty() && !line.contains("Path") && !line.contains("----") {
                    process_path = line.to_string();
                    break;
                }
            }
        }
    } else {
        // На Unix системах используем ps
        let output = Command::new("ps")
            .args(["-p", pid, "-o", "comm="])
            .output();
            
        if let Ok(output) = output {
            let output_str = String::from_utf8_lossy(&output.stdout);
            process_name = output_str.trim().to_string();
        }
        
        // Получение пути на Unix
        let output = Command::new("readlink")
            .args(["-f", &format!("/proc/{}/exe", pid)])
            .output();
            
        if let Ok(output) = output {
            let output_str = String::from_utf8_lossy(&output.stdout);
            process_path = output_str.trim().to_string();
        }
    }
    
    // Если имя процесса не найдено, используем PID
    if process_name.is_empty() {
        process_name = format!("PID:{}", pid);
    }
    
    // Кэшируем результат
    process_cache.insert(pid.to_string(), (process_name.clone(), process_path.clone()));
    
    (process_name, process_path)
} 