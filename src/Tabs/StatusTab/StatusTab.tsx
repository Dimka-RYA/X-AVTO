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
  memory_speed: string;    // Скорость памяти в МГц
  slots_total: number;     // Общее количество слотов памяти
  slots_used: number;      // Использованное количество слотов памяти
  memory_name: string;     // Название/производитель памяти
  memory_part_number: string; // Номер модели памяти
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
  memory_type?: string;
  memory_total?: number;
  memory_used?: number;
  driver_version?: string;   // Версия драйвера
  fan_speed?: number;        // Скорость вентилятора (%)
  power_draw?: number;       // Энергопотребление (Вт)
  power_limit?: number;      // Лимит энергопотребления (Вт)
}

interface NetworkInfo {
  usage: number;
  adapter_name?: string;     // Название сетевого адаптера
  ip_address?: string;       // IP-адрес
  download_speed?: number;   // Скорость загрузки (байт/с)
  upload_speed?: number;     // Скорость выгрузки (байт/с)
  total_received?: number;   // Всего получено данных (байт)
  total_sent?: number;       // Всего отправлено данных (байт)
  mac_address?: string;      // MAC-адрес
  connection_type?: string;  // Тип подключения (Ethernet, Wi-Fi)
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
              <div className="gpu-model">{systemInfo.gpu.name || 'Неизвестная видеокарта'}</div>
              
              {systemInfo.gpu.driver_version && (
                <div className="info-row">
                  <span className="info-label">Драйвер:</span>
                  <span className="info-value">{systemInfo.gpu.driver_version}</span>
                </div>
              )}
              
              <div className="indicators-row">
                <CircularIndicator
                  value={systemInfo.gpu.usage || 0}
                  color={getColorForPercentage(systemInfo.gpu.usage || 0)}
                  text={`${systemInfo.gpu.usage?.toFixed(0) || 0}%`}
                  label="Использование"
                />
                
                {systemInfo.gpu.temperature && (
                  <CircularIndicator
                    value={systemInfo.gpu.temperature}
                    color={getColorForTemperature(systemInfo.gpu.temperature)}
                    text={`${systemInfo.gpu.temperature.toFixed(0)}°C`}
                    label="Температура"
                  />
                )}
                
                {systemInfo.gpu.fan_speed && (
                  <CircularIndicator
                    value={systemInfo.gpu.fan_speed}
                    color={systemInfo.gpu.fan_speed > 70 ? '#f44336' : systemInfo.gpu.fan_speed > 40 ? '#ff9800' : '#4caf50'}
                    text={`${systemInfo.gpu.fan_speed.toFixed(0)}%`}
                    label="Вентилятор"
                  />
                )}
              </div>
              
              <div className="gpu-details">
                {systemInfo.gpu.cores && (
                  <div className="info-row">
                    <span className="info-label">Ядра:</span>
                    <span className="info-value">{systemInfo.gpu.cores}</span>
                  </div>
                )}
                
                {systemInfo.gpu.frequency && (
                  <div className="info-row">
                    <span className="info-label">Частота:</span>
                    <span className="info-value">{systemInfo.gpu.frequency.toFixed(2)} ГГц</span>
                  </div>
                )}
                
                {systemInfo.gpu.power_draw && (
                  <div className="info-row">
                    <span className="info-label">Энергопотребление:</span>
                    <span className="info-value">
                      {systemInfo.gpu.power_draw.toFixed(1)} / {systemInfo.gpu.power_limit?.toFixed(1) || '?'} Вт
                    </span>
                  </div>
                )}
                
                {systemInfo.gpu.memory_type && (
                  <div className="info-row">
                    <span className="info-label">Тип памяти:</span>
                    <span className="info-value">{systemInfo.gpu.memory_type}</span>
                  </div>
                )}
                
                {systemInfo.gpu.memory_total && (
                  <div className="info-row">
                    <span className="info-label">Видеопамять:</span>
                    <span className="info-value">
                      {formatBytes(systemInfo.gpu.memory_used || 0)} / {formatBytes(systemInfo.gpu.memory_total)}
                      {systemInfo.gpu.memory_total > 0 && systemInfo.gpu.memory_used && (
                        <span className="memory-percentage">
                          ({Math.round((systemInfo.gpu.memory_used / systemInfo.gpu.memory_total) * 100)}%)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="system-section">
              <h3 className="section-header">Видеокарта</h3>
              <div className="not-available">Информация недоступна</div>
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
              <div className="processor-model">
                {systemInfo.memory.memory_name && systemInfo.memory.memory_part_number 
                  ? `${systemInfo.memory.memory_name} ${systemInfo.memory.memory_part_number}` 
                  : 'Оперативная память'}
              </div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Тип памяти:</span>
                    <span>{systemInfo.memory.type_ram || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Производитель:</span>
                    <span>{systemInfo.memory.memory_name || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Модель:</span>
                    <span>{systemInfo.memory.memory_part_number || 'Нет данных'}</span>
                  </div>
                  <div className="info-row">
                    <span>Скорость:</span>
                    <span>{systemInfo.memory.memory_speed || 'Нет данных'}</span>
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
              
              {systemInfo.network.adapter_name && (
                <div className="network-adapter-name">
                  {systemInfo.network.adapter_name}
                  {systemInfo.network.connection_type && ` (${systemInfo.network.connection_type})`}
                </div>
              )}
              
              <div className="info-block">
                <div className="info-text">
                  {systemInfo.network.ip_address && (
                    <div className="info-row">
                      <span className="info-label">IP-адрес:</span>
                      <span className="info-value">{systemInfo.network.ip_address}</span>
                    </div>
                  )}
                  
                  {systemInfo.network.mac_address && (
                    <div className="info-row">
                      <span className="info-label">MAC-адрес:</span>
                      <span className="info-value">{systemInfo.network.mac_address}</span>
                    </div>
                  )}
                  
                  <div className="info-row">
                    <span className="info-label">Использование:</span>
                    <span className="info-value">{typeof systemInfo.network.usage === 'number' ? `${systemInfo.network.usage.toFixed(1)}%` : 'Нет данных'}</span>
                  </div>
                  
                  {systemInfo.network.download_speed !== undefined && (
                    <div className="info-row">
                      <span className="info-label">Скорость загрузки:</span>
                      <span className="info-value">{formatBytes(systemInfo.network.download_speed)}/с</span>
                    </div>
                  )}
                  
                  {systemInfo.network.upload_speed !== undefined && (
                    <div className="info-row">
                      <span className="info-label">Скорость выгрузки:</span>
                      <span className="info-value">{formatBytes(systemInfo.network.upload_speed)}/с</span>
                    </div>
                  )}
                  
                  {systemInfo.network.total_received !== undefined && (
                    <div className="info-row">
                      <span className="info-label">Всего получено:</span>
                      <span className="info-value">{formatBytes(systemInfo.network.total_received)}</span>
                    </div>
                  )}
                  
                  {systemInfo.network.total_sent !== undefined && (
                    <div className="info-row">
                      <span className="info-label">Всего отправлено:</span>
                      <span className="info-value">{formatBytes(systemInfo.network.total_sent)}</span>
                    </div>
                  )}
                </div>
                
                <div className="network-gauge">
                  <CircularIndicator
                    value={systemInfo.network.usage || 0}
                    color={getColorForPercentage(systemInfo.network.usage || 0)}
                    text={`${Math.round(systemInfo.network.usage || 0)}%`}
                    label="Использование"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="system-section">
              <h3 className="section-header">Сеть</h3>
              <div className="not-available">Информация недоступна</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusTab; 