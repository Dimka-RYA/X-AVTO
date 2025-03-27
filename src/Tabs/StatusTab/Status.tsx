
export const State = () => {
  return (
    <div className="state-container">
      <h2>Текущее состояние системы</h2>
      <div className="state-grid">
        <div className="state-item">
          <h3>Сетевые подключения</h3>
          <div className="status-indicator connected"></div>
          <span>Статус: Активно</span>
        </div>
        <div className="state-item">
          <h3>База данных</h3>
          <div className="status-indicator disconnected"></div>
          <span>Статус: Не подключено</span>
        </div>
        <div className="state-item">
          <h3>Логирование</h3>
          <div className="status-indicator warning"></div>
          <span>Статус: Внимание</span>
        </div>
      </div>
    </div>
  );
};