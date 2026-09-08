'use client';

import { useState } from 'react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const folders = [
  { name: 'Home', icon: '🏠', path: '' },
  { name: 'Projects', icon: '📁', path: 'projects' },
  { name: 'Documents', icon: '📄', path: 'documents' },
  { name: 'Downloads', icon: '⬇️', path: 'downloads' },
];

const terminals = [
  { name: 'Terminal 1', id: '1' },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [terminalsList, setTerminalsList] = useState(terminals);

  return (
    <aside className="w-48 flex-shrink-0 bg-[#161b22] border-r border-[#30363d] flex flex-col overflow-hidden">
      {/* Terminals Section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 border-b border-[#30363d]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
              TERMINALS
            </h3>
            <button
              className="text-[#3fb950] hover:text-[#56d364] text-lg"
              title="New Terminal"
              onClick={() => {
                const newId = String(terminalsList.length + 1);
                setTerminalsList([...terminalsList, { name: `Terminal ${newId}`, id: newId }]);
              }}
            >
              +
            </button>
          </div>
          <div className="space-y-1">
            {terminalsList.map((term) => (
              <button
                key={term.id}
                onClick={() => onTabChange('terminal')}
                className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ${
                  activeTab === 'terminal'
                    ? 'bg-[#21262d] text-[#c9d1d9]'
                    : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]'
                }`}
              >
                <span>⬢</span>
                <span className="truncate">{term.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Files Section */}
        <div className="p-3">
          <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
            FILES
          </h3>
          <div className="space-y-1">
            {folders.map((folder) => (
              <button
                key={folder.path}
                onClick={() => onTabChange('files')}
                className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ${
                  activeTab === 'files'
                    ? 'bg-[#21262d] text-[#c9d1d9]'
                    : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]'
                }`}
              >
                <span>{folder.icon}</span>
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}