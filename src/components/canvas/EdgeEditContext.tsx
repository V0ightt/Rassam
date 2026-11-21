'use client';

import { createContext, useContext } from 'react';
import type { EdgeData } from '@/types';

interface EdgeEditContextValue {
  onUpdateEdge: (edgeId: string, data: Partial<EdgeData>) => void;
  onDeleteEdge: (edgeId: string) => void;
}

const EdgeEditContext = createContext<EdgeEditContextValue | null>(null);

export const EdgeEditProvider = EdgeEditContext.Provider;

export function useEdgeEdit() {
  const context = useContext(EdgeEditContext);
  if (!context) throw new Error('useEdgeEdit must be used within an EdgeEditProvider');
  return context;
}
