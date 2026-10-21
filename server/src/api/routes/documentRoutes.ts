import { Router } from 'express';
import {
  createDocument,
  listDocuments,
  getDocument,
  updateDocumentSettings,
  deleteDocument,
  addCollaborator,
  removeCollaborator,
  getDocumentToken,
} from '../controllers/documentController';
import { requireAuth, optionalAuth } from '../middlewares/authMiddleware';
import { requireDocumentPermission } from '../middlewares/documentAuth';

const router = Router();

// Create new document (requires logged in user)
router.post('/', requireAuth, createDocument);

// List accessible documents for logged in user
router.get('/', requireAuth, listDocuments);

// Fetch document metadata (accessible to viewers, editors, owners, or public)
router.get('/:id', optionalAuth, requireDocumentPermission('viewer'), getDocument);

// Update document settings (link sharing, public role) - requires owner permission
router.patch('/:id', requireAuth, requireDocumentPermission('owner'), updateDocumentSettings);

// Delete document - requires owner permission
router.delete('/:id', requireAuth, requireDocumentPermission('owner'), deleteDocument);

// Add or update collaborator role - requires owner permission
router.post('/:id/collaborators', requireAuth, requireDocumentPermission('owner'), addCollaborator);

// Remove collaborator - requires owner permission
router.delete('/:id/collaborators/:userId', requireAuth, requireDocumentPermission('owner'), removeCollaborator);

// Issue WebSocket room access token - requires at least viewer permission
router.post('/:id/token', optionalAuth, requireDocumentPermission('viewer'), getDocumentToken);

export default router;
