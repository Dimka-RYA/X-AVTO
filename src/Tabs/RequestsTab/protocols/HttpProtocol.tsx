import React, { useState, useEffect } from 'react';
import { ProtocolType, RequestMethod, AuthParams, RequestAuth, RequestTabType } from '../types';

interface HttpProtocolProps {
  requestUrl: string;
  setRequestUrl: (url: string) => void;
  activeMethod: RequestMethod;
  setActiveMethod: (method: RequestMethod) => void;
  handleSendRequest: () => void;
  requestParams: Record<string, string>;
  setRequestParams: (params: Record<string, string>) => void;
  requestHeaders: Record<string, string>;
  setRequestHeaders: (headers: Record<string, string>) => void;
  requestBody: string;
  setRequestBody: (body: string) => void;
  requestAuth: RequestAuth;
  setRequestAuth: (auth: RequestAuth) => void;
  activeRequestTab: RequestTabType;
  setActiveRequestTab: (tab: RequestTabType) => void;
  isLoading: boolean;
}

const HttpProtocol: React.FC<HttpProtocolProps> = ({
  requestUrl,
  setRequestUrl,
  activeMethod,
  setActiveMethod,
  handleSendRequest,
  requestParams,
  setRequestParams,
  requestHeaders,
  setRequestHeaders,
  requestBody,
  setRequestBody,
  requestAuth,
  setRequestAuth,
  activeRequestTab,
  setActiveRequestTab,
  isLoading
}) => {
  const [bodyType, setBodyType] = useState<string>('none');
  const [paramRows, setParamRows] = useState<Array<{ key: string; value: string; id: string }>>(
    requestParams ? Object.entries(requestParams).map(([key, value]) => ({ key, value, id: Math.random().toString() })) : []
  );
  const [headerRows, setHeaderRows] = useState<Array<{ key: string; value: string; id: string }>>(
    requestHeaders ? Object.entries(requestHeaders).map(([key, value]) => ({ key, value, id: Math.random().toString() })) : []
  );

  const handleAddParam = () => {
    setParamRows([...paramRows, { key: '', value: '', id: Math.random().toString() }]);
  };

  const handleRemoveParam = (id: string) => {
    setParamRows(paramRows.filter(row => row.id !== id));
  };

  const handleParamChange = (id: string, field: 'key' | 'value', value: string) => {
    const updatedRows = paramRows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    );
    setParamRows(updatedRows);
  };

  const handleAddHeader = () => {
    setHeaderRows([...headerRows, { key: '', value: '', id: Math.random().toString() }]);
  };

  const handleRemoveHeader = (id: string) => {
    setHeaderRows(headerRows.filter(row => row.id !== id));
  };

  const handleHeaderChange = (id: string, field: 'key' | 'value', value: string) => {
    const updatedRows = headerRows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    );
    setHeaderRows(updatedRows);
  };

  useEffect(() => {
    const paramsObject: Record<string, string> = {};
    paramRows.forEach(row => {
      if (row.key) {
        paramsObject[row.key] = row.value;
      }
    });
    setRequestParams(paramsObject);
  }, [paramRows, setRequestParams]);

  useEffect(() => {
    const headersObject: Record<string, string> = {};
    headerRows.forEach(row => {
      if (row.key) {
        headersObject[row.key] = row.value;
      }
    });
    setRequestHeaders(headersObject);
  }, [headerRows, setRequestHeaders]);

  const handleAuthTypeChange = (type: 'none' | 'basic' | 'bearer' | 'apiKey') => {
    setRequestAuth({ ...requestAuth, type });
  };

  const handleAuthParamChange = (key: keyof AuthParams, value: string) => {
    setRequestAuth({
      ...requestAuth,
      params: {
        ...requestAuth.params,
        [key]: value
      }
    });
  };

  return (
    <div className="http-protocol">
      <div className="request-url-bar">
        <div className="method-selector">
          <select 
            className={`method-select method-${activeMethod.toLowerCase()}`}
            value={activeMethod}
            onChange={(e) => setActiveMethod(e.target.value as RequestMethod)}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
          </select>
        </div>
        <div className="url-input-container">
          <input
            type="text"
            className="url-input"
            placeholder="Enter request URL"
            value={requestUrl}
            onChange={(e) => setRequestUrl(e.target.value)}
          />
        </div>
        <button className="send-btn" onClick={handleSendRequest}>Send</button>
      </div>

      <div className="request-tabs">
        <button 
          className={`tab-btn ${activeRequestTab === 'Параметры' ? 'active' : ''}`}
          onClick={() => setActiveRequestTab('Параметры')}
        >
          Params
        </button>
        <button 
          className={`tab-btn ${activeRequestTab === 'Тело' ? 'active' : ''}`}
          onClick={() => setActiveRequestTab('Тело')}
        >
          Body
        </button>
        <button 
          className={`tab-btn ${activeRequestTab === 'Заголовки' ? 'active' : ''}`}
          onClick={() => setActiveRequestTab('Заголовки')}
        >
          Headers
        </button>
        <button 
          className={`tab-btn ${activeRequestTab === 'Авторизация' ? 'active' : ''}`}
          onClick={() => setActiveRequestTab('Авторизация')}
        >
          Authorization
        </button>
      </div>

      <div className="tab-content">
        {activeRequestTab === 'Параметры' && (
          <div className="params-container">
            <div className="param-rows">
              {paramRows.map((param) => (
                <div className="param-row" key={param.id}>
                  <input
                    type="text"
                    className="param-key"
                    placeholder="Key"
                    value={param.key}
                    onChange={(e) => handleParamChange(param.id, 'key', e.target.value)}
                  />
                  <input
                    type="text"
                    className="param-value"
                    placeholder="Value"
                    value={param.value}
                    onChange={(e) => handleParamChange(param.id, 'value', e.target.value)}
                  />
                  <button className="param-delete-btn" onClick={() => handleRemoveParam(param.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <button className="add-param-btn" onClick={handleAddParam}>Add Parameter</button>
          </div>
        )}

        {activeRequestTab === 'Тело' && (
          <div className="body-container">
            <div className="body-type-selector">
              <select
                value={bodyType}
                onChange={(e) => setBodyType(e.target.value)}
                className="body-type-select"
              >
                <option value="none">None</option>
                <option value="raw">Raw</option>
                <option value="json">JSON</option>
                <option value="form-data">Form Data</option>
                <option value="x-www-form-urlencoded">x-www-form-urlencoded</option>
              </select>
            </div>
            {bodyType !== 'none' && (
              <div className="body-editor">
                <textarea
                  className="body-input"
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Enter request body'}
                />
              </div>
            )}
          </div>
        )}

        {activeRequestTab === 'Заголовки' && (
          <div className="headers-container">
            <div className="header-rows">
              {headerRows.map((header) => (
                <div className="header-row" key={header.id}>
                  <input
                    type="text"
                    className="header-key"
                    placeholder="Header"
                    value={header.key}
                    onChange={(e) => handleHeaderChange(header.id, 'key', e.target.value)}
                  />
                  <input
                    type="text"
                    className="header-value"
                    placeholder="Value"
                    value={header.value}
                    onChange={(e) => handleHeaderChange(header.id, 'value', e.target.value)}
                  />
                  <button className="header-delete-btn" onClick={() => handleRemoveHeader(header.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <button className="add-header-btn" onClick={handleAddHeader}>Add Header</button>
          </div>
        )}

        {activeRequestTab === 'Авторизация' && (
          <div className="auth-container">
            <div className="auth-type-selector">
              <div className="auth-type-label">Auth Type:</div>
              <select
                value={requestAuth.type}
                onChange={(e) => handleAuthTypeChange(e.target.value as 'none' | 'basic' | 'bearer' | 'apiKey')}
                className="auth-type-select"
              >
                <option value="none">No Auth</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="apiKey">API Key</option>
              </select>
            </div>

            {requestAuth.type === 'basic' && (
              <div className="auth-inputs">
                <div className="auth-row">
                  <div className="auth-label">Username:</div>
                  <input
                    type="text"
                    className="auth-input"
                    value={requestAuth.params.username || ''}
                    onChange={(e) => handleAuthParamChange('username', e.target.value)}
                  />
                </div>
                <div className="auth-row">
                  <div className="auth-label">Password:</div>
                  <input
                    type="password"
                    className="auth-input"
                    value={requestAuth.params.password || ''}
                    onChange={(e) => handleAuthParamChange('password', e.target.value)}
                  />
                </div>
              </div>
            )}

            {requestAuth.type === 'bearer' && (
              <div className="auth-inputs">
                <div className="auth-row">
                  <div className="auth-label">Token:</div>
                  <input
                    type="text"
                    className="auth-input"
                    value={requestAuth.params.token || ''}
                    onChange={(e) => handleAuthParamChange('token', e.target.value)}
                  />
                </div>
              </div>
            )}

            {requestAuth.type === 'apiKey' && (
              <div className="auth-inputs">
                <div className="auth-row">
                  <div className="auth-label">Key:</div>
                  <input
                    type="text"
                    className="auth-input"
                    value={requestAuth.params.key || ''}
                    onChange={(e) => handleAuthParamChange('key', e.target.value)}
                  />
                </div>
                <div className="auth-row">
                  <div className="auth-label">Value:</div>
                  <input
                    type="text"
                    className="auth-input"
                    value={requestAuth.params.value || ''}
                    onChange={(e) => handleAuthParamChange('value', e.target.value)}
                  />
                </div>
                <div className="auth-row">
                  <div className="auth-label">Add to:</div>
                  <select
                    className="auth-select"
                    value={requestAuth.params.addTo || 'header'}
                    onChange={(e) => handleAuthParamChange('addTo', e.target.value)}
                  >
                    <option value="header">Header</option>
                    <option value="query">Query Parameter</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { HttpProtocol };