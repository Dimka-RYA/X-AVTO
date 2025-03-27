import React, { useEffect, useMemo, useCallback } from 'react';
import { PortsTableProps } from '../types';
import { ResizeableHeader } from './ResizeableHeader';
import { getAddressDetails, clearAddressCache } from '../utils/addressFormatter';
import '../Ports.css';

// Максимальное количество портов для логирования
const MAX_LOG_PORTS = 5;

/**
 * Компонент таблицы для отображения списка портов
 */
export const PortsTable: React.FC<PortsTableProps> = ({
  ports,
  searchTerm,
  closingPorts,
  onClosePort,
  columnWidths,
  handleColumnResize
}) => {
  // Очищаем кэш адресов при монтировании и размонтировании компонента
  useEffect(() => {
    // При первом рендере очищаем кэш
    clearAddressCache();
    
    // При размонтировании тоже очищаем кэш
    return () => {
      clearAddressCache();
    };
  }, []);
  
  // Логирование только первых нескольких портов для отладки
  useEffect(() => {
    if (ports.length > 0) {
      console.log(`Rendering PortsTable with ${ports.length} ports`);
      console.log("Первые порты для отладки:");
      
      // Логируем только ограниченное количество портов
      const portsToLog = Math.min(ports.length, MAX_LOG_PORTS);
      for (let i = 0; i < portsToLog; i++) {
        console.log(`Порт ${i}: local=${ports[i].local_addr}, foreign=${ports[i].foreign_addr}, state=${ports[i].state}`);
      }
    }
  }, [ports.length]); // Зависимость только от количества портов

  // Мемоизируем отфильтрованные порты для уменьшения перерендеров
  const filteredPorts = useMemo(() => {
    if (!searchTerm || !searchTerm.trim()) return ports;
    
    const normalizedSearch = searchTerm.toLowerCase().trim();
    return ports.filter(port => 
      Object.values(port).some(value => 
        value.toLowerCase().includes(normalizedSearch)
      )
    );
  }, [ports, searchTerm]);

  // Мемоизированная функция для форматирования адреса - просто возвращает оригинальный адрес из netstat
  const renderAddress = useCallback((address: string | null | undefined): string => {
    // Если адрес совсем пустой
    if (address === null || address === undefined || address === '') {
      return '0.0.0.0:0';
    }
    
    // Возвращаем адрес точно в том виде, как он пришел из netstat
    return address;
  }, []);

  // Мемоизированная функция для получения тултипов
  const getAddressTooltip = useCallback((address: string | null | undefined): string => {
    // Если адрес действительно совсем пустой
    if (address === null || address === undefined || address === '' || address.trim() === '') {
      return "Адрес не указан или имеет специальное значение";
    }
    
    try {
      // Используем функцию получения деталей с кэшированием
      return getAddressDetails(address);
    } catch (error) {
      // В случае ошибки всегда возвращаем хотя бы оригинальный адрес
      return `Оригинальный адрес: ${address}`;
    }
  }, []);

  // Мемоизированная функция для деталей о состоянии порта
  const getStateDetails = useCallback((state: string | undefined, protocol: string): string => {
    if (protocol === "UDP") {
      return "Дейтаграмма - UDP соединение без установки соединения";
    }
    
    if (!state) return "Неизвестное состояние";
    
    switch (state) {
      case "LISTENING":
      case "LISTEN":
        return "Слушающий порт - ожидает входящих соединений";
      case "ESTABLISHED":
        return "Установлено соединение между двумя хостами";
      case "TIME_WAIT":
        return "Ожидание завершения передачи всех пакетов перед закрытием";
      case "CLOSE_WAIT":
        return "Ожидание закрытия соединения локальным приложением";
      case "FIN_WAIT_1":
      case "FIN_WAIT_2":
        return "Соединение в процессе закрытия";
      case "LAST_ACK":
        return "Ожидание подтверждения запроса на завершение соединения";
      case "SYN_SENT":
        return "Отправлен запрос на установление соединения";
      case "SYN_RECEIVED":
      case "SYN_RECV":
        return "Получен и отправлен запрос на установление соединения";
      case "CLOSING":
        return "Процесс закрытия соединения";
      default:
        return `Состояние: ${state}`;
    }
  }, []);

  // Функция для получения подробностей о процессе для отображения в подсказке
  const getProcessDetails = (pid: string, name: string, path: string) => {
    // Обрабатываем случай системного процесса
    if (pid === "0" || pid === "4" || name.toLowerCase().includes("system")) {
      return "Системный процесс Windows";
    }
    
    // Для обычных процессов показываем имя и путь, если они доступны
    if (path && path.trim() !== '') {
      return `${name}\nПуть: ${path}`;
    }
    
    return name || "Неизвестный процесс";
  };

  // Функция для получения полного адреса (для data-full-addr атрибута)
  const getFullAddress = useCallback((address: string): string => {
    // Возвращаем точно такой адрес как он есть, без преобразований
    return address || '';
  }, []);

  return (
    <table className="ports-table">
      <thead>
        <tr>
          <ResizeableHeader width={columnWidths.protocol} onResize={(w) => handleColumnResize('protocol', w)}>
            Протокол
          </ResizeableHeader>
          <ResizeableHeader width={columnWidths.local_addr} onResize={(w) => handleColumnResize('local_addr', w)}>
            Локальный адрес
          </ResizeableHeader>
          <ResizeableHeader width={columnWidths.foreign_addr} onResize={(w) => handleColumnResize('foreign_addr', w)}>
            Внешний адрес
          </ResizeableHeader>
          <ResizeableHeader width={columnWidths.state} onResize={(w) => handleColumnResize('state', w)}>
            Состояние
          </ResizeableHeader>
          <ResizeableHeader width={columnWidths.pid} onResize={(w) => handleColumnResize('pid', w)}>
            PID
          </ResizeableHeader>
          <ResizeableHeader width={columnWidths.name} onResize={(w) => handleColumnResize('name', w)}>
            Процесс
          </ResizeableHeader>
          <ResizeableHeader width={columnWidths.action} onResize={(w) => handleColumnResize('action', w)}>
            Действие
          </ResizeableHeader>
        </tr>
      </thead>
      <tbody>
        {filteredPorts.length > 0 ? (
          filteredPorts.map((port, index) => (
            <tr key={`${port.pid}-${port.local_addr}-${index}`}>
              <td 
                style={{ width: `${columnWidths.protocol}px` }}
                title={`${port.protocol} - ${port.protocol === 'TCP' ? 'Transmission Control Protocol' : port.protocol === 'UDP' ? 'User Datagram Protocol' : port.protocol}`}
                className="protocol-cell"
                data-protocol={port.protocol}
              >
                {port.protocol}
              </td>
              <td 
                style={{ width: `${columnWidths.local_addr}px` }} 
                title={getAddressTooltip(port.local_addr)}
                className="address-cell"
                data-raw-addr={port.local_addr}
                data-is-ipv6={port.local_addr?.includes('[')}
                data-full-addr={getFullAddress(port.local_addr)}
                data-udp={port.protocol === "UDP" ? "true" : undefined}
              >
                {renderAddress(port.local_addr)}
              </td>
              <td 
                style={{ width: `${columnWidths.foreign_addr}px` }} 
                title={getAddressTooltip(port.foreign_addr)}
                className="address-cell"
                data-raw-addr={port.foreign_addr}
                data-is-ipv6={port.foreign_addr?.includes('[')}
                data-full-addr={getFullAddress(port.foreign_addr)}
                data-udp={port.protocol === "UDP" ? "true" : undefined}
              >
                {renderAddress(port.foreign_addr)}
              </td>
              <td 
                style={{ width: `${columnWidths.state}px` }}
                title={getStateDetails(port.state, port.protocol)}
                className="state-cell"
                data-state={port.state?.toUpperCase() || (port.protocol === "UDP" ? "DATAGRAM" : "")}
                data-protocol={port.protocol}
              >
                {port.state || (port.protocol === "UDP" ? "DATAGRAM" : "-")}
              </td>
              <td 
                style={{ width: `${columnWidths.pid}px` }}
                title={`Идентификатор процесса: ${port.pid}`}
                className="pid-cell"
              >
                {port.pid}
              </td>
              <td 
                style={{ width: `${columnWidths.name}px` }} 
                title={getProcessDetails(port.pid, port.name, port.path)}
                className="process-name-cell"
                data-has-path={port.path && port.path.trim() !== '' ? "true" : "false"}
              >
                {port.name}
                {port.path && port.path.trim() !== '' && <span className="path-indicator">📂</span>}
              </td>
              <td style={{ width: `${columnWidths.action}px` }}>
                <button 
                  className="action-button"
                  onClick={() => {
                    // Для системных процессов добавляем подтверждение
                    if (port.pid === "0" || port.pid === "4" || port.name.toLowerCase().includes("system")) {
                      const confirmed = window.confirm(
                        `Внимание! Вы собираетесь закрыть системный процесс ${port.name} (PID: ${port.pid}).\n\n` +
                        `Это может привести к нестабильной работе системы. Продолжить?`
                      );
                      if (!confirmed) return;
                    }
                    onClosePort(port.pid);
                  }}
                  disabled={closingPorts.has(port.pid)}
                  title={
                    closingPorts.has(port.pid) 
                      ? `Закрытие процесса ${port.name}...` 
                      : `Закрыть процесс ${port.name} (PID: ${port.pid})\n` +
                        `Протокол: ${port.protocol}\n` +
                        `Локальный адрес: ${port.local_addr}\n` +
                        `Состояние: ${port.state || "Не указано"}`
                  }
                >
                  {closingPorts.has(port.pid) ? "Закрытие..." : "Закрыть"}
                </button>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={7} className="no-results">Нет результатов для отображения</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}; 