import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { Activity, BarChart2, Network, Zap, X } from 'lucide-react';

import type { TabType } from '../App';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const MOBILE_TABS: { key: TabType; label: string; icon: React.FC<any> }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  { key: 'feed', label: 'Feed', icon: Activity },
  { key: 'topology', label: 'Topology', icon: Network },
  { key: 'chaos', label: 'Chaos', icon: Zap },
];

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [screenSize, setScreenSize] = React.useState<'mobile' | 'tablet' | 'desktop'>(() => {
    if (typeof window === 'undefined') return 'desktop';
    if (window.matchMedia('(max-width: 768px)').matches) return 'mobile';
    if (window.matchMedia('(max-width: 1024px)').matches) return 'tablet';
    return 'desktop';
  });

  React.useEffect(() => {
    const mobileMq = window.matchMedia('(max-width: 768px)');
    const tabletMq = window.matchMedia('(max-width: 1024px)');

    const handler = () => {
      if (mobileMq.matches) setScreenSize('mobile');
      else if (tabletMq.matches) setScreenSize('tablet');
      else setScreenSize('desktop');
    };

    mobileMq.addEventListener('change', handler);
    tabletMq.addEventListener('change', handler);
    return () => {
      mobileMq.removeEventListener('change', handler);
      tabletMq.removeEventListener('change', handler);
    };
  }, []);

  // Close mobile menu when switching away from mobile
  React.useEffect(() => {
    if (screenSize !== 'mobile') setMobileMenuOpen(false);
  }, [screenSize]);

  const isMobile = screenSize === 'mobile';
  const isTablet = screenSize === 'tablet';
  const effectiveCollapsed = isMobile || isTablet || isCollapsed;

  const handleTabChange = (tab: TabType) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className={`app-container ${effectiveCollapsed ? 'collapsed' : ''}`}>
      <Header onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
      {!isMobile && <Sidebar 
        activeTab={activeTab} 
        onTabChange={onTabChange} 
        isCollapsed={effectiveCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
      />}
      <main className="app-main">
        {children}
      </main>
      <nav className="mobile-bottom-nav">
        {MOBILE_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`mobile-nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={() => onTabChange(key)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-sidebar-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontWeight: 600, fontSize: '1rem' }}>Menu</span>
              <button className="btn btn-secondary" onClick={() => setMobileMenuOpen(false)} style={{ padding: '0.25rem 0.5rem' }}>
                <X size={18} />
              </button>
            </div>
            <Sidebar
              activeTab={activeTab}
              onTabChange={handleTabChange}
              isCollapsed={false}
              onToggle={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
