import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Server, HardDrive, Activity, FileCode, Radio, Network } from 'lucide-react';

// Интерфейсы для типов системной информации (взяты из StatusTab)
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
  processes: number;
  system_threads: number;
  handles: number;
  model_name: string;
}

interface MemoryInfo {
  total: number;
  used: number;
  available: number;
  free: number;
  usage_percentage: number;
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

interface GPUInfo {
  name: string;
  usage: number;
  memory_total?: number;
  memory_used?: number;
}

interface NetworkInfo {
  usage: number;
  download_speed?: number;
  upload_speed?: number;
}

// Функция для форматирования байтов в читаемый вид
const formatBytes = (bytes: number, decimals = 1) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

export const Home = () => {
  const navigate = useNavigate();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Запрос данных о системе из Rust бэкенда
  useEffect(() => {
    let unlistenSystemInfo: (() => void) | null = null;

    async function loadSystemInfo() {
      try {
        // Включаем мониторинг системы
        await invoke('set_monitoring_active', { active: true });
        
        // Подписываемся на обновления системной информации
        unlistenSystemInfo = await listen('system-info-updated', (event) => {
          setSystemInfo(event.payload as SystemInfo);
          setLoading(false);
        });

        // Получаем начальные данные
        const initialData = await invoke('get_system_info');
        setSystemInfo(initialData as SystemInfo);
        setLoading(false);
      } catch (err) {
        console.error('Ошибка при получении системной информации:', err);
        setError('Не удалось получить информацию о системе');
        setLoading(false);
      }
    }

    loadSystemInfo();

    // Очистка при размонтировании
    return () => {
      if (unlistenSystemInfo) unlistenSystemInfo();
      
      // Отключаем мониторинг при размонтировании компонента
      invoke('set_monitoring_active', { active: false })
        .catch(console.error);
    };
  }, []);

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  // Отображение состояния загрузки
  if (loading) {
    return (
      <div className="home-container">
        <div className="loading-message">Загрузка информации о системе...</div>
      </div>
    );
  }

  // Отображение ошибки
  if (error) {
    return (
      <div className="home-container">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="home-header">
        <Server size={32} />
        <h1>Панель мониторинга</h1>
      </div>

      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-icon"><Activity size={24} /></div>
          <div className="stat-content">
            <div className="stat-title">Статус системы</div>
            <div className="stat-value active">Активен</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon"><Network size={24} /></div>
          <div className="stat-content">
            <div className="stat-title">Процессы</div>
            <div className="stat-value">{systemInfo?.cpu.processes || 0}</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon"><Radio size={24} /></div>
          <div className="stat-content">
            <div className="stat-title">Активные диски</div>
            <div className="stat-value">{systemInfo?.disks.length || 0}</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon"><FileCode size={24} /></div>
          <div className="stat-content">
            <div className="stat-title">Потоки</div>
            <div className="stat-value">{systemInfo?.cpu.system_threads || 0}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel">
          <div className="panel-header">
            <HardDrive size={20} />
            <h2>Инструменты</h2>
          </div>
          <div className="panel-content">
            <button className="action-btn" onClick={() => handleNavigation('/scripts')}>
              <FileCode size={18} />
              Управление скриптами
            </button>
            
            <button className="action-btn" onClick={() => handleNavigation('/ports')}>
              <Radio size={18} />
              Сканирование портов
            </button>
            
            <button className="action-btn" onClick={() => handleNavigation('/requests')}>
              <Network size={18} />
              HTTP Запросы
            </button>
            
            <button className="action-btn" onClick={() => handleNavigation('/status')}>
              <Activity size={18} />
              Детальный мониторинг
            </button>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-header">
            <Activity size={20} />
            <h2>Статус системы</h2>
          </div>
          <div className="panel-content system-status">
            <div className="status-item">
              <span className="status-label">CPU:</span>
              <div className="progress-bar">
                <div className="progress" style={{ width: `${systemInfo?.cpu.usage || 0}%` }}></div>
              </div>
              <span className="status-value">{systemInfo?.cpu.usage.toFixed(1) || 0}%</span>
            </div>
            
            <div className="status-item">
              <span className="status-label">Память:</span>
              <div className="progress-bar">
                <div className="progress" style={{ width: `${systemInfo?.memory.usage_percentage || 0}%` }}></div>
              </div>
              <span className="status-value">{systemInfo?.memory.usage_percentage.toFixed(1) || 0}%</span>
            </div>
            
            {systemInfo?.disks && systemInfo.disks.length > 0 && (
              <div className="status-item">
                <span className="status-label">Диск:</span>
                <div className="progress-bar">
                  <div className="progress" style={{ width: `${systemInfo.disks[0].usage_percent}%` }}></div>
                </div>
                <span className="status-value">{systemInfo.disks[0].usage_percent.toFixed(1)}%</span>
              </div>
            )}
            
            {systemInfo?.network && (
              <div className="status-item">
                <span className="status-label">Сеть:</span>
                <div className="download-speed">↓ {formatBytes(systemInfo.network.download_speed || 0)}/s</div>
                <div className="upload-speed">↑ {formatBytes(systemInfo.network.upload_speed || 0)}/s</div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {systemInfo && (
        <div className="system-details">
          <div className="system-info-section">
            <h3>Информация о системе</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Процессор:</span>
                <span className="info-value">{systemInfo.cpu.model_name || systemInfo.cpu.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Частота:</span>
                <span className="info-value">{systemInfo.cpu.frequency.toFixed(2)} ГГц</span>
              </div>
              <div className="info-item">
                <span className="info-label">Ядра/Потоки:</span>
                <span className="info-value">{systemInfo.cpu.cores} / {systemInfo.cpu.threads}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Память:</span>
                <span className="info-value">{formatBytes(systemInfo.memory.total)} ({formatBytes(systemInfo.memory.used)} используется)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};