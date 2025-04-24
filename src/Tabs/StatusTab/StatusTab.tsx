import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './StatusTab.css';

// Обновленные интерфейсы для совместимости с бэкендом и макетом
interface SystemInfo {
  cpu: ProcessorInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
  gpu?: GPUInfo;
  network?: NetworkInfo;
}

interface ProcessorInfo {
  name: string;
  usage: number;
  temperature?: number;
  cores: number;
  threads: number;
  frequency: number;
  base_frequency: number;
  max_frequency: number;
  architecture: string;
  vendor_id: string;
  model_name: string;
  cache_size: string;
  processes: number;      // количество процессов в системе
  system_threads: number; // количество потоков в системе
  handles: number;        // количество дескрипторов в системе
}

interface MemoryInfo {
  total: number;
  used: number;
  available: number;
  free: number;
  usage_percentage: number;
  type_ram: string;        // DDR4, DDR5 и т.д.
  swap_total: number;      // Общее количество виртуальной памяти
  swap_used: number;       // Используемое количество виртуальной памяти  
  swap_free: number;       // Свободное количество виртуальной памяти
  swap_usage_percentage: number; // Процент использования виртуальной памяти
}

interface DiskInfo {
  name: string;
  mount_point: string;
  available_space: number;
  total_space: number;
  file_system: string;
  is_removable: boolean;
  usage_percent: number;
}

// Добавляем интерфейсы для видеокарты и сети (по макету)
interface GPUInfo {
  name: string;
  usage: number;
  temperature?: number;
  cores?: number;
  frequency?: number;
}

interface NetworkInfo {
  usage: number;
}

// Компонент кругового индикатора
interface CircularIndicatorProps {
  value: number;
  maxValue?: number;
  radius?: number;
  strokeWidth?: number;
  color: string;
  text: string;
  label?: string;
}

const CircularIndicator: React.FC<CircularIndicatorProps> = ({
  value,
  maxValue = 100,
  radius = 35,
  strokeWidth = 6,
  color,
  text,
  label
}) => {
  const normalizedValue = Math.min(Math.max(value, 0), maxValue) / maxValue;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference * (1 - normalizedValue);

  return (
    <div className="circular-indicator">
      <svg width={2 * radius + strokeWidth} height={2 * radius + strokeWidth} className="indicator-svg">
        <circle
          className="indicator-background"
          cx={radius + strokeWidth / 2}
          cy={radius + strokeWidth / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="indicator-progress"
          cx={radius + strokeWidth / 2}
          cy={radius + strokeWidth / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
        />
      </svg>
      <div className="indicator-center-text">{text}</div>
      {label && <div className="indicator-label">{label}</div>}
    </div>
  );
};

// Форматирование байт в читаемый формат
const formatBytes = (bytes: number, decimals = 1) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

// Вспомогательные функции для определения цветов
const getColorForPercentage = (percentage: number): string => {
  if (percentage < 60) return '#4caf50'; // зеленый
  if (percentage < 80) return '#ff9800'; // оранжевый
  return '#f44336'; // красный
};

const getColorForTemperature = (temperature: number): string => {
  if (temperature < 60) return '#4caf50'; // зеленый
  if (temperature < 80) return '#ff9800'; // оранжевый
  return '#f44336'; // красный
};

// Основной компонент StatusTab
const StatusTab: React.FC = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let unlistenSystemInfo: (() => void) | null = null;
    let unlistenInitialized: (() => void) | null = null;

    async function setupListeners() {
      try {
        // Слушаем обновления системной информации
        unlistenSystemInfo = await listen('system-info-updated', (event) => {
          setSystemInfo(event.payload as SystemInfo);
          setLoading(false);
        });

        // Слушаем событие инициализации мониторинга
        unlistenInitialized = await listen('monitoring-initialized', () => {
          console.log('Мониторинг инициализирован и готов к использованию');
        });

        // Активируем мониторинг при монтировании компонента
        await invoke('set_monitoring_active', { active: true });
        console.log('Мониторинг активирован для вкладки Status');

        // Запрашиваем начальные данные
        const initialData = await invoke('get_system_info');
        setSystemInfo(initialData as SystemInfo);
        setLoading(false);
      } catch (err) {
        console.error('Ошибка при настройке слушателей:', err);
        setError('Не удалось получить системную информацию');
        setLoading(false);
      }
    }

    setupListeners();

    // Очистка при размонтировании
    return () => {
      // Деактивируем мониторинг при размонтировании компонента
      invoke('set_monitoring_active', { active: false })
        .then(() => console.log('Мониторинг деактивирован для вкладки Status'))
        .catch(console.error);

      // Отписываемся от событий
      if (unlistenSystemInfo) unlistenSystemInfo();
      if (unlistenInitialized) unlistenInitialized();
    };
  }, []);

  // Отображение состояния загрузки
  if (loading) {
    return (
      <div className="status-container">
        <div className="loading-indicator">Получение данных о системе...</div>
      </div>
    );
  }

  // Отображение ошибки
  if (error) {
    return (
      <div className="status-container">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  // Отображение при отсутствии данных
  if (!systemInfo) {
    return (
      <div className="status-container">
        <div className="error-message">Нет данных о системе</div>
      </div>
    );
  }

  return (
    <div className="status-container">
      {lastUpdate && (
        <div className="last-update">
          Обновлено: {lastUpdate.toLocaleTimeString()}
        </div>
      )}

      <div className="status-grid">
        {/* Левая колонка */}
        <div className="status-column">
          {/* Процессор */}
          {systemInfo.cpu ? (
            <div className="system-section">
              <h3 className="section-header">Процессор</h3>
              <div className="processor-model">{systemInfo.cpu.model_name || systemInfo.cpu.name || 'Неизвестная модель'}</div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Архитектура:</span>
                    <span>{systemInfo.cpu.architecture || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Кол-во ядер:</span>
                    <span>{systemInfo.cpu.cores || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Кол-во потоков:</span>
                    <span>{systemInfo.cpu.threads || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Текущая частота:</span>
                    <span>{typeof systemInfo.cpu.frequency === 'number' ? `${systemInfo.cpu.frequency.toFixed(2)} ГГц` : 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Базовая частота:</span>
                    <span>{typeof systemInfo.cpu.base_frequency === 'number' ? `${systemInfo.cpu.base_frequency.toFixed(2)} ГГц` : 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Размер кэша:</span>
                    <span>{systemInfo.cpu.cache_size || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Производитель:</span>
                    <span>{systemInfo.cpu.vendor_id || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Процессы:</span>
                    <span>{systemInfo.cpu.processes || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Потоки:</span>
                    <span>{systemInfo.cpu.system_threads || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Дескрипторы:</span>
                    <span>{systemInfo.cpu.handles || 'Нет данных'}</span>
                  </div>
                </div>
                
                <div className="gauges-container">
                  <div className="gauge-with-label">
                    <CircularIndicator
                      value={systemInfo.cpu.usage || 0}
                      color={getColorForPercentage(systemInfo.cpu.usage || 0)}
                      text={`${(systemInfo.cpu.usage || 0).toFixed(1)}%`}
                      label="Нагруженность"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="system-section">
              <h3 className="section-header">Процессор</h3>
              <div className="no-data-message">Нет данных о процессоре</div>
            </div>
          )}
          
          {/* Видеокарта */}
          {systemInfo.gpu ? (
            <div className="system-section">
              <h3 className="section-header">Видеокарта</h3>
              <div className="processor-model">{systemInfo.gpu.name || 'Неизвестная модель'}</div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Кол-во ядер:</span>
                    <span>{systemInfo.gpu.cores || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Частота:</span>
                    <span>{typeof systemInfo.gpu.frequency === 'number' ? `${systemInfo.gpu.frequency.toFixed(1)} ГГц` : 'Нет данных'}</span>
                  </div>
                </div>
                
                <div className="gauges-container">
                  <div className="gauge-with-label">
                    <CircularIndicator
                      value={systemInfo.gpu.usage || 0}
                      color={getColorForPercentage(systemInfo.gpu.usage || 0)}
                      text={`${Math.round(systemInfo.gpu.usage || 0)}%`}
                      label="Нагруженность"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="system-section">
              <h3 className="section-header">Видеокарта</h3>
              <div className="no-data-message">Нет данных о видеокарте</div>
            </div>
          )}
        </div>
        
        {/* Правая колонка */}
        <div className="status-column">
          {/* Диски */}
          {systemInfo.disks && systemInfo.disks.length > 0 ? (
            systemInfo.disks.map((disk, index) => (
              <div key={index} className="system-section">
                <h3 className="section-header">Диски</h3>
                <div className="processor-model">{disk.name || `Диск ${index + 1}`}</div>
                
                <div className="info-block">
                  <div className="info-text">
                    <div className="info-row">
                      <span>Использование:</span>
                      <span>{typeof disk.usage_percent === 'number' ? `${disk.usage_percent.toFixed(1)}%` : 'Нет данных'}</span>
                    </div>
                    <div className="info-row">
                      <span>Размер:</span>
                      <span>{disk.total_space ? formatBytes(disk.total_space) : 'Нет данных'}</span>
                    </div>
                    <div className="info-row">
                      <span>Файловая система:</span>
                      <span>{disk.file_system || 'Нет данных'}</span>
                    </div>
                    <div className="info-row">
                      <span>Точка монтирования:</span>
                      <span>{disk.mount_point || 'Нет данных'}</span>
                    </div>
                    <div className="info-row">
                      <span>Доступно:</span>
                      <span>{disk.available_space ? formatBytes(disk.available_space) : 'Нет данных'}</span>
                    </div>
                  </div>
                  
                  <div className="disk-gauge">
                    <CircularIndicator
                      value={disk.usage_percent || 0}
                      color={getColorForPercentage(disk.usage_percent || 0)}
                      text={`${Math.round(disk.usage_percent || 0)}%`}
                    />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="system-section">
              <h3 className="section-header">Диски</h3>
              <div className="no-data-message">Нет данных о дисках</div>
            </div>
          )}
          
          {/* Оперативная память */}
          {systemInfo.memory ? (
            <div className="system-section">
              <h3 className="section-header">Оперативная память</h3>
              <div className="processor-model">Оперативная память</div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Тип памяти:</span>
                    <span>{systemInfo.memory.type_ram || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Объем памяти:</span>
                    <span>{systemInfo.memory.total ? formatBytes(systemInfo.memory.total) : 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Использовано RAM:</span>
                    <span>{systemInfo.memory.used ? formatBytes(systemInfo.memory.used) : 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Доступно RAM:</span>
                    <span>{systemInfo.memory.available ? formatBytes(systemInfo.memory.available) : 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Виртуальная память:</span>
                    <span>{systemInfo.memory.swap_total ? formatBytes(systemInfo.memory.swap_total) : 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Использование вирт. памяти:</span>
                    <span>{systemInfo.memory.swap_used ? formatBytes(systemInfo.memory.swap_used) : 'Нет данных'}</span>
                  </div>
                </div>
                
                <div className="gauges-container memory-gauges">
                  <div className="gauge-with-label">
                    <CircularIndicator
                      value={systemInfo.memory.usage_percentage || 0}
                      color={getColorForPercentage(systemInfo.memory.usage_percentage || 0)}
                      text={`${Math.round(systemInfo.memory.usage_percentage || 0)}%`}
                      label="RAM"
                    />
                  </div>
                  
                  {systemInfo.memory.swap_usage_percentage !== undefined && (
                    <div className="gauge-with-label">
                      <CircularIndicator
                        value={systemInfo.memory.swap_usage_percentage || 0}
                        color={getColorForPercentage(systemInfo.memory.swap_usage_percentage || 0)}
                        text={`${Math.round(systemInfo.memory.swap_usage_percentage || 0)}%`}
                        label="SWAP"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="system-section">
              <h3 className="section-header">Оперативная память</h3>
              <div className="no-data-message">Нет данных о памяти</div>
            </div>
          )}
          
          {/* Сеть */}
          {systemInfo.network ? (
            <div className="system-section">
              <h3 className="section-header">Сеть</h3>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Использование:</span>
                    <span>{typeof systemInfo.network.usage === 'number' ? `${systemInfo.network.usage.toFixed(1)}%` : 'Нет данных'}</span>
                  </div>
                </div>
                
                <div className="network-gauge">
                  <CircularIndicator
                    value={systemInfo.network.usage || 0}
                    color={getColorForPercentage(systemInfo.network.usage || 0)}
                    text={`${Math.round(systemInfo.network.usage || 0)}%`}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="system-section">
              <h3 className="section-header">Сеть</h3>
              <div className="no-data-message">Нет данных о сети</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusTab; 