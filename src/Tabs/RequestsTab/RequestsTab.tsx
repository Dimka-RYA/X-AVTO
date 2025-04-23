import React, { useState } from 'react';
import './RequestsTab.css';
import { HttpPanel } from './protocols/HttpPanel';
import { GraphQLPanel } from './protocols/GraphQLPanel';
import { WebSocketPanel } from './protocols/WebSocketPanel';
import { SocketIOPanel } from './protocols/SocketIOPanel';
import { MQTTPanel } from './protocols/MQTTPanel';

type Protocol = 'http' | 'graphql' | 'websocket' | 'socketio' | 'mqtt';

export const RequestsTab: React.FC = () => {
  const [activeProtocol, setActiveProtocol] = useState<Protocol>('http');

  const handleSendRequest = () => {
    // Здесь будет логика отправки запросов
    console.log(`Sending ${activeProtocol} request`);
  };

  const renderProtocolPanel = () => {
    switch (activeProtocol) {
      case 'http':
        return <HttpPanel onSendRequest={handleSendRequest} />;
      case 'graphql':
        return <GraphQLPanel onSendRequest={handleSendRequest} />;
      case 'websocket':
        return <WebSocketPanel onSendRequest={handleSendRequest} />;
      case 'socketio':
        return <SocketIOPanel onSendRequest={handleSendRequest} />;
      case 'mqtt':
        return <MQTTPanel onSendRequest={handleSendRequest} />;
      default:
        return <HttpPanel onSendRequest={handleSendRequest} />;
    }
  };

  return (
    <div>
      <div className="protocol-selector">
        <button
          className={`protocol-btn ${activeProtocol === 'http' ? 'active' : ''}`}
          onClick={() => setActiveProtocol('http')}
        >
          HTTP
        </button>
        <button
          className={`protocol-btn ${activeProtocol === 'graphql' ? 'active' : ''}`}
          onClick={() => setActiveProtocol('graphql')}
        >
          GraphQL
        </button>
        <button
          className={`protocol-btn ${activeProtocol === 'websocket' ? 'active' : ''}`}
          onClick={() => setActiveProtocol('websocket')}
        >
          WebSocket
        </button>
        <button
          className={`protocol-btn ${activeProtocol === 'socketio' ? 'active' : ''}`}
          onClick={() => setActiveProtocol('socketio')}
        >
          SocketIO
        </button>
        <button
          className={`protocol-btn ${activeProtocol === 'mqtt' ? 'active' : ''}`}
          onClick={() => setActiveProtocol('mqtt')}
        >
          MQTT
        </button>
      </div>

      {renderProtocolPanel()}
    </div>
  );
}; 