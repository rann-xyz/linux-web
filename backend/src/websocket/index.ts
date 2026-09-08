import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { getUserFromToken } from '../auth/service.js';
import { getOrCreateContainer, getContainerStats } from '../containers/index.js';
import { spawn, ChildProcess } from 'child_process';
import { AUDIT_EVENTS } from '../auth/crypto.js';
import { db } from '../database/index.js';

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

    // Verify token
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

  wss.on('connection', async (ws: WebSocket, request: IncomingMessage, userId: string) => {
    let currentConnection: TerminalConnection | null = null;

    try {
      // Get or create container for user
      const { containerId, container } = await getOrCreateContainer(userId);

      currentConnection = {
        ws,
        userId,
        containerId,
        process: null,
      };
      connections.set(userId, currentConnection);

      // Start bash process inside the container using docker exec
      const { exec } = await import('child_process');

      const proc = spawn('docker', [
        'exec', '-i', containerId,
        '/bin/bash', '-l'
      ], {
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      currentConnection.process = proc;

      // Handle output from container
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

      // Log terminal creation
      await db.query(
        `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
        [userId, AUDIT_EVENTS.TERMINAL_CREATED, JSON.stringify({ container_id: containerId })]
      );

      // Send initial output
      ws.send(JSON.stringify({ type: 'ready', containerId }));

    } catch (err) {
      console.error('WebSocket connection error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to start terminal' }));
      ws.close();
    }

    // Handle incoming messages
    ws.on('message', async (message: Buffer) => {
      try {
        const msg = JSON.parse(message.toString());

        switch (msg.type) {
          case 'input':
            if (currentConnection?.process?.stdin?.writable) {
              currentConnection.process.stdin.write(msg.data);
            }
            break;

          case 'resize':
            // xterm.js sends cols and rows
            // Docker exec doesn't support resize natively, but we can:
            // 1. Send SIGWINCH to bash (limited support)
            // 2. Or use a PTY wrapper like "script" command
            if (currentConnection?.process) {
              const { exec } = await import('child_process');
              exec(`docker exec ${currentConnection.containerId} resize -s ${msg.rows} ${msg.cols} 2>/dev/null`);
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

  // Heartbeat to keep connections alive
  setInterval(() => {
    connections.forEach((conn, userId) => {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.ping();
      } else {
        cleanupConnection(userId);
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