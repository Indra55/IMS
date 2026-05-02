import { useState, useEffect } from 'react';
import { WS_URL } from './config';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LiveFeed from './pages/LiveFeed';
import TopologyMap from './pages/TopologyMap';
import ChaosSimulator from './pages/ChaosSimulator';
import { WebSocketProvider, useWebSocket } from './contexts/WebSocketContext';
import { AlertTriangle, X } from 'lucide-react';

export type TabType = 'dashboard' | 'feed' | 'topology' | 'chaos';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const { lastEvent } = useWebSocket();
  const [toast, setToast] = useState<{ message: string; priority: string } | null>(null);

  useEffect(() => {
    if (lastEvent?.event === 'work-item:created') {
      const { priority, component_id } = lastEvent.payload;
      if (priority === 'P0' || priority === 'P1') {
        setToast({ message: `New ${priority} Incident on ${component_id}!`, priority });
        const timer = setTimeout(() => setToast(null), 10000);
        return () => clearTimeout(timer);
      }
    }
  }, [lastEvent]);

  return (
    <>
      <Layout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'feed' && <LiveFeed />}
        {activeTab === 'topology' && <TopologyMap />}
        {activeTab === 'chaos' && <ChaosSimulator />}
      </Layout>
      
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: toast.priority === 'P0' ? 'var(--status-p0-bg)' : 'var(--status-p1-bg)',
          color: toast.priority === 'P0' ? 'var(--status-p0)' : 'var(--status-p1)',
          border: `1px solid ${toast.priority === 'P0' ? 'var(--status-p0)' : 'var(--status-p1)'}`,
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          zIndex: 9999,
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertTriangle size={20} />
            <span style={{ fontWeight: 600 }}>{toast.message}</span>
          </div>
          <button 
            onClick={() => setToast(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              marginLeft: '1rem',
              opacity: 0.7
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <WebSocketProvider url={WS_URL}>
      <AppContent />
    </WebSocketProvider>
  );
}

export default App;
