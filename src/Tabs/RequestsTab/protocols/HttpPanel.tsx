import React, { useState } from 'react';
import '../RequestsTab.css';

interface HttpPanelProps {
  onSendRequest: () => void;
}

type HttpTabType = 'params' | 'auth' | 'headers';
type ResultTabType = 'body' | 'cookies' | 'headers';

export const HttpPanel: React.FC<HttpPanelProps> = ({ onSendRequest }) => {
  const [method, setMethod] = useState<string>('GET');
  const [url, setUrl] = useState<string>('https://jsonplaceholder.typicode.com/posts/1');
  const [activeTab, setActiveTab] = useState<HttpTabType>('params');
  const [activeResultTab, setActiveResultTab] = useState<ResultTabType>('body');

  // Функция для определения CSS класса на основе выбранного метода
  const getMethodClass = () => {
    switch (method) {
      case 'GET':
        return 'method-get';
      case 'POST':
        return 'method-post';
      case 'PUT':
        return 'method-put';
      case 'DELETE':
        return 'method-delete';
      case 'PATCH':
        return 'method-patch';
      default:
        return '';
    }
  };

  return (
    <div className="protocol-panel">
      <div className="request-controls">
        <select 
          className={`method-select ${getMethodClass()}`}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
        <input 
          type="text"
          className="url-input"
          placeholder="Введите URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button 
          className="send-button"
          onClick={onSendRequest}
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
                <p>Здесь будут параметры запроса</p>
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
              <option value="xml">XML</option>
              <option value="html">HTML</option>
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