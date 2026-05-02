import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

import type { TabType } from '../App';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <div className={`app-container ${isCollapsed ? 'collapsed' : ''}`}>
      <Header />
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={onTabChange} 
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
      />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
};

export default Layout;
