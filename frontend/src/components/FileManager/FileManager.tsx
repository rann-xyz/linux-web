'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  permissions: string;
}

interface FileManagerProps {
  token: string;
  currentPath: string;
  onPathChange: (path: string) => void;
}

export function FileManager({ token, currentPath, onPathChange }: FileManagerProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [currentPath]);

  const fetchFiles = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/files?dir=${encodeURIComponent(currentPath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      } else {
        setError('Failed to load files');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/api/files/upload?path=${encodeURIComponent(currentPath)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        fetchFiles();
      }
    } catch {
      setError('Upload failed');
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm('Delete this file?')) return;

    try {
      const res = await fetch(`${API_URL}/api/files?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchFiles();
      }
    } catch {
      setError('Delete failed');
    }
  };

  const handleMkdir = async () => {
    const name = prompt('Directory name:');
    if (!name) return;

    try {
      const res = await fetch(`${API_URL}/api/files/mkdir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path: `${currentPath}/${name}` }),
      });
      if (res.ok) {
        fetchFiles();
      }
    } catch {
      setError('Create directory failed');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const navigateTo = (path: string, isDir: boolean) => {
    if (isDir) {
      onPathChange(path);
    } else {
      setSelectedFile(path);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={handleMkdir}
          className="px-3 py-1.5 text-sm bg-[#238636] hover:bg-[#2ea043] text-white rounded"
        >
          + New Folder
        </button>
        <label className="px-3 py-1.5 text-sm bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded cursor-pointer">
          ↑ Upload
          <input type="file" className="hidden" onChange={handleUpload} />
        </label>
        <button
          onClick={fetchFiles}
          className="px-3 py-1.5 text-sm bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded"
        >
          ↻ Refresh
        </button>
        <div className="flex-1" />
        <span className="text-sm text-[#8b949e]">{currentPath || '/'}</span>
      </div>

      {/* Breadcrumb */}
      {currentPath && (
        <div className="flex items-center gap-1 mb-2 text-sm">
          <button
            onClick={() => onPathChange('')}
            className="text-[#58a6ff] hover:underline"
          >
            Home
          </button>
          {currentPath.split('/').filter(Boolean).map((segment, i, arr) => (
            <span key={i} className="flex items-center">
              <span className="text-[#6e7681] mx-1">/</span>
              <button
                onClick={() => onPathChange(arr.slice(0, i + 1).join('/'))}
                className="text-[#58a6ff] hover:underline"
              >
                {segment}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* File List */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[#8b949e]">Loading...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[#f85149]">{error}</span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[#8b949e] border-b border-[#30363d]">
              <tr>
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Size</th>
                <th className="py-2 px-2">Modified</th>
                <th className="py-2 px-2">Permissions</th>
                <th className="py-2 px-2 w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Parent directory link */}
              {currentPath && (
                <tr
                  className="border-b border-[#21262d] hover:bg-[#161b22] cursor-pointer"
                  onClick={() => onPathChange(currentPath.split('/').slice(0, -1).join('/'))}
                >
                  <td className="py-2 px-2 text-[#58a6ff]">📁 ..</td>
                  <td className="py-2 px-2 text-[#6e7681]">-</td>
                  <td className="py-2 px-2 text-[#6e7681]">-</td>
                  <td className="py-2 px-2 text-[#6e7681]">-</td>
                  <td className="py-2 px-2"></td>
                </tr>
              )}
              {files.map((file) => (
                <tr
                  key={file.path}
                  className="border-b border-[#21262d] hover:bg-[#161b22] cursor-pointer"
                  onClick={() => navigateTo(file.path, file.isDirectory)}
                >
                  <td className="py-2 px-2">
                    <span className="mr-2">{file.isDirectory ? '📁' : '📄'}</span>
                    <span className={file.isDirectory ? 'text-[#58a6ff]' : 'text-[#c9d1d9]'}>
                      {file.name}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-[#6e7681]">
                    {file.isDirectory ? '-' : formatSize(file.size)}
                  </td>
                  <td className="py-2 px-2 text-[#6e7681]">
                    {formatDate(file.modifiedAt)}
                  </td>
                  <td className="py-2 px-2 text-[#6e7681] font-mono">
                    {file.permissions}
                  </td>
                  <td className="py-2 px-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file.path);
                      }}
                      className="text-[#f85149] hover:text-[#ffa198] text-xs"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#6e7681]">
                    No files in this directory
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}