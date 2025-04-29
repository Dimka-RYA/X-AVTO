import React from 'react';
import { ProcessorInfo } from '../../../interfaces/system';
import { CircularIndicator } from '../../../components/UI';
import { getColorForPercentage, getColorForTemperature } from '../../../utils/formatters';

interface CPUInfoProps {
  /** Информация о процессоре */
  cpuInfo: ProcessorInfo;
}

/**
 * Компонент для отображения информации о процессоре
 */
const CPUInfo: React.FC<CPUInfoProps> = ({ cpuInfo }) => {
  return (
    <div className="system-info-card cpu-info">
      <h3>Информация о процессоре</h3>
      
      <div className="indicators-row">
        {/* Индикатор использования ЦП */}
        <CircularIndicator
          value={cpuInfo.usage}
          color={getColorForPercentage(cpuInfo.usage)}
          text={`${cpuInfo.usage.toFixed(1)}%`}
          label="Использование"
        />
        
        {/* Индикатор температуры ЦП (если доступен) */}
        {cpuInfo.temperature !== undefined && (
          <CircularIndicator
            value={cpuInfo.temperature}
            maxValue={100}
            color={getColorForTemperature(cpuInfo.temperature)}
            text={`${cpuInfo.temperature.toFixed(1)}°C`}
            label="Температура"
          />
        )}
        
        {/* Индикатор частоты ЦП */}
        <CircularIndicator
          value={cpuInfo.frequency}
          maxValue={cpuInfo.max_frequency}
          color={getColorForPercentage((cpuInfo.frequency / cpuInfo.max_frequency) * 100)}
          text={`${cpuInfo.frequency.toFixed(2)} ГГц`}
          label="Частота"
        />
      </div>
      
      <div className="info-grid">
        <div className="info-row">
          <span className="info-label">Название:</span>
          <span className="info-value">{cpuInfo.model_name || cpuInfo.name}</span>
        </div>
        
        <div className="info-row">
          <span className="info-label">Архитектура:</span>
          <span className="info-value">{cpuInfo.architecture}</span>
        </div>
        
        <div className="info-row">
          <span className="info-label">Ядра/Потоки:</span>
          <span className="info-value">{cpuInfo.cores} / {cpuInfo.threads}</span>
        </div>
        
        <div className="info-row">
          <span className="info-label">Базовая частота:</span>
          <span className="info-value">{cpuInfo.base_frequency} ГГц</span>
        </div>
        
        <div className="info-row">
          <span className="info-label">Макс. частота:</span>
          <span className="info-value">{cpuInfo.max_frequency} ГГц</span>
        </div>
        
        <div className="info-row">
          <span className="info-label">Кэш:</span>
          <span className="info-value">{cpuInfo.cache_size}</span>
        </div>
        
        <div className="info-row">
          <span className="info-label">Процессы:</span>
          <span className="info-value">{cpuInfo.processes}</span>
        </div>
        
        <div className="info-row">
          <span className="info-label">Потоки в системе:</span>
          <span className="info-value">{cpuInfo.system_threads}</span>
        </div>
      </div>
    </div>
  );
};

export default CPUInfo; 