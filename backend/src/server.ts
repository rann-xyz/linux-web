import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db/connection.js';
import authRoutes from './routes/auth.js';
import terminalRoutes from './routes/terminal.js';
import containerRoutes from './routes/containers.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─────────────────────────────────────
// Middleware
// ─────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ─────────────────────────────────────
// Health Check
// ─────────────────────────────────────
app.get('/health', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

// ─────────────────────────────────────
// API Routes
// ─────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/containers', containerRoutes);

// ─────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─────────────────────────────────────
// Error Handler (must be last)
// ─────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────
// Server Start
// ─────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📡 Environment: ${NODE_ENV}`);
  logger.info(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
});

export default app;
