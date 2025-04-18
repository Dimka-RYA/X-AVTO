import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Minus, Square, X } from 'lucide-react';
import './TopBar.css';

export const TopBar: React.FC = () => {
  const handleMinimize = () => {
    invoke('minimize_window');
  };

  const handleMaximize = () => {
    invoke('toggle_maximize');
  };

  const handleClose = () => {
    invoke('close_window');
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="app-title">XAdmin</div>
      </div>
      <div className="topbar-right">
        <button className="window-control minimize" onClick={handleMinimize}>
          <Minus size={16} />
        </button>
        <button className="window-control maximize" onClick={handleMaximize}>
          <Square size={16} />
        </button>
        <button className="window-control close" onClick={handleClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
