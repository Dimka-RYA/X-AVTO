import React, { useState, useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './Terminal.css';
import 'xterm/css/xterm.css';

interface TerminalCommand {
  command: string;
  time: string;
  status?: string;
}

interface TerminalTabData {
  id: number;
  name: string;
  terminal: XTerm | null;
  fitAddon: FitAddon | null;
  history: TerminalCommand[];
  unlisten: (() => void) | null;
  isProcessRunning: boolean;
}

export const Terminal = () => {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [tabs, setTabs] = useState<Array<TerminalTabData>>([
    { 
      id: 1, 
      name: 'Консоль 1', 
      terminal: null, 
      fitAddon: null, 
      history: [], 
      unlisten: null,
      isProcessRunning: false
    }
  ]);
  const [error, setError] = useState<string | null>(null);
  
  // Используем реф для хранения состояния запущенных процессов, чтобы решить проблему замыканий
  const runningProcessesRef = useRef<Map<number, boolean>>(new Map());
  
  const terminalRef = useRef<HTMLDivElement>(null);

  // Инициализация терминала
  useEffect(() => {
    console.log("Initializing terminal...");
    const initTerminal = async (tabId: number) => {
      try {
        console.log("Setting up terminal for tab:", tabId);
        if (!terminalRef.current) {
          console.error("Terminal ref is null");
          setError("Ошибка: DOM-элемент терминала не найден");
          return;
        }
        
        // Находим текущую вкладку
        const tabIndex = tabs.findIndex(tab => tab.id === tabId);
        if (tabIndex === -1) {
          console.error("Tab not found:", tabId);
          setError(`Ошибка: Вкладка ${tabId} не найдена`);
          return;
        }
        
        // Если терминал уже инициализирован, просто делаем его видимым
        if (tabs[tabIndex].terminal) {
          console.log("Terminal already initialized for tab:", tabId);
          
          // Очищаем контейнер перед добавлением существующего терминала
          terminalRef.current.innerHTML = '';
          
          // Переоткрываем терминал в контейнере
          tabs[tabIndex].terminal?.open(terminalRef.current);
          
          // Устанавливаем правильный размер
          setTimeout(() => {
            tabs[tabIndex].fitAddon?.fit();
          }, 50);
          
          return;
        }

        console.log("Creating new terminal instance");
        
        // Создаем новый экземпляр терминала
        const term = new XTerm({
          cursorBlink: true,
          
          // ↓↓↓ НАСТРОЙКИ ШРИФТА ТЕРМИНАЛА ↓↓↓
          fontSize: 14,               // Размер шрифта (в пикселях)
          fontFamily: 'Courier New',  // Семейство шрифта (можно изменить на 'Consolas', 'Monaco' и др.)
          fontWeight: 'normal',       // Жирность шрифта ('normal', 'bold', '100'-'900')
          lineHeight: 0.9,            // Высота строки (меньше 1 = более компактно)
          letterSpacing: 0.5,         // Расстояние между символами (в пикселях)
          // ↑↑↑ НАСТРОЙКИ ШРИФТА ТЕРМИНАЛА ↑↑↑
          
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
          disableStdin: false
        });

        const fit = new FitAddon();
        const webLinks = new WebLinksAddon();
        const unicode11 = new Unicode11Addon();

        term.loadAddon(fit);
        term.loadAddon(webLinks);
        term.loadAddon(unicode11);

        console.log("Opening terminal in container");
        
        // Очищаем контейнер перед открытием нового терминала
        terminalRef.current.innerHTML = '';
        term.open(terminalRef.current);

        // Даем время для рендеринга
        await new Promise(resolve => setTimeout(resolve, 100));
        fit.fit();

        console.log("Terminal rendered, setting up data handler");
        
        // Настраиваем обработчик ввода
        term.onData((data) => {
          console.log(`Terminal input handler triggered: ${JSON.stringify(data)}`);
          
          // Используем реф для проверки состояния процесса
          // Также проверяем, является ли эта вкладка активной в данный момент
          const isActiveTab = activeTab === tabId;
          const processRunning = runningProcessesRef.current.get(tabId) || false;
          
          console.log(`Input for tab ${tabId}, active: ${isActiveTab}, process running: ${processRunning}`);
          
          // Обрабатываем ввод только если процесс запущен
          if (processRunning) {
            console.log("Sending input to terminal:", data);
            invoke("send_input", { input: data })
              .then(() => console.log("Input sent successfully"))
              .catch((err: Error) => {
                console.error("Failed to send input:", err);
                term.write(`\r\n\x1b[31mОшибка отправки ввода: ${err}\x1b[0m\r\n`);
                setError(`Ошибка отправки ввода: ${err.message}`);
              });
          } else {
            console.warn(`Input ignored for tab ${tabId} - terminal process not running`);
            // Подсказка пользователю в терминале - проверяем активную вкладку
            if (isActiveTab) {
              term.write("\r\n\x1b[33mДля ввода команд необходимо сначала запустить процесс терминала, нажмите кнопку '▶'\x1b[0m\r\n");
            }
          }
        });

        console.log("Setting up event listener for terminal output");
        
        // Слушатель вывода процесса
        try {
          const unlisten = await listen<string>("pty-output", (event) => {
            if (term) {
              console.log(`Received terminal output (${event.payload.length} bytes): ${event.payload.substring(0, 50)}${event.payload.length > 50 ? '...' : ''}`);
              
              // Обработка исключительных случаев
              if (!event.payload || event.payload.length === 0) {
                console.warn("Received empty terminal output");
                return;
              }
              
              // Запись в терминал
              term.write(event.payload);
              
              // Добавляем запись в историю, если это новая команда
              const now = new Date();
              // Генерируем строку времени в формате "22 янв 18:37:43"
              const formattedTime = `${now.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][now.getMonth()]} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
              
              const lastLine = event.payload.trim();
              if (lastLine.includes('PS ') && lastLine.includes('>')) {
                // Определяем, что это вывод приглашения PowerShell
                // Можно добавить в историю последнюю команду, если она есть
                const newHistory = [...tabs[tabIndex].history];
                
                // Добавляем запись в историю команд
                if (lastLine.includes('PS ')) {
                  const commandText = lastLine.substring(0, lastLine.indexOf('PS ')).trim();
                  if (commandText) {
                    newHistory.push({
                      command: commandText,
                      time: formattedTime
                    });
                  }
                }
                
                setTabs(prevTabs => {
                  const updatedTabs = [...prevTabs];
                  updatedTabs[tabIndex] = {
                    ...updatedTabs[tabIndex],
                    history: newHistory
                  };
                  return updatedTabs;
                });
              }
            }
          });
          
          console.log("Event listener registered successfully");

          // Обновляем состояние вкладки
          setTabs(prevTabs => {
            const updatedTabs = [...prevTabs];
            updatedTabs[tabIndex] = {
              ...updatedTabs[tabIndex],
              terminal: term,
              fitAddon: fit,
              unlisten: unlisten
            };
            return updatedTabs;
          });
          
          console.log("Terminal state updated, starting process");

          // Не запускаем процесс автоматически, оставляем это пользователю
          // await startTerminalProcess(tabIndex);
          console.log("Terminal initialized and ready. User can now start the process manually.");
        } catch (listenerError) {
          console.error("Error setting up event listener:", listenerError);
          term.write(`\r\n\x1b[31mОшибка настройки слушателя событий: ${listenerError}\x1b[0m\r\n`);
          setError(`Ошибка настройки слушателя событий: ${listenerError}`);
        }
      } catch (error) {
        console.error("Error initializing terminal:", error);
        setError(`Ошибка инициализации терминала: ${error}`);
      }
    };

    // Инициализируем терминал для активной вкладки
    initTerminal(activeTab);

    // Эффект для очистки при размонтировании
    return () => {
      console.log("Cleaning up terminal resources");
      tabs.forEach(tab => {
        try {
          if (tab.unlisten) {
            tab.unlisten();
          }
          if (tab.terminal) {
            tab.terminal.dispose();
          }
        } catch (e) {
          console.error(`Error cleaning up tab ${tab.id}:`, e);
        }
      });
    };
  }, [activeTab]); // Запускаем только при изменении активной вкладки

  // Эффект для обработки изменения размера окна
  useEffect(() => {
    const handleResize = () => {
      const tabIndex = tabs.findIndex(tab => tab.id === activeTab);
      if (tabIndex !== -1) {
        resizeTerminal(tabIndex);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // При монтировании компонента также вызываем ресайз
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [activeTab, tabs]);

  // Эффект для синхронизации состояния запущенных процессов между React state и ref
  useEffect(() => {
    // Очистим реф перед обновлением
    runningProcessesRef.current.clear();
    
    // Обновим состояние в рефе на основе tabs
    tabs.forEach(tab => {
      if (tab.isProcessRunning) {
        runningProcessesRef.current.set(tab.id, true);
      }
    });
  }, [tabs]);

  // Эффект для сохранения состояния всех терминалов при их инициализации
  useEffect(() => {
    // Этот эффект срабатывает каждый раз, когда изменяется массив tabs
    // Мы используем его для сохранения состояния терминалов
    console.log("Tabs state changed, preserving terminal state");
    
    // Сохраняем инстансы терминалов в локальных переменных, если они уничтожаются
    tabs.forEach((tab, index) => {
      if (tab.terminal && tab.id !== activeTab) {
        // Для неактивных вкладок убедимся, что DOM-элемент отсоединен,
        // но состояние сохранено в памяти
        console.log(`Preserving terminal state for tab ${tab.id}`);
      }
    });
  }, [tabs]);

  // Функция изменения размера терминала
  const resizeTerminal = async (tabIndex: number) => {
    const tab = tabs[tabIndex];
    if (tab.fitAddon && tab.terminal) {
      try {
        tab.fitAddon.fit();
        const { rows, cols } = tab.terminal;
        console.log(`Resizing terminal to ${rows} rows x ${cols} columns`);
        await invoke("resize_pty", { rows, cols }).catch((err: Error) => {
          console.error("Failed to resize PTY:", err);
          setError(`Ошибка изменения размера терминала: ${err.message}`);
        });
      } catch (e) {
        console.error("Failed to fit terminal:", e);
        setError(`Ошибка подгонки размера терминала: ${e}`);
      }
    }
  };

  // Запуск процесса в терминале
  const startTerminalProcess = async (tabIndex: number) => {
    console.log("Starting terminal process for tab index:", tabIndex);
    
    // Получаем вкладку напрямую по индексу
    const tab = tabs[tabIndex];
    if (!tab) {
      console.error(`Tab not found at index ${tabIndex}`);
      return;
    }

    // Проверяем, готов ли терминал к запуску процесса
    if (!tab.terminal) {
      console.error("Terminal not initialized");
      return;
    }
    
    if (tab.isProcessRunning) {
      console.log("Process already running for this tab");
      return;
    }

    try {
      if (tab.fitAddon) {
        tab.fitAddon.fit();
        console.log("Terminal fitted successfully");
      }
      
      const { rows, cols } = tab.terminal;
      console.log(`Terminal dimensions: ${rows} rows x ${cols} columns`);
      
      tab.terminal.write("\r\n\x1b[33mЗапуск процесса терминала...\x1b[0m\r\n");
      
      // Закрываем предыдущий PTY процесс, если он существует
      try {
        await invoke("close_terminal_process").catch(err => {
          console.warn("No previous terminal process to close or error:", err);
        });
      } catch (closeError) {
        console.warn("Failed to close previous terminal process:", closeError);
      }
      
      console.log("Invoking start_process Tauri command");
      try {
        await invoke("start_process");
        console.log("start_process invoked successfully");
      } catch (startError) {
        console.error("Failed to start process:", startError);
        tab.terminal.write(`\r\n\x1b[31mОшибка запуска процесса: ${startError}\x1b[0m\r\n`);
        setError(`Ошибка запуска процесса: ${startError}`);
        return;
      }
      
      console.log("Resizing PTY to match terminal dimensions");
      try {
        await invoke("resize_pty", { rows, cols });
        console.log("resize_pty invoked successfully");
      } catch (resizeError) {
        console.error("Failed to resize PTY:", resizeError);
        setError(`Ошибка изменения размера PTY: ${resizeError}`);
        // Продолжаем выполнение, так как это не критическая ошибка
      }
      
      console.log("Process started successfully, updating state");
      
      // Сначала снимаем статус запущенного процесса со всех вкладок
      runningProcessesRef.current.forEach((_, key) => {
        runningProcessesRef.current.set(key, false);
      });
      
      // Затем устанавливаем статус только для текущей вкладки
      runningProcessesRef.current.set(tab.id, true);
      
      // Обновляем React-состояние
      setTabs(prevTabs => prevTabs.map(t => ({
        ...t,
        isProcessRunning: t.id === tab.id
      })));
      
      tab.terminal.write("\r\n\x1b[32mПроцесс успешно запущен\x1b[0m\r\n");
    } catch (err: any) {
      console.error("Failed to start process:", err);
      if (tab.terminal) {
        tab.terminal.write(`\r\n\x1b[31mОшибка запуска терминального процесса: ${err}\x1b[0m\r\n`);
      }
      setError(`Ошибка запуска процесса терминала: ${err}`);
    }
  };

  // Очистка терминала
  const clearTerminal = (tabIndex: number) => {
    console.log("Clearing terminal for tab:", tabIndex);
    const tab = tabs[tabIndex];
    if (tab.terminal) {
      tab.terminal.clear();
    }
  };

  // Обработчики вкладок
  const handleAddTab = async () => {
    console.log("Adding new terminal tab");
    const newTabId = tabs.length > 0 ? Math.max(...tabs.map(tab => tab.id)) + 1 : 1;
    
    // Сохраняем все терминалы перед добавлением новой вкладки
    // Важно! Не отсоединяем активный терминал от DOM до его сохранения
    const currentTabIndex = tabs.findIndex(tab => tab.id === activeTab);
    
    // Создаем копию текущих вкладок перед добавлением новой
    const updatedTabs = [...tabs];
    
    // Добавляем новую вкладку
    const newTabs = [
      ...updatedTabs,
      { 
        id: newTabId, 
        name: `Консоль ${newTabId}`, 
        terminal: null, 
        fitAddon: null, 
        history: [], 
        unlisten: null,
        isProcessRunning: false
      }
    ];
    
    // Применяем обновление
    setTabs(newTabs);
    
    // Отсоединяем DOM элемент только после сохранения состояния
    if (currentTabIndex !== -1 && terminalRef.current) {
      console.log("Detaching current terminal DOM element");
      terminalRef.current.innerHTML = '';
    }
    
    // Активируем новую вкладку после отсоединения
    setActiveTab(newTabId);
  };

  const handleCloseTab = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Closing terminal tab:", id);
    
    if (tabs.length === 1) {
      console.log("Cannot close the last tab");
      return; // Не закрываем последнюю вкладку
    }
    
    // Находим индекс закрываемой вкладки
    const tabIndex = tabs.findIndex(tab => tab.id === id);
    if (tabIndex === -1) return;
    
    // Очищаем ресурсы вкладки
    const tab = tabs[tabIndex];
    if (tab.unlisten) {
      console.log("Removing event listener");
      tab.unlisten();
    }
    if (tab.terminal) {
      console.log("Disposing terminal instance");
      tab.terminal.dispose();
    }
    
    // Очищаем статус запущенного процесса в рефе
    runningProcessesRef.current.delete(tab.id);
    
    // Удаляем вкладку
    const newTabs = tabs.filter(tab => tab.id !== id);
    setTabs(newTabs);
    
    // Если закрыли активную вкладку, активируем последнюю
    if (activeTab === id) {
      console.log("Activating last tab after closing active tab");
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  };

  // Активация вкладки
  const handleTabActivation = (tabId: number) => {
    console.log(`Activating tab with ID: ${tabId}`);
    
    // Если нажали на ту же самую вкладку, ничего не делаем
    if (activeTab === tabId) {
      console.log("This tab is already active");
      return;
    }
    
    // Находим индекс текущей и новой вкладки
    const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
    const newIndex = tabs.findIndex(tab => tab.id === tabId);
    
    if (newIndex === -1) {
      console.error(`Tab with ID ${tabId} not found`);
      return;
    }
    
    // Очищаем DOM-элемент перед переключением
    if (terminalRef.current) {
      terminalRef.current.innerHTML = '';
    }
    
    // Обновляем активную вкладку в состоянии
    setActiveTab(tabId);
    
    // Создаем таймаут для рендеринга терминала после изменения состояния
    setTimeout(() => {
      // Если терминал инициализирован, отображаем его
      if (tabs[newIndex].terminal && terminalRef.current) {
        try {
          // Открываем терминал в контейнере
          tabs[newIndex].terminal.open(terminalRef.current);
          
          // Обновляем размер терминала
          if (tabs[newIndex].fitAddon) {
            tabs[newIndex].fitAddon.fit();
            
            // Обновляем размер PTY, если процесс запущен
            if (tabs[newIndex].isProcessRunning) {
              const { rows, cols } = tabs[newIndex].terminal!;
              invoke("resize_pty", { rows, cols }).catch((err: Error) => {
                console.error("Failed to resize PTY:", err);
              });
            }
          }
        } catch (err) {
          console.error("Error reopening terminal:", err);
          // В случае ошибки, пробуем пересоздать терминал для вкладки
          const initTerminalImpl = async (tabId: number) => {
            try {
              console.log("Setting up terminal for tab:", tabId);
              if (!terminalRef.current) {
                console.error("Terminal ref is null");
                setError("Ошибка: DOM-элемент терминала не найден");
                return;
              }
              
              // Находим текущую вкладку
              const tabIndex = tabs.findIndex(tab => tab.id === tabId);
              if (tabIndex === -1) {
                console.error("Tab not found:", tabId);
                setError(`Ошибка: Вкладка ${tabId} не найдена`);
                return;
              }
              
              // Создаем новый экземпляр терминала
              const term = new XTerm({
                cursorBlink: true,
                fontSize: 14,
                fontFamily: 'Courier New',
                fontWeight: 'normal',
                lineHeight: 0.9,
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
                disableStdin: false
              });
      
              const fit = new FitAddon();
              const webLinks = new WebLinksAddon();
              const unicode11 = new Unicode11Addon();
      
              term.loadAddon(fit);
              term.loadAddon(webLinks);
              term.loadAddon(unicode11);
      
              console.log("Opening terminal in container");
              
              // Очищаем контейнер перед открытием нового терминала
              if (terminalRef.current) {
                terminalRef.current.innerHTML = '';
                term.open(terminalRef.current);
              }
      
              // Даем время для рендеринга
              await new Promise(resolve => setTimeout(resolve, 100));
              fit.fit();
      
              // Обновляем состояние
              setTabs(prevTabs => prevTabs.map(tab => 
                tab.id === tabId ? { ...tab, terminal: term, fitAddon: fit } : tab
              ));
            } catch (e: any) {
              console.error("Failed to initialize terminal:", e);
              setError(`Ошибка инициализации терминала: ${e.message || e}`);
            }
          };
          
          initTerminalImpl(tabId).catch((e: any) => {
            console.error("Failed to reinitialize terminal:", e);
            setError(`Ошибка при повторной инициализации терминала: ${e.message || e}`);
          });
        }
      } else {
        // Если терминал не инициализирован для этой вкладки
        const initExistingTerminal = async () => {
          try {
            console.log("Setting up terminal for tab:", tabId);
            if (!terminalRef.current) {
              console.error("Terminal ref is null");
              setError("Ошибка: DOM-элемент терминала не найден");
              return;
            }
              
            // Находим текущую вкладку
            const tabIndex = tabs.findIndex(tab => tab.id === tabId);
            if (tabIndex === -1) {
              console.error("Tab not found:", tabId);
              setError(`Ошибка: Вкладка ${tabId} не найдена`);
              return;
            }
              
            // Создаем новый экземпляр терминала для вкладки
            const term = new XTerm({
              cursorBlink: true,
              fontSize: 14,
              fontFamily: 'Courier New',
              fontWeight: 'normal',
              lineHeight: 0.9,
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
              disableStdin: false
            });
    
            const fit = new FitAddon();
            const webLinks = new WebLinksAddon();
            const unicode11 = new Unicode11Addon();
    
            term.loadAddon(fit);
            term.loadAddon(webLinks);
            term.loadAddon(unicode11);
    
            // Очищаем контейнер перед открытием нового терминала
            terminalRef.current.innerHTML = '';
            term.open(terminalRef.current);
    
            // Даем время для рендеринга
            await new Promise(resolve => setTimeout(resolve, 100));
            fit.fit();
    
            // Обновляем состояние для этой вкладки
            setTabs(prevTabs => 
              prevTabs.map(tab => tab.id === tabId ? 
                { ...tab, terminal: term, fitAddon: fit } : tab)
            );
          } catch (e: any) {
            console.error("Failed to initialize terminal:", e);
            setError(`Ошибка инициализации терминала: ${e.message || e}`);
          }
        };
          
        initExistingTerminal().catch((e: any) => {
          console.error("Failed to initialize terminal:", e);
          setError(`Ошибка при инициализации терминала: ${e.message || e}`);
        });
      }
    }, 50);
  };

  // Получаем текущую вкладку
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
          {currentTab && !currentTab.isProcessRunning && (
            <button 
              className="tab-start-btn" 
              title="Запустить терминал"
              onClick={() => {
                const idx = tabs.findIndex(t => t.id === currentTab.id);
                if (idx !== -1) startTerminalProcess(idx);
              }}
            >
              ▶
            </button>
          )}
        </div>
        
        <div className="terminal-output">
          <div ref={terminalRef} className="terminal-instance" />
          {!currentTab || !currentTab.terminal ? (
            <div className="terminal-placeholder">
              ТЕРМИНАЛ
            </div>
          ) : null}
          
          {currentTab && currentTab.terminal && !currentTab.isProcessRunning && (
            <div className="terminal-start-overlay">
              <button 
                className="terminal-start-btn"
                onClick={() => {
                  const idx = tabs.findIndex(t => t.id === currentTab.id);
                  if (idx !== -1) startTerminalProcess(idx);
                }}
              >
                Запустить терминал
              </button>
            </div>
          )}
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
      
      {currentTab && currentTab.isProcessRunning && (
        <div className="status-indicator running" title="Процесс запущен" />
      )}
    </div>
  );
};