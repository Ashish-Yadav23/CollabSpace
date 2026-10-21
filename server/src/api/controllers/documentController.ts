import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { Types } from 'mongoose';
import { DocumentModel } from '../../db/models/Document';
import { UserModel } from '../../db/models/User';
import { signDocToken } from '../../utils/tokens';

const createDocumentSchema = z.object({
  title: z.string().trim().max(120).optional(),
  isPublic: z.boolean().optional(),
  publicRole: z.enum(['editor', 'viewer']).optional(),
});

const updateDocumentSchema = z.object({
  isPublic: z.boolean().optional(),
  publicRole: z.enum(['editor', 'viewer']).optional(),
});

const addCollaboratorSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['editor', 'viewer']),
});

/**
 * POST /api/documents
 * Create a new document with nanoid ID and set current user as owner.
 */
export async function createDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = createDocumentSchema.parse(req.body);
    const userId = req.user!.id;

    const docId = `doc_${nanoid(10)}`;

    const document = await DocumentModel.create({
      _id: docId,
      title: validated.title || 'Untitled Document',
      ownerId: new Types.ObjectId(userId),
      isPublic: validated.isPublic !== undefined ? validated.isPublic : true,
      publicRole: validated.publicRole || 'editor',
      collaborators: [],
      yjsState: null,
      previewText: '',
    });

    const docJson: Record<string, any> = document.toJSON();
    docJson.userRole = 'owner';

    res.status(201).json({
      message: 'Document created successfully',
      document: docJson,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/documents
 * List all documents accessible to the user (owned or added as collaborator).
 */
export async function listDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = new Types.ObjectId(req.user!.id);
    const currentUserIdStr = req.user!.id;

    const documents = await DocumentModel.find({
      $or: [
        { ownerId: userId },
        { 'collaborators.userId': userId },
      ],
    })
      .sort({ updatedAt: -1 })
      .populate('ownerId', 'name email color');

    res.status(200).json({
      documents: documents.map((doc) => {
        const json: Record<string, any> = doc.toJSON();
        const ownerIdStr = (doc.ownerId as any)?._id?.toString() || doc.ownerId.toString();
        const isOwner = ownerIdStr === currentUserIdStr;
        let role: 'owner' | 'editor' | 'viewer' = isOwner ? 'owner' : 'viewer';
        if (!isOwner) {
          const collab = doc.collaborators.find((c) => c.userId.toString() === currentUserIdStr);
          if (collab) {
            role = collab.role;
          } else if (doc.isPublic) {
            role = doc.publicRole;
          }
        }
        json.userRole = role;
        return json;
      }),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/documents/:id
 * Fetch document metadata and caller's effective role.
 */
export async function getDocument(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    document: req.document!.toJSON(),
    role: req.docRole,
  });
}

/**
 * PATCH /api/documents/:id
 * Update document settings (sharing, public role). Requires owner permission.
 * Note: Live document titles are managed via the Yjs CRDT map to guarantee
 * zero-conflict concurrent synchronization.
 */
export async function updateDocumentSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = updateDocumentSchema.parse(req.body);
    const doc = req.document!;

    if (validated.isPublic !== undefined) {
      doc.isPublic = validated.isPublic;
    }
    if (validated.publicRole !== undefined) {
      doc.publicRole = validated.publicRole;
    }

    await doc.save();

    const json: Record<string, any> = doc.toJSON();
    json.userRole = req.docRole;

    res.status(200).json({
      message: 'Document updated successfully',
      document: json,
      role: req.docRole,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/documents/:id
 * Delete document and its persisted state. Requires owner permission.
 */
export async function deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await DocumentModel.findByIdAndDelete(id);

    res.status(200).json({
      message: 'Document deleted successfully',
      id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/documents/:id/collaborators
 * Add or update a collaborator role on a document. Requires owner permission.
 */
export async function addCollaborator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = addCollaboratorSchema.parse(req.body);
    const doc = req.document!;

    const targetUser = await UserModel.findOne({ email: validated.email });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found with provided email' });
      return;
    }

    const targetUserIdStr = targetUser._id.toString();
    const ownerIdStr = (doc.ownerId as any)?._id?.toString() || doc.ownerId.toString();

    if (targetUserIdStr === ownerIdStr) {
      res.status(400).json({ error: 'Cannot add document owner as a collaborator' });
      return;
    }

    const existingIndex = doc.collaborators.findIndex(
      (c) => c.userId.toString() === targetUserIdStr
    );

    if (existingIndex >= 0) {
      doc.collaborators[existingIndex].role = validated.role;
    } else {
      doc.collaborators.push({
        userId: targetUser._id,
        role: validated.role,
      });
    }

    await doc.save();

    res.status(200).json({
      message: 'Collaborator added/updated successfully',
      document: doc.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/documents/:id/collaborators/:userId
 * Remove a collaborator from a document. Requires owner permission.
 */
export async function removeCollaborator(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.params;
    const doc = req.document!;

    doc.collaborators = doc.collaborators.filter(
      (c) => c.userId.toString() !== userId
    );

    await doc.save();

    res.status(200).json({
      message: 'Collaborator removed successfully',
      document: doc.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/documents/:id/token
 * Generate a document-scoped JWT token for connecting to the Hocuspocus WebSocket room.
 * Minimum role required: viewer.
 */
export async function getDocumentToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = req.document!;
    const role = req.docRole!;
    const user = req.user;
    const resolvedUserId = user?.id || `anon_${nanoid(6)}`;
    const resolvedName = user?.name || 'Anonymous Guest';
    const resolvedColor = user?.color || '#10B981';

    const token = signDocToken({
      userId: resolvedUserId,
      name: resolvedName,
      color: resolvedColor,
      documentId: doc._id,
      role,
    });

    res.status(200).json({
      token,
      documentId: doc._id,
      role,
      user: {
        id: resolvedUserId,
        name: resolvedName,
        color: resolvedColor,
      },
    });
  } catch (error) {
    next(error);
  }
}
