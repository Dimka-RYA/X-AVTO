use std::env;
use std::fs;
use std::process::{Command, Stdio};
use std::io::{Read, Write};
use std::path::PathBuf;
use tempfile::{tempdir, TempDir};
use tauri::command;
use uuid::Uuid;

/// Функция для запуска скрипта на исполнение
#[command]
pub fn run_script(script: String, language: String) -> Result<String, String> {
    // Создаем временную директорию для хранения скрипта
    let temp_dir = tempdir().map_err(|e| format!("Ошибка при создании временной директории: {}", e))?;
    
    // Генерируем имя файла с расширением в зависимости от языка
    let script_id = Uuid::new_v4().to_string();
    
    // Настраиваем команды в зависимости от языка и платформы
    let (filename, command, args) = match language.as_str() {
        "python" => (format!("script_{}.py", script_id), "python".to_string(), vec![]),
        "powershell" => (format!("script_{}.ps1", script_id), "powershell".to_string(), vec!["-ExecutionPolicy".to_string(), "Bypass".to_string()]),
        "shell" => {
            #[cfg(unix)]
            {
                (format!("script_{}.sh", script_id), "bash".to_string(), vec![])
            }
            #[cfg(windows)]
            {
                // На Windows пытаемся найти доступный bash-подобный интерпретатор
                let wsl_check = Command::new("wsl")
                    .arg("--version")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
                
                let has_wsl = match wsl_check {
                    Ok(status) => status.success(),
                    Err(_) => false
                };
                
                let bash_check = Command::new("bash")
                    .arg("--version")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
                
                let has_bash = match bash_check {
                    Ok(status) => status.success(),
                    Err(_) => false
                };
                
                if has_wsl {
                    // WSL доступен
                    println!("[Script Runner] WSL обнаружен, используем его для запуска bash-скрипта");
                    (format!("script_{}.sh", script_id), "wsl".to_string(), vec!["bash".to_string()])
                } else if has_bash {
                    // Git Bash или другой bash доступен
                    println!("[Script Runner] Bash обнаружен, используем его для запуска скрипта");
                    (format!("script_{}.sh", script_id), "bash".to_string(), vec![])
                } else {
                    // Если bash не доступен, используем PowerShell с явным предупреждением
                    println!("[Script Runner] Bash не обнаружен, конвертируем в PowerShell");
                    // Конвертируем bash-скрипт в PowerShell-совместимый формат
                    let ps_script = format!(
                        "Write-Host \"Внимание: Bash не обнаружен на вашей системе. Попытка выполнить скрипт через PowerShell.\"
Write-Host \"Некоторые bash-команды могут не работать.\"
Write-Host \"\"
{}",
                        script
                    );
                    return run_script(ps_script, "powershell".to_string());
                }
            }
        },
        _ => return Err(format!("Неподдерживаемый язык: {}", language)),
    };
    
    // Собираем полный путь к временному файлу
    let file_path = temp_dir.path().join(&filename);
    
    // Записываем содержимое скрипта во временный файл
    if language == "powershell" {
        // Для PowerShell используем UTF-8 с BOM, чтобы Windows правильно распознавала кириллицу
        let mut file = fs::File::create(&file_path)
            .map_err(|e| format!("Ошибка при создании временного файла: {}", e))?;
        
        // Пишем BOM (Byte Order Mark) для UTF-8
        file.write_all(&[0xEF, 0xBB, 0xBF])
            .map_err(|e| format!("Ошибка при записи BOM: {}", e))?;
        
        // Пишем содержимое скрипта
        file.write_all(script.as_bytes())
            .map_err(|e| format!("Ошибка при записи скрипта во временный файл: {}", e))?;
    } else {
        // Для других языков используем обычную запись
        fs::write(&file_path, script)
            .map_err(|e| format!("Ошибка при записи скрипта во временный файл: {}", e))?;
    }
    
    // Делаем файл исполняемым для bash-скриптов на Unix
    if language == "shell" {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&file_path)
                .map_err(|e| format!("Ошибка при получении метаданных файла: {}", e))?
                .permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&file_path, perms)
                .map_err(|e| format!("Ошибка при установке прав доступа: {}", e))?;
        }
    }
    
    // Создаем команду для запуска скрипта
    let mut cmd_args = args;
    
    // Для WSL передаем путь к файлу в другом формате
    #[cfg(windows)]
    let file_path_str = if command == "wsl" {
        // Преобразуем путь Windows в формат WSL
        let wsl_path = file_path.to_string_lossy().to_string()
            .replace("\\", "/")
            .replace(":", "");
        format!("/mnt/{}", wsl_path)
    } else {
        file_path.to_string_lossy().to_string()
    };
    
    #[cfg(not(windows))]
    let file_path_str = file_path.to_string_lossy().to_string();
    
    // Обрабатываем путь к файлу в зависимости от языка
    if language == "powershell" {
        // Для PowerShell используем специальную команду с установкой кодировки UTF-8
        cmd_args.push("-Command".to_string());
        cmd_args.push(format!("$OutputEncoding = [System.Text.Encoding]::UTF8; & '{}'", file_path_str));
    } else {
        // Для остальных языков просто добавляем путь как аргумент
        cmd_args.push(file_path_str);
    }
    
    println!("[Script Runner] Запуск скрипта командой: {} {:?}", command, cmd_args);
    
    let output = Command::new(&command)
        .args(&cmd_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Ошибка при запуске скрипта: {}\nКоманда: {} {:?}", e, command, cmd_args))?;
    
    // Получаем вывод и ошибки
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    // Формируем результат выполнения
    let mut result = String::new();
    if !stdout.is_empty() {
        result.push_str(&stdout);
    }
    
    if !stderr.is_empty() {
        if !result.is_empty() {
            result.push_str("\n\n");
        }
        result.push_str("ОШИБКА:\n");
        result.push_str(&stderr);
    }
    
    // Добавляем информацию о коде возврата
    result.push_str(&format!("\n\nКод возврата: {}", output.status.code().unwrap_or(-1)));
    
    // Временная директория будет удалена автоматически при выходе из функции
    Ok(result)
} 