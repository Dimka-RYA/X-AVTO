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
        
        // Если терминал уже инициализирован, выходим
        if (tabs[tabIndex].terminal) {
          console.log("Terminal already initialized for tab:", tabId);
          return;
        }

        console.log("Creating new terminal instance");
        
        // Создаем новый экземпляр терминала
        const term = new XTerm({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Consolas, "Courier New", monospace',
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
          allowProposedApi: true
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
          const processRunning = runningProcessesRef.current.get(tabId) || false;
          console.log(`Is process running: ${processRunning}`);
          
          if (processRunning) {
            console.log("Sending input to terminal:", data);
            invoke("send_input", { input: data })
              .then(() => console.log("Input sent successfully"))
              .catch((err: Error) => {
                console.error("Failed to send input:", err);
                term.write(`\r\n\x1b[31mError: ${err}\x1b[0m\r\n`);
                setError(`Ошибка отправки ввода: ${err.message}`);
              });
          } else {
            console.warn("Input ignored - terminal process not running");
            // Подсказка пользователю в терминале
            term.write("\r\n\x1b[33mДля ввода команд необходимо сначала запустить процесс терминала, нажмите кнопку '▶'\x1b[0m\r\n");
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

    // Функция для очистки при размонтировании
    return () => {
      console.log("Cleaning up terminal resources");
      tabs.forEach(tab => {
        if (tab.unlisten) {
          tab.unlisten();
        }
        if (tab.terminal) {
          tab.terminal.dispose();
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
    console.log("Starting terminal process for tab:", tabIndex);
    // Используем индекс в массиве tabs вместо ID вкладки
    const currentTabIndex = tabs.findIndex(tab => tab.id === tabs[tabIndex].id);
    if (currentTabIndex === -1) {
      console.error("Tab not found in tabs array");
      return;
    }
    
    const tab = tabs[currentTabIndex];
    if (!tab.terminal || tab.isProcessRunning) {
      console.log("Terminal not initialized or process already running");
      return;
    }

    try {
      if (tab.fitAddon) {
        tab.fitAddon.fit();
        console.log("Terminal fitted successfully");
      }
      
      if (tab.terminal) {
        const { rows, cols } = tab.terminal;
        console.log(`Terminal dimensions: ${rows} rows x ${cols} columns`);
        
        tab.terminal.write("\r\n\x1b[33mЗапуск процесса терминала...\x1b[0m\r\n");
        
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
        
        // Обновляем статус запущенного процесса в рефе
        runningProcessesRef.current.set(tab.id, true);
        
        // Обновляем статус запущенного процесса в React-стейте
        setTabs(prevTabs => {
          const updatedTabs = [...prevTabs];
          updatedTabs[currentTabIndex] = {
            ...updatedTabs[currentTabIndex],
            isProcessRunning: true
          };
          return updatedTabs;
        });
        
        tab.terminal.write("\r\n\x1b[32mПроцесс успешно запущен\x1b[0m\r\n");
      }
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
    
    // Добавляем новую вкладку
    setTabs(prevTabs => [
      ...prevTabs, 
      { 
        id: newTabId, 
        name: `Консоль ${newTabId}`, 
        terminal: null, 
        fitAddon: null, 
        history: [], 
        unlisten: null,
        isProcessRunning: false
      }
    ]);
    
    // Активируем новую вкладку
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
              onClick={() => setActiveTab(tab.id)}
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