import React, { useEffect, useMemo, useCallback } from 'react';
import { PortsTableProps } from '../types';
import { ResizeableHeader } from './ResizeableHeader';
import { getAddressDetails, clearAddressCache } from '../utils/addressFormatter';
import { Folder, X, XCircle, Scissors, Shield, AlertTriangle } from 'lucide-react';
import { usePorts } from '../hooks/usePorts';
import '../Ports.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faBomb, faShield, faTriangleExclamation, faScissors, faCircleXmark } from '@fortawesome/free-solid-svg-icons';

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
  // Получаем вспомогательные функции из хука usePorts
  const { openProcessPath, canClosePortIndividually, isPrivilegedProcess } = usePorts();

  // Очищаем кэш адресов при монтировании и размонтировании компонента
  useEffect(() => {
    clearAddressCache();
    return () => {
      clearAddressCache();
    };
  }, []);
  
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

  // Мемоизированная функция для форматирования адреса
  const renderAddress = useCallback((address: string | null | undefined): string => {
    if (address === null || address === undefined || address === '') {
      return '0.0.0.0:0';
    }
    return address;
  }, []);

  // Мемоизированная функция для получения тултипов
  const getAddressTooltip = useCallback((address: string | null | undefined): string => {
    if (address === null || address === undefined || address === '') {
      return "Адрес не указан";
    }
    
    try {
      return getAddressDetails(address);
    } catch (error) {
      return `Адрес: ${address}`;
    }
  }, []);

  // Мемоизированная функция для деталей о состоянии порта
  const getStateDetails = useCallback((state: string | undefined, protocol: string): string => {
    if (protocol === "UDP") {
      return "UDP - соединение без установки соединения (дейтаграмма)";
    }
    
    if (!state) return "Неизвестное состояние";
    
    switch (state) {
      case "LISTENING":
      case "LISTEN":
        return "Слушающий порт - ожидание входящих соединений";
      case "ESTABLISHED":
        return "Установленное соединение между двумя хостами";
      case "TIME_WAIT":
        return "Ожидание завершения передачи пакетов перед закрытием";
      case "CLOSE_WAIT":
        return "Ожидание закрытия соединения локальным приложением";
      case "FIN_WAIT_1":
      case "FIN_WAIT_2":
        return "Соединение в процессе закрытия";
      case "LAST_ACK":
        return "Ожидание подтверждения запроса на завершение";
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
  const getProcessDetails = useCallback((pid: string, name: string, path: string): string => {
    if (pid === "0" || pid === "4" || name.toLowerCase().includes("system")) {
      return "Системный процесс Windows";
    }
    
    let details = `Процесс: ${name}\nPID: ${pid}`;
    
    if (path && path.trim() !== '') {
      details += `\nПуть: ${path}`;
    }
    
    return details;
  }, []);

  // Функция для получения полного адреса
  const getFullAddress = useCallback((address: string): string => {
    return address || '';
  }, []);

  // Обработчик открытия пути к процессу
  const handleOpenProcessPath = useCallback((pid: string) => {
    openProcessPath(pid).catch(err => {
      console.error('Ошибка при открытии пути к процессу:', err);
    });
  }, [openProcessPath]);

  // Проверяет, является ли процесс системным
  const isSystemProcess = (pid: string, processName: string): boolean => {
    const systemPids = ['0', '4'];
    const systemProcessNames = ['system', 'system idle process', 'idle', 'registry', 'memory compression', 'secure system'];
    
    const pidMatches: boolean = systemPids.includes(pid);
    const nameMatches: boolean = Boolean(processName && systemProcessNames.some(name => processName.toLowerCase().includes(name)));
    
    return pidMatches || nameMatches;
  };

  // Возвращает соответствующую иконку в зависимости от типа процесса
  const getProcessIcon = (pid: string, processName: string) => {
    if (isSystemProcess(pid, processName)) {
      return faShield; // Иконка щита для системных процессов
    } else if (processName.toLowerCase().includes('steam')) {
      return faTriangleExclamation; // Иконка треугольника с восклицательным знаком для Steam
    } else if (isPrivilegedProcess(processName)) {
      return faTriangleExclamation; // Иконка треугольника с восклицательным знаком для привилегированных процессов
    } else if (canClosePortIndividually && canClosePortIndividually(pid, '')) {
      return faScissors; // Иконка ножниц для процессов, которые можно закрыть индивидуально
    } else {
      return faCircleXmark; // Иконка крестика для обычных процессов
    }
  };

  return (
    <div className="table-responsive">
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
                </td>
                <td style={{ width: `${columnWidths.action}px` }} className="action-cell">
                  <div className="action-buttons">
                    <button 
                      className="action-button folder-button"
                      onClick={() => handleOpenProcessPath(port.pid)}
                      disabled={!port.path}
                    >
                      <FontAwesomeIcon icon={faFolder} className="folder-icon" />
                    </button>
                    
                    {port.name.toLowerCase().includes('steam') || 
                     port.name.toLowerCase().includes('game') ||
                     port.name.toLowerCase().includes('epic') ||
                     port.name.toLowerCase().includes('origin') ||
                     port.name.toLowerCase().includes('battle.net') ||
                     port.name.toLowerCase().includes('uplay') ? (
                      <button 
                        className="action-button emergency-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const confirmed = window.confirm(
                            `❗ ВНИМАНИЕ! Вы собираетесь принудительно завершить игровой процесс ${port.name} (PID: ${port.pid}).` +
                            `\n\nЭто может привести к потере несохраненных данных. Продолжить?`
                          );
                          if (confirmed) {
                            onClosePort(port.pid, {
                              protocol: port.protocol,
                              local_addr: port.local_addr
                            }, port.name);
                          }
                        }}
                        disabled={closingPorts.has(port.pid)}
                      >
                        {closingPorts.has(port.pid) ? (
                          <span className="closing-indicator steam"></span>
                        ) : (
                          <FontAwesomeIcon icon={faBomb} className="bomb-icon" />
                        )}
                      </button>
                    ) : (
                      <button 
                        className="action-button close-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSystemProcess(port.pid, port.name)) {
                            const confirmed = window.confirm(
                              `Внимание! Вы собираетесь закрыть системный процесс ${port.name} (PID: ${port.pid}).\n\n` +
                              `Это может привести к нестабильной работе системы. Продолжить?`
                            );
                            if (!confirmed) return;
                          }
                          onClosePort(port.pid, {
                            protocol: port.protocol,
                            local_addr: port.local_addr
                          }, port.name);
                        }}
                        disabled={closingPorts.has(port.pid)}
                      >
                        {closingPorts.has(port.pid) ? (
                          <span className={`closing-indicator ${isSystemProcess(port.pid, port.name) ? 'system' : isPrivilegedProcess(port.name) ? 'privileged' : ''}`}></span>
                        ) : (
                          <FontAwesomeIcon icon={getProcessIcon(port.pid, port.name)} className="close-icon" />
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="no-results">
                {searchTerm ? 'Нет результатов по вашему запросу' : 'Нет данных о портах'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}; 