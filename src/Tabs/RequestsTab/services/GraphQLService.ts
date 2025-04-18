import { ResponseData, RequestAuth } from '../types';

// Вспомогательные функции
const getDataSize = (data: string): string => {
  const bytes = new Blob([data]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

// Интерфейсы для GraphQL-запросов
interface GraphQLRequestParams {
  url: string;
  query: string;
  variables: string;
  headers: Record<string, string>;
  auth: RequestAuth;
}

export const sendGraphQLRequest = async (
  requestParams: GraphQLRequestParams
): Promise<{ response: ResponseData | null; error: string | null }> => {
  const { url, query, variables, headers: userHeaders, auth } = requestParams;
  
  try {
    // Подготавливаем тело запроса
    let variablesObj = {};
    try {
      if (variables && variables.trim()) {
        variablesObj = JSON.parse(variables);
      }
    } catch (e) {
      return { 
        response: null, 
        error: 'Ошибка в формате переменных GraphQL. Убедитесь, что это валидный JSON.' 
      };
    }
    
    const graphqlBody = {
      query,
      variables: variablesObj
    };
    
    // Замеряем время
    const startTime = performance.now();
    
    // Формируем заголовки
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...userHeaders,
      ...prepareAuthHeaders(auth)
    };
    
    // Выполняем запрос
    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(graphqlBody),
      credentials: 'same-origin'
    });
    
    const endTime = performance.now();
    const responseTime = `${Math.round(endTime - startTime)} мс`;
    
    // Получаем заголовки ответа
    const responseHeaders: Record<string, string> = {};
    fetchResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    // Получаем тело ответа
    const responseRaw = await fetchResponse.text();
    let responseBody;
    
    try {
      responseBody = JSON.parse(responseRaw);
    } catch (e) {
      responseBody = responseRaw;
    }
    
    const responseSize = getDataSize(responseRaw);
    
    // Создаем объект ответа
    const response: ResponseData = {
      status: fetchResponse.status,
      statusText: fetchResponse.statusText,
      responseTime,
      responseSize,
      headers: responseHeaders,
      cookies: {}, // GraphQL обычно не использует cookies напрямую
      body: responseBody,
      raw: responseRaw
    };
    
    // Проверяем наличие ошибок GraphQL
    if (responseBody && responseBody.errors) {
      // GraphQL может вернуть 200 OK, но с ошибками в теле ответа
      console.warn('GraphQL вернул ошибки:', responseBody.errors);
    }
    
    return { response, error: null };
  } catch (err) {
    console.error('Ошибка при отправке GraphQL запроса:', err);
    return { 
      response: null, 
      error: err instanceof Error ? err.message : 'Неизвестная ошибка при отправке GraphQL запроса' 
    };
  }
};

// Функция для получения схемы GraphQL (introspection)
export const fetchGraphQLSchema = async (
  url: string, 
  headers: Record<string, string>,
  auth: RequestAuth
): Promise<{ schema: any; error: string | null }> => {
  const introspectionQuery = `
    query IntrospectionQuery {
      __schema {
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types {
          ...FullType
        }
        directives {
          name
          description
          locations
          args {
            ...InputValue
          }
        }
      }
    }
    
    fragment FullType on __Type {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        args {
          ...InputValue
        }
        type {
          ...TypeRef
        }
        isDeprecated
        deprecationReason
      }
      inputFields {
        ...InputValue
      }
      interfaces {
        ...TypeRef
      }
      enumValues(includeDeprecated: true) {
        name
        description
        isDeprecated
        deprecationReason
      }
      possibleTypes {
        ...TypeRef
      }
    }
    
    fragment InputValue on __InputValue {
      name
      description
      type { ...TypeRef }
      defaultValue
    }
    
    fragment TypeRef on __Type {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  
  try {
    const allHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...prepareAuthHeaders(auth)
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: allHeaders,
      body: JSON.stringify({ query: introspectionQuery }),
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      return { 
        schema: null, 
        error: `Ошибка получения схемы: ${response.status} ${response.statusText}` 
      };
    }
    
    const result = await response.json();
    
    if (result.errors) {
      return { 
        schema: null, 
        error: `Ошибка в схеме GraphQL: ${JSON.stringify(result.errors)}` 
      };
    }
    
    return { schema: result.data.__schema, error: null };
  } catch (err) {
    console.error('Ошибка при получении схемы GraphQL:', err);
    return { 
      schema: null, 
      error: err instanceof Error ? err.message : 'Неизвестная ошибка при получении схемы GraphQL' 
    };
  }
}; 