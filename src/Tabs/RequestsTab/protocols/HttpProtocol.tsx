import React, { useState, useEffect } from 'react';
import { ProtocolType, RequestMethod, AuthParams, RequestAuth } from '../types';

interface HttpProtocolProps {
  url: string;
  setUrl: (url: string) => void;
  method: RequestMethod;
  setMethod: (method: RequestMethod) => void;
  onSendRequest: () => void;
  params: Record<string, string>;
  setParams: (params: Record<string, string>) => void;
  headers: Record<string, string>;
  setHeaders: (headers: Record<string, string>) => void;
  body: string;
  setBody: (body: string) => void;
  bodyType: string;
  setBodyType: (type: string) => void;
  auth: RequestAuth;
  setAuth: (auth: RequestAuth) => void;
}

const HttpProtocol: React.FC<HttpProtocolProps> = ({
  url,
  setUrl,
  method,
  setMethod,
  onSendRequest,
  params,
  setParams,
  headers,
  setHeaders,
  body,
  setBody,
  bodyType,
  setBodyType,
  auth,
  setAuth
}) => {
  const [activeTab, setActiveTab] = useState<'params' | 'body' | 'headers' | 'auth'>('params');
  const [paramRows, setParamRows] = useState<Array<{ key: string; value: string; id: string }>>(
    Object.entries(params).map(([key, value]) => ({ key, value, id: Math.random().toString() }))
  );
  const [headerRows, setHeaderRows] = useState<Array<{ key: string; value: string; id: string }>>(
    Object.entries(headers).map(([key, value]) => ({ key, value, id: Math.random().toString() }))
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
    setParams(paramsObject);
  }, [paramRows, setParams]);

  useEffect(() => {
    const headersObject: Record<string, string> = {};
    headerRows.forEach(row => {
      if (row.key) {
        headersObject[row.key] = row.value;
      }
    });
    setHeaders(headersObject);
  }, [headerRows, setHeaders]);

  const handleAuthTypeChange = (type: 'none' | 'basic' | 'bearer' | 'apiKey') => {
    setAuth({ ...auth, type });
  };

  const handleAuthParamChange = (key: keyof AuthParams, value: string) => {
    setAuth({
      ...auth,
      params: {
        ...auth.params,
        [key]: value
      }
    });
  };

  return (
    <div className="http-protocol">
      <div className="request-url-bar">
        <div className="method-selector">
          <select 
            className={`method-select method-${method.toLowerCase()}`}
            value={method}
            onChange={(e) => setMethod(e.target.value as RequestMethod)}
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
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <button className="send-btn" onClick={onSendRequest}>Send</button>
      </div>

      <div className="request-tabs">
        <button 
          className={`tab-btn ${activeTab === 'params' ? 'active' : ''}`}
          onClick={() => setActiveTab('params')}
        >
          Params
        </button>
        <button 
          className={`tab-btn ${activeTab === 'body' ? 'active' : ''}`}
          onClick={() => setActiveTab('body')}
        >
          Body
        </button>
        <button 
          className={`tab-btn ${activeTab === 'headers' ? 'active' : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </button>
        <button 
          className={`tab-btn ${activeTab === 'auth' ? 'active' : ''}`}
          onClick={() => setActiveTab('auth')}
        >
          Authorization
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'params' && (
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

        {activeTab === 'body' && (
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
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Enter request body'}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'headers' && (
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

        {activeTab === 'auth' && (
          <div className="auth-container">
            <div className="auth-type-selector">
              <div className="auth-type-label">Auth Type:</div>
              <select
                value={auth.type}
                onChange={(e) => handleAuthTypeChange(e.target.value as 'none' | 'basic' | 'bearer' | 'apiKey')}
                className="auth-type-select"
              >
                <option value="none">No Auth</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="apiKey">API Key</option>
              </select>
            </div>

            {auth.type === 'basic' && (
              <div className="auth-inputs">
                <div className="auth-row">
                  <div className="auth-label">Username:</div>
                  <input
                    type="text"
                    className="auth-input"
                    value={auth.params.username || ''}
                    onChange={(e) => handleAuthParamChange('username', e.target.value)}
                  />
                </div>
                <div className="auth-row">
                  <div className="auth-label">Password:</div>
                  <input
                    type="password"
                    className="auth-input"
                    value={auth.params.password || ''}
                    onChange={(e) => handleAuthParamChange('password', e.target.value)}
                  />
                </div>
              </div>
            )}

            {auth.type === 'bearer' && (
              <div className="auth-inputs">
                <div className="auth-row">
                  <div className="auth-label">Token:</div>
                  <input
                    type="text"
                    className="auth-input"
                    value={auth.params.token || ''}
                    onChange={(e) => handleAuthParamChange('token', e.target.value)}
                  />
                </div>
              </div>
            )}

            {auth.type === 'apiKey' && (
              <div className="auth-inputs">
                <div className="auth-row">
                  <div className="auth-label">Key:</div>
                  <input
                    type="text"
                    className="auth-input"
                    value={auth.params.key || ''}
                    onChange={(e) => handleAuthParamChange('key', e.target.value)}
                  />
                </div>
                <div className="auth-row">
                  <div className="auth-label">Value:</div>
                  <input
                    type="text"
                    className="auth-input"
                    value={auth.params.value || ''}
                    onChange={(e) => handleAuthParamChange('value', e.target.value)}
                  />
                </div>
                <div className="auth-row">
                  <div className="auth-label">Add to:</div>
                  <select
                    className="auth-select"
                    value={auth.params.addTo || 'header'}
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

export default HttpProtocol;