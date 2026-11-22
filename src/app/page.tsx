'use client';

import dynamic from 'next/dynamic';

// The Studio reads browser-only state (folders, drafts, theme), so it renders on the client.
const Studio = dynamic(() => import('@/components/studio/Studio'), {
  ssr: false,
  loading: () => (
    <main className="grid h-dvh place-items-center bg-canvas px-6 text-fg" aria-busy="true">
      <p className="text-small text-fg-3">Opening Rassam…</p>
    </main>
  ),
});

export default function HomePage() {
  return <Studio />;
}
