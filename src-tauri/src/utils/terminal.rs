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
    
    // Упрощаем команду PowerShell для более надежной работы с UTF-8
    cmd.args([
        "-NoExit", 
        "-Command", 
        "& {
            # Настраиваем UTF-8 для правильной работы с кириллицей
            $OutputEncoding = [Console]::OutputEncoding = [Console]::InputEncoding = [System.Text.Encoding]::UTF8; 
            [Console]::InputEncoding = [System.Text.Encoding]::UTF8;
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
            chcp 65001 | Out-Null; 
            Clear-Host; 
            
            # Выводим приветственное сообщение один раз при запуске
            Write-Host ('Терминал X-Avto #' + [string]$PID + ' готов к работе!') -ForegroundColor Green; 
            
            # Предотвращаем дублирование вывода
            $ErrorActionPreference = 'Continue'
            
            # Функция для форматирования приглашения PowerShell с более заметными цветами
            function prompt {
                # Добавляем пустую строку для лучшей читаемости
                Write-Host '' -NoNewline;
                $curDir = (Get-Location).Path;
                Write-Host 'PS ' -NoNewline -ForegroundColor Cyan;
                Write-Host $curDir -NoNewline -ForegroundColor Yellow;
                Write-Host '>' -NoNewline -ForegroundColor Cyan;
                return ' '  # Пробел после приглашения для лучшего ввода
            }
            
            # Принудительно выводим первое приглашение чистым образом
            Write-Host '';
            Write-Host 'PS ' -NoNewline -ForegroundColor Cyan;
            Write-Host (Get-Location).Path -NoNewline -ForegroundColor Yellow;
            Write-Host '>' -NoNewline -ForegroundColor Cyan;
            Write-Host ' ' -NoNewline;
            
            # Сбрасываем буфер вывода
            [Console]::Out.Flush();
        }"
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
        tokio::time::sleep(tokio::time::Duration::from_millis(700)).await;

        // Принудительно отправляем приветственное сообщение и командную строку
        let initial_message = format!("Терминал X-Avto #{} готов к работе!\r\n\nPS C:\\Users\\> ", terminal_id);
        match app_handle.emit("pty-output", (terminal_id, initial_message)) {
            Ok(_) => println!("Sent initial prompt for terminal {}", terminal_id),
            Err(e) => eprintln!("Error sending initial prompt for terminal {}: {}", terminal_id, e),
        }
        
        // Используем структуру для более точного отслеживания вывода
        struct TerminalOutput {
            last_lines: Vec<String>,              // Последние отправленные строки
            current_buffer: String,               // Текущий буфер для накопления строк
            last_send_time: std::time::Instant,   // Время последней отправки
            max_buffer_size: usize,               // Максимальный размер буфера перед принудительной отправкой
            always_send_next: bool,               // Флаг для принудительной отправки следующего чанка
            error_count: usize,                   // Счетчик сообщений об ошибках для контроля дублирования
            pending_input: bool,                  // Флаг ожидания ввода пользователя
        }
        
        let mut output = TerminalOutput {
            last_lines: Vec::with_capacity(20),   // Храним последние 20 строк
            current_buffer: String::new(),
            last_send_time: std::time::Instant::now(),
            max_buffer_size: 4096,                // 4Кб максимальный размер буфера
            always_send_next: true,               // Первый полученный чанк всегда отправляем
            error_count: 0,
            pending_input: false,
        };
        
        // Улучшенная функция для определения дубликатов строк
        let is_duplicate_line = |line: &str, sent_lines: &[String], error_count: &mut usize| -> bool {
            // Игнорируем пустые строки и чисто служебные символы
            if line.trim().is_empty() || line.trim().len() < 2 {
                return false;
            }
            
            // Никогда не фильтруем строки приглашения командной строки
            if line.contains("PS ") || line.ends_with(">") || line.ends_with("> ") || line.contains("готов к работе") {
                return false;
            }
            
            // Строки с ошибками часто дублируются в PowerShell
            let error_markers = [
                "CommandNotFoundException",
                "ObjectNotFound",
                "CategoryInfo",
                "FullyQualifiedErrorId",
                "+ CategoryInfo",
                "+ FullyQualifiedErrorId",
                "не распознано как имя",
                "Проверьте правильность",
                "строка:"
            ];
            
            // Особая обработка ошибок для предотвращения множественных дубликатов
            for marker in &error_markers {
                if line.contains(marker) {
                    *error_count += 1;
                    
                    // Если слишком много сообщений об ошибках, начинаем более агрессивно фильтровать
                    if *error_count > 5 {
                        // Сравниваем с последними отправленными строками
                        for last_line in sent_lines.iter().rev().take(10) {
                            if last_line.contains(marker) || 
                               (line.len() > 10 && last_line.len() > 10 && 
                                (last_line.contains(line) || line.contains(last_line))) {
                                return true;
                            }
                        }
                    }
                }
            }
            
            // Проверка на точные дубликаты среди последних строк
            for sent in sent_lines.iter().rev().take(5) {
                if sent == line || 
                   (sent.len() > 15 && line.len() > 15 && 
                    (sent.contains(line) || line.contains(sent))) {
                    return true;
                }
            }
            
            false
        };
        
        // Переменные для контроля последовательных идентичных чанков
        let mut last_raw_chunk = String::new();
        let mut consecutive_identical_chunks = 0;
        
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    println!("EOF reached in terminal {} reader", terminal_id);
                    break;
                },
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buffer[..n]).to_string();
                    
                    // Убеждаемся, что командная строка отображается корректно
                    let contains_prompt = chunk.contains("PS ") || chunk.contains("> ");
                    
                    // Проверка на идентичные последовательные чанки (возможное зацикливание)
                    // Исключаем проверку для промптов и важных сообщений
                    if chunk == last_raw_chunk && 
                       !contains_prompt && 
                       !chunk.contains("готов к работе") {
                        consecutive_identical_chunks += 1;
                        if consecutive_identical_chunks > 2 {
                            println!("Skipping repeated chunk for terminal {}", terminal_id);
                            continue;
                        }
                    } else {
                        consecutive_identical_chunks = 0;
                        last_raw_chunk = chunk.clone();
                    }
                    
                    // Если строка содержит приглашение, отправляем её без дополнительной обработки
                    if contains_prompt || output.always_send_next {
                        println!("Sending prompt or forced chunk for terminal {}: {} bytes", terminal_id, chunk.len());
                        match app_handle.emit("pty-output", (terminal_id, chunk.clone())) {
                            Ok(_) => {
                                output.last_send_time = std::time::Instant::now();
                                output.always_send_next = false;
                                output.pending_input = true;  // После приглашения ожидаем ввод
                            },
                            Err(e) => eprintln!("Error emitting prompt for terminal {}: {}", terminal_id, e),
                        }
                        
                        // Добавляем в буфер для обработки строк
                        output.current_buffer.push_str(&chunk);
                    } else {
                        // Обычное добавление в буфер
                        output.current_buffer.push_str(&chunk);
                    }
                    
                    // Если в буфере есть полные строки, обрабатываем их
                    if output.current_buffer.contains('\n') {
                        let mut send_buffer = String::new();
                        let mut lines: Vec<&str> = output.current_buffer.split('\n').collect();
                        
                        // Последняя строка может быть не полной, оставляем её в буфере
                        let incomplete_line = if !output.current_buffer.ends_with('\n') {
                            lines.pop().unwrap_or("")
                        } else {
                            ""
                        };
                        
                        // Обрабатываем каждую полную строку
                        for line in &lines {
                            // Проверяем, является ли строка приглашением командной строки
                            let is_prompt = line.contains("PS ") || 
                                           line.contains("> ") || 
                                           line.contains("готов к работе");
                            
                            // Пропускаем дублирующиеся строки, только если это не приглашение
                            if !is_prompt && is_duplicate_line(line, &output.last_lines, &mut output.error_count) {
                                println!("Skipping duplicate line: {}", line.trim());
                                
                                // Если пропустили сообщение об ошибке, проверяем необходимость отправки следующего чанка
                                if line.contains("не распознано") || 
                                   line.contains("CommandNotFound") || 
                                   line.contains("ObjectNotFound") {
                                    output.always_send_next = true;
                                }
                                continue;
                            }
                            
                            // Если это приглашение командной строки, устанавливаем флаг
                            if is_prompt {
                                output.always_send_next = true;
                                output.pending_input = true;
                                
                                // Сбрасываем счетчик ошибок при новом приглашении
                                output.error_count = 0;
                            }
                            
                            // Добавляем строку в буфер для отправки
                            send_buffer.push_str(line);
                            if !line.ends_with("\r") {
                                send_buffer.push('\n');
                            }
                            
                            // Сохраняем строку в истории отправленных строк, если она не пустая
                            if !line.trim().is_empty() {
                                output.last_lines.push(line.to_string());
                                // Ограничиваем размер истории
                                if output.last_lines.len() > 20 {
                                    output.last_lines.remove(0);
                                }
                            }
                        }
                        
                        // Отправляем буфер, если в нём есть данные
                        if !send_buffer.is_empty() {
                            match app_handle.emit("pty-output", (terminal_id, send_buffer)) {
                                Ok(_) => output.last_send_time = std::time::Instant::now(),
                                Err(e) => eprintln!("Error emitting output from terminal {}: {}", terminal_id, e),
                            }
                        }
                        
                        // Обновляем буфер, оставляя только неполную строку
                        output.current_buffer = incomplete_line.to_string();
                    }
                    
                    // Проверяем, не скопилось ли слишком много данных в буфере без переносов строк
                    if output.current_buffer.len() > output.max_buffer_size {
                        // Принудительно отправляем накопленный буфер
                        if !output.current_buffer.is_empty() {
                            let to_send = output.current_buffer.clone();
                            match app_handle.emit("pty-output", (terminal_id, to_send)) {
                                Ok(_) => {
                                    output.last_send_time = std::time::Instant::now();
                                    output.current_buffer.clear();
                                },
                                Err(e) => eprintln!("Error emitting buffer from terminal {}: {}", terminal_id, e),
                            }
                        }
                    }
                    
                    // Проверяем необходимость отправки буфера по истечении времени (для оперативности)
                    let elapsed = std::time::Instant::now().duration_since(output.last_send_time);
                    if (elapsed.as_millis() > 100 && !output.current_buffer.is_empty() && output.pending_input) || 
                       (elapsed.as_millis() > 200 && !output.current_buffer.is_empty()) {
                        let to_send = output.current_buffer.clone();
                        match app_handle.emit("pty-output", (terminal_id, to_send)) {
                            Ok(_) => {
                                output.last_send_time = std::time::Instant::now();
                                output.current_buffer.clear();
                            },
                            Err(e) => eprintln!("Error emitting timed buffer from terminal {}: {}", terminal_id, e),
                        }
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
        // Убедимся, что входящие данные корректно обрабатываются (особенно для кириллицы)
        let input_bytes = input.as_bytes().to_vec();
        
        // Отправляем входные данные в терминал
        terminal.writer
            .write_all(&input_bytes)
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        terminal.writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        
        println!("Input sent to terminal {}: {} bytes", terminal_id, input_bytes.len());
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