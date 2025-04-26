import React from 'react';
import { PortsSearchProps } from '../types';
import { Search } from 'lucide-react';

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
        <div className="search-input-wrapper">
          <Search className="search-icon" size={18} color="#e0e0e0" />
          <input 
            type="text" 
            placeholder="Поиск..." 
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input"
          />
        </div>
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