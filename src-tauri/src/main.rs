// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod utils;
mod ports;
mod components;

use tauri::{Builder, Manager};
use utils::terminal::PtyState;
use utils::db::DbState;
use utils::system_info::{create_system_info_cache, start_system_info_thread};
use std::sync::Arc;

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
    // Создаем кэш для системной информации
    let system_info_cache = create_system_info_cache();

    Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Создаем и сохраняем кэш как состояние Tauri
            println!("[Main] Настройка кэша портов и запуск фонового потока обновления");
            
            // Инициализация модуля портов
            ports::initialise_ports(app);
            
            // Запускаем фоновый поток для периодического обновления кэша портов
            start_ports_refresh_thread(app.state::<ports::PortsCache>());
            
            // Запускаем фоновый поток для обновления системной информации
            start_system_info_thread(app.app_handle().clone(), app.state::<Arc<utils::system_info::SystemInfoCache>>().inner().clone());
            println!("[SystemInfo] Запущен фоновый поток обновления системной информации");
            
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
        .manage(system_info_cache)
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
            
            // Системная информация
            utils::system_info::get_system_info,
            utils::system_info::get_memory_details,
            utils::system_info::get_temperatures,
            utils::system_info::set_monitoring_active,
            
            // Запуск скриптов
            utils::script_runner::run_script,
            utils::script_runner::save_script,
            utils::script_runner::save_script_by_language,
            utils::script_runner::save_script_with_custom_path,
            utils::script_runner::save_file_to_path,
            
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
