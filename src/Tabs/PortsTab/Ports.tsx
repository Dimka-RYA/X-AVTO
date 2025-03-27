import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePorts } from './hooks/usePorts';
import { PortsSearch } from './components/PortsSearch';
import { PortsTable } from './components/PortsTable';
import { ColumnWidths } from './types';
import './Ports.css';

/**
 * Компонент для отображения и управления сетевыми портами
 * Интерфейс для просмотра, поиска и закрытия сетевых портов
 */
export const Ports: React.FC = () => {
  // Состояние поиска с дебаунсом для оптимизации
  const [searchTermInput, setSearchTermInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  console.log("[Ports.tsx] Рендер компонента Ports");
  
  // Используем хук для работы с портами
  const {
    ports,
    loading,
    error,
    closingPorts,
    refreshPorts,
    closePort,
    fetchingRef
  } = usePorts();
  
  console.log("[Ports.tsx] Состояние после usePorts:", { 
    portsCount: ports.length, 
    loading, 
    hasError: !!error,
    isFetching: fetchingRef.current
  });

  // Состояние для хранения ширины столбцов
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({
    local_addr: 200,
    protocol: 80,
    state: 140,
    foreign_addr: 200,
    pid: 80,
    name: 140,
    action: 100
  });

  // Реф для таймера дебаунса
  const debounceTimerRef = React.useRef<number | null>(null);

  // Обработчик изменения поискового запроса с дебаунсом
  const handleSearchChange = useCallback((value: string) => {
    setSearchTermInput(value);
    
    // Отменяем предыдущий таймер, если он есть
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    
    // Устанавливаем новый таймер для обновления поискового состояния
    debounceTimerRef.current = window.setTimeout(() => {
      setSearchTerm(value);
      debounceTimerRef.current = null;
    }, 300);
  }, []);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Мемоизированный обработчик изменения ширины столбца
  const handleColumnResize = useCallback((column: keyof ColumnWidths, newWidth: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [column]: newWidth
    }));
  }, []);

  // Оптимизированный обработчик обработки размера окна
  useEffect(() => {
    // Флаг для отслеживания необходимости обновления
    let rafId: number | null = null;
    let resizeTimeout: number | null = null;
    
    const handleResize = () => {
      // Отменяем предыдущий запрос анимации, если он есть
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      
      // Отменяем предыдущий таймаут
      if (resizeTimeout !== null) {
        window.clearTimeout(resizeTimeout);
      }
      
      // Устанавливаем новый таймаут для дебаунса события ресайза
      resizeTimeout = window.setTimeout(() => {
        // Запрашиваем обновление только если таймаут прошел
        rafId = window.requestAnimationFrame(() => {
          // Пустая операция для обновления компонента
          rafId = null;
        });
        resizeTimeout = null;
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Очищаем таймеры при размонтировании
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      
      if (resizeTimeout !== null) {
        window.clearTimeout(resizeTimeout);
      }
    };
  }, []);

  // Мемоизируем компонент поиска для предотвращения ненужных перерисовок
  const searchComponent = useMemo(() => (
    <PortsSearch 
      searchTerm={searchTermInput}
      onSearchChange={handleSearchChange}
      onRefresh={refreshPorts}
      isRefreshing={fetchingRef.current}
    />
  ), [searchTermInput, handleSearchChange, refreshPorts, fetchingRef]);

  // Мемоизируем компонент таблицы для предотвращения ненужных перерисовок
  const tableComponent = useMemo(() => (
    <PortsTable 
      ports={ports}
      searchTerm={searchTerm}
      closingPorts={closingPorts}
      onClosePort={closePort}
      columnWidths={columnWidths}
      handleColumnResize={handleColumnResize}
    />
  ), [ports, searchTerm, closingPorts, closePort, columnWidths, handleColumnResize]);

  return (
    <div className="ports-container">
      {/* Мемоизированный компонент поиска */}
      {searchComponent}
      
      <div className="ports-table-container">
        {loading ? (
          <div className="loading-indicator">
            <div>Загрузка данных... {ports.length > 0 ? `(найдено ${ports.length} портов, но ещё загружаем)` : ''}</div>
            <div className="loading-actions">
              <button 
                onClick={() => refreshPorts()}
                className="refresh-button"
              >
                Принудительно обновить
              </button>
            </div>
          </div>
        ) : error && ports.length === 0 ? (
          <div className="error-message">
            {error}
            <button onClick={() => refreshPorts()} className="retry-button">Повторить</button>
          </div>
        ) : (
          <>
            {error && <div className="error-toast">{error}</div>}
            {/* Отображаем количество портов над таблицей */}
            {ports.length > 0 && (
              <div className="ports-summary">
                Найдено {ports.length} портов
              </div>
            )}
            {/* Мемоизированный компонент таблицы */}
            {tableComponent}
          </>
        )}
      </div>
    </div>
  );
};