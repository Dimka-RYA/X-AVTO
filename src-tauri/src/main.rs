// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod utils;
mod ports;
mod components;

use tauri::{Builder, Manager};
use utils::terminal::PtyState;
use utils::db::DbState;

// Import the commands explicitly
use ports::commands::{get_network_ports, close_port, refresh_ports_command};
use ports::start_ports_refresh_thread;
use components::topbar_func::{minimize_window, toggle_maximize, close_window};

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn main() {
    Builder::default()
        .setup(|app| {
            // Создаем и сохраняем кэш как состояние Tauri
            println!("[Main] Настройка кэша портов и запуск фонового потока обновления");
            
            // Инициализация модуля портов
            ports::initialise_ports(app);
            
            // Запускаем фоновый поток для периодического обновления кэша портов
            start_ports_refresh_thread(app.state::<ports::PortsCache>());
            
            // Инициализация базы данных
            let app_handle = app.app_handle();
            let db_state = DbState::new(&app_handle)
                .expect("Не удалось инициализировать базу данных");
            app.manage(db_state);
            println!("[Main] База данных успешно инициализирована");
            
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                println!("[Main] Открыты инструменты разработчика (dev mode)");
            }
            
            Ok(())
        })
        .manage(ports::create_ports_cache())
        .manage(PtyState::new())
        .invoke_handler(tauri::generate_handler![
            // Базовая функция
            greet,
            
            // Терминал
            utils::terminal::start_process,
            utils::terminal::resize_pty,
            utils::terminal::send_input,
            utils::terminal::change_directory,
            utils::terminal::clear_terminal,
            utils::terminal::close_terminal_process,
            utils::terminal::get_active_terminals,
            
            // База данных терминала
            utils::db::save_terminal_tab,
            utils::db::get_saved_terminal_tabs,
            utils::db::delete_terminal_tab,
            utils::db::save_terminal_command,
            utils::db::get_terminal_commands,
            utils::db::delete_terminal_command,
            utils::db::clear_terminal_history,
            
            // Компоненты интерфейса
            minimize_window,
            toggle_maximize,
            close_window,
            
            // Порты
            get_network_ports,
            close_port,
            refresh_ports_command,
        ])
        .run(tauri::generate_context!())
        .expect("Ошибка при запуске приложения");
}