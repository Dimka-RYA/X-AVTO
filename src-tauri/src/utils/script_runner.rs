use std::fs;
use std::process::{Command, Stdio};
use std::io::Write;
use tauri::command;
use uuid::Uuid;
use tempfile::tempdir;
use std::env;
use std::path::PathBuf;
use serde_json;

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
    } else if language == "python" {
        // Для Python добавляем параметры для обработки UTF-8
        cmd_args.clear(); // Очищаем предыдущие аргументы
        
        // Используем специальный аргумент PYTHONIOENCODING для корректной работы с русскими символами
        // и добавляем -u для отключения буферизации вывода
        #[cfg(windows)]
        {
            cmd_args.push("-u".to_string());
            cmd_args.push(file_path_str);
            
            // Устанавливаем переменную окружения для кодировки UTF-8
            std::env::set_var("PYTHONIOENCODING", "utf-8");
        }
        #[cfg(not(windows))]
        {
            cmd_args.push("-u".to_string());
            cmd_args.push(file_path_str);
        }
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

/// Функция для сохранения скрипта в файл
/// Эта функция сохраняет скрипт в папку "Документы" пользователя
#[command]
pub async fn save_script(_app: tauri::AppHandle, script: String, language: String) -> Result<String, String> {
    // Определяем расширение файла в зависимости от языка
    let extension = match language.as_str() {
        "python" => "py",
        "powershell" => "ps1",
        "shell" => "sh",
        _ => "txt"
    };
    
    // Генерируем уникальное имя файла
    let script_id = Uuid::new_v4().to_string();
    let filename = format!("script_{}_{}.{}", language, script_id, extension);
    
    // Пытаемся получить директорию Документы пользователя
    let home_dir = match env::var("USERPROFILE")
        .or_else(|_| env::var("HOME")) {
        Ok(path) => path,
        Err(_) => return Err("Не удалось определить домашнюю директорию пользователя".to_string())
    };
    
    // Создаем путь к директории "Документы/XAdmin/scripts"
    let mut scripts_dir = std::path::PathBuf::from(home_dir);
    scripts_dir.push("Documents");
    scripts_dir.push("XAdmin");
    scripts_dir.push("scripts");
    
    // Создаем директорию, если она не существует
    if !scripts_dir.exists() {
        fs::create_dir_all(&scripts_dir)
            .map_err(|e| format!("Ошибка при создании директории scripts: {}", e))?;
    }
    
    // Формируем полный путь к файлу
    let file_path = scripts_dir.join(&filename);
    
    // Сохраняем скрипт в файл
    match fs::write(&file_path, script) {
        Ok(_) => {
            // Получаем абсолютный путь для лучшего отображения пользователю
            let display_path = file_path.display().to_string();
            Ok(format!("Скрипт успешно сохранен в {}", display_path))
        },
        Err(e) => Err(format!("Ошибка при сохранении файла: {}", e))
    }
}

/// Функция для сохранения скрипта через диалоговое окно выбора файла
/// в зависимости от выбранного языка (python, powershell, shell)
#[command]
pub async fn save_script_by_language(app: tauri::AppHandle, script: String, language: String, extension: String, suggested_name: String) -> Result<String, String> {
    // Вместо сохранения на сервере, мы вернем скрипт обратно клиенту вместе с мета-информацией
    let file_name = if !suggested_name.is_empty() {
        suggested_name
    } else {
        // Уникальное имя файла по умолчанию
        let script_id = Uuid::new_v4().to_string().split('-').next().unwrap_or("script").to_string();
        format!("script_{}_{}{}", language, script_id, extension)
    };

    // Подготовка информации для фронтенда
    Ok(serde_json::json!({
        "fileName": file_name,
        "content": script,
        "language": language,
        "extension": extension,
        "withBom": language == "powershell"
    }).to_string())
}

/// Функция для сохранения скрипта через диалоговое окно выбора пути
#[command]
pub async fn save_script_with_custom_path(app: tauri::AppHandle, script: String, language: String, extension: String, suggested_name: String) -> Result<String, String> {
    // Определяем директорию для сохранения - по умолчанию Documents
    let home_dir = match env::var("USERPROFILE").or_else(|_| env::var("HOME")) {
        Ok(path) => path,
        Err(_) => return Err("Не удалось определить домашнюю директорию пользователя".to_string())
    };
    
    // Формируем путь к директории Documents
    let mut docs_dir = PathBuf::from(home_dir);
    docs_dir.push("Documents");
    
    // Формируем имя файла
    let file_name = if !suggested_name.is_empty() {
        suggested_name
    } else {
        let script_id = Uuid::new_v4().to_string().split('-').next().unwrap_or("script").to_string();
        format!("script_{}_{}{}", language, script_id, extension)
    };
    
    // Формируем полный путь
    let file_path = docs_dir.join(&file_name);
    
    // Убедимся, что директория существует
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Ошибка при создании директории: {}", e))?;
        }
    }
    
    // Сохраняем файл
    let result = if language == "powershell" {
        // Для PowerShell используем UTF-8 с BOM
        let mut file = fs::File::create(&file_path)
            .map_err(|e| format!("Ошибка при создании файла: {}", e))?;
        
        file.write_all(&[0xEF, 0xBB, 0xBF])
            .and_then(|_| file.write_all(script.as_bytes()))
            .map_err(|e| format!("Ошибка при записи в файл: {}", e))
    } else {
        // Для остальных языков стандартная запись
        fs::write(&file_path, script)
            .map_err(|e| format!("Ошибка при сохранении файла: {}", e))
    };
    
    match result {
        Ok(_) => {
            // Возвращаем путь к сохраненному файлу и просим пользователя использовать опцию "Сохранить как..." в браузере
            Ok(format!("Скрипт успешно сохранен в {}. Для выбора другого местоположения воспользуйтесь опцией \"Сохранить как...\" в браузере.", file_path.display()))
        },
        Err(e) => Err(e)
    }
}

/// Функция для сохранения файла в указанном пути
#[command]
pub async fn save_file_to_path(path: String, content: String, with_bom: bool) -> Result<String, String> {
    // Создаем промежуточные директории, если их нет
    if let Some(parent) = PathBuf::from(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Ошибка при создании директории: {}", e))?;
        }
    }
    
    // Сохраняем файл с BOM или без, в зависимости от параметра
    let result = if with_bom {
        // Для PowerShell используем UTF-8 с BOM для корректной обработки кириллицы
        let mut file = fs::File::create(path.clone())
            .map_err(|e| format!("Ошибка при создании файла: {}", e))?;
        
        // Добавляем BOM для UTF-8
        file.write_all(&[0xEF, 0xBB, 0xBF])
            .and_then(|_| file.write_all(content.as_bytes()))
            .map_err(|e| format!("Ошибка при записи в файл: {}", e))
    } else {
        // Для других языков - обычная запись
        fs::write(path.clone(), content)
            .map_err(|e| format!("Ошибка при сохранении файла: {}", e))
    };
    
    match result {
        Ok(_) => Ok(format!("Файл успешно сохранен в {}", path)),
        Err(e) => Err(e)
    }
} 