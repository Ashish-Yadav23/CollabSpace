// Shared TypeScript interfaces and types for the client
// Populated in Phase 2 onwards alongside their implementing components

export interface User {
  id: string;
  email: string;
  name: string;
  color: string;
}

export interface DocumentCollaborator {
  userId: string;
  role: 'editor' | 'viewer';
  user?: {
    id: string;
    name: string;
    email: string;
    color: string;
  };
}

export interface DocumentMeta {
  id: string;
  title: string;
  previewText?: string;
  ownerId: string;
  collaborators?: DocumentCollaborator[];
  isPublic: boolean;
  publicRole: 'editor' | 'viewer';
  userRole?: DocumentRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface DocTokenResponse {
  token: string;
  documentId: string;
  role: DocumentRole;
  user: {
    id: string;
    name: string;
    color: string;
  };
}

export type ConnectionStatus = 'connecting' | 'connected' | 'syncing' | 'disconnected';
export type DocumentRole = 'owner' | 'editor' | 'viewer';

