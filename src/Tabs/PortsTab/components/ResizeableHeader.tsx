import React, { useState, useRef, useEffect } from 'react';
import { ResizeableHeaderProps } from '../types';

/**
 * Компонент заголовка таблицы с возможностью изменения размера
 */
export const ResizeableHeader: React.FC<ResizeableHeaderProps> = ({ children, width, onResize }) => {
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = width;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = startWidth.current + (e.clientX - startX.current);
      if (newWidth > 50) { // Минимальная ширина столбца
        onResize(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onResize]);

  return (
    <th style={{ width: `${width}px` }}>
      <div className="resizeable-header">
        {children}
        <div 
          className="resize-handle"
          onMouseDown={handleMouseDown}
          title="Изменить ширину столбца"
        />
      </div>
    </th>
  );
}; 