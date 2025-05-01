import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  ChartOptions
} from 'chart.js';
import '../StatusTab.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

interface StatusGraphProps {
  data: number[];
  title: string;
  currentValue: number;
  unit: string;
  color: string;
  maxValue?: number;
}

const StatusGraph: React.FC<StatusGraphProps> = ({
  data,
  title,
  currentValue,
  unit,
  color,
  maxValue = 100
}) => {
  // Create labels (time points) for the x-axis
  const labels = Array.from({ length: data.length }, (_, i) => ``);
  
  // Extract RGB values from color string for gradient
  const getRGBA = (opacity: number) => {
    let r = 0, g = 0, b = 0;
    
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else if (color.startsWith('rgb')) {
      const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        [, r, g, b] = rgbMatch.map(Number);
      }
    }
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };
  
  // Prepare chart data
  const chartData = {
    labels,
    datasets: [
      {
        label: title,
        data: data,
        borderColor: color,
        backgroundColor: getRGBA(0.2),
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2,
      },
    ],
  };
  
  // Chart options
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: '#1e1e1e',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#333',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: false,
        suggestedMin: 0,
        suggestedMax: maxValue,
      },
    },
    animation: {
      duration: 800,
    },
    elements: {
      line: {
        cubicInterpolationMode: 'monotone',
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };

  return (
    <div className="status-graph-container">
      <div className="status-graph-header">
        <span className="status-graph-title">{title}</span>
        <span className="status-graph-value" style={{ color }}>
          {currentValue}{unit}
        </span>
      </div>
      
      <div className="status-chart">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default StatusGraph; 