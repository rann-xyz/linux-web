import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { getUserFromToken } from '../auth/service.js';
import { getOrCreateContainer, getContainerStats } from '../containers/index.js';
import { spawn, execSync } from 'child_process';
import { AUDIT_EVENTS } from '../auth/crypto.js';
import { db } from '../database/index.js';
import { ChildProcess } from 'child_process';

interface TerminalConnection {
  ws: WebSocket;
  userId: string;
  containerId: string;
  process: ChildProcess | null;
}

const connections = new Map<string, TerminalConnection>();

export function setupWebSocket(server: import('http').Server): void {
  const wss = new WebSocketServer({
    noServer: true,
    path: '/api/terminal',
  });

  server.on('upgrade', async (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const user = await getUserFromToken(token);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, user.id);
    });
  });

  wss.on('connection', async (ws: WebSocket, _request: IncomingMessage, userId: string) => {
    let currentConnection: TerminalConnection | null = null;

    try {
      const { containerId } = await getOrCreateContainer(userId);

      currentConnection = {
        ws,
        userId,
        containerId,
        process: null,
      };
      connections.set(userId, currentConnection);

      const proc = spawn('docker', [
        'exec', '-i', containerId,
        '/bin/bash', '-li'
      ], {
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      currentConnection.process = proc;

      proc.stdout?.on('data', (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
        }
      });

      proc.on('close', (code) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'exit', code }));
        }
        cleanupConnection(userId);
      });

      proc.on('error', (err) => {
        console.error('Process error:', err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Terminal process error' }));
        }
      });

      await db.query(
        `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
        [userId, AUDIT_EVENTS.TERMINAL_CREATED, JSON.stringify({ container_id: containerId })]
      );

      ws.send(JSON.stringify({ type: 'ready', containerId }));

    } catch (err) {
      console.error('WebSocket connection error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to start terminal' }));
      ws.close();
    }

    ws.on('message', (message: Buffer) => {
      try {
        const msg = JSON.parse(message.toString());

        switch (msg.type) {
          case 'input':
            if (currentConnection?.process?.stdin?.writable) {
              currentConnection.process.stdin.write(msg.data);
            }
            break;

          case 'resize':
            if (currentConnection?.containerId) {
              try {
                execSync(
                  `docker exec ${currentConnection.containerId} resize -s ${msg.rows} ${msg.cols} 2>/dev/null || true`,
                  { timeout: 1000 }
                );
              } catch {
                // Ignore resize errors
              }
            }
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch (err) {
        console.error('Message handling error:', err);
      }
    });

    ws.on('close', () => {
      cleanupConnection(userId);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      cleanupConnection(userId);
    });
  });

  setInterval(() => {
    connections.forEach((conn, uid) => {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.ping();
      } else {
        cleanupConnection(uid);
      }
    });
  }, 30000);
}

function cleanupConnection(userId: string): void {
  const conn = connections.get(userId);
  if (conn) {
    if (conn.process) {
      conn.process.kill();
    }
    connections.delete(userId);
  }
}

export async function getConnectionStats(userId: string) {
  const conn = connections.get(userId);
  if (!conn) return null;

  const containerStats = await getContainerStats(conn.containerId);

  return {
    connected: conn.ws.readyState === WebSocket.OPEN,
    containerId: conn.containerId,
    cpu: containerStats.cpu,
    memory: containerStats.memory,
  };
}