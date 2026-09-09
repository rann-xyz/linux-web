import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer, Server } from 'http';
import { WebSocketServer } from 'ws';
import { db } from './database/index.js';
import { register, login, logout, getUserFromToken, verifyAdmin } from './auth/service.js';
import { getOrCreateContainer, terminateContainer, getStorageUsage, getContainerStats } from './containers/index.js';
import { listFiles, createDirectory, deleteFile, renameFile, getFileStream, sanitizeFilename } from './filesystem/index.js';
import * as fs from 'fs/promises';
import * as nodePath from 'path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = '0.0.0.0';

const connections = new Map<string, { ws: any; userId: string; containerId: string; proc: any }>();

// ─── Database Init ───────────────────────────────────────────────────────────

async function initDatabase() {
  try {
    const schema = await fs.readFile(nodePath.join(process.cwd(), 'src', 'database', 'schema.sql'), 'utf-8');
    for (const stmt of schema.split(';').filter(s => s.trim())) {
      try { await db.query(stmt); } catch { /* ignore */ }
    }
  } catch (err) {
    console.log('⚠️  Database schema init skipped:', (err as Error).message);
  }
}

// ─── WebSocket Setup ─────────────────────────────────────────────────────────

function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, path: '/api/terminal' });

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const user = await getUserFromToken(token);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, user.id);
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: any, _request: any, userId: string) => {
    let conn = connections.get(userId);

    try {
      const { containerId } = await getOrCreateContainer(userId);

      const { spawn } = await import('child_process');
      const proc = spawn('docker', ['exec', '-i', containerId, '/bin/bash', '-li'], {
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      conn = { ws, userId, containerId, proc };
      connections.set(userId, conn);

      proc.stdout?.on('data', (data: Buffer) => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
      });

      proc.stderr?.on('data', (data: Buffer) => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
      });

      proc.on('close', (code: number) => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit', code }));
        connections.delete(userId);
        proc.kill();
      });

      await db.query(
        `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
        [userId, 'TERMINAL_CREATED', JSON.stringify({ container_id: containerId })]
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

        if (msg.type === 'input' && conn?.proc?.stdin?.writable) {
          conn.proc.stdin.write(msg.data);
        } else if (msg.type === 'resize' && conn?.containerId) {
          const { execSync } = require('child_process');
          try {
            execSync(`docker exec ${conn.containerId} resize -s ${msg.rows} ${msg.cols} 2>/dev/null || true`, { timeout: 1000 });
          } catch { /* ignore */ }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (err) {
        console.error('Message handling error:', err);
      }
    });

    ws.on('close', () => {
      const c = connections.get(userId);
      if (c?.proc) c.proc.kill();
      connections.delete(userId);
    });
  });

  setInterval(() => {
    connections.forEach((conn, uid) => {
      if (conn.ws.readyState === 1) conn.ws.ping();
      else {
        conn.proc?.kill();
        connections.delete(uid);
      }
    });
  }, 30000);
}

async function getConnectionStats(userId: string) {
  const conn = connections.get(userId);
  if (!conn) return null;
  const stats = await getContainerStats(conn.containerId);
  return { connected: conn.ws.readyState === 1, containerId: conn.containerId, cpu: stats.cpu, memory: stats.memory };
}

// ─── Middleware ──────────────────────────────────────────────────────────────

function authenticate(request: Request, reply: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return reply.status(401).json({ error: 'Authentication required' });

  getUserFromToken(token).then(user => {
    if (!user) return reply.status(401).json({ error: 'Invalid or expired token' });
    (request as any).user = user;
    next();
  }).catch(() => {
    reply.status(401).json({ error: 'Authentication failed' });
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const result = await register(email, password);
  return result.success ? res.status(201).json(result) : res.status(400).json(result);
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const ip = (req.headers['x-forwarded-for'] as string) || 'unknown';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const result = await login(email, password, ip);
  return result.success ? res.json(result) : res.status(401).json(result);
});

app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(400).json({ error: 'Missing token' });
  await logout(token);
  res.json({ success: true });
});

app.get('/api/auth/me', authenticate as any, async (req: Request, res: Response) => {
  res.json({ user: (req as any).user });
});

app.post('/api/terminal/session', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { containerId } = await getOrCreateContainer((req as any).user.id);
    return res.status(201).json({ sessionId: containerId, containerId, status: 'active' });
  } catch { return res.status(500).json({ error: 'Failed to create terminal session' }); }
});

app.delete('/api/terminal/session/:id', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const ok = await terminateContainer(id, (req as any).user.id);
  return ok ? res.json({ success: true }) : res.status(404).json({ error: 'Session not found' });
});

app.get('/api/terminal/stats', authenticate as any, async (req: Request, res: Response) => {
  const stats = await getConnectionStats((req as any).user.id);
  if (!stats) return res.json({ connected: false });
  const storage = await getStorageUsage((req as any).user.id);
  return res.json({ connected: stats.connected, containerId: stats.containerId, cpu: stats.cpu, memory: stats.memory, storage });
});

app.get('/api/files', authenticate as any, async (req: Request, res: Response) => {
  const dir = (req.query.dir as string) || '';
  try { return res.json({ files: await listFiles((req as any).user.id, dir) }); }
  catch (err) { return res.status(400).json({ error: (err as Error).message }); }
});

app.post('/api/files/mkdir', authenticate as any, async (req: Request, res: Response) => {
  const { path: dirPath } = req.body || {};
  if (!dirPath) return res.status(400).json({ error: 'Path is required' });
  try { await createDirectory((req as any).user.id, dirPath); return res.status(201).json({ success: true }); }
  catch (err) { return res.status(400).json({ error: (err as Error).message }); }
});

app.delete('/api/files', authenticate as any, async (req: Request, res: Response) => {
  const { path: filePath } = req.query || {};
  if (!filePath) return res.status(400).json({ error: 'Path is required' });
  try { await deleteFile((req as any).user.id, filePath as string); return res.json({ success: true }); }
  catch (err) { return res.status(400).json({ error: (err as Error).message }); }
});

app.post('/api/files/rename', authenticate as any, async (req: Request, res: Response) => {
  const { oldPath, newPath } = req.body || {};
  if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath are required' });
  try { await renameFile((req as any).user.id, oldPath, newPath); return res.json({ success: true }); }
  catch (err) { return res.status(400).json({ error: (err as Error).message }); }
});

app.get('/api/files/download', authenticate as any, async (req: Request, res: Response) => {
  const { path: filePath } = req.query || {};
  if (!filePath) return res.status(400).json({ error: 'Path is required' });
  try {
    const { stream, filename, size } = await getFileStream((req as any).user.id, filePath as string);
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Length', String(size));
    return stream.pipe(res);
  } catch (err) { return res.status(400).json({ error: (err as Error).message }); }
});

app.post('/api/files/upload', authenticate as any, async (req: Request, res: Response) => {
  const { filename, content } = req.body || {};
  if (!filename || !content) return res.status(400).json({ error: 'filename and content are required' });
  const safeFilename = sanitizeFilename(filename);
  const uploadPath = nodePath.join(process.env.STORAGE_ROOT || '/data/users', (req as any).user.id, safeFilename);
  try {
    await fs.writeFile(uploadPath, Buffer.from(content, 'base64'));
    return res.status(201).json({ success: true, filename: safeFilename });
  } catch { return res.status(500).json({ error: 'Upload failed' }); }
});

app.get('/api/system/info', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { containerId } = await getOrCreateContainer((req as any).user.id);
    const containerStats = await getContainerStats(containerId);
    const storage = await getStorageUsage((req as any).user.id);
    return res.json({ os: 'Ubuntu 24.04 LTS', cpuUsage: containerStats.cpu, memoryUsed: containerStats.memory.used, memoryTotal: containerStats.memory.limit, storageUsed: storage.used, storageTotal: storage.total, uptime: Math.floor(process.uptime()) });
  } catch {
    return res.json({ os: 'Ubuntu 24.04 LTS', cpuUsage: 0, memoryUsed: 0, memoryTotal: 0, storageUsed: 0, storageTotal: 5, uptime: Math.floor(process.uptime()) });
  }
});

app.get('/api/admin/users', authenticate as any, async (req: Request, res: Response) => {
  const isAdmin = await verifyAdmin(req.headers.authorization?.replace('Bearer ', '') || '');
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
  const result = await db.query(`SELECT id, email, role, status, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT 100`);
  return res.json({ users: result.rows });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  try {
    const server = createServer(app);
    setupWebSocket(server);

    server.listen({ port: PORT, host: HOST }, async () => {
      console.log(`🚀 Backend running on http://${HOST}:${PORT}`);
      console.log(`📡 WebSocket ready at ws://${HOST}:${PORT}/api/terminal`);
      try { await initDatabase(); console.log('✅ Database initialized'); }
      catch { console.log('⚠️  Database initialization skipped (may already exist)'); }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();