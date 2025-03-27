use std::process::{Command, Stdio};
use crate::ports::types::{Port, ProcessInfoCache};
use crate::ports::process::get_process_name;

/// Получение списка открытых сетевых портов на Windows
pub fn get_windows_ports(
    process_cache: &mut ProcessInfoCache,
    detailed_logging: bool
) -> Result<Vec<Port>, String> {
    println!("[Ports] Получение списка открытых портов на Windows");
    
    // Используем cmd.exe с кодировкой CP866 для корректного получения данных
    println!("[Ports] Выполняем команду netstat -ano через cmd...");
    
    // Создаем команду через cmd.exe с установкой правильной кодировки
    let cmd_result = Command::new("cmd")
        .args(["/c", "chcp 65001 > nul && netstat -ano"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    
    // Проверяем результат выполнения команды
    let output = match cmd_result {
        Ok(output) => {
            if output.status.success() {
                println!("[Ports] Команда netstat выполнена успешно");
                output
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("[Ports] Ошибка выполнения netstat через cmd: {} (код: {:?})", 
                    stderr, output.status.code());
                
                // Пробуем выполнить через PowerShell с UTF-8
                println!("[Ports] Пробуем альтернативный вариант через PowerShell с UTF-8...");
                
                match Command::new("powershell")
                    .args(["-Command", "chcp 65001 | Out-Null; netstat -ano"])
                    .output() 
                {
                    Ok(ps_output) => {
                        if ps_output.status.success() {
                            println!("[Ports] PowerShell команда выполнена успешно");
                            ps_output
                        } else {
                            let ps_stderr = String::from_utf8_lossy(&ps_output.stderr);
                            println!("[Ports] Ошибка выполнения команды через PowerShell: {}", ps_stderr);
                            
                            // Последняя попытка - напрямую через netstat
                            println!("[Ports] Последняя попытка - запуск netstat напрямую");
                            match Command::new("netstat")
                                .args(["-ano"])
                                .output() 
                            {
                                Ok(direct_output) => direct_output,
                                Err(e) => return Err(format!("Все методы выполнения netstat завершились с ошибкой: {}", e))
                            }
                        }
                    },
                    Err(e) => {
                        println!("[Ports] Ошибка запуска PowerShell: {}", e);
                        
                        // Последняя попытка - напрямую через netstat
                        println!("[Ports] Последняя попытка - запуск netstat напрямую");
                        match Command::new("netstat")
                            .args(["-ano"])
                            .output() 
                        {
                            Ok(direct_output) => direct_output,
                            Err(direct_e) => return Err(format!("Все методы выполнения netstat завершились с ошибкой: {} и {}", e, direct_e))
                        }
                    }
                }
            }
        },
        Err(e) => {
            println!("[Ports] Ошибка запуска команды через cmd: {}", e);
            
            // Пробуем альтернативный вариант напрямую
            println!("[Ports] Пробуем запустить netstat напрямую...");
            
            match Command::new("netstat")
                .args(["-ano"])
                .output() 
            {
                Ok(direct_output) => direct_output,
                Err(direct_e) => return Err(format!("Не удалось выполнить netstat ни через cmd, ни напрямую: {} и {}", e, direct_e))
            }
        }
    };
    
    // Продолжаем обработку вывода netstat
    // Сначала попробуем UTF-8, затем CP866
    let stdout = match std::str::from_utf8(&output.stdout) {
        Ok(utf8_str) => utf8_str.to_string(),
        Err(_) => {
            println!("[Ports] Не удалось декодировать UTF-8, пробуем Windows-1251...");
            
            // Попытка декодировать Windows-1251 (CP1251)
            match encoding_rs::Encoding::for_label("windows-1251".as_bytes()) {
                Some(encoding) => {
                    let (cow, _, _) = encoding.decode(&output.stdout);
                    cow.into_owned()
                },
                None => {
                    // Если не удалось найти кодировку, используем lossy-декодирование
                    println!("[Ports] Не удалось найти кодировку, используем lossy UTF-8");
                    String::from_utf8_lossy(&output.stdout).to_string()
                }
            }
        }
    };
    
    let lines: Vec<&str> = stdout.lines().collect();
    
    println!("[Ports] Получено {} строк от netstat", lines.len());
    
    // Логируем первые 5 строк для отладки
    for (i, line) in lines.iter().take(5).enumerate() {
        println!("[Ports] Строка {}: '{}'", i, line);
    }
    
    let mut ports = Vec::new();
    let mut processed_lines = 0;
    
    // Ищем строку с заголовком таблицы, чтобы определить, с какой строки начинать обработку
    let mut header_line_index = 0;
    for (i, line) in lines.iter().enumerate() {
        if line.contains("PID") && (line.contains("Proto") || line.contains("Протокол") || 
                                   line.contains("TCP") || line.contains("UDP")) {
            header_line_index = i;
            println!("[Ports] Найден заголовок таблицы в строке {}: '{}'", i, line);
            break;
        }
    }
    
    // Пропускаем заголовок и пустые строки
    for line in lines.iter().skip(header_line_index + 1) {
        processed_lines += 1;
        
        // Ограничиваем количество обрабатываемых строк для снижения нагрузки
        if processed_lines > 5000 {
            println!("[Ports] Достигнут лимит обработанных строк (5000), прерываем");
            break;
        }
        
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        
        // Формат строки netstat:
        // Proto  Local Address          Foreign Address        State           PID
        // TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1256
        
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 4 {  // Изменено с 5 на 4 для поддержки UDP
            let protocol = parts[0].to_string();
            
            // Пропускаем строки, которые не начинаются с TCP или UDP
            if protocol != "TCP" && protocol != "UDP" {
                continue;
            }
            
            // Проверяем, достаточно ли частей для TCP или UDP
            if (protocol == "TCP" && parts.len() < 5) || (protocol == "UDP" && parts.len() < 4) {
                continue;
            }
            
            let local_addr = parts[1].to_string();
            let foreign_addr = parts[2].to_string();
            
            // Получаем состояние и PID в зависимости от протокола
            let (state, pid) = if protocol == "TCP" {
                (parts[3].to_string(), parts[4].to_string())
            } else {
                // Для UDP состояние отсутствует - используем пустую строку
                (String::new(), parts[3].to_string())
            };
            
            // Получаем имя процесса из кэша или запрашиваем новое
            let (process_name, process_path) = if pid == "0" || pid == "4" {
                (String::from("System"), String::from("Windows System"))
            } else {
                get_process_name(&pid, process_cache)
            };
            
            // Создаем структуру Port
            let port = Port {
                protocol,
                local_addr,
                foreign_addr,
                state,
                pid,
                name: process_name,
                path: process_path,
            };
            
            println!("[Ports] Создан порт: {} -> {} ({}) [PID: {}, Имя: {}]", 
                port.local_addr, port.foreign_addr, port.state, 
                port.pid, port.name);
            
            ports.push(port);
        }
    }
    
    // Всегда выводим количество найденных портов
    println!("[Ports] Найдено {} портов (обработано {} строк)", ports.len(), processed_lines);
    
    if detailed_logging || ports.len() < 5 {
        // Показываем примеры обработанных портов
        for (i, port) in ports.iter().take(5).enumerate() {
            println!("[Ports] Пример порта {}: {} - {} -> {} ({}) [PID: {}, Процесс: {}]", 
                i+1, port.protocol, port.local_addr, port.foreign_addr, port.state, 
                port.pid, port.name);
        }
    }
    
    Ok(ports)
} 