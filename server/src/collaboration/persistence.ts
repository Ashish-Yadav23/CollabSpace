import * as Y from 'yjs';
import { Database } from '@hocuspocus/extension-database';
import { fetchPayload, storePayload } from '@hocuspocus/server';
import { DocumentModel } from '../db/models/Document';
import { parseDocumentRoom } from './auth';

export const mongoDatabaseExtension = new Database({
  /**
   * fetch must return the previously persisted binary Yjs state as a Uint8Array,
   * or null for a genuinely uninitialized document.
   */
  fetch: async (data: fetchPayload): Promise<Uint8Array | null> => {
    const documentId = parseDocumentRoom(data.documentName);
    const doc = await DocumentModel.findById(documentId).select('yjsState title');

    if (!doc) {
      return null;
    }

    // If no persisted state exists yet, encode an initial update with the title
    if (!doc.yjsState || doc.yjsState.length === 0) {
      if (doc.title) {
        const initDoc = new Y.Doc();
        initDoc.getMap('meta').set('title', doc.title);
        const initialUpdate = Y.encodeStateAsUpdate(initDoc);
        initDoc.destroy();
        return initialUpdate;
      }
      return null;
    }

    return new Uint8Array(doc.yjsState);
  },

  /**
   * store persists the binary state without reconstructing it from editor HTML,
   * extracts the live title from the Yjs state meta map, and updates MongoDB atomically.
   */
  store: async (data: storePayload): Promise<void> => {
    const documentId = parseDocumentRoom(data.documentName);

    // Extract live title from Yjs CRDT map
    const metaMap = data.document.getMap('meta');
    const liveTitle = metaMap.get('title');

    // Extract text preview for dashboard cards
    const defaultXml = data.document.getXmlFragment('default');
    const previewText = defaultXml.toString().replace(/<[^>]*>?/gm, '').slice(0, 300);

    const updateFields: Record<string, any> = {
      yjsState: Buffer.from(data.state),
      previewText,
      updatedAt: new Date(),
    };

    if (typeof liveTitle === 'string' && liveTitle.trim().length > 0) {
      updateFields.title = liveTitle.trim().slice(0, 120);
    }

    try {
      await DocumentModel.findByIdAndUpdate(
        documentId,
        { $set: updateFields },
        { new: false }
      );
    } catch (err) {
      console.error(`[persistence] Failed to persist state for document ${documentId}:`, err);
      throw err;
    }
  },
});
