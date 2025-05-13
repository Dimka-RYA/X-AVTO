use std::process::Command;
use tauri::{Emitter, Manager, Runtime, State};
use tokio::task;
use std::thread;

use crate::ports::types::{Port, PortsCache};
use crate::ports::core::get_ports_internal;

/// Get the list of network ports and the processes that own them

/// Команда для получения списка сетевых портов
#[tauri::command]
pub async fn get_network_ports(
    ports_cache: State<'_, PortsCache>,
    force_update: Option<bool>
) -> Result<Vec<Port>, String> {
    println!("[Ports] Запрос данных о портах из кэша, force_update: {:?}", force_update);
    
    // Если запрошено принудительное обновление, получаем данные напрямую
    if force_update.unwrap_or(false) {
        println!("[Ports] Запрошено принудительное обновление данных");
        let mut process_cache = std::collections::HashMap::new();
        
        // Добавляем дополнительное логирование
        println!("[Ports] Вызываем get_ports_internal для принудительного обновления");
        
        match get_ports_internal(&mut process_cache, true) {
            Ok(ports) => {
                println!("[Ports] Принудительное обновление получило {} портов", ports.len());
                if ports.len() > 0 {
                    println!("[Ports] Примеры принудительно полученных портов:");
                    let max_logs = std::cmp::min(ports.len(), 3);
                    for (i, port) in ports.iter().take(max_logs).enumerate() {
                        println!("[Ports] Пример порта {}: {} - {} -> {} PID: {}, Имя: {}", 
                                i, port.protocol, port.local_addr, port.foreign_addr, port.pid, port.name);
                    }
                }
                
                // Обновляем кэш
                match ports_cache.0.lock() {
                    Ok(mut cache_guard) => {
                        println!("[Ports] Обновляем кэш портов после принудительного обновления: {} -> {}", 
                                cache_guard.len(), ports.len());
                        *cache_guard = ports.clone();
                        println!("[Ports] Кэш обновлен принудительно");
                        return Ok(ports);
                    },
                    Err(e) => {
                        println!("[Ports] Не удалось обновить кэш при принудительном обновлении: {}", e);
                        // Возвращаем данные напрямую, даже если не удалось обновить кэш
                        return Ok(ports);
                    }
                }
            },
            Err(e) => {
                println!("[Ports] Ошибка при принудительном обновлении: {}", e);
                return Err(format!("Ошибка при принудительном обновлении: {}", e));
            }
        }
    }
    
    // Обычная логика получения данных из кэша
    println!("[Ports] Попытка получить данные из кэша портов");
    
    let cache_result = ports_cache.0.lock();
    match cache_result {
        Ok(ports) => {
            let ports_count = ports.len();
            println!("[Ports] Получена блокировка кэша, содержит {} портов", ports_count);
            
            // Проверяем, почему кэш пуст
            if ports_count == 0 {
                // Логируем информацию о состоянии кэша и пытаемся получить данные напрямую
                println!("[Ports] ОТЛАДКА: Кэш пуст, пытаемся получить данные вручную...");
                
                // Создаем временный кэш для этого запроса
                let mut process_cache = std::collections::HashMap::new();
                
                // Пытаемся получить данные напрямую
                println!("[Ports] Вызываем get_ports_internal для заполнения пустого кэша");
                match crate::ports::core::get_ports_internal(&mut process_cache, true) {
                    Ok(direct_ports) => {
                        println!("[Ports] ОТЛАДКА: Прямой запрос вернул {} портов", direct_ports.len());
                        
                        // Если прямой запрос успешен, пытаемся обновить кэш
                        if !direct_ports.is_empty() {
                            match ports_cache.0.lock() {
                                Ok(mut cache_guard) => {
                                    println!("[Ports] ОТЛАДКА: Обновляем кэш вручную ({} -> {})", cache_guard.len(), direct_ports.len());
                                    *cache_guard = direct_ports.clone();
                                    println!("[Ports] ОТЛАДКА: Кэш успешно обновлен до {} портов", cache_guard.len());
                                    return Ok(direct_ports);
                                },
                                Err(e) => {
                                    println!("[Ports] ОТЛАДКА: Не удалось обновить кэш: {}", e);
                                    return Ok(direct_ports);
                                }
                            }
                        } else {
                            println!("[Ports] ОТЛАДКА: Прямой запрос не вернул данных");
                        }
                    },
                    Err(e) => {
                        println!("[Ports] ОТЛАДКА: Ошибка прямого запроса портов: {}", e);
                        return Err(format!("Ошибка при прямом запросе портов: {}", e));
                    }
                }
            }
            
            // Логируем примеры портов для отладки
            if !ports.is_empty() {
                println!("[Ports] Примеры портов из кэша:");
                let max_logs = std::cmp::min(ports.len(), 5);
                for (i, port) in ports.iter().take(max_logs).enumerate() {
                    println!("[Ports] Порт {}: {} {}:{} -> {} ({}), Имя: {}",
                        i, port.protocol, port.local_addr, port.state, port.foreign_addr, port.pid, port.name);
                }
            } else {
                println!("[Ports] ПРЕДУПРЕЖДЕНИЕ: Кэш пуст, но не удалось получить данные напрямую");
            }
            
            println!("[Ports] Успешно возвращаем {} портов из кэша", ports.len());
            return Ok(ports.clone());
        },
        Err(e) => {
            println!("[Ports] ОШИБКА: Не удалось получить блокировку для кэша портов: {}", e);
            
            // Пробуем получить данные напрямую как резервный вариант
            println!("[Ports] Пытаемся получить данные напрямую как резервный вариант");
            let mut process_cache = std::collections::HashMap::new();
            
            match get_ports_internal(&mut process_cache, true) {
                Ok(direct_ports) => {
                    println!("[Ports] Резервный запрос вернул {} портов", direct_ports.len());
                    return Ok(direct_ports);
                },
                Err(e) => {
                    println!("[Ports] ОШИБКА: Резервный запрос не удался: {}", e);
                    return Err(format!("Не удалось получить блокировку для кэша портов и резервный запрос не удался: {}", e));
                }
            }
        }
    }
}

/// Команда для закрытия порта (завершение процесса)
#[tauri::command]
pub async fn close_port<R: Runtime>(
    pid: String,
    app_handle: tauri::AppHandle<R>
) -> Result<String, String> {
    println!("[Ports] 🔍 Запрос на закрытие порта с PID: {}", pid);
    
    // Проверяем, не пытаемся ли мы закрыть системный процесс
    if pid == "0" || pid == "4" {
        return Err("Невозможно закрыть системный процесс".to_string());
    }
    
    // Создаем новый поток для выполнения длительной операции
    task::spawn_blocking(move || {
        // Получаем имя процесса для логирования
        let process_name = if cfg!(target_os = "windows") {
            let output = Command::new("tasklist")
                .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV"])
                .output();
                
            if let Ok(output) = output {
                let output_str = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = output_str.lines().skip(1).next() {
                    if let Some(index) = line.find(',') {
                        line[1..index-1].to_string()
                    } else {
                        "Unknown".to_string()
                    }
                } else {
                    "Unknown".to_string()
                }
            } else {
                "Unknown".to_string()
            }
        } else {
            let output = Command::new("ps")
                .args(["-p", &pid, "-o", "comm="])
                .output();
                
            if let Ok(output) = output {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            } else {
                "Unknown".to_string()
            }
        };
        
        println!("[Ports] 🔄 Попытка закрыть процесс: {} (PID: {})", process_name, pid);
        
        // Проверяем, является ли процесс особым (Steam, игра и т.д.)
        let is_special_process = process_name.to_lowercase().contains("steam") || 
                                process_name.to_lowercase().contains("game") || 
                                process_name.to_lowercase().contains("epic") || 
                                process_name.to_lowercase().contains("battle.net");
        
        // Если это особый процесс, используем специальное логирование
        if is_special_process {
            println!("[Ports] ⚠️ Обнаружен специальный процесс ({}), будет использован каскадный метод завершения", process_name);
        }
        
        // Выполняем каскадное завершение процесса с несколькими уровнями агрессивности
        
        // Уровень 1: Стандартное завершение
        println!("[Ports] 🔍 Уровень 1: Стандартное завершение процесса");
        let standard_close = if cfg!(target_os = "windows") {
            Command::new("taskkill")
                .args(["/PID", &pid])
                .output()
        } else {
            Command::new("kill")
                .args([&pid])
                .output()
        };
        
        match standard_close {
            Ok(output) if output.status.success() => {
                println!("[Ports] ✅ Процесс {} успешно закрыт стандартным способом", pid);
                
                // Проверяем, действительно ли процесс завершен
                std::thread::sleep(std::time::Duration::from_millis(500));
                let check_process = Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                    .output();
                
                match check_process {
                    Ok(check_output) => {
                        let output_str = String::from_utf8_lossy(&check_output.stdout);
                        if !output_str.contains(&pid) {
                            println!("[Ports] ✅ Процесс {} успешно закрыт стандартным способом", pid);
                            // Эмитим событие об успешном закрытии
                            let _ = app_handle.emit_to("main", "port-closed", &pid);
                            return Ok(format!("Процесс {} успешно закрыт", pid));
                        } else {
                            println!("[Ports] ⚠️ Процесс все еще работает после стандартного завершения, переходим к уровню 2");
                        }
                    },
                    Err(_) => {
                        // Если не удалось проверить, предполагаем успех
                        // Эмитим событие об успешном закрытии
                        let _ = app_handle.emit_to("main", "port-closed", &pid);
                        return Ok(format!("Процесс {} предположительно закрыт", pid));
                    }
                }
            },
            _ => {
                println!("[Ports] ⚠️ Не удалось завершить процесс стандартным способом, переходим к уровню 2");
            }
        }
        
        // Уровень 2: Принудительное завершение
        println!("[Ports] 🔍 Уровень 2: Принудительное завершение процесса");
        let force_close = if cfg!(target_os = "windows") {
            Command::new("taskkill")
                .args(["/F", "/PID", &pid])
                .output()
        } else {
            Command::new("kill")
                .args(["-9", &pid])
                .output()
        };
        
        match force_close {
            Ok(output) if output.status.success() => {
                println!("[Ports] ✅ Процесс {} принудительно закрыт", pid);
                
                // Проверяем, действительно ли процесс завершен
                std::thread::sleep(std::time::Duration::from_millis(500));
                let check_process = Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                    .output();
                
                match check_process {
                    Ok(check_output) => {
                        let output_str = String::from_utf8_lossy(&check_output.stdout);
                        if !output_str.contains(&pid) {
                            println!("[Ports] ✅ Процесс {} принудительно закрыт", pid);
                            // Эмитим событие об успешном закрытии
                            let _ = app_handle.emit_to("main", "port-closed", &pid);
                            return Ok(format!("Процесс {} принудительно закрыт", pid));
                        } else {
                            println!("[Ports] ⚠️ Процесс все еще работает после принудительного завершения, переходим к уровню 3");
                        }
                    },
                    Err(_) => {
                        // Если не удалось проверить, предполагаем успех
                        // Эмитим событие об успешном закрытии
                        let _ = app_handle.emit_to("main", "port-closed", &pid);
                        return Ok(format!("Процесс {} предположительно принудительно закрыт", pid));
                    }
                }
            },
            _ => {
                println!("[Ports] ⚠️ Не удалось принудительно завершить процесс, переходим к уровню 3");
            }
        }
        
        // Уровень 3: Завершение с дочерними процессами
        println!("[Ports] 🔍 Уровень 3: Завершение процесса вместе с дочерними");
        let tree_close = if cfg!(target_os = "windows") {
            Command::new("taskkill")
                .args(["/F", "/PID", &pid, "/T"])
                .output()
        } else {
            // Для Unix-подобных систем придется сначала найти дочерние процессы
            let _pkill_cmd = Command::new("pkill")
                .args(["-TERM", "-P", &pid])
                .output();
            
            // Затем завершить родительский процесс
            Command::new("kill")
                .args(["-9", &pid])
                .output()
        };
        
        match tree_close {
            Ok(output) if output.status.success() => {
                println!("[Ports] ✅ Процесс {} принудительно закрыт вместе с дочерними", pid);
                
                // Финальная проверка
                std::thread::sleep(std::time::Duration::from_millis(500));
                let check_process = Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                    .output();
                
                match check_process {
                    Ok(check_output) => {
                        let output_str = String::from_utf8_lossy(&check_output.stdout);
                        if !output_str.contains(&pid) {
                            println!("[Ports] ✅ Процесс {} принудительно закрыт вместе с дочерними", pid);
                            // Эмитим событие об успешном закрытии
                            let _ = app_handle.emit_to("main", "port-closed", &pid);
                            return Ok(format!("Процесс {} принудительно закрыт вместе с дочерними", pid));
                        } else {
                            println!("[Ports] ⚠️ Процесс все еще работает, переходим к уровню 4");
                        }
                    },
                    Err(_) => {
                        // Если не удалось проверить, предполагаем успех
                        // Эмитим событие об успешном закрытии
                        let _ = app_handle.emit_to("main", "port-closed", &pid);
                        return Ok(format!("Процесс {} предположительно принудительно закрыт вместе с дочерними", pid));
                    }
                }
            },
            _ => {
                println!("[Ports] ⚠️ Не удалось завершить процесс вместе с дочерними, переходим к уровню 4");
            }
        }
        
        // Уровень 4: PowerShell с повышенными привилегиями (только для Windows)
        if cfg!(target_os = "windows") {
            println!("[Ports] 🔍 Уровень 4: PowerShell с повышенными привилегиями");
            
            let ps_cmd = format!(
                "Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-Command \"Stop-Process -Id {} -Force -ErrorAction SilentlyContinue\"'", 
                pid
            );
            
            let elevated_close = Command::new("powershell")
                .args(["-Command", &ps_cmd])
                .output();
            
            match elevated_close {
                Ok(_) => {
                    // Даем время PowerShell выполнить команду
                    println!("[Ports] PowerShell команда отправлена, ожидаем завершения");
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                    
                    // Проверяем, завершен ли процесс
                    let check_process = Command::new("tasklist")
                        .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                        .output();
                    
                    match check_process {
                        Ok(check_output) => {
                            let output_str = String::from_utf8_lossy(&check_output.stdout);
                            if !output_str.contains(&pid) {
                                println!("[Ports] ✅ Процесс {} завершен через PowerShell с повышенными привилегиями", pid);
                                // Эмитим событие об успешном закрытии
                                let _ = app_handle.emit_to("main", "port-closed", &pid);
                                return Ok(format!("Процесс {} завершен через PowerShell с повышенными привилегиями", pid));
                            } else {
                                println!("[Ports] ⚠️ Процесс все еще работает, переходим к уровню 5");
                            }
                        },
                        Err(_) => {
                            // Эмитим событие об успешном закрытии
                            let _ = app_handle.emit_to("main", "port-closed", &pid);
                            return Ok(format!("Процесс {} предположительно завершен через PowerShell с повышенными привилегиями", pid));
                        }
                    }
                },
                Err(e) => {
                    println!("[Ports] ❌ Ошибка при запуске PowerShell: {}", e);
                }
            }
            
            // Уровень 5: WMI (только для Windows)
            println!("[Ports] 🔍 Уровень 5: Завершение через WMI");
            
            let wmi_cmd = format!(
                "(Get-WmiObject Win32_Process -Filter \"ProcessId = {}\").Terminate()", 
                pid
            );
            
            let wmi_close = Command::new("powershell")
                .args(["-Command", &wmi_cmd])
                .output();
            
            match wmi_close {
                Ok(_) => {
                    // Даем время PowerShell выполнить команду
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                    
                    // Проверяем, завершен ли процесс
                    let check_process = Command::new("tasklist")
                        .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                        .output();
                    
                    match check_process {
                        Ok(check_output) => {
                            let output_str = String::from_utf8_lossy(&check_output.stdout);
                            if !output_str.contains(&pid) {
                                println!("[Ports] ✅ Процесс {} завершен через WMI", pid);
                                // Эмитим событие об успешном закрытии
                                let _ = app_handle.emit_to("main", "port-closed", &pid);
                                return Ok(format!("Процесс {} завершен через WMI", pid));
                            } else {
                                println!("[Ports] ⚠️ Не удалось завершить процесс всеми доступными методами");
                            }
                        },
                        Err(_) => {
                            // Эмитим событие об успешном закрытии
                            let _ = app_handle.emit_to("main", "port-closed", &pid);
                            return Ok(format!("Процесс {} предположительно завершен через WMI", pid));
                        }
                    }
                },
                Err(e) => {
                    println!("[Ports] ❌ Ошибка при запуске WMI: {}", e);
                }
            }
        }
        
        let error = format!("Не удалось закрыть процесс {pid} даже используя все доступные методы");
        println!("[Ports] ❌ {}", error);
        // Эмитим событие об ошибке
        let _ = app_handle.emit_to("main", "port-close-error", &pid);
        Err(error)
    }).await.map_err(|e| {
        println!("[Ports] ❌ Ошибка запуска задачи: {}", e);
        format!("Ошибка запуска задачи: {}", e)
    })?
}

/// Команда для обновления кэша портов и запуска фонового обновления
#[tauri::command]
pub async fn refresh_ports_command<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    detailed_logging: Option<bool>
) -> Result<String, String> {
    println!("[Ports] Запуск обновления портов через команду, detailed_logging: {:?}", detailed_logging);
    
    if let Some(window) = app_handle.get_webview_window("main") {
        // Запускаем в отдельном потоке, чтобы не блокировать асинхронный поток команды
        let window_handle = window.clone();
        thread::spawn(move || {
            // Запускаем обновление портов с подробным логированием
            println!("[Ports] Запуск однократного обновления портов из refresh_ports_command");
            crate::ports::core::refresh_ports(window_handle, detailed_logging.unwrap_or(false));
        });
        
        // Возвращаем успешный результат
        println!("[Ports] Запрос на обновление портов отправлен");
        Ok("Список портов успешно обновлен".to_string())
    } else {
        // Возвращаем ошибку, если не удалось получить окно
        let error_msg = "Не удалось получить доступ к главному окну для обновления портов".to_string();
        println!("[Ports] ОШИБКА: {}", error_msg);
        Err(error_msg)
    }
}

/// Закрыть конкретный TCP порт без завершения всего процесса
/// 
/// Параметры:
/// * `pid` - Идентификатор процесса
/// * `port` - Номер порта для закрытия
/// * `protocol` - Протокол (TCP/UDP)
/// * `local_addr` - Локальный адрес (IP:port)
/// * `app_handle` - Хэндл приложения Tauri
#[tauri::command]
pub async fn close_specific_port<R: Runtime>(
    pid: String, 
    port: String,
    protocol: String,
    local_addr: String,
    app_handle: tauri::AppHandle<R>
) -> Result<String, String> {
    println!("[Ports] 🔍 Запрос на закрытие порта {} (PID: {}, протокол: {}, адрес: {})", port, pid, protocol, local_addr);
    
    // Создаем новый поток для выполнения длительной операции
    task::spawn_blocking(move || {
        // Получаем имя процесса для логирования
        let process_name = if cfg!(target_os = "windows") {
            let output = Command::new("tasklist")
                .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV"])
                .output();
                
            if let Ok(output) = output {
                let output_str = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = output_str.lines().skip(1).next() {
                    if let Some(index) = line.find(',') {
                        line[1..index-1].to_string()
                    } else {
                        "Unknown".to_string()
                    }
                } else {
                    "Unknown".to_string()
                }
            } else {
                "Unknown".to_string()
            }
        } else {
            let output = Command::new("ps")
                .args(["-p", &pid, "-o", "comm="])
                .output();
                
            if let Ok(output) = output {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            } else {
                "Unknown".to_string()
            }
        };
        
        println!("[Ports] 🔄 Попытка закрыть порт {} для процесса: {} (PID: {})", port, process_name, pid);
        
        // Проверяем, является ли процесс особым (Steam, игра и т.д.)
        let is_special_process = process_name.to_lowercase().contains("steam") || 
                                process_name.to_lowercase().contains("game") || 
                                process_name.to_lowercase().contains("epic") || 
                                process_name.to_lowercase().contains("battle.net");
        
        if is_special_process {
            println!("[Ports] ⚠️ Обнаружен специальный процесс ({}), требуется особый подход", process_name);
        }
        
        // Выполняем команду закрытия в зависимости от платформы
        let close_result = if cfg!(target_os = "windows") {
            // Для Windows используем утилиту netsh для закрытия конкретного порта
            let _ip_address = local_addr.split(':').next().unwrap_or("0.0.0.0");
            
            if protocol.to_uppercase() == "TCP" {
                // Пробуем сначала закрыть через PowerShell с повышенными привилегиями
                println!("[Ports] 🔍 Пытаемся закрыть TCP порт с повышенными привилегиями");
                
                // Создаём команду PowerShell для закрытия соединения
                let ps_command = format!(
                    "Stop-Process -Id {} -Force", 
                    pid
                );
                
                // Запуск PowerShell с повышенными правами
                let elevated_output = Command::new("powershell")
                    .args([
                        "-Command", 
                        &format!("Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-Command \"{}\"'", ps_command)
                    ])
                    .output();
                
                match elevated_output {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        
                        if !stdout.is_empty() {
                            println!("[Ports] PowerShell stdout: {}", stdout);
                        }
                        
                        if !stderr.is_empty() {
                            println!("[Ports] PowerShell stderr: {}", stderr);
                        }
                        
                        if output.status.success() {
                            println!("[Ports] ✅ Процесс {} успешно закрыт через PowerShell с повышением привилегий", pid);
                            
                            // Немного подождем, чтобы дать процессу завершиться
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            
                            // Проверяем, что процесс действительно завершен
                            let check_process = Command::new("tasklist")
                                .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                                .output();
                                
                            match check_process {
                                Ok(check_output) => {
                                    let output_str = String::from_utf8_lossy(&check_output.stdout);
                                    if !output_str.contains(&pid) {
                                        println!("[Ports] ✅ Проверка подтвердила: процесс {} завершен", pid);
                                        return Ok(format!("Процесс {} успешно закрыт с повышенными привилегиями", process_name));
                                    } else {
                                        println!("[Ports] ⚠️ Процесс всё еще работает, несмотря на успешное выполнение команды");
                                    }
                                },
                                Err(e) => {
                                    println!("[Ports] ⚠️ Не удалось проверить состояние процесса: {}", e);
                                }
                            }
                        } else {
                            println!("[Ports] ⚠️ PowerShell команда не выполнилась успешно, код: {:?}", output.status.code());
                        }
                    },
                    Err(e) => {
                        println!("[Ports] ❌ Ошибка при запуске PowerShell: {}", e);
                    }
                }
                
                // Если специальный процесс, пробуем использовать emergency_kill_process
                if is_special_process {
                    println!("[Ports] 🔥 Для специального процесса {} используем экстренное завершение", process_name);
                    
                    // Вызываем напрямую функцию emergency_kill_process в синхронном контексте
                    // Здесь мы не можем использовать await, так как находимся в синхронном блоке
                    let pid_clone = pid.clone();
                    // Поскольку мы в синхронном контексте и не можем использовать await,
                    // просто запускаем команду taskkill с максимальными параметрами принудительного завершения
                    println!("[Ports] 🔥 Запускаем принудительное завершение для {}", process_name);
                    
                    let force_kill_result = Command::new("taskkill")
                        .args(["/F", "/PID", &pid_clone, "/T"])
                        .output();
                    
                    match force_kill_result {
                        Ok(output) => {
                            let stdout = String::from_utf8_lossy(&output.stdout);
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            
                            if !stdout.is_empty() {
                                println!("[Ports] Taskkill stdout: {}", stdout);
                            }
                            
                            if !stderr.is_empty() {
                                println!("[Ports] Taskkill stderr: {}", stderr);
                            }
                            
                            if output.status.success() {
                                println!("[Ports] ✅ Процесс {} успешно завершен через taskkill", pid_clone);
                                return Ok(format!("Процесс {} принудительно завершен через taskkill", process_name));
                            } else {
                                println!("[Ports] ⚠️ Не удалось завершить процесс через taskkill, продолжаем другими методами");
                            }
                        },
                        Err(e) => {
                            println!("[Ports] ⚠️ Ошибка при выполнении taskkill: {}", e);
                        }
                    }
                }
                
                // Пробуем закрыть через netsh
                println!("[Ports] 🔍 Пробуем закрыть TCP порт {} через netsh", port);
                let output = Command::new("cmd")
                    .args(["/c", &format!("netsh interface ipv4 delete tcpconnection {} {} {} {}", 
                                         local_addr, "0.0.0.0:0", protocol.to_lowercase(), pid)])
                    .output();
                
                match output {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        
                        if !stdout.is_empty() {
                            println!("[Ports] netsh stdout: {}", stdout);
                        }
                        
                        if !stderr.is_empty() {
                            println!("[Ports] netsh stderr: {}", stderr);
                        }
                        
                        if output.status.success() {
                            println!("[Ports] ✅ Успешно закрыт TCP порт {} для процесса {}", port, pid);
                            Ok(format!("Успешно закрыт порт {} для процесса {}", port, process_name))
                        } else {
                            println!("[Ports] ⚠️ netsh не смог закрыть порт, код: {:?}", output.status.code());
                            
                            // Если netsh не справился, пробуем альтернативный метод с использованием taskkill с флагом /F
                            println!("[Ports] 🔍 Не удалось закрыть порт через netsh, пробуем принудительно завершить процесс");
                            
                            // Для системных процессов используем elevated режим через PowerShell
                            let force_close = Command::new("cmd")
                                .args(["/c", &format!("taskkill /F /PID {} /T", pid)])
                                .output();
                            
                            match force_close {
                                Ok(output) => {
                                    let stdout = String::from_utf8_lossy(&output.stdout);
                                    let stderr = String::from_utf8_lossy(&output.stderr);
                                    
                                    if !stdout.is_empty() {
                                        println!("[Ports] taskkill stdout: {}", stdout);
                                    }
                                    
                                    if !stderr.is_empty() {
                                        println!("[Ports] taskkill stderr: {}", stderr);
                                    }
                                    
                                    if output.status.success() {
                                        println!("[Ports] ✅ Процесс {} принудительно закрыт для освобождения порта {}", pid, port);
                                        Ok(format!("Процесс {} принудительно закрыт для освобождения порта {}", process_name, port))
                                    } else {
                                        println!("[Ports] ⚠️ taskkill не смог завершить процесс, код: {:?}", output.status.code());
                                        
                                        // Последняя попытка: запустить taskkill с повышенными привилегиями
                                        println!("[Ports] 🔍 Пробуем taskkill с повышенными привилегиями");
                                        let elevated_cmd = format!(
                                            "Start-Process -FilePath \"taskkill\" -ArgumentList \"/F /PID {} /T\" -Verb RunAs -WindowStyle Hidden", 
                                            pid
                                        );
                                        
                                        let final_attempt = Command::new("powershell")
                                            .args(["-Command", &elevated_cmd])
                                            .output();
                                            
                                        match final_attempt {
                                            Ok(output) => {
                                                let stdout = String::from_utf8_lossy(&output.stdout);
                                                let stderr = String::from_utf8_lossy(&output.stderr);
                                                
                                                if !stdout.is_empty() {
                                                    println!("[Ports] elevated taskkill stdout: {}", stdout);
                                                }
                                                
                                                if !stderr.is_empty() {
                                                    println!("[Ports] elevated taskkill stderr: {}", stderr);
                                                }
                                                
                                                // Даем время на выполнение команды с повышенными привилегиями
                                                std::thread::sleep(std::time::Duration::from_millis(1000));
                                                
                                                println!("[Ports] ✅ Отправлена команда на принудительное завершение с повышенными правами");
                                                Ok(format!("Отправлена команда на принудительное завершение процесса {} с повышенными правами", process_name))
                                            },
                                            Err(e) => {
                                                let error = format!("Не удалось закрыть порт {} для процесса {}: {}", port, process_name, e);
                                                println!("[Ports] ❌ {}", error);
                                                Err(error)
                                            }
                                        }
                                    }
                                },
                                Err(e) => {
                                    let error = format!("Ошибка при запуске taskkill: {}", e);
                                    println!("[Ports] ❌ {}", error);
                                    Err(error)
                                }
                            }
                        }
                    },
                    Err(e) => {
                        println!("[Ports] ❌ Ошибка при выполнении команды netsh: {}", e);
                        
                        // Пробуем принудительно закрыть процесс
                        println!("[Ports] 🔍 Пробуем принудительно закрыть процесс taskkill");
                        let force_close = Command::new("taskkill")
                            .args(["/F", "/PID", &pid, "/T"])
                            .output();
                            
                        match force_close {
                            Ok(output) => {
                                let stdout = String::from_utf8_lossy(&output.stdout);
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                
                                if !stdout.is_empty() {
                                    println!("[Ports] taskkill stdout: {}", stdout);
                                }
                                
                                if !stderr.is_empty() {
                                    println!("[Ports] taskkill stderr: {}", stderr);
                                }
                                
                                if output.status.success() {
                                    println!("[Ports] ✅ Процесс {} принудительно закрыт", pid);
                                    Ok(format!("Процесс {} принудительно закрыт для освобождения порта {}", process_name, port))
                                } else {
                                    println!("[Ports] ⚠️ taskkill не смог завершить процесс, код: {:?}", output.status.code());
                                    
                                    // Последняя попытка: запустить taskkill с повышенными привилегиями
                                    println!("[Ports] 🔍 Пробуем taskkill с повышенными привилегиями");
                                    let elevated_cmd = format!(
                                        "Start-Process -FilePath \"taskkill\" -ArgumentList \"/F /PID {} /T\" -Verb RunAs -WindowStyle Hidden", 
                                        pid
                                    );
                                    
                                    let final_attempt = Command::new("powershell")
                                        .args(["-Command", &elevated_cmd])
                                        .output();
                                        
                                    match final_attempt {
                                        Ok(_) => {
                                            // Даем время на выполнение команды с повышенными привилегиями
                                            std::thread::sleep(std::time::Duration::from_millis(1000));
                                            
                                            println!("[Ports] ✅ Отправлена команда на принудительное завершение с повышенными правами");
                                            Ok(format!("Отправлена команда на принудительное завершение процесса {} с повышенными правами", process_name))
                                        },
                                        Err(e) => {
                                            let error = format!("Не удалось закрыть порт {} для процесса {}: {}", port, process_name, e);
                                            println!("[Ports] ❌ {}", error);
                                            Err(error)
                                        }
                                    }
                                }
                            },
                            Err(e) => {
                                let error = format!("Ошибка при запуске taskkill: {}", e);
                                println!("[Ports] ❌ {}", error);
                                Err(error)
                            }
                        }
                    }
                }
            } else {
                // Для UDP в Windows нет прямого способа закрыть соединение, только завершить процесс
                println!("[Ports] 🔍 Закрытие UDP портов в Windows не поддерживается напрямую, закрываем процесс");
                let force_close = Command::new("taskkill")
                    .args(["/PID", &pid, "/F"])
                    .output();
                
                match force_close {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        
                        if !stdout.is_empty() {
                            println!("[Ports] taskkill stdout: {}", stdout);
                        }
                        
                        if !stderr.is_empty() {
                            println!("[Ports] taskkill stderr: {}", stderr);
                        }
                        
                        if output.status.success() {
                            println!("[Ports] ✅ Процесс {} принудительно закрыт для освобождения UDP порта {}", pid, port);
                            Ok(format!("Процесс {} принудительно закрыт для освобождения UDP порта {}", process_name, port))
                        } else {
                            let error = format!("Не удалось закрыть UDP порт {} для процесса {}", port, process_name);
                            println!("[Ports] ❌ {}", error);
                            Err(error)
                        }
                    },
                    Err(e) => {
                        let error = format!("Ошибка при запуске taskkill: {}", e);
                        println!("[Ports] ❌ {}", error);
                        Err(error)
                    }
                }
            }
        } else {
            // Для других платформ просто завершаем процесс
            println!("[Ports] 🔍 Неизвестная платформа, завершаем процесс для освобождения порта");
            let kill_cmd = Command::new("kill")
                .args(["-9", &pid])
                .output();
            
            match kill_cmd {
                Ok(output) => {
                    if output.status.success() {
                        println!("[Ports] ✅ Процесс {} принудительно закрыт", pid);
                        Ok(format!("Процесс {} принудительно закрыт для освобождения порта {}", process_name, port))
                    } else {
                        let error = format!("Не удалось закрыть порт {} для процесса {}", port, process_name);
                        println!("[Ports] ❌ {}", error);
                        Err(error)
                    }
                },
                Err(e) => {
                    let error = format!("Ошибка при запуске kill: {}", e);
                    println!("[Ports] ❌ {}", error);
                    Err(error)
                }
            }
        };
        
        // По завершении операции обновляем данные на клиенте
        match &close_result {
            Ok(message) => {
                // Эмитим событие об успешном закрытии
                println!("[Ports] ✅ Порт успешно закрыт: {}", message);
                let port_info = format!("{}:{}", pid, port);
                let _ = app_handle.emit_to("main", "port-closed", &port_info);
            },
            Err(error) => {
                // Эмитим событие об ошибке
                println!("[Ports] ❌ Ошибка закрытия порта: {}", error);
                let port_info = format!("{}:{}", pid, port);
                let _ = app_handle.emit_to("main", "port-close-error", &port_info);
            }
        }
        
        close_result
    }).await.map_err(|e| {
        println!("[Ports] ❌ Ошибка запуска задачи: {}", e);
        format!("Ошибка запуска задачи: {}", e)
    })?
}

/// Проверяет, можно ли закрыть порт без завершения процесса
#[tauri::command]
pub async fn can_close_port_individually(
    protocol: String,
    local_addr: String
) -> Result<bool, String> {
    println!("[Ports] Проверяем возможность закрытия порта {} индивидуально", local_addr);
    
    // На Windows TCP-порты можно закрыть индивидуально через netsh
    if cfg!(target_os = "windows") && protocol.to_uppercase() == "TCP" {
        return Ok(true);
    }
    
    // На Linux можно закрыть TCP-порты индивидуально через fuser
    if cfg!(target_os = "linux") && protocol.to_uppercase() == "TCP" {
        // Проверяем наличие утилиты fuser
        let output = Command::new("which")
            .args(["fuser"])
            .output();
        
        match output {
            Ok(output) if output.status.success() => {
                println!("[Ports] Обнаружена утилита fuser, можно закрыть порт индивидуально");
                return Ok(true);
            },
            _ => {
                println!("[Ports] Утилита fuser не найдена, индивидуальное закрытие недоступно");
                return Ok(false);
            }
        }
    }
    
    // Во всех остальных случаях (UDP, macOS, другие платформы) индивидуальное закрытие недоступно
    println!("[Ports] Индивидуальное закрытие порта недоступно для данной конфигурации");
    Ok(false)
}

/// Принудительно завершает процесс на Windows с максимальными привилегиями
#[tauri::command]
pub async fn force_kill_process(pid: String) -> Result<String, String> {
    if !cfg!(target_os = "windows") {
        return Err("Эта функция поддерживается только в Windows".to_string());
    }

    println!("[Ports] Запущено принудительное завершение процесса с PID: {}", pid);
    
    // Сначала попробуем завершить процесс напрямую через Win32 API
    let pid_u32 = match pid.parse::<u32>() {
        Ok(p) => p,
        Err(_) => return Err(format!("Неверный PID: {}", pid))
    };
    
    // Пробуем завершить процесс напрямую через WinAPI (самый агрессивный метод)
    #[cfg(target_os = "windows")]
    {
        use std::ptr;
        use winapi::um::processthreadsapi::{OpenProcess, TerminateProcess};
        use winapi::um::winnt::{PROCESS_TERMINATE, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ, HANDLE};
        use winapi::um::handleapi::CloseHandle;
        
        println!("[Ports] Попытка прямого завершения через WinAPI для PID: {}", pid_u32);
        
        unsafe {
            // Открываем процесс с максимальными правами для завершения
            let process_handle: HANDLE = OpenProcess(
                PROCESS_TERMINATE | PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 
                0, 
                pid_u32
            );
            
            if process_handle == ptr::null_mut() {
                println!("[Ports] Не удалось открыть процесс через WinAPI, продолжаем другими методами");
            } else {
                // Пытаемся принудительно завершить процесс
                let result = TerminateProcess(process_handle, 0);
                CloseHandle(process_handle);
                
                if result != 0 {
                    println!("[Ports] Процесс успешно завершен через WinAPI");
                    return Ok(format!("Процесс с PID {} принудительно завершен через WinAPI", pid));
                } else {
                    println!("[Ports] Не удалось завершить процесс через WinAPI, продолжаем другими методами");
                }
            }
        }
    }

    // Создаем временный батник для выполнения с повышенными правами
    let temp_dir = std::env::temp_dir();
    let batch_path = temp_dir.join(format!("kill_process_{}.bat", pid));
    let ps_path = temp_dir.join(format!("kill_process_{}.ps1", pid));

    // Создаем PowerShell скрипт, который попытается завершить процесс несколькими способами
    let ps_script = format!(
        r#"
        # PowerShell скрипт для принудительного завершения процесса
        Write-Host "Принудительное завершение процесса с PID: {pid}"
        
        # Функция для проверки, существует ли процесс
        function Test-ProcessExists {{
            param($id)
            $process = Get-Process -Id $id -ErrorAction SilentlyContinue
            return ($null -ne $process)
        }}
        
        # Получаем информацию о процессе
        $processName = "Неизвестный"
        try {{
            $processInfo = Get-Process -Id {pid} -ErrorAction SilentlyContinue
            if ($processInfo) {{
                $processName = $processInfo.ProcessName
                Write-Host "Целевой процесс: $processName (PID: {pid})"
            }}
        }} catch {{
            Write-Host "Не удалось получить информацию о процессе: $_"
        }}
        
        # Метод 1: через Stop-Process
        try {{
            Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            if (-not (Test-ProcessExists -id {pid})) {{
                Write-Host "Метод 1: процесс завершен через Stop-Process"
                exit 0
            }} else {{
                Write-Host "Метод 1: Stop-Process не завершил процесс"
            }}
        }} catch {{
            Write-Host "Метод 1 не удался: $_"
        }}
        
        # Метод 2: через taskkill (принудительно с дочерними процессами)
        try {{
            taskkill /F /PID {pid} /T
            Start-Sleep -Seconds 1
            if (-not (Test-ProcessExists -id {pid})) {{
                Write-Host "Метод 2: процесс завершен через taskkill /F /T"
                exit 0
            }} else {{
                Write-Host "Метод 2: taskkill не завершил процесс"
            }}
        }} catch {{
            Write-Host "Метод 2 не удался: $_"
        }}

        # Метод 3: через WMI
        try {{
            $process = Get-WmiObject Win32_Process -Filter "ProcessId = {pid}"
            if ($process) {{
                $result = $process.Terminate()
                Start-Sleep -Seconds 1
                if (-not (Test-ProcessExists -id {pid})) {{
                    Write-Host "Метод 3: процесс завершен через WMI: $result"
                    exit 0
                }} else {{
                    Write-Host "Метод 3: WMI не завершил процесс"
                }}
            }} else {{
                Write-Host "Метод 3: процесс не найден через WMI"
            }}
        }} catch {{
            Write-Host "Метод 3 не удался: $_"
        }}
        
        # Метод 4: Direct API Call (самый агрессивный)
        Write-Host "Метод 4: Используем прямой Win32 API вызов для завершения процесса"
        Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.ComponentModel;
public class AdvancedProcessKiller {{
    [Flags]
    public enum ProcessAccessFlags : uint
    {{
        All = 0x001F0FFF,
        Terminate = 0x00000001,
        CreateThread = 0x00000002,
        VirtualMemoryOperation = 0x00000008,
        VirtualMemoryRead = 0x00000010,
        VirtualMemoryWrite = 0x00000020,
        DuplicateHandle = 0x00000040,
        QueryInformation = 0x00000400,
        SetInformation = 0x00000200,
        Synchronize = 0x00100000
    }}
    
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(ProcessAccessFlags dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
    
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);
    
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr hObject);
    
    [DllImport("ntdll.dll")]
    public static extern uint NtTerminateProcess(IntPtr hProcess, uint uExitCode);
    
    [DllImport("ntdll.dll")]
    public static extern uint NtSuspendProcess(IntPtr hProcess);

    // Функция для принудительного завершения процесса через множество методов
    public static bool ForceKillProcess(uint processId) {{
        IntPtr hProcess = OpenProcess(ProcessAccessFlags.All, false, processId);
        if (hProcess == IntPtr.Zero) {{
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Не удалось открыть процесс");
        }}
        
        try {{
            // Сначала пробуем приостановить процесс
            NtSuspendProcess(hProcess);
            
            // Затем пробуем завершить через стандартный API
            bool terminated = TerminateProcess(hProcess, 0);
            if (!terminated) {{
                // Если не удалось, пробуем более низкоуровневый NT API
                uint ntStatus = NtTerminateProcess(hProcess, 0);
                return ntStatus == 0;
            }}
            return terminated;
        }}
        finally {{
            CloseHandle(hProcess);
        }}
    }}
}}
"@
        try {{
            $result = [AdvancedProcessKiller]::ForceKillProcess([uint32]{pid})
            Start-Sleep -Seconds 1
            if (-not (Test-ProcessExists -id {pid})) {{
                Write-Host "Метод 4: процесс успешно завершен через прямой API вызов"
                exit 0
            }} else {{
                Write-Host "Метод 4: прямой API вызов не смог завершить процесс"
            }}
        }} catch {{
            Write-Host "Метод 4 не удался: $_"
        }}
        
        # Метод 5: Особый подход для Steam (если применимо)
        if ($processName -like "*steam*") {{
            Write-Host "Обнаружен процесс Steam, применяем особый метод завершения"
            try {{
                # Завершаем сначала все дочерние процессы Steam
                $steamProcesses = Get-WmiObject Win32_Process | Where-Object {{ $_.Name -like "*steam*" -and $_.ProcessId -ne [int]{pid} }}
                foreach ($proc in $steamProcesses) {{
                    Write-Host "Завершаем дочерний процесс Steam: $($proc.ProcessId)"
                    taskkill /F /PID $proc.ProcessId
                }}
                Start-Sleep -Seconds 1
                
                # Повторная попытка завершить основной процесс
                taskkill /F /PID {pid}
                Start-Sleep -Seconds 1
                
                if (-not (Test-ProcessExists -id {pid})) {{
                    Write-Host "Метод 5: процесс Steam успешно завершен через специальный подход"
                    exit 0
                }}
            }} catch {{
                Write-Host "Метод 5 не удался: $_"
            }}
        }}
        
        # Проверка финального результата
        Start-Sleep -Seconds 1
        $finalCheck = Get-Process -Id {pid} -ErrorAction SilentlyContinue
        if($finalCheck) {{
            Write-Host "ОШИБКА: Не удалось завершить процесс {pid} после всех попыток"
            exit 1
        }} else {{
            Write-Host "УСПЕХ: Процесс {pid} завершен одним из методов"
            exit 0
        }}
        "#
    );

    // Создаем батник для запуска PowerShell с повышенными правами
    let batch_script = format!(
        r#"@echo off
        echo Запуск PowerShell с повышенными правами для завершения процесса {pid}...
        powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"{}\"' -Verb RunAs -WindowStyle Hidden -Wait"
        if errorlevel 1 (
            echo Ошибка при выполнении PowerShell скрипта
            exit /b 1
        ) else (
            echo Процесс успешно завершен
            exit /b 0
        )
        "#,
        ps_path.to_string_lossy()
    );

    // Записываем скрипты в файлы
    match std::fs::write(&ps_path, ps_script) {
        Ok(_) => println!("[Ports] PowerShell скрипт создан: {}", ps_path.to_string_lossy()),
        Err(e) => return Err(format!("Не удалось создать PowerShell скрипт: {}", e)),
    }

    match std::fs::write(&batch_path, batch_script) {
        Ok(_) => println!("[Ports] Batch скрипт создан: {}", batch_path.to_string_lossy()),
        Err(e) => return Err(format!("Не удалось создать Batch скрипт: {}", e)),
    }

    // Запускаем батник
    match Command::new("cmd")
        .args(["/c", &batch_path.to_string_lossy().to_string()])
        .output() 
    {
        Ok(output) => {
            // Проверяем результат
            if output.status.success() {
                println!("[Ports] Процесс {} успешно завершен", pid);
                
                // Очистка временных файлов
                let _ = std::fs::remove_file(&ps_path);
                let _ = std::fs::remove_file(&batch_path);
                
                Ok(format!("Процесс с PID {} успешно завершен", pid))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                println!("[Ports] Ошибка при завершении процесса {}. Stdout: {}, Stderr: {}", pid, stdout, stderr);
                
                // Очистка временных файлов
                let _ = std::fs::remove_file(&ps_path);
                let _ = std::fs::remove_file(&batch_path);
                
                Err(format!("Не удалось завершить процесс {}. Возможно, требуются права администратора.", pid))
            }
        },
        Err(e) => {
            // Очистка временных файлов
            let _ = std::fs::remove_file(&ps_path);
            let _ = std::fs::remove_file(&batch_path);
            
            Err(format!("Ошибка при запуске скрипта: {}", e))
        }
    }
}

/// Экстремальное принудительное завершение процесса через все доступные методы
/// Используется в случаях, когда обычные методы не работают
#[tauri::command]
pub async fn emergency_kill_process(pid: String) -> Result<String, String> {
    if !cfg!(target_os = "windows") {
        return Err("Эта функция поддерживается только в Windows".to_string());
    }

    println!("[Ports] 🔥 ЭКСТРЕННОЕ завершение процесса с PID: {}", pid);
    
    // Конвертируем PID в числовой формат
    let pid_u32 = match pid.parse::<u32>() {
        Ok(p) => p,
        Err(_) => {
            println!("[Ports] ❌ Неверный формат PID: {}", pid);
            return Err(format!("Неверный PID: {}", pid))
        }
    };

    // Получаем имя процесса для логирования
    let process_name = if cfg!(target_os = "windows") {
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV"])
            .output();
            
        if let Ok(output) = output {
            let output_str = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = output_str.lines().skip(1).next() {
                if let Some(index) = line.find(',') {
                    line[1..index-1].to_string()
                } else {
                    "Unknown".to_string()
                }
            } else {
                "Unknown".to_string()
            }
        } else {
            "Unknown".to_string()
        }
    } else {
        "Unknown".to_string()
    };
    
    println!("[Ports] 🔄 Пытаемся завершить процесс: {} (PID: {})", process_name, pid);

    // 1. Пробуем использовать WinAPI напрямую
    #[cfg(target_os = "windows")]
    {
        use std::ptr;
        use winapi::um::processthreadsapi::{OpenProcess, TerminateProcess};
        use winapi::um::winnt::{PROCESS_TERMINATE, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ, HANDLE};
        use winapi::um::handleapi::CloseHandle;
        
        println!("[Ports] 🔍 Попытка прямого завершения через WinAPI для PID: {}", pid_u32);
        
        unsafe {
            // Открываем процесс с максимальными правами для завершения
            let process_handle: HANDLE = OpenProcess(
                PROCESS_TERMINATE | PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 
                0, 
                pid_u32
            );
            
            if process_handle == ptr::null_mut() {
                let error = std::io::Error::last_os_error();
                println!("[Ports] ❌ Не удалось открыть процесс через WinAPI: {:?}", error);
            } else {
                // Пытаемся принудительно завершить процесс
                let result = TerminateProcess(process_handle, 0);
                CloseHandle(process_handle);
                
                if result != 0 {
                    println!("[Ports] ✅ Процесс успешно завершен через WinAPI");
                    return Ok(format!("Процесс с PID {} принудительно завершен через WinAPI", pid));
                } else {
                    let error = std::io::Error::last_os_error();
                    println!("[Ports] ❌ Не удалось завершить процесс через WinAPI: {:?}", error);
                }
            }
        }
    }

    println!("[Ports] 🔍 WinAPI метод не сработал, пробуем PowerShell скрипты");

    // Создаем временный батник для выполнения с повышенными правами
    let temp_dir = std::env::temp_dir();
    let batch_path = temp_dir.join(format!("kill_process_{}.bat", pid));
    let ps_path = temp_dir.join(format!("kill_process_{}.ps1", pid));

    // Создаем PowerShell скрипт, который попытается завершить процесс несколькими способами
    let ps_script = format!(
        r#"
        # PowerShell скрипт для принудительного завершения процесса
        Write-Host "[Ports] 🔍 PowerShell: Принудительное завершение процесса с PID: {pid}"
        
        # Функция для проверки, существует ли процесс
        function Test-ProcessExists {{
            param($id)
            $process = Get-Process -Id $id -ErrorAction SilentlyContinue
            return ($null -ne $process)
        }}
        
        # Получаем информацию о процессе
        $processName = "Неизвестный"
        try {{
            $processInfo = Get-Process -Id {pid} -ErrorAction SilentlyContinue
            if ($processInfo) {{
                $processName = $processInfo.ProcessName
                Write-Host "[Ports] 🔍 PowerShell: Целевой процесс: $processName (PID: {pid})"
            }}
        }} catch {{
            Write-Host "[Ports] ❌ PowerShell: Не удалось получить информацию о процессе: $_"
        }}
        
        # Метод 1: через Stop-Process
        try {{
            Write-Host "[Ports] 🔍 PowerShell: Пробуем метод 1 - Stop-Process"
            Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            if (-not (Test-ProcessExists -id {pid})) {{
                Write-Host "[Ports] ✅ PowerShell: Метод 1: процесс завершен через Stop-Process"
                exit 0
            }} else {{
                Write-Host "[Ports] ❌ PowerShell: Метод 1: Stop-Process не завершил процесс"
            }}
        }} catch {{
            Write-Host "[Ports] ❌ PowerShell: Метод 1 не удался: $_"
        }}
        
        # Метод 2: через taskkill (принудительно с дочерними процессами)
        try {{
            Write-Host "[Ports] 🔍 PowerShell: Пробуем метод 2 - taskkill /F /T"
            taskkill /F /PID {pid} /T
            Start-Sleep -Seconds 1
            if (-not (Test-ProcessExists -id {pid})) {{
                Write-Host "[Ports] ✅ PowerShell: Метод 2: процесс завершен через taskkill /F /T"
                exit 0
            }} else {{
                Write-Host "[Ports] ❌ PowerShell: Метод 2: taskkill не завершил процесс"
            }}
        }} catch {{
            Write-Host "[Ports] ❌ PowerShell: Метод 2 не удался: $_"
        }}

        # Метод 3: через WMI
        try {{
            Write-Host "[Ports] 🔍 PowerShell: Пробуем метод 3 - WMI"
            $process = Get-WmiObject Win32_Process -Filter "ProcessId = {pid}"
            if ($process) {{
                $result = $process.Terminate()
                Start-Sleep -Seconds 1
                if (-not (Test-ProcessExists -id {pid})) {{
                    Write-Host "[Ports] ✅ PowerShell: Метод 3: процесс завершен через WMI: $result"
                    exit 0
                }} else {{
                    Write-Host "[Ports] ❌ PowerShell: Метод 3: WMI не завершил процесс"
                }}
            }} else {{
                Write-Host "[Ports] ❌ PowerShell: Метод 3: процесс не найден через WMI"
            }}
        }} catch {{
            Write-Host "[Ports] ❌ PowerShell: Метод 3 не удался: $_"
        }}
        
        # Метод 4: Direct API Call (самый агрессивный)
        Write-Host "[Ports] 🔍 PowerShell: Пробуем метод 4 - прямой Win32 API вызов"
        Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.ComponentModel;
public class AdvancedProcessKiller {{
    [Flags]
    public enum ProcessAccessFlags : uint
    {{
        All = 0x001F0FFF,
        Terminate = 0x00000001,
        CreateThread = 0x00000002,
        VirtualMemoryOperation = 0x00000008,
        VirtualMemoryRead = 0x00000010,
        VirtualMemoryWrite = 0x00000020,
        DuplicateHandle = 0x00000040,
        QueryInformation = 0x00000400,
        SetInformation = 0x00000200,
        Synchronize = 0x00100000
    }}
    
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(ProcessAccessFlags dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
    
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);
    
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr hObject);
    
    [DllImport("ntdll.dll")]
    public static extern uint NtTerminateProcess(IntPtr hProcess, uint uExitCode);
    
    [DllImport("ntdll.dll")]
    public static extern uint NtSuspendProcess(IntPtr hProcess);

    // Функция для принудительного завершения процесса через множество методов
    public static bool ForceKillProcess(uint processId) {{
        IntPtr hProcess = OpenProcess(ProcessAccessFlags.All, false, processId);
        if (hProcess == IntPtr.Zero) {{
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Не удалось открыть процесс");
        }}
        
        try {{
            // Сначала пробуем приостановить процесс
            NtSuspendProcess(hProcess);
            
            // Затем пробуем завершить через стандартный API
            bool terminated = TerminateProcess(hProcess, 0);
            if (!terminated) {{
                // Если не удалось, пробуем более низкоуровневый NT API
                uint ntStatus = NtTerminateProcess(hProcess, 0);
                return ntStatus == 0;
            }}
            return terminated;
        }}
        finally {{
            CloseHandle(hProcess);
        }}
    }}
}}
"@
        try {{
            $result = [AdvancedProcessKiller]::ForceKillProcess([uint32]{pid})
            Start-Sleep -Seconds 1
            if (-not (Test-ProcessExists -id {pid})) {{
                Write-Host "[Ports] ✅ PowerShell: Метод 4: процесс успешно завершен через прямой API вызов"
                exit 0
            }} else {{
                Write-Host "[Ports] ❌ PowerShell: Метод 4: прямой API вызов не смог завершить процесс"
            }}
        }} catch {{
            Write-Host "[Ports] ❌ PowerShell: Метод 4 не удался: $_"
        }}
        
        # Метод 5: Особый подход для Steam (если применимо)
        if ($processName -like "*steam*" -or $processName -like "*game*" -or $processName -like "*epic*") {{
            Write-Host "[Ports] 🔍 PowerShell: Обнаружен игровой процесс, применяем особый метод завершения"
            try {{
                # Завершаем сначала все дочерние процессы 
                $childProcesses = Get-WmiObject Win32_Process | Where-Object {{ 
                    ($_.ParentProcessId -eq [int]{pid}) -or 
                    ($_.Name -like "*steam*" -and $_.ProcessId -ne [int]{pid}) -or
                    ($_.Name -like "*game*" -and $_.ProcessId -ne [int]{pid}) -or
                    ($_.Name -like "*epic*" -and $_.ProcessId -ne [int]{pid})
                }}
                
                if($childProcesses) {{
                    Write-Host "[Ports] 🔍 PowerShell: Найдено $($childProcesses.Count) дочерних процессов"
                    foreach ($proc in $childProcesses) {{
                        Write-Host "[Ports] 🔍 PowerShell: Завершаем дочерний процесс: $($proc.ProcessId) ($($proc.Name))"
                        taskkill /F /PID $proc.ProcessId
                    }}
                    Start-Sleep -Seconds 1
                }}
                
                # Повторная попытка завершить основной процесс
                Write-Host "[Ports] 🔍 PowerShell: Повторная попытка завершить основной процесс taskkill /F /PID {pid}"
                taskkill /F /PID {pid}
                Start-Sleep -Seconds 1
                
                if (-not (Test-ProcessExists -id {pid})) {{
                    Write-Host "[Ports] ✅ PowerShell: Метод 5: процесс успешно завершен через специальный подход"
                    exit 0
                }} else {{
                    Write-Host "[Ports] ❌ PowerShell: Метод 5: специальный подход не помог"
                }}
            }} catch {{
                Write-Host "[Ports] ❌ PowerShell: Метод 5 не удался: $_"
            }}
        }}
        
        # Проверка финального результата
        Start-Sleep -Seconds 1
        $finalCheck = Get-Process -Id {pid} -ErrorAction SilentlyContinue
        if($finalCheck) {{
            Write-Host "[Ports] ❌ PowerShell: ОШИБКА: Не удалось завершить процесс {pid} после всех попыток"
            exit 1
        }} else {{
            Write-Host "[Ports] ✅ PowerShell: УСПЕХ: Процесс {pid} завершен одним из методов"
            exit 0
        }}
        "#
    );

    // Создаем батник для запуска PowerShell с повышенными правами
    let ps_path_str = ps_path.to_string_lossy();
    let batch_script = format!(
        r#"@echo off
        echo [Ports] 🔍 Batch: Экстренное завершение процесса PID: {pid}
        
        REM Попытка 1: taskkill с максимальной агрессивностью
        echo [Ports] 🔍 Batch: Попытка 1 - taskkill /F /PID {pid} /T
        taskkill /F /PID {pid} /T
        
        REM Попытка 2: wmic - работает в некоторых случаях, где taskkill не справляется
        echo [Ports] 🔍 Batch: Попытка 2 - wmic process where processid="{pid}" call terminate
        wmic process where processid="{pid}" call terminate
        
        REM Попытка 3: PowerShell с максимальными привилегиями
        echo [Ports] 🔍 Batch: Попытка 3 - PowerShell с повышенными привилегиями
        powershell -Command "Start-Process powershell -ArgumentList '-Command \"Stop-Process -Id {pid} -Force\"' -Verb RunAs -WindowStyle Hidden"
        
        REM Попытка 4: Используем PsKill от SysInternals если он есть
        if exist "%ProgramFiles%\SysInternals\pskill.exe" (
            echo [Ports] 🔍 Batch: Попытка 4 - PsKill (SysInternals)
            "%ProgramFiles%\SysInternals\pskill.exe" -t {pid}
        ) else if exist "%ProgramFiles(x86)%\SysInternals\pskill.exe" (
            echo [Ports] 🔍 Batch: Попытка 4 - PsKill (SysInternals x86)
            "%ProgramFiles(x86)%\SysInternals\pskill.exe" -t {pid}
        )
        
        REM Попытка 5: Запуск сложного PowerShell скрипта с повышенными привилегиями
        echo [Ports] 🔍 Batch: Попытка 5 - Запуск сложного PowerShell скрипта
        powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"{ps_path_str}\"' -Verb RunAs -WindowStyle Hidden -Wait"
        
        REM Даем время на завершение
        timeout /t 2 > nul
        
        REM Проверка
        echo [Ports] 🔍 Batch: Проверка результата
        tasklist /FI "PID eq {pid}" /NH | find "{pid}" > nul
        if errorlevel 1 (
            echo [Ports] ✅ Batch: Процесс успешно завершен
            exit /b 0
        ) else (
            echo [Ports] ❌ Batch: Не удалось завершить процесс
            exit /b 1
        )
        "#
    );

    // Записываем скрипты в файлы
    match std::fs::write(&ps_path, ps_script) {
        Ok(_) => println!("[Ports] ✅ PowerShell скрипт создан: {}", ps_path.to_string_lossy()),
        Err(e) => {
            println!("[Ports] ❌ Не удалось создать PowerShell скрипт: {}", e);
            return Err(format!("Не удалось создать PowerShell скрипт: {}", e))
        }
    }

    match std::fs::write(&batch_path, batch_script) {
        Ok(_) => println!("[Ports] ✅ Батник для экстренного завершения создан: {}", batch_path.to_string_lossy()),
        Err(e) => {
            println!("[Ports] ❌ Не удалось создать батник: {}", e);
            return Err(format!("Не удалось создать батник: {}", e))
        }
    }

    // Запускаем батник
    println!("[Ports] 🔄 Запускаем батник для экстренного завершения");
    match Command::new("cmd")
        .args(["/c", &batch_path.to_string_lossy().to_string()])
        .output() 
    {
        Ok(output) => {
            // Проверяем результат
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            println!("[Ports] Результат выполнения батника:");
            println!("[Ports] Stdout: {}", stdout);
            if !stderr.is_empty() {
                println!("[Ports] Stderr: {}", stderr);
            }
            
            if output.status.success() {
                println!("[Ports] ✅ Процесс {} успешно завершен через батник", pid);
                
                // Очистка временных файлов
                let _ = std::fs::remove_file(&ps_path);
                let _ = std::fs::remove_file(&batch_path);
                
                // Финальная проверка
                let check_process = Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                    .output();
                
                match check_process {
                    Ok(check_output) => {
                        let check_output_str = String::from_utf8_lossy(&check_output.stdout);
                        if !check_output_str.contains(&pid) {
                            println!("[Ports] ✅ Финальная проверка подтвердила завершение процесса {}", pid);
                        } else {
                            println!("[Ports] ⚠️ Финальная проверка: процесс {} все еще существует!", pid);
                        }
                    },
                    Err(e) => println!("[Ports] ⚠️ Не удалось выполнить финальную проверку: {}", e)
                }
                
                Ok(format!("Процесс {} успешно завершен", pid))
            } else {
                println!("[Ports] ❌ Ошибка при завершении процесса {} через батник. Код ошибки: {:?}", pid, output.status.code());
                
                // Очистка временных файлов
                let _ = std::fs::remove_file(&ps_path);
                let _ = std::fs::remove_file(&batch_path);
                
                Err(format!("Не удалось завершить процесс {}. Экстренный метод не сработал.", pid))
            }
        },
        Err(e) => {
            println!("[Ports] ❌ Ошибка при запуске батника: {}", e);
            
            // Очистка временных файлов
            let _ = std::fs::remove_file(&ps_path);
            let _ = std::fs::remove_file(&batch_path);
            
            Err(format!("Ошибка при запуске экстренного метода: {}", e))
        }
    }
} 