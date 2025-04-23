import React, { useState } from 'react';
import '../RequestsTab.css';

interface WebSocketPanelProps {
  onSendRequest: () => void;
}

type WSTabType = 'params' | 'auth' | 'headers';
type ResultTabType = 'body' | 'logs';

export const WebSocketPanel: React.FC<WebSocketPanelProps> = ({ onSendRequest }) => {
  const [wsUrl, setWsUrl] = useState<string>('ws://localhost:8080');
  const [message, setMessage] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<WSTabType>('params');
  const [activeResultTab, setActiveResultTab] = useState<ResultTabType>('logs');
  
  return (
    <div className="protocol-panel">
      <div className="request-controls">
        <input 
          type="text"
          className="url-input"
          placeholder="WebSocket URL"
          value={wsUrl}
          onChange={(e) => setWsUrl(e.target.value)}
        />
        <button 
          className="connection-button"
          onClick={() => setIsConnected(!isConnected)}
        >
          {isConnected ? 'Отключиться' : 'Подключиться'}
        </button>
      </div>
      
      <div className="message-controls">
        <input 
          type="text"
          className="message-input"
          placeholder="Введите сообщение"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={!isConnected}
        />
        <button 
          className="send-button"
          onClick={onSendRequest}
          disabled={!isConnected}
        >
          Отправить
        </button>
      </div>

      <div className="panels-container">
        {/* Левая панель с вкладками параметров */}
        <div className="left-panel">
          <div className="tabs-selector">
            <button 
              className={`tab-btn ${activeTab === 'params' ? 'active' : ''}`}
              onClick={() => setActiveTab('params')}
            >
              Параметры
            </button>
            <button 
              className={`tab-btn ${activeTab === 'auth' ? 'active' : ''}`}
              onClick={() => setActiveTab('auth')}
            >
              Авторизация
            </button>
            <button 
              className={`tab-btn ${activeTab === 'headers' ? 'active' : ''}`}
              onClick={() => setActiveTab('headers')}
            >
              Заголовки
            </button>
          </div>
          <div className="tab-content">
            {activeTab === 'params' && (
              <div>
                {/* Содержимое вкладки параметров */}
                <p>Параметры подключения WebSocket</p>
              </div>
            )}
            {activeTab === 'auth' && (
              <div>
                {/* Содержимое вкладки авторизации */}
                <p>Настройки авторизации WebSocket</p>
              </div>
            )}
            {activeTab === 'headers' && (
              <div>
                {/* Содержимое вкладки заголовков */}
                <p>Заголовки для WebSocket</p>
              </div>
            )}
          </div>
        </div>

        {/* Правая панель с логами WebSocket */}
        <div className="right-panel">
          <div className="result-header">
            <button 
              className={`result-tab-btn ${activeResultTab === 'body' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('body')}
            >
              Сообщения
            </button>
            <button 
              className={`result-tab-btn ${activeResultTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('logs')}
            >
              Логи
            </button>
            <div className="status-info">
              <span className={`status-code ${isConnected ? 'connected' : 'disconnected'}`}>
                {isConnected ? 'Подключено' : 'Отключено'}
              </span>
            </div>
          </div>
          <div className="result-content">
            {activeResultTab === 'body' && (
              <div className="websocket-messages">
                <p>Здесь будут отображаться отправленные и полученные сообщения</p>
              </div>
            )}
            {activeResultTab === 'logs' && (
              <div className="websocket-logs">
                <pre>
                  [13:45:22] Attempting to connect to ws://localhost:8080{'\n'}
                  [13:45:23] Connection failed: Could not connect to the server.{'\n'}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 