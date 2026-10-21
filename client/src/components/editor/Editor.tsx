import React, { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { CollaborationUser } from '../../hooks/useCollaboration';
import { Toolbar } from './Toolbar';

export interface EditorProps {
  doc: Y.Doc | null;
  provider?: HocuspocusProvider | null;
  currentUser?: CollaborationUser | null;
  isReadOnly?: boolean;
  placeholder?: string;
  onUpdate?: (html: string) => void;
  className?: string;
}

export const Editor: React.FC<EditorProps> = ({
  doc,
  provider,
  currentUser,
  isReadOnly = false,
  placeholder = 'Start typing collaboratively...',
  onUpdate,
  className = '',
}) => {
  const extensions = useMemo(() => {
    const exts: any[] = [
      StarterKit.configure({
        history: false, // Crucial: CRDT history is handled by Yjs
      }),
      Placeholder.configure({
        placeholder,
      }),
    ];

    if (doc) {
      exts.push(
        Collaboration.configure({
          document: doc,
        })
      );
    }

    if (provider) {
      exts.push(
        CollaborationCursor.configure({
          provider,
          user: currentUser || { name: 'Collaborator', color: '#3B82F6' },
        })
      );
    }

    return exts;
  }, [doc, provider]);

  const editor = useEditor(
    {
      editable: !isReadOnly,
      extensions,
      onUpdate: ({ editor: ed }) => {
        onUpdate?.(ed.getHTML());
      },
    },
    [extensions]
  );

  useEffect(() => {
    if (editor && editor.isEditable === isReadOnly) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  useEffect(() => {
    if (editor && currentUser && typeof (editor.commands as any).updateUser === 'function') {
      (editor.commands as any).updateUser(currentUser);
    }
  }, [editor, currentUser]);

  if (!doc) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-500 ${className}`}>
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-3" />
        <p className="text-sm">Connecting to collaborative session...</p>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col ${className}`}
    >
      <Toolbar editor={editor} isReadOnly={isReadOnly} />
      <div className="flex-1 overflow-y-auto cursor-text" onClick={() => editor?.commands.focus()}>
        <EditorContent
          editor={editor}
          className="tiptap-editor-content p-6 min-h-[500px] max-w-4xl mx-auto focus:outline-none"
        />
      </div>
    </div>
  );
};
