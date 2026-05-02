import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from 'recharts';
import { Activity, Clock, ShieldAlert, CheckCircle, Zap, Server, Brain } from 'lucide-react';
import { API_BASE } from '../config';

const COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6'
};

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const generateAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/ai-summary`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        setAiSummary(json.data);
      } else {
        setAiError(json.error || 'Failed to generate summary');
      }
    } catch (err) {
      setAiError('Network error connecting to AI endpoint.');
    } finally {
      setAiLoading(false);
    }
  };

  const [prevWorkItemCount, setPrevWorkItemCount] = useState<number | null>(null);

  useEffect(() => {
    if (summary && typeof summary.total_work_items === 'number') {
      if (prevWorkItemCount === null) {
        setPrevWorkItemCount(summary.total_work_items);
        generateAiSummary(); // Initial load trigger
      } else if (summary.total_work_items > prevWorkItemCount) {
        setPrevWorkItemCount(summary.total_work_items);
        generateAiSummary(); // Trigger on new incident
      } else if (summary.total_work_items < prevWorkItemCount) {
        setPrevWorkItemCount(summary.total_work_items);
      }
    }
  }, [summary?.total_work_items]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sumRes, tsRes] = await Promise.all([
          fetch(`${API_BASE}/api/dashboard/summary`),
          fetch(`${API_BASE}/api/dashboard/timeseries?interval=5m&range=6h`)
        ]);
        
        if (sumRes.ok) {
          const json = await sumRes.json();
          setSummary(json.data);
        }
        if (tsRes.ok) {
          const json = await tsRes.json();
          setTimeseries(json.data.map((d: any) => ({
            ...d,
            timeLabel: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          })));
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const int = setInterval(fetchData, 10000); // refresh every 10s
    return () => clearInterval(int);
  }, []);

  if (loading && !summary) {
    return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading metrics...</div>;
  }

  const formatMTTR = (seconds: number | null) => {
    if (seconds === null) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m ${seconds % 60}s`;
  };

  const priorityData = summary ? [
    { name: 'P0', value: summary.priority_counts.P0, color: 'var(--status-p0)' },
    { name: 'P1', value: summary.priority_counts.P1, color: 'var(--status-p1)' },
    { name: 'P2', value: summary.priority_counts.P2, color: 'var(--status-p2)' },
    { name: 'P3', value: summary.priority_counts.P3, color: 'var(--status-p3)' },
  ].filter(d => d.value > 0) : [];

  return (
    <div style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Global Overview</h2>
      
      {/* Top Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={16} /> Total Work Items
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{summary?.total_work_items || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={16} color="var(--status-p0)" /> Active (Open)
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--status-p0)' }}>{summary?.state_counts.OPEN || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={16} color="var(--status-success)" /> Resolved/Closed
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--status-success)' }}>
            {(summary?.state_counts.RESOLVED || 0) + (summary?.state_counts.CLOSED || 0)}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={16} color="#fbbf24" /> Avg MTTA
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
            {formatMTTR(summary?.avg_mtta_seconds)}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} /> Avg MTTR
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
            {formatMTTR(summary?.avg_mttr_seconds)}
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', height: '400px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Signal Volume (Last 6 Hours)</h3>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-panel-solid)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Bar dataKey="severities.CRITICAL" name="Critical" stackId="a" fill={COLORS.CRITICAL} />
                <Bar dataKey="severities.HIGH" name="High" stackId="a" fill={COLORS.HIGH} />
                <Bar dataKey="severities.MEDIUM" name="Medium" stackId="a" fill={COLORS.MEDIUM} />
                <Bar dataKey="severities.LOW" name="Low" stackId="a" fill={COLORS.LOW} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', height: '400px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Incidents by Priority</h3>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {priorityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-panel-solid)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Components List */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Server size={18} /> Top Failing Components
        </h3>
        {summary?.top_components && summary.top_components.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {summary.top_components.map((comp: any) => (
              <div key={comp.component_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{comp.component_id}</span>
                <span style={{ color: 'var(--status-p0)', fontWeight: 'bold' }}>{comp.count} Incidents</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>No failing components detected.</div>
        )}
      </div>

      {/* AI Executive Summary */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <Brain size={18} /> AI Executive Summary
          </h3>
          <button 
            onClick={generateAiSummary} 
            disabled={aiLoading} 
            className="btn"
            style={{ opacity: aiLoading ? 0.7 : 1 }}
          >
            {aiLoading ? 'Analyzing...' : 'Refresh Summary'}
          </button>
        </div>
        {aiError && <div style={{ color: 'var(--status-p0)', marginBottom: '1rem', fontSize: '0.875rem' }}>{aiError}</div>}
        <div style={{ color: 'var(--text-primary)', lineHeight: 1.6, minHeight: '60px' }}>
          {aiSummary ? (
            <p style={{ margin: 0 }}>{aiSummary}</p>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Click generate to analyze current system health.</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
