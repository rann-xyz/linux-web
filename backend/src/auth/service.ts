import jwt from 'jsonwebtoken';
import { db } from '../database/index.js';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  isValidEmail,
  isValidPassword,
  isSessionExpired,
  isSessionIdle,
  calculateExpiresAt,
  AUDIT_EVENTS,
  type User,
} from './crypto.js';

const JWT_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = '7d';

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export async function register(email: string, password: string): Promise<AuthResult> {
  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid email format' };
  }

  const passwordCheck = isValidPassword(password);
  if (!passwordCheck.valid) {
    return { success: false, error: passwordCheck.error! };
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return { success: false, error: 'Email already registered' };
    }

    const passwordHash = await hashPassword(password);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, role, status, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'USER', 'ACTIVE', false, NOW(), NOW())
       RETURNING id, email, role, status, email_verified, created_at, updated_at`,
      [email, passwordHash]
    );

    const user = mapRowToUser(result.rows[0]);

    await db.query(
      `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
      [user.id, AUDIT_EVENTS.REGISTER, JSON.stringify({ email: user.email })]
    );

    return { success: true, user };
  } catch (err) {
    console.error('Registration error:', err);
    return { success: false, error: 'Registration failed' };
  }
}

export async function login(email: string, password: string, ip: string = 'unknown'): Promise<AuthResult> {
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      await logLoginFailure(null, email, ip, 'user_not_found');
      return { success: false, error: 'Invalid email or password' };
    }

    const userRow = result.rows[0];
    const user = mapRowToUser(userRow);

    if (user.status !== 'ACTIVE') {
      await logLoginFailure(user.id, email, ip, 'account_' + user.status.toLowerCase());
      return { success: false, error: 'Account is not active' };
    }

    const validPassword = await verifyPassword(password, userRow.password_hash as string);
    if (!validPassword) {
      await logLoginFailure(user.id, email, ip, 'invalid_password');
      return { success: false, error: 'Invalid email or password' };
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const tokenHash = await hashToken(token);
    const expiresAt = calculateExpiresAt();

    await db.query(
      `INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_activity)
       VALUES ($1, $2, NOW(), $3, NOW())`,
      [user.id, tokenHash, expiresAt]
    );

    await db.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [user.id]);

    await db.query(
      `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
      [user.id, AUDIT_EVENTS.LOGIN_SUCCESS, JSON.stringify({ ip })]
    );

    return { success: true, user, token };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, error: 'Login failed' };
  }
}

export async function logout(token: string): Promise<boolean> {
  try {
    const decoded = verifyToken(token);
    if (!decoded) return false;

    await db.query(
      `UPDATE sessions SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [decoded.userId]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
      [decoded.userId, AUDIT_EVENTS.LOGOUT, JSON.stringify({})]
    );

    return true;
  } catch {
    return false;
  }
}

export async function getUserFromToken(token: string): Promise<User | null> {
  try {
    const decoded = verifyToken(token);
    if (!decoded) return null;

    const sessionResult = await db.query(
      `SELECT * FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [decoded.userId]
    );

    if (sessionResult.rows.length === 0) return null;

    const session = sessionResult.rows[0];

    if (isSessionExpired(new Date(session.expires_at as Date))) {
      await db.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);
      return null;
    }

    if (isSessionIdle(new Date(session.last_activity as Date))) {
      await db.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);
      return null;
    }

    await db.query('UPDATE sessions SET last_activity = NOW() WHERE id = $1', [session.id]);

    const userResult = await db.query(
      'SELECT * FROM users WHERE id = $1 AND status = $2',
      [decoded.userId, 'ACTIVE']
    );

    if (userResult.rows.length === 0) return null;

    return mapRowToUser(userResult.rows[0]);
  } catch {
    return null;
  }
}

export function verifyToken(token: string): { userId: string; email: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string };
  } catch {
    return null;
  }
}

export async function verifyAdmin(token: string): Promise<boolean> {
  const user = await getUserFromToken(token);
  return user?.role === 'ADMIN';
}

async function logLoginFailure(
  userId: string | null,
  email: string,
  ip: string,
  reason: string
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
      [userId, AUDIT_EVENTS.LOGIN_FAILURE, JSON.stringify({ email, ip, reason })]
    );
  } catch {
    // Don't fail login just because audit logging fails
  }
}

function mapRowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as 'USER' | 'ADMIN',
    status: row.status as 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED',
    email_verified: Boolean(row.email_verified),
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}