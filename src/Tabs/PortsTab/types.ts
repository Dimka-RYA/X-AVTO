import React from 'react';

/**
 * Типы данных для компонента Ports и его дочерних компонентов
 */

/**
 * Интерфейс для данных о сетевом порте
 */
export interface Port {
  local_addr: string;
  protocol: string;
  state: string;
  foreign_addr: string;
  pid: string;
  name: string;
  path: string;
}

/**
 * Интерфейс для свойств ResizeableHeader компонента
 */
export interface ResizeableHeaderProps {
  children: React.ReactNode;
  width: number;
  onResize: (width: number) => void;
}

/**
 * Интерфейс для хранения ширины столбцов таблицы
 */
export interface ColumnWidths {
  local_addr: number;
  protocol: number;
  state: number;
  foreign_addr: number;
  pid: number;
  name: number;
  action: number;
}

/**
 * Свойства для компонента PortsTable
 */
export interface PortsTableProps {
  ports: Port[];
  searchTerm: string;
  closingPorts: Set<string>;
  onClosePort: (pid: string, portInfo?: { protocol: string, local_addr: string }, processName?: string) => Promise<void>;
  columnWidths: ColumnWidths;
  handleColumnResize: (column: keyof ColumnWidths, newWidth: number) => void;
}

/**
 * Свойства для компонента PortsList
 */
export interface PortsListProps {
  ports: Port[];
  closingPorts: Set<string>;
  onClosePort: (pid: string, portInfo?: { protocol: string, local_addr: string }, processName?: string) => Promise<void>;
  columnWidths: ColumnWidths;
}

/**
 * Свойства для компонента PortsSearch
 */
export interface PortsSearchProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
} 