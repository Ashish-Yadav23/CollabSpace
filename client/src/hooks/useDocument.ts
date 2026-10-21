import { useState, useCallback } from 'react';
import { api, ApiError } from '../lib/api';
import type { DocumentMeta, DocumentRole, DocTokenResponse } from '../types';

export function useDocument() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async (): Promise<DocumentMeta[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.documents.list();
      setDocuments(response.documents);
      return response.documents;
    } catch (err: any) {
      const message = err instanceof ApiError ? err.message : err?.message || 'Failed to fetch documents';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createDocument = useCallback(
    async (data?: {
      title?: string;
      isPublic?: boolean;
      publicRole?: 'editor' | 'viewer';
    }): Promise<DocumentMeta> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await api.documents.create(data);
        setDocuments((prev) => [response.document, ...prev]);
        return response.document;
      } catch (err: any) {
        const message = err instanceof ApiError ? err.message : err?.message || 'Failed to create document';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const getDocument = useCallback(
    async (id: string): Promise<{ document: DocumentMeta; role: DocumentRole }> => {
      try {
        return await api.documents.get(id);
      } catch (err: any) {
        const message = err instanceof ApiError ? err.message : err?.message || 'Failed to get document';
        setError(message);
        throw err;
      }
    },
    []
  );

  const updateSettings = useCallback(
    async (
      id: string,
      data: { isPublic?: boolean; publicRole?: 'editor' | 'viewer' }
    ): Promise<DocumentMeta> => {
      try {
        const response = await api.documents.update(id, data);
        setDocuments((prev) =>
          prev.map((doc) => (doc.id === id ? { ...doc, ...response.document } : doc))
        );
        return response.document;
      } catch (err: any) {
        const message = err instanceof ApiError ? err.message : err?.message || 'Failed to update document';
        setError(message);
        throw err;
      }
    },
    []
  );

  const deleteDocument = useCallback(async (id: string): Promise<void> => {
    try {
      await api.documents.delete(id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    } catch (err: any) {
      const message = err instanceof ApiError ? err.message : err?.message || 'Failed to delete document';
      setError(message);
      throw err;
    }
  }, []);

  const addCollaborator = useCallback(
    async (id: string, email: string, role: 'editor' | 'viewer'): Promise<void> => {
      try {
        await api.documents.addCollaborator(id, { email, role });
      } catch (err: any) {
        const message = err instanceof ApiError ? err.message : err?.message || 'Failed to add collaborator';
        setError(message);
        throw err;
      }
    },
    []
  );

  const removeCollaborator = useCallback(
    async (id: string, userId: string): Promise<void> => {
      try {
        await api.documents.removeCollaborator(id, userId);
      } catch (err: any) {
        const message = err instanceof ApiError ? err.message : err?.message || 'Failed to remove collaborator';
        setError(message);
        throw err;
      }
    },
    []
  );

  const getDocumentToken = useCallback(
    async (id: string): Promise<DocTokenResponse> => {
      try {
        return await api.documents.getToken(id);
      } catch (err: any) {
        const message = err instanceof ApiError ? err.message : err?.message || 'Failed to acquire document token';
        setError(message);
        throw err;
      }
    },
    []
  );

  return {
    documents,
    isLoading,
    error,
    fetchDocuments,
    createDocument,
    getDocument,
    updateSettings,
    deleteDocument,
    addCollaborator,
    removeCollaborator,
    getDocumentToken,
  };
}
