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
  stepping: string;
  family: string;
}

interface MemoryInfo {
  total_memory: number;
  used_memory: number;
  available_memory: number;
  free_memory: number;
  usage_percent: number;
  memory_type: string;
  frequency: string;
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

  // Функция получения данных о системе
  const fetchSystemInfo = async () => {
    try {
      console.log('Запрос данных о системе...');
      const info = await invoke('get_system_info');
      console.log('Получены данные из API:', info);
      
      setSystemInfo(info as SystemInfo);
      setLoading(false);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Ошибка получения информации о системе:', err);
      setError(`Ошибка получения данных: ${err}`);
      setLoading(false);
    }
  };

  // Настройка прослушивания событий и первоначальная загрузка данных
  useEffect(() => {
    // Начальная загрузка данных
    fetchSystemInfo();
    
    // Настройка прослушивателя событий для обновления данных
    let unlistenFn: (() => void) | null = null;
    
    const setupListener = async () => {
      try {
        unlistenFn = await listen<SystemInfo>('system-info-updated', (event) => {
          console.log('Получены обновленные данные через событие:', event);
          setSystemInfo(event.payload as SystemInfo);
          setLoading(false);
          setLastUpdate(new Date());
        });
        
        console.log('Настроено прослушивание событий system-info-updated');
      } catch (err) {
        console.error('Ошибка при настройке прослушивания событий:', err);
        // Если не удалось настроить прослушивание, используем запасной вариант с таймером
        const interval = setInterval(fetchSystemInfo, 2000);
        return () => clearInterval(interval);
      }
    };
    
    setupListener();
    
    // Очистка при размонтировании компонента
    return () => {
      if (unlistenFn) {
        unlistenFn();
        console.log('Прослушивание событий system-info-updated остановлено');
      }
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
                    <span>Семейство:</span>
                    <span>{systemInfo.cpu.family || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Степпинг:</span>
                    <span>{systemInfo.cpu.stepping || 'Нет данных'}</span>
                  </div>
                </div>
                
                <div className="gauges-container">
                  <div className="gauge-with-label">
                    <CircularIndicator
                      value={systemInfo.cpu.temperature || 0}
                      color={getColorForTemperature(systemInfo.cpu.temperature || 0)}
                      text={`${Math.round(systemInfo.cpu.temperature || 0)} C`}
                      label="Температура"
                    />
                  </div>
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
                      value={systemInfo.gpu.temperature || 0}
                      color={getColorForTemperature(systemInfo.gpu.temperature || 0)}
                      text={`${Math.round(systemInfo.gpu.temperature || 0)} C`}
                      label="Температура"
                    />
                  </div>
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
              <div className="processor-model">{systemInfo.memory.memory_type || 'Неизвестный тип памяти'}</div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Тип памяти:</span>
                    <span>{systemInfo.memory.memory_type || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Объем памяти:</span>
                    <span>{systemInfo.memory.total_memory ? formatBytes(systemInfo.memory.total_memory) : 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Тактовая частота:</span>
                    <span>{systemInfo.memory.frequency || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Использовано:</span>
                    <span>{systemInfo.memory.used_memory ? formatBytes(systemInfo.memory.used_memory) : 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Доступно:</span>
                    <span>{systemInfo.memory.available_memory ? formatBytes(systemInfo.memory.available_memory) : 'Нет данных'}</span>
                  </div>
                </div>
                
                <div className="memory-gauge">
                  <CircularIndicator
                    value={systemInfo.memory.usage_percent || 0}
                    color={getColorForPercentage(systemInfo.memory.usage_percent || 0)}
                    text={`${Math.round(systemInfo.memory.usage_percent || 0)}%`}
                  />
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