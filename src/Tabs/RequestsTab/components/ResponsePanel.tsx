import React from 'react';
import { ResponseData, ResultTabType } from '../types';

interface ResponsePanelProps {
  response: ResponseData | null;
  error: string | null;
  activeResultTab: ResultTabType;
  setActiveResultTab: (tab: ResultTabType) => void;
  responseFormat: string;
  setResponseFormat: (format: string) => void;
}

// Функция для преобразования объекта в форматированный JSON
const formatJson = (json: any): string => {
  if (typeof json === 'string') {
    try {
      // Пробуем распарсить и отформатировать, если это строка JSON
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch (e) {
      // Если не смогли распарсить как JSON, возвращаем как есть
      return json;
    }
  } else if (typeof json === 'object' && json !== null) {
    // Если это уже объект, просто форматируем
    try {
      return JSON.stringify(json, null, 2);
    } catch (e) {
      return String(json);
    }
  }
  // Для всех других типов данных
  return String(json);
};

// Функция для определения класса статуса ответа
const getStatusCodeClass = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) return 'code-2xx';
  if (statusCode >= 300 && statusCode < 400) return 'code-3xx';
  if (statusCode >= 400 && statusCode < 500) return 'code-4xx';
  if (statusCode >= 500) return 'code-5xx';
  return '';
};

export const ResponsePanel: React.FC<ResponsePanelProps> = ({
  response,
  error,
  activeResultTab,
  setActiveResultTab,
  responseFormat,
  setResponseFormat
}) => {
  return (
    <div className="response-panel">
      <div className="response-header">
        <div className="response-tabs">
          {(['Тело', 'Куки', 'Результат'] as ResultTabType[]).map(tab => (
            <button 
              key={tab}
              className={`response-tab ${activeResultTab === tab ? 'active' : ''}`}
              onClick={() => setActiveResultTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        
        <div className="response-info">
          {response && (
            <>
              <span className={`status-code ${getStatusCodeClass(response.status)}`}>
                {response.status} {response.statusText}
              </span>
              <span className="response-time">{response.responseTime}</span>
              <span className="response-size">{response.responseSize}</span>
            </>
          )}
          {!response && !error && <span className="waiting-message">Ожидание запроса</span>}
          {error && <span className="error-message">{error}</span>}
        </div>
      </div>
      
      <div className="response-content">
        {response && (
          <>
            {activeResultTab === 'Тело' && (
              <>
                <div className="response-format-selector">
                  <button 
                    className={`format-btn ${responseFormat === 'JSON' ? 'active' : ''}`}
                    onClick={() => setResponseFormat('JSON')}
                  >
                    JSON
                  </button>
                  <button 
                    className={`format-btn ${responseFormat === 'Raw' ? 'active' : ''}`}
                    onClick={() => setResponseFormat('Raw')}
                  >
                    Raw
                  </button>
                  <button 
                    className={`format-btn ${responseFormat === 'Preview' ? 'active' : ''}`}
                    onClick={() => setResponseFormat('Preview')}
                  >
                    Preview
                  </button>
                </div>
                
                <div className="response-body">
                  {responseFormat === 'JSON' && (
                    <pre className="code-display">
                      {formatJson(response.body)}
                    </pre>
                  )}
                  {responseFormat === 'Raw' && (
                    <pre className="code-display">
                      {response.raw}
                    </pre>
                  )}
                  {responseFormat === 'Preview' && (
                    <div className="preview-container">
                      {/* HTML preview would go here */}
                      <div className="preview-placeholder">
                        HTML Preview не доступен
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            
            {activeResultTab === 'Куки' && (
              <div className="cookies-content">
                {Object.keys(response.cookies).length === 0 ? (
                  <div className="no-cookies">Нет доступных кук</div>
                ) : (
                  <div className="cookies-table">
                    <div className="cookies-row cookies-header">
                      <div className="cookie-name">Имя</div>
                      <div className="cookie-value">Значение</div>
                    </div>
                    {Object.entries(response.cookies).map(([name, value], index) => (
                      <div className="cookies-row" key={index}>
                        <div className="cookie-name">{name}</div>
                        <div className="cookie-value">{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeResultTab === 'Результат' && (
              <div className="result-content">
                <div className="result-summary">
                  <div className="result-item">
                    <span className="result-label">Статус:</span>
                    <span className={`result-value ${getStatusCodeClass(response.status)}`}>
                      {response.status} {response.statusText}
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">Время:</span>
                    <span className="result-value">{response.responseTime}</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">Размер:</span>
                    <span className="result-value">{response.responseSize}</span>
                  </div>
                </div>
                
                <div className="result-headers">
                  <h4>Заголовки ответа</h4>
                  <div className="result-headers-table">
                    {Object.entries(response.headers).map(([name, value], index) => (
                      <div className="result-header-row" key={index}>
                        <div className="result-header-name">{name}</div>
                        <div className="result-header-value">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        
        {!response && !error && (
          <div className="empty-response">
            <div className="empty-message">Отправьте запрос для получения ответа</div>
          </div>
        )}
        
        {error && (
          <div className="error-container">
            <div className="error-title">Ошибка при выполнении запроса</div>
            <div className="error-details">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}; 