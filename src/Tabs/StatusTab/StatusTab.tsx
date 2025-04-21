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
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

// Форматирование скорости сети
const formatNetworkSpeed = (bytesPerSec: number) => {
  return formatBytes(bytesPerSec) + '/s';
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
  // Для демонстрации добавляем моковые данные согласно макету
  const mockData: SystemInfo = {
    cpu: {
      name: 'AMD Ryzen 5 3600',
      usage: 75,
      temperature: 75,
      cores: 2,
      threads: 4,
      frequency: 2.5,
      max_frequency: 3.5,
      architecture: 'Zen 3',
      vendor_id: 'AMD',
      model_name: 'AMD Ryzen 5 3600',
      cache_size: '32 MB',
      stepping: 'WOF',
      family: 'Ryzen 5'
    },
    memory: {
      total_memory: 8 * 1024 * 1024 * 1024, // 8 ГБ
      used_memory: 4 * 1024 * 1024 * 1024, // 4 ГБ
      available_memory: 4 * 1024 * 1024 * 1024, // 4 ГБ
      free_memory: 4 * 1024 * 1024 * 1024, // 4 ГБ
      usage_percent: 50,
      memory_type: 'DDR4',
      frequency: '3200 МГц'
    },
    disks: [
      {
        name: 'Диск D SATA HUI SOSANIE',
        mount_point: 'D:',
        available_space: 0,
        total_space: 2 * 1024 * 1024 * 1024, // 2 ГБ
        file_system: 'NTFS',
        is_removable: false,
        usage_percent: 100
      },
      {
        name: 'Диск D SATA HUI SOSANIE',
        mount_point: 'D:',
        available_space: 0,
        total_space: 2 * 1024 * 1024 * 1024, // 2 ГБ
        file_system: 'NTFS',
        is_removable: false,
        usage_percent: 100
      }
    ],
    gpu: {
      name: 'AMD Ryzen 5 3600',
      usage: 75,
      temperature: 75,
      cores: 2,
      frequency: 2.5
    },
    network: {
      usage: 100
    }
  };

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Функция получения данных о системе
  const fetchSystemInfo = async () => {
    try {
      console.log('Запрос данных о системе...');
      // Раскомментируйте следующую строку для работы с реальными данными
      const info = await invoke('get_system_info');
      // const info = mockData; // Используем моковые данные для разработки
      console.log('Получены данные:', info);
      
      setSystemInfo(info as SystemInfo);
      setLoading(false);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Ошибка получения информации о системе:', err);
      setError(`Ошибка получения данных: ${err}`);
      setLoading(false);
    }
  };

  // Запрос данных при загрузке и каждые 5 секунд
  useEffect(() => {
    fetchSystemInfo();
    
    const interval = setInterval(() => {
      fetchSystemInfo();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="status-container">
        <div className="loading-indicator">Получение данных о системе...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-container">
        <div className="error-message">{error}</div>
      </div>
    );
  }

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
          {systemInfo.cpu && (
            <div className="system-section">
              <h3 className="section-header">Процессор</h3>
              <div className="processor-model">{systemInfo.cpu.model_name || systemInfo.cpu.name}</div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Кол-во ядер:</span>
                    <span>{systemInfo.cpu.cores}</span>
                  </div>
                  <div className="info-row">
                    <span>Кол-во потоков:</span>
                    <span>{systemInfo.cpu.threads}</span>
                  </div>
                  <div className="info-row">
                    <span>Частота:</span>
                    <span>{systemInfo.cpu.frequency.toFixed(1)} ГГц</span>
                  </div>
                  <div className="info-row">
                    <span>Макс. частота:</span>
                    <span>{systemInfo.cpu.max_frequency.toFixed(1)} ГГц</span>
                  </div>
                  <div className="info-row">
                    <span>Архитектура:</span>
                    <span>{systemInfo.cpu.architecture}</span>
                  </div>
                  <div className="info-row">
                    <span>Производитель:</span>
                    <span>{systemInfo.cpu.vendor_id}</span>
                  </div>
                  <div className="info-row">
                    <span>Размер кэша:</span>
                    <span>{systemInfo.cpu.cache_size}</span>
                  </div>
                  <div className="info-row">
                    <span>Семейство:</span>
                    <span>{systemInfo.cpu.family}</span>
                  </div>
                  <div className="info-row">
                    <span>Степпинг:</span>
                    <span>{systemInfo.cpu.stepping}</span>
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
                      value={systemInfo.cpu.usage}
                      color={getColorForPercentage(systemInfo.cpu.usage)}
                      text={`${Math.round(systemInfo.cpu.usage)}%`}
                      label="Нагруженность"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Видеокарта */}
          {systemInfo.gpu && (
            <div className="system-section">
              <h3 className="section-header">Видеокарта</h3>
              <div className="processor-model">{systemInfo.gpu.name}</div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Кол-во ядер: {systemInfo.gpu.cores || 0}</span>
                  </div>
                  <div className="info-row">
                    <span>Модель: Intel Core i5-12400F</span>
                  </div>
                  <div className="info-row">
                    <span>Частота: {systemInfo.gpu.frequency?.toFixed(1) || '0'} ГГц</span>
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
                      value={systemInfo.gpu.usage}
                      color={getColorForPercentage(systemInfo.gpu.usage)}
                      text={`${Math.round(systemInfo.gpu.usage)}%`}
                      label="Нагруженность"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Правая колонка */}
        <div className="status-column">
          {/* Диски */}
          {systemInfo.disks && systemInfo.disks.length > 0 && systemInfo.disks.map((disk, index) => (
            <div key={index} className="system-section">
              <h3 className="section-header">Диски</h3>
              <div className="processor-model">{disk.name}</div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Использование: 100%</span>
                  </div>
                  <div className="info-row">
                    <span>Размер: {formatBytes(disk.total_space).split(' ')[0]} {formatBytes(disk.total_space).split(' ')[1]}</span>
                  </div>
                  <div className="info-row">
                    <span>Файловая система: {disk.file_system}</span>
                  </div>
                </div>
                
                <div className="disk-gauge">
                  <CircularIndicator
                    value={disk.usage_percent}
                    color={getColorForPercentage(disk.usage_percent)}
                    text={`${Math.round(disk.usage_percent)}%`}
                  />
                </div>
              </div>
            </div>
          ))}
          
          {/* Оперативная память */}
          {systemInfo.memory && (
            <div className="system-section">
              <h3 className="section-header">Оперативная память</h3>
              <div className="processor-model">OCPC X3 RGB BLACK</div>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Тип памяти: {systemInfo.memory.memory_type}</span>
                  </div>
                  <div className="info-row">
                    <span>Объем памяти: {formatBytes(systemInfo.memory.total_memory).split(' ')[0]} {formatBytes(systemInfo.memory.total_memory).split(' ')[1]}</span>
                  </div>
                  <div className="info-row">
                    <span>Тактовая частота: {systemInfo.memory.frequency}</span>
                  </div>
                </div>
                
                <div className="memory-gauge">
                  <CircularIndicator
                    value={systemInfo.memory.usage_percent}
                    color={getColorForPercentage(systemInfo.memory.usage_percent)}
                    text={`${Math.round(systemInfo.memory.usage_percent)}%`}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Сеть */}
          {systemInfo.network && (
            <div className="system-section">
              <h3 className="section-header">Сеть</h3>
              
              <div className="info-block">
                <div className="info-text">
                  <div className="info-row">
                    <span>Использование: 100%</span>
                  </div>
                </div>
                
                <div className="network-gauge">
                  <CircularIndicator
                    value={systemInfo.network.usage}
                    color={getColorForPercentage(systemInfo.network.usage)}
                    text={`${Math.round(systemInfo.network.usage)}%`}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusTab; 