import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { createServer, Server } from 'http';
import { WebSocketServer } from 'ws';
import { db } from './database/index.js';
import { register, login, logout, getUserFromToken, verifyAdmin } from './auth/service.js';
import { getOrCreateContainer, terminateContainer, getStorageUsage, getContainerStats } from './containers/index.js';
import { listFiles, createDirectory, deleteFile, renameFile, getFileStream, sanitizeFilename } from './filesystem/index.js';
import * as fs from 'fs/promises';
import * as nodePath from 'path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = '0.0.0.0';

const connections = new Map<string, { ws: any; userId: string; containerId: string; proc: any }>();

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

// ─── Database Init ───────────────────────────────────────────────────────────

async function initDatabase() {
  try {
    const schema = await fs.readFile(nodePath.join(process.cwd(), 'backend', 'src', 'database', 'schema.sql'), 'utf-8');
    for (const stmt of schema.split(';').filter(s => s.trim())) {
      try { await db.query(stmt); } catch { /* ignore */ }
    }
  } catch (err) {
    console.log('⚠️  Database schema init skipped:', (err as Error).message);
  }
}

// ─── Build App ───────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  await app.register(fastifyCors, { origin: FRONTEND_URL, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] });
  await app.register(fastifyRateLimit, { max: 100, timeWindow: '15 minute', keyGenerator: (req) => (req.headers['x-forwarded-for'] as string) || req.ip });

  async function authenticate(request: any, reply: any) {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) return reply.code(401).send({ error: 'Authentication required' }), null;
    const user = await getUserFromToken(token);
    if (!user) return reply.code(401).send({ error: 'Invalid or expired token' }), null;
    return user;
  }

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  app.post('/api/auth/register', async (request: any, reply: any) => {
    const { email, password } = request.body || {};
    if (!email || !password) return reply.code(400).send({ error: 'Email and password are required' });
    const result = await register(email, password);
    return (!result.success ? reply.code(400) : reply.code(201)).send(result);
  });

  app.post('/api/auth/login', async (request: any, reply: any) => {
    const { email, password } = request.body || {};
    const ip = (request.headers['x-forwarded-for'] as string) || 'unknown';
    if (!email || !password) return reply.code(400).send({ error: 'Email and password are required' });
    const result = await login(email, password, ip);
    return (!result.success ? reply.code(401) : reply).send(result);
  });

  app.post('/api/auth/logout', async (request: any, reply: any) => {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) return reply.code(400).send({ error: 'Missing token' });
    await logout(token);
    return reply.send({ success: true });
  });

  app.get('/api/auth/me', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    return user ? reply.send({ user }) : undefined;
  });

  app.post('/api/terminal/session', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    try {
      const { containerId } = await getOrCreateContainer(user.id);
      return reply.code(201).send({ sessionId: containerId, containerId, status: 'active' });
    } catch { return reply.code(500).send({ error: 'Failed to create terminal session' }); }
  });

  app.delete('/api/terminal/session/:id', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const ok = await terminateContainer(id, user.id);
    return ok ? reply.send({ success: true }) : reply.code(404).send({ error: 'Session not found' });
  });

  app.get('/api/terminal/stats', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const stats = await getConnectionStats(user.id);
    if (!stats) return reply.send({ connected: false });
    const storage = await getStorageUsage(user.id);
    return reply.send({ connected: stats.connected, containerId: stats.containerId, cpu: stats.cpu, memory: stats.memory, storage });
  });

  app.get('/api/files', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const dir = (request.query.dir as string) || '';
    try { return reply.send({ files: await listFiles(user.id, dir) }); }
    catch (err) { return reply.code(400).send({ error: (err as Error).message }); }
  });

  app.post('/api/files/mkdir', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const { path: dirPath } = request.body || {};
    if (!dirPath) return reply.code(400).send({ error: 'Path is required' });
    try { await createDirectory(user.id, dirPath); return reply.code(201).send({ success: true }); }
    catch (err) { return reply.code(400).send({ error: (err as Error).message }); }
  });

  app.delete('/api/files', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const { path: filePath } = request.query || {};
    if (!filePath) return reply.code(400).send({ error: 'Path is required' });
    try { await deleteFile(user.id, filePath as string); return reply.send({ success: true }); }
    catch (err) { return reply.code(400).send({ error: (err as Error).message }); }
  });

  app.post('/api/files/rename', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const { oldPath, newPath } = request.body || {};
    if (!oldPath || !newPath) return reply.code(400).send({ error: 'oldPath and newPath are required' });
    try { await renameFile(user.id, oldPath, newPath); return reply.send({ success: true }); }
    catch (err) { return reply.code(400).send({ error: (err as Error).message }); }
  });

  app.get('/api/files/download', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const { path: filePath } = request.query || {};
    if (!filePath) return reply.code(400).send({ error: 'Path is required' });
    try {
      const { stream, filename, size } = await getFileStream(user.id, filePath as string);
      return reply.header('Content-Disposition', `attachment; filename="${filename}"`).header('Content-Length', size).send(stream);
    } catch (err) { return reply.code(400).send({ error: (err as Error).message }); }
  });

  app.post('/api/files/upload', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const { filename, content } = request.body || {};
    if (!filename || !content) return reply.code(400).send({ error: 'filename and content are required' });
    const safeFilename = sanitizeFilename(filename);
    const uploadPath = nodePath.join(process.env.STORAGE_ROOT || '/data/users', user.id, safeFilename);
    try {
      await fs.writeFile(uploadPath, Buffer.from(content, 'base64'));
      return reply.code(201).send({ success: true, filename: safeFilename });
    } catch { return reply.code(500).send({ error: 'Upload failed' }); }
  });

  app.get('/api/system/info', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    try {
      const { containerId } = await getOrCreateContainer(user.id);
      const containerStats = await getContainerStats(containerId);
      const storage = await getStorageUsage(user.id);
      return reply.send({ os: 'Ubuntu 24.04 LTS', cpuUsage: containerStats.cpu, memoryUsed: containerStats.memory.used, memoryTotal: containerStats.memory.limit, storageUsed: storage.used, storageTotal: storage.total, uptime: Math.floor(process.uptime()) });
    } catch {
      return reply.send({ os: 'Ubuntu 24.04 LTS', cpuUsage: 0, memoryUsed: 0, memoryTotal: 0, storageUsed: 0, storageTotal: 5, uptime: Math.floor(process.uptime()) });
    }
  });

  app.get('/api/admin/users', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    const isAdmin = await verifyAdmin(request.headers.authorization?.replace('Bearer ', '') || '');
    if (!isAdmin) return reply.code(403).send({ error: 'Admin access required' });
    const result = await db.query(`SELECT id, email, role, status, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT 100`);
    return reply.send({ users: result.rows });
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    return reply.code(500).send(process.env.NODE_ENV === 'production' ? { error: 'Internal server error' } : { error: 'Internal server error', message: error.message, stack: error.stack });
  });

  return app;
}

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  try {
    const app = await buildApp();
    const server: Server = createServer();
    setupWebSocket(server);
    server.on('request', (req, res) => { app.server.emit('request', req, res); });

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