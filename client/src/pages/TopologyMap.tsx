import React, { useEffect } from 'react';
import { API_BASE } from '../config';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Server, Database, HardDrive, Globe, Box } from 'lucide-react';

const initialNodes = [
  {
    id: 'API_GW_US_EAST',
    type: 'custom',
    data: { label: 'API Gateway', icon: Globe, status: 'ok' },
    position: { x: 250, y: 50 },
  },
  {
    id: 'AUTH_SVC',
    type: 'custom',
    data: { label: 'Auth Service', icon: Box, status: 'ok' },
    position: { x: 100, y: 150 },
  },
  {
    id: 'MCP_HOST_01',
    type: 'custom',
    data: { label: 'MCP Processing Host', icon: Server, status: 'ok' },
    position: { x: 400, y: 150 },
  },
  {
    id: 'REDIS_CLUSTER_1',
    type: 'custom',
    data: { label: 'Redis Cache Cluster', icon: HardDrive, status: 'ok' },
    position: { x: 250, y: 250 },
  },
  {
    id: 'PG_PROD_01',
    type: 'custom',
    data: { label: 'PostgreSQL Primary', icon: Database, status: 'ok' },
    position: { x: 400, y: 350 },
  },
];

const initialEdges = [
  { id: 'e1-2', source: 'API_GW_US_EAST', target: 'AUTH_SVC', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e1-3', source: 'API_GW_US_EAST', target: 'MCP_HOST_01', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-4', source: 'MCP_HOST_01', target: 'REDIS_CLUSTER_1', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-5', source: 'MCP_HOST_01', target: 'PG_PROD_01', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2-4', source: 'AUTH_SVC', target: 'REDIS_CLUSTER_1', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
];

const CustomNode = ({ data }: any) => {
  const Icon = data.icon;
  const isError = data.status === 'error';
  
  return (
    <div style={{
      padding: '10px 15px',
      borderRadius: '8px',
      background: isError ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-panel-solid)',
      border: isError ? '2px solid var(--status-p0)' : '1px solid var(--border-subtle)',
      color: isError ? 'var(--status-p0)' : 'var(--text-primary)',
      boxShadow: isError ? '0 0 15px rgba(239, 68, 68, 0.5)' : 'var(--shadow-md)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      minWidth: '180px',
      transition: 'all 0.3s ease'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <div style={{ 
        background: isError ? 'var(--status-p0)' : 'rgba(255,255,255,0.1)', 
        padding: '8px', 
        borderRadius: '50%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: isError ? 'white' : 'var(--accent-primary)'
      }}>
        <Icon size={20} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{data.label}</span>
        <span style={{ fontSize: '10px', color: isError ? '#fca5a5' : 'var(--text-muted)' }}>
          {isError ? 'CRITICAL INCIDENT' : 'Operational'}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const TopologyMap: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Poll for active incidents to update node status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/work-items?state=OPEN`);
        if (res.ok) {
          const json = await res.json();
          const activeComponents = json.data.map((wi: any) => wi.component_id);
          
          setNodes((nds) =>
            nds.map((node) => {
              if (activeComponents.includes(node.id)) {
                return { ...node, data: { ...node.data, status: 'error' } };
              }
              return { ...node, data: { ...node.data, status: 'ok' } };
            })
          );
        }
      } catch (err) {
        console.error('Failed to fetch topology status', err);
      }
    };

    checkStatus();
    const int = setInterval(checkStatus, 5000);
    return () => clearInterval(int);
  }, [setNodes]);

  return (
    <div style={{ height: '100%', width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Architectural Topology</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Live system architecture map. Components will pulse red when experiencing an active incident.</p>
      </div>
      
      <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', borderRadius: '12px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Background color="#333" gap={16} />
          <Controls style={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-subtle)' }} />
          <MiniMap 
            nodeColor={(n) => {
              return n.data?.status === 'error' ? '#ef4444' : '#3b82f6';
            }} 
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }} 
          />
        </ReactFlow>
      </div>
    </div>
  );
};

export default TopologyMap;
