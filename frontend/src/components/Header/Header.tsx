'use client';

interface User {
  id: string;
  email: string;
  role: string;
}

interface HeaderProps {
  user: User;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  onLogout: () => void;
}

export function Header({ user, connectionStatus, onLogout }: HeaderProps) {
  const statusColor = {
    connected: 'text-[#3fb950]',
    disconnected: 'text-[#f85149]',
    connecting: 'text-[#d29922]',
  }[connectionStatus];

  const statusText = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
  }[connectionStatus];

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">⌨️</span>
          <h1 className="text-lg font-semibold text-[#c9d1d9]">
            Ubuntu Cloud Terminal
          </h1>
        </div>
        <div className="hidden sm:block w-px h-6 bg-[#30363d]" />
        <div className="hidden sm:flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-[#3fb950]' : connectionStatus === 'connecting' ? 'bg-[#d29922] animate-pulse' : 'bg-[#f85149]'}`} />
          <span className={`text-sm ${statusColor}`}>{statusText}</span>
        </div>
      </div>

      {/* Right: User & Actions */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#238636] flex items-center justify-center text-white text-sm font-medium">
            {user.email[0].toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm text-[#c9d1d9]">{user.email}</div>
            <div className="text-xs text-[#6e7681]">{user.role}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-1.5 text-sm bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[#c9d1d9] transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}