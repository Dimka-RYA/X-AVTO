import React, { useState } from 'react';
import '../RequestsTab.css';

interface MQTTPanelProps {
  onSendRequest: () => void;
}

export const MQTTPanel: React.FC<MQTTPanelProps> = ({ onSendRequest }) => {
  const [brokerUrl, setBrokerUrl] = useState<string>('mqtt://localhost:1883');
  const [topic, setTopic] = useState<string>('test/topic');
  const [message, setMessage] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [qos, setQos] = useState<number>(0);
  
  return (
    <div className="protocol-panel">
      <div className="request-controls">
        <input 
          type="text"
          className="url-input"
          placeholder="MQTT Broker URL"
          value={brokerUrl}
          onChange={(e) => setBrokerUrl(e.target.value)}
        />
        <button 
          className="connection-button"
          onClick={() => setIsConnected(!isConnected)}
        >
          {isConnected ? 'Отключиться' : 'Подключиться'}
        </button>
      </div>
      
      <div className="mqtt-controls">
        <div className="topic-control">
          <input 
            type="text"
            className="topic-input"
            placeholder="Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={!isConnected}
          />
          <select 
            className="qos-select"
            value={qos}
            onChange={(e) => setQos(parseInt(e.target.value))}
            disabled={!isConnected}
          >
            <option value={0}>QoS 0</option>
            <option value={1}>QoS 1</option>
            <option value={2}>QoS 2</option>
          </select>
        </div>
        <textarea 
          className="message-input"
          placeholder="Сообщение"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={!isConnected}
        />
        <button 
          className="send-button"
          onClick={onSendRequest}
          disabled={!isConnected}
        >
          Опубликовать
        </button>
      </div>
    </div>
  );
}; 