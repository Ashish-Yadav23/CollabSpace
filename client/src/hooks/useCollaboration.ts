import { useEffect, useState, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { ConnectionStatus, DocumentRole } from '../types';
import { api } from '../lib/api';

export interface CollaborationUser {
  id?: string;
  name: string;
  color: string;
}

export interface UseCollaborationOptions {
  documentId: string;
  token?: string;
  role?: DocumentRole;
  user?: CollaborationUser;
  wsUrl?: string;
  autoConnect?: boolean;
}

export interface UseCollaborationReturn {
  doc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  status: ConnectionStatus;
  isSynced: boolean;
  isReadOnly: boolean;
  error: string | null;
  currentUser: CollaborationUser | null;
  reconnect: () => void;
  sendToken: (newToken?: string) => void;
  updateUser: (user: CollaborationUser) => void;
}

export function normalizeWsUrl(url?: string): string {
  if (!url) {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return `wss://${window.location.host}/ws`;
    }
    return 'ws://localhost:1234';
  }

  let normalized = url.trim();

  // Convert HTTP/HTTPS schemes to WS/WSS
  if (normalized.startsWith('https://')) {
    normalized = normalized.replace(/^https:\/\//, 'wss://');
  } else if (normalized.startsWith('http://')) {
    normalized = normalized.replace(/^http:\/\//, 'ws://');
  } else if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    normalized = `${isHttps ? 'wss://' : 'ws://'}${normalized}`;
  }

  // Automatic upgrade to wss:// on HTTPS pages for external hosts to prevent mixed-content blocks
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    normalized.startsWith('ws://') &&
    !normalized.includes('localhost') &&
    !normalized.includes('127.0.0.1')
  ) {
    normalized = normalized.replace(/^ws:\/\//, 'wss://');
  }

  return normalized;
}

const DEFAULT_WS_URL = normalizeWsUrl(import.meta.env.VITE_COLLAB_WS_URL);

export function useCollaboration({
  documentId,
  token: initialToken,
  role: initialRole,
  user: initialUser,
  wsUrl = DEFAULT_WS_URL,
  autoConnect = true,
}: UseCollaborationOptions): UseCollaborationReturn {
  const resolvedWsUrl = normalizeWsUrl(wsUrl);
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(initialRole === 'viewer');
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CollaborationUser | null>(initialUser || null);

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const currentUserRef = useRef<CollaborationUser | null>(initialUser || null);

  useEffect(() => {
    if (initialUser) {
      setCurrentUser(initialUser);
      currentUserRef.current = initialUser;
      if (providerRef.current) {
        providerRef.current.setAwarenessField('user', initialUser);
      }
    }
  }, [initialUser]);

  useEffect(() => {
    if (initialRole) {
      setIsReadOnly(initialRole === 'viewer');
    }
  }, [initialRole]);

  useEffect(() => {
    if (!documentId || !autoConnect) {
      return;
    }

    const ydoc = new Y.Doc();
    docRef.current = ydoc;
    setDoc(ydoc);
    setError(null);
    setIsSynced(false);
    setConnectionState('connecting');

    const hocuspocusProvider = new HocuspocusProvider({
      url: resolvedWsUrl,
      name: `document.${documentId}`,
      document: ydoc,
      token: async () => {
        if (initialToken) {
          return initialToken;
        }
        try {
          const res = await api.documents.getToken(documentId);
          setIsReadOnly(res.role === 'viewer');
          if (res.user) {
            const resolvedUser: CollaborationUser = {
              id: res.user.id,
              name: res.user.name,
              color: res.user.color,
            };
            setCurrentUser(resolvedUser);
            currentUserRef.current = resolvedUser;
            hocuspocusProvider.setAwarenessField('user', resolvedUser);
          }
          return res.token;
        } catch (err: any) {
          const msg = err.message || 'Failed to acquire document token';
          setError(msg);
          throw err;
        }
      },
      onStatus: ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => {
        setConnectionState(status);
      },
      onSynced: ({ state }: { state: boolean }) => {
        setIsSynced(state);
      },
      onAuthenticated: () => {
        setError(null);
        if (currentUserRef.current) {
          hocuspocusProvider.setAwarenessField('user', currentUserRef.current);
        }
      },
      onAuthenticationFailed: ({ reason }: { reason: string }) => {
        setError(reason || 'Collaboration authentication failed');
      },
      onClose: () => {
        setConnectionState('disconnected');
      },
      onDisconnect: () => {
        setConnectionState('disconnected');
      },
    });

    // If initial user is present, initialize awareness right away
    if (currentUserRef.current) {
      hocuspocusProvider.setAwarenessField('user', currentUserRef.current);
    }

    providerRef.current = hocuspocusProvider;
    setProvider(hocuspocusProvider);

    return () => {
      hocuspocusProvider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      docRef.current = null;
      setProvider(null);
      setDoc(null);
      setIsSynced(false);
    };
  }, [documentId, initialToken, wsUrl, autoConnect]);

  const reconnect = useCallback(() => {
    if (providerRef.current) {
      setError(null);
      if (providerRef.current.configuration.websocketProvider) {
        providerRef.current.configuration.websocketProvider.connect();
      } else {
        providerRef.current.connect();
      }
    }
  }, []);

  const sendToken = useCallback((newToken?: string) => {
    if (providerRef.current) {
      if (newToken) {
        providerRef.current.configuration.token = newToken;
      }
      providerRef.current.sendToken();
    }
  }, []);

  const updateUser = useCallback((updatedUser: CollaborationUser) => {
    setCurrentUser(updatedUser);
    currentUserRef.current = updatedUser;
    if (providerRef.current) {
      providerRef.current.setAwarenessField('user', updatedUser);
    }
  }, []);

  // Compute composite 4-state status
  let compositeStatus: ConnectionStatus = 'connecting';
  if (connectionState === 'disconnected') {
    compositeStatus = 'disconnected';
  } else if (connectionState === 'connected') {
    compositeStatus = isSynced ? 'connected' : 'syncing';
  } else {
    compositeStatus = 'connecting';
  }

  return {
    doc,
    provider,
    status: compositeStatus,
    isSynced,
    isReadOnly,
    error,
    currentUser,
    reconnect,
    sendToken,
    updateUser,
  };
}
