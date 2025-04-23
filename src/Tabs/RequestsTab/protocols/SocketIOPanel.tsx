import React, { useState } from 'react';
import '../RequestsTab.css';

interface SocketIOPanelProps {
  onSendRequest: () => void;
}

export const SocketIOPanel: React.FC<SocketIOPanelProps> = ({ onSendRequest }) => {
  const [serverUrl, setServerUrl] = useState<string>('http://localhost:3000');
  const [event, setEvent] = useState<string>('message');
  const [payload, setPayload] = useState<string>('{}');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  
  return (
    <div className="protocol-panel">
      <div className="request-controls">
        <input 
          type="text"
          className="url-input"
          placeholder="Socket.IO Server URL"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
        />
        <button 
          className="connection-button"
          onClick={() => setIsConnected(!isConnected)}
        >
          {isConnected ? 'Отключиться' : 'Подключиться'}
        </button>
      </div>
      
      <div className="event-controls">
        <input 
          type="text"
          className="event-input"
          placeholder="Имя события"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          disabled={!isConnected}
        />
        <textarea 
          className="payload-input"
          placeholder="Данные события (JSON)"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
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
    </div>
  );
}; 