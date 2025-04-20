use rusqlite::{Connection, Result, params};
use serde::{Serialize, Deserialize};
use std::path::Path;
use std::fs;
use std::sync::{Arc, Mutex};
use chrono::prelude::*;
use tauri::{AppHandle, Manager};

// Структура для хранения данных о команде в истории
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerminalCommandRecord {
    pub id: Option<i64>,
    pub terminal_tab_id: i64,
    pub command: String,
    pub time: String,
    pub status: Option<String>,
    pub exit_code: Option<i32>,
    pub output: Option<String>,
}

// Структура для хранения данных о вкладке терминала
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerminalTabRecord {
    pub id: i64,
    pub name: String,
    pub last_used: String,
}

// Состояние для хранения соединения с БД и управления им
pub struct DbState {
    connection: Arc<Mutex<Connection>>,
}

impl DbState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        // Получаем путь к директории приложения
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Не удалось получить директорию приложения: {}", e))?;
        
        // Создаем директорию, если она не существует
        if !app_dir.exists() {
            fs::create_dir_all(&app_dir)
                .map_err(|e| format!("Не удалось создать директорию: {}", e))?;
        }
        
        // Создаем путь к файлу базы данных
        let db_path = app_dir.join("terminals.db");
        println!("Используем базу данных по пути: {:?}", db_path);
        
        // Открываем соединение с БД
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Не удалось открыть соединение с БД: {}", e))?;
        
        // Инициализируем БД
        Self::initialize_db(&conn)?;
        
        Ok(DbState {
            connection: Arc::new(Mutex::new(conn)),
        })
    }
    
    // Инициализация схемы БД
    fn initialize_db(conn: &Connection) -> Result<(), String> {
        // Таблица для хранения вкладок терминала
        conn.execute(
            "CREATE TABLE IF NOT EXISTS terminal_tabs (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                last_used TEXT NOT NULL
            )",
            [],
        ).map_err(|e| format!("Не удалось создать таблицу terminal_tabs: {}", e))?;
        
        // Таблица для хранения истории команд
        conn.execute(
            "CREATE TABLE IF NOT EXISTS terminal_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                terminal_tab_id INTEGER NOT NULL,
                command TEXT NOT NULL,
                time TEXT NOT NULL,
                status TEXT,
                exit_code INTEGER,
                output TEXT,
                FOREIGN KEY (terminal_tab_id) REFERENCES terminal_tabs (id)
            )",
            [],
        ).map_err(|e| format!("Не удалось создать таблицу terminal_commands: {}", e))?;
        
        println!("Схема БД успешно инициализирована");
        Ok(())
    }
}

// Команды для работы с БД

#[tauri::command]
pub async fn save_terminal_tab(
    state: tauri::State<'_, DbState>,
    tab: TerminalTabRecord,
) -> Result<(), String> {
    let conn = state.connection.lock()
        .map_err(|e| format!("Ошибка блокировки мьютекса: {}", e))?;
    
    conn.execute(
        "INSERT OR REPLACE INTO terminal_tabs (id, name, last_used) VALUES (?, ?, ?)",
        params![tab.id, tab.name, tab.last_used],
    ).map_err(|e| format!("Не удалось сохранить вкладку: {}", e))?;
    
    println!("Сохранена вкладка с ID: {}", tab.id);
    Ok(())
}

#[tauri::command]
pub async fn get_saved_terminal_tabs(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<TerminalTabRecord>, String> {
    let conn = state.connection.lock()
        .map_err(|e| format!("Ошибка блокировки мьютекса: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT id, name, last_used FROM terminal_tabs ORDER BY last_used DESC")
        .map_err(|e| format!("Ошибка подготовки запроса: {}", e))?;
    
    let rows = stmt.query_map([], |row| {
        Ok(TerminalTabRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            last_used: row.get(2)?,
        })
    }).map_err(|e| format!("Ошибка выполнения запроса: {}", e))?;
    
    let mut tabs = Vec::new();
    for row in rows {
        tabs.push(row.map_err(|e| format!("Ошибка чтения строки: {}", e))?);
    }
    
    println!("Загружено {} вкладок из БД", tabs.len());
    Ok(tabs)
}

#[tauri::command]
pub async fn delete_terminal_tab(
    state: tauri::State<'_, DbState>,
    tab_id: i64,
) -> Result<(), String> {
    let mut conn = state.connection.lock()
        .map_err(|e| format!("Ошибка блокировки мьютекса: {}", e))?;
    
    // Начинаем транзакцию
    let tx = conn.transaction()
        .map_err(|e| format!("Ошибка создания транзакции: {}", e))?;
    
    // Сначала удаляем все команды для этой вкладки
    tx.execute(
        "DELETE FROM terminal_commands WHERE terminal_tab_id = ?",
        params![tab_id],
    ).map_err(|e| format!("Ошибка удаления команд: {}", e))?;
    
    // Затем удаляем саму вкладку
    tx.execute(
        "DELETE FROM terminal_tabs WHERE id = ?",
        params![tab_id],
    ).map_err(|e| format!("Ошибка удаления вкладки: {}", e))?;
    
    // Завершаем транзакцию
    tx.commit()
        .map_err(|e| format!("Ошибка фиксации транзакции: {}", e))?;
    
    println!("Удалена вкладка с ID: {}", tab_id);
    Ok(())
}

#[tauri::command]
pub async fn save_terminal_command(
    state: tauri::State<'_, DbState>,
    command: TerminalCommandRecord,
) -> Result<i64, String> {
    let conn = state.connection.lock()
        .map_err(|e| format!("Ошибка блокировки мьютекса: {}", e))?;
    
    // Если ID уже существует, обновляем запись
    if let Some(id) = command.id {
        conn.execute(
            "UPDATE terminal_commands SET 
             terminal_tab_id = ?, command = ?, time = ?, status = ?, exit_code = ?, output = ?
             WHERE id = ?",
            params![
                command.terminal_tab_id, command.command, command.time, 
                command.status, command.exit_code, command.output, id
            ],
        ).map_err(|e| format!("Не удалось обновить команду: {}", e))?;
        
        println!("Обновлена команда с ID: {}", id);
        return Ok(id);
    }
    
    // Проверяем, нет ли уже такой же команды с тем же временем
    // Это предотвратит дублирование команд в БД
    let mut stmt = conn.prepare(
        "SELECT id FROM terminal_commands 
         WHERE terminal_tab_id = ? AND command = ? AND time = ? 
         LIMIT 1"
    ).map_err(|e| format!("Ошибка подготовки запроса: {}", e))?;
    
    let existing_ids: Vec<i64> = stmt.query_map(
        params![command.terminal_tab_id, command.command, command.time],
        |row| row.get(0)
    )
    .map_err(|e| format!("Ошибка выполнения запроса: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    // Если команда с таким же текстом и временем уже существует, обновляем её
    if let Some(existing_id) = existing_ids.first() {
        conn.execute(
            "UPDATE terminal_commands SET 
             status = ?, exit_code = ?, output = ?
             WHERE id = ?",
            params![
                command.status, command.exit_code, command.output, existing_id
            ],
        ).map_err(|e| format!("Не удалось обновить существующую команду: {}", e))?;
        
        println!("Обновлена существующая команда с ID: {}", existing_id);
        return Ok(*existing_id);
    }
    
    // Иначе создаем новую запись
    conn.execute(
        "INSERT INTO terminal_commands 
         (terminal_tab_id, command, time, status, exit_code, output)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![
            command.terminal_tab_id, command.command, command.time, 
            command.status, command.exit_code, command.output
        ],
    ).map_err(|e| format!("Не удалось сохранить команду: {}", e))?;
    
    let id = conn.last_insert_rowid();
    println!("Сохранена новая команда с ID: {}", id);
    Ok(id)
}

#[tauri::command]
pub async fn get_terminal_commands(
    state: tauri::State<'_, DbState>,
    tab_id: i64,
) -> Result<Vec<TerminalCommandRecord>, String> {
    let conn = state.connection.lock()
        .map_err(|e| format!("Ошибка блокировки мьютекса: {}", e))?;
    
    let mut stmt = conn.prepare(
        "SELECT id, terminal_tab_id, command, time, status, exit_code, output 
         FROM terminal_commands 
         WHERE terminal_tab_id = ? 
         ORDER BY id ASC"
    ).map_err(|e| format!("Ошибка подготовки запроса: {}", e))?;
    
    let rows = stmt.query_map(params![tab_id], |row| {
        Ok(TerminalCommandRecord {
            id: Some(row.get(0)?),
            terminal_tab_id: row.get(1)?,
            command: row.get(2)?,
            time: row.get(3)?,
            status: row.get(4)?,
            exit_code: row.get(5)?,
            output: row.get(6)?,
        })
    }).map_err(|e| format!("Ошибка выполнения запроса: {}", e))?;
    
    let mut commands = Vec::new();
    for row in rows {
        commands.push(row.map_err(|e| format!("Ошибка чтения строки: {}", e))?);
    }
    
    println!("Загружено {} команд для вкладки {}", commands.len(), tab_id);
    Ok(commands)
}

#[tauri::command]
pub async fn delete_terminal_command(
    state: tauri::State<'_, DbState>,
    command_id: i64,
) -> Result<(), String> {
    let conn = state.connection.lock()
        .map_err(|e| format!("Ошибка блокировки мьютекса: {}", e))?;
    
    conn.execute(
        "DELETE FROM terminal_commands WHERE id = ?",
        params![command_id],
    ).map_err(|e| format!("Ошибка удаления команды: {}", e))?;
    
    println!("Удалена команда с ID: {}", command_id);
    Ok(())
}

#[tauri::command]
pub async fn clear_terminal_history(
    state: tauri::State<'_, DbState>,
    tab_id: i64,
) -> Result<(), String> {
    let conn = state.connection.lock()
        .map_err(|e| format!("Ошибка блокировки мьютекса: {}", e))?;
    
    conn.execute(
        "DELETE FROM terminal_commands WHERE terminal_tab_id = ?",
        params![tab_id],
    ).map_err(|e| format!("Ошибка очистки истории: {}", e))?;
    
    println!("Очищена история для вкладки с ID: {}", tab_id);
    Ok(())
} 