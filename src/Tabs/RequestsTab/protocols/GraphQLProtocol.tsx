import React, { useState } from 'react';
import { RequestAuth, RequestTabType } from '../types';
import { fetchGraphQLSchema } from '../services/GraphQLService';

interface GraphQLProtocolProps {
  requestUrl: string;
  setRequestUrl: (url: string) => void;
  requestHeaders: Record<string, string>;
  setRequestHeaders: (headers: Record<string, string>) => void;
  requestAuth: RequestAuth;
  setRequestAuth: (auth: RequestAuth) => void;
  handleSendRequest: () => void;
  isLoading: boolean;
  activeRequestTab: RequestTabType;
  setActiveRequestTab: (tab: RequestTabType) => void;
  graphqlQuery: string;
  setGraphqlQuery: (query: string) => void;
  graphqlVariables: string;
  setGraphqlVariables: (variables: string) => void;
}

export const GraphQLProtocol: React.FC<GraphQLProtocolProps> = ({
  requestUrl,
  setRequestUrl,
  requestHeaders,
  setRequestHeaders,
  requestAuth,
  setRequestAuth,
  handleSendRequest,
  isLoading,
  activeRequestTab,
  setActiveRequestTab,
  graphqlQuery,
  setGraphqlQuery,
  graphqlVariables,
  setGraphqlVariables
}) => {
  const requestTabs: RequestTabType[] = ['Запрос', 'Переменные', 'Заголовки', 'Авторизация'];
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schema, setSchema] = useState<any>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const handleFetchSchema = async () => {
    if (!requestUrl) {
      setSchemaError('URL не указан');
      return;
    }

    setSchemaLoading(true);
    setSchemaError(null);

    try {
      const result = await fetchGraphQLSchema(requestUrl, requestHeaders, requestAuth);
      
      if (result.error) {
        setSchemaError(result.error);
      } else {
        setSchema(result.schema);
      }
    } catch (error) {
      setSchemaError(error instanceof Error ? error.message : 'Ошибка при получении схемы');
    } finally {
      setSchemaLoading(false);
    }
  };

  return (
    <>
      {/* Строка URL и кнопка отправки */}
      <div className="request-url-bar">
        <div className="graphql-indicator">
          <span className="graphql-badge">API</span>
        </div>
        <input 
          type="text" 
          className="url-input"
          value={requestUrl}
          onChange={(e) => setRequestUrl(e.target.value)}
          placeholder="Введите URL GraphQL endpoint"
        />
        <button 
          className={`send-button ${isLoading ? 'loading' : ''}`}
          onClick={handleSendRequest}
          disabled={isLoading}
        >
          {isLoading ? 'Отправка...' : 'Отправить'}
        </button>
      </div>
      
      <div className="request-response-container">
        {/* Левая панель - настройки запроса */}
        <div className="request-panel">
          <div className="request-tabs">
            {requestTabs.map(tab => (
              <button 
                key={tab}
                className={`request-tab ${activeRequestTab === tab ? 'active' : ''}`}
                onClick={() => setActiveRequestTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <div className="request-content">
            {activeRequestTab === 'Запрос' && (
              <div className="graphql-query-content">
                <h3>GraphQL Docs</h3>
                <p>Нажмите кнопку "Проверить схему" для загрузки документации по API</p>
                <button 
                  className={`check-schema-btn ${schemaLoading ? 'loading' : ''}`}
                  onClick={handleFetchSchema}
                  disabled={schemaLoading}
                >
                  {schemaLoading ? 'Загрузка...' : 'Проверить схему'}
                </button>
                
                {schemaError && (
                  <div className="schema-error">
                    <p>Ошибка: {schemaError}</p>
                  </div>
                )}
                
                {schema && (
                  <div className="schema-explorer">
                    <h4>Доступные типы</h4>
                    <div className="schema-types">
                      {schema.types
                        .filter((type: any) => !type.name.startsWith('__'))
                        .map((type: any) => (
                          <div key={type.name} className="schema-type-item">
                            <strong>{type.name}</strong>
                            <span className="schema-type-kind">{type.kind}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
                
                <textarea 
                  className="graphql-editor"
                  value={graphqlQuery}
                  onChange={(e) => setGraphqlQuery(e.target.value)}
                  placeholder="# Введите ваш GraphQL запрос"
                ></textarea>
              </div>
            )}
            
            {activeRequestTab === 'Переменные' && (
              <div className="graphql-variables-content">
                <textarea 
                  className="graphql-editor"
                  value={graphqlVariables}
                  onChange={(e) => setGraphqlVariables(e.target.value)}
                  placeholder="# Введите переменные в формате JSON"
                ></textarea>
              </div>
            )}
            
            {activeRequestTab === 'Заголовки' && (
              <div className="headers-content">
                <div className="headers-table">
                  <div className="headers-row headers-header">
                    <div className="header-key">Заголовок</div>
                    <div className="header-value">Значение</div>
                    <div className="header-actions"></div>
                  </div>
                  {Object.entries(requestHeaders).map(([key, value], index) => (
                    <div className="headers-row" key={index}>
                      <input 
                        type="text" 
                        className="header-key-input" 
                        value={key}
                        onChange={(e) => {
                          const newHeaders = {...requestHeaders};
                          delete newHeaders[key];
                          newHeaders[e.target.value] = value;
                          setRequestHeaders(newHeaders);
                        }}
                      />
                      <input 
                        type="text" 
                        className="header-value-input" 
                        value={value}
                        onChange={(e) => {
                          setRequestHeaders({
                            ...requestHeaders,
                            [key]: e.target.value
                          });
                        }}
                      />
                      <button 
                        className="header-delete"
                        onClick={() => {
                          const newHeaders = {...requestHeaders};
                          delete newHeaders[key];
                          setRequestHeaders(newHeaders);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button 
                    className="add-header-btn"
                    onClick={() => {
                      setRequestHeaders({
                        ...requestHeaders,
                        [`header${Object.keys(requestHeaders).length + 1}`]: ''
                      });
                    }}
                  >
                    + Добавить заголовок
                  </button>
                </div>
              </div>
            )}
            
            {activeRequestTab === 'Авторизация' && (
              <div className="auth-content">
                <div className="auth-types">
                  <select 
                    className="auth-type-select"
                    value={requestAuth.type}
                    onChange={(e) => setRequestAuth({ type: e.target.value, params: {} })}
                  >
                    <option value="none">Без авторизации</option>
                    <option value="basic">Basic Auth</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="oauth2">OAuth 2.0</option>
                  </select>
                </div>
                
                {requestAuth.type === 'basic' && (
                  <div className="auth-basic">
                    <div className="auth-row">
                      <label>Логин:</label>
                      <input 
                        type="text" 
                        className="auth-input" 
                        value={(requestAuth.params as any)?.username || ''}
                        onChange={(e) => setRequestAuth({
                          ...requestAuth,
                          params: { ...requestAuth.params, username: e.target.value }
                        })}
                      />
                    </div>
                    <div className="auth-row">
                      <label>Пароль:</label>
                      <input 
                        type="password" 
                        className="auth-input" 
                        value={(requestAuth.params as any)?.password || ''}
                        onChange={(e) => setRequestAuth({
                          ...requestAuth,
                          params: { ...requestAuth.params, password: e.target.value }
                        })}
                      />
                    </div>
                  </div>
                )}
                
                {requestAuth.type === 'bearer' && (
                  <div className="auth-bearer">
                    <div className="auth-row">
                      <label>Токен:</label>
                      <input 
                        type="text" 
                        className="auth-input" 
                        value={(requestAuth.params as any)?.token || ''}
                        placeholder="Bearer Token"
                        onChange={(e) => setRequestAuth({
                          ...requestAuth,
                          params: { ...requestAuth.params, token: e.target.value }
                        })}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}; 