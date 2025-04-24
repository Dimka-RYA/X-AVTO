const WebSocket = require('ws');

// Создаем WebSocket сервер на порту 8080
const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket сервер запущен на ws://localhost:8080');

// Обработка подключений
wss.on('connection', function connection(ws) {
  console.log('Новое подключение установлено');
  
  // Отправляем приветственное сообщение
  ws.send('Добро пожаловать на тестовый WebSocket сервер!');
  
  // Обработка сообщений
  ws.on('message', function incoming(message) {
    console.log('Получено сообщение: %s', message);
    
    // Эхо-ответ с небольшой задержкой
    setTimeout(() => {
      ws.send(`Эхо: ${message}`);
    }, 500);
  });
  
  // Обработка отключений
  ws.on('close', function() {
    console.log('Соединение закрыто');
  });
});

// Обработка ошибок сервера
wss.on('error', function(error) {
  console.error('Ошибка WebSocket сервера:', error);
}); 