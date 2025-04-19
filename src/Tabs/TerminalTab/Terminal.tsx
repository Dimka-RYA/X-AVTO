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
  
  const terminalRef = useRef<HTMLDivElement>(null);

  // Инициализация терминала
  useEffect(() => {
    const initTerminal = async (tabId: number) => {
      try {
        if (!terminalRef.current) return;
        
        // Находим текущую вкладку
        const tabIndex = tabs.findIndex(tab => tab.id === tabId);
        if (tabIndex === -1) return;
        
        // Если терминал уже инициализирован, выходим
        if (tabs[tabIndex].terminal) return;

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

        // Настраиваем обработчик ввода
        term.onData((data) => {
          if (tabs[tabIndex].isProcessRunning) {
            invoke("send_input", { input: data }).catch((err: Error) => {
              console.error("Failed to send input:", err);
              term.write(`\r\n\x1b[31mError: ${err}\x1b[0m\r\n`);
            });
          }
        });

        // Слушатель вывода процесса
        const unlisten = await listen<string>("pty-output", (event) => {
          if (term) {
            term.write(event.payload);
            
            // Добавляем запись в историю, если это новая команда
            // В реальном случае нужна более сложная логика для определения команд
            const now = new Date();
            const timeStr = `${now.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][now.getMonth()]} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            
            const lastLine = event.payload.trim();
            if (lastLine.includes('PS ') && lastLine.includes('>')) {
              // Определяем, что это вывод приглашения PowerShell
              // Можно добавить в историю последнюю команду, если она есть
              const newHistory = [...tabs[tabIndex].history];
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

        // Запускаем процесс PowerShell
        await startTerminalProcess(tabIndex);

      } catch (error) {
        console.error("Error initializing terminal:", error);
      }
    };

    // Инициализируем терминал для активной вкладки
    initTerminal(activeTab);

    // Функция для очистки при размонтировании
    return () => {
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

  // Функция изменения размера терминала
  const resizeTerminal = async (tabIndex: number) => {
    const tab = tabs[tabIndex];
    if (tab.fitAddon && tab.terminal) {
      try {
        tab.fitAddon.fit();
        const { rows, cols } = tab.terminal;
        await invoke("resize_pty", { rows, cols }).catch((err: Error) => {
          console.error("Failed to resize PTY:", err);
        });
      } catch (e) {
        console.error("Failed to fit terminal:", e);
      }
    }
  };

  // Запуск процесса в терминале
  const startTerminalProcess = async (tabIndex: number) => {
    const tab = tabs[tabIndex];
    if (!tab.terminal || tab.isProcessRunning) return;

    try {
      if (tab.fitAddon) {
        tab.fitAddon.fit();
      }
      
      if (tab.terminal) {
        const { rows, cols } = tab.terminal;
        
        tab.terminal.write("\r\n\x1b[33mЗапуск процесса терминала...\x1b[0m\r\n");
        
        await invoke("start_process");
        await invoke("resize_pty", { rows, cols }).catch((err: Error) => {
          console.error("Failed to resize PTY:", err);
        });
        
        // Обновляем статус запущенного процесса
        setTabs(prevTabs => {
          const updatedTabs = [...prevTabs];
          updatedTabs[tabIndex] = {
            ...updatedTabs[tabIndex],
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
    }
  };

  // Очистка терминала
  const clearTerminal = (tabIndex: number) => {
    const tab = tabs[tabIndex];
    if (tab.terminal) {
      tab.terminal.clear();
    }
  };

  // Обработчики вкладок
  const handleAddTab = async () => {
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
    
    if (tabs.length === 1) {
      return; // Не закрываем последнюю вкладку
    }
    
    // Находим индекс закрываемой вкладки
    const tabIndex = tabs.findIndex(tab => tab.id === id);
    if (tabIndex === -1) return;
    
    // Очищаем ресурсы вкладки
    const tab = tabs[tabIndex];
    if (tab.unlisten) {
      tab.unlisten();
    }
    if (tab.terminal) {
      tab.terminal.dispose();
    }
    
    // Удаляем вкладку
    const newTabs = tabs.filter(tab => tab.id !== id);
    setTabs(newTabs);
    
    // Если закрыли активную вкладку, активируем последнюю
    if (activeTab === id) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  };

  // Получаем текущую вкладку
  const currentTabIndex = tabs.findIndex(tab => tab.id === activeTab);
  const currentTab = currentTabIndex !== -1 ? tabs[currentTabIndex] : null;

  return (
    <div className="terminal-container">
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
        </div>
        
        <div className="terminal-output">
          {currentTab && currentTab.terminal ? (
            <div ref={terminalRef} className="terminal-instance" />
          ) : (
            <div className="terminal-placeholder">
              ТЕРМИНАЛ
            </div>
          )}
        </div>
      </div>
      
      <div className="terminal-history">
        {currentTab ? currentTab.history.map((cmd, index) => (
          <div key={index} className="history-item">
            <div className="command-name">{cmd.command}</div>
            {cmd.status && <div className="command-status">{cmd.status}</div>}
            <div className="command-time">{cmd.time}</div>
          </div>
        )) : (
          <div className="history-item">
            <div className="command-name">ipconfig</div>
            <div className="command-time">22 янв 18:37:43</div>
          </div>
        )}
      </div>
    </div>
  );
};