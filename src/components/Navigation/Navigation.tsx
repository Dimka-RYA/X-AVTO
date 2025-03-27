import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { routes } from '../../routes';
import './Navigation.css';

export const Navigation = () => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const [navWidth, setNavWidth] = useState(80);
  const resizeRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  
  // Обработка ресайза навигационной панели
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // При перетаскивании определяем, к какому состоянию быть ближе
      if (e.clientX < 150) {
        setCollapsed(true);
        setNavWidth(80);
      } else {
        setCollapsed(false);
        setNavWidth(250);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Функция для рендеринга иконки (текстовой или SVG)
  const renderIcon = (route: typeof routes[0]) => {
    if (route.svgIcon) {
      const SvgIcon = route.svgIcon;
      return <SvgIcon className="svg-icon" />;
    }
    return <span className="icon">{route.icon}</span>;
  };

  return (
    <nav 
      ref={navRef} 
      className={collapsed ? 'collapsed' : ''} 
      style={{ width: `${navWidth}px` }}
    >
      <ul>
        {routes.map((route) => (
          <li key={route.path}>
            <Link 
              to={route.path} 
              className={location.pathname === route.path ? 'active' : ''}
              title={route.name}
            >
              {renderIcon(route)}
              <span className="text">{route.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      
      <div 
        ref={resizeRef} 
        className="resize-handle" 
        onMouseDown={handleMouseDown}
      />
    </nav>
  );
};