import React, { useState } from 'react';
import '../RequestsTab.css';

interface GraphQLPanelProps {
  onSendRequest: () => void;
}

type GraphQLTabType = 'params' | 'auth' | 'headers';
type ResultTabType = 'body' | 'cookies' | 'headers';

export const GraphQLPanel: React.FC<GraphQLPanelProps> = ({ onSendRequest }) => {
  const [endpoint, setEndpoint] = useState<string>('https://api.example.com/graphql');
  const [query, setQuery] = useState<string>('{\n  viewer {\n    name\n  }\n}');
  const [activeTab, setActiveTab] = useState<GraphQLTabType>('params');
  const [activeResultTab, setActiveResultTab] = useState<ResultTabType>('body');
  
  return (
    <div className="protocol-panel">
      <div className="request-controls">
        <input 
          type="text"
          className="url-input"
          placeholder="GraphQL Endpoint URL"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <button 
          className="send-button"
          onClick={onSendRequest}
        >
          Отправить
        </button>
      </div>
      <textarea 
        className="query-editor"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Введите GraphQL запрос"
      />

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
                <p>Здесь будут переменные GraphQL запроса</p>
              </div>
            )}
            {activeTab === 'auth' && (
              <div>
                {/* Содержимое вкладки авторизации */}
                <p>Здесь будут настройки авторизации</p>
              </div>
            )}
            {activeTab === 'headers' && (
              <div>
                {/* Содержимое вкладки заголовков */}
                <p>Здесь будут заголовки запроса</p>
              </div>
            )}
          </div>
        </div>

        {/* Правая панель с результатами запроса */}
        <div className="right-panel">
          <div className="result-header">
            <button 
              className={`result-tab-btn ${activeResultTab === 'body' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('body')}
            >
              Тело
            </button>
            <button 
              className={`result-tab-btn ${activeResultTab === 'cookies' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('cookies')}
            >
              Куки
            </button>
            <button 
              className={`result-tab-btn ${activeResultTab === 'headers' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('headers')}
            >
              Результат
            </button>
            <div className="status-info">
              <span className="status-code">401</span>
              <span className="status-time">432 мс</span>
              <span className="status-size">423Б</span>
            </div>
            <select className="dropdown-format">
              <option value="json">JSON</option>
              <option value="text">Text</option>
            </select>
          </div>
          <div className="result-content">
            {activeResultTab === 'body' && (
              <div className="code-container">
                <div className="line-numbers">
                  <pre>1{'\n'}2{'\n'}3{'\n'}4{'\n'}5{'\n'}6</pre>
                </div>
                <pre className="json-content">
                  {'{\n'}
                  {'    '}<span className="json-key">"error"</span>: {'{\n'}
                  {'        '}<span className="json-key">"name"</span>: <span className="json-string">"AuthenticationError"</span>,{'\n'}
                  {'        '}<span className="json-key">"message"</span>: <span className="json-string">"Invalid API Key. Every request requires a valid API Key to be sent."</span>{'\n'}
                  {'    '}{'}'}
                  {'\n}'}
                </pre>
              </div>
            )}
            {activeResultTab === 'cookies' && (
              <div>
                <p>Здесь будут куки</p>
              </div>
            )}
            {activeResultTab === 'headers' && (
              <div>
                <p>Здесь будут заголовки ответа</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 