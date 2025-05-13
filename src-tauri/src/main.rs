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
use std::process::Command;
use std::io;

// Import the commands explicitly
use ports::commands::{get_network_ports, close_port, refresh_ports_command, close_specific_port, can_close_port_individually, force_kill_process, emergency_kill_process};
use ports::start_ports_refresh_thread;
use components::topbar_func::{minimize_window, toggle_maximize, close_window};

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn open_process_path(process_id: u32) -> Result<String, String> {
    use std::process::Command;
    use std::path::PathBuf;
    
    // Проверка на системные процессы
    if process_id == 0 || process_id == 4 {
        return Err("Системный процесс: путь недоступен".to_string());
    }
    
    // Получаем путь к исполняемому файлу процесса
    let process_path = match get_process_path(process_id) {
        Ok(path) => path,
        Err(err) => return Err(format!("Не удалось получить путь к процессу: {}", err)),
    };
    
    // Проверка на системные пути
    if process_path.to_lowercase().contains("\\windows\\system32") || 
       process_path.to_lowercase().contains("\\systemroot") {
        // Возможно, системный процесс, но мы все равно попробуем открыть проводник
        println!("Системный процесс обнаружен: {}", process_path);
    }
    
    // Получаем директорию, в которой находится исполняемый файл
    let dir_path = match PathBuf::from(&process_path).parent() {
        Some(dir) => dir.to_string_lossy().to_string(),
        None => return Err("Не удалось определить директорию процесса".to_string()),
    };
    
    // Открываем проводник с указанным путем
    let result = if cfg!(target_os = "windows") {
        Command::new("explorer")
            .args(["/select,", &process_path])
            .spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open")
            .arg("-R")
            .arg(&process_path)
            .spawn()
    } else {
        // Linux - используем xdg-open для открытия директории
        Command::new("xdg-open")
            .arg(&dir_path)
            .spawn()
    };
    
    match result {
        Ok(_) => Ok(format!("Открыт путь: {}", dir_path)),
        Err(err) => Err(format!("Ошибка при открытии пути: {}", err)),
    }
}

// Вспомогательная функция для получения пути к процессу
fn get_process_path(pid: u32) -> Result<String, io::Error> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::io::{Error, ErrorKind};
        
        // Использует WMI для получения пути к процессу в Windows
        let output = Command::new("wmic")
            .args(["process", "where", &format!("ProcessId={}", pid), "get", "ExecutablePath", "/value"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW flag
            .output()?;
        
        let output_str = String::from_utf8_lossy(&output.stdout);
        for line in output_str.lines() {
            if line.starts_with("ExecutablePath=") {
                return Ok(line.trim_start_matches("ExecutablePath=").to_string());
            }
        }
        
        Err(Error::new(ErrorKind::Other, "Не удалось найти путь к процессу"))
    }
    
    #[cfg(target_os = "macos")]
    {
        use std::io::{Error, ErrorKind};
        
        let output = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "comm="])
            .output()?;
        
        if !output.status.success() {
            return Err(Error::new(ErrorKind::Other, "Не удалось выполнить команду ps"));
        }
        
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err(Error::new(ErrorKind::Other, "Процесс не найден"));
        }
        
        Ok(path)
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::io::{Error, ErrorKind};
        use std::fs;
        
        let proc_path = format!("/proc/{}/exe", pid);
        match fs::read_link(&proc_path) {
            Ok(path) => Ok(path.to_string_lossy().to_string()),
            Err(e) => Err(Error::new(ErrorKind::Other, 
                format!("Не удалось прочитать симлинк {}: {}", proc_path, e)))
        }
    }
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
            open_process_path,
            close_specific_port,
            can_close_port_individually,
            force_kill_process,
            emergency_kill_process
        ])
        .run(tauri::generate_context!())
        .expect("Ошибка при запуске приложения");
}
