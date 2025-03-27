use std::thread;
use std::time::Duration;
use std::collections::{HashMap, HashSet};

use tauri::{Emitter, Manager, WebviewWindow, State};
use crate::ports::types::{Port, PortsCache, ProcessInfoCache};
use crate::ports::windows::get_windows_ports;
use crate::ports::unix::get_unix_ports;

/// Получение списка открытых сетевых портов
pub fn get_ports_internal(
    process_cache: &mut ProcessInfoCache,
    detailed_logging: bool
) -> Result<Vec<Port>, String> {
    if cfg!(target_os = "windows") {
        get_windows_ports(process_cache, detailed_logging)
    } else {
        get_unix_ports(process_cache, detailed_logging)
    }
}

/// Запуск фонового потока обновления портов
pub fn initialise_ports(app: &mut tauri::App) {
    println!("[Ports] Инициализация модуля портов");
    
    // Получаем главное окно
    if let Some(window) = app.get_webview_window("main") {
        // Запускаем фоновый поток обновления портов
        let window_handle = window.clone();
        thread::spawn(move || {
            refresh_ports(window_handle, false);
        });
    } else {
        println!("[Ports] ОШИБКА: Не удалось получить главное окно для мониторинга портов");
    }
}

/// Запуск фонового потока обновления кэша портов
pub fn start_ports_refresh_thread(ports_cache: State<PortsCache>) {
    println!("[Ports] Запуск фонового потока обновления кэша портов");
    
    // Клонируем Arc для использования в потоке
    let cache = ports_cache.0.clone();
    
    // Для отслеживания запущенных процессов
    let mut last_update_time = std::time::Instant::now();
    let mut last_log_time = std::time::Instant::now();
    
    // Запускаем поток
    thread::spawn(move || {
        // Кэш для процессов, чтобы не запрашивать имена повторно
        let mut process_names_cache: HashMap<String, (String, String)> = HashMap::new();
        
        // Флаг первого запуска для поочередной загрузки
        let mut is_first_run = true;
        
        loop {
            // Проверяем, прошло ли достаточно времени с последнего обновления
            let now = std::time::Instant::now();
            
            // Обновляем не чаще чем раз в 30 секунд вместо 10 для снижения нагрузки
            if now.duration_since(last_update_time) >= Duration::from_secs(30) || is_first_run {
                // Логируем обновление только если прошло достаточно времени с последнего лога (раз в 2 минуты)
                let should_log_detailed = now.duration_since(last_log_time) >= Duration::from_secs(120);
                
                if should_log_detailed {
                    println!("[Ports] Обновление кэша портов (периодическое)");
                    last_log_time = now;
                }
                
                last_update_time = now;
                
                // Запоминаем старые пиды для определения изменений
                let old_pids = if let Ok(ports) = cache.lock() {
                    ports.iter().map(|p| (p.pid.clone(), format!("{}:{}", p.protocol, p.local_addr))).collect::<HashSet<_>>()
                } else {
                    if should_log_detailed {
                        println!("[Ports] Не удалось получить блокировку для кэша при чтении старых PID");
                    }
                    HashSet::new()
                };
                
                // Получаем данные о портах с использованием кэша процессов
                match get_ports_internal(&mut process_names_cache, should_log_detailed) {
                    Ok(ports) => {
                        if should_log_detailed {
                            println!("[Ports] Получено портов: {}", ports.len());
                            // Логируем некоторые из полученных портов для отладки
                            for (i, port) in ports.iter().enumerate().take(3) {
                                println!("[Ports] Пример порта {}: {} -> {} ({})", 
                                    i, port.local_addr, port.foreign_addr, port.state);
                            }
                        }

                        // Проверяем, были ли изменения
                        let new_pids = ports.iter().map(|p| (p.pid.clone(), format!("{}:{}", p.protocol, p.local_addr))).collect::<HashSet<_>>();
                        
                        // Обновляем кэш только если есть изменения или это первый запуск
                        if (old_pids != new_pids || is_first_run) {
                            if (should_log_detailed) {
                                println!("[Ports] Обнаружены изменения в списке портов, обновляем кэш");
                            }
                            
                            if let Ok(mut cached_ports) = cache.lock() {
                                // При первом запуске загружаем порты поочередно для снижения нагрузки
                                if (is_first_run) {
                                    println!("[Ports] Первоначальная загрузка данных, поочередное обновление");
                                    
                                    // Разбиваем данные на пакеты
                                    let batch_size = 50; // Размер пакета
                                    let total_batches = (ports.len() + batch_size - 1) / batch_size;
                                    
                                    for batch_idx in 0..total_batches {
                                        let start_idx = batch_idx * batch_size;
                                        let end_idx = std::cmp::min(start_idx + batch_size, ports.len());
                                        
                                        // Загружаем только часть данных
                                        let batch = ports[start_idx..end_idx].to_vec();
                                        
                                        if (should_log_detailed || batch_idx == 0 || batch_idx == total_batches - 1) {
                                            println!("[Ports] Загрузка пакета {}/{}: порты {}-{}", 
                                                batch_idx + 1, total_batches, start_idx, end_idx);
                                        }
                                        
                                        println!("[Ports] Обновляем кэш пакетом из {} портов", batch.len());
                                        *cached_ports = batch;
                                        
                                        // Небольшая пауза между пакетами для снижения нагрузки
                                        thread::sleep(Duration::from_millis(100));
                                    }
                                    
                                    // Наконец загружаем все данные
                                    println!("[Ports] Загружаем финальный пакет всех данных: {} портов", ports.len());
                                    *cached_ports = ports;
                                    println!("[Ports] Завершена начальная загрузка всех данных: {} портов", cached_ports.len());
                                    is_first_run = false;
                                } else {
                                    // Стандартное обновление после первой загрузки
                                    println!("[Ports] Обновляем кэш: было {} портов, новых {}", cached_ports.len(), ports.len());
                                    *cached_ports = ports;
                                    if (should_log_detailed) {
                                        println!("[Ports] Кэш обновлен: {} портов", cached_ports.len());
                                    }
                                }
                            } else if (should_log_detailed) {
                                println!("[Ports] Не удалось получить блокировку для обновления кэша");
                            }
                        } else if (should_log_detailed) {
                            println!("[Ports] Изменений в списке портов не обнаружено");
                        }
                    }
                    Err(e) => {
                        if should_log_detailed {
                            eprintln!("[Ports] Ошибка при обновлении кэша портов: {}", e);
                        }
                    }
                }
            }
            
            // Увеличиваем интервал сна для снижения нагрузки на CPU с 2 до 5 секунд
            thread::sleep(Duration::from_secs(5));
        }
    });
}

/// Обновление списка портов и отправка в интерфейс
pub fn refresh_ports<R: tauri::Runtime>(window: WebviewWindow<R>, detailed_logging: bool) {
    println!("[Ports] Запуск функции обновления портов для окна");
    
    // Кэш для имен процессов
    let mut process_cache = HashMap::new();
    
    // Счетчик обновлений для периодической очистки кэша
    let mut update_counter = 0;
    
    // Получаем данные однократно
    println!("[Ports] Получаем данные о портах для немедленной отправки");
    let detailed_log_first_time = true;
    match get_ports_internal(&mut process_cache, detailed_log_first_time) {
        Ok(ports) => {
            // Отправляем данные в фронтенд
            println!("[Ports] Отправка {} портов в интерфейс через событие ports-data (однократное обновление)", ports.len());
            if let Err(e) = window.emit("ports-data", &ports) {
                println!("[Ports] ОШИБКА при отправке данных через событие: {:?}", e);
            } else {
                println!("[Ports] Данные успешно отправлены в интерфейс через событие ports-data");
                
                if detailed_logging && ports.len() > 0 {
                    let sample_count = std::cmp::min(ports.len(), 3);
                    println!("[Ports] Примеры отправленных портов:");
                    for (i, port) in ports.iter().take(sample_count).enumerate() {
                        println!("[Ports] Пример порта {}: {} - {} -> {} ({})", 
                            i, port.protocol, port.local_addr, port.foreign_addr, port.state);
                    }
                }
            }
        },
        Err(e) => {
            println!("[Ports] Ошибка получения списка портов: {}", e);
        }
    }
    
    // Запускаем периодическое обновление
    println!("[Ports] Запуск периодического обновления данных");
    loop {
        // Очищаем кэш раз в 20 обновлений, чтобы актуализировать данные о процессах
        update_counter += 1;
        if update_counter > 20 {
            process_cache.clear();
            update_counter = 0;
            if detailed_logging {
                println!("[Ports] Кэш процессов очищен");
            }
        }
        
        // Получаем список портов - переключаем детальное логирование только на первых запусках
        let detailed_log_this_time = detailed_logging && update_counter <= 2;
        let ports = match get_ports_internal(&mut process_cache, detailed_log_this_time) {
            Ok(p) => {
                if detailed_log_this_time {
                    println!("[Ports] Успешно получено {} портов", p.len());
                }
                p
            },
            Err(e) => {
                if detailed_log_this_time {
                    println!("[Ports] Ошибка получения списка портов: {}", e);
                }
                Vec::new()
            }
        };
        
        if !ports.is_empty() {
            // Отправляем данные в фронтенд
            if detailed_log_this_time {
                println!("[Ports] Отправка {} портов в интерфейс через событие ports-data", ports.len());
            }
            
            // Отправляем события без дополнительных проверок - emit сам обработает ошибки
            match window.emit("ports-data", &ports) {
                Ok(_) => {
                    if detailed_log_this_time {
                        println!("[Ports] Данные успешно отправлены в интерфейс через событие ports-data");
                    }
                },
                Err(e) => {
                    println!("[Ports] ОШИБКА при отправке данных через событие: {:?}", e);
                }
            }
        } else {
            println!("[Ports] Нет данных для отправки в интерфейс");
        }
        
        // Пауза между обновлениями - уменьшаем с 2 секунд до 1
        thread::sleep(Duration::from_millis(1000));
    }
} 