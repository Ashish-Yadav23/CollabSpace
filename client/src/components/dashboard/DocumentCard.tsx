import type React from 'react';
import { FileText, Globe, Lock, Share2, Trash2, Clock } from 'lucide-react';
import type { DocumentMeta } from '../../types';

interface DocumentCardProps {
  document: DocumentMeta;
  onOpen: (id: string) => void;
  onShare: (document: DocumentMeta) => void;
  onDelete?: (id: string) => void;
  currentUserId?: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return 'Recently';
  }
}

export function DocumentCard({
  document,
  onOpen,
  onShare,
  onDelete,
  currentUserId,
}: DocumentCardProps) {
  const ownerIdStr =
    typeof document.ownerId === 'object' && document.ownerId
      ? ((document.ownerId as any)._id?.toString() || (document.ownerId as any).id?.toString() || '')
      : (document.ownerId?.toString() || '');

  const isOwner =
    document.userRole === 'owner' ||
    (currentUserId && (currentUserId === ownerIdStr || currentUserId === document.ownerId));

  const handleCardClick = () => {
    onOpen(document.id);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShare(document);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${document.title || 'Untitled Document'}"? This action cannot be undone.`)) {
      onDelete?.(document.id);
    }
  };

  const roleLabel =
    document.userRole === 'owner' || isOwner
      ? 'Owner'
      : document.userRole === 'viewer'
      ? 'Viewer'
      : 'Editor';

  const roleStyles = {
    Owner: 'bg-blue-50 text-blue-700 border-blue-200',
    Editor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Viewer: 'bg-amber-50 text-amber-700 border-amber-200',
  }[roleLabel];

  return (
    <div
      onClick={handleCardClick}
      className="group bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between"
      data-testid={`document-card-${document.id}`}
    >
      <div>
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${roleStyles}`}
            >
              {roleLabel}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                document.isPublic
                  ? 'bg-slate-100 text-slate-700'
                  : 'bg-slate-50 text-slate-500'
              }`}
              title={
                document.isPublic
                  ? `Public (${document.publicRole || 'editor'})`
                  : 'Private (members only)'
              }
            >
              {document.isPublic ? (
                <>
                  <Globe className="w-3 h-3 text-blue-500" />
                  <span>Public</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>Private</span>
                </>
              )}
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleShareClick}
              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="Share document"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            {isOwner && onDelete && (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                title="Delete document"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <div className="flex items-start gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <FileText className="w-4 h-4" />
          </div>
          <h3 className="font-semibold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
            {document.title || 'Untitled Document'}
          </h3>
        </div>

        {/* Preview text */}
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4 min-h-[2rem]">
          {document.previewText ? document.previewText : 'No preview available. Click to start editing...'}
        </p>
      </div>

      {/* Footer Info */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>Updated {formatRelativeTime(document.updatedAt)}</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400 truncate max-w-[90px]">
          {document.id}
        </span>
      </div>
    </div>
  );
}
