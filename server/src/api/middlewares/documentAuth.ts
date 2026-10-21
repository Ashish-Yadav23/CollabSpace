import { Request, Response, NextFunction } from 'express';
import { DocumentModel, IDocument, DocumentRole } from '../../db/models/Document';

declare global {
  namespace Express {
    interface Request {
      document?: IDocument;
      docRole?: DocumentRole;
    }
  }
}

const ROLE_HIERARCHY: Record<DocumentRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function requireDocumentPermission(minimumRole: DocumentRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const doc = await DocumentModel.findById(id).populate('ownerId', 'name email color');
      if (!doc) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      let effectiveRole: DocumentRole | null = null;

      // 1. Owner always has full permissions
      const ownerIdStr = (doc.ownerId as any)?._id?.toString() || doc.ownerId.toString();
      if (userId && ownerIdStr === userId) {
        effectiveRole = 'owner';
      }

      // 2. Check explicit collaborator role
      if (!effectiveRole && userId) {
        const collab = doc.collaborators.find(
          (c) => c.userId.toString() === userId
        );
        if (collab) {
          effectiveRole = collab.role;
        }
      }

      // 3. Fallback to public access role if link sharing is enabled
      if (!effectiveRole && doc.isPublic) {
        effectiveRole = doc.publicRole;
      }

      if (!effectiveRole) {
        res.status(403).json({ error: 'Access denied: You do not have permission to access this document' });
        return;
      }

      if (ROLE_HIERARCHY[effectiveRole] < ROLE_HIERARCHY[minimumRole]) {
        res.status(403).json({
          error: `Insufficient permissions: Requires ${minimumRole} access, but your role is ${effectiveRole}`,
        });
        return;
      }

      req.document = doc;
      req.docRole = effectiveRole;
      next();
    } catch (error) {
      next(error);
    }
  };
}
