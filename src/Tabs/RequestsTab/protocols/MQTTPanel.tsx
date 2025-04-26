import { useState, useEffect } from 'react';
import * as mqtt from 'mqtt';
import '../RequestsTab.css';

interface MQTTPanelProps {
  onSendRequest: (request: string) => void;
}

interface Message {
  id: string;
  topic: string;
  payload: string;
  timestamp: string;
}

function MQTTPanel({ onSendRequest }: MQTTPanelProps) {
  const [brokerUrl, setBrokerUrl] = useState('mqtt://broker.emqx.io:1883');
  const [clientId, setClientId] = useState(`client_${Math.random().toString(16).substring(2, 8)}`);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [topic, setTopic] = useState('test/topic');
  const [message, setMessage] = useState('Hello MQTT');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [qosLevel, setQosLevel] = useState<0 | 1 | 2>(0);
  const [client, setClient] = useState<mqtt.MqttClient | null>(null);
  const [receivedMessages, setReceivedMessages] = useState<Message[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [subscribedTopics, setSubscribedTopics] = useState<string[]>([]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (client) {
        client.end();
      }
    };
  }, [client]);

  const formatTimestamp = () => {
    const now = new Date();
    return `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  };

  const handleConnect = () => {
    if (isConnected && client) {
      // Disconnect
      client.end();
      setClient(null);
      setIsConnected(false);
      setConnectionError(null);
      setSubscribedTopics([]);
      return;
    }

    if (!brokerUrl) {
      setConnectionError('Пожалуйста, введите URL брокера');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const options: mqtt.IClientOptions = {
        clientId,
        clean: true,
        reconnectPeriod: 3000,
      };

      if (username) options.username = username;
      if (password) options.password = password;

      const mqttClient = mqtt.connect(brokerUrl, options);
      
      mqttClient.on('connect', () => {
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionError(null);
        setClient(mqttClient);
        
        const successMessage: Message = {
          id: Date.now().toString(),
          topic: 'system',
          payload: `Подключено к ${brokerUrl}`,
          timestamp: formatTimestamp(),
        };
        
        setReceivedMessages(prev => [...prev, successMessage]);
      });

      mqttClient.on('error', (err) => {
        console.error('MQTT connection error:', err);
        setConnectionError(`Ошибка подключения: ${err.message}`);
        mqttClient.end();
        setClient(null);
        setIsConnected(false);
        setIsConnecting(false);
      });

      mqttClient.on('disconnect', () => {
        setIsConnected(false);
        const disconnectMessage: Message = {
          id: Date.now().toString(),
          topic: 'system',
          payload: 'Отключено от брокера',
          timestamp: formatTimestamp(),
        };
        setReceivedMessages(prev => [...prev, disconnectMessage]);
      });

      mqttClient.on('reconnect', () => {
        const reconnectMessage: Message = {
          id: Date.now().toString(),
          topic: 'system',
          payload: 'Попытка переподключения...',
          timestamp: formatTimestamp(),
        };
        setReceivedMessages(prev => [...prev, reconnectMessage]);
      });

      mqttClient.on('message', (receivedTopic, payload) => {
        const payloadStr = payload.toString();
        const msg: Message = {
          id: Date.now().toString(),
          topic: receivedTopic,
          payload: payloadStr,
          timestamp: formatTimestamp(),
        };
        
        setReceivedMessages(prev => [...prev, msg]);
        onSendRequest(`[${receivedTopic}] ${payloadStr}`);
      });
    } catch (error) {
      console.error('MQTT connection error:', error);
      setConnectionError(`Ошибка подключения: ${error instanceof Error ? error.message : String(error)}`);
      setIsConnected(false);
      setIsConnecting(false);
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
        if (!subscribedTopics.includes(topic)) {
          setSubscribedTopics(prev => [...prev, topic]);
        }
        
        const subscribeMessage: Message = {
          id: Date.now().toString(),
          topic: 'system',
          payload: `Подписка на топик: ${topic} с QoS ${qosLevel}`,
          timestamp: formatTimestamp(),
        };
        
        setReceivedMessages(prev => [...prev, subscribeMessage]);
      }
    });
  };

  const handleUnsubscribe = (topicToUnsub: string) => {
    if (!client) return;
    
    client.unsubscribe(topicToUnsub, (err) => {
      if (err) {
        console.error('Unsubscription error:', err);
        setConnectionError(`Ошибка отписки: ${err.message}`);
      } else {
        setConnectionError(null);
        setSubscribedTopics(prev => prev.filter(t => t !== topicToUnsub));
        
        const unsubscribeMessage: Message = {
          id: Date.now().toString(),
          topic: 'system',
          payload: `Отписка от топика: ${topicToUnsub}`,
          timestamp: formatTimestamp(),
        };
        
        setReceivedMessages(prev => [...prev, unsubscribeMessage]);
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
        
        const publishMessage: Message = {
          id: Date.now().toString(),
          topic: 'system',
          payload: `Опубликовано в топик ${topic}: ${message}`,
          timestamp: formatTimestamp(),
        };
        
        setReceivedMessages(prev => [...prev, publishMessage]);
      }
    });
  };

  const clearMessages = () => {
    setReceivedMessages([]);
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
          disabled={isConnected || isConnecting}
        />
        <button 
          className={`connection-button ${isConnected ? 'disconnect' : 'connect'}`}
          onClick={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? 'Подключение...' : isConnected ? 'Отключиться' : 'Подключиться'}
        </button>
      </div>
      
      <div className="connection-status">
        Статус: {isConnecting ? 'Подключение...' : isConnected ? 'Подключено' : 'Отключено'}
        {isConnected && <span className="connected-indicator"></span>}
        <button 
          className="toggle-advanced-button"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Скрыть настройки' : 'Показать настройки'}
        </button>
      </div>
      
      {showAdvanced && (
        <div className="advanced-settings">
          <div className="setting-row">
            <input 
              type="text"
              className="client-id-input"
              placeholder="Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={isConnected || isConnecting}
            />
          </div>
          <div className="setting-row">
            <input 
              type="text"
              className="username-input"
              placeholder="Имя пользователя (если нужно)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isConnected || isConnecting}
            />
            <input 
              type="password"
              className="password-input"
              placeholder="Пароль (если нужно)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isConnected || isConnecting}
            />
          </div>
        </div>
      )}
      
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

      {subscribedTopics.length > 0 && (
        <div className="subscribed-topics">
          <h4>Активные подписки:</h4>
          <div className="topics-list">
            {subscribedTopics.map((t) => (
              <div key={t} className="topic-item">
                <span>{t}</span>
                <button
                  className="unsub-button"
                  onClick={() => handleUnsubscribe(t)}
                >
                  Отписаться
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <div className="messages-header">
            <h3 className="messages-title">Сообщения:</h3>
            <button
              className="clear-messages-button"
              onClick={clearMessages}
            >
              Очистить
            </button>
          </div>
          <div className="messages-list">
            {receivedMessages.map((msg) => (
              <div key={msg.id} className={`message-item ${msg.topic === 'system' ? 'system' : 'received'}`}>
                <div className="message-header">
                  <span className="message-topic">{msg.topic !== 'system' ? msg.topic : ''}</span>
                  <span className="message-time">{msg.timestamp}</span>
                </div>
                <span className="message-text">{msg.payload}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MQTTPanel; 