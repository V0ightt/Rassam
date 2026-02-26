'use client';

import { createContext, useContext } from 'react';

interface NodeEditContextValue {
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
}

const NodeEditContext = createContext<NodeEditContextValue | null>(null);

export const NodeEditProvider = NodeEditContext.Provider;

export function useNodeEdit() {
  const ctx = useContext(NodeEditContext);
  if (!ctx) {
    throw new Error('useNodeEdit must be used within a NodeEditProvider');
  }
  return ctx;
}
