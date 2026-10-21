import React, { useEffect, useState } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { CollaborationUser } from '../../hooks/useCollaboration';

export interface CollaboratorItem {
  clientID: number;
  id?: string;
  name: string;
  color: string;
  isSelf: boolean;
}

export interface CollaboratorListProps {
  provider: HocuspocusProvider | null;
  currentUser?: CollaborationUser | null;
  className?: string;
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const CollaboratorList: React.FC<CollaboratorListProps> = ({
  provider,
  className = '',
}) => {
  const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([]);

  useEffect(() => {
    if (!provider || !provider.awareness) {
      setCollaborators([]);
      return;
    }

    const awareness = provider.awareness;

    const handleAwarenessChange = () => {
      const states = awareness.getStates();
      const list: CollaboratorItem[] = [];
      const seenIds = new Set<string>();

      states.forEach((state: any, clientID: number) => {
        if (state.user && state.user.name) {
          const userKey = state.user.id || String(clientID);
          // Avoid duplicate client entries if same user opened multiple tabs or reconnects
          if (!seenIds.has(userKey)) {
            seenIds.add(userKey);
            list.push({
              clientID,
              id: state.user.id,
              name: state.user.name,
              color: state.user.color || '#3B82F6',
              isSelf: clientID === awareness.clientID,
            });
          }
        }
      });

      // Sort: self first, then alphabetically
      list.sort((a, b) => {
        if (a.isSelf) return -1;
        if (b.isSelf) return 1;
        return a.name.localeCompare(b.name);
      });

      setCollaborators(list);
    };

    // Initial state read
    handleAwarenessChange();

    awareness.on('change', handleAwarenessChange);

    return () => {
      awareness.off('change', handleAwarenessChange);
    };
  }, [provider]);

  if (!collaborators.length) {
    return null;
  }

  const maxVisible = 4;
  const visible = collaborators.slice(0, maxVisible);
  const extraCount = collaborators.length - maxVisible;

  return (
    <div
      className={`flex items-center -space-x-1.5 hover:space-x-1 transition-all ${className}`}
      aria-label="Active collaborators"
    >
      {visible.map((collab) => (
        <div
          key={`${collab.clientID}-${collab.id || collab.name}`}
          className="relative group"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs border-2 border-white ring-1 ring-black/5 select-none transition-transform hover:scale-110 cursor-pointer"
            style={{ backgroundColor: collab.color }}
            title={`${collab.name}${collab.isSelf ? ' (You)' : ''}`}
            data-testid={`avatar-${collab.name.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {getInitials(collab.name)}
          </div>

          {/* Floating Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex items-center px-2 py-0.5 rounded bg-gray-900 text-white text-[11px] font-medium whitespace-nowrap shadow-md pointer-events-none z-30">
            {collab.name}
            {collab.isSelf && <span className="ml-1 text-gray-300 font-normal">(You)</span>}
          </div>
        </div>
      ))}

      {extraCount > 0 && (
        <div
          className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-semibold shadow-xs border-2 border-white select-none"
          title={`${extraCount} more collaborator${extraCount > 1 ? 's' : ''}`}
        >
          +{extraCount}
        </div>
      )}
    </div>
  );
};
