import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// List containers
router.get('/', authenticate, asyncHandler(async (req, res) => {
  logger.info(`Listing containers for user ${req.userId}`);
  res.json({ containers: [] });
}));

// Execute command in container
router.post('/:containerId/exec', authenticate, asyncHandler(async (req, res) => {
  logger.info(`Executing command in container ${req.params.containerId}`);
  res.json({ output: '' });
}));

export default router;
