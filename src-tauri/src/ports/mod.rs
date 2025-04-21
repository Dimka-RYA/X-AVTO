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
pub use types::PortsCache;
pub use core::{initialise_ports, start_ports_refresh_thread};

// Создание нового кэша портов
pub fn create_ports_cache() -> PortsCache {
    println!("[Ports] Создание кэша портов");
    PortsCache::new()
} 