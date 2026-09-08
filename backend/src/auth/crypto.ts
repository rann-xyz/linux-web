import crypto from 'crypto';

const SESSION_IDLE_TIMEOUT = parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '60', 10) * 60 * 1000;
const SESSION_MAX_LIFETIME = parseInt(process.env.SESSION_MAX_LIFETIME_HOURS || '168', 10) * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

export interface User {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  last_activity: Date;
  revoked_at: Date | null;
}

export interface AuditEvent {
  id?: string;
  user_id: string | null;
  event: string;
  metadata: Record<string, unknown>;
  created_at?: Date;
}

// ─── Password Hashing (Argon2id via argon2, fallback bcrypt) ───────────────

export async function hashPassword(password: string): Promise<string> {
  // Use bcrypt as fallback (Argon2 requires native module)
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const bcrypt = await import('bcryptjs');
    return bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// ─── Token Hashing (SHA-256 scrypt) ───────────────────────────────────────

export async function hashToken(token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = process.env.SESSION_SECRET?.slice(0, 16) || 'terminalsalt123';
    crypto.scrypt(Buffer.from(token), salt, 32, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

// ─── Session ID Generation ─────────────────────────────────────────────────

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
}

// ─── Timeout Checks ─────────────────────────────────────────────────────────

export function isSessionExpired(expiresAt: Date): boolean {
  return new Date() > new Date(expiresAt);
}

export function isSessionIdle(lastActivity: Date): boolean {
  const now = Date.now();
  const last = new Date(lastActivity).getTime();
  return now - last > SESSION_IDLE_TIMEOUT;
}

export function calculateExpiresAt(): Date {
  return new Date(Date.now() + SESSION_MAX_LIFETIME);
}

// ─── Audit Logging ──────────────────────────────────────────────────────────

export const AUDIT_EVENTS = {
  REGISTER: 'REGISTER',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS: 'PASSWORD_RESET_SUCCESS',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  TERMINAL_CREATED: 'TERMINAL_CREATED',
  TERMINAL_DESTROYED: 'TERMINAL_DESTROYED',
  CONTAINER_CREATED: 'CONTAINER_CREATED',
  CONTAINER_DESTROYED: 'CONTAINER_DESTROYED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  FILE_UPLOAD: 'FILE_UPLOAD',
  FILE_DELETE: 'FILE_DELETE',
} as const;