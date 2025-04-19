import React, { useState, useEffect } from 'react';
import './Requests.css';
import { HttpProtocol } from './protocols/HttpProtocol';
import { GraphQLProtocol } from './protocols/GraphQLProtocol';
import { ResponsePanel } from './components/ResponsePanel';
import { sendHttpRequest } from './services/HttpService';
import { sendGraphQLRequest } from './services/GraphQLService';
import { ProtocolType, RequestMethod, ResponseData, RequestTabType, ResultTabType, RequestAuth } from './types';

export const RequestsTab: React.FC = () => {
  // Состояние протокола
  const [activeProtocol, setActiveProtocol] = useState<ProtocolType>('HTTP');
  
  // Состояния для HTTP запросов
  const [requestUrl, setRequestUrl] = useState<string>('https://jsonplaceholder.typicode.com/posts/1');
  const [activeMethod, setActiveMethod] = useState<RequestMethod>('GET');
  const [requestHeaders, setRequestHeaders] = useState<Record<string, string>>({});
  const [requestParams, setRequestParams] = useState<Record<string, string>>({});
  const [requestBody, setRequestBody] = useState<string>('');
  const [bodyType, setBodyType] = useState<string>('json');
  const [requestAuth, setRequestAuth] = useState<RequestAuth>({ type: 'none', params: {} });
  
  // Состояния для GraphQL запросов
  const [graphQLUrl, setGraphQLUrl] = useState<string>('https://countries.trevorblades.com/graphql');
  const [graphQLQuery, setGraphQLQuery] = useState<string>(`query {
  countries {
    name
    code
    capital
  }
}`);
  const [graphQLVariables, setGraphQLVariables] = useState<string>('{}');
  const [graphQLHeaders, setGraphQLHeaders] = useState<Record<string, string>>({});
  
  // Состояние для активной вкладки запроса
  const [activeRequestTab, setActiveRequestTab] = useState<RequestTabType>('Параметры');
  
  // Состояние ответа
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<ResultTabType>('Тело');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Обработка HTTP запроса
  const handleHttpRequest = async () => {
    setIsLoading(true);
    try {
      const result = await sendHttpRequest({
        url: requestUrl,
        method: activeMethod,
        headers: requestHeaders,
        params: requestParams,
        body: requestBody,
        auth: requestAuth
      });
      setResponse(result.response);
    } catch (error) {
      console.error('Error sending HTTP request:', error);
      setResponse({
        status: 0,
        statusText: 'Error',
        responseTime: '0ms',
        responseSize: '0B',
        headers: {},
        cookies: {},
        body: { error: String(error) },
        raw: String(error)
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Обработка GraphQL запроса
  const handleGraphQLRequest = async () => {
    setIsLoading(true);
    try {
      const result = await sendGraphQLRequest({
        url: graphQLUrl,
        query: graphQLQuery,
        variables: graphQLVariables,
        headers: graphQLHeaders,
        auth: requestAuth
      });
      setResponse(result.response);
    } catch (error) {
      console.error('Error sending GraphQL request:', error);
      setResponse({
        status: 0,
        statusText: 'Error',
        responseTime: '0ms',
        responseSize: '0B',
        headers: {},
        cookies: {},
        body: { error: String(error) },
        raw: String(error)
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="requests-container">
      <div className="requests-header">
        <div className="protocol-selector">
          <button 
            className={`protocol-btn ${activeProtocol === 'HTTP' ? 'active' : ''}`}
            onClick={() => setActiveProtocol('HTTP')}
          >
            HTTP
          </button>
          <button 
            className={`protocol-btn ${activeProtocol === 'GraphQL' ? 'active' : ''}`}
            onClick={() => setActiveProtocol('GraphQL')}
          >
            GraphQL
          </button>
          {/* Будущие протоколы */}
          <button className="protocol-btn disabled">WebSockets</button>
          <button className="protocol-btn disabled">SocketIO</button>
          <button className="protocol-btn disabled">MQTT</button>
        </div>
      </div>
      
      {activeProtocol === 'HTTP' ? (
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
          handleSendRequest={handleHttpRequest}
          isLoading={isLoading}
          activeRequestTab={activeRequestTab}
          setActiveRequestTab={setActiveRequestTab}
        />
      ) : activeProtocol === 'GraphQL' ? (
        <GraphQLProtocol 
          requestUrl={graphQLUrl}
          setRequestUrl={setGraphQLUrl}
          requestHeaders={graphQLHeaders}
          setRequestHeaders={setGraphQLHeaders}
          requestAuth={requestAuth}
          setRequestAuth={setRequestAuth}
          handleSendRequest={handleGraphQLRequest}
          isLoading={isLoading}
          activeRequestTab={activeRequestTab}
          setActiveRequestTab={setActiveRequestTab}
          graphqlQuery={graphQLQuery}
          setGraphqlQuery={setGraphQLQuery}
          graphqlVariables={graphQLVariables}
          setGraphqlVariables={setGraphQLVariables}
        />
      ) : null}
      
      {response && (
        <ResponsePanel 
          response={response}
          error={null}
          activeResultTab={activeResultTab}
          setActiveResultTab={setActiveResultTab}
          responseFormat="JSON"
          setResponseFormat={() => {}}
        />
      )}
    </div>
  );
}; 