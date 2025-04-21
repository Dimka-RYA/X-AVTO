// Импортируем необходимые модули
import React, { createContext, useState, useContext, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Типы вкладок
export type TabType = 'terminal' | 'status' | 'settings' | 'tools' | 'help';

// Интерфейс контекста вкладок
interface TabContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

// Создаем контекст
const TabContext = createContext<TabContextType | undefined>(undefined);

// Провайдер контекста
export function TabProvider({ children }: { children: React.ReactNode }) {
  // Состояние активной вкладки
  const [activeTab, setActiveTab] = useState<TabType>('terminal');

  // Эффект для управления мониторингом при изменении активной вкладки
  useEffect(() => {
    async function updateMonitoringStatus() {
      try {
        // Активируем мониторинг только для вкладки status
        const isMonitoringActive = activeTab === 'status';
        await invoke('set_monitoring_active', { active: isMonitoringActive });
        console.log(`Мониторинг ${isMonitoringActive ? 'активирован' : 'деактивирован'} для вкладки ${activeTab}`);
      } catch (err) {
        console.error('Ошибка при обновлении статуса мониторинга:', err);
      }
    }

    updateMonitoringStatus();
  }, [activeTab]);

  return (
    <TabContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabContext.Provider>
  );
}

// Хук для использования контекста вкладок
export function useTabContext() {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabContext must be used within a TabProvider');
  }
  return context;
} 