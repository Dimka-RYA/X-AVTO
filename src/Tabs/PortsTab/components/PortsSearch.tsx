import React from 'react';
import { PortsSearchProps } from '../types';

/**
 * Компонент для поиска в списке портов
 */
export const PortsSearch: React.FC<PortsSearchProps> = ({
  searchTerm,
  onSearchChange,
  onRefresh,
  isRefreshing
}) => {
  return (
    <div className="search-container">
      <div className="search-wrapper">
        <input 
          type="text" 
          placeholder="Поиск..." 
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="search-input"
        />
        <button 
          className="refresh-button" 
          onClick={onRefresh} 
          disabled={isRefreshing}
          title="Обновить список"
        >
          ↻
        </button>
      </div>
    </div>
  );
}; 