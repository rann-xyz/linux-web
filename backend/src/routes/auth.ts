import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Login endpoint
router.post('/login', asyncHandler(async (req, res) => {
  logger.info('Login endpoint called');
  res.json({ message: 'Login not yet implemented' });
}));

// Register endpoint
router.post('/register', asyncHandler(async (req, res) => {
  logger.info('Register endpoint called');
  res.json({ message: 'Register not yet implemented' });
}));

export default router;
