import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

let wss: WebSocketServer | null = null;

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    // Ping/pong handler
    ws.on('message', (message) => {
      if (message.toString() === 'ping') {
        ws.send('pong');
      }
    });

    // Custom flag for heartbeats
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });
  });

  // Heartbeat every 30s to detect stale connections
  const interval = setInterval(() => {
    wss?.clients.forEach((ws) => {
      const extWs = ws as any;
      if (extWs.isAlive === false) {
        return ws.terminate();
      }
      extWs.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
  
  console.log('WebSocket server initialized');
}

export function broadcastEvent(event: string, payload: unknown): void {
  if (!wss) return;
  const message = JSON.stringify({ event, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
