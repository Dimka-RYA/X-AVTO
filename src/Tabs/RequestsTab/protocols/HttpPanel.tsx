import React, { useState } from 'react';
import '../RequestsTab.css';

interface HttpPanelProps {
  onSendRequest: (request?: string) => void;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  method: string;
  url: string;
}

export const HttpPanel: React.FC<HttpPanelProps> = ({ 
  onSendRequest, 
  onMethodChange, 
  onUrlChange,
  method: propMethod = 'GET',
  url: propUrl = 'https://jsonplaceholder.typicode.com/posts/1'
}) => {
  const [method, setMethod] = useState<string>(propMethod);
  const [url, setUrl] = useState<string>(propUrl);

  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

  // Обработчик изменения метода
  const handleMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMethod = e.target.value;
    setMethod(newMethod);
    if (onMethodChange) {
      onMethodChange(newMethod);
    }
  };

  // Обработчик изменения URL
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    if (onUrlChange) {
      onUrlChange(newUrl);
    }
  };

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
    <>
      <div className="request-controls">
        <select 
          className={`method-select ${getMethodClass()}`}
          value={method}
          onChange={handleMethodChange}
        >
          {methods.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        
        <input 
          type="text"
          className="url-input"
          placeholder="URL"
          value={url}
          onChange={handleUrlChange}
        />
        
        <button 
          className="send-button"
          onClick={() => onSendRequest(url)}
        >
          Отправить
        </button>
      </div>
    </>
  );
}; 