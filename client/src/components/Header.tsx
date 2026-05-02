import React from 'react';
import { ServerCrash } from 'lucide-react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

const Header: React.FC = () => {
  const { isConnected, metrics } = useWebSocket();

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)' }}>
          <ServerCrash size={24} />
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>NOC <span style={{ color: 'var(--text-secondary)' }}>/ IMS Dashboard</span></h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '2rem' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isConnected ? 'var(--status-success)' : 'var(--status-p0)' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {isConnected ? 'System Connected' : 'Connection Lost'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Live Ingestion Rate
          </span>
          <span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Outfit' }}>
            {metrics[metrics.length - 1]?.throughput || 0} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>sig/s</span>
          </span>
        </div>
        
        <div style={{ width: '120px', height: '40px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics}>
              <YAxis domain={[0, 'dataMax + 10']} hide />
              <Line 
                type="monotone" 
                dataKey="throughput" 
                stroke="var(--accent-primary)" 
                strokeWidth={2} 
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </header>
  );
};

export default Header;
