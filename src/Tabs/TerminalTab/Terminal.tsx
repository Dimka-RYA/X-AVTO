import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './Terminal.css';
import 'xterm/css/xterm.css';

// Иконки для нового интерфейса
import { X, RefreshCw, Search, ChevronRight, ChevronDown, AlertCircle, AlertTriangle, Info, Check, GripHorizontal } from 'lucide-react';
import { AiOutlineClear } from 'react-icons/ai';

// Интерфейсы проблем
interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  source?: string;
  code?: string;
}

interface IssueInfo {
  filePath: string;
  fileName: string;
  issues: Issue[];
}

// Интерфейс для команд терминала
interface TerminalCommand {
  command: string;
  time: string;
  status?: string;
}

// Интерфейс для данных вкладки терминала
interface TerminalTabData {
  id: number;
  name: string;
  terminal: XTerm | null;
  fitAddon: FitAddon | null;
  history: TerminalCommand[];
  terminalId: number | null; // ID процесса в Rust бэкенде
  dataHandlerAttached: boolean; // Флаг, указывающий, прикреплен ли обработчик данных
}

export const Terminal = () => {
  // Базовое состояние
  const [activeTab, setActiveTab] = useState<number>(1);
  const [activeView, setActiveView] = useState<"terminal" | "issues">("terminal");
  const [tabs, setTabs] = useState<Array<TerminalTabData>>([
    { 
      id: 1, 
      name: 'Консоль 1', 
      terminal: null, 
      fitAddon: null, 
      history: [], 
      terminalId: null,
      dataHandlerAttached: false
    }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [terminalHeight, setTerminalHeight] = useState<number>(300);
  const [issues, setIssues] = useState<IssueInfo[]>([]);
  const [issueSearch, setIssueSearch] = useState("");
  const [showIssueFilters, setShowIssueFilters] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    errors: true,
    warnings: true,
    info: true
  });
  
  // Refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const unlistenerRef = useRef<(() => void) | null>(null);
  const isInitializingRef = useRef<Set<number>>(new Set());
  const isProcessStartingRef = useRef<Set<number>>(new Set());
  const commandBufferRef = useRef<Map<number, string>>(new Map());
  const outputTrackerRef = useRef<Map<number, { lastOutput: string, lastTime: number }>>(new Map());

  // Функции для работы с файлами проблем
  const toggleFileExpand = (filePath: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  // Получение отфильтрованных проблем
  const getFilteredIssues = () => {
    if (!issues || issues.length === 0) {
      return [];
    }

    return issues
      .map((fileIssue) => ({
        ...fileIssue,
        issues: fileIssue.issues.filter((issue) => {
          const matchesSearch = issueSearch === "" ||
            (issue.message && issue.message.toLowerCase().includes(issueSearch.toLowerCase())) ||
            (fileIssue.fileName && fileIssue.fileName.toLowerCase().includes(issueSearch.toLowerCase()));
          
          const matchesFilter = (
            (issue.severity === 'error' && filters.errors) ||
            (issue.severity === 'warning' && filters.warnings) ||
            (issue.severity === 'info' && filters.info)
          );
          
          return matchesSearch && matchesFilter;
        })
      }))
      .filter((fileIssue) => fileIssue.issues && fileIssue.issues.length > 0);
  };

  // Обработка вертикального изменения размера терминала
  const handleVerticalDrag = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.preventDefault();
    const startY = e.clientY;
    const currentHeight = terminalHeight || 300;
    
    const MIN_TERMINAL_HEIGHT = 100;
    const MAX_TERMINAL_HEIGHT = window.innerHeight * 0.8; // 80% of window height
    const COLLAPSE_THRESHOLD = 30;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // Для терминала внизу, перетаскивание вверх (отрицательная дельта) увеличивает высоту
      const delta = moveEvent.clientY - startY;
      let newHeight = currentHeight - delta; // Инвертируем дельту для интуитивного поведения
      
      // Убедимся, что высота терминала остается в пределах
      newHeight = Math.max(Math.min(newHeight, MAX_TERMINAL_HEIGHT), MIN_TERMINAL_HEIGHT);
      
      // Если перетащен, чтобы быть очень маленьким, сворачиваем его
      if (newHeight <= MIN_TERMINAL_HEIGHT + COLLAPSE_THRESHOLD && delta > 0) {
        // Здесь можно добавить логику для сворачивания терминала
        return;
      }
      
      // Устанавливаем новую высоту
      setTerminalHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // Подгоняем терминал под новый размер
      setTimeout(() => {
        const tabIndex = tabs.findIndex(tab => tab.id === activeTab);
        if (tabIndex !== -1) {
          handleResize(tabIndex);
        }
      }, 100);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Настраиваем глобальный слушатель вывода терминала
  const setupGlobalListener = async () => {
    // Если уже есть слушатель, отписываемся
    if (unlistenerRef.current) {
      unlistenerRef.current();
      unlistenerRef.current = null;
    }
    
    try {
      // Создаем новый слушатель
      const unlisten = await listen<[number, string]>("pty-output", (event) => {
        if (!event.payload || !Array.isArray(event.payload) || event.payload.length !== 2) {
          console.warn("Invalid terminal output format:", event.payload);
          return;
        }
        
        const [terminalId, output] = event.payload;
        
        // Проверяем, не дублируется ли вывод (может произойти из-за эхо или переотправки)
        const termData = outputTrackerRef.current.get(terminalId) || { lastOutput: '', lastTime: 0 };
        const now = Date.now();
        
        // Если вывод идентичен последнему и прошло менее 100 мс, игнорируем его
        if (termData.lastOutput === output && now - termData.lastTime < 100) {
          console.warn(`Ignoring duplicate output for terminal ${terminalId}`);
          return;
        }
        
        // Обновляем отслеживаемый вывод
        outputTrackerRef.current.set(terminalId, { lastOutput: output, lastTime: now });
        
        // Используем актуальное состояние из setTabs
        setTabs(prevTabs => {
          // Находим вкладку по terminalId - используем актуальное состояние tabs
          const tabIndex = prevTabs.findIndex(tab => tab.terminalId === terminalId);
          
          if (tabIndex === -1) {
            console.warn(`No tab found for terminal ID ${terminalId}, searching by ID...`);
            
            // Поиск по ID, а не по terminalId (вторичный поиск)
            const terminalIdMap = new Map<number, number>(); // id вкладки -> terminalId
            for (const tab of prevTabs) {
              if (tab.terminalId !== null) {
                terminalIdMap.set(tab.id, tab.terminalId);
              }
            }
            
            // Если вкладка не найдена, но есть активная вкладка с терминалом, используем её
            const activeTabItem = prevTabs.find(tab => tab.id === activeTab);
            if (activeTabItem && activeTabItem.terminal) {
              console.log(`Sending output to active tab ${activeTab} instead`);
              activeTabItem.terminal.write(output);
              
              // Устанавливаем фокус
              setTimeout(() => {
                if (activeTabItem.terminal) {
                  activeTabItem.terminal.focus();
                }
              }, 10);
            } else {
              console.warn("No suitable tab found for terminal output");
            }
            
            // Возвращаем исходное состояние, так как мы только читаем
            return prevTabs;
          }
          
          const tab = prevTabs[tabIndex];
          
          // Если терминал существует, отправляем вывод
          if (tab.terminal) {
            tab.terminal.write(output);
            
            // Если это активная вкладка, устанавливаем фокус
            if (tab.id === activeTab) {
              setTimeout(() => {
                if (tab.terminal) {
                  tab.terminal.focus();
                }
              }, 10);
            }
          } else {
            console.warn(`Tab ${tab.id} has no terminal instance`);
          }
          
          // Возвращаем исходное состояние, так как мы только читаем, не изменяем
          return prevTabs;
        });
      });
      
      unlistenerRef.current = unlisten;
      console.log("Global terminal output listener setup successfully");
    } catch (error) {
      console.error("Failed to setup terminal output listener:", error);
      setError(`Ошибка настройки слушателя вывода терминала: ${error}`);
    }
  };
  
  // Добавление команды в историю
  const addCommandToHistory = (tabId: number, command: string) => {
    // Если команда пустая или системная, игнорируем
    if (!command || command.trim().length === 0 || 
        command.includes('[') || 
        command.includes('Терминал X-Avto')) {
      return;
    }
    
    setTabs(prevTabs => {
      const tabIndex = prevTabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) return prevTabs;
      
      // Проверяем, не повторяется ли команда
      const lastCommand = prevTabs[tabIndex].history[prevTabs[tabIndex].history.length - 1];
      if (lastCommand && lastCommand.command === command) {
        return prevTabs;
      }
      
      // Добавляем команду в историю
      const now = new Date();
      const formattedTime = `${now.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][now.getMonth()]} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      const updatedTabs = [...prevTabs];
      updatedTabs[tabIndex] = {
        ...updatedTabs[tabIndex],
        history: [...updatedTabs[tabIndex].history, {
          command: command,
          time: formattedTime
        }]
      };
      
      return updatedTabs;
    });
  };

  // Инициализация компонента
  useEffect(() => {
    console.log("Starting terminal component initialization");

    // Настраиваем глобальный слушатель вывода сразу при монтировании компонента
    setupGlobalListener();

    // Запускаем первый терминал автоматически только если активный вид - терминал
    if (activeView === "terminal") {
      const tabIndex = tabs.findIndex(tab => tab.id === activeTab);
      if (tabIndex !== -1 && !tabs[tabIndex].terminal) {
        initializeTerminal(activeTab);
      }
    }
    
    // Эффект для очистки при размонтировании
    return () => {
      console.log("Cleaning up terminal resources");
      
      // Отписываемся от слушателя
      if (unlistenerRef.current) {
        unlistenerRef.current();
        unlistenerRef.current = null;
      }
      
      // Закрываем все терминальные процессы
      tabs.forEach(tab => {
        if (tab.terminal) {
          tab.terminal.dispose();
        }
        
        if (tab.terminalId !== null) {
          invoke("close_terminal_process", { terminalId: tab.terminalId }).catch(err => {
            console.warn(`Failed to close terminal process ${tab.terminalId}:`, err);
          });
        }
      });
    };
  }, [activeView]);

  // Настраиваем слушатель при любом изменении в состоянии tabs
  useEffect(() => {
    // Управляем слушателем потока вывода только при монтировании и размонтировании компонента
    // Убираем переподписку при каждом изменении tabs, это одна из причин дублирования
  }, []);  // Пустой массив зависимостей

  // Настраиваем обработчик ввода для терминала
  const setupTerminalDataHandler = (terminal: XTerm, terminalId: number | null, tabId: number) => {
    if (!terminalId) return;
    
    // Очищаем предыдущие обработчики, если они есть
    // Используем any для доступа к внутренним свойствам xterm
    const term = terminal as any;
    
    if (term._core && term._core._addonManager && term._core._addonManager._addons) {
      // Удаляем все существующие обработчики данных
      const existingListeners = term._core._addonManager._addons
        .filter((addon: any) => addon.constructor && addon.constructor.name === 'CustomDataEventListener');
      
      if (existingListeners.length > 0) {
        console.log(`Removing ${existingListeners.length} existing data handlers for tab ${tabId}`);
        existingListeners.forEach((listener: any) => {
          term._core._addonManager._addons = 
            term._core._addonManager._addons.filter((addon: any) => addon !== listener);
        });
      }
    }
    
    // Также очищаем обработчики типа onData, которые могут вызывать дублирование ввода
    if (term._core && term._core._inputHandler && typeof term._core._inputHandler.removeDataListeners === 'function') {
      term._core._inputHandler.removeDataListeners();
    }
    
    // Отключаем эхо ввода
    // В PowerShell уже есть эхо ввода, поэтому отключаем локальное эхо в терминале
    if (term._core && term._core._coreService) {
      term._core._coreService.options.disableStdin = false;
    }
    
    // Создаем новый обработчик ввода с защитой от дублирования
    const lastInputRef = { data: '', timestamp: 0 };
    
    terminal.onData(data => {
      if (!terminalId) return;
      
      // Защита от дублирования ввода
      const now = Date.now();
      if (lastInputRef.data === data && now - lastInputRef.timestamp < 50) {
        console.warn(`Ignoring duplicate input within 50ms: "${data}"`);
        return;
      }
      
      lastInputRef.data = data;
      lastInputRef.timestamp = now;
      
      // Отправляем ввод в процесс без отображения в терминале
      // Терминальный процесс сам отобразит ввод (эхо)
      invoke("send_input", { terminalId, input: data })
        .then(() => {
          // Обрабатываем историю команд при успешной отправке
          if (data !== '\r') {
            // Если это символ Backspace (ASCII 127)
            if (data === '\x7f') {
              // Удаляем последний символ из буфера команды
              const currentBuffer = commandBufferRef.current.get(tabId) || '';
              if (currentBuffer.length > 0) {
                commandBufferRef.current.set(tabId, currentBuffer.slice(0, -1));
              }
            } else {
              // Добавляем символ в буфер команды
              const currentBuffer = commandBufferRef.current.get(tabId) || '';
              commandBufferRef.current.set(tabId, currentBuffer + data);
            }
          } else {
            // Если нажали Enter, проверяем и сохраняем команду в историю
            const command = commandBufferRef.current.get(tabId) || '';
            if (command.trim().length > 0) {
              addCommandToHistory(tabId, command);
              // Очищаем буфер после добавления команды
              commandBufferRef.current.set(tabId, '');
            }
          }
        })
        .catch(err => {
          console.error(`Failed to send input to terminal ${terminalId}:`, err);
          terminal.write(`\r\n\x1b[31mОшибка отправки ввода: ${err}\x1b[0m\r\n`);
          setError(`Ошибка отправки ввода: ${err}`);
          setTimeout(() => setError(null), 3000);
        });
    });
    
    // Отмечаем, что обработчик данных прикреплен
    setTabs(prevTabs => {
      const updatedTabs = [...prevTabs];
      const updatedTabIndex = updatedTabs.findIndex(tab => tab.id === tabId);
      
      if (updatedTabIndex === -1) {
        console.warn(`Tab ${tabId} no longer exists after attaching data handler`);
        return prevTabs;
      }
      
      updatedTabs[updatedTabIndex] = {
        ...updatedTabs[updatedTabIndex],
        dataHandlerAttached: true
      };
      
      return updatedTabs;
    });
  };

  // Инициализация терминала для новой вкладки
  const initializeTerminal = async (tabId: number) => {
    if (!terminalRef.current) {
      console.error("Terminal container ref is null");
      return;
    }
    
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.error(`Tab ${tabId} not found`);
      return;
    }
    
    // Защита от множественной инициализации
    if (isInitializingRef.current.has(tabId)) {
      console.log(`Tab ${tabId} is already initializing, skipping`);
      return;
    }
    
    console.log(`Starting terminal initialization for tab ${tabId}`);
    isInitializingRef.current.add(tabId);
    
    try {
      // Если терминал уже инициализирован, просто отображаем его
      if (tabs[tabIndex].terminal) {
        console.log(`Terminal for tab ${tabId} already exists, just displaying it`);
        
        // Очищаем контейнер
        terminalRef.current.innerHTML = '';
        
        // Отображаем терминал
        tabs[tabIndex].terminal.open(terminalRef.current);
        
        // Подгоняем размер и устанавливаем фокус
        setTimeout(() => {
          if (tabs[tabIndex].fitAddon) {
            tabs[tabIndex].fitAddon.fit();
          }
          tabs[tabIndex].terminal?.focus();
        }, 50);
        
        // Если у вкладки нет запущенного процесса, запускаем его автоматически
        if (tabs[tabIndex].terminalId === null) {
          console.log(`Tab ${tabId} has no process, starting one`);
          setTimeout(() => {
            startTerminalProcess(tabIndex);
          }, 100);
        } else if (!tabs[tabIndex].dataHandlerAttached && tabs[tabIndex].terminal && tabs[tabIndex].terminalId) {
          // Если обработчик данных еще не прикреплен, прикрепляем его
          console.log(`Setting up data handler for existing terminal of tab ${tabId}`);
          setupTerminalDataHandler(tabs[tabIndex].terminal, tabs[tabIndex].terminalId, tabId);
        }
        
        isInitializingRef.current.delete(tabId);
        return;
      }
      
      // Создаем новый терминал
      console.log(`Creating new terminal instance for tab ${tabId}`);
      
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
        screenReaderMode: false
        // Отключаем локальное эхо через другой механизм в setupTerminalDataHandler
      });
      
      const fit = new FitAddon();
      const webLinks = new WebLinksAddon();
      const unicode11 = new Unicode11Addon();
      
      term.loadAddon(fit);
      term.loadAddon(webLinks);
      term.loadAddon(unicode11);
      
      // Очищаем контейнер
      terminalRef.current.innerHTML = '';
      
      // Открываем терминал
      term.open(terminalRef.current);
      
      // Даем время для рендеринга и подгоняем размер
      await new Promise(resolve => setTimeout(resolve, 100));
      fit.fit();
      term.focus();
      
      console.log(`Terminal instance created for tab ${tabId}`);
      
      // Выводим сообщение о запуске процесса
      term.write("\r\n\x1b[33mЗапуск процесса терминала...\x1b[0m\r\n");
      
      // Обновляем состояние с новым терминалом (без terminalId пока)
      setTabs(prevTabs => {
        const updatedTabs = [...prevTabs];
        const updatedTabIndex = updatedTabs.findIndex(tab => tab.id === tabId);
        
        // Проверяем, существует ли еще вкладка
        if (updatedTabIndex === -1) {
          console.warn(`Tab ${tabId} no longer exists during terminal initialization`);
          return prevTabs;
        }
        
        updatedTabs[updatedTabIndex] = {
          ...updatedTabs[updatedTabIndex],
          terminal: term,
          fitAddon: fit,
          dataHandlerAttached: false // Важно установить false, т.к. обработчик будет добавлен позже
        };
        
        return updatedTabs;
      });
      
      // Инициализируем буфер команды для этой вкладки
      commandBufferRef.current.set(tabId, '');
      
      // Запускаем терминальный процесс
      try {
        console.log(`Starting process for tab ${tabId}`);
        
        // Увеличиваем таймаут до 15 секунд и добавляем механизм повторных попыток
        const maxAttempts = 3;
        const timeoutSeconds = 15;
        let currentAttempt = 0;
        let terminalId = null;
        
        while (currentAttempt < maxAttempts && terminalId === null) {
          currentAttempt++;
          term.write(`\r\n\x1b[33mПопытка запуска процесса ${currentAttempt}/${maxAttempts}...\x1b[0m\r\n`);
          
          try {
            // Устанавливаем таймаут для запуска процесса
            const timeoutPromise = new Promise<number>((_, reject) => {
              setTimeout(() => reject(new Error(`Тайм-аут при запуске процесса (${timeoutSeconds} сек)`)), 
                timeoutSeconds * 1000);
            });
            
            // Запускаем процесс с таймаутом
            terminalId = await Promise.race([
              invoke<number>("start_process"),
              timeoutPromise
            ]);
            
            if (terminalId !== null) {
              console.log(`Process started successfully with ID ${terminalId} for tab ${tabId} (attempt ${currentAttempt})`);
              term.write(`\r\n\x1b[32mПроцесс запущен успешно (ID: ${terminalId})\x1b[0m\r\n`);
              break;
            }
          } catch (error) {
            console.warn(`Attempt ${currentAttempt} failed: ${error}`);
            if (currentAttempt < maxAttempts) {
              term.write(`\r\n\x1b[31mОшибка: ${error}\x1b[0m\r\n`);
              term.write(`\r\n\x1b[33mПовторная попытка через 2 секунды...\x1b[0m\r\n`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              throw error; // Передаем ошибку дальше, если все попытки не удались
            }
          }
        }
        
        if (terminalId === null) {
          throw new Error("Не удалось запустить процесс после нескольких попыток");
        }
        
        // Настраиваем терминал
        const { rows, cols } = term;
        await invoke("resize_pty", { terminalId, rows, cols });
        
        // Настраиваем обработчик ввода - установка только один раз
        console.log(`Setting up initial data handler for tab ${tabId}`);
        setupTerminalDataHandler(term, terminalId, tabId);
        
        // Обновляем состояние с ID процесса
        setTabs(prevTabs => {
          const updatedTabs = [...prevTabs];
          const updatedTabIndex = updatedTabs.findIndex(tab => tab.id === tabId);
          
          if (updatedTabIndex === -1) {
            console.warn(`Tab ${tabId} no longer exists after process start`);
            return prevTabs;
          }
          
          updatedTabs[updatedTabIndex] = {
            ...updatedTabs[updatedTabIndex],
            terminalId
          };
          
          return updatedTabs;
        });
        
        // Добавляем обработчик фокуса для терминала
        term.attachCustomKeyEventHandler(event => {
          if (event.type === 'keydown') {
            term.focus();
          }
          return true;
        });
        
        // Добавляем автофокус при клике по области терминала
        if (terminalRef.current) {
          terminalRef.current.addEventListener('click', () => {
            term.focus();
          });
        }
        
        // Устанавливаем фокус несколько раз для надежности
        term.focus();
        setTimeout(() => term.focus(), 100);
        setTimeout(() => term.focus(), 300);
        
      } catch (error) {
        console.error(`Failed to start terminal process for tab ${tabId}:`, error);
        term.write(`\r\n\x1b[31mОшибка запуска процесса: ${error}\x1b[0m\r\n`);
        term.write("\r\n\x1b[33mПопробуйте создать новую вкладку терминала\x1b[0m\r\n");
        setError(`Ошибка запуска процесса: ${error}`);
        setTimeout(() => setError(null), 3000);
      }
      
    } catch (error) {
      console.error(`Error initializing terminal for tab ${tabId}:`, error);
      setError(`Ошибка инициализации терминала: ${error}`);
      setTimeout(() => setError(null), 3000);
    } finally {
      isInitializingRef.current.delete(tabId);
      console.log(`Terminal initialization for tab ${tabId} completed`);
    }
  };

  // Запуск процесса в терминале
  const startTerminalProcess = async (tabIndex: number) => {
    const tab = tabs[tabIndex];
    if (!tab) {
      console.error(`Tab at index ${tabIndex} not found`);
      return;
    }
    
    // Проверяем инициализацию терминала
    if (!tab.terminal || !tab.fitAddon) {
      console.error(`Terminal for tab ${tab.id} not initialized, cannot start process`);
      return;
    }
    
    if (tab.terminalId !== null) {
      console.log(`Process already running for tab ${tab.id} (Terminal ID: ${tab.terminalId})`);
      return;
    }
    
    // Защита от множественного запуска процесса
    if (isProcessStartingRef.current.has(tab.id)) {
      console.log(`Process for tab ${tab.id} is already starting, skipping`);
      return;
    }
    
    isProcessStartingRef.current.add(tab.id);
    
    try {
      // Подготавливаем терминал
      tab.fitAddon.fit();
      tab.terminal.focus();
      
      const { rows, cols } = tab.terminal;
      
      // Выводим сообщение о запуске
      tab.terminal.write("\r\n\x1b[33mЗапуск процесса терминала...\x1b[0m\r\n");
      
      // Увеличиваем таймаут до 15 секунд и добавляем механизм повторных попыток
      const maxAttempts = 3;
      const timeoutSeconds = 15;
      let currentAttempt = 0;
      let terminalId = null;
      
      while (currentAttempt < maxAttempts && terminalId === null) {
        currentAttempt++;
        tab.terminal.write(`\r\n\x1b[33mПопытка запуска процесса ${currentAttempt}/${maxAttempts}...\x1b[0m\r\n`);
        
        try {
          // Устанавливаем таймаут для запуска процесса
          const timeoutPromise = new Promise<number>((_, reject) => {
            setTimeout(() => reject(new Error(`Тайм-аут при запуске процесса (${timeoutSeconds} сек)`)), 
              timeoutSeconds * 1000);
          });
          
          // Запускаем процесс с таймаутом
          terminalId = await Promise.race([
            invoke<number>("start_process"),
            timeoutPromise
          ]);
          
          if (terminalId !== null) {
            console.log(`Process started successfully with ID ${terminalId} for tab ${tab.id} (attempt ${currentAttempt})`);
            tab.terminal.write(`\r\n\x1b[32mПроцесс запущен успешно (ID: ${terminalId})\x1b[0m\r\n`);
            break;
          }
        } catch (error) {
          console.warn(`Attempt ${currentAttempt} failed: ${error}`);
          if (currentAttempt < maxAttempts) {
            tab.terminal.write(`\r\n\x1b[31mОшибка: ${error}\x1b[0m\r\n`);
            tab.terminal.write(`\r\n\x1b[33mПовторная попытка через 2 секунды...\x1b[0m\r\n`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw error; // Передаем ошибку дальше, если все попытки не удались
          }
        }
      }
      
      if (terminalId === null) {
        throw new Error("Не удалось запустить процесс после нескольких попыток");
      }
      
      // Устанавливаем размер терминала
      await invoke("resize_pty", { terminalId, rows, cols });
      
      // Настраиваем обработчик ввода с нашей функцией, если он еще не был настроен
      // Проверяем, прикреплен ли уже обработчик данных
      if (!tab.dataHandlerAttached) {
        console.log(`Setting up data handler for restarted tab ${tab.id}`);
        setupTerminalDataHandler(tab.terminal, terminalId, tab.id);
      } else {
        console.log(`Data handler already attached for tab ${tab.id}, skipping setup`);
      }
      
      // Обновляем состояние с ID процесса
      setTabs(prevTabs => {
        const updatedTabs = [...prevTabs];
        const updatedTabIndex = updatedTabs.findIndex(t => t.id === tab.id);
        
        if (updatedTabIndex === -1) {
          console.warn(`Tab ${tab.id} no longer exists after process start`);
          return prevTabs;
        }
        
        updatedTabs[updatedTabIndex] = {
          ...updatedTabs[updatedTabIndex],
          terminalId
        };
        
        return updatedTabs;
      });
      
      // Сообщаем об успешном запуске
      tab.terminal.write("\r\n\x1b[32mПроцесс терминала успешно запущен\x1b[0m\r\n");
      
    } catch (error) {
      console.error(`Failed to start terminal process for tab ${tab.id}:`, error);
      if (tab.terminal) {
        tab.terminal.write(`\r\n\x1b[31mОшибка запуска процесса: ${error}\x1b[0m\r\n`);
        tab.terminal.write("\r\n\x1b[33mПопробуйте создать новую вкладку терминала\x1b[0m\r\n");
      }
      setError(`Ошибка запуска процесса: ${error}`);
      setTimeout(() => setError(null), 3000);
    } finally {
      isProcessStartingRef.current.delete(tab.id);
      console.log(`Terminal process startup for tab ${tab.id} completed`);
    }
  };

  // Функция для изменения размера терминала
  const handleResize = (tabIndex: number) => {
    const tab = tabs[tabIndex];
    if (tab && tab.terminal && tab.fitAddon && tab.terminalId !== null) {
      tab.fitAddon.fit();
      const { rows, cols } = tab.terminal;
      invoke("resize_pty", { 
        terminalId: tab.terminalId,
        rows,
        cols
      }).catch(err => {
        console.error("Failed to resize terminal:", err);
      });
    }
  };

  // Перезапуск процесса терминала
  const restartTerminalProcess = async () => {
    const tabIndex = tabs.findIndex(tab => tab.id === activeTab);
    if (tabIndex === -1) return;
    
    const tab = tabs[tabIndex];
    if (!tab.terminalId) return;
    
    try {
      // Сначала закрываем текущий процесс
      await invoke("close_terminal_process", { terminalId: tab.terminalId });
      
      // Обновляем состояние вкладки
      setTabs(prevTabs => {
        const updatedTabs = [...prevTabs];
        updatedTabs[tabIndex] = {
          ...updatedTabs[tabIndex],
          terminalId: null
        };
        return updatedTabs;
      });
      
      // Добавляем небольшую задержку перед запуском нового процесса
      setTimeout(() => {
        startTerminalProcess(tabIndex);
      }, 500);
    } catch (error) {
      console.error(`Failed to restart terminal process:`, error);
      setError(`Ошибка перезапуска процесса: ${error}`);
      setTimeout(() => setError(null), 3000);
    }
  };

  // Очистка терминала
  const handleClearTerminal = () => {
    const tabIndex = tabs.findIndex(tab => tab.id === activeTab);
    if (tabIndex === -1) return;
    
    const tab = tabs[tabIndex];
    if (tab.terminal) {
      tab.terminal.clear();
      
      // Возвращаем фокус после очистки
      setTimeout(() => {
        tab.terminal?.focus();
      }, 50);
      
      // Если есть активный процесс, отправляем команду очистки
      if (tab.terminalId !== null) {
        invoke("clear_terminal", { terminalId: tab.terminalId }).catch(err => {
          console.error("Failed to clear terminal:", err);
        });
      }
    }
  };

  // Добавление новой вкладки
  const handleAddTab = () => {
    const newTabId = tabs.length > 0 ? Math.max(...tabs.map(tab => tab.id)) + 1 : 1;
    
    setTabs(prevTabs => [
      ...prevTabs,
      {
        id: newTabId,
        name: `Консоль ${newTabId}`,
        terminal: null,
        fitAddon: null,
        history: [],
        terminalId: null,
        dataHandlerAttached: false
      }
    ]);
    
    // Активируем новую вкладку
    setActiveTab(newTabId);
  };

  // Закрытие вкладки
  const handleCloseTab = (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем всплытие события
    
    // Не закрываем последнюю вкладку
    if (tabs.length <= 1) {
      return;
    }
    
    // Находим вкладку
    const tabIndex = tabs.findIndex(tab => tab.id === id);
    if (tabIndex === -1) return;
    
    const tab = tabs[tabIndex];
    
    // Закрываем процесс в бэкенде (делаем это перед очисткой терминала)
    if (tab.terminalId !== null) {
      invoke("close_terminal_process", { terminalId: tab.terminalId }).catch(err => {
        console.warn("Failed to close terminal process:", err);
      });
    }
    
    // Очищаем ресурсы
    if (tab.terminal) {
      tab.terminal.dispose();
    }
    
    // Очищаем буфер команд
    commandBufferRef.current.delete(id);
    
    // Удаляем вкладку
    const newTabs = tabs.filter(tab => tab.id !== id);
    setTabs(newTabs);
    
    // Если закрыли активную вкладку, активируем последнюю
    if (activeTab === id) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  };

  // Активация вкладки
  const handleTabActivation = (tabId: number) => {
    if (activeTab === tabId) return; // Ничего не делаем, если вкладка уже активна
    setActiveTab(tabId);
  };

  // Обработка изменения размера окна
  useEffect(() => {
    const resizeHandler = () => {
      if (activeView === "terminal") {
        const tabIndex = tabs.findIndex(tab => tab.id === activeTab);
        if (tabIndex !== -1 && tabs[tabIndex].fitAddon && tabs[tabIndex].terminal) {
          tabs[tabIndex].fitAddon.fit();
          
          // Если есть активный процесс, обновляем размер
          if (tabs[tabIndex].terminalId !== null) {
            const { rows, cols } = tabs[tabIndex].terminal;
            invoke("resize_pty", { 
              terminalId: tabs[tabIndex].terminalId,
              rows,
              cols
            }).catch(err => {
              console.error("Failed to resize terminal:", err);
            });
          }
          
          // Возвращаем фокус на терминал после изменения размера
          setTimeout(() => {
            tabs[tabIndex].terminal?.focus();
          }, 50);
        }
      }
    };
    
    window.addEventListener('resize', resizeHandler);
    return () => window.removeEventListener('resize', resizeHandler);
  }, [activeTab, tabs, activeView]);

  // Эффект для управления вкладкой проблем
  useEffect(() => {
    if (activeView === "issues") {
      // Здесь можно добавить логику для инициализации вкладки проблем
      console.log("Issues tab activated");
      
      // Пример получения проблем (в реальном приложении будет другая логика)
      setIssues([
        {
          filePath: "/example/path/file1.tsx",
          fileName: "file1.tsx",
          issues: [
            {
              severity: "error",
              message: "Пример ошибки в файле",
              line: 10,
              column: 5,
              endLine: 10,
              endColumn: 20
            }
          ]
        }
      ]);
    }
  }, [activeView]);

  // Функция для обработки клика по проблеме
  const handleIssueClick = (filePath: string, line: number, column: number) => {
    console.log(`Issue clicked: ${filePath}:${line}:${column}`);
    // Здесь будет логика для открытия файла в указанной позиции
  };

  // Функция для получения иконки по типу проблемы
  const getSeverityIcon = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={14} className="severity-icon error" />;
      case 'warning':
        return <AlertTriangle size={14} className="severity-icon warning" />;
      case 'info':
        return <Info size={14} className="severity-icon info" />;
    }
  };

  // Функция для отображения проблем
  const renderIssues = () => {
    const filteredIssues = getFilteredIssues();
    
    if (filteredIssues.length === 0) {
      return (
        <div className="no-issues">
          <div className="no-issues-content">
            <div className="icon-container">
              <Check size={24} color="#4caf50" />
            </div>
            <span>Нет обнаруженных проблем</span>
          </div>
        </div>
      );
    }
    
    return (
      <div className="issues-list">
        {filteredIssues.map((fileIssue) => (
          <div key={fileIssue.filePath} className="file-issues">
            <div 
              className="file-header"
              onClick={() => toggleFileExpand(fileIssue.filePath)}
            >
              {expandedFiles.has(fileIssue.filePath) ? 
                <ChevronDown size={16} /> : 
                <ChevronRight size={16} />
              }
              <div className="file-name">
                {fileIssue.fileName}
              </div>
              <div className="issue-counts">
                {fileIssue.issues.filter((i) => i.severity === 'error').length > 0 && (
                  <span className="error-count">
                    {fileIssue.issues.filter((i) => i.severity === 'error').length} <AlertCircle size={12} />
                  </span>
                )}
                {fileIssue.issues.filter((i) => i.severity === 'warning').length > 0 && (
                  <span className="warning-count">
                    {fileIssue.issues.filter((i) => i.severity === 'warning').length} <AlertTriangle size={12} />
                  </span>
                )}
              </div>
            </div>
            
            {expandedFiles.has(fileIssue.filePath) && (
              <div className="issue-details">
                {fileIssue.issues.map((issue, idx) => (
                  <div 
                    key={`${fileIssue.filePath}-${idx}`} 
                    className="issue-item"
                    onClick={() => handleIssueClick(fileIssue.filePath, issue.line, issue.column)}
                  >
                    {getSeverityIcon(issue.severity)}
                    <div className="issue-message">{issue.message}</div>
                    <div className="issue-position">
                      строка {issue.line}, столбец {issue.column}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Скрытие панели терминала
  const hideTerminalPanel = () => {
    // В реальном приложении здесь будет логика скрытия панели
    console.log("Hiding terminal panel");
  };

  // Обработка изменения активной вкладки
  useEffect(() => {
    console.log(`Active tab changed to ${activeTab}`);
    
    // Если активный вид - не терминал, ничего не делаем
    if (activeView !== "terminal") return;
    
    // Используем доступные переменные tabIndex и tab
    const tabIndex = tabs.findIndex(tab => tab.id === activeTab);
    const tab = tabIndex !== -1 ? tabs[tabIndex] : null;
    
    // Если терминал еще не инициализирован, инициализируем его
    if (!tab?.terminal) {
      initializeTerminal(activeTab);
    } else {
      // Если терминал уже инициализирован, просто отображаем его
      if (terminalRef.current) {
        // Очищаем контейнер перед отображением терминала
        terminalRef.current.innerHTML = '';
        
        // Открываем терминал заново
        tab.terminal?.open(terminalRef.current);
        
        // Подгоняем размер и фокусируемся
        setTimeout(() => {
          if (tab.fitAddon) {
            tab.fitAddon.fit();
            
            // Если есть активный процесс, обновляем размер
            if (tab.terminalId !== null) {
              const { rows, cols } = tab.terminal!;
              invoke("resize_pty", { 
                terminalId: tab.terminalId,
                rows,
                cols
              }).catch(err => {
                console.error("Failed to resize terminal:", err);
              });
            }
            
            // Устанавливаем фокус на терминал для ввода
            setTimeout(() => {
              tab.terminal?.focus();
            }, 50);
          }
        }, 50);
        
        // Добавляем автофокус при клике по области терминала
        if (terminalRef.current) {
          const terminal = tab.terminal;
          const clickHandler = () => {
            terminal?.focus();
          };
          
          // Удаляем предыдущие обработчики перед добавлением нового
          terminalRef.current.removeEventListener('click', clickHandler);
          terminalRef.current.addEventListener('click', clickHandler);
        }
        
        // Проверяем, установлен ли обработчик данных, если нет - устанавливаем
        if (!tab.dataHandlerAttached && tab.terminalId !== null) {
          console.log(`Setting up data handler for activated tab ${tab.id}`);
          setupTerminalDataHandler(tab.terminal, tab.terminalId, tab.id);
        }
      }
    }
  }, [activeTab, tabs, activeView]);

  // Добавляем объявление currentTabIndex и currentTab только один раз перед рендерингом компонента
  const currentTabIndex = tabs.findIndex(tab => tab.id === activeTab);
  const currentTab = currentTabIndex !== -1 ? tabs[currentTabIndex] : null;

  return (
    <div className="terminal-container">
      {error && (
        <div className="terminal-error">
          <div className="error-message">{error}</div>
          <button className="error-close-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}
      <div className="terminal-main">
        <div className="terminal-tabs">
          {tabs.map(tab => (
            <div 
              key={tab.id} 
              className={`terminal-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabActivation(tab.id)}
            >
              <span>{tab.name}</span>
              <button 
                className="tab-close-btn"
                onClick={(e) => handleCloseTab(tab.id, e)}
              >
                ×
              </button>
            </div>
          ))}
          <button className="tab-add-btn" onClick={handleAddTab}>+</button>
          
          <div className="terminal-toolbar">
            <button 
              className="tab-clear-btn" 
              title="Очистить терминал"
              onClick={handleClearTerminal}
            >
              🗑️
            </button>
          </div>
        </div>
        
        <div 
          className="terminal-output" 
          onClick={() => {
            if (currentTab?.terminal) {
              setTimeout(() => currentTab.terminal?.focus(), 10);
            }
          }}
        >
          <div 
            ref={terminalRef} 
            className="terminal-instance" 
            tabIndex={-1} 
          />
          {!currentTab || !currentTab.terminal ? (
            <div className="terminal-placeholder">
              ТЕРМИНАЛ
            </div>
          ) : null}
        </div>
      </div>
      
      <div className="terminal-history">
        {currentTab && currentTab.history.length > 0 ? currentTab.history.map((cmd, index) => (
          <div key={index} className="history-item">
            <div className="command-name">{cmd.command}</div>
            {cmd.status && <div className="command-status">{cmd.status}</div>}
            <div className="command-time">{cmd.time}</div>
          </div>
        )) : (
          <div className="history-item">
            <div className="command-name">История команд</div>
            <div className="command-time">...</div>
          </div>
        )}
      </div>
      
      {currentTab && currentTab.terminalId !== null && (
        <div className="status-indicator running" title="Процесс запущен" />
      )}
    </div>
  );
};