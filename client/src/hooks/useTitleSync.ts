import { useState, useEffect, useCallback } from 'react';
import * as Y from 'yjs';

export interface UseTitleSyncOptions {
  doc: Y.Doc | null;
  defaultTitle?: string;
  isReadOnly?: boolean;
}

export interface UseTitleSyncReturn {
  title: string;
  setTitle: (newTitle: string) => void;
}

export function useTitleSync({
  doc,
  defaultTitle = 'Untitled Document',
  isReadOnly = false,
}: UseTitleSyncOptions): UseTitleSyncReturn {
  const [title, setLocalTitle] = useState<string>(defaultTitle);

  useEffect(() => {
    if (!doc) {
      return;
    }

    const metaMap = doc.getMap('meta');
    const existingTitle = metaMap.get('title');
    if (typeof existingTitle === 'string' && existingTitle.trim().length > 0) {
      setLocalTitle(existingTitle);
    }

    const handleMetaChange = () => {
      const updatedTitle = metaMap.get('title');
      if (typeof updatedTitle === 'string') {
        setLocalTitle(updatedTitle);
      }
    };

    metaMap.observe(handleMetaChange);

    return () => {
      metaMap.unobserve(handleMetaChange);
    };
  }, [doc]);

  const setTitle = useCallback(
    (newTitle: string) => {
      if (isReadOnly || !doc) {
        return;
      }
      setLocalTitle(newTitle);
      const metaMap = doc.getMap('meta');
      metaMap.set('title', newTitle);
    },
    [doc, isReadOnly]
  );

  return {
    title,
    setTitle,
  };
}
