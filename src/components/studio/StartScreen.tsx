'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { ArrowRight, FolderOpen, Play, RotateCcw } from 'lucide-react';

import type { BlueprintSession } from '@/components/blueprint/session';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { isLocalFolderSupported } from '@/lib/blueprint-client/local-folder';

import type { SourceActions } from './useSourceActions';

const subscribeNever = () => () => undefined;

/**
 * First run: one input and three ways in. No tour, no settings. The sample
 * loads offline in a few seconds, a repository in well under a minute.
 */
export default function StartScreen({
  session,
  actions,
}: {
  session: Pick<BlueprintSession, 'status' | 'progress' | 'error'>;
  actions: SourceActions;
}) {
  const [url, setUrl] = useState('');
  const inputId = useId();
  const folderSupported = useSyncExternalStore(subscribeNever, isLocalFolderSupported, () => false);
  const loading = session.status === 'loading';
  const busy = actions.busy !== null || loading;
  const error = actions.error ?? session.error;
  const progress = session.progress;
  const repeat = actions.last?.kind === 'github' ? actions.last : null;

  return (
    <main data-canvas-shortcuts="off" className="studio grid min-h-dvh place-items-center bg-canvas px-4 py-12 text-fg">
      <div className="w-full max-w-[560px]">
        <div className="flex items-center gap-2 text-small font-medium text-fg-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a 20px static mark; the image optimizer adds nothing */}
          <img src="/logo.svg" alt="" width={20} height={20} className="h-5 w-5" />
          Rassam
        </div>
        <h1 className="mt-6 text-headline font-semibold text-fg sm:text-display">Is the project on track?</h1>
        <p className="mt-3 max-w-[52ch] text-input text-fg-2">
          Open a repository to see its live system design, the contract your coding agents are checked against, and what needs your ruling.
        </p>

        <form
          className="mt-8 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void actions.openRepository(url);
          }}
        >
          <label htmlFor={inputId} className="sr-only">GitHub repository URL</label>
          <Input
            id={inputId}
            size="lg"
            autoFocus
            value={url}
            onChange={(event) => { setUrl(event.target.value); if (actions.error) actions.clearError(); }}
            placeholder="Paste a GitHub repository URL"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            aria-invalid={Boolean(actions.error) || undefined}
            className="text-input"
          />
          <Button type="submit" variant="primary" size="lg" disabled={busy || !url.trim()}>
            {actions.busy === 'github' ? 'Opening…' : 'Open'}
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="lg"
            disabled={busy || !folderSupported}
            title={folderSupported ? undefined : 'Opening a folder needs Chrome, Edge or another Chromium browser.'}
            icon={<FolderOpen size={16} strokeWidth={1.5} aria-hidden="true" />}
            onClick={() => void actions.openFolder()}
          >
            Open a local folder
          </Button>
          {actions.lastFolder && folderSupported && (
            <Button size="lg" disabled={busy} icon={<RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />} onClick={() => void actions.reopenFolder()}>
              Reopen {actions.lastFolder}
            </Button>
          )}
          {repeat && (
            <Button size="lg" disabled={busy} icon={<RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" />} onClick={() => void actions.openRepository(repeat.url)}>
              Reopen {repeat.label}
            </Button>
          )}
          <Button size="lg" variant="ghost" disabled={busy} icon={<Play size={16} strokeWidth={1.5} aria-hidden="true" />} onClick={() => void actions.trySample()}>
            Try the sample
          </Button>
        </div>

        <div className="mt-4 min-h-6 text-small" aria-live="polite">
          {busy ? (
            <StatusGlyph
              tone="working"
              label={`${progress?.phase ?? (actions.busy === 'github' ? 'Finding the repository' : 'Opening')}${progress?.total ? ` · ${progress.completed ?? 0}/${progress.total}` : '…'}`}
            />
          ) : error ? (
            <p role="alert" className="text-bad">{error}</p>
          ) : (
            <p className="text-fg-3">
              Public repositories are read at a pinned commit. Local folders never leave this machine{folderSupported ? '' : ' (needs a Chromium browser)'}.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
