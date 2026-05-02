import React, { useState } from 'react';
import { Database, Server, HardDrive, AlertTriangle } from 'lucide-react';
import { API_BASE } from '../config';

const ChaosSimulator: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const triggerChaos = async (type: string, url: string, payload: any) => {
    setLoading(type);
    setResult(null);
    setSuccess(null);
    try {
      const burstSize = type === 'rdbms' ? 50 : type === 'api' ? 150 : 20;
      
      for (let i = 0; i < burstSize; i++) {
        fetch(`${API_BASE}/api/signals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signal_id: crypto.randomUUID(),
            component_id: payload.component_id,
            component_type: payload.component_type,
            severity: payload.severity,
            message: `${payload.message} (attempt #${i})`,
            timestamp: new Date().toISOString()
          })
        }).catch(() => {});
      }
      
      await new Promise(r => setTimeout(r, 1000));
      setSuccess(type);
      setResult(`Successfully triggered ${burstSize} failure signals for ${payload.component_id}. Check the Live Feed.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setResult('Failed to trigger chaos.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <AlertTriangle color="var(--status-p1)" />
          Chaos Engineering Simulator
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Actively test the resilience of the IMS backend by injecting catastrophic failures into the system. 
          This will trigger high-volume signal bursts, triggering the Ring Buffer backpressure and 10s Debouncer logic.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {/* RDBMS Chaos */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <Database size={20} color="var(--status-p0)" />
                Crash Primary Database (PostgreSQL)
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Simulates a connection pool exhaustion, dropping all queries and sending a P0 Critical burst.
              </p>
            </div>
            <button 
              onClick={() => triggerChaos('rdbms', '', {
                component_id: 'PG_PROD_01',
                component_type: 'RDBMS',
                severity: 'CRITICAL',
                message: 'Connection timeout error (Pool exhausted)'
              })}
              disabled={loading !== null || success === 'rdbms'}
              className="btn btn-danger"
            >
              {loading === 'rdbms' ? 'Injecting...' : success === 'rdbms' ? '✓ Injected!' : 'Inject RDBMS Failure'}
            </button>
          </div>
        </div>

        {/* API Gateway Chaos */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <Server size={20} color="var(--status-p1)" />
                Spike API Gateway Latency
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Simulates upstream 504 timeouts cascading across the microservices layer. Sends a P1 High burst.
              </p>
            </div>
            <button 
              onClick={() => triggerChaos('api', '', {
                component_id: 'API_GW_US_EAST',
                component_type: 'API',
                severity: 'HIGH',
                message: '504 Gateway Timeout while contacting upstream.'
              })}
              disabled={loading !== null || success === 'api'}
              className="btn"
              style={{ background: 'var(--status-p1-bg)', color: 'var(--status-p1)', borderColor: 'rgba(249,115,22,0.3)' }}
            >
              {loading === 'api' ? 'Injecting...' : success === 'api' ? '✓ Injected!' : 'Inject API Failure'}
            </button>
          </div>
        </div>

        {/* Redis Cache Chaos */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <HardDrive size={20} color="var(--status-p2)" />
                Max Out Redis Cache Memory
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Simulates an OOM error on the cache layer. Sends a P2 Medium burst.
              </p>
            </div>
            <button 
              onClick={() => triggerChaos('cache', '', {
                component_id: 'REDIS_CLUSTER_1',
                component_type: 'CACHE',
                severity: 'MEDIUM',
                message: "OOM command not allowed when used memory > 'maxmemory'."
              })}
              disabled={loading !== null || success === 'cache'}
              className="btn"
              style={{ background: 'var(--status-p2-bg)', color: 'var(--status-p2)', borderColor: 'rgba(234,179,8,0.3)' }}
            >
              {loading === 'cache' ? 'Injecting...' : success === 'cache' ? '✓ Injected!' : 'Inject Cache Failure'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-success)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          {result}
        </div>
      )}
    </div>
  );
};

export default ChaosSimulator;
