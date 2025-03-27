//! Модуль для работы с сетевыми портами
//! 
//! Включает функции для получения списка открытых портов,
//! информации о процессах и управления портами.

// Экспортируем публичные интерфейсы
pub mod types;
pub mod core;
pub mod process;
pub mod windows;
pub mod unix;
pub mod commands;

// Переэкспортируем основные функции и типы
pub use types::{Port, PortsCache};
pub use core::{get_ports_internal, initialise_ports, start_ports_refresh_thread};
pub use commands::{get_network_ports, close_port, refresh_ports_command};

// Создание нового кэша портов
pub fn create_ports_cache() -> PortsCache {
    println!("[Ports] Создание кэша портов");
    PortsCache::new()
} 