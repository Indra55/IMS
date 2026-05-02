import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface WebSocketContextType {
  isConnected: boolean;
  lastEvent: any | null;
  metrics: { throughput: number }[];
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  lastEvent: null,
  metrics: [],
});

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider: React.FC<{ url: string; children: ReactNode }> = ({ url, children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<any | null>(null);
  const [metrics, setMetrics] = useState<{ throughput: number; time: string }[]>(Array(20).fill({ throughput: 0, time: '' }));

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let attempt = 0;

    const connect = () => {
      ws = new WebSocket(url);

      ws.onopen = () => {
        setIsConnected(true);
        attempt = 0;
        console.log('Connected to WebSocket server');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent(data);
          
          if (data.event === 'metrics:throughput') {
            setMetrics(prev => {
              const newMetrics = [...prev.slice(1), { throughput: data.payload.count, time: new Date(data.payload.timestamp).toLocaleTimeString() }];
              return newMetrics;
            });
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('Disconnected from WebSocket server');
        // Reconnect with exponential backoff
        const timeout = Math.min(1000 * Math.pow(2, attempt), 30000);
        attempt++;
        reconnectTimeout = setTimeout(connect, timeout);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [url]);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastEvent, metrics }}>
      {children}
    </WebSocketContext.Provider>
  );
};
