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

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize]);

  return (
    <th style={{ width: `${width}px` }}>
      {children}
      <div 
        className="resize-handle"
        onMouseDown={handleMouseDown}
      />
    </th>
  );
}; 