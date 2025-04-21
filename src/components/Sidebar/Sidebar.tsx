import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';
import { useTabContext } from '../../Tabs/TabContext';

function Sidebar() {
  const location = useLocation();
  const { activeTab, setActiveTab } = useTabContext();

  // Обработчик клика по элементу меню
  const handleTabClick = (tab: 'terminal' | 'status' | 'settings' | 'tools' | 'help') => {
    setActiveTab(tab);
  };

  // Проверка активности вкладки
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="sidebar">
      <Link 
        to="/terminal" 
        className={`sidebar-item ${isActive('/terminal') ? 'active' : ''}`}
        onClick={() => handleTabClick('terminal')}
      >
        <i className="fa fa-terminal"></i>
        <span>Терминал</span>
      </Link>
      <Link 
        to="/status" 
        className={`sidebar-item ${isActive('/status') ? 'active' : ''}`}
        onClick={() => handleTabClick('status')}
      >
        <i className="fa fa-chart-bar"></i>
        <span>Статус</span>
      </Link>
      <Link 
        to="/settings" 
        className={`sidebar-item ${isActive('/settings') ? 'active' : ''}`}
        onClick={() => handleTabClick('settings')}
      >
        <i className="fa fa-cog"></i>
        <span>Настройки</span>
      </Link>
      <Link 
        to="/tools" 
        className={`sidebar-item ${isActive('/tools') ? 'active' : ''}`}
        onClick={() => handleTabClick('tools')}
      >
        <i className="fa fa-wrench"></i>
        <span>Инструменты</span>
      </Link>
      <Link 
        to="/help" 
        className={`sidebar-item ${isActive('/help') ? 'active' : ''}`}
        onClick={() => handleTabClick('help')}
      >
        <i className="fa fa-question-circle"></i>
        <span>Помощь</span>
      </Link>
    </div>
  );
}

export default Sidebar; 