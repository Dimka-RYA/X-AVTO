import React from 'react';
import '../StatusTab.css';
import StatusGraph from './StatusGraph';

interface DetailPanelProps {
  title: string;
  subtitle?: string;
  graphData: number[];
  graphColor: string;
  currentValue: number;
  unit: string;
  details: { label: string; value: string }[];
}

const DetailPanel: React.FC<DetailPanelProps> = ({
  title,
  subtitle,
  graphData,
  graphColor,
  currentValue,
  unit,
  details
}) => {
  // Группируем детали для лучшего отображения в две колонки
  const groupDetails = () => {
    // Увеличиваем количество колонок для отображения большего количества информации
    const columns = details.length > 10 ? 3 : 2;
    
    if (details.length <= 5) return [details]; // Если деталей мало, показываем в одной колонке
    
    const itemsPerColumn = Math.ceil(details.length / columns);
    const result = [];
    
    for (let i = 0; i < columns; i++) {
      result.push(details.slice(i * itemsPerColumn, (i + 1) * itemsPerColumn));
    }
    
    return result;
  };
  
  const detailGroups = groupDetails();
  
  return (
    <div className="detail-panel">
      <div className="detail-panel-header">
        <h3>{title} {subtitle && <span className="detail-panel-subtitle">({subtitle})</span>}</h3>
      </div>
      
      <div className="detail-panel-content">
        <div className="detail-panel-graph">
          <StatusGraph
            data={graphData}
            title={title}
            currentValue={currentValue}
            unit={unit}
            color={graphColor}
            maxValue={100}
          />
        </div>
        
        <div className="detail-panel-info">
          <div className="detail-info-header">Информация о системе</div>
          {detailGroups.length > 1 ? (
            <div className="detail-panel-columns">
              {detailGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="detail-panel-column">
                  {group.map((detail, index) => (
                    <div key={index} className="detail-panel-row">
                      <span className="detail-panel-label">{detail.label}</span>
                      <span className="detail-panel-value">{detail.value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            detailGroups[0].map((detail, index) => (
              <div key={index} className="detail-panel-row">
                <span className="detail-panel-label">{detail.label}</span>
                <span className="detail-panel-value">{detail.value}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DetailPanel; 