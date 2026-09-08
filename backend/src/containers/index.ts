import { Docker } from 'dockerode';
import { db } from '../database/index.js';
import { AUDIT_EVENTS } from '../auth/crypto.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const DEFAULT_CONTAINER_CONFIG = {
  Image: 'ubuntu:24.04',
  Env: ['TERM=xterm-256color', 'LC_ALL=en_US.UTF-8', 'LANG=en_US.UTF-8'],
  HostConfig: {
    Memory: (parseInt(process.env.MAX_MEMORY_MB || '512', 10)) * 1024 * 1024,
    NanoCpus: parseInt(process.env.MAX_CPU_CORES || '1', 10) * 1e9,
    PidsLimit: parseInt(process.env.MAX_PROCESSES || '50', 10),
    Binds: [],
    CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges'],
    ReadonlyRootfs: false,
    LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
  },
  AttachStdin: true,
  AttachStdout: true,
  AttachStderr: true,
  Tty: true,
  OpenStdin: true,
  StdinOnce: false,
};

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/data/users';

export interface ContainerInfo {
  id: string;
  userId: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
}

export async function getOrCreateContainer(userId: string): Promise<{ containerId: string; container: Docker.Container }> {
  // Check if user already has a container
  const existingResult = await db.query(
    `SELECT container_id FROM terminal_sessions
     WHERE user_id = $1 AND status = 'ACTIVE'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  if (existingResult.rows.length > 0) {
    const containerId = existingResult.rows[0].container_id;
    try {
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      if (info.State.Running) {
        return { containerId, container };
      }
    } catch {
      // Container doesn't exist or not running, create new one
    }
  }

  // Create new container
  const containerName = `terminal-user-${userId.slice(0, 8)}`;
  const userStoragePath = `${STORAGE_ROOT}/${userId}`;

  const config = {
    ...DEFAULT_CONTAINER_CONFIG,
    name: containerName,
    HostConfig: {
      ...DEFAULT_CONTAINER_CONFIG.HostConfig,
      Binds: [`${userStoragePath}:/home/user:rw`],
    },
    WorkingDir: '/home/user',
    Cmd: ['/bin/bash', '-l'],
  };

  const container = await docker.createContainer(config);
  await container.start();

  // Store in database
  await db.query(
    `INSERT INTO terminal_sessions (user_id, container_id, status, created_at, last_activity)
     VALUES ($1, $2, 'ACTIVE', NOW(), NOW())`,
    [userId, container.id]
  );

  // Audit log
  await db.query(
    `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
    [userId, AUDIT_EVENTS.CONTAINER_CREATED, JSON.stringify({ container_id: container.id, container_name: containerName })]
  );

  // Create default directories
  try {
    const exec = await container.exec({
      Cmd: ['bash', '-c', 'mkdir -p projects documents downloads && echo "Initialized"'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch {
    // Ignore exec errors
  }

  return { containerId: container.id, container };
}

export async function getContainerStats(containerId: string): Promise<{
  cpu: number;
  memory: { used: number; limit: number };
}> {
  try {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100 : 0;

    return {
      cpu: Math.round(cpuPercent * 10) / 10,
      memory: {
        used: Math.round((stats.memory_stats.usage || 0) / (1024 * 1024) * 10) / 10,
        limit: Math.round((stats.memory_stats.limit || 0) / (1024 * 1024)),
      },
    };
  } catch {
    return { cpu: 0, memory: { used: 0, limit: 0 } };
  }
}

export async function terminateContainer(containerId: string, userId: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 5 });
    await container.remove({ force: true, v: false });

    await db.query(
      `UPDATE terminal_sessions SET status = 'TERMINATED', last_activity = NOW() WHERE container_id = $1`,
      [containerId]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, event, metadata) VALUES ($1, $2, $3)`,
      [userId, AUDIT_EVENTS.CONTAINER_DESTROYED, JSON.stringify({ container_id: containerId })]
    );

    return true;
  } catch (err) {
    console.error('Failed to terminate container:', err);
    return false;
  }
}

export async function listUserContainers(userId: string): Promise<ContainerInfo[]> {
  const result = await db.query(
    `SELECT ts.*, ts.container_id as id FROM terminal_sessions ts
     WHERE ts.user_id = $1
     ORDER BY ts.created_at DESC`,
    [userId]
  );

  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    name: `terminal-user-${row.user_id.slice(0, 8)}`,
    status: row.status === 'ACTIVE' ? 'running' : 'stopped',
    createdAt: new Date(row.created_at),
  }));
}

export async function ensureStorageDirectory(userId: string): Promise<string> {
  const userStoragePath = `${STORAGE_ROOT}/${userId}`;
  
  // This runs on the host, not in a container
  const fs = await import('fs/promises');
  const path = await import('path');

  try {
    await fs.mkdir(path.join(userStoragePath, 'projects'), { recursive: true });
    await fs.mkdir(path.join(userStoragePath, 'documents'), { recursive: true });
    await fs.mkdir(path.join(userStoragePath, 'downloads'), { recursive: true });
  } catch {
    // Directories may already exist
  }

  return userStoragePath;
}

export async function getStorageUsage(userId: string): Promise<{ used: number; total: number }> {
  const userStoragePath = `${STORAGE_ROOT}/${userId}`;
  const maxStorageGB = parseFloat(process.env.MAX_STORAGE_GB || '5');
  
  try {
    const fs = await import('fs/promises');
    const size = await getDirectorySize(userStoragePath);
    return {
      used: Math.round(size / (1024 * 1024 * 1024) * 100) / 100,
      total: maxStorageGB,
    };
  } catch {
    return { used: 0, total: maxStorageGB };
  }
}

async function getDirectorySize(dir: string): Promise<number> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  let size = 0;
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        size += await getDirectorySize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        size += stat.size;
      }
    }
  } catch {
    // Ignore errors
  }
  
  return size;
}

export { docker };