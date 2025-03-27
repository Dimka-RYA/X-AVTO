use std::process::Command;
use std::collections::HashMap;
use tauri::{Emitter, Manager, Runtime, State};
use tokio::task;
use std::thread;

use crate::ports::types::{Port, PortsCache};
use crate::ports::core::get_ports_internal;

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
    println!("[Ports] Запрос на закрытие порта с PID: {}", pid);
    
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
        
        println!("[Ports] Попытка закрыть процесс: {} (PID: {})", process_name, pid);
        
        // Выполняем команду закрытия в зависимости от платформы
        let close_result = if cfg!(target_os = "windows") {
            // Сначала пробуем закрыть процесс обычным способом
            let graceful_close = Command::new("taskkill")
                .args(["/PID", &pid])
                .output();
            
            match graceful_close {
                Ok(output) if output.status.success() => {
                    println!("[Ports] Процесс {} успешно закрыт", pid);
                    Ok(format!("Процесс {} успешно закрыт", pid))
                },
                _ => {
                    // Если не удалось, пробуем принудительно
                    println!("[Ports] Не удалось корректно закрыть процесс, пробуем принудительно");
                    let force_close = Command::new("taskkill")
                        .args(["/PID", &pid, "/F"])
                        .output();
                    
                    match force_close {
                        Ok(output) if output.status.success() => {
                            println!("[Ports] Процесс {} принудительно закрыт", pid);
                            Ok(format!("Процесс {} принудительно закрыт", pid))
                        },
                        _ => {
                            let error = "Не удалось закрыть процесс даже принудительно".to_string();
                            println!("[Ports] {}", error);
                            Err(error)
                        }
                    }
                }
            }
        } else {
            // Для Unix-подобных систем используем kill
            let graceful_close = Command::new("kill")
                .args([&pid])
                .output();
            
            match graceful_close {
                Ok(output) if output.status.success() => {
                    println!("[Ports] Процесс {} успешно закрыт", pid);
                    Ok(format!("Процесс {} успешно закрыт", pid))
                },
                _ => {
                    // Если не удалось, пробуем принудительно
                    println!("[Ports] Не удалось корректно закрыть процесс, пробуем принудительно");
                    let force_close = Command::new("kill")
                        .args(["-9", &pid])
                        .output();
                    
                    match force_close {
                        Ok(output) if output.status.success() => {
                            println!("[Ports] Процесс {} принудительно закрыт", pid);
                            Ok(format!("Процесс {} принудительно закрыт", pid))
                        },
                        _ => {
                            let error = "Не удалось закрыть процесс даже принудительно".to_string();
                            println!("[Ports] {}", error);
                            Err(error)
                        }
                    }
                }
            }
        };
        
        // По завершении операции обновляем данные на клиенте
        match close_result {
            Ok(_) => {
                // Эмитим событие об успешном закрытии
                let _ = app_handle.emit_to("main", "port-closed", &pid);
            },
            Err(_) => {
                // Эмитим событие об ошибке
                let _ = app_handle.emit_to("main", "port-close-error", &pid);
            }
        }
        
        close_result
    }).await.map_err(|e| format!("Ошибка запуска задачи: {}", e))?
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