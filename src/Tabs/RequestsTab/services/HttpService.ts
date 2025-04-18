import { ResponseData, RequestAuth } from '../types';

// Вспомогательные функции
const getDataSize = (data: string): string => {
  const bytes = new Blob([data]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const parseCookies = (cookieHeader: string | null): Record<string, string> => {
  if (!cookieHeader) return {};
  
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) cookies[name] = value;
    return cookies;
  }, {} as Record<string, string>);
};

const prepareAuthHeaders = (requestAuth: RequestAuth): Record<string, string> => {
  const authHeaders: Record<string, string> = {};
  
  if (requestAuth.type === 'basic' && requestAuth.params) {
    const { username, password } = requestAuth.params;
    if (username && password) {
      const base64Credentials = btoa(`${username}:${password}`);
      authHeaders['Authorization'] = `Basic ${base64Credentials}`;
    }
  } else if (requestAuth.type === 'bearer' && requestAuth.params) {
    const { token } = requestAuth.params;
    if (token) {
      authHeaders['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }
  }
  
  return authHeaders;
};

interface SendRequestParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  body: string;
  auth: RequestAuth;
}

export const sendHttpRequest = async (
  requestParams: SendRequestParams
): Promise<{ response: ResponseData | null; error: string | null }> => {
  const { url, method, headers: userHeaders, params, body, auth } = requestParams;
  
  try {
    // Формируем URL с параметрами
    let fullUrl = url;
    if (Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, value);
      });
      fullUrl += `?${searchParams.toString()}`;
    }
    
    // Замеряем время
    const startTime = performance.now();
    
    // Формируем заголовки
    const headers: Record<string, string> = {
      ...userHeaders,
      ...prepareAuthHeaders(auth)
    };
    
    // Формируем параметры запроса
    const fetchOptions: RequestInit = {
      method,
      headers,
      credentials: 'same-origin'
    };
    
    // Добавляем тело запроса
    if (method !== 'GET' && method !== 'DELETE' && body) {
      try {
        // Проверяем, является ли тело запроса валидным JSON
        JSON.parse(body);
        fetchOptions.body = body;
        
        // Убедимся, что Content-Type установлен
        if (!Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) {
          headers['Content-Type'] = 'application/json';
        }
      } catch (e) {
        // Если не удалось распарсить как JSON, отправляем как текст
        fetchOptions.body = body;
        
        // Если Content-Type установлен как application/json, меняем его на text/plain
        if (headers['Content-Type'] === 'application/json') {
          headers['Content-Type'] = 'text/plain';
        }
      }
    }
    
    // Выполняем запрос
    const fetchResponse = await fetch(fullUrl, fetchOptions);
    const endTime = performance.now();
    const responseTime = `${Math.round(endTime - startTime)} мс`;
    
    // Получаем заголовки
    const responseHeaders: Record<string, string> = {};
    fetchResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    // Определяем тип ответа
    const contentType = responseHeaders['content-type'] || '';
    let responseBody: any;
    let responseRaw: string;
    
    try {
      if (contentType.includes('application/json')) {
        // Для JSON парсим объект
        responseRaw = await fetchResponse.text();
        try {
          responseBody = JSON.parse(responseRaw);
        } catch (e) {
          responseBody = responseRaw;
        }
      } else {
        // Для других типов оставляем как текст
        responseRaw = await fetchResponse.text();
        responseBody = responseRaw;
      }
    } catch (e) {
      responseRaw = 'Не удалось получить тело ответа';
      responseBody = responseRaw;
    }
    
    const responseSize = getDataSize(responseRaw);
    
    // Парсим куки
    const cookies = parseCookies(responseHeaders['set-cookie']);
    
    // Создаем объект ответа
    const response: ResponseData = {
      status: fetchResponse.status,
      statusText: fetchResponse.statusText,
      responseTime,
      responseSize,
      headers: responseHeaders,
      cookies,
      body: responseBody,
      raw: responseRaw
    };
    
    return { response, error: null };
  } catch (err) {
    console.error('Ошибка при отправке запроса:', err);
    return { 
      response: null, 
      error: err instanceof Error ? err.message : 'Неизвестная ошибка при отправке запроса' 
    };
  }
}; 