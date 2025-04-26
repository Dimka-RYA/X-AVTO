import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import "./ScriptsTab.css";

// Типы для языков программирования
type LanguageType = "powershell" | "shell" | "python";

// Пример данных скриптов с добавленным полем language
const DEMO_SCRIPTS = [
  { id: 1, name: "скрипт 1", timestamp: "22 апр 18:37:43", language: "python" as LanguageType },
  { id: 2, name: "скриптовый", timestamp: "22 апр 18:37:43", language: "powershell" as LanguageType },
  { id: 3, name: "скрипта", timestamp: "22 апр 18:37:43", language: "python" as LanguageType },
  { id: 4, name: "скриптухи", timestamp: "22 апр 18:37:43", language: "shell" as LanguageType },
  { id: 5, name: "полупроводники", timestamp: "22 апр 18:37:43", language: "python" as LanguageType },
];

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

// Пример вывода консоли
const DEMO_CONSOLE_OUTPUT = `Проверка системы...
Операционная система: Linux
Версия: 5.15.0-76-generic
Использовано диска: 0.45%
Статус выполнения: True`;

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

// Типы для скриптов
interface ScriptItem {
  id: number;
  name: string;
  timestamp: string;
  language: LanguageType;
  content?: string;
}

const ScriptsTab: React.FC = () => {
  const [activeScript, setActiveScript] = useState<number | null>(1);
  const [activeTab, setActiveTab] = useState<string>("Скрипт 1");
  const [scriptContent, setScriptContent] = useState<string>(DEMO_SCRIPT_PYTHON);
  const [language, setLanguage] = useState<LanguageType>("python");
  const [scripts, setScripts] = useState<ScriptItem[]>(DEMO_SCRIPTS);
  const [consoleOutput, setConsoleOutput] = useState<string>(DEMO_CONSOLE_OUTPUT);
  const [isRunning, setIsRunning] = useState(false);

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
  };

  // Обработчик запуска скрипта
  const handleRunScript = () => {
    setIsRunning(true);
    setConsoleOutput("Запуск скрипта...\n");
    
    // Имитация выполнения скрипта
    setTimeout(() => {
      setConsoleOutput(prev => prev + DEMO_CONSOLE_OUTPUT);
      setIsRunning(false);
    }, 1500);
  };

  // Обработчик сохранения скрипта
  const handleSaveScript = () => {
    // Здесь будет логика сохранения скрипта
    alert("Скрипт сохранен");
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
  };

  // Преобразование вывода консоли в строки
  const renderConsoleOutput = () => {
    const lines = consoleOutput.split('\n');
    return lines.map((line, index) => (
      <div key={index} className="code-line">
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
    wordWrap: 'on' as const
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
          </div>
          <div className="script-editor-content">
            <Editor
              height="100%"
              language={language}
              value={scriptContent}
              theme="vs-dark"
              onChange={handleEditorChange}
              options={editorOptions}
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
              className={`script-list-item ${activeScript === script.id ? 'active' : ''}`}
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