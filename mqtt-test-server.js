// Простой MQTT Broker для тестирования
const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const port = 1883;

// Запуск сервера
server.listen(port, function () {
  console.log('MQTT Broker запущен на порту', port);
});

// Событие подключения клиента
aedes.on('client', function (client) {
  console.log('Клиент подключен:', client.id);
});

// Событие отключения клиента
aedes.on('clientDisconnect', function (client) {
  console.log('Клиент отключен:', client.id);
});

// Событие публикации сообщения
aedes.on('publish', function (packet, client) {
  if (client) {
    console.log('Сообщение от клиента', client.id, 'в топик', packet.topic, ':', packet.payload.toString());
  }
});

// Событие подписки на топик
aedes.on('subscribe', function (subscriptions, client) {
  if (client) {
    console.log('Клиент', client.id, 'подписался на топики:', subscriptions.map(s => s.topic).join(', '));
    
    // Отправляем приветственное сообщение при подписке
    subscriptions.forEach(subscription => {
      aedes.publish({
        topic: subscription.topic,
        payload: Buffer.from(`Добро пожаловать в топик ${subscription.topic}!`),
        qos: subscription.qos
      });
    });
  }
});

// Обработка ошибок
aedes.on('error', function (error) {
  console.error('Ошибка брокера:', error);
}); 