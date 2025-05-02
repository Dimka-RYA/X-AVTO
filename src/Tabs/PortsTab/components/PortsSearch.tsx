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
    <div className="ports-search-container">
      <input
        type="text"
        placeholder="Поиск..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
        title="Введите текст для поиска"
      />
      <button
        className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`}
        onClick={onRefresh}
        disabled={isRefreshing}
        title="Обновить список портов"
      >
        {!isRefreshing ? 'Обновить' : '...'}
      </button>
    </div>
  );
}; 