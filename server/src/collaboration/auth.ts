import { onAuthenticatePayload, onTokenSyncPayload } from '@hocuspocus/server';
import { DocumentModel } from '../db/models/Document';
import { verifyToken, DocTokenPayload } from '../utils/tokens';
import { env } from '../config/env';

export interface CollaborationContext {
  user: {
    id: string;
    name: string;
    color: string;
  };
  role: 'owner' | 'editor' | 'viewer';
  documentId: string;
}

/**
 * Extracts and validates document ID from room name.
 * Format expected: "document.<documentId>" or raw "<documentId>".
 */
export function parseDocumentRoom(documentName: string): string {
  if (documentName.startsWith('document.')) {
    const docId = documentName.substring('document.'.length).trim();
    if (!docId) {
      throw new Error('Malformed document room name: missing document ID');
    }
    return docId;
  }

  if (/^doc_[A-Za-z0-9_-]+$/.test(documentName)) {
    return documentName;
  }

  throw new Error(`Invalid room name format '${documentName}'. Expected 'document.<documentId>'`);
}

/**
 * Verifies document membership and resolves current role from MongoDB.
 * Never trusts client or token role claims alone.
 */
async function resolveCurrentDocumentRole(
  documentId: string,
  userId: string
): Promise<'owner' | 'editor' | 'viewer'> {
  const doc = await DocumentModel.findById(documentId).select('ownerId collaborators isPublic publicRole');

  if (!doc) {
    throw new Error('Document not found or has been deleted');
  }

  const ownerIdStr = doc.ownerId.toString();
  if (userId && ownerIdStr === userId) {
    return 'owner';
  }

  if (userId && doc.collaborators && doc.collaborators.length > 0) {
    const collaborator = doc.collaborators.find((c) => c.userId.toString() === userId);
    if (collaborator) {
      return collaborator.role;
    }
  }

  if (doc.isPublic) {
    return doc.publicRole;
  }

  throw new Error('Access denied: You do not have permission to access this document');
}

/**
 * Hook invoked when client sends auth token during connection.
 */
export async function authenticateConnection(
  data: onAuthenticatePayload
): Promise<CollaborationContext> {
  const { token, documentName, connectionConfig } = data;

  // ── Origin verification for WebSockets (independent of REST CORS) ─────
  if (data.requestHeaders) {
    const rawOrigin =
      (data.requestHeaders as any)?.origin ||
      (typeof (data.requestHeaders as any)?.get === 'function'
        ? (data.requestHeaders as any).get('origin')
        : undefined);

    if (rawOrigin && typeof rawOrigin === 'string') {
      const allowedOrigins = env.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean);
      if (
        process.env.NODE_ENV === 'production' &&
        !allowedOrigins.includes(rawOrigin) &&
        !allowedOrigins.includes('*')
      ) {
        throw new Error(`WebSocket origin '${rawOrigin}' is not authorized`);
      }
    }
  }

  if (!token) {
    throw new Error('Authentication token required');
  }

  const expectedDocumentId = parseDocumentRoom(documentName);

  let decoded: DocTokenPayload;
  try {
    decoded = verifyToken<DocTokenPayload>(token);
  } catch (err: any) {
    throw new Error(`Authentication failed: ${err.message || 'Invalid or expired token'}`);
  }

  if (decoded.documentId !== expectedDocumentId) {
    throw new Error(
      `Token document ID mismatch: token is for '${decoded.documentId}', but requested room is '${expectedDocumentId}'`
    );
  }

  const effectiveRole = await resolveCurrentDocumentRole(expectedDocumentId, decoded.userId);

  if (effectiveRole === 'viewer') {
    connectionConfig.readOnly = true;
  }

  return {
    user: {
      id: decoded.userId,
      name: decoded.name,
      color: decoded.color,
    },
    role: effectiveRole,
    documentId: expectedDocumentId,
  };
}

/**
 * Hook invoked when token is refreshed/synced for active sessions.
 * Enforces ongoing membership and permission changes.
 */
export async function handleTokenSync(data: onTokenSyncPayload): Promise<void> {
  const { token, documentName, connectionConfig, connection } = data;

  if (!token) {
    connection.close();
    throw new Error('Token sync failed: Token missing');
  }

  const expectedDocumentId = parseDocumentRoom(documentName);

  let decoded: DocTokenPayload;
  try {
    decoded = verifyToken<DocTokenPayload>(token);
  } catch {
    connection.close();
    throw new Error('Token sync failed: Token expired or invalid');
  }

  if (decoded.documentId !== expectedDocumentId) {
    connection.close();
    throw new Error('Token sync failed: Token does not match active document room');
  }

  try {
    const effectiveRole = await resolveCurrentDocumentRole(expectedDocumentId, decoded.userId);
    const isReadOnly = effectiveRole === 'viewer';
    connectionConfig.readOnly = isReadOnly;
    if (connection) {
      connection.readOnly = isReadOnly;
    }
  } catch {
    connection.close();
    throw new Error('Token sync failed: Permissions revoked');
  }
}
