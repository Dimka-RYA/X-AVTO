use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Информация о сетевом порте
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Port {
    /// Протокол (TCP, UDP)
    pub protocol: String,
    /// Локальный адрес (IP:порт)
    pub local_addr: String,
    /// Внешний адрес (IP:порт)
    pub foreign_addr: String,
    /// Состояние соединения
    pub state: String,
    /// Идентификатор процесса
    pub pid: String,
    /// Имя процесса
    pub name: String,
    /// Путь к исполняемому файлу процесса
    pub path: String,
}

/// Кэш портов
pub struct PortsCache(pub Arc<Mutex<Vec<Port>>>);

impl PortsCache {
    pub fn new() -> Self {
        println!("[Ports] Инициализация кэша портов");
        PortsCache(Arc::new(Mutex::new(Vec::new())))
    }
}

/// Тип для кэша информации о процессах (PID -> (имя, путь))
pub type ProcessInfoCache = HashMap<String, (String, String)>; 