'use client';

import dynamic from 'next/dynamic';
import { Network } from 'lucide-react';

// The classic evidence-linked map (repository analysis, inspector, chat). It
// keeps its original dark design, so the dark tokens are pinned for this route.
const Workbench = dynamic(() => import('@/components/workspace/Workbench'), {
  ssr: false,
  loading: () => (
    <main className="grid h-dvh place-items-center bg-slate-950 px-6 text-slate-200" aria-busy="true">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
          <Network size={24} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Opening the classic map</h1>
        <p className="mt-1 text-sm text-slate-400">Restoring your local workspace…</p>
      </div>
    </main>
  ),
});

export default function MapPage() {
  return (
    <div data-theme="dark">
      <Workbench />
    </div>
  );
}
