import { getAuthToken } from './token';
import type { User, DocumentMeta, AuthResponse, DocTokenResponse, DocumentRole } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api\/?$/, '');

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMessage = (body && typeof body === 'object' && body.error) 
      || (body && typeof body === 'object' && body.message)
      || `Request failed with status ${response.status}`;
    throw new ApiError(errorMessage, response.status, body);
  }

  return body as T;
}

export const api = {
  // Authentication
  auth: {
    register: (data: { email: string; password: string; name: string; color?: string }) =>
      request<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    login: (data: { email: string; password: string }) =>
      request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getMe: () =>
      request<{ user: User }>('/api/auth/me'),
  },

  // Document Management
  documents: {
    list: () =>
      request<{ documents: DocumentMeta[] }>('/api/documents'),

    create: (data?: { title?: string; isPublic?: boolean; publicRole?: 'editor' | 'viewer' }) =>
      request<{ document: DocumentMeta }>('/api/documents', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),

    get: (id: string) =>
      request<{ document: DocumentMeta; role: DocumentRole }>(`/api/documents/${id}`),

    update: (id: string, data: { isPublic?: boolean; publicRole?: 'editor' | 'viewer' }) =>
      request<{ document: DocumentMeta }>(`/api/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<{ message: string }>(`/api/documents/${id}`, {
        method: 'DELETE',
      }),

    getToken: (id: string) =>
      request<DocTokenResponse>(`/api/documents/${id}/token`, {
        method: 'POST',
      }),

    addCollaborator: (id: string, data: { email: string; role: 'editor' | 'viewer' }) =>
      request<{ collaborators: any[] }>(`/api/documents/${id}/collaborators`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateCollaborator: (id: string, userId: string, data: { role: 'editor' | 'viewer' }) =>
      request<{ collaborators: any[] }>(`/api/documents/${id}/collaborators/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    removeCollaborator: (id: string, userId: string) =>
      request<{ collaborators: any[] }>(`/api/documents/${id}/collaborators/${userId}`, {
        method: 'DELETE',
      }),
  },
};
