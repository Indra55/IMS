import React from 'react';
import { Activity, Zap, BarChart2, Network, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TabType } from '../App';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, isCollapsed, onToggle }) => {
  return (
    <aside className="app-sidebar" style={{ padding: '1rem', position: 'relative' }}>
      <button 
        onClick={onToggle}
        className="sidebar-toggle"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          onClick={() => onTabChange('dashboard')}
          className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ 
            justifyContent: isCollapsed ? 'center' : 'flex-start', 
            padding: '0.75rem 1rem',
            width: '100%'
          }}
          title={isCollapsed ? "Global Dashboard" : ""}
        >
          <BarChart2 size={18} style={{ flexShrink: 0 }} />
          {!isCollapsed && <span className="sidebar-label">Global Dashboard</span>}
        </button>
        <button
          onClick={() => onTabChange('feed')}
          className={`btn ${activeTab === 'feed' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ 
            justifyContent: isCollapsed ? 'center' : 'flex-start', 
            padding: '0.75rem 1rem',
            width: '100%'
          }}
          title={isCollapsed ? "Live Feed" : ""}
        >
          <Activity size={18} style={{ flexShrink: 0 }} />
          {!isCollapsed && <span className="sidebar-label">Live Feed</span>}
        </button>
        <button
          onClick={() => onTabChange('topology')}
          className={`btn ${activeTab === 'topology' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ 
            justifyContent: isCollapsed ? 'center' : 'flex-start', 
            padding: '0.75rem 1rem',
            width: '100%'
          }}
          title={isCollapsed ? "Topology Map" : ""}
        >
          <Network size={18} style={{ flexShrink: 0 }} />
          {!isCollapsed && <span className="sidebar-label">Topology Map</span>}
        </button>
        <button
          onClick={() => onTabChange('chaos')}
          className={`btn ${activeTab === 'chaos' ? 'btn-danger' : 'btn-secondary'}`}
          style={{ 
            justifyContent: isCollapsed ? 'center' : 'flex-start', 
            padding: '0.75rem 1rem', 
            marginTop: isCollapsed ? '0.5rem' : '1rem',
            width: '100%'
          }}
          title={isCollapsed ? "Chaos Simulator" : ""}
        >
          <Zap size={18} style={{ flexShrink: 0 }} />
          {!isCollapsed && <span className="sidebar-label">Chaos Simulator</span>}
        </button>
      </nav>
      
      <div className="sidebar-footer-text" style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: isCollapsed ? 'center' : 'left' }}>
        {isCollapsed ? 'v2' : 'IMS Dashboard v2.0.0'}
      </div>
    </aside>
  );
};

export default Sidebar;
