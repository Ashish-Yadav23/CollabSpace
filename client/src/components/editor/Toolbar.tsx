import React from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo,
  Redo,
} from 'lucide-react';

export interface ToolbarProps {
  editor: Editor | null;
  isReadOnly?: boolean;
  className?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  editor,
  isReadOnly = false,
  className = '',
}) => {
  if (!editor) {
    return null;
  }

  const isDisabled = isReadOnly || !editor.isEditable;

  const btnClass = (isActive: boolean, disabled: boolean = false) =>
    `p-1.5 rounded transition-colors text-sm flex items-center justify-center ${
      disabled || isDisabled
        ? 'opacity-40 cursor-not-allowed text-gray-400'
        : isActive
        ? 'bg-blue-100 text-blue-800 font-semibold shadow-inner'
        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const canUndo = typeof (editor.can() as any).undo === 'function' && (editor.can() as any).undo();
  const canRedo = typeof (editor.can() as any).redo === 'function' && (editor.can() as any).redo();

  return (
    <div
      role="toolbar"
      aria-label="Editor formatting toolbar"
      className={`flex flex-wrap items-center gap-1 p-1.5 border-b border-gray-200 bg-white select-none ${className}`}
    >
      {/* History */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => (editor.chain().focus() as any).undo?.().run()}
          disabled={isDisabled || !canUndo}
          className={btnClass(false, !canUndo)}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => (editor.chain().focus() as any).redo?.().run()}
          disabled={isDisabled || !canRedo}
          className={btnClass(false, !canRedo)}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      <div className="w-[1px] h-5 bg-gray-200 mx-1" />

      {/* Basic Marks */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('bold'))}
          title="Bold (Ctrl+B)"
          aria-label="Toggle Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('italic'))}
          title="Italic (Ctrl+I)"
          aria-label="Toggle Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('strike'))}
          title="Strikethrough"
          aria-label="Toggle Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
      </div>

      <div className="w-[1px] h-5 bg-gray-200 mx-1" />

      {/* Headings */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('heading', { level: 1 }))}
          title="Heading 1"
          aria-label="Toggle Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('heading', { level: 2 }))}
          title="Heading 2"
          aria-label="Toggle Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
      </div>

      <div className="w-[1px] h-5 bg-gray-200 mx-1" />

      {/* Lists & Quotes */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('bulletList'))}
          title="Bullet List"
          aria-label="Toggle Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('orderedList'))}
          title="Numbered List"
          aria-label="Toggle Ordered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('blockquote'))}
          title="Blockquote"
          aria-label="Toggle Blockquote"
        >
          <Quote className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          disabled={isDisabled}
          className={btnClass(editor.isActive('codeBlock'))}
          title="Code Block"
          aria-label="Toggle Code Block"
        >
          <Code className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
