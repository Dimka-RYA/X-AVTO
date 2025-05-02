import React, { useState, useEffect, useCallback, useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import "./ScriptsTab.css";
import { invoke } from "@tauri-apps/api/core";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { Unicode11Addon } from "xterm-addon-unicode11";
import { listen } from "@tauri-apps/api/event";
import "xterm/css/xterm.css";
import { Play, Save, TerminalSquare, AlertTriangle, FileText } from 'lucide-react';

// Типы для языков программирования
type LanguageType = "powershell" | "shell" | "python";
type ConsoleTabType = 'output' | 'terminal' | 'problems';

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
const DEMO_SCRIPT_PYTHON = `# -*- coding: utf-8 -*-
import os
import sys
import time
from datetime import datetime

# Устанавливаем кодировку стандартного вывода для работы с русским текстом
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def check_system():
    print("Проверка системы...")
    # Получаем текущую дату и время
    current_date = datetime.now()
    print(f"Текущая дата и время: {current_date}")
    
    # Получаем информацию о системе
    try:
        import platform
        system_info = platform.uname()
        print(f"Операционная система: {system_info.system}")
        print(f"Версия: {system_info.release}")
    except:
        print("Не удалось получить информацию о системе")
    
    # Проверяем свободное место
    try:
        if os.name == 'posix':  # Linux/Unix
            disk_space = os.statvfs('/')
            free_space = disk_space.f_frsize * disk_space.f_bavail
            total_space = disk_space.f_frsize * disk_space.f_blocks
            used_space = total_space - free_space
            print(f"Использовано диска: {used_space / total_space:.2f}%")
        else:  # Windows
            import ctypes
            free_bytes = ctypes.c_ulonglong(0)
            total_bytes = ctypes.c_ulonglong(0)
            ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                ctypes.c_wchar_p("C:\\"), None, ctypes.pointer(total_bytes), ctypes.pointer(free_bytes)
            )
            free_space = free_bytes.value
            total_space = total_bytes.value
            used_space = total_space - free_space
            print(f"Использовано диска: {used_space / total_space:.2f}%")
    except:
        print("Не удалось проверить свободное место")
    
    return True

if __name__ == "__main__":
    success = check_system()
    print("Статус выполнения:", success)`;

// Пример содержимого скрипта Python с ошибками для демонстрации подсветки
const DEMO_SCRIPT_PYTHON_WITH_ERROR = String.raw`# Демонстрация различных типов ошибок в Python
import os
import sys
import time
from collections import  # Незавершенный импорт
import math

# 1. Синтаксические ошибки
def check_system():
    print("Проверка системы..."  # Отсутствует закрывающая скобка
    
    # 2. Неопределенная переменная
    print(f"Текущее время: {current_time}")
    
    # 3. Ошибка отступов
  system_info = os.uname()
      wrong_indent = True
    
    # 4. Незакрытая строка
    print("Операционная система: + system_info.sysname)
    
    # 5. Ошибка в списке/словаре
    my_list = [1, 2, 3,]  # Лишняя запятая
    my_dict = {"key": "value",}  # Лишняя запятая
    bad_dict = {"key1": "value1", "key2": }  # Отсутствует значение
    
    # 6. Незакрытый многострочный комментарий
    """
    Это незакрытый многострочный комментарий
    
    # 7. Неправильное использование операторов
    if x = 10:  # Использование = вместо ==
        print("x равно 10")
    
    # 8. Незакрытые скобки разных типов
    result = (1 + 2 * (3 + 4
    items = ["a", "b", ["c", "d"
    data = {"name": "test", "values": [1, 2, }
    
    # 9. Логические ошибки
    for i in range(10)  # Отсутствует двоеточие
        print(i)
    
    if True
        print("Всегда выполняется")
    
    # 10. Проблемы с импортом
    from math import unknown_module
    
    # 11. Ошибки типов
    number = 42
    text = "Ответ: "
    result = text + number  # Ошибка типа: нельзя складывать строку и число
    
    # 12. Ошибки в аргументах функций
    len(10, 20)  # len принимает только один аргумент
    range(1, 2, 3, 4)  # range принимает максимум 3 аргумента
    
    # 13. Ошибки в форматированных строках
    name = "Python"
    age = 30
    print(f"Язык {name пришел в мир {age} лет назад")  # Ошибка в f-строке
    print(f"Версия {{ неверный формат}}")  # Несбалансированные скобки в f-строке
    
    # 14. Ошибки в аннотациях типов
    def sum_numbers(a: integer, b: integer) -> integer:  # Неверный тип 'integer'
        return a + b
    
    # 15. Циклические импорты
    from __name__ import something  # Циклический импорт
    
    return True  # Эта строка не будет достигнута из-за ошибок выше

# Ошибки на уровне модуля
class MyClass  # Отсутствует двоеточие
    def __init__(self):
        self.value = 42

if __name__ == "__main__"  # Отсутствует двоеточие
    check_system()
    
    # Вызов несуществующей функции
    undefined_function()
    print(undefined_variable)
`;

// Пример содержимого скрипта PowerShell
const DEMO_SCRIPT_POWERSHELL = `# Проверка системы с использованием PowerShell

# Устанавливаем кодировку вывода в UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
$PSDefaultParameterValues['*:Encoding'] = 'utf8'

Write-Host "Проверка системы..."

# Получаем текущую дату и время
$currentDate = Get-Date -Format "dd.MM.yyyy HH:mm:ss"
Write-Output "Текущая дата и время: $currentDate"

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
const DEMO_SCRIPT_POWERSHELL_WITH_ERROR = String.raw`# Демонстрация различных типов ошибок в PowerShell

# 1. Незакрытые строки
Write-Host "Проверка системы...

# 2. Неверное использование командлетов
Get-Process -InvalidParameter 
Stop-Service -Name NonExistentService -ErrorAction

# 3. Неверный синтаксис переменных
$totalSpace = $disk.Used + $disk.Free}
$user@domain = "неверное имя переменной"

# 4. Незакрытые скобки
if ($disk.Free -lt 1GB {
    Write-Host "Мало свободного места!"

# 5. Ошибки в циклах
foreach ($item in $items {
    Write-Host $item
}

# 6. Незакрытые блоки
function Test-Function {
    param(
        [string]$Name
    
    Write-Host "Имя: $Name"

# 7. Неправильные операторы сравнения
if ($value = 10) {
    Write-Host "Значение равно 10"
}

# 8. Неправильное использование массивов
$array = @(1, 2, 3,)
$hash = @{"key" = "value",}
$badHash = @{"key1" = "value1", "key2" = }

# 9. Несогласованный синтаксис
Write-Host "Статус: $success

# 10. Неизвестные команды
Wrong-Command

# 11. Ошибки конвейера
Get-Process | Where-Object { $_. } | Select-Object Name
Get-Service | # Незавершенный конвейер

# 12. Проблемы со скриптблоками
& { Write-Host "Тест" 

# 13. Обращение к несуществующим свойствам объектов
$process.NonExistentProperty
$disk.InvalidField

# 14. Проблемы с преобразованием типов
$number = [int]"abc"  # Ошибка преобразования
$result = [float]::

# 15. Ошибки в вызове .NET методов
[System.Math]::Sqrt  # Отсутствуют скобки для вызова
[System.DateTime]::ParseExact("2023/01/01")  # Не хватает аргументов

# 16. Проблемы с областью видимости
function Test-Scope {
    $localVar = 10
}
$localVar  # Переменная не существует в этой области видимости

# Незакрытый here-string
$text = @"
Многострочный текст
без закрывающего тега
`;

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
const DEMO_SCRIPT_BASH_WITH_ERROR = String.raw`#!/bin/bash
# Демонстрация различных типов ошибок в Bash

# 1. Незакрытые кавычки
echo "Проверка системы...

# 2. Неверный синтаксис условий
if [ $FREE_SPACE < 1000 ]
then
    echo "Мало свободного места!"
fi

# 3. Отсутствие пробелов в условиях
if [$FREE_SPACE -lt 1000]
then
    echo "Ошибка синтаксиса"
fi

# 4. Неизвестные команды
unknown_command

# 5. Незакрытая кавычка
echo "Текущая директория: $(pwd)

# 6. Неверный синтаксис переменных
$VARIABLE=value
\${VARIABLE=value

# 7. Незакрытые скобки
function check_disk {
    df -h
    echo "Проверка завершена"

# 8. Ошибки в циклах
for file in \$(ls
do
    echo $file
done

# 9. Неверные перенаправления
echo "Тест" >

# 10. Проблемы с heredoc
cat << EOF
Многострочный текст
без закрывающего тега

# 11. Проблемы со скобками в выражениях
echo \$(( 2 + 2 )
echo \$(( 2 + ))
echo \$((2 + 2)

# 12. Небезопасное использование переменных
rm -rf $DIR/

# 13. Проблемы с массивами
array=(1 2 3
echo \${array[}

# 14. Ошибки в регулярных выражениях
if [[ $string =~ [a-z ]]; then
    echo "Соответствует"
fi

# 15. Проблемы с экранированием
echo "Строка с $variable и \n и $( команда"

# 16. Ошибки в арифметических выражениях
let result=5 /
let result=10 / 0

# 17. Проблемы с глобальными шаблонами
rm *.txt  # Опасное использование без -i

# 18. Ошибки с сигналами
kill  # Не указан PID
`;

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
  const [terminalInput, setTerminalInput] = useState<string>("");
  const [terminalHistory, setTerminalHistory] = useState<{command: string; output: string}[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [errors, setErrors] = useState<ScriptError[]>([]);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const [activeConsoleTab, setActiveConsoleTab] = useState<'output' | 'terminal' | 'problems'>('output');
  const [problems, setProblems] = useState<Array<{type: 'error' | 'warning', message: string, location: string}>>([]);
  
  // Новые состояния для xterm терминала
  const [xtermInstance, setXtermInstance] = useState<XTerm | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);
  const [terminalId, setTerminalId] = useState<number | null>(null);
  const [unlistener, setUnlistener] = useState<(() => void) | null>(null);
  
  // Refs для терминала
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInitializedRef = useRef<boolean>(false);
  const commandBufferRef = useRef<string>('');

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
      
      // При переключении скриптов переинициализируем терминал для предотвращения багов
      if (terminalInitializedRef.current && terminalRef.current) {
        // Сбрасываем терминал
        if (xtermInstance) {
          xtermInstance.dispose();
          setXtermInstance(null);
        }
        
        terminalRef.current.innerHTML = '';
        terminalInitializedRef.current = false;
        
        // Реинициализируем терминал если вкладка терминала активна
        if (activeConsoleTab === 'terminal') {
          setTimeout(() => {
            initializeTerminal();
          }, 100);
        }
      }
    }
  };

  // Функция для проверки ошибок в скрипте
  const checkForErrors = (content: string, lang: LanguageType) => {
    // Это расширенная проверка с поддержкой большего количества типов ошибок
    const newErrors: ScriptError[] = [];
    
    const lines = content.split('\n');
    const fullContent = content;
    
    // Набор переменных для отслеживания контекста
    const definedVariables: Set<string> = new Set();
    const definedFunctions: Set<string> = new Set();
    const importedModules: Set<string> = new Set();
    
    // Проверка баланса скобок во всём файле
    const brackets = {
      '(': ')',
      '[': ']',
      '{': '}'
    };
    
    const stack: { char: string, line: number, pos: number }[] = [];
    
    // Анализ Python импортов и определений
    if (lang === 'python') {
      // Находим все импорты
      const importRegex = /^\s*(?:from\s+(\w+(?:\.\w+)*)\s+import|import\s+(\w+(?:\.\w+)*))/;
      for (const line of lines) {
        const match = line.match(importRegex);
        if (match) {
          const moduleName = match[1] || match[2];
          if (moduleName) importedModules.add(moduleName);
        }
      }
      
      // Находим все определения функций
      const functionRegex = /^\s*def\s+(\w+)\s*\(/;
      for (const line of lines) {
        const match = line.match(functionRegex);
        if (match && match[1]) {
          definedFunctions.add(match[1]);
        }
      }
      
      // Находим все определения переменных
      const variableRegex = /^\s*(\w+)\s*=/;
      for (const line of lines) {
        const match = line.match(variableRegex);
        if (match && match[1]) {
          definedVariables.add(match[1]);
        }
      }
    } else if (lang === 'powershell') {
      // Находим все определения функций
      const functionRegex = /^\s*function\s+(\w+[\w\-]*)\s*\{/;
      for (const line of lines) {
        const match = line.match(functionRegex);
        if (match && match[1]) {
          definedFunctions.add(match[1]);
        }
      }
      
      // Находим все определения переменных
      const variableRegex = /^\s*\$(\w+)\s*=/;
      for (const line of lines) {
        const match = line.match(variableRegex);
        if (match && match[1]) {
          definedVariables.add(match[1]);
        }
      }
    } else if (lang === 'shell') {
      // Находим все определения функций
      const functionRegex = /^\s*(\w+[\w\-]*)\s*\(\s*\)\s*\{/;
      for (const line of lines) {
        const match = line.match(functionRegex);
        if (match && match[1]) {
          definedFunctions.add(match[1]);
        }
      }
      
      // Находим все определения переменных
      const variableRegex = /^\s*(\w+)=/;
      for (const line of lines) {
        const match = line.match(variableRegex);
        if (match && match[1]) {
          definedVariables.add(match[1]);
        }
      }
    }
    
    let lineIndex = 0;
    for (const line of lines) {
      let inString = false;
      let stringChar = '';
      let escapeNext = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        // Обработка escape-последовательностей
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        // Обработка строк
        if ((char === '"' || char === "'") && !inString) {
          inString = true;
          stringChar = char;
          continue;
        }
        
        if (char === stringChar && inString) {
          inString = false;
          stringChar = '';
          continue;
        }
        
        // Пропускаем символы внутри строк
        if (inString) continue;
        
        // Обработка открывающих скобок
        if (Object.keys(brackets).includes(char)) {
          stack.push({ char, line: lineIndex, pos: i });
          continue;
        }
        
        // Обработка закрывающих скобок
        if (Object.values(brackets).includes(char)) {
          if (stack.length === 0) {
            // Найдена лишняя закрывающая скобка
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: `Лишняя закрывающая скобка "${char}"`,
              severity: 'error'
            });
            continue;
          }
          
          const last = stack.pop();
          if (last) {
            const expected = brackets[last.char as keyof typeof brackets];
            if (expected !== char) {
              // Несоответствие типов скобок
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: `Ожидалась скобка "${expected}", но найдена "${char}"`,
                severity: 'error'
              });
            }
          }
        }
      }
      
      // Проверка незакрытых строк в строке
      let doubleQuoteCount = 0;
      let singleQuoteCount = 0;
      let inDoubleQuote = false;
      let inSingleQuote = false;
      let backslash = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (backslash) {
          backslash = false;
          continue;
        }
        
        if (char === '\\') {
          backslash = true;
          continue;
        }
        
        if (char === '"' && !inSingleQuote) {
          inDoubleQuote = !inDoubleQuote;
          doubleQuoteCount++;
        }
        
        if (char === "'" && !inDoubleQuote) {
          inSingleQuote = !inSingleQuote;
          singleQuoteCount++;
        }
      }
      
      if (doubleQuoteCount % 2 !== 0) {
        newErrors.push({
          lineNumber: lineIndex + 1,
          message: 'Незакрытая двойная кавычка',
          severity: 'error'
        });
      }
      
      if (singleQuoteCount % 2 !== 0) {
        newErrors.push({
          lineNumber: lineIndex + 1,
          message: 'Незакрытая одинарная кавычка',
          severity: 'error'
        });
      }
      
      // ===================== РАСШИРЕННЫЕ ПРОВЕРКИ ДЛЯ PYTHON =====================
      if (lang === 'python') {
        // Проверка отступов для Python
        if (lineIndex > 0 && line.trim() !== '' && !line.trim().startsWith('#')) {
          const currentIndent = line.search(/\S|$/);
          const prevIndent = lines[lineIndex - 1].search(/\S|$/);
          
          // Проверка на непоследовательные отступы
          if (prevIndent > 0 && currentIndent > 0 && 
             currentIndent > prevIndent && 
             (currentIndent - prevIndent) % 4 !== 0) {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: 'Неправильный отступ (должен быть кратен 4 пробелам)',
              severity: 'warning'
            });
          }
          
          // Проверка на смешанные отступы (пробелы и табуляции)
          if (line.includes('\t') && line.includes(' ') && line.trim() !== '') {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: 'Смешанные отступы (табуляции и пробелы)',
              severity: 'warning'
            });
          }
        }
        
        // Проверка двоеточий в конце операторов
        const needsColonRegex = /^\s*(if|elif|else|for|while|def|class|with|try|except|finally)\b.*[^:]\s*$/;
        if (needsColonRegex.test(line)) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Отсутствует двоеточие в конце оператора',
            severity: 'error'
          });
        }
        
        // Проверка использования оператора присваивания в условиях
        if (/^\s*(if|elif|while)\s+.*[^=!><]=(?!=).*/.test(line)) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Возможно ошибочное использование "=" вместо "==" в условии',
            severity: 'error'
          });
        }
        
        // Проверка на неверные аргументы функции
        const functionCallRegex = /(\w+)\s*\((.*)\)/g;
        let match;
        while ((match = functionCallRegex.exec(line)) !== null) {
          const funcName = match[1];
          const args = match[2];
          
          // Проверка вызовов встроенных функций с неверными аргументами
          if (funcName === 'len' && args.includes(',')) {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: 'Функция len() принимает только один аргумент',
              severity: 'error'
            });
          }
          
          if (funcName === 'range') {
            const argCount = args.split(',').filter(arg => arg.trim() !== '').length;
            if (argCount > 3) {
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: 'Функция range() принимает от 1 до 3 аргументов',
                severity: 'error'
              });
            }
          }
          
          // Проверка вызова неопределенной функции
          if (!definedFunctions.has(funcName) && 
              !['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'sum', 'min', 'max'].includes(funcName)) {
            const moduleCall = funcName.split('.');
            // Если это вызов метода объекта и объект импортирован
            if (moduleCall.length > 1 && importedModules.has(moduleCall[0])) {
              // Это нормальный вызов метода импортированного объекта, пропускаем
              continue;
            }
            // Специальная обработка для datetime.now()
            if (moduleCall.length > 1 && moduleCall[0] === 'datetime' && moduleCall[1] === 'now') {
              continue;
            }
            if (moduleCall.length === 1 && !importedModules.has(moduleCall[0])) {
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: `Возможный вызов неопределенной функции "${funcName}"`,
                severity: 'warning'
              });
            }
          }
        }
        
        // Проверка ошибок типов в простых выражениях
        if (/"\s*\+\s*\d+/.test(line) || /\d+\s*\+\s*"/.test(line)) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Ошибка типа: конкатенация строки и числа',
            severity: 'error'
          });
        }
        
        // Проверка f-строк на корректность
        if (line.includes('f"') || line.includes("f'")) {
          const fStringRegex = /f(['"])(.*?)\1/g;
          let fMatch;
          while ((fMatch = fStringRegex.exec(line)) !== null) {
            const fContent = fMatch[2];
            // Проверка на незакрытые скобки в f-строке
            const openCount = (fContent.match(/{/g) || []).length;
            const closeCount = (fContent.match(/}/g) || []).length;
            
            if (openCount !== closeCount) {
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: 'Несбалансированные скобки {} в f-строке',
                severity: 'error'
              });
            }
            
            // Проверка на двойные скобки в f-строке
            if (fContent.includes('{{') && !fContent.includes('}}')) {
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: 'Открывающие двойные скобки {{, но нет закрывающих }}',
                severity: 'warning'
              });
            }
          }
        }
        
        // Проверка аннотаций типов
        const typeAnnotationRegex = /^\s*def\s+\w+\s*\([^)]*\)\s*->\s*([^:]+):/;
        const typeMatch = line.match(typeAnnotationRegex);
        if (typeMatch && typeMatch[1]) {
          const returnType = typeMatch[1].trim();
          if (!['int', 'str', 'float', 'bool', 'list', 'dict', 'tuple', 'set', 'None', 'Any'].includes(returnType) && 
              !returnType.startsWith('List[') && 
              !returnType.startsWith('Dict[') && 
              !returnType.startsWith('Tuple[') && 
              !returnType.startsWith('Set[') && 
              !returnType.startsWith('Optional[')) {
            
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: `Потенциально некорректная аннотация типа: ${returnType}`,
              severity: 'warning'
            });
          }
        }
        
        // Проверка использования неопределенных переменных
        const variableUseRegex = /\b([a-zA-Z_]\w*)\b/g;
        let varMatch;
        
        // Исключаем ключевые слова и встроенные функции
        const pythonKeywords = new Set([
          'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif',
          'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import',
          'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise',
          'return', 'True', 'try', 'while', 'with', 'yield'
        ]);
        
        // Список встроенных функций и типов Python
        const builtins = new Set([
          'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes', 'chr', 'classmethod',
          'compile', 'complex', 'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval',
          'exec', 'filter', 'float', 'format', 'frozenset', 'getattr', 'globals', 'hasattr',
          'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance', 'issubclass', 'iter',
          'len', 'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next', 'object',
          'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr', 'reversed',
          'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum',
          'super', 'tuple', 'type', 'vars', 'zip', 'now'
        ]);
        
        // Известные методы классов
        const knownClassMethods = new Set([
          'now', 'today', 'strftime', 'strptime', 'replace', 'append', 'extend', 'insert',
          'remove', 'pop', 'clear', 'index', 'count', 'sort', 'reverse', 'copy', 'join',
          'strip', 'lstrip', 'rstrip', 'upper', 'lower', 'format', 'split', 'rsplit'
        ]);
        
        // Пропускаем строки с определениями и комментариями
        if (!line.includes('=') && !line.trim().startsWith('#') && !line.trim().startsWith('def ')) {
          while ((varMatch = variableUseRegex.exec(line)) !== null) {
            const varName = varMatch[1];
            
            // Пропускаем ключевые слова, встроенные функции, определенные функции и импортированные модули
            if (!pythonKeywords.has(varName) && 
                !builtins.has(varName) && 
                !definedFunctions.has(varName) && 
                !importedModules.has(varName.split('.')[0]) && 
                !definedVariables.has(varName)) {
              
              // Пропускаем некоторые общие имена и f-строки
              if (!['self', 'cls', 'args', 'kwargs', 'f'].includes(varName) && 
                  // Проверяем, не является ли это методом класса в конструкции вида obj.method()
                  !(line.includes('.' + varName) && knownClassMethods.has(varName))) {
                newErrors.push({
                  lineNumber: lineIndex + 1,
                  message: `Возможное использование неопределенной переменной "${varName}"`,
                  severity: 'warning'
                });
              }
            }
          }
        }
        
        // Проверка на циклические импорты (упрощенная версия)
        if (line.includes('import') && line.includes('from')) {
          const circularImportRegex = /from\s+(\w+)(?:\.\w+)*\s+import/;
          const importMatch = line.match(circularImportRegex);
          if (importMatch && importMatch[1]) {
            const baseModule = importMatch[1];
            
            // Если имя текущего модуля совпадает с импортируемым, это может быть циклический импорт
            if (baseModule === "__name__") {
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: 'Возможный циклический импорт',
                severity: 'warning'
              });
            }
          }
        }
      }
      // ===================== РАСШИРЕННЫЕ ПРОВЕРКИ ДЛЯ POWERSHELL =====================
      else if (lang === 'powershell') {
        // Проверка наличия точки с запятой в конце строки
        if (line.trim().endsWith(';') && 
            !line.trim().startsWith('#') &&
            line.length > 1) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'В PowerShell точка с запятой в конце строки не обязательна',
            severity: 'warning'
          });
        }
        
        // Проверка операторов присваивания в условиях
        if (/^\s*(if|elseif|while)\s+.*[^=!><]=(?!=).*\)/.test(line)) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Возможно ошибочное использование "=" вместо "-eq" в условии',
            severity: 'error'
          });
        }
        
        // Проверка некорректных имен переменных
        if (/\$[^a-zA-Z_{}]/.test(line) && !line.includes('$_')) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Неверное имя переменной',
            severity: 'error'
          });
        }
        
        // Проверка вызова несуществующих командлетов
        const cmdletRegex = /^\s*([A-Z]\w+-\w+)\b/;
        const cmdMatch = line.match(cmdletRegex);
        if (cmdMatch && cmdMatch[1]) {
          const cmdlet = cmdMatch[1];
          const commonCmdlets = [
            'Get-Process', 'Get-Service', 'Get-Content', 'Set-Content', 'Write-Host', 'Write-Output',
            'New-Item', 'Remove-Item', 'Start-Process', 'Stop-Process', 'Test-Path',
            'Get-WmiObject', 'Get-CimInstance', 'Invoke-WebRequest', 'Invoke-RestMethod',
            'Set-Location', 'Get-Location', 'Get-ChildItem', 'Get-Command', 'Get-Help',
            'Get-Member', 'ForEach-Object', 'Where-Object', 'Select-Object'
          ];
          
          if (!commonCmdlets.includes(cmdlet) && !definedFunctions.has(cmdlet)) {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: `Возможный вызов несуществующего командлета "${cmdlet}"`,
              severity: 'warning'
            });
          }
        }
        
        // Проверка неверного использования параметров
        const parameterRegex = /-(\w+)\s+/g;
        let paramMatch;
        while ((paramMatch = parameterRegex.exec(line)) !== null) {
          const param = paramMatch[1];
          if (line.includes('Get-Process') && !['Name', 'Id', 'ComputerName', 'Filter', 'InputObject'].includes(param)) {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: `Возможный неверный параметр "${param}" для командлета Get-Process`,
              severity: 'warning'
            });
          }
          
          if (line.includes('Get-Service') && !['Name', 'DisplayName', 'ComputerName', 'InputObject'].includes(param)) {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: `Возможный неверный параметр "${param}" для командлета Get-Service`,
              severity: 'warning'
            });
          }
        }
        
        // Проверка на обращение к несуществующим свойствам объектов
        const propertyAccessRegex = /\$\w+\.(\w+)/g;
        let propMatch;
        
        while ((propMatch = propertyAccessRegex.exec(line)) !== null) {
          const objName = line.substring(propMatch.index, propMatch.index + propMatch[0].indexOf('.'));
          const propName = propMatch[1];
          
          // Проверка для известных объектов и их свойств
          if (objName === '$disk' && !['Used', 'Free', 'Total', 'Name', 'Size', 'Root'].includes(propName)) {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: `Обращение к возможно несуществующему свойству "${propName}" объекта ${objName}`,
              severity: 'warning'
            });
          }
          
          if (objName === '$process' && !['Name', 'Id', 'CPU', 'Path', 'WorkingSet', 'Handles'].includes(propName)) {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: `Обращение к возможно несуществующему свойству "${propName}" объекта ${objName}`,
              severity: 'warning'
            });
          }
        }
        
        // Проверка проблем с преобразованием типов
        if (line.includes('[int]') && (line.includes('"') || line.includes("'"))) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Возможная проблема с преобразованием строки в число. Используйте [int]::Parse() для безопасного преобразования',
            severity: 'warning'
          });
        }
        
        // Проверка правильности вызова .NET методов
        if (line.includes('::') && !line.includes('(') && !line.includes('[') && !line.includes(']')) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Возможная ошибка в вызове статического метода .NET. Не хватает скобок ()',
            severity: 'error'
          });
        }
        
        // Проверка на ошибки в конвейере (pipeline)
        if (line.includes('|') && line.endsWith('|')) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Незавершенный конвейер команд',
            severity: 'error'
          });
        }
      }
      // ===================== РАСШИРЕННЫЕ ПРОВЕРКИ ДЛЯ BASH/SHELL =====================
      else if (lang === 'shell') {
        // Проверка пробелов в условиях
        if (/\[\s*\$/.test(line) || /\$\w+\s*\]/.test(line)) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Требуются пробелы после [ и перед ] в условиях',
            severity: 'error'
          });
        }
        
        // Проверка на двойные скобки
        if (/\[\s*\[.*\]\s*\]/.test(line) && !/\[\[\s*.*\s*\]\]/.test(line)) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Используйте [[ ]] вместо [ [ ] ]',
            severity: 'warning'
          });
        }
        
        // Опасное использование переменных
        if (/rm\s+.*\$\w+/.test(line) && !(/"\$\w+"/.test(line) || /'\$\w+'/.test(line))) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Небезопасное использование переменной без кавычек',
            severity: 'warning'
          });
        }
        
        // Проверка условий в if
        if (/^\s*if\s+\[\s*.*[<>].*/i.test(line) && !(/\s-[lg]t\s/.test(line))) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Используйте -lt, -gt вместо < > в условиях',
            severity: 'error'
          });
        }
        
        // Проверка на ошибки в регулярных выражениях
        if (line.includes('=~') && line.includes('[') && !line.includes(']')) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Незакрытый класс символов [] в регулярном выражении',
            severity: 'error'
          });
        }
        
        // Проверка на проблемы с экранированием в конструкциях
        const escapeMissingRegex = /echo\s+".*\$\w+.*"/;
        if (escapeMissingRegex.test(line) && line.includes('\\n') && !line.includes('\\"')) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Возможно неэкранированные спецсимволы в строке с подстановкой переменных',
            severity: 'warning'
          });
        }
        
        // Проверка на ошибки в арифметических выражениях
        if (line.includes('$(( ') || line.includes('$((')) {
          const arithRegex = /\$\(\(\s*([^)]+)\s*\)\)/;
          const arithMatch = line.match(arithRegex);
          if (arithMatch && arithMatch[1]) {
            const expr = arithMatch[1];
            
            // Проверка незавершенных выражений
            if (/[+\-*/%]\s*$/.test(expr)) {
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: 'Незавершенное арифметическое выражение',
                severity: 'error'
              });
            }
            
            // Проверка деления на 0
            if (expr.includes('/ 0') || expr.includes('/0')) {
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: 'Возможное деление на ноль',
                severity: 'error'
              });
            }
            
            // Проверка недопустимых операторов
            if (/[^+\-*/%=!<>&|^()\s\d\w]/.test(expr)) {
              newErrors.push({
                lineNumber: lineIndex + 1,
                message: 'Потенциально недопустимый оператор в арифметическом выражении',
                severity: 'error'
              });
            }
          }
        }
        
        // Проверка проблем с глобальными шаблонами (globbing)
        if (line.includes('rm') && (line.includes('*') || line.includes('?'))) {
          if (!line.includes('-i') && !line.includes('--interactive')) {
            newErrors.push({
              lineNumber: lineIndex + 1,
              message: 'Потенциально опасное использование rm с глобальными шаблонами. Добавьте флаг -i для безопасности',
              severity: 'warning'
            });
          }
        }
        
        // Проверка неверного использования сигналов
        if (line.includes('kill') && !/kill\s+(-\w+\s+)?\d+/.test(line)) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Возможно некорректное использование команды kill. Требуется ID процесса',
            severity: 'error'
          });
        }
        
        // Проверка неправильной подстановки переменных
        if (line.includes('${') && !line.includes('}')) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Незакрытая фигурная скобка в подстановке переменной',
            severity: 'error'
          });
        }
        
        // Проверка неверных перенаправлений
        if (/>>\s*$/.test(line) || />\s*$/.test(line) || /<\s*$/.test(line)) {
          newErrors.push({
            lineNumber: lineIndex + 1,
            message: 'Незавершенное перенаправление ввода/вывода',
            severity: 'error'
          });
        }
      }
      
      lineIndex++;
    }
    
    // Проверка оставшихся открытых скобок
    while (stack.length > 0) {
      const bracket = stack.pop();
      if (bracket) {
        newErrors.push({
          lineNumber: bracket.line + 1,
          message: `Незакрытая скобка "${bracket.char}"`,
          severity: 'error'
        });
      }
    }
    
    // ===================== ПРОВЕРКИ ВСЕГО ФАЙЛА =====================
    // Языкоспецифические проверки для всего файла
    if (lang === 'python') {
      // Проверка на незакрытые многострочные комментарии
      const tripleQuotes = (fullContent.match(/"""/g) || []).length;
      if (tripleQuotes % 2 !== 0) {
        // Найти строку с незакрытым комментарием
        let foundLine = 1;
        let count = 0;
        for (let i = 0; i < lines.length; i++) {
          const matches = (lines[i].match(/"""/g) || []).length;
          count += matches;
          if (count % 2 !== 0) {
            foundLine = i + 1;
            break;
          }
        }
        
        newErrors.push({
          lineNumber: foundLine,
          message: 'Незакрытый многострочный комментарий',
          severity: 'error'
        });
      }
      
      // Проверка незавершенных импортов
      const importRegex = /^\s*from\s+\w+\s+import\s*$/;
      for (let i = 0; i < lines.length; i++) {
        if (importRegex.test(lines[i])) {
          newErrors.push({
            lineNumber: i + 1,
            message: 'Незавершенный импорт',
            severity: 'error'
          });
        }
      }
    } else if (lang === 'powershell') {
      // Проверка на незакрытый here-string
      const hereStrings = (fullContent.match(/@"/g) || []).length;
      const hereStringsEnd = (fullContent.match(/"@/g) || []).length;
      
      if (hereStrings > hereStringsEnd) {
        // Найти строку с незакрытым here-string
        let foundLine = 1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('@"') && !lines[i].includes('"@')) {
            foundLine = i + 1;
            break;
          }
        }
        
        newErrors.push({
          lineNumber: foundLine,
          message: 'Незакрытый here-string',
          severity: 'error'
        });
      }
    } else if (lang === 'shell') {
      // Проверка на незакрытый heredoc
      const heredocStart = /<<\s*(\w+)/;
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(heredocStart);
        if (match) {
          const endTag = match[1];
          let found = false;
          
          // Искать соответствующий закрывающий тег
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === endTag) {
              found = true;
              break;
            }
          }
          
          if (!found) {
            newErrors.push({
              lineNumber: i + 1,
              message: `Незакрытый heredoc (отсутствует тег "${endTag}")`,
              severity: 'error'
            });
          }
        }
      }
    }
    
    setErrors(newErrors);
    
    // Обновляем массив problems на основе найденных ошибок
    const newProblems = newErrors.map(err => ({
      type: err.severity === 'error' ? 'error' as const : 'warning' as const,
      message: err.message,
      location: `строка ${err.lineNumber}`
    }));
    
    setProblems(newProblems);
    
    // Если обнаружены проблемы при интерактивной работе (не при инициализации), 
    // переключаемся на вкладку с проблемами
    if (newErrors.length > 0 && editorInstance) {
      // Не переключаем автоматически вкладку при проверке во время загрузки,
      // делаем это только при интерактивной работе пользователя
      setActiveConsoleTab('problems');
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
    
    // Настраиваем скролл-бары редактора
    const editorElement = editor.getDomNode();
    if (editorElement) {
      editorElement.style.overflow = 'hidden'; // Предотвращаем двойные скролл-бары
    }
    
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
  const handleRunScript = async () => {
    setIsRunning(true);
    setConsoleOutput("Запуск скрипта...\n");
    setActiveConsoleTab('output'); // Автоматически переключаемся на вкладку вывода при запуске
    
    // Проверяем наличие ошибок перед выполнением
    checkForErrors(scriptContent, language);
    
    // Выводим предупреждение, если есть ошибки, но всё равно запускаем скрипт
    if (errors.length > 0) {
      const errorCount = errors.filter(err => err.severity === 'error').length;
      const warningCount = errors.filter(err => err.severity === 'warning').length;
      
      let warningMessage = "\nПредупреждение: в скрипте обнаружены проблемы";
      if (errorCount > 0) warningMessage += `, ошибок: ${errorCount}`;
      if (warningCount > 0) warningMessage += `, предупреждений: ${warningCount}`;
      warningMessage += ". Выполнение продолжается.\n";
      
      setConsoleOutput(prev => prev + warningMessage);
    }
    
    try {
      // Вызываем Rust функцию для запуска скрипта через invoke
      const result = await invoke<string>("run_script", { 
        script: scriptContent,
        language: language
      });
      
      // Выводим результат в консоль
      setConsoleOutput(prev => prev + "\n" + result);
      
    } catch (error: unknown) {
      console.error("Ошибка при запуске скрипта:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConsoleOutput(prev => prev + `\n\nОшибка при запуске скрипта: ${errorMessage}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Обработчик сохранения скрипта
  const handleSaveScript = async () => {
    // Проверяем на ошибки перед сохранением
    checkForErrors(scriptContent, language);

    // Определяем расширение файла в зависимости от языка
    const fileExtensions = {
      python: '.py',
      powershell: '.ps1',
      shell: '.sh'
    };

    // Определяем имя скрипта из активной вкладки
    const scriptName = activeTab.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const suggestedName = `${scriptName}${fileExtensions[language]}`;

    // Показываем индикатор процесса сохранения
    setConsoleOutput(prev => `${prev}\nНачато сохранение скрипта...`);
    setActiveConsoleTab('output');
    
    try {
      // Подготавливаем дополнительный BOM для PowerShell скриптов для корректной работы с кириллицей
      let fileContent = scriptContent;
      let blobOptions: BlobPropertyBag = {};
      
      // Для PowerShell скриптов добавляем BOM для корректного отображения кириллицы
      if (language === 'powershell') {
        blobOptions.type = 'application/octet-stream';
        // UTF-8 BOM: EF BB BF
        const bomPrefix = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const textEncoder = new TextEncoder();
        const contentArray = textEncoder.encode(scriptContent);
        
        // Объединяем BOM и содержимое скрипта
        const combinedArray = new Uint8Array(bomPrefix.length + contentArray.length);
        combinedArray.set(bomPrefix);
        combinedArray.set(contentArray, bomPrefix.length);
        
        // Создаем Blob с BOM
        const blob = new Blob([combinedArray], blobOptions);
        
        // Создаем URL для скачивания
        const url = URL.createObjectURL(blob);
        
        try {
          // Используем showSaveFilePicker API если он доступен (современные браузеры)
          if ('showSaveFilePicker' in window) {
            const fileHandle = await (window as any).showSaveFilePicker({
              suggestedName: suggestedName,
              types: [{
                description: `${language.charAt(0).toUpperCase() + language.slice(1)} Script`,
                accept: {
                  'text/plain': [fileExtensions[language]]
                }
              }]
            });
            
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            
            setConsoleOutput(prev => `${prev}\nСкрипт успешно сохранен через диалог выбора пути.`);
          } else {
            // Запасной вариант для браузеров без File System Access API
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setConsoleOutput(prev => `${prev}\nСкрипт сохранен. Проверьте папку загрузок браузера.`);
          }
        } finally {
          // Очищаем URL
          URL.revokeObjectURL(url);
        }
      } else {
        // Для других языков просто используем текстовый Blob
        blobOptions.type = 'text/plain;charset=utf-8';
        const blob = new Blob([fileContent], blobOptions);
        const url = URL.createObjectURL(blob);
        
        try {
          // Используем showSaveFilePicker API если он доступен (современные браузеры)
          if ('showSaveFilePicker' in window) {
            const fileHandle = await (window as any).showSaveFilePicker({
              suggestedName: suggestedName,
              types: [{
                description: `${language.charAt(0).toUpperCase() + language.slice(1)} Script`,
                accept: {
                  'text/plain': [fileExtensions[language]]
                }
              }]
            });
            
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            
            setConsoleOutput(prev => `${prev}\nСкрипт успешно сохранен через диалог выбора пути.`);
          } else {
            // Запасной вариант для браузеров без File System Access API
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setConsoleOutput(prev => `${prev}\nСкрипт сохранен. Проверьте папку загрузок браузера.`);
          }
        } finally {
          // Очищаем URL
          URL.revokeObjectURL(url);
        }
      }
      
      setActiveConsoleTab('output');
      
    } catch (error: unknown) {
      console.error("Ошибка при сохранении скрипта:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Показываем ошибку
      setConsoleOutput(prev => `${prev}\nОшибка при сохранении скрипта: ${errorMessage}`);
      setActiveConsoleTab('output');
    }
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

  // Обработка ввода в терминале
  const handleTerminalInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTerminalInput(e.target.value);
  };

  // Отправка команды в терминал
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;

    // Добавляем команду в историю
    const newCommand = {
      command: terminalInput,
      output: `Выполнение команды: ${terminalInput}\nРезультат: Команда успешно выполнена`
    };

    setTerminalHistory([...terminalHistory, newCommand]);
    setTerminalInput('');
  };

  // Рендер истории терминала
  const renderTerminalHistory = () => {
    return (
      <div className="terminal-history">
        {terminalHistory.map((entry, index) => (
          <div key={index} className="terminal-entry">
            <div className="terminal-command">$ {entry.command}</div>
            <div className="terminal-output">{entry.output}</div>
          </div>
        ))}
        <form className="terminal-form" onSubmit={handleTerminalSubmit}>
          <span className="terminal-prompt">$</span>
          <input
            type="text"
            className="terminal-input"
            value={terminalInput}
            onChange={handleTerminalInputChange}
            placeholder="Введите команду..."
            autoFocus
          />
        </form>
      </div>
    );
  };

  // Рендер проблем в консоли
  const renderProblems = () => {
    if (errors.length === 0) {
      return <div className="no-problems">Проблем не обнаружено</div>;
    }

    return (
      <div className="problems-list">
        {errors.map((error, index) => (
          <div 
            key={index} 
            className={`problem-item ${error.severity === 'error' ? 'problem-error' : 'problem-warning'}`}
            onClick={() => {
              if (editorInstance) {
                editorInstance.focus();
                editorInstance.revealLineInCenter(error.lineNumber);
                editorInstance.setPosition({ lineNumber: error.lineNumber, column: 1 });
              }
            }}
          >
            <div className="problem-icon">
              {error.severity === 'error' ? '❌' : '⚠️'}
            </div>
            <div className="problem-location">Строка {error.lineNumber}</div>
            <div className="problem-message">{error.message}</div>
          </div>
        ))}
      </div>
    );
  };

  // Инициализация xterm терминала
  const initializeTerminal = async () => {
    // Предотвращаем повторную инициализацию, если терминал уже инициализирован
    if (!terminalRef.current || terminalInitializedRef.current) return;
    
    console.log("Initializing xterm terminal...");
    
    try {
      // Установка флага инициализации терминала
      terminalInitializedRef.current = true;
      
      // Создаем новый экземпляр терминала
      const term = new XTerm({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Courier New, monospace',
        fontWeight: 'normal',
        lineHeight: 1.2,
        letterSpacing: 0.5,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#45fce4',
          selectionBackground: 'rgba(255,255,255,0.3)',
        },
        scrollback: 5000,
        convertEol: true,
        allowTransparency: true,
        windowsMode: true,
        allowProposedApi: true,
        disableStdin: false,
        macOptionIsMeta: true,
        screenReaderMode: false,
        scrollOnUserInput: true
      });
      
      // Создаем и подключаем дополнения
      const fit = new FitAddon();
      const webLinks = new WebLinksAddon();
      const unicode11 = new Unicode11Addon();
      
      term.loadAddon(fit);
      term.loadAddon(webLinks);
      term.loadAddon(unicode11);
      
      // Очищаем контейнер терминала
      terminalRef.current.innerHTML = '';
      
      // Открываем терминал
      term.open(terminalRef.current);
      
      // Подгоняем размер и устанавливаем фокус
      setTimeout(() => {
        fit.fit();
        term.focus();
        
        // Добавляем класс для корректного отображения скролл-баров
        if (terminalRef.current) {
          // Получаем элемент viewport и добавляем ему класс для стилизации скролл-баров
          const viewport = terminalRef.current.querySelector('.xterm-viewport');
          if (viewport) {
            viewport.classList.add('custom-scrollbar');
            // Явно устанавливаем ширину viewport, чтобы скролл-бар не перекрывал содержимое
            (viewport as HTMLElement).style.width = 'calc(100% - 10px)';
          }
          
          // Обрабатываем экран терминала для правильного размещения
          const screen = terminalRef.current.querySelector('.xterm-screen');
          if (screen) {
            (screen as HTMLElement).style.width = '100%';
            (screen as HTMLElement).style.height = '100%';
          }
        }
      }, 100);
      
      // Сохраняем терминал и FitAddon в состоянии
      setXtermInstance(term);
      setFitAddon(fit);
      
      // Выводим приветственное сообщение
      term.write("\r\n\x1b[33mИнициализация терминала...\x1b[0m\r\n");
      
      // Запускаем процесс терминала
      try {
        // Запускаем процесс
        const procId = await invoke<number>("start_process");
        setTerminalId(procId);
        
        // Устанавливаем размер терминала
        const { rows, cols } = term;
        await invoke("resize_pty", { terminalId: procId, rows, cols });
        
        // Настраиваем обработчик ввода
        term.onData(data => {
          if (procId === null) return;
          
          // Отправляем ввод в процесс
          invoke("send_input", { terminalId: procId, input: data })
            .catch(err => {
              console.error(`Failed to send input to terminal:`, err);
              term.write(`\r\n\x1b[31mОшибка отправки ввода: ${err}\x1b[0m\r\n`);
            });
            
          // Обрабатываем буфер команды для истории
          if (data === '\r') { // Enter - завершение команды
            // Если в буфере есть команда, добавляем её в историю
            if (commandBufferRef.current.trim().length > 0) {
              setTerminalHistory(prev => [...prev, {
                command: commandBufferRef.current,
                output: "Выполнение команды..."
              }]);
              // Сбрасываем буфер команды
              commandBufferRef.current = '';
            }
          } else if (data === '\x7f' || data === '\b') { // Backspace
            // Удаляем последний символ из буфера
            if (commandBufferRef.current.length > 0) {
              commandBufferRef.current = commandBufferRef.current.slice(0, -1);
            }
          } else if (data.length === 1 && data.charCodeAt(0) >= 32) { // Печатаемые символы
            // Добавляем символ в буфер команды
            commandBufferRef.current += data;
          }
        });
        
        // Настраиваем слушатель вывода терминала
        const unlisten = await listen<[number, string]>("pty-output", (event) => {
          if (!event.payload || !Array.isArray(event.payload) || event.payload.length !== 2) {
            console.warn("Invalid terminal output format:", event.payload);
            return;
          }
          
          const [ptyId, output] = event.payload;
          
          // Проверяем, что вывод для нашего терминала
          if (ptyId === procId && term) {
            // Выводим данные в терминал
            term.write(output);
          }
        });
        
        setUnlistener(() => unlisten);
        
        // Сообщение об успешном запуске
        term.write(`\r\n\x1b[32mПроцесс терминала запущен успешно (ID: ${procId})\x1b[0m\r\n`);
        term.focus();
        
      } catch (error) {
        console.error("Failed to start terminal process:", error);
        term.write(`\r\n\x1b[31mОшибка запуска процесса: ${error}\x1b[0m\r\n`);
      }
      
      // Обработчик изменения размера окна
      const handleResize = () => {
        if (fit && term && terminalId !== null) {
          fit.fit();
          const { rows, cols } = term;
          invoke("resize_pty", { terminalId, rows, cols }).catch(err => {
            console.error("Failed to resize terminal:", err);
          });
        }
      };
      
      // Подписываемся на изменение размера окна
      window.addEventListener('resize', handleResize);
      
      // Отмечаем, что терминал инициализирован
      terminalInitializedRef.current = true;
      
      // Функция очистки при размонтировании
      return () => {
        window.removeEventListener('resize', handleResize);
        if (unlistener) {
          unlistener();
        }
        if (terminalId !== null) {
          invoke("close_terminal_process", { terminalId }).catch(err => {
            console.warn(`Failed to close terminal process:`, err);
          });
        }
        if (term) {
          term.dispose();
        }
      };
      
    } catch (error) {
      console.error("Failed to initialize terminal:", error);
      terminalInitializedRef.current = false; // Сбрасываем флаг в случае ошибки
    }
  };

  // Инициализируем терминал при переключении на вкладку терминала
  useEffect(() => {
    if (activeConsoleTab === 'terminal' && !terminalInitializedRef.current && terminalRef.current) {
      initializeTerminal();
    }
  }, [activeConsoleTab]);
  
  // Очистка ресурсов при размонтировании компонента
  useEffect(() => {
    return () => {
      // Отписываемся от слушателя
      if (unlistener) {
        unlistener();
      }
      
      // Закрываем процесс терминала
      if (terminalId !== null) {
        invoke("close_terminal_process", { terminalId }).catch(err => {
          console.warn(`Failed to close terminal process:`, err);
        });
      }
      
      // Освобождаем ресурсы терминала
      if (xtermInstance) {
        xtermInstance.dispose();
      }
    };
  }, []);

  // Обработчик изменения размера терминала при переключении вкладок
  useEffect(() => {
    // Инициализируем терминал если он не инициализирован и активна вкладка терминала
    const initIfNeeded = () => {
      if (activeConsoleTab === 'terminal' && !terminalInitializedRef.current) {
        setTimeout(() => {
          initializeTerminal();
        }, 50);
      } else if (activeConsoleTab === 'terminal' && terminalInitializedRef.current && fitAddon && xtermInstance) {
        // Если терминал уже инициализирован, просто подгоняем размер
        setTimeout(() => {
          try {
            fitAddon.fit();
            xtermInstance.focus();
          } catch (e) {
            console.error("Error resizing terminal:", e);
          }
        }, 50);
      }
    };

    initIfNeeded();
  }, [activeConsoleTab, fitAddon, xtermInstance]);

  // Сброс терминала при смене скрипта
  useEffect(() => {
    if (activeScript) {
      // Сбрасываем терминал при смене скрипта
      const resetTerm = async () => {
        // Если терминал был инициализирован, пересоздаем его
        if (terminalInitializedRef.current && xtermInstance) {
          // Сохраняем ссылку на текущий терминал
          const oldInstance = xtermInstance;
          
          // Сбрасываем флаг и экземпляр перед пересозданием
          terminalInitializedRef.current = false;
          setXtermInstance(null);
          
          // Освобождаем ресурсы старого терминала
          try {
            oldInstance.dispose();
          } catch (e) {
            console.warn("Error disposing terminal:", e);
          }
          
          // Очищаем контейнер
          if (terminalRef.current) {
            terminalRef.current.innerHTML = '';
          }
          
          // Если активна вкладка терминала, пересоздаем его
          if (activeConsoleTab === 'terminal') {
            setTimeout(() => {
              initializeTerminal();
            }, 100);
          }
        }
      };
      
      resetTerm();
    }
  }, [activeScript]);

  // Очистка терминала при размонтировании компонента
  useEffect(() => {
    return () => {
      // Отписываемся от слушателя вывода терминала
      if (unlistener) {
        unlistener();
      }
      
      // Закрываем процесс терминала
      if (terminalId !== null) {
        invoke("close_process", { terminalId })
          .catch(err => console.error("Failed to close terminal process:", err));
      }
      
      // Освобождаем ресурсы терминала
      if (xtermInstance) {
        xtermInstance.dispose();
      }
    };
  }, []);

  // Рендер терминала в консоли
  const renderTerminal = () => {
    return (
      <div 
        className="terminal-container" 
        ref={terminalRef}
        key="terminal-container"
      />
    );
  };

  // Обновляем renderConsoleContent для включения терминала xterm
  const renderConsoleContent = () => {
    return (
      <>
        <div className={`tab-terminal ${activeConsoleTab === 'terminal' ? 'active-tab' : ''}`}>
          {renderTerminal()}
        </div>
        
        <div className={`tab-problems ${activeConsoleTab === 'problems' ? 'active-tab' : ''}`}>
          {renderProblems()}
        </div>
        
        <div className={`tab-output ${activeConsoleTab === 'output' ? 'active-tab' : ''}`}>
          <div className="code-output">
            {consoleOutput.split('\n').map((line, i) => (
              <div key={i} className={`code-line ${line.includes('Error') ? 'console-error' : ''}`}>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
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
      horizontalScrollbarSize: 12,
      alwaysConsumeMouseWheel: false,
      scrollByPage: false,
      useShadows: true
    },
    wordWrap: 'on' as const,
    renderValidationDecorations: 'on' as const
  };

  // Обработчик переключения вкладок
  const handleConsoleTabChange = (tab: ConsoleTabType) => {
    // Сохраняем предыдущую активную вкладку
    const prevTab = activeConsoleTab;
    
    // Устанавливаем новую активную вкладку
    setActiveConsoleTab(tab);
    
    // Находим элементы DOM для добавления/удаления классов
    setTimeout(() => {
      // Удаляем класс active-tab со всех элементов
      const allTabs = document.querySelectorAll('.console-output > div');
      allTabs.forEach(element => {
        element.classList.remove('active-tab');
      });
      
      // Добавляем класс active-tab активной вкладке
      const activeElement = document.querySelector(`.console-output .tab-${tab}`);
      if (activeElement) {
        activeElement.classList.add('active-tab');
      }
      
      // Дополнительно активируем терминал, если выбрана его вкладка
      const terminalContainer = document.querySelector('.console-output .terminal-container');
      if (terminalContainer) {
        if (tab === 'terminal') {
          terminalContainer.classList.add('active-tab');
          
          // Инициализируем терминал, если он не инициализирован
          if (!terminalInitializedRef.current) {
            setTimeout(() => {
              initializeTerminal();
            }, 50);
          } else if (fitAddon && xtermInstance) {
            // Если терминал уже инициализирован, просто подгоняем размер
            setTimeout(() => {
              try {
                fitAddon.fit();
                xtermInstance.focus();
              } catch (e) {
                console.error("Error resizing terminal:", e);
              }
            }, 50);
          }
        } else {
          terminalContainer.classList.remove('active-tab');
        }
      }
    }, 0);
  };

  return (
    <div className="scripts-container">
      <div className="scripts-main">
        <div className="scripts-left">
          <div className="script-editor-header">
            <div className="editor-tab active" onClick={handleNewScript}>
              <span>+ Новый скрипт</span>
            </div>
            <LanguageSelector language={language} onChange={handleLanguageChange} />
            
            <div className="header-actions">
              <button 
                className="btn btn-primary btn-run" 
                onClick={handleRunScript}
                disabled={isRunning}
              >
                {isRunning ? "Выполняется..." : <><Play size={16} /> Запустить</>}
              </button>
              <button 
                className="btn btn-secondary btn-save"
                onClick={handleSaveScript}
              >
                <Save size={16} /> Сохранить
              </button>
            </div>
            
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
            <div className="script-console-header">
              <div className="script-console-tabs">
                <div 
                  className={`script-console-tab ${activeConsoleTab === 'output' ? 'active' : ''}`}
                  onClick={() => handleConsoleTabChange('output')}
                  data-tab="output"
                >
                  <FileText size={14} style={{ marginRight: '6px' }} />
                  Вывод
                </div>
                <div 
                  className={`script-console-tab ${activeConsoleTab === 'terminal' ? 'active' : ''}`}
                  onClick={() => handleConsoleTabChange('terminal')}
                  data-tab="terminal"
                >
                  <TerminalSquare size={14} style={{ marginRight: '6px' }} />
                  Терминал
                </div>
                <div 
                  className={`script-console-tab ${activeConsoleTab === 'problems' ? 'active' : ''}`}
                  onClick={() => handleConsoleTabChange('problems')}
                  data-tab="problems"
                >
                  <AlertTriangle size={14} style={{ marginRight: '6px' }} />
                  Проблемы
                  {problems.length > 0 && <span className="problem-badge">{problems.length}</span>}
                </div>
              </div>
            </div>
            <div className="console-output">
              {renderConsoleContent()}
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