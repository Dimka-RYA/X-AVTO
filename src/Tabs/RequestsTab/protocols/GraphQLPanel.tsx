import React, { useState } from 'react';
import '../RequestsTab.css';

interface GraphQLPanelProps {
  onSendRequest: (request?: string) => void;
  onGraphQLResponse?: (response: any) => void;
}

interface GraphQLResponse {
  data?: any;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
    extensions?: any;
  }>;
}

export const GraphQLPanel: React.FC<GraphQLPanelProps> = ({ onSendRequest, onGraphQLResponse }) => {
  const [endpoint, setEndpoint] = useState<string>('https://countries.trevorblades.com/graphql');
  const [query, setQuery] = useState<string>(`query {
  countries {
    code
    name
    emoji
    capital
  }
}`);
  const [variables, setVariables] = useState<string>('{}');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<GraphQLResponse | null>(null);

  // Функция для валидации JSON
  const validateJson = (jsonString: string): boolean => {
    try {
      JSON.parse(jsonString);
      return true;
    } catch (e) {
      return false;
    }
  };

  // Функция для форматирования JSON с отступами
  const formatJson = (jsonString: string): string => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return jsonString; // Возвращаем как есть, если не удалось распарсить
    }
  };

  // Функция для выполнения GraphQL запроса
  const executeGraphQLQuery = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Проверяем переменные на валидность JSON
      if (variables && !validateJson(variables)) {
        throw new Error('Переменные должны быть в формате JSON');
      }

      const parsedVariables = variables ? JSON.parse(variables) : {};

      // Формируем тело запроса
      const requestBody = {
        query,
        variables: parsedVariables,
      };

      // Отправляем запрос
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
      }

      // Обрабатываем ответ
      const responseData: GraphQLResponse = await response.json();
      setResponse(responseData);

      // Вызываем колбэк из родительского компонента, если он есть
      if (onGraphQLResponse) {
        onGraphQLResponse(responseData);
      }

      // Вызываем стандартный колбэк для RequestsTab
      onSendRequest(`GraphQL запрос на ${endpoint}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Форматирование переменных при фокусе на поле
  const handleVariablesFocus = () => {
    if (variables && validateJson(variables)) {
      setVariables(formatJson(variables));
    }
  };

  // Обработчик клавиши Enter при нажатии Ctrl
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      executeGraphQLQuery();
    }
  };

  return (
    <>
      <div className="request-controls">
        <input 
          type="text"
          className="url-input"
          placeholder="GraphQL Эндпоинт"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <button 
          className="send-button"
          onClick={executeGraphQLQuery}
          disabled={isLoading}
        >
          {isLoading ? 'Загрузка...' : 'Выполнить'}
        </button>
      </div>
      
      <div className="graphql-editor">
        <div className="query-container">
          <div className="editor-label">Запрос</div>
          <textarea 
            className="query-editor"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите GraphQL запрос"
            rows={5}
          />
        </div>
        <div className="variables-container">
          <div className="editor-label">Переменные</div>
          <textarea 
            className="variables-editor"
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
            onFocus={handleVariablesFocus}
            onKeyDown={handleKeyDown}
            placeholder="Введите переменные в формате JSON"
            rows={3}
          />
        </div>
      </div>

      {error && (
        <div className="graphql-error">
          <p>Ошибка: {error}</p>
        </div>
      )}
    </>
  );
}; 