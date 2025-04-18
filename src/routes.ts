import React from 'react';
import { Home, EthernetPort, Scroll, AudioLines, Radio, SquareTerminal } from 'lucide-react';

// Тип для маршрутов, где иконка может быть либо строкой, либо SVG компонентом
export interface Route {
  path: string;
  name: string;
  icon?: string; // Для текстовых иконок (эмодзи)
  svgIcon?: React.ComponentType<any>; // Для Lucide иконок
}

export const routes: Route[] = [
  { path: '/', name: 'Главная', svgIcon: Home },
  { path: '/requests', name: 'Запросы', svgIcon: Radio },
  { path: '/ports', name: 'Порты', svgIcon: SquareTerminal },
  { path: '/scripts', name: 'Скрипты', svgIcon: EthernetPort },
  { path: '/state', name: 'Состояние', svgIcon: Scroll },
  { path: '/terminal', name: 'Терминал', svgIcon: AudioLines }
];