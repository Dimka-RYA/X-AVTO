import React from 'react';
import '../StatusTab.css';
import StatusGraph from './StatusGraph';
import { CircularIndicator } from '../StatusTab';

interface ResourceCardProps {
  title: string;
  icon?: string;
  usage: number;
  graphData: number[];
  details: { label: string; value: string }[];
  graphColor: string;
  selected: boolean;
  onClick: () => void;
  showGraph?: boolean;
}

const ResourceCard: React.FC<ResourceCardProps> = ({
  title,
  icon,
  usage,
  graphData,
  details,
  graphColor,
  selected,
  onClick,
  showGraph = true
}) => {
  const getColorForPercentage = (percentage: number): string => {
    if (percentage < 60) return '#4caf50'; // зеленый
    if (percentage < 80) return '#ff9800'; // оранжевый
    return '#f44336'; // красный
  };

  // Используем иконки Lucide (через SVG)
  const getLucideIcon = () => {
    // SVG иконки из Lucide
    switch (title.toLowerCase()) {
      case 'процессор':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M15 2v2" />
            <path d="M15 20v2" />
            <path d="M2 15h2" />
            <path d="M2 9h2" />
            <path d="M20 15h2" />
            <path d="M20 9h2" />
            <path d="M9 2v2" />
            <path d="M9 20v2" />
          </svg>
        );
      case 'память':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 19v-3" />
            <path d="M10 19v-3" />
            <path d="M14 19v-3" />
            <path d="M18 19v-3" />
            <path d="M8 11V9" />
            <path d="M16 11V9" />
            <path d="M12 11V9" />
            <path d="M2 15h20" />
            <path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
          </svg>
        );
      case 'видеокарта':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18h8" />
            <path d="M3 7h7" />
            <path d="M19 7h2" />
            <path d="M5 7v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1z" />
            <path d="M9 11a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
          </svg>
        );
      case 'диски':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            <path d="M6 16h.01" />
            <path d="M10 16h.01" />
          </svg>
        );
      case 'сеть':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 20a6 6 0 0 0-12 0" />
            <circle cx="12" cy="10" r="1" />
            <path d="M8 16a5 5 0 0 1 8 0" />
            <path d="M16 12a9 9 0 0 0-16 0" />
            <path d="M20 8a13 13 0 0 0-20 0" />
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 2 18 24" />
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <path d="M9 18h6" />
          </svg>
        );
    }
  };

  return (
    <div 
      className={`resource-card ${selected ? 'resource-card-selected' : ''}`}
      onClick={onClick}
    >
      <div className="resource-card-header">
        <span className="resource-card-icon">{icon || getLucideIcon()}</span>
        <span className="resource-card-title">{title}</span>
        <div className="resource-card-usage">
          <CircularIndicator
            value={usage}
            radius={18}
            strokeWidth={3}
            color={getColorForPercentage(usage)}
            text={`${Math.round(usage)}%`}
          />
        </div>
      </div>
      
      {showGraph && graphData.length > 0 && selected && (
        <div className="resource-card-graph">
          <StatusGraph
            data={graphData}
            title=""
            currentValue={usage}
            unit="%"
            color={graphColor}
          />
        </div>
      )}
      
      {/* Показываем только базовые детали если карточка не выбрана */}
      <div className="resource-card-details">
        {details.slice(0, selected ? details.length : 1).map((detail, index) => (
          <div key={index} className="resource-card-detail-row">
            <span className="resource-card-detail-label">{detail.label}</span>
            <span className="resource-card-detail-value">{detail.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResourceCard; 