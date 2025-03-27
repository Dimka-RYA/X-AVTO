//! Тестовый модуль для запуска функций ports напрямую
//! Используется для отладки проблем с получением портов

use std::collections::HashMap;

// Тестовая функция для ручного запуска и проверки получения портов
fn main() {
    println!("Запуск тестовой функции для проверки получения портов");
    
    // Создаем временный кэш процессов
    let mut process_cache = HashMap::new();
    
    // Пытаемся получить порты напрямую
    match crate::ports::core::get_ports_internal(&mut process_cache, true) {
        Ok(ports) => {
            println!("Успешно получено {} портов", ports.len());
            
            // Выводим первые 5 портов для проверки
            for (i, port) in ports.iter().take(5).enumerate() {
                println!("Порт {}: {} {}:{} -> {} ({}) [{}]", 
                    i+1, port.protocol, port.local_addr, port.state, 
                    port.foreign_addr, port.pid, port.process_name);
            }
        },
        Err(e) => {
            println!("Ошибка при получении портов: {}", e);
        }
    }
} 