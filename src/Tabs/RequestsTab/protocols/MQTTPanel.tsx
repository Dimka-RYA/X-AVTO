import { useState, useEffect } from 'react';
import * as mqtt from 'mqtt';
import '../RequestsTab.css';

interface MQTTPanelProps {
  onSendRequest: (request: string) => void;
}

function MQTTPanel({ onSendRequest }: MQTTPanelProps) {
  const [brokerUrl, setBrokerUrl] = useState('mqtt://broker.emqx.io:1883');
  const [topic, setTopic] = useState('test/topic');
  const [message, setMessage] = useState('Hello MQTT');
  const [isConnected, setIsConnected] = useState(false);
  const [qosLevel, setQosLevel] = useState<0 | 1 | 2>(0);
  const [client, setClient] = useState<mqtt.MqttClient | null>(null);
  const [receivedMessages, setReceivedMessages] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (client) {
        client.end();
      }
    };
  }, [client]);

  const handleConnect = () => {
    if (isConnected && client) {
      // Disconnect
      client.end();
      setClient(null);
      setIsConnected(false);
      setConnectionError(null);
      return;
    }

    if (!brokerUrl) {
      setConnectionError('Пожалуйста, введите URL брокера');
      return;
    }

    try {
      const mqttClient = mqtt.connect(brokerUrl);
      
      mqttClient.on('connect', () => {
        setIsConnected(true);
        setConnectionError(null);
        setClient(mqttClient);
        
        // Subscribe to topic if provided
        if (topic) {
          mqttClient.subscribe(topic, { qos: qosLevel });
        }
      });

      mqttClient.on('error', (err) => {
        console.error('MQTT connection error:', err);
        setConnectionError(`Ошибка подключения: ${err.message}`);
        mqttClient.end();
        setClient(null);
        setIsConnected(false);
      });

      mqttClient.on('message', (receivedTopic, payload) => {
        const msg = `[${receivedTopic}] ${payload.toString()}`;
        setReceivedMessages(prev => [...prev, msg]);
        onSendRequest(msg);
      });
    } catch (error) {
      console.error('MQTT connection error:', error);
      setConnectionError(`Ошибка подключения: ${error instanceof Error ? error.message : String(error)}`);
      setIsConnected(false);
    }
  };

  const handleSubscribe = () => {
    if (!client || !topic) return;
    
    client.subscribe(topic, { qos: qosLevel }, (err) => {
      if (err) {
        console.error('Subscription error:', err);
        setConnectionError(`Ошибка подписки: ${err.message}`);
      } else {
        setConnectionError(null);
        setReceivedMessages(prev => [...prev, `Подписка на топик: ${topic} с QoS ${qosLevel}`]);
      }
    });
  };

  const handlePublish = () => {
    if (!client || !topic || !message) return;
    
    client.publish(topic, message, { qos: qosLevel }, (err) => {
      if (err) {
        console.error('Publish error:', err);
        setConnectionError(`Ошибка публикации: ${err.message}`);
      } else {
        setConnectionError(null);
        setReceivedMessages(prev => [...prev, `Опубликовано в топик ${topic}: ${message}`]);
      }
    });
  };

  return (
    <div className="mqtt-panel">
      <div className="request-controls">
        <input 
          type="text"
          className="url-input"
          placeholder="MQTT Broker URL (например, mqtt://broker.emqx.io:1883)"
          value={brokerUrl}
          onChange={(e) => setBrokerUrl(e.target.value)}
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
        <div className="error-message">
          {connectionError}
        </div>
      )}

      <div className="mqtt-topic-controls">
        <div className="topic-container">
          <input 
            type="text"
            className="topic-input"
            placeholder="Топик (например, test/topic)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          
          <div className="qos-container">
            <label>QoS:</label>
            <select
              className="qos-select"
              value={qosLevel}
              onChange={(e) => setQosLevel(Number(e.target.value) as 0 | 1 | 2)}
            >
              <option value={0}>QoS 0</option>
              <option value={1}>QoS 1</option>
              <option value={2}>QoS 2</option>
            </select>
          </div>
          
          {isConnected && (
            <button 
              className="subscribe-button"
              onClick={handleSubscribe}
              disabled={!topic}
            >
              Подписаться
            </button>
          )}
        </div>
      </div>

      <div className="message-controls">
        <textarea
          className="message-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Сообщение для публикации"
          disabled={!isConnected}
          rows={5}
        />
        <button
          className="send-button"
          onClick={handlePublish}
          disabled={!isConnected || !topic || !message}
        >
          Опубликовать
        </button>
      </div>

      {receivedMessages.length > 0 && (
        <div className="messages-container">
          <h3 className="messages-title">Полученные сообщения:</h3>
          <div className="messages-list">
            {receivedMessages.map((msg, index) => (
              <div key={index} className="message-item received">
                <span className="message-text">{msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MQTTPanel; 