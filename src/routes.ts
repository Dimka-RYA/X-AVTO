import React from 'react';

// Тип для маршрутов, где иконка может быть либо строкой, либо SVG компонентом
export interface Route {
  path: string;
  name: string;
  icon?: string; // Для текстовых иконок (эмодзи)
  svgIcon?: React.FC<React.SVGProps<SVGSVGElement>>; // Для SVG иконок
}

export const routes: Route[] = [
  { path: '/', name: 'Главная', icon: '🏠' },
  { path: '/requests', name: 'Запросы', icon: '📋' },
  { path: '/ports', name: 'Порты', icon: '🔌' },
  { path: '/scripts', name: 'Скрипты', icon: '📜' },
  { path: '/state', name: 'Состояние', icon: '📊' },
  { path: '/terminal', name: 'Терминал', icon: '💻' }
];

// Пример использования SVG иконки:
// import { ReactComponent as HomeIcon } from './assets/icons/home.svg';
// { path: '/', name: 'Главная', svgIcon: HomeIcon }