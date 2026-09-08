import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { createServer, Server } from 'http';
import { db } from './database/index.js';
import { register, login, logout, getUserFromToken, verifyAdmin } from './auth/service.js';
import { setupWebSocket, getConnectionStats } from './websocket/index.js';
import { listFiles, createDirectory, deleteFile, renameFile, getFileStream } from './filesystem/index.js';
import { getOrCreateContainer, terminateContainer, getStorageUsage, getContainerStats } from './containers/index.js';
import { sanitizeFilename } from './filesystem/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = '0.0.0.0';

// ─── Initialize Database ────────────────────────────────────────────────────

async function initDatabase() {
  try {
    const schema = await fs.readFile(path.join(process.cwd(), 'src', 'database', 'schema.sql'), 'utf-8');
    const statements = schema.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await db.query(stmt);
        } catch {
          // Ignore errors (table already exists)
        }
      }
    }
  } catch (err) {
    console.log('⚠️  Database schema init skipped:', (err as Error).message);
  }
}

// ─── Build Fastify App ───────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Security headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Disabled for WebSocket compatibility
  });

  // CORS
  await app.register(fastifyCors, {
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // Rate limiting
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '15 minute',
    keyGenerator: (request) => {
      return (request.headers['x-forwarded-for'] as string) || request.ip;
    },
  });

  // ─── Auth Middleware ────────────────────────────────────────────────────────

  async function authenticate(request: any, reply: any) {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      reply.code(401).send({ error: 'Authentication required' });
      return null;
    }

    const user = await getUserFromToken(token);
    if (!user) {
      reply.code(401).send({ error: 'Invalid or expired token' });
      return null;
    }

    return user;
  }

  // ─── Routes ─────────────────────────────────────────────────────────────────

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Register
  app.post('/api/auth/register', async (request: any, reply: any) => {
    const { email, password } = request.body || {};
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }
    const result = await register(email, password);
    if (!result.success) {
      return reply.code(400).send(result);
    }
    return reply.code(201).send(result);
  });

  // Login
  app.post('/api/auth/login', async (request: any, reply: any) => {
    const { email, password } = request.body || {};
    const ip = (request.headers['x-forwarded-for'] as string) || 'unknown';
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }
    const result = await login(email, password, ip);
    if (!result.success) {
      return reply.code(401).send(result);
    }
    return reply.send(result);
  });

  // Logout
  app.post('/api/auth/logout', async (request: any, reply: any) => {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return reply.code(400).send({ error: 'Missing token' });
    }
    await logout(token);
    return reply.send({ success: true });
  });

  // Get current user
  app.get('/api/auth/me', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;
    return reply.send({ user });
  });

  // ─── Terminal Routes ─────────────────────────────────────────────────────────

  // Create terminal session
  app.post('/api/terminal/session', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    try {
      const { containerId } = await getOrCreateContainer(user.id);
      return reply.code(201).send({
        sessionId: containerId,
        containerId,
        status: 'active',
      });
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to create terminal session' });
    }
  });

  // Delete terminal session
  app.delete('/api/terminal/session/:id', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const { id } = request.params as { id: string };
    const success = await terminateContainer(id, user.id);
    if (!success) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    return reply.send({ success: true });
  });

  // Get terminal connection stats
  app.get('/api/terminal/stats', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const stats = await getConnectionStats(user.id);
    if (!stats) {
      return reply.send({ connected: false });
    }

    const storage = await getStorageUsage(user.id);

    return reply.send({
      connected: stats.connected,
      containerId: stats.containerId,
      cpu: stats.cpu,
      memory: stats.memory,
      storage,
    });
  });

  // ─── File Routes ─────────────────────────────────────────────────────────────

  // List files
  app.get('/api/files', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const dir = (request.query.dir as string) || '';
    try {
      const files = await listFiles(user.id, dir);
      return reply.send({ files });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Create directory
  app.post('/api/files/mkdir', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const { path: dirPath } = request.body || {};
    if (!dirPath) {
      return reply.code(400).send({ error: 'Path is required' });
    }

    try {
      await createDirectory(user.id, dirPath);
      return reply.code(201).send({ success: true });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Delete file/directory
  app.delete('/api/files', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const { path: filePath } = request.query || {};
    if (!filePath) {
      return reply.code(400).send({ error: 'Path is required' });
    }

    try {
      await deleteFile(user.id, filePath as string);
      return reply.send({ success: true });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Rename file/directory
  app.post('/api/files/rename', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const { oldPath, newPath } = request.body || {};
    if (!oldPath || !newPath) {
      return reply.code(400).send({ error: 'oldPath and newPath are required' });
    }

    try {
      await renameFile(user.id, oldPath, newPath);
      return reply.send({ success: true });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Download file
  app.get('/api/files/download', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const { path: filePath } = request.query || {};
    if (!filePath) {
      return reply.code(400).send({ error: 'Path is required' });
    }

    try {
      const { stream, filename, size } = await getFileStream(user.id, filePath as string);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Length', size);
      return reply.send(stream);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Upload file (simple version without multipart)
  app.post('/api/files/upload', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const { filename, content } = request.body || {};
    if (!filename || !content) {
      return reply.code(400).send({ error: 'filename and content are required' });
    }

    const safeFilename = sanitizeFilename(filename);
    const uploadPath = path.join(process.env.STORAGE_ROOT || '/data/users', user.id, safeFilename);

    try {
      const buffer = Buffer.from(content, 'base64');
      await fs.writeFile(uploadPath, buffer);
      return reply.code(201).send({ success: true, filename: safeFilename });
    } catch (err) {
      return reply.code(500).send({ error: 'Upload failed' });
    }
  });

  // ─── System Info ─────────────────────────────────────────────────────────────

  app.get('/api/system/info', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    // Get container stats for this user
    try {
      const { containerId } = await getOrCreateContainer(user.id);
      const containerStats = await getContainerStats(containerId);
      const storage = await getStorageUsage(user.id);

      return reply.send({
        os: 'Ubuntu 24.04 LTS',
        cpuUsage: containerStats.cpu,
        memoryUsed: containerStats.memory.used,
        memoryTotal: containerStats.memory.limit,
        storageUsed: storage.used,
        storageTotal: storage.total,
        uptime: Math.floor(process.uptime()),
      });
    } catch {
      return reply.send({
        os: 'Ubuntu 24.04 LTS',
        cpuUsage: 0,
        memoryUsed: 0,
        memoryTotal: 0,
        storageUsed: 0,
        storageTotal: 5,
        uptime: Math.floor(process.uptime()),
      });
    }
  });

  // ─── Admin Routes ────────────────────────────────────────────────────────────

  app.get('/api/admin/users', async (request: any, reply: any) => {
    const user = await authenticate(request, reply);
    if (!user) return;

    const isAdmin = await verifyAdmin(request.headers.authorization?.replace('Bearer ', '') || '');
    if (!isAdmin) {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const result = await db.query(
      `SELECT id, email, role, status, email_verified, created_at
       FROM users ORDER BY created_at DESC LIMIT 100`
    );

    return reply.send({ users: result.rows });
  });

  // ─── Error Handler ───────────────────────────────────────────────────────────

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);

    // Don't expose stack traces in production
    if (process.env.NODE_ENV === 'production') {
      return reply.code(500).send({ error: 'Internal server error' });
    }

    return reply.code(500).send({
      error: 'Internal server error',
      message: error.message,
      stack: error.stack,
    });
  });

  return app;
}

// ─── Start Server ────────────────────────────────────────────────────────────

async function start() {
  try {
    const app = await buildApp();

    // Create HTTP server from Fastify instance
    const server: Server = createServer(app as any);
    setupWebSocket(server);

    server.listen({ port: PORT, host: HOST }, async () => {
      console.log(`🚀 Backend running on http://${HOST}:${PORT}`);
      console.log(`📡 WebSocket ready at ws://${HOST}:${PORT}/api/terminal`);

      // Initialize database
      try {
        await initDatabase();
        console.log('✅ Database initialized');
      } catch (err) {
        console.log('⚠️  Database initialization skipped (may already exist)');
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export default buildApp;