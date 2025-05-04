import React, { useState, useEffect, useRef } from 'react';
import '../RequestsTab.css';

interface WebSocketPanelProps {
  onSendRequest: (request: string) => void;
}

export const WebSocketPanel: React.FC<WebSocketPanelProps> = ({ onSendRequest }) => {
  const [wsUrl, setWsUrl] = useState<string>('ws://echo.websocket.org');
  const [message, setMessage] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [messages, setMessages] = useState<Array<{text: string, sent: boolean}>>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Автоматическая прокрутка при добавлении новых сообщений
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Очистка при размонтировании компонента
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const handleConnect = () => {
    if (isConnected && socketRef.current) {
      // Отключение от WebSocket
      socketRef.current.close();
      socketRef.current = null;
      setIsConnected(false);
      setConnectionError(null);
      return;
    }

    if (!wsUrl) {
      setConnectionError('Пожалуйста, введите URL WebSocket');
      return;
    }

    try {
      // Создаем новое соединение
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      // Обработка событий
      socket.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        setMessages(prev => [...prev, { text: 'Соединение установлено', sent: false }]);
      };

      socket.onmessage = (event) => {
        const message = event.data;
        setMessages(prev => [...prev, { text: message, sent: false }]);
        onSendRequest(`Получено: ${message}`);
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('Ошибка соединения');
      };

      socket.onclose = (event) => {
        setIsConnected(false);
        if (event.wasClean) {
          setMessages(prev => [...prev, { text: `Соединение закрыто корректно, код: ${event.code}`, sent: false }]);
        } else {
          setMessages(prev => [...prev, { text: `Соединение прервано, код: ${event.code}`, sent: false }]);
        }
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setConnectionError(`Ошибка подключения: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSendMessage = () => {
    if (!socketRef.current || !message.trim()) return;

    try {
      socketRef.current.send(message);
      setMessages(prev => [...prev, { text: message, sent: true }]);
      setMessage(''); // Очищаем поле ввода
    } catch (error) {
      console.error('Error sending message:', error);
      setConnectionError(`Ошибка отправки: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="websocket-panel">
      <div className="request-controls">
        <input 
          type="text"
          className="url-input"
          placeholder="WebSocket URL (например, ws://echo.websocket.org)"
          value={wsUrl}
          onChange={(e) => setWsUrl(e.target.value)}
          disabled={isConnected}
        />
        <button 
          className={`connection-button ${isConnected ? 'disconnect' : 'connect'}`}
          onClick={handleConnect}
        >
          {isConnected ? 'Отключиться' : 'Подключиться'}
        </button>
      </div>

      {connectionError && (
        <div className="error-message">{connectionError}</div>
      )}

      <div className="messages-container">
        <div className="messages-list">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`message-item ${msg.sent ? 'sent' : 'received'}`}
            >
              <span className="message-label">{msg.sent ? 'Отправлено: ' : 'Получено: '}</span>
              <span className="message-text">{msg.text}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      <div className="message-controls">
        <textarea 
          className="message-input"
          placeholder="Введите сообщение для отправки"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isConnected}
          rows={3}
        />
        <button 
          className="send-button"
          onClick={handleSendMessage}
          disabled={!isConnected || !message.trim()}
        >
          Отправить
        </button>
      </div>
    </div>
  );
}; 