import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './StatusTab.css';
import ResourceCard from './components/ResourceCard';
import DetailPanel from './components/DetailPanel';

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
  read_speed: number;   // скорость чтения в байтах/с
  write_speed: number;  // скорость записи в байтах/с
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

export const CircularIndicator: React.FC<CircularIndicatorProps> = ({
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

// Тип выбранного ресурса
type ResourceType = 'cpu' | 'memory' | 'gpu' | 'disk' | 'network';

// Основной компонент StatusTab
const StatusTab: React.FC = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // State для хранения истории использования ресурсов
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [gpuHistory, setGpuHistory] = useState<number[]>([]);
  const [diskHistory, setDiskHistory] = useState<number[]>([]);
  const [networkHistory, setNetworkHistory] = useState<number[]>([]);
  
  // Выбранная карточка для детального отображения
  const [selectedResource, setSelectedResource] = useState<ResourceType>('cpu');
  
  // Максимальное количество точек в истории
  const MAX_HISTORY_POINTS = 60;

  // Обновляем историю использования при получении новых данных
  useEffect(() => {
    if (!systemInfo) return;
    
    const updateHistory = () => {
      // Обновляем CPU историю
      setCpuHistory(prev => {
        const newHistory = [...prev, systemInfo.cpu.usage];
        return newHistory.length > MAX_HISTORY_POINTS ? newHistory.slice(-MAX_HISTORY_POINTS) : newHistory;
      });
      
      // Обновляем Memory историю
      setMemoryHistory(prev => {
        const newHistory = [...prev, systemInfo.memory.usage_percentage];
        return newHistory.length > MAX_HISTORY_POINTS ? newHistory.slice(-MAX_HISTORY_POINTS) : newHistory;
      });
      
      // Обновляем GPU историю, если есть данные
      if (systemInfo.gpu) {
        setGpuHistory(prev => {
          const newHistory = [...prev, systemInfo.gpu?.usage || 0];
          return newHistory.length > MAX_HISTORY_POINTS ? newHistory.slice(-MAX_HISTORY_POINTS) : newHistory;
        });
      }
      
      // Обновляем Disk историю (берем среднее значение использования всех дисков)
      if (systemInfo.disks && systemInfo.disks.length > 0) {
        const avgDiskUsage = systemInfo.disks.reduce((sum, disk) => sum + disk.usage_percent, 0) / systemInfo.disks.length;
        setDiskHistory(prev => {
          const newHistory = [...prev, avgDiskUsage];
          return newHistory.length > MAX_HISTORY_POINTS ? newHistory.slice(-MAX_HISTORY_POINTS) : newHistory;
        });
      }
      
      // Обновляем Network историю, если есть данные
      if (systemInfo.network) {
        setNetworkHistory(prev => {
          const newHistory = [...prev, systemInfo.network?.usage || 0];
          return newHistory.length > MAX_HISTORY_POINTS ? newHistory.slice(-MAX_HISTORY_POINTS) : newHistory;
        });
      }
    };
    
    updateHistory();
    setLastUpdate(new Date());
  }, [systemInfo]);

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

  // Генерируем детальную информацию для выбранного ресурса
  const getResourceDetails = () => {
    if (!systemInfo) return null;
    
    switch (selectedResource) {
      case 'cpu':
        return {
          title: 'Процессор',
          subtitle: systemInfo.cpu.model_name || systemInfo.cpu.name,
          graphData: cpuHistory,
          graphColor: '#1E90FF', // DodgerBlue
          currentValue: systemInfo.cpu.usage,
          unit: '%',
          details: [
            { label: 'Архитектура:', value: systemInfo.cpu.architecture || 'Нет данных' },
            { label: 'Ядра:', value: `${systemInfo.cpu.cores || 'Нет данных'}` },
            { label: 'Потоки:', value: `${systemInfo.cpu.threads || 'Нет данных'}` },
            { label: 'Текущая частота:', value: typeof systemInfo.cpu.frequency === 'number' ? `${systemInfo.cpu.frequency.toFixed(2)} ГГц` : 'Нет данных' },
            { label: 'Базовая частота:', value: typeof systemInfo.cpu.base_frequency === 'number' ? `${systemInfo.cpu.base_frequency.toFixed(2)} ГГц` : 'Нет данных' },
            { label: 'Размер кэша:', value: systemInfo.cpu.cache_size || 'Нет данных' },
            { label: 'Производитель:', value: systemInfo.cpu.vendor_id || 'Нет данных' },
            { label: 'Процессы:', value: `${systemInfo.cpu.processes || 'Нет данных'}` },
            { label: 'Системные потоки:', value: `${systemInfo.cpu.system_threads || 'Нет данных'}` },
            { label: 'Дескрипторы:', value: `${systemInfo.cpu.handles || 'Нет данных'}` }
          ]
        };
        
      case 'memory':
        return {
          title: 'Оперативная память',
          subtitle: systemInfo.memory.memory_name ? `${systemInfo.memory.memory_name} ${systemInfo.memory.memory_part_number || ''}` : 'Оперативная память',
          graphData: memoryHistory,
          graphColor: '#9370DB', // MediumPurple
          currentValue: systemInfo.memory.usage_percentage,
          unit: '%',
          details: [
            { label: 'Тип памяти:', value: systemInfo.memory.type_ram || 'Нет данных' },
            { label: 'Производитель:', value: systemInfo.memory.memory_name || 'Нет данных' },
            { label: 'Скорость:', value: systemInfo.memory.memory_speed || 'Нет данных' },
            { label: 'Общий объем:', value: systemInfo.memory.total ? formatBytes(systemInfo.memory.total) : 'Нет данных' },
            { label: 'Использовано:', value: systemInfo.memory.used ? formatBytes(systemInfo.memory.used) : 'Нет данных' },
            { label: 'Доступно:', value: systemInfo.memory.available ? formatBytes(systemInfo.memory.available) : 'Нет данных' },
            { label: 'Виртуальная память:', value: systemInfo.memory.swap_total ? formatBytes(systemInfo.memory.swap_total) : 'Нет данных' },
            { label: 'Использование SWAP:', value: systemInfo.memory.swap_used ? `${formatBytes(systemInfo.memory.swap_used)} (${systemInfo.memory.swap_usage_percentage.toFixed(1)}%)` : 'Нет данных' },
            { label: 'Слоты памяти:', value: systemInfo.memory.slots_total ? `${systemInfo.memory.slots_used} из ${systemInfo.memory.slots_total}` : 'Нет данных' }
          ]
        };
        
      case 'gpu':
        if (!systemInfo.gpu) return null;
        return {
          title: 'Видеокарта',
          subtitle: systemInfo.gpu.name,
          graphData: gpuHistory,
          graphColor: '#32CD32', // LimeGreen
          currentValue: systemInfo.gpu.usage,
          unit: '%',
          details: [
            { label: 'Тип памяти:', value: systemInfo.gpu.memory_type || 'Нет данных' },
            { label: 'Объем памяти:', value: systemInfo.gpu.memory_total ? formatBytes(systemInfo.gpu.memory_total) : 'Нет данных' },
            { label: 'Использование памяти:', value: systemInfo.gpu.memory_used && systemInfo.gpu.memory_total ? 
              `${formatBytes(systemInfo.gpu.memory_used)} / ${formatBytes(systemInfo.gpu.memory_total)}` : 'Нет данных' },
            { label: 'Ядра CUDA:', value: systemInfo.gpu.cores ? `${systemInfo.gpu.cores}` : 'Нет данных' },
            { label: 'Частота:', value: systemInfo.gpu.frequency ? `${systemInfo.gpu.frequency.toFixed(2)} ГГц` : 'Нет данных' },
            { label: 'Температура:', value: systemInfo.gpu.temperature ? `${systemInfo.gpu.temperature.toFixed(1)}°C` : 'Нет данных' },
            { label: 'Драйвер:', value: systemInfo.gpu.driver_version || 'Нет данных' },
            { label: 'Вентилятор:', value: systemInfo.gpu.fan_speed ? `${systemInfo.gpu.fan_speed.toFixed(0)}%` : 'Нет данных' },
            { label: 'Энергопотребление:', value: systemInfo.gpu.power_draw && systemInfo.gpu.power_limit ? 
              `${systemInfo.gpu.power_draw.toFixed(1)} / ${systemInfo.gpu.power_limit.toFixed(1)} Вт` : 'Нет данных' }
          ]
        };
        
      case 'disk':
        if (!systemInfo.disks || systemInfo.disks.length === 0) return null;
        // Для простоты берем первый диск, в продакшн версии можно добавить возможность выбора диска
        const primaryDisk = systemInfo.disks[0];
        return {
          title: 'Диски',
          subtitle: `${primaryDisk.name} (${formatBytes(primaryDisk.total_space)})`,
          graphData: diskHistory,
          graphColor: '#FFA500', // Orange
          currentValue: primaryDisk.usage_percent,
          unit: '%',
          details: [
            { label: 'Всего дисков:', value: `${systemInfo.disks.length}` },
            ...systemInfo.disks.map((disk, index) => ({
              label: `${disk.name}:`,
              value: `${formatBytes(disk.available_space)} свободно из ${formatBytes(disk.total_space)}`
            })),
            { label: 'Файловая система:', value: primaryDisk.file_system },
            { label: 'Скорость чтения:', value: `${formatBytes(primaryDisk.read_speed)}/с` },
            { label: 'Скорость записи:', value: `${formatBytes(primaryDisk.write_speed)}/с` }
          ]
        };
        
      case 'network':
        if (!systemInfo.network) return null;
        return {
          title: 'Сеть',
          subtitle: systemInfo.network.adapter_name,
          graphData: networkHistory,
          graphColor: '#20B2AA', // LightSeaGreen
          currentValue: systemInfo.network.usage,
          unit: '%',
          details: [
            { label: 'IP-адрес:', value: systemInfo.network.ip_address || 'Нет данных' },
            { label: 'MAC-адрес:', value: systemInfo.network.mac_address || 'Нет данных' },
            { label: 'Тип подключения:', value: systemInfo.network.connection_type || 'Нет данных' },
            { label: 'Скорость загрузки:', value: systemInfo.network.download_speed ? `${formatBytes(systemInfo.network.download_speed)}/с` : 'Нет данных' },
            { label: 'Скорость выгрузки:', value: systemInfo.network.upload_speed ? `${formatBytes(systemInfo.network.upload_speed)}/с` : 'Нет данных' },
            { label: 'Всего получено:', value: systemInfo.network.total_received ? formatBytes(systemInfo.network.total_received) : 'Нет данных' },
            { label: 'Всего отправлено:', value: systemInfo.network.total_sent ? formatBytes(systemInfo.network.total_sent) : 'Нет данных' }
          ]
        };
        
      default:
        return null;
    }
  };

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

  // Получаем детальную информацию для выбранного ресурса
  const detailsData = getResourceDetails();

  return (
    <div className="status-container">
      <div className="win11-container">
        {/* Вертикальное меню с карточками ресурсов (слева) */}
        <div className="resources-panel">
          {/* CPU карточка */}
          <ResourceCard
            title="Процессор"
            usage={systemInfo.cpu.usage}
            graphData={cpuHistory}
            graphColor="#1E90FF"
            details={[
              { label: 'Модель', value: systemInfo.cpu.model_name || 'Неизвестно' },
              { label: 'Ядра/Потоки', value: `${systemInfo.cpu.cores} / ${systemInfo.cpu.threads}` },
              { label: 'Частота', value: `${systemInfo.cpu.frequency.toFixed(2)} ГГц` }
            ]}
            selected={selectedResource === 'cpu'}
            onClick={() => setSelectedResource('cpu')}
          />
          
          {/* Memory карточка */}
          <ResourceCard
            title="Память"
            usage={systemInfo.memory.usage_percentage}
            graphData={memoryHistory}
            graphColor="#9370DB"
            details={[
              { label: 'Всего', value: formatBytes(systemInfo.memory.total) },
              { label: 'Использовано', value: formatBytes(systemInfo.memory.used) },
              { label: 'Доступно', value: formatBytes(systemInfo.memory.available) }
            ]}
            selected={selectedResource === 'memory'}
            onClick={() => setSelectedResource('memory')}
          />
          
          {/* GPU карточка */}
          {systemInfo.gpu && (
            <ResourceCard
              title="Видеокарта"
              usage={systemInfo.gpu.usage}
              graphData={gpuHistory}
              graphColor="#32CD32"
              details={[
                { label: 'Модель', value: systemInfo.gpu.name || 'Неизвестно' },
                { label: 'Память', value: systemInfo.gpu.memory_total ? formatBytes(systemInfo.gpu.memory_total) : 'Неизвестно' },
                { label: 'Температура', value: systemInfo.gpu.temperature ? `${systemInfo.gpu.temperature.toFixed(1)}°C` : 'Неизвестно' }
              ]}
              selected={selectedResource === 'gpu'}
              onClick={() => setSelectedResource('gpu')}
            />
          )}
          
          {/* Disk карточка */}
          {systemInfo.disks && systemInfo.disks.length > 0 && (
            <ResourceCard
              title="Диски"
              // Берем среднее значение использования всех дисков
              usage={systemInfo.disks.reduce((sum, disk) => sum + disk.usage_percent, 0) / systemInfo.disks.length}
              graphData={diskHistory}
              graphColor="#FFA500"
              details={[
                { label: 'Всего дисков', value: systemInfo.disks.length.toString() },
                { label: 'Использовано', value: `${(systemInfo.disks.reduce((sum, disk) => sum + disk.usage_percent, 0) / systemInfo.disks.length).toFixed(1)}%` },
                { label: 'Всего пространства', value: formatBytes(systemInfo.disks.reduce((sum, disk) => sum + disk.total_space, 0)) }
              ]}
              selected={selectedResource === 'disk'}
              onClick={() => setSelectedResource('disk')}
            />
          )}
          
          {/* Network карточка */}
          {systemInfo.network && (
            <ResourceCard
              title="Сеть"
              usage={systemInfo.network.usage}
              graphData={networkHistory}
              graphColor="#20B2AA"
              details={[
                { label: 'Адаптер', value: systemInfo.network.adapter_name || 'Неизвестно' },
                { label: 'Загрузка', value: systemInfo.network.download_speed ? `${formatBytes(systemInfo.network.download_speed)}/с` : 'Неизвестно' },
                { label: 'Выгрузка', value: systemInfo.network.upload_speed ? `${formatBytes(systemInfo.network.upload_speed)}/с` : 'Неизвестно' }
              ]}
              selected={selectedResource === 'network'}
              onClick={() => setSelectedResource('network')}
            />
          )}
        </div>
        
        {/* Панель детальной информации (справа) */}
        <div className="detail-panel-container">
          {lastUpdate && (
            <div className="last-update">
              Обновлено: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
          
          {detailsData ? (
            <DetailPanel
              title={detailsData.title}
              subtitle={detailsData.subtitle}
              graphData={detailsData.graphData}
              graphColor={detailsData.graphColor}
              currentValue={detailsData.currentValue}
              unit={detailsData.unit}
              details={detailsData.details}
            />
          ) : (
            <div className="error-message">Нет данных для отображения</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusTab; 