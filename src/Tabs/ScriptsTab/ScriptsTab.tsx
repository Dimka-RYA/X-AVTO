import React, { useState, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import "./ScriptsTab.css";

// Типы для языков программирования
type LanguageType = "powershell" | "shell" | "python";

// Интерфейс для скриптов
interface ScriptItem {
  id: number;
  name: string;
  timestamp: string;
  language: LanguageType;
  content?: string;
}

// Интерфейс для ошибок
interface ScriptError {
  lineNumber: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// Пример содержимого скрипта Python
const DEMO_SCRIPT_PYTHON = `import os
import sys
import time

def check_system():
    print("Проверка системы...")
    # Получаем информацию о системе
    system_info = os.uname()
    print(f"Операционная система: {system_info.sysname}")
    print(f"Версия: {system_info.release}")
    
    # Проверяем свободное место
    disk_space = os.statvfs('/')
    free_space = disk_space.f_frsize * disk_space.f_bavail
    total_space = disk_space.f_frsize * disk_space.f_blocks
    used_space = total_space - free_space
    
    print(f"Использовано диска: {used_space / total_space:.2f}%")
    return True

if __name__ == "__main__":
    success = check_system()
    print("Статус выполнения:", success)`;

// Пример содержимого скрипта Python с ошибками для демонстрации подсветки
const DEMO_SCRIPT_PYTHON_WITH_ERROR = `import os
import sys
import time

def check_system():
    print("Проверка системы..."
    # Отсутствует закрывающая скобка
    
    # Неопределенная переменная
    print(f"Текущее время: {current_time}")
    
    # Неверный отступ
  system_info = os.uname()
    
    # Незакрытая строка
    print("Операционная система: + system_info.sysname)
    
    return True  # Эта строка не будет достигнута из-за ошибок выше

if __name__ == "__main__":
    check_system()`;

// Пример содержимого скрипта PowerShell
const DEMO_SCRIPT_POWERSHELL = `# Проверка системы с использованием PowerShell
Write-Host "Проверка системы..."

# Получаем информацию о системе
$osInfo = Get-CimInstance Win32_OperatingSystem
Write-Host "Операционная система: $($osInfo.Caption)"
Write-Host "Версия: $($osInfo.Version)"

# Проверяем свободное место на диске C:
$disk = Get-PSDrive C
$totalSpace = $disk.Used + $disk.Free
$usedSpace = $disk.Used
$usagePercent = [math]::Round(($usedSpace / $totalSpace) * 100, 2)

Write-Host "Использовано диска: $usagePercent%"

# Возвращаем статус
$success = $true
Write-Host "Статус выполнения: $success"
Exit $success`;

// Пример содержимого скрипта PowerShell с ошибками для демонстрации подсветки
const DEMO_SCRIPT_POWERSHELL_WITH_ERROR = `# Проверка системы с использованием PowerShell
Write-Host "Проверка системы...

# Неверное использование командлета
Get-Process -InvalidParameter 

# Неверный синтаксис переменной
$totalSpace = $disk.Used + $disk.Free}

# Незакрытая скобка
if ($disk.Free -lt 1GB {
    Write-Host "Мало свободного места!"
}

# Ошибка в команде
Wrong-Command

# Несогласованный синтаксис
Write-Host "Статус: $success`;

// Пример содержимого скрипта Bash
const DEMO_SCRIPT_BASH = `#!/bin/bash
# Проверка системы с использованием Bash

echo "Проверка системы..."

# Получаем информацию о системе
OS_INFO=$(uname -a)
echo "Операционная система: $(uname -s)"
echo "Версия: $(uname -r)"

# Проверяем свободное место на корневом разделе
DISK_INFO=$(df -h / | tail -n 1)
USED_PERCENT=$(echo $DISK_INFO | awk '{print $5}')

echo "Использовано диска: $USED_PERCENT"

# Возвращаем статус
SUCCESS=true
echo "Статус выполнения: $SUCCESS"
exit 0`;

// Пример содержимого скрипта Bash с ошибками для демонстрации подсветки
const DEMO_SCRIPT_BASH_WITH_ERROR = `#!/bin/bash
# Проверка системы с использованием Bash

echo "Проверка системы...

# Неверный синтаксис условия
if [ $FREE_SPACE < 1000 ]
then
    echo "Мало свободного места!"
fi

# Неизвестная команда
unknown_command

# Незакрытая кавычка
echo "Текущая директория: $(pwd)

# Неверный синтаксис переменной
$VARIABLE=value

# Отсутствие закрывающей скобки
function check_disk {
    df -h
    echo "Проверка завершена"`;

// Пример вывода консоли
const DEMO_CONSOLE_OUTPUT = `Проверка системы...
Операционная система: Linux
Версия: 5.15.0-76-generic
Использовано диска: 0.45%
Статус выполнения: True`;

// Пример данных скриптов с добавленным полем language
const DEMO_SCRIPTS = [
  { id: 1, name: "скрипт 1", timestamp: "22 апр 18:37:43", language: "python" as LanguageType },
  { id: 2, name: "скриптовый", timestamp: "22 апр 18:37:43", language: "powershell" as LanguageType },
  { id: 3, name: "скрипт с ошибкой", timestamp: "22 апр 18:37:43", language: "python" as LanguageType, content: DEMO_SCRIPT_PYTHON_WITH_ERROR },
  { id: 4, name: "bash ошибка", timestamp: "22 апр 18:37:43", language: "shell" as LanguageType, content: DEMO_SCRIPT_BASH_WITH_ERROR },
  { id: 5, name: "powershell ошибка", timestamp: "22 апр 18:37:43", language: "powershell" as LanguageType, content: DEMO_SCRIPT_POWERSHELL_WITH_ERROR },
];

// Компоненты выбора языка
const LanguageSelector: React.FC<{
  language: LanguageType;
  onChange: (lang: LanguageType) => void;
}> = ({ language, onChange }) => {
  return (
    <div className="language-selector">
      <select 
        value={language} 
        onChange={(e) => onChange(e.target.value as LanguageType)}
        className="language-select"
      >
        <option value="python">Python</option>
        <option value="powershell">PowerShell</option>
        <option value="shell">Bash</option>
      </select>
    </div>
  );
};

// Определяем типы для Monaco Editor
type Monaco = typeof import("monaco-editor");

const ScriptsTab: React.FC = () => {
  const [activeScript, setActiveScript] = useState<number | null>(1);
  const [activeTab, setActiveTab] = useState<string>("Скрипт 1");
  const [scriptContent, setScriptContent] = useState<string>(DEMO_SCRIPT_PYTHON);
  const [language, setLanguage] = useState<LanguageType>("python");
  const [scripts, setScripts] = useState<ScriptItem[]>(DEMO_SCRIPTS);
  const [consoleOutput, setConsoleOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [errors, setErrors] = useState<ScriptError[]>([]);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);

  // Получаем шаблонный код для выбранного языка
  const getTemplateForLanguage = (lang: LanguageType): string => {
    switch (lang) {
      case "python":
        return DEMO_SCRIPT_PYTHON;
      case "powershell":
        return DEMO_SCRIPT_POWERSHELL;
      case "shell":
        return DEMO_SCRIPT_BASH;
      default:
        return DEMO_SCRIPT_PYTHON;
    }
  };

  // Обработчик выбора скрипта
  const handleScriptSelect = (id: number) => {
    setActiveScript(id);
    const script = scripts.find(s => s.id === id);
    if (script) {
      setActiveTab(script.name);
      setLanguage(script.language);
      // Если у скрипта есть сохраненный контент, используем его, иначе используем шаблон
      setScriptContent(script.content || getTemplateForLanguage(script.language));
      
      // Сбрасываем вывод консоли при смене скрипта
      setConsoleOutput("");
      
      // Базовая проверка на наличие ошибок
      checkForErrors(script.content || getTemplateForLanguage(script.language), script.language);
    }
  };

  // Функция для проверки ошибок в скрипте
  const checkForErrors = (content: string, lang: LanguageType) => {
    // Это упрощенная демонстрационная проверка
    // В реальном приложении здесь был бы интегрирован настоящий линтер
    const newErrors: ScriptError[] = [];
    
    const lines = content.split('\n');
    
    // Проверяем на очевидные ошибки синтаксиса (очень примитивно)
    lines.forEach((line, index) => {
      // Проверка открытых/закрытых кавычек
      const doubleQuotes = (line.match(/"/g) || []).length;
      const singleQuotes = (line.match(/'/g) || []).length;
      
      if (doubleQuotes % 2 !== 0) {
        newErrors.push({
          lineNumber: index + 1,
          message: 'Незакрытая двойная кавычка',
          severity: 'error'
        });
      }
      
      if (singleQuotes % 2 !== 0) {
        newErrors.push({
          lineNumber: index + 1,
          message: 'Незакрытая одинарная кавычка',
          severity: 'error'
        });
      }
      
      // Проверка открытых/закрытых скобок
      const openBrackets = (line.match(/\(/g) || []).length;
      const closeBrackets = (line.match(/\)/g) || []).length;
      
      if (openBrackets > closeBrackets) {
        newErrors.push({
          lineNumber: index + 1,
          message: 'Незакрытая круглая скобка',
          severity: 'error'
        });
      } else if (closeBrackets > openBrackets) {
        newErrors.push({
          lineNumber: index + 1,
          message: 'Лишняя закрывающая круглая скобка',
          severity: 'error'
        });
      }
      
      // Проверка наличия точки с запятой в конце строки для PowerShell
      if (lang === 'powershell' && line.trim().endsWith(';')) {
        newErrors.push({
          lineNumber: index + 1,
          message: 'В PowerShell точка с запятой в конце строки не обязательна',
          severity: 'warning'
        });
      }
    });
    
    setErrors(newErrors);
    
    // Если найдены ошибки, отображаем их в консоли
    if (newErrors.length > 0) {
      const errorMessages = newErrors.map(err => 
        `Строка ${err.lineNumber}: ${err.message} (${err.severity})`
      ).join('\n');
      
      setConsoleOutput(`Найдены проблемы в скрипте:\n${errorMessages}`);
    }
  };

  // Обработчик изменения содержимого скрипта
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setScriptContent(value);
      
      // Обновляем содержимое скрипта в массиве
      if (activeScript) {
        setScripts(prev => prev.map(script => 
          script.id === activeScript 
            ? { ...script, content: value } 
            : script
        ));
      }
      
      // Проверяем на ошибки при изменении кода
      checkForErrors(value, language);
    }
  };

  // Обработчик монтирования редактора
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    setEditorInstance(editor);
    setMonacoInstance(monaco);
    
    // Настраиваем редактор для подсветки ошибок
    monaco.editor.setModelMarkers(editor.getModel()!, 'owner', []);
    
    // Проверяем текущий скрипт на ошибки
    checkForErrors(scriptContent, language);
    
    // Добавляем подсветку для языков
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false
    });
    
    // Настройка для PowerShell
    if (language === 'powershell') {
      monaco.languages.registerCompletionItemProvider('powershell', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };
          
          return {
            suggestions: [
              {
                label: 'Write-Host',
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: 'Write-Host "${1:text}"',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Выводит текст в консоль PowerShell',
                range
              },
              {
                label: 'Get-Process',
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: 'Get-Process ${1:processName}',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Получает информацию о процессах',
                range
              }
            ]
          };
        }
      });
    }
  };

  // Обработчик изменения языка
  const handleLanguageChange = (lang: LanguageType) => {
    setLanguage(lang);
    
    // Обновляем язык скрипта в массиве
    if (activeScript) {
      setScripts(prev => prev.map(script => 
        script.id === activeScript 
          ? { ...script, language: lang } 
          : script
      ));
    }
    
    // Проверяем скрипт на ошибки при смене языка
    checkForErrors(scriptContent, lang);
  };

  // Эффект для отображения ошибок в редакторе
  useEffect(() => {
    if (editorInstance && monacoInstance) {
      // Преобразуем наши ошибки в маркеры Monaco
      const markers = errors.map(err => ({
        startLineNumber: err.lineNumber,
        startColumn: 1,
        endLineNumber: err.lineNumber,
        endColumn: 1000, // Подсвечиваем всю строку
        message: err.message,
        severity: err.severity === 'error' 
          ? monacoInstance.MarkerSeverity.Error 
          : err.severity === 'warning' 
            ? monacoInstance.MarkerSeverity.Warning 
            : monacoInstance.MarkerSeverity.Info
      }));
      
      // Устанавливаем маркеры в редакторе
      monacoInstance.editor.setModelMarkers(editorInstance.getModel(), 'owner', markers);
    }
  }, [errors, editorInstance, monacoInstance]);

  // Обработчик запуска скрипта
  const handleRunScript = () => {
    setIsRunning(true);
    setConsoleOutput("Запуск скрипта...\n");
    
    // Проверяем наличие ошибок перед выполнением
    checkForErrors(scriptContent, language);
    
    // Если есть ошибки, прерываем выполнение
    if (errors.length > 0) {
      setTimeout(() => {
        setConsoleOutput(prev => prev + "\nОшибка: найдены синтаксические ошибки в скрипте. Исправьте их перед запуском.");
        setIsRunning(false);
      }, 500);
      return;
    }
    
    // Имитация выполнения скрипта
    setTimeout(() => {
      setConsoleOutput(prev => prev + "\n" + DEMO_CONSOLE_OUTPUT);
      setIsRunning(false);
    }, 1500);
  };

  // Обработчик сохранения скрипта
  const handleSaveScript = () => {
    // Проверяем на ошибки перед сохранением
    checkForErrors(scriptContent, language);
    
    // Здесь будет логика сохранения скрипта
    alert(`Скрипт сохранен${errors.length > 0 ? ' (с ошибками)' : ''}`);
  };

  // Обработчик создания нового скрипта
  const handleNewScript = () => {
    const newId = Math.max(...scripts.map(s => s.id)) + 1;
    const newScript = {
      id: newId,
      name: `Новый скрипт ${newId}`,
      timestamp: new Date().toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      language: "python" as LanguageType,
      content: "# Новый скрипт\n\n# Введите код здесь"
    };
    
    setScripts([...scripts, newScript]);
    setActiveScript(newId);
    setActiveTab(newScript.name);
    setLanguage(newScript.language);
    setScriptContent(newScript.content);
    setConsoleOutput("");
    setErrors([]);
  };

  // Преобразование вывода консоли в строки
  const renderConsoleOutput = () => {
    const lines = consoleOutput.split('\n');
    return lines.map((line, index) => (
      <div key={index} className={`code-line ${line.includes('Ошибка:') || line.includes('error') ? 'console-error' : ''}`}>
        <span className="code-line-content">{line}</span>
      </div>
    ));
  };

  // Опции для Monaco Editor
  const editorOptions = {
    automaticLayout: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
    fontSize: 14,
    scrollbar: {
      vertical: 'auto' as const,
      horizontal: 'auto' as const,
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12
    },
    wordWrap: 'on' as const,
    renderValidationDecorations: 'on' as const
  };

  return (
    <div className="scripts-container">
      <div className="scripts-main">
        <div className="scripts-left">
          <div className="script-editor-header">
            <div className="editor-tab active">
              <span>{activeTab}</span>
              <span className="editor-tab-close">×</span>
            </div>
            <div className="editor-tab-add">+</div>
            <LanguageSelector language={language} onChange={handleLanguageChange} />
          </div>
          <div className="script-actions">
            <button 
              className="btn btn-run" 
              onClick={handleRunScript}
              disabled={isRunning}
            >
              {isRunning ? "Выполняется..." : "▶ Запустить"}
            </button>
            <button 
              className="btn btn-save"
              onClick={handleSaveScript}
            >
              💾 Сохранить
            </button>
            <button 
              className="btn btn-new"
              onClick={handleNewScript}
            >
              + Новый скрипт
            </button>
            {errors.length > 0 && (
              <div className="script-error-indicator">
                {errors.length} ошибок
              </div>
            )}
          </div>
          <div className="script-editor-content">
            <Editor
              height="100%"
              language={language}
              value={scriptContent}
              theme="vs-dark"
              onChange={handleEditorChange}
              options={editorOptions}
              onMount={handleEditorDidMount}
            />
          </div>
          <div className="script-console">
            <div className="script-console-title">КОНСОЛЬ СКРИПТА</div>
            <div className="console-output">
              {renderConsoleOutput()}
            </div>
          </div>
        </div>
        <div className="scripts-sidebar">
          {scripts.map(script => (
            <div 
              key={script.id} 
              className={`script-list-item ${activeScript === script.id ? 'active' : ''} ${
                script.content && script.content.includes('error') ? 'has-errors' : ''
              }`}
              onClick={() => handleScriptSelect(script.id)}
            >
              <div className="script-list-item-info">
                <div>{script.name}</div>
                <div className="script-language-badge">{script.language}</div>
              </div>
              <div className="script-list-item-timestamp">{script.timestamp}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ScriptsTab; 