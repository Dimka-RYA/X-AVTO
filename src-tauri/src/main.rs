// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod components;
mod ports;

use tauri::{Builder, Manager};
// Import the commands explicitly
use ports::commands::{get_network_ports, close_port, refresh_ports_command};
use ports::start_ports_refresh_thread;

fn main() {
    Builder::default()
        .setup(|app| {
            // Создаем и сохраняем кэш как состояние Tauri
            println!("[Main] Настройка кэша портов и запуск фонового потока обновления");
            
            // Инициализация модуля портов
            ports::initialise_ports(app);
            
            // Запускаем фоновый поток для периодического обновления кэша портов
            start_ports_refresh_thread(app.state::<ports::PortsCache>());
            
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                println!("[Main] Открыты инструменты разработчика (dev mode)");
            }
            
            Ok(())
        })
        .manage(ports::create_ports_cache())
        .invoke_handler(tauri::generate_handler![
            components::topbar_func::minimize_window,
            components::topbar_func::toggle_maximize,
            components::topbar_func::close_window,
            get_network_ports,
            close_port,
            refresh_ports_command,
        ])
        .run(tauri::generate_context!())
        .expect("Ошибка при запуске приложения");
}