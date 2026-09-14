import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get terminal sessions
router.get('/sessions', authenticate, asyncHandler(async (req, res) => {
  logger.info(`Getting sessions for user ${req.userId}`);
  res.json({ sessions: [] });
}));

// Create terminal session
router.post('/sessions', authenticate, asyncHandler(async (req, res) => {
  logger.info(`Creating session for user ${req.userId}`);
  res.json({ sessionId: 'temp-id' });
}));

export default router;
