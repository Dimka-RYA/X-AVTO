

export const Scripts = () => {
  return (
    <div className="scripts-container">
      <h2>Управление скриптами</h2>
      <div className="script-editor">
        <div className="script-list">
          <div className="script-item">Автоматическая проверка</div>
          <div className="script-item">Резервное копирование</div>
          <button className="btn">+ Новый скрипт</button>
        </div>
        <div className="script-content">
          <textarea placeholder="Введите ваш скрипт здесь..." />
          <div className="toolbar">
            <button className="btn">Сохранить</button>
            <button className="btn">Тестировать</button>
          </div>
        </div>
      </div>
    </div>
  );
};