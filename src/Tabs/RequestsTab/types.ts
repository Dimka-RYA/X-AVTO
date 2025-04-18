export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type ProtocolType = 'HTTP' | 'GraphQL' | 'WebSockets' | 'SocketIO' | 'MQTT';
export type ResultTabType = 'Тело' | 'Куки' | 'Результат';
export type RequestTabType = 'Параметры' | 'Авторизация' | 'Заголовки' | 'Тело' | 'Запрос' | 'Переменные';

export interface ResponseData {
  status: number;
  statusText: string;
  responseTime: string;
  responseSize: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: any;
  raw: string;
}

export interface AuthParams {
  username?: string;
  password?: string;
  token?: string;
  [key: string]: any;
}

export interface RequestAuth {
  type: string;
  params: AuthParams;
} 