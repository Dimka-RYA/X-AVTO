

export const Home = () => {
  return (
    <div className="home-container">
      <h2>Главная панель</h2>
      <div className="dashboard">
        <div className="card">
          <h3>Статистика системы</h3>
          <p>Всего запросов: 0</p>
          <p>Активных портов: 0</p>
        </div>
        <div className="card">
          <h3>Быстрые действия</h3>
          <button className="btn">Создать новый скрипт</button>
          <button className="btn">Проверить порты</button>
        </div>
      </div>
    </div>
  );
};