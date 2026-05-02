import React, { useState, useEffect } from 'react';
import type { WorkItem } from '../pages/LiveFeed';
import { Brain, Save, CheckCircle, AlertCircle, FileText, Terminal, Clock, Search, Wrench } from 'lucide-react';
import { API_BASE } from '../config';

interface Props {
  item: WorkItem;
  onRefresh: () => void;
}

interface RcaFormData {
  incident_start: string;
  incident_end: string;
  root_cause_category: string;
  fix_applied: string;
  prevention_steps: string;
}

function toDateTimeLocalValue(value: string | Date | undefined): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoStringFromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

const IncidentDetail: React.FC<Props> = ({ item, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'rca' | 'logs' | 'timeline'>('rca');
  
  // RCA State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [formData, setFormData] = useState<RcaFormData>(() => {
    const defaults: RcaFormData = {
      incident_start: toDateTimeLocalValue(item.created_at),
      incident_end: toDateTimeLocalValue(item.resolved_at || new Date()),
      root_cause_category: 'UNKNOWN',
      fix_applied: '',
      prevention_steps: ''
    };

    const saved = localStorage.getItem(`rca_draft_${item.id}`);
    if (saved) {
      try {
        return { ...defaults, ...JSON.parse(saved) };
      } catch (e) {}
    }

    return defaults;
  });

  useEffect(() => {
    localStorage.setItem(`rca_draft_${item.id}`, JSON.stringify(formData));
  }, [formData, item.id]);

  // Fetch RCA if already closed
  useEffect(() => {
    if (item.state === 'CLOSED') {
      const fetchRca = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/work-items/${item.id}/rca`);
          if (res.ok) {
            const json = await res.json();
            if (json.data) {
              setFormData({
                incident_start: toDateTimeLocalValue(json.data.incident_start),
                incident_end: toDateTimeLocalValue(json.data.incident_end),
                root_cause_category: json.data.root_cause_category || 'UNKNOWN',
                fix_applied: json.data.fix_applied || '',
                prevention_steps: json.data.prevention_steps || ''
              });
            }
          }
        } catch (err) {
          console.error('Failed to fetch RCA', err);
        }
      };
      fetchRca();
    }
  }, [item.id, item.state]);

  // Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (activeTab === 'logs') {
      const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
          const res = await fetch(`${API_BASE}/api/work-items/${item.id}/signals`);
          if (res.ok) {
            const json = await res.json();
            setLogs(json.signals || []);
          }
        } catch (err) {
          console.error('Failed to fetch logs', err);
        } finally {
          setLoadingLogs(false);
        }
      };
      fetchLogs();
    }
  }, [activeTab, item.id]);

  const generateDraft = async () => {
    setIsGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/work-items/${item.id}/rca/draft`, {
        method: 'POST'
      });
      const json = await res.json();
      if (res.ok) {
        let normalizedCat = 'UNKNOWN';
        if (typeof json.data.root_cause_category === 'string') {
          const upper = json.data.root_cause_category.toUpperCase().replace(/\s+/g, '_');
          // Basic check to see if it matches our allowed UI options, else fallback to UNKNOWN
          const validOptions = ['INFRASTRUCTURE', 'APPLICATION', 'NETWORK', 'DATABASE', 'CACHE', 'UNKNOWN'];
          normalizedCat = validOptions.includes(upper) ? upper : 'UNKNOWN';
        }

        setFormData(prev => ({
          ...prev,
          root_cause_category: normalizedCat,
          fix_applied: Array.isArray(json.data.fix_applied) ? json.data.fix_applied.join('\n') : (json.data.fix_applied || ''),
          prevention_steps: Array.isArray(json.data.prevention_steps) ? json.data.prevention_steps.join('\n') : (json.data.prevention_steps || '')
        }));
        setMessage({ type: 'success', text: 'AI Draft generated successfully!' });
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to generate draft' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error generating draft' });
    } finally {
      setIsGenerating(false);
    }
  };

  const updateState = async (targetState: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/work-items/${item.id}/transition`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_state: targetState })
      });
      const json = await res.json();
      if (res.ok) {
        onRefresh();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to transition state' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error transitioning state' });
    }
  };

  const submitRca = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const startTime = new Date(formData.incident_start);
    const endTime = new Date(formData.incident_end);

    if (
      !formData.incident_start ||
      !formData.incident_end ||
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      endTime <= startTime
    ) {
      setMessage({ type: 'error', text: 'Incident end time must be after incident start time.' });
      setIsSubmitting(false);
      return;
    }

    const payload = {
      ...formData,
      incident_start: toIsoStringFromDateTimeLocal(formData.incident_start),
      incident_end: toIsoStringFromDateTimeLocal(formData.incident_end)
    };

    try {
      const res = await fetch(`${API_BASE}/api/work-items/${item.id}/rca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (res.ok || res.status === 409) {
        try {
          const transitionRes = await fetch(`${API_BASE}/api/work-items/${item.id}/transition`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_state: 'CLOSED' })
          });
          
          if (transitionRes.ok) {
            localStorage.removeItem(`rca_draft_${item.id}`);
            setMessage({ type: 'success', text: 'RCA Submitted and Incident Closed!' });
            new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});
            onRefresh();
          } else {
            const transitionJson = await transitionRes.json();
            setMessage({ type: 'error', text: transitionJson.error || 'RCA saved, but failed to transition state.' });
          }
        } catch (transitionErr) {
          setMessage({ type: 'error', text: 'RCA saved, but failed to transition state.' });
        }
      } else {
        const detailStr = json.details ? JSON.stringify(json.details) : '';
        setMessage({ type: 'error', text: `${json.error || 'Validation failed'} ${detailStr}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error submitting RCA' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '1.5rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {item.component_id} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>({item.state})</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>{item.title}</p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {item.state === 'OPEN' && (
            <button onClick={() => updateState('INVESTIGATING')} className="btn" style={{ background: 'var(--status-p2-bg)', color: 'var(--status-p2)', borderColor: 'rgba(234, 179, 8, 0.3)' }}>
              Acknowledge Incident
            </button>
          )}
          {item.state === 'INVESTIGATING' && (
            <button onClick={() => updateState('RESOLVED')} className="btn" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
              Mark as Resolved
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem', flexShrink: 0 }}>
        <button 
          onClick={() => setActiveTab('rca')} 
          style={{ background: 'none', border: 'none', color: activeTab === 'rca' ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: activeTab === 'rca' ? '2px solid var(--accent-primary)' : '2px solid transparent', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
        >
          <FileText size={16} /> RCA & Resolution
        </button>
        <button 
          onClick={() => setActiveTab('logs')} 
          style={{ background: 'none', border: 'none', color: activeTab === 'logs' ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: activeTab === 'logs' ? '2px solid var(--accent-primary)' : '2px solid transparent', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
        >
          <Terminal size={16} /> Live Logs
        </button>
        <button 
          onClick={() => setActiveTab('timeline')} 
          style={{ background: 'none', border: 'none', color: activeTab === 'timeline' ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: activeTab === 'timeline' ? '2px solid var(--accent-primary)' : '2px solid transparent', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
        >
          <Clock size={16} /> Timeline
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        
        {/* RCA TAB */}
        {activeTab === 'rca' && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Root Cause Analysis</h3>
              <button 
                onClick={generateDraft} 
                disabled={isGenerating || item.state === 'CLOSED'} 
                className="btn"
                style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', borderColor: 'rgba(139, 92, 246, 0.3)' }}
              >
                <Brain size={16} />
                {isGenerating ? 'Generating...' : 'Generate AI Draft'}
              </button>
            </div>

            {message && (
              <div style={{ 
                padding: '0.75rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)',
                background: message.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-p0-bg)',
                color: message.type === 'success' ? 'var(--status-success)' : 'var(--status-p0)',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
              }}>
                {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {message.text}
              </div>
            )}

            <form onSubmit={submitRca}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Incident Start</label>
                  <input
                    className="form-control"
                    type="datetime-local"
                    value={formData.incident_start}
                    onChange={e => setFormData({...formData, incident_start: e.target.value})}
                    disabled={item.state === 'CLOSED'}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Incident End</label>
                  <input
                    className="form-control"
                    type="datetime-local"
                    value={formData.incident_end}
                    onChange={e => setFormData({...formData, incident_end: e.target.value})}
                    disabled={item.state === 'CLOSED'}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Root Cause Category</label>
                <select 
                  className="form-control"
                  value={formData.root_cause_category}
                  onChange={e => setFormData({...formData, root_cause_category: e.target.value})}
                  disabled={item.state === 'CLOSED'}
                >
                  <option value="UNKNOWN" style={{ background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}>UNKNOWN</option>
                  <option value="INFRASTRUCTURE" style={{ background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}>INFRASTRUCTURE</option>
                  <option value="APPLICATION" style={{ background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}>APPLICATION</option>
                  <option value="NETWORK" style={{ background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}>NETWORK</option>
                  <option value="DATABASE" style={{ background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}>DATABASE</option>
                  <option value="CACHE" style={{ background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}>CACHE</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Fix Applied</label>
                <textarea 
                  className="form-control" rows={4}
                  value={formData.fix_applied}
                  onChange={e => setFormData({...formData, fix_applied: e.target.value})}
                  disabled={item.state === 'CLOSED'}
                  placeholder="Describe the immediate technical fix..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Prevention Steps</label>
                <textarea 
                  className="form-control" rows={4}
                  value={formData.prevention_steps}
                  onChange={e => setFormData({...formData, prevention_steps: e.target.value})}
                  disabled={item.state === 'CLOSED'}
                  placeholder="How do we prevent this from happening again?"
                />
              </div>

              {item.state !== 'CLOSED' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.875rem', color: item.state !== 'RESOLVED' ? 'var(--status-p1)' : 'var(--text-muted)' }}>
                    {item.state !== 'RESOLVED' ? '⚠️ You must transition the incident to RESOLVED before closing.' : ''}
                  </div>
                  <button type="submit" disabled={isSubmitting || item.state !== 'RESOLVED'} className="btn btn-primary" style={{ opacity: item.state !== 'RESOLVED' ? 0.5 : 1 }}>
                    <Save size={16} />
                    {isSubmitting ? 'Saving...' : 'Submit RCA & Close Incident'}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="glass-panel" style={{ padding: '1rem', background: '#0a0a0a', border: '1px solid #333', height: '100%', overflowY: 'auto', fontFamily: 'monospace' }}>
            {loadingLogs ? (
              <div style={{ color: 'var(--text-muted)' }}>Fetching raw signals from data lake...</div>
            ) : logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>No logs found for this work item.</div>
            ) : (
              logs.map((log: any, idx) => {
                const isCrit = log.severity === 'CRITICAL';
                const d = new Date(log.timestamp);
                const localTime = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 23).replace('T', ' ');
                return (
                  <div key={idx} style={{ marginBottom: '0.5rem', fontSize: '0.875rem', borderBottom: '1px solid #222', paddingBottom: '0.25rem' }}>
                    <span style={{ color: '#888' }}>[{localTime}]</span>{' '}
                    <span style={{ color: isCrit ? '#ef4444' : '#f97316' }}>[{log.severity}]</span>{' '}
                    <span style={{ color: '#e2e8f0' }}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '15px', width: '2px', background: 'var(--border-subtle)' }} />
              
              <div style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--status-p0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={16} color="white" />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Incident Opened</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{new Date(item.created_at).toLocaleString()}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>System detected {item.signal_count} failure signals. Priority set to {item.priority}.</div>
                </div>
              </div>

              {item.investigating_at && (
                <div style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--status-p2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Search size={16} color="white" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Investigation Started</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{new Date(item.investigating_at).toLocaleString()}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Engineer acknowledged the incident.</div>
                  </div>
                </div>
              )}

              {item.resolved_at && (
                <div style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--status-p3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Wrench size={16} color="white" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Fix Applied</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{new Date(item.resolved_at).toLocaleString()}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>System status verified as resolved.</div>
                  </div>
                </div>
              )}

              {item.state === 'CLOSED' && (
                <div style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--status-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={16} color="white" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Incident Closed</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{new Date(item.updated_at).toLocaleString()}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>RCA submitted and incident archived.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default IncidentDetail;
