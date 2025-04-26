import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PortsTable } from './components/PortsTable';
import { Port, ColumnWidths } from './types';
import './Ports.css';
import { clearAddressCache } from './utils/addressFormatter';
import { usePorts } from './hooks/usePorts';
import { Search } from 'lucide-react';

// Начальные ширины столбцов таблицы
const initialColumnWidths: ColumnWidths = {
  protocol: 100,
  local_addr: 200,
  foreign_addr: 200,
  state: 120,
  pid: 80,
  name: 150,
  action: 100
};

export const PortsTab: React.FC = () => {
  // Используем кастомный хук для работы с портами
  const { ports, loading, error, closingPorts, refreshPorts, closePort } = usePorts();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(initialColumnWidths);

  useEffect(() => {
    // Очищаем кэш форматированных адресов при монтировании компонента
    clearAddressCache();
    
    // Очистка при размонтировании
    return () => {
      clearAddressCache();
    };
  }, []);

  // Обертка для обновления данных с индикацией загрузки
  const handleRefresh = async () => {
    try {
      console.log("[Frontend] Запускаем обновление портов...");
      setIsRefreshing(true);
      await refreshPorts();
    } finally {
      setIsRefreshing(false);
      console.log("[Frontend] Обновление завершено");
    }
  };

  // Функция для диагностики
  const diagnoseConnection = async () => {
    try {
      console.log("[Frontend] Запуск диагностики соединения");
      setIsRefreshing(true);
      // Вызываем refresh_ports_command с подробным логированием
      const result = await invoke('refresh_ports_command', { detailedLogging: true });
      console.log("[Frontend] Результат диагностики:", result);
      alert(`Диагностика завершена. Проверьте консоль для подробностей. Результат: ${result}`);
    } catch (err) {
      const error = err as Error;
      console.error('[Frontend] Ошибка при диагностике:', error);
      alert(`Ошибка при диагностике: ${error.message || String(error)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Обработчик закрытия порта
  const handleClosePort = useCallback(async (pid: string) => {
    await closePort(pid);
  }, [closePort]);

  // Обработчик изменения ширины столбца
  const handleColumnResize = useCallback((column: keyof ColumnWidths, newWidth: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [column]: newWidth
    }));
  }, []);

  console.log("[Frontend] Рендер компонента PortsTab, количество портов:", ports.length);

  return (
    <div className="ports-tab">
      <div className="ports-header">
        <h2>Открытые сетевые порты {ports.length > 0 ? `(${ports.length})` : ''}</h2>
        <div className="ports-actions">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={18} color="#565555" />
            <input
              type="text"
              placeholder="Поиск по адресу, порту, процессу..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button 
            className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            Обновить
          </button>
          <button 
            className="diagnose-button"
            onClick={diagnoseConnection}
            title="Запустить диагностику подключения"
          >
            Диагностика
          </button>
        </div>
      </div>
      <PortsTable 
        ports={ports} 
        searchTerm={searchTerm} 
        closingPorts={closingPorts}
        onClosePort={handleClosePort}
        columnWidths={columnWidths}
        handleColumnResize={handleColumnResize}
      />
    </div>
  );
}; 