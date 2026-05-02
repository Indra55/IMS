import React, { useEffect, useState } from 'react';
import { Clock, ShieldAlert, CheckCircle, Search, RefreshCw } from 'lucide-react';
import IncidentDetail from '../components/IncidentDetail';

export interface WorkItem {
  id: string;
  component_id: string;
  state: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  signal_count: number;
  created_at: string;
  updated_at: string;
}

const PRIORITY_COLORS = {
  P0: 'var(--status-p0)',
  P1: 'var(--status-p1)',
  P2: 'var(--status-p2)',
  P3: 'var(--status-p3)',
};

const STATE_COLORS = {
  OPEN: 'var(--status-p0)',
  INVESTIGATING: 'var(--status-p2)',
  RESOLVED: 'var(--accent-primary)',
  CLOSED: 'var(--status-success)',
};

const LiveFeed: React.FC = () => {
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkItems = async () => {
    try {
      // In ip.md it mentions /api/dashboard for aggregations, but /api/work-items for CRUD
      const res = await fetch('http://localhost:5555/api/work-items');
      if (res.ok) {
        const json = await res.json();
        setWorkItems(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch work items', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkItems();
    // Poll every 5s to keep dashboard fresh
    const int = setInterval(fetchWorkItems, 5000);
    return () => clearInterval(int);
  }, []);

  const selectedItem = workItems.find(w => w.id === selectedId);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* List Pane */}
      <div style={{ width: '40%', minWidth: '350px', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.125rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={18} /> Active Incidents
          </h2>
          <button onClick={fetchWorkItems} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        
        <div style={{ overflowY: 'auto', flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading && workItems.length === 0 ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="glass-panel" style={{ padding: '1rem', opacity: 1 - i * 0.2 }}>
                <div style={{ height: '20px', width: '60px', background: 'var(--border-subtle)', borderRadius: '4px', marginBottom: '0.5rem' }} />
                <div style={{ height: '16px', width: '120px', background: 'var(--border-subtle)', borderRadius: '4px', marginBottom: '0.25rem' }} />
                <div style={{ height: '14px', width: '80%', background: 'var(--border-subtle)', borderRadius: '4px', marginBottom: '0.75rem' }} />
                <div style={{ height: '12px', width: '40px', background: 'var(--border-subtle)', borderRadius: '4px' }} />
              </div>
            ))
          ) : workItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>
              <CheckCircle size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
              No active incidents.
            </div>
          ) : (
            workItems.map(item => (
              <div 
                key={item.id} 
                className={`glass-panel ${selectedId === item.id ? 'glass-panel-solid' : ''}`}
                style={{ 
                  padding: '1rem', 
                  cursor: 'pointer', 
                  borderColor: selectedId === item.id ? 'var(--border-focus)' : 'var(--border-subtle)',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => setSelectedId(item.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 600, 
                    padding: '0.125rem 0.375rem', 
                    borderRadius: 'var(--radius-sm)',
                    background: `rgba(${PRIORITY_COLORS[item.priority].replace(/var\(--status-p(\d)\)/, '$1')}, 0.15)`, 
                    color: PRIORITY_COLORS[item.priority],
                    border: `1px solid ${PRIORITY_COLORS[item.priority]}`
                  }}>
                    {item.priority}
                  </span>
                  <span style={{ 
                    fontSize: '0.75rem',
                    color: STATE_COLORS[item.state]
                  }}>
                    {item.state}
                  </span>
                </div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{item.component_id}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.title}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.125rem 0.375rem', borderRadius: '1rem', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {item.signal_count} signals
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={12} />
                    {new Date(item.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail Pane */}
      <div style={{ flex: 1, backgroundColor: 'rgba(15, 17, 26, 0.3)', overflowY: 'auto' }}>
        {selectedItem ? (
          <IncidentDetail item={selectedItem} onRefresh={fetchWorkItems} />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Search size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <p>Select an incident to view details and start RCA.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveFeed;
