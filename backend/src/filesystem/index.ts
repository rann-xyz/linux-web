import * as nodePath from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/data/users';

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
  permissions: string;
}

export interface PathValidationResult {
  valid: boolean;
  error?: string;
  resolvedPath?: string;
}

function validateUserPath(userId: string, requestedPath: string): PathValidationResult {
  const normalized = nodePath.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');

  const userRoot = nodePath.join(STORAGE_ROOT, userId);
  const fullPath = nodePath.join(userRoot, normalized);

  const resolved = nodePath.resolve(fullPath);

  if (!resolved.startsWith(userRoot + nodePath.sep) && resolved !== userRoot) {
    return {
      valid: false,
      error: 'Access denied: path outside user storage',
    };
  }

  const dangerousPatterns = [
    /^\.\./,
    /\.\.\//,
    /\/etc\/passwd/,
    /\/etc\/shadow/,
    /\/etc\/sudoers/,
    /\/var\/run\/docker\.sock/,
    /\/proc\//,
    /\/sys\//,
    /^\//,
    /^[A-Z]:\\/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(requestedPath) || pattern.test(resolved)) {
      return {
        valid: false,
        error: 'Access denied: invalid path pattern',
      };
    }
  }

  return {
    valid: true,
    resolvedPath: resolved,
  };
}

function getPermissions(mode: number): string {
  const chars = 'rwxrwxrwx';
  const bits = [
    (mode >> 8) & 1 ? 1 : 0,
    (mode >> 7) & 1 ? 1 : 0,
    (mode >> 6) & 1 ? 1 : 0,
    (mode >> 5) & 1 ? 1 : 0,
    (mode >> 4) & 1 ? 1 : 0,
    (mode >> 3) & 1 ? 1 : 0,
    (mode >> 2) & 1 ? 1 : 0,
    (mode >> 1) & 1 ? 1 : 0,
    (mode >> 0) & 1 ? 1 : 0,
  ];
  return bits.map((bit, i) => bit ? chars[i] : '-').join('');
}

export async function listFiles(userId: string, dirPath: string = ''): Promise<FileInfo[]> {
  const validation = validateUserPath(userId, dirPath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const targetPath = validation.resolvedPath!;

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      const entryPath = nodePath.join(targetPath, entry.name);

      try {
        const stat = await fs.stat(entryPath);
        files.push({
          name: entry.name,
          path: nodePath.relative(nodePath.join(STORAGE_ROOT, userId), entryPath),
          isDirectory: entry.isDirectory(),
          size: stat.size,
          modifiedAt: stat.mtime,
          permissions: getPermissions(stat.mode),
        });
      } catch {
        // Skip files we can't stat
      }
    }

    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return files;
  } catch (err) {
    throw new Error(`Failed to list files: ${(err as Error).message}`);
  }
}

export async function createDirectory(userId: string, dirPath: string): Promise<void> {
  const validation = validateUserPath(userId, dirPath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    await fs.mkdir(validation.resolvedPath!, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create directory: ${(err as Error).message}`);
  }
}

export async function deleteFile(userId: string, filePath: string): Promise<void> {
  const validation = validateUserPath(userId, filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    const stat = await fs.stat(validation.resolvedPath!);
    if (stat.isDirectory()) {
      await fs.rm(validation.resolvedPath!, { recursive: true });
    } else {
      await fs.unlink(validation.resolvedPath!);
    }
  } catch (err) {
    throw new Error(`Failed to delete: ${(err as Error).message}`);
  }
}

export async function renameFile(userId: string, oldPath: string, newPath: string): Promise<void> {
  const oldValidation = validateUserPath(userId, oldPath);
  if (!oldValidation.valid) {
    throw new Error(oldValidation.error);
  }

  const newValidation = validateUserPath(userId, newPath);
  if (!newValidation.valid) {
    throw new Error(newValidation.error);
  }

  try {
    await fs.rename(oldValidation.resolvedPath!, newValidation.resolvedPath!);
  } catch (err) {
    throw new Error(`Failed to rename: ${(err as Error).message}`);
  }
}

export async function readFileContent(userId: string, filePath: string): Promise<string> {
  const validation = validateUserPath(userId, filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    const stat = await fs.stat(validation.resolvedPath!);
    if (stat.isDirectory()) {
      throw new Error('Cannot read directory');
    }
    if (stat.size > 1024 * 1024) {
      throw new Error('File too large (max 1MB)');
    }
    return await fs.readFile(validation.resolvedPath!, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read file: ${(err as Error).message}`);
  }
}

export async function writeFileContent(userId: string, filePath: string, content: string): Promise<void> {
  const validation = validateUserPath(userId, filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    await fs.writeFile(validation.resolvedPath!, content, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write file: ${(err as Error).message}`);
  }
}

export async function getFileStream(userId: string, filePath: string): Promise<{ stream: ReturnType<typeof createReadStream>; filename: string; size: number }> {
  const validation = validateUserPath(userId, filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const stat = await fs.stat(validation.resolvedPath!);
  if (stat.isDirectory()) {
    throw new Error('Cannot download directory');
  }

  return {
    stream: createReadStream(validation.resolvedPath!),
    filename: nodePath.basename(validation.resolvedPath!),
    size: stat.size,
  };
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\/\\..]/g, '')
    .replace(/[<>:"|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 255);
}