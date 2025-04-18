import { useState } from 'react';
import './Requests.css';
import { 
  RequestMethod, 
  ProtocolType, 
  ResultTabType, 
  RequestTabType, 
  ResponseData, 
  RequestAuth 
} from './types';
import { HttpProtocol } from './protocols/HttpProtocol';
import { GraphQLProtocol } from './protocols/GraphQLProtocol';
import { ResponsePanel } from './components/ResponsePanel';
import { sendHttpRequest } from './services/HttpService';
import { sendGraphQLRequest } from './services/GraphQLService';

// Компонент кнопки метода HTTP
export const MethodButton = ({ 
  method, 
  active, 
  onClick 
}: { 
  method: RequestMethod, 
  active: boolean, 
  onClick: () => void 
}) => {
  return (
    <button 
      className={`method-btn ${method.toLowerCase()} ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {method}
    </button>
  );
};

export const Requests = () => {
  // Общее состояние
  const [activeProtocol, setActiveProtocol] = useState<ProtocolType>('HTTP');
  const [requestUrl, setRequestUrl] = useState<string>('https://jsonplaceholder.typicode.com/posts/1');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responseFormat, setResponseFormat] = useState<string>('JSON');
  
  // HTTP-специфичное состояние
  const [activeMethod, setActiveMethod] = useState<RequestMethod>('GET');
  const [requestBody, setRequestBody] = useState('');
  const [requestHeaders, setRequestHeaders] = useState<Record<string, string>>({});
  const [requestParams, setRequestParams] = useState<Record<string, string>>({});
  const [requestAuth, setRequestAuth] = useState<RequestAuth>({ type: 'none', params: {} });
  const [activeRequestTab, setActiveRequestTab] = useState<RequestTabType>('Параметры');
  const [activeResultTab, setActiveResultTab] = useState<ResultTabType>('Тело');
  
  // GraphQL-специфичное состояние
  const [graphqlQuery, setGraphqlQuery] = useState<string>('');
  const [graphqlVariables, setGraphqlVariables] = useState<string>('');
  
  // Функция отправки запроса
  const handleSendRequest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (activeProtocol === 'HTTP') {
        // Отправляем HTTP-запрос
        const { response: httpResponse, error: httpError } = await sendHttpRequest({
          url: requestUrl,
          method: activeMethod,
          headers: requestHeaders,
          params: requestParams,
          body: requestBody,
          auth: requestAuth
        });
        
        if (httpError) {
          setError(httpError);
        } else if (httpResponse) {
          setResponse(httpResponse);
          
          // Определяем формат ответа на основе Content-Type
          const contentType = httpResponse.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            setResponseFormat('JSON');
          } else if (contentType.includes('text/html')) {
            setResponseFormat('HTML');
          } else if (contentType.includes('text/plain')) {
            setResponseFormat('Text');
          } else if (contentType.includes('xml')) {
            setResponseFormat('XML');
          }
        }
      } else if (activeProtocol === 'GraphQL') {
        // Отправляем GraphQL-запрос
        const { response: graphqlResponse, error: graphqlError } = await sendGraphQLRequest({
          url: requestUrl,
          query: graphqlQuery,
          variables: graphqlVariables,
          headers: requestHeaders,
          auth: requestAuth
        });
        
        if (graphqlError) {
          setError(graphqlError);
        } else if (graphqlResponse) {
          setResponse(graphqlResponse);
          setResponseFormat('JSON'); // GraphQL всегда возвращает JSON
        }
      } else {
        setError(`Протокол ${activeProtocol} еще не реализован`);
      }
    } catch (err) {
      console.error('Error sending request:', err);
      setError(err instanceof Error ? err.message : 'Ошибка при отправке запроса');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Обработчик смены протокола
  const handleProtocolChange = (protocol: ProtocolType) => {
    setActiveProtocol(protocol);
    
    // Сбрасываем специфичные для протокола состояния
    if (protocol === 'HTTP') {
      setActiveRequestTab('Параметры');
    } else if (protocol === 'GraphQL') {
      setActiveRequestTab('Запрос');
    }
  };

  return (
    <div className="api-client-container">
      {/* Блок выбора протокола */}
      <div className="protocol-selector">
        {(['HTTP', 'GraphQL', 'WebSockets', 'SocketIO', 'MQTT'] as ProtocolType[]).map(protocol => (
          <button 
            key={protocol}
            className={`protocol-btn ${activeProtocol === protocol ? 'active' : ''}`}
            onClick={() => handleProtocolChange(protocol)}
          >
            {protocol}
          </button>
        ))}
      </div>
      
      {/* Контент в зависимости от выбранного протокола */}
      {activeProtocol === 'HTTP' && (
        <HttpProtocol 
          requestUrl={requestUrl}
          setRequestUrl={setRequestUrl}
          activeMethod={activeMethod}
          setActiveMethod={setActiveMethod}
          requestBody={requestBody}
          setRequestBody={setRequestBody}
          requestHeaders={requestHeaders}
          setRequestHeaders={setRequestHeaders}
          requestParams={requestParams}
          setRequestParams={setRequestParams}
          requestAuth={requestAuth}
          setRequestAuth={setRequestAuth}
          handleSendRequest={handleSendRequest}
          isLoading={isLoading}
          activeRequestTab={activeRequestTab}
          setActiveRequestTab={setActiveRequestTab as (tab: RequestTabType) => void}
        />
      )}
      
      {activeProtocol === 'GraphQL' && (
        <GraphQLProtocol
          requestUrl={requestUrl}
          setRequestUrl={setRequestUrl}
          requestHeaders={requestHeaders}
          setRequestHeaders={setRequestHeaders}
          requestAuth={requestAuth}
          setRequestAuth={setRequestAuth}
          handleSendRequest={handleSendRequest}
          isLoading={isLoading}
          activeRequestTab={activeRequestTab}
          setActiveRequestTab={setActiveRequestTab as (tab: RequestTabType) => void}
          graphqlQuery={graphqlQuery}
          setGraphqlQuery={setGraphqlQuery}
          graphqlVariables={graphqlVariables}
          setGraphqlVariables={setGraphqlVariables}
        />
      )}
      
      {/* Панель ответа - общая для всех протоколов */}
      <ResponsePanel
        response={response}
        error={error}
        activeResultTab={activeResultTab}
        setActiveResultTab={setActiveResultTab}
        responseFormat={responseFormat}
        setResponseFormat={setResponseFormat}
      />
    </div>
  );
};