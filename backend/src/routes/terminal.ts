import { Router, Request, Response } from 'express';
import pool from '../db/connection.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @route GET /api/terminal/sessions
 * @desc Get all terminal sessions for user
 */
router.get('/sessions', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, status, created_at, last_activity FROM terminal_sessions 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [req.userId]
    );

    res.json({
      success: true,
      sessions: result.rows
    });
  } catch (error) {
    logger.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
}));

/**
 * @route POST /api/terminal/sessions
 * @desc Create new terminal session
 */
router.post('/sessions', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `INSERT INTO terminal_sessions (user_id, status, created_at, updated_at, last_activity)
       VALUES ($1, $2, NOW(), NOW(), NOW())
       RETURNING id, status, created_at`,
      [req.userId, 'ACTIVE']
    );

    const session = result.rows[0];
    logger.info(`✅ Terminal session created: ${session.id}`);

    res.status(201).json({
      success: true,
      message: 'Session created',
      session
    });
  } catch (error) {
    logger.error('Create session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session'
    });
  }
}));

/**
 * @route GET /api/terminal/sessions/:id
 * @desc Get specific terminal session
 */
router.get('/sessions/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM terminal_sessions 
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session: result.rows[0]
    });
  } catch (error) {
    logger.error('Get session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session'
    });
  }
}));

/**
 * @route DELETE /api/terminal/sessions/:id
 * @desc Delete terminal session
 */
router.delete('/sessions/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM terminal_sessions 
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    logger.info(`✅ Terminal session deleted: ${req.params.id}`);

    res.json({
      success: true,
      message: 'Session deleted'
    });
  } catch (error) {
    logger.error('Delete session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete session'
    });
  }
}));

export default router;
