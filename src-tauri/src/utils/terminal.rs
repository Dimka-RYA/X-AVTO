use tauri::Emitter;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::{
    io::{Read, Write},
    sync::Arc,
};
use tauri::{
    async_runtime::{spawn, Mutex},
    AppHandle, State,
};

pub struct PtyState {
    pub master: Arc<Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>>,
    pub writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
}

#[tauri::command]
pub async fn resize_pty(state: State<'_, PtyState>, rows: u16, cols: u16) -> Result<(), String> {
    if let Some(master) = state.master.lock().await.as_mut() {
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn start_process(state: State<'_, PtyState>, app: AppHandle) -> Result<(), String> {
    println!("Starting terminal process...");
    
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
    cmd.args(["-NoExit", "-Command", "$OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; chcp 65001; Set-Location C:\\Users; Clear-Host; Write-Host 'Терминал X-Avto готов к работе!' -ForegroundColor Green; Write-Host; Get-Location | Write-Host -NoNewline; Write-Host ' PS>' -NoNewline; "]);
    
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    
    println!("PowerShell process spawned");

    let master = pair.master;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    *state.master.lock().await = Some(master);
    *state.writer.lock().await = Some(writer);

    let app_handle = app.clone();

    // Поток для чтения вывода
    spawn(async move {
        println!("Starting read thread");
        let mut buffer = [0u8; 4096];
        
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    println!("EOF reached in terminal reader");
                    break;
                },
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                    println!("Terminal output received, length: {} bytes", n);
                    if output.len() < 200 {
                        println!("Output content: {:?}", output);
                    } else {
                        println!("Output content (first 200 chars): {:?}", &output[..200]);
                    }
                    
                    // Отправка вывода в клиент
                    match app_handle.emit("pty-output", output.clone()) {
                        Ok(_) => println!("Successfully emitted terminal output to client"),
                        Err(e) => eprintln!("Error emitting output: {}", e),
                    }
                },
                Err(e) => {
                    eprintln!("Error reading from terminal: {}", e);
                    break;
                }
            }
        }
        
        println!("Terminal reader thread exited");
    });

    // Поток для ожидания завершения процесса
    spawn(async move {
        match child.wait() {
            Ok(status) => println!("Terminal process exited with status: {:?}", status),
            Err(e) => eprintln!("Error waiting for terminal process: {}", e),
        }
    });

    println!("Terminal process setup complete");
    Ok(())
}

#[tauri::command]
pub async fn send_input(state: State<'_, PtyState>, input: String) -> Result<(), String> {
    let mut writer_guard = state.writer.lock().await;
    if let Some(writer) = writer_guard.as_mut() {
        writer
            .write_all(input.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    } else {
        Err("PTY writer not initialized".to_string())
    }
}

#[tauri::command]
pub async fn change_directory(state: State<'_, PtyState>, path: String) -> Result<(), String> {
    let mut writer_guard = state.writer.lock().await;
    if let Some(writer) = writer_guard.as_mut() {
        let command = format!("Set-Location {}\r\n", path.replace("/", "\\")); // PowerShell использует \
        writer
            .write_all(command.as_bytes())
            .map_err(|e| format!("Failed to change directory: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    } else {
        Err("PTY writer not initialized".to_string())
    }
}

#[tauri::command]
pub async fn clear_terminal(state: State<'_, PtyState>) -> Result<(), String> {
    let mut writer_guard = state.writer.lock().await;
    if let Some(writer) = writer_guard.as_mut() {
        // Очистка экрана в PowerShell (ANSI escape sequence)
        writer
            .write_all("\x1b[2J\x1b[1;1H".as_bytes()) // Очищает экран и перемещает курсор в начало
            .map_err(|e| format!("Failed to clear terminal: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    } else {
        Err("PTY writer not initialized".to_string())
    }
}

#[tauri::command]
pub async fn close_terminal_process(state: State<'_, PtyState>) -> Result<(), String> {
    println!("Попытка закрытия процесса терминала...");
    
    // Очистка writer
    {
        let mut writer_guard = state.writer.lock().await;
        if let Some(writer) = writer_guard.as_mut() {
            // Отправка команды выхода в PowerShell
            let _ = writer.write_all("exit\r\n".as_bytes());
            let _ = writer.flush();
        }
        // Освобождение ресурса
        *writer_guard = None;
        println!("Writer очищен");
    }
    
    // Освобождение master PTY
    {
        let mut master_guard = state.master.lock().await;
        *master_guard = None;
        println!("Master PTY очищен");
    }
    
    println!("Процесс терминала успешно закрыт");
    Ok(())
} 