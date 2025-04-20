use tauri::Emitter;
use tauri::Manager;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::{
    io::{Read, Write},
    sync::Arc,
    collections::HashMap
};
use tauri::{
    async_runtime::{spawn, Mutex},
    AppHandle, State,
};

// Структура для хранения данных отдельного терминального процесса
struct TerminalProcess {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    terminal_id: u32,
}

// Состояние для хранения всех терминальных процессов
pub struct PtyState {
    terminals: Arc<Mutex<HashMap<u32, TerminalProcess>>>,
    next_id: Arc<Mutex<u32>>,
}

impl PtyState {
    pub fn new() -> Self {
        PtyState {
            terminals: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
        }
    }
}

#[tauri::command]
pub async fn resize_pty(state: State<'_, PtyState>, terminal_id: u32, rows: u16, cols: u16) -> Result<(), String> {
    let terminals = state.terminals.lock().await;
    
    if let Some(terminal) = terminals.get(&terminal_id) {
        terminal.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        
        Ok(())
    } else {
        Err(format!("Терминал с ID {} не найден", terminal_id))
    }
}

#[tauri::command]
pub async fn start_process(state: State<'_, PtyState>, app: AppHandle) -> Result<u32, String> {
    println!("Starting new terminal process...");
    
    // Получаем новый ID для терминала
    let terminal_id = {
        let mut next_id = state.next_id.lock().await;
        let id = *next_id;
        *next_id += 1;
        id
    };
    
    println!("Assigned terminal ID: {}", terminal_id);
    
    let pty_system = native_pty_system();
    
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("powershell.exe");
    
    // Упрощаем команду PowerShell для более надежной работы
    cmd.args([
        "-NoExit", 
        "-Command", 
        "& {$OutputEncoding = [Console]::OutputEncoding = [Console]::InputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; Clear-Host; Write-Host ('Терминал X-Avto #' + [string]$PID + ' готов к работе!') -ForegroundColor Green; Write-Host}"
    ]);
    
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    
    println!("PowerShell process spawned for terminal {}", terminal_id);

    let master = pair.master;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    // Добавляем новый терминал в хранилище
    {
        let mut terminals = state.terminals.lock().await;
        terminals.insert(terminal_id, TerminalProcess {
            master,
            writer,
            terminal_id,
        });
    }

    let app_handle = app.clone();

    // Поток для чтения вывода конкретного терминала
    spawn(async move {
        println!("Starting read thread for terminal {}", terminal_id);
        let mut buffer = [0u8; 4096];
        
        // Небольшая задержка перед первым чтением, чтобы PowerShell успел инициализироваться
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    println!("EOF reached in terminal {} reader", terminal_id);
                    break;
                },
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                    println!("Terminal {} output received, length: {} bytes", terminal_id, n);
                    
                    // Отправка вывода в клиент с указанием ID терминала
                    match app_handle.emit("pty-output", (terminal_id, output.clone())) {
                        Ok(_) => println!("Successfully emitted terminal {} output to client", terminal_id),
                        Err(e) => eprintln!("Error emitting output from terminal {}: {}", terminal_id, e),
                    }
                },
                Err(e) => {
                    eprintln!("Error reading from terminal {}: {}", terminal_id, e);
                    break;
                }
            }
        }
        
        println!("Terminal {} reader thread exited", terminal_id);
        
        // Удаляем терминал из списка при завершении работы
        if let Some(state) = app_handle.try_state::<PtyState>() {
            let mut terminals = state.terminals.blocking_lock();
            terminals.remove(&terminal_id);
            println!("Terminal {} removed from state", terminal_id);
        }
    });

    // Поток для ожидания завершения процесса
    spawn(async move {
        match child.wait() {
            Ok(status) => println!("Terminal {} process exited with status: {:?}", terminal_id, status),
            Err(e) => eprintln!("Error waiting for terminal {} process: {}", terminal_id, e),
        }
    });

    println!("Terminal {} process setup complete", terminal_id);
    Ok(terminal_id)
}

#[tauri::command]
pub async fn send_input(state: State<'_, PtyState>, terminal_id: u32, input: String) -> Result<(), String> {
    let mut terminals = state.terminals.lock().await;
    
    if let Some(terminal) = terminals.get_mut(&terminal_id) {
        terminal.writer
            .write_all(input.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        terminal.writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    } else {
        Err(format!("Терминал с ID {} не найден", terminal_id))
    }
}

#[tauri::command]
pub async fn change_directory(state: State<'_, PtyState>, terminal_id: u32, path: String) -> Result<(), String> {
    let mut terminals = state.terminals.lock().await;
    
    if let Some(terminal) = terminals.get_mut(&terminal_id) {
        let command = format!("Set-Location {}\r\n", path.replace("/", "\\")); // PowerShell использует \
        terminal.writer
            .write_all(command.as_bytes())
            .map_err(|e| format!("Failed to change directory: {}", e))?;
        terminal.writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    } else {
        Err(format!("Терминал с ID {} не найден", terminal_id))
    }
}

#[tauri::command]
pub async fn clear_terminal(state: State<'_, PtyState>, terminal_id: u32) -> Result<(), String> {
    let mut terminals = state.terminals.lock().await;
    
    if let Some(terminal) = terminals.get_mut(&terminal_id) {
        // Очистка экрана в PowerShell (ANSI escape sequence)
        terminal.writer
            .write_all("\x1b[2J\x1b[1;1H".as_bytes()) // Очищает экран и перемещает курсор в начало
            .map_err(|e| format!("Failed to clear terminal: {}", e))?;
        terminal.writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    } else {
        Err(format!("Терминал с ID {} не найден", terminal_id))
    }
}

#[tauri::command]
pub async fn close_terminal_process(state: State<'_, PtyState>, terminal_id: u32) -> Result<(), String> {
    println!("Попытка закрытия процесса терминала с ID {}...", terminal_id);
    
    // Извлекаем и удаляем терминал из хранилища
    let mut terminals = state.terminals.lock().await;
    
    if let Some(mut terminal) = terminals.remove(&terminal_id) {
        // Отправка команды выхода в PowerShell
        let _ = terminal.writer.write_all("exit\r\n".as_bytes());
        let _ = terminal.writer.flush();
        
        println!("Процесс терминала {} успешно закрыт", terminal_id);
        Ok(())
    } else {
        let error = format!("Терминал с ID {} не найден или уже закрыт", terminal_id);
        println!("{}", error);
        Err(error)
    }
}

#[tauri::command]
pub async fn get_active_terminals(state: State<'_, PtyState>) -> Result<Vec<u32>, String> {
    let terminals = state.terminals.lock().await;
    Ok(terminals.keys().cloned().collect())
} 