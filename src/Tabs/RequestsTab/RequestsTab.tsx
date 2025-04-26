import React, { useState, useEffect, useRef } from 'react';
import './RequestsTab.css';
import { HttpPanel } from './protocols/HttpPanel';
import { GraphQLPanel } from './protocols/GraphQLPanel';
import { WebSocketPanel } from './protocols/WebSocketPanel';
import { SocketIOPanel } from './protocols/SocketIOPanel';
import MQTTPanel from './protocols/MQTTPanel';

type Protocol = 'http' | 'graphql' | 'websocket' | 'socketio' | 'mqtt';
type Tab = 'params' | 'auth' | 'headers' | 'body';
type ResultTab = 'body' | 'cookies' | 'headers' | 'response';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
type AuthType = 'none' | 'basic' | 'bearer' | 'digest' | 'oauth2';
type ResultFormat = 'json' | 'xml' | 'text';

interface RequestParam {
  key: string;
  value: string;
  enabled: boolean;
}

interface RequestHeader {
  key: string;
  value: string;
  enabled: boolean;
}

interface AuthData {
  type: AuthType;
  username: string;
  password: string;
  token: string;
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

// Компонент для переключения формата результата
interface FormatSelectorProps {
  value: string;
  onChange: (format: string) => void;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Обработчик клика вне компонента для закрытия дропдауна
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Форматы и их отображаемые имена
  const formats = [
    { value: 'json', label: 'JSON' },
    { value: 'xml', label: 'XML' },
    { value: 'text', label: 'Text' },
  ];

  const selectedFormat = formats.find(format => format.value === value) || formats[0];

  return (
    <div className="format-selector-container" ref={dropdownRef}>
      <div 
        className="format-selector-toggle" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedFormat.label}</span>
        <span className="format-selector-arrow">▼</span>
      </div>
      {isOpen && (
        <div className="format-selector-dropdown">
          {formats.map(format => (
            <div 
              key={format.value} 
              className={`format-selector-option ${format.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(format.value);
                setIsOpen(false);
              }}
            >
              {format.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const RequestsTab: React.FC = () => {
  const [activeProtocol, setActiveProtocol] = useState<Protocol>('http');
  const [activeTab, setActiveTab] = useState<Tab>('params');
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>('body');
  
  const [httpMethod, setHttpMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState<string>('https://jsonplaceholder.typicode.com/posts/1');
  const [params, setParams] = useState<RequestParam[]>([{ key: '', value: '', enabled: true }]);
  const [headers, setHeaders] = useState<RequestHeader[]>([{ key: '', value: '', enabled: true }]);
  const [authData, setAuthData] = useState<AuthData>({
    type: 'none',
    username: '',
    password: '',
    token: ''
  });
  const [requestBody, setRequestBody] = useState<string>('');
  const [contentType, setContentType] = useState<string>('application/json');
  
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Форматирование результатов
  const [resultFormat, setResultFormat] = useState<string>('json');
  
  // Для GraphQL ответов
  const [graphQLResponse, setGraphQLResponse] = useState<any>(null);

  // Обработчик выбора метода HTTP из HttpPanel
  const handleMethodChange = (method: string) => {
    setHttpMethod(method as HttpMethod);
  };

  // Обработчик изменения URL из HttpPanel
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
  };

  // Добавление нового параметра
  const addParam = () => {
    setParams([...params, { key: '', value: '', enabled: true }]);
  };

  // Изменение параметра
  const updateParam = (index: number, key: string, value: string) => {
    const newParams = [...params];
    newParams[index] = { ...newParams[index], [key]: value };
    setParams(newParams);
  };

  // Удаление параметра
  const removeParam = (index: number) => {
    const newParams = [...params];
    newParams.splice(index, 1);
    setParams(newParams);
  };

  // Переключение активации параметра
  const toggleParamEnabled = (index: number) => {
    const newParams = [...params];
    newParams[index].enabled = !newParams[index].enabled;
    setParams(newParams);
  };

  // Добавление нового заголовка
  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '', enabled: true }]);
  };

  // Изменение заголовка
  const updateHeader = (index: number, key: string, value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [key]: value };
    setHeaders(newHeaders);
  };

  // Удаление заголовка
  const removeHeader = (index: number) => {
    const newHeaders = [...headers];
    newHeaders.splice(index, 1);
    setHeaders(newHeaders);
  };

  // Переключение активации заголовка
  const toggleHeaderEnabled = (index: number) => {
    const newHeaders = [...headers];
    newHeaders[index].enabled = !newHeaders[index].enabled;
    setHeaders(newHeaders);
  };

  // Обновление данных авторизации
  const updateAuthData = (data: Partial<AuthData>) => {
    setAuthData({ ...authData, ...data });
  };

  // Построение URL с параметрами
  const buildUrlWithParams = (): string => {
    const urlObj = new URL(url);
    
    // Добавляем параметры
    params.forEach(param => {
      if (param.enabled && param.key) {
        urlObj.searchParams.append(param.key, param.value);
      }
    });
    
    return urlObj.toString();
  };

  // Построение заголовков для запроса
  const buildRequestHeaders = (): Headers => {
    const requestHeaders = new Headers();
    
    // Добавляем настроенные заголовки
    headers.forEach(header => {
      if (header.enabled && header.key) {
        requestHeaders.append(header.key, header.value);
      }
    });
    
    // Добавляем заголовок Content-Type, если нужно
    if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
      requestHeaders.append('Content-Type', contentType);
    }
    
    // Добавляем заголовки авторизации
    if (authData.type === 'basic') {
      const auth = btoa(`${authData.username}:${authData.password}`);
      requestHeaders.append('Authorization', `Basic ${auth}`);
    } else if (authData.type === 'bearer') {
      requestHeaders.append('Authorization', `Bearer ${authData.token}`);
    }
    
    return requestHeaders;
  };

  // Подготовка тела запроса в зависимости от типа контента
  const prepareRequestBody = (): BodyInit | null => {
    if (httpMethod === 'GET' || httpMethod === 'HEAD') {
      return null;
    }
    
    if (!requestBody) {
      return null;
    }
    
    if (contentType.includes('application/json')) {
      try {
        // Проверяем, является ли тело запроса валидным JSON
        JSON.parse(requestBody);
        return requestBody;
      } catch (e) {
        throw new Error('Invalid JSON in request body');
      }
    }
    
    return requestBody;
  };

  // Форматирование ответа для отображения
  const formatResponseBody = (body: string, format: string): string => {
    if (format === 'json') {
      try {
        const jsonObj = JSON.parse(body);
        return JSON.stringify(jsonObj, null, 2);
      } catch (e) {
        // Если не удается распарсить JSON, возвращаем как есть
        return body;
      }
    }
    return body;
  };

  // Отправка HTTP запроса
  const sendHttpRequest = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const requestUrl = buildUrlWithParams();
      const requestHeaders = buildRequestHeaders();
      const requestBody = prepareRequestBody();
      
      const startTime = performance.now();
      
      const response = await fetch(requestUrl, {
        method: httpMethod,
        headers: requestHeaders,
        body: requestBody,
        credentials: 'include' // Для получения cookies
      });
      
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      
      const responseText = await response.text();
      const responseSize = new Blob([responseText]).size;
      
      // Собираем заголовки ответа
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      setResponse({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseText,
        time: responseTime,
        size: responseSize
      });
      
      // Автоматически переключаемся на вкладку ответа
      setActiveResultTab('body');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Обработчик отправки запроса из панели протокола
  const handleSendRequest = (request?: string) => {
    if (activeProtocol === 'http') {
      sendHttpRequest();
    } else {
      console.log(`Sending ${activeProtocol} request:`, request);
    }
  };

  // Обработчик для получения GraphQL ответов
  const handleGraphQLResponse = (responseData: any) => {
    // Создаем виртуальный HTTP ответ для совместимости с интерфейсом
    const responseText = JSON.stringify(responseData);
    const responseSize = new Blob([responseText]).size;
    
    setResponse({
      status: 200, // Предполагаем успешный ответ, так как ошибки GraphQL приходят с кодом 200
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: responseText,
      time: 0, // Время не измеряется в текущей реализации
      size: responseSize
    });
    
    // Сохраняем оригинальный ответ для возможных специфичных для GraphQL операций
    setGraphQLResponse(responseData);
    
    // Активируем вкладку с телом ответа
    setActiveResultTab('body');
  };

  // Рендер панели протокола
  const renderProtocolPanel = () => {
    switch (activeProtocol) {
      case 'http':
        return (
          <HttpPanel 
            onSendRequest={handleSendRequest} 
            onMethodChange={handleMethodChange}
            onUrlChange={handleUrlChange}
            method={httpMethod}
            url={url}
          />
        );
      case 'graphql':
        return <GraphQLPanel 
          onSendRequest={handleSendRequest} 
          onGraphQLResponse={handleGraphQLResponse}
        />;
      case 'websocket':
        return <WebSocketPanel onSendRequest={handleSendRequest} />;
      case 'socketio':
        return <SocketIOPanel onSendRequest={handleSendRequest} />;
      case 'mqtt':
        return <MQTTPanel onSendRequest={handleSendRequest} />;
      default:
        return (
          <HttpPanel 
            onSendRequest={handleSendRequest} 
            onMethodChange={handleMethodChange}
            onUrlChange={handleUrlChange}
            method={httpMethod}
            url={url}
          />
        );
    }
  };

  // Рендер содержимого вкладки параметров
  const renderTabContent = () => {
    switch (activeTab) {
      case 'params':
        return (
          <div className="params-tab">
            <div className="params-header">
              <div className="param-enabled">Включен</div>
              <div className="param-key">Имя</div>
              <div className="param-value">Значение</div>
              <div className="param-actions"></div>
            </div>
            <div className="params-list">
              {params.map((param, index) => (
                <div key={index} className="param-row">
                  <div className="param-enabled">
                    <input 
                      type="checkbox" 
                      checked={param.enabled} 
                      onChange={() => toggleParamEnabled(index)} 
                    />
                  </div>
                  <div className="param-key">
                    <input 
                      type="text" 
                      value={param.key} 
                      onChange={(e) => updateParam(index, 'key', e.target.value)} 
                      placeholder="Имя параметра"
                    />
                  </div>
                  <div className="param-value">
                    <input 
                      type="text" 
                      value={param.value} 
                      onChange={(e) => updateParam(index, 'value', e.target.value)} 
                      placeholder="Значение параметра"
                    />
                  </div>
                  <div className="param-actions">
                    <button className="delete-btn" onClick={() => removeParam(index)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
            <button className="add-param-btn" onClick={addParam}>Добавить параметр</button>
          </div>
        );
      case 'headers':
        return (
          <div className="headers-tab">
            <div className="headers-header">
              <div className="header-enabled">Включен</div>
              <div className="header-key">Имя</div>
              <div className="header-value">Значение</div>
              <div className="header-actions"></div>
            </div>
            <div className="headers-list">
              {headers.map((header, index) => (
                <div key={index} className="header-row">
                  <div className="header-enabled">
                    <input 
                      type="checkbox" 
                      checked={header.enabled} 
                      onChange={() => toggleHeaderEnabled(index)} 
                    />
                  </div>
                  <div className="header-key">
                    <input 
                      type="text" 
                      value={header.key} 
                      onChange={(e) => updateHeader(index, 'key', e.target.value)} 
                      placeholder="Имя заголовка"
                    />
                  </div>
                  <div className="header-value">
                    <input 
                      type="text" 
                      value={header.value} 
                      onChange={(e) => updateHeader(index, 'value', e.target.value)} 
                      placeholder="Значение заголовка"
                    />
                  </div>
                  <div className="header-actions">
                    <button className="delete-btn" onClick={() => removeHeader(index)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
            <button className="add-header-btn" onClick={addHeader}>Добавить заголовок</button>
          </div>
        );
      case 'auth':
        return (
          <div className="auth-tab">
            <div className="auth-type">
              <label>Тип авторизации</label>
              <select 
                value={authData.type} 
                onChange={(e) => updateAuthData({ type: e.target.value as AuthType })}
              >
                <option value="none">Без авторизации</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="digest">Digest Auth</option>
                <option value="oauth2">OAuth 2.0</option>
              </select>
            </div>
            
            {authData.type === 'basic' && (
              <div className="auth-basic">
                <div className="form-group">
                  <label>Имя пользователя</label>
                  <input 
                    type="text" 
                    value={authData.username} 
                    onChange={(e) => updateAuthData({ username: e.target.value })} 
                  />
                </div>
                <div className="form-group">
                  <label>Пароль</label>
                  <input 
                    type="password" 
                    value={authData.password} 
                    onChange={(e) => updateAuthData({ password: e.target.value })} 
                  />
                </div>
              </div>
            )}
            
            {authData.type === 'bearer' && (
              <div className="auth-bearer">
                <div className="form-group">
                  <label>Token</label>
                  <input 
                    type="text" 
                    value={authData.token} 
                    onChange={(e) => updateAuthData({ token: e.target.value })} 
                    placeholder="Введите Bearer token" 
                  />
                </div>
              </div>
            )}
            
            {authData.type === 'digest' && (
              <div className="auth-digest">
                <p>Поддержка Digest Auth будет добавлена в будущих обновлениях.</p>
              </div>
            )}
            
            {authData.type === 'oauth2' && (
              <div className="auth-oauth2">
                <p>Поддержка OAuth 2.0 будет добавлена в будущих обновлениях.</p>
              </div>
            )}
          </div>
        );
      case 'body':
        return (
          <div className="body-tab">
            <div className="form-group">
              <label>Content Type</label>
              <select 
                value={contentType} 
                onChange={(e) => setContentType(e.target.value)}
              >
                <option value="application/json">JSON</option>
                <option value="application/xml">XML</option>
                <option value="text/plain">Text</option>
                <option value="application/x-www-form-urlencoded">Form URL Encoded</option>
                <option value="multipart/form-data">Form Data</option>
              </select>
            </div>
            <div className="form-group">
              <textarea 
                value={requestBody} 
                onChange={(e) => setRequestBody(e.target.value)}
                placeholder="Введите тело запроса"
                rows={10}
                className="body-editor"
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Рендер содержимого вкладки результатов
  const renderResultContent = () => {
    if (isLoading) {
      return <div className="loading">Загрузка...</div>;
    }
    
    if (error) {
      return <div className="error">{error}</div>;
    }
    
    if (!response) {
      return <div className="empty-result">Нет данных для отображения</div>;
    }
    
    switch (activeResultTab) {
      case 'body':
        try {
          const formattedBody = formatResponseBody(response.body, resultFormat);
          const bodyLines = formattedBody.split('\n');
          
          return (
            <div className="code-container">
              <div className="line-numbers">
                {bodyLines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <pre className="json-content" dangerouslySetInnerHTML={{
                __html: formattedBody
                  .replace(/"([^"]+)":/g, '<span class="json-key">"$1":</span>')
                  .replace(/"([^"]+)"/g, '<span class="json-string">"$1"</span>')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
              }} />
            </div>
          );
        } catch (e) {
          return <div className="result-content"><pre>{response.body}</pre></div>;
        }
      case 'headers':
        return (
          <div className="response-headers">
            <div className="headers-list">
              {Object.entries(response.headers).map(([key, value], index) => (
                <div key={index} className="header-item">
                  <span className="header-name">{key}:</span>
                  <span className="header-value">{value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 'cookies':
        return (
          <div className="cookies-list">
            {response.headers['set-cookie'] ? (
              <div className="cookie-item">
                <span className="cookie-value">{response.headers['set-cookie']}</span>
              </div>
            ) : (
              <div className="no-cookies">Нет cookies в ответе</div>
            )}
          </div>
        );
      case 'response':
        return (
          <div className="response-info">
            <div className="response-status">
              <strong>Статус:</strong> {response.status} {response.statusText}
            </div>
            <div className="response-time">
              <strong>Время:</strong> {response.time} мс
            </div>
            <div className="response-size">
              <strong>Размер:</strong> {response.size} байт
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="requests-tab">
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

      {/* Панель протокола */}
      <div className="protocol-panel">
        {renderProtocolPanel()}
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
            <button 
              className={`tab-btn ${activeTab === 'body' ? 'active' : ''}`}
              onClick={() => setActiveTab('body')}
            >
              Тело
            </button>
          </div>
          <div className="tab-content">
            {renderTabContent()}
          </div>
        </div>

        {/* Правая панель с результатами */}
        <div className="right-panel">
          <div className="result-header">
            <button 
              className={`result-tab-btn ${activeResultTab === 'body' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('body')}
            >
              Тело
            </button>
            <button 
              className={`result-tab-btn ${activeResultTab === 'headers' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('headers')}
            >
              Заголовки
            </button>
            <button 
              className={`result-tab-btn ${activeResultTab === 'cookies' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('cookies')}
            >
              Куки
            </button>
            <button 
              className={`result-tab-btn ${activeResultTab === 'response' ? 'active' : ''}`}
              onClick={() => setActiveResultTab('response')}
            >
              Информация
            </button>
            
            {response && (
              <div className="status-info">
                <span className={`status-code ${response.status < 400 ? 'success' : 'error'}`}>
                  {response.status}
                </span>
                <span className="status-time">{response.time} мс</span>
                <span className="status-size">{response.size} B</span>
                <FormatSelector 
                  value={resultFormat}
                  onChange={(format) => setResultFormat(format)}
                />
              </div>
            )}
          </div>
          <div className="result-content">
            {renderResultContent()}
          </div>
        </div>
      </div>
    </div>
  );
}; 