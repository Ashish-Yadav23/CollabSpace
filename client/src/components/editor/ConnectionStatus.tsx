import React from 'react';
import type { ConnectionStatus as ConnectionStatusType } from '../../types';
import { WifiOff, RefreshCw } from 'lucide-react';

export interface ConnectionStatusProps {
  status: ConnectionStatusType;
  isReadOnly?: boolean;
  onReconnect?: () => void;
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  isReadOnly = false,
  onReconnect,
  className = '',
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Connected
          </span>
        );
      case 'syncing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
            Syncing...
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            Connecting...
          </span>
        );
      case 'disconnected':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <WifiOff className="w-3 h-3 text-rose-500" />
            Disconnected
            {onReconnect && (
              <button
                type="button"
                onClick={onReconnect}
                className="ml-1 underline font-semibold hover:text-rose-900"
              >
                Retry
              </button>
            )}
          </span>
        );
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {getStatusBadge()}
      {isReadOnly && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
          Read-Only
        </span>
      )}
    </div>
  );
};
