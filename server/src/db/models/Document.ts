import { Schema, model, Document as MongooseDocument, Types } from 'mongoose';

export type DocumentRole = 'owner' | 'editor' | 'viewer';

export interface ICollaborator {
  userId: Types.ObjectId;
  role: 'editor' | 'viewer';
}

export interface IDocument extends MongooseDocument {
  _id: string;                      // nanoid URL-safe ID
  title: string;                    // Title mirrored from CRDT Y.Map('meta')
  ownerId: Types.ObjectId;          // Reference to User model
  collaborators: ICollaborator[];   // Explicit members with editor/viewer roles
  isPublic: boolean;                // Link sharing enabled/disabled
  publicRole: 'editor' | 'viewer';  // Role for non-members when isPublic is true
  yjsState: Buffer | null;          // Binary Yjs state vector (CRDT source of truth)
  previewText: string;              // Plain text preview for dashboard cards
  createdAt: Date;
  updatedAt: Date;
}

const CollaboratorSchema = new Schema<ICollaborator>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['editor', 'viewer'],
      default: 'editor',
    },
  },
  { _id: false }
);

const DocumentSchema = new Schema<IDocument>(
  {
    _id: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      default: 'Untitled Document',
      trim: true,
      maxlength: 120,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    collaborators: {
      type: [CollaboratorSchema],
      default: [],
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    publicRole: {
      type: String,
      enum: ['editor', 'viewer'],
      default: 'editor',
    },
    yjsState: {
      type: Buffer,
      default: null,
    },
    previewText: {
      type: String,
      default: '',
      maxlength: 300,
    },
  },
  {
    timestamps: true,
    _id: false,
    toJSON: {
      transform: (_doc, ret: Record<string, any>) => {
        ret.id = ret._id;
        delete ret.__v;
        if (ret.ownerId && typeof ret.ownerId === 'object' && ret.ownerId._id) {
          ret.owner = ret.ownerId;
          ret.ownerId = ret.ownerId._id.toString();
        } else if (ret.ownerId && typeof ret.ownerId === 'object') {
          ret.ownerId = ret.ownerId.toString();
        }
        return ret;
      },
    },
  }
);

DocumentSchema.index({ updatedAt: -1 });
DocumentSchema.index({ 'collaborators.userId': 1 });

export const DocumentModel = model<IDocument>('Document', DocumentSchema);
