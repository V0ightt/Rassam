'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ClipboardCopy, Download, FolderOpen, Github, Moon, RefreshCw, Save, Settings, SunMedium } from 'lucide-react';

import type { BlueprintSession } from '@/components/blueprint/session';
import { Button, buttonClass } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Pill';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet, SheetSection } from '@/components/ui/Sheet';
import { useAppearance, type Theme } from '@/components/ui/theme';

import { shortSha, sourceText } from './SourcePill';
import type { SourceActions } from './useSourceActions';

function Switch({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <span id={id} className="block text-small font-medium text-fg">{label}</span>
        {hint && <span className="block text-meta text-fg-3">{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'focus-ring relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-45',
          checked ? 'bg-accent' : 'bg-active shadow-[inset_0_0_0_1px_var(--border-strong)]',
        )}
      >
        <span className={cx('absolute left-1 top-1 h-4 w-4 rounded-full transition-transform duration-100', checked ? 'translate-x-4 bg-on-accent' : 'bg-fg-2')} />
      </button>
    </div>
  );
}

function when(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Behind the source pill: what is open, the commits it has moved through,
 * saving, switching to another source, and the app-level links and appearance.
 */
export default function SourceSheet({
  open,
  onOpenChange,
  session,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: BlueprintSession;
  actions: SourceActions;
}) {
  const { live, source } = session;
  const { theme, solid, setTheme, setSolidSurfaces } = useAppearance();
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const urlId = useId();
  const sha = shortSha(live.current?.sha ?? (source?.kind === 'github' ? source.commitSha : null));
  const busy = actions.busy !== null || session.status === 'loading';

  const sync = async () => {
    setSyncing(true);
    try {
      await session.syncToLatest();
    } finally {
      setSyncing(false);
    }
  };
  const close = () => onOpenChange(false);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      width={400}
      title={session.blueprint?.system.name ?? 'Source'}
      description={source ? (
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {source.kind === 'github' ? <Github size={13} aria-hidden="true" /> : <FolderOpen size={13} aria-hidden="true" />}
            <span className="truncate">{sourceText(source)}</span>
          </span>
          {sha && <span className="tabular font-mono text-meta">{sha}</span>}
          {session.dirty && <Badge tone="neutral">unsaved changes</Badge>}
        </span>
      ) : 'Nothing is open yet.'}
    >
      {session.blueprint && (
        <SheetSection title="Blueprint">
          <div className="flex flex-wrap gap-2">
            {session.canSaveToDisk && (
              <Button variant="primary" disabled={!session.dirty || busy} icon={<Save size={14} strokeWidth={1.5} aria-hidden="true" />} onClick={() => void session.saveToDisk()}>
                Save to folder
              </Button>
            )}
            <Button icon={<Download size={14} strokeWidth={1.5} aria-hidden="true" />} onClick={() => session.download()}>Download</Button>
            <Button
              icon={<ClipboardCopy size={14} strokeWidth={1.5} aria-hidden="true" />}
              onClick={() => void session.copyToClipboard().then(() => setCopied(true))}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
          <span className="sr-only" role="status">{copied ? 'Blueprint JSON copied to the clipboard' : ''}</span>
          <p className="mt-2 text-meta text-fg-3">
            {session.canSaveToDisk ? 'Saving writes .rassam/blueprint.json into the open folder.' : 'Commit the file as .rassam/blueprint.json in your repository.'}
          </p>
          {session.dirty && (
            <div className="mt-3 flex items-center gap-2">
              {confirmDiscard ? (
                <>
                  <Button variant="danger" size="sm" onClick={() => { session.discardChanges(); setConfirmDiscard(false); }}>Discard all changes</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>Keep</Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)}>Discard unsaved changes…</Button>
              )}
            </div>
          )}
        </SheetSection>
      )}

      {source && (
        <SheetSection title="Live" className="border-t border-line-subtle">
          {live.behind && (
            <div className="mb-3 rounded-md bg-accent-muted px-3 py-2">
              <p className="text-small font-medium text-accent-text">A newer commit is available</p>
              {live.latest && (
                <p className="mt-0.5 truncate text-small text-fg-2">
                  <span className="tabular font-mono text-meta">{shortSha(live.latest.sha) ?? live.latest.sha.slice(0, 7)}</span>
                  {live.latest.message ? ` ${live.latest.message.split('\n')[0]}` : ''}
                </p>
              )}
              <Button variant="primary" size="sm" className="mt-2" disabled={syncing || busy} icon={<RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void sync()}>
                {syncing ? 'Syncing…' : 'Sync to latest'}
              </Button>
            </div>
          )}
          <Switch
            label="Watch for changes"
            hint={source.kind === 'github' ? 'Checks the branch for new commits while this tab is visible.' : 'Rescans the folder when you come back to this window.'}
            checked={live.watching}
            onChange={(next) => session.setWatching(next)}
          />
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" disabled={busy} icon={<RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void session.rescan()}>
              Rescan now
            </Button>
            {live.checking && <span className="text-meta text-fg-3" role="status">Checking for new commits…</span>}
          </div>
          {live.lastChange && (
            <p className="mt-3 text-small text-fg-2" data-testid="last-change">
              <span className="font-medium text-fg">Last sync:</span> {live.lastChange.diff.summary}.
              <span className="tabular block text-meta text-fg-3">{when(live.lastChange.at)}</span>
            </p>
          )}
        </SheetSection>
      )}

      {live.history.length > 0 && (
        <SheetSection title="Commits" count={live.history.length} className="border-t border-line-subtle">
          <ol className="space-y-3" aria-label="Commit timeline">
            {live.history.map((entry, index) => (
              <li key={`${entry.sha}-${index}`} className="relative pl-4">
                <span className={cx('absolute left-0 top-1.5 h-2 w-2 rounded-full', index === 0 ? 'bg-accent' : 'bg-line-strong')} aria-hidden="true" />
                <p className="flex items-baseline gap-2 text-small text-fg">
                  {shortSha(entry.sha) && <span className="tabular shrink-0 font-mono text-meta text-fg-3">{shortSha(entry.sha)}</span>}
                  <span className="min-w-0 flex-1 truncate">{entry.message?.split('\n')[0] ?? 'Scan'}</span>
                </p>
                <p className="text-small text-fg-2">{entry.summary}</p>
                {entry.date && <p className="tabular text-meta text-fg-3">{when(entry.date)}</p>}
              </li>
            ))}
          </ol>
        </SheetSection>
      )}

      <SheetSection title="Switch source" className="border-t border-line-subtle">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void actions.openRepository(url).then(close);
          }}
        >
          <label htmlFor={urlId} className="sr-only">GitHub repository URL</label>
          <Input id={urlId} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repository" inputMode="url" autoComplete="off" spellCheck={false} />
          <Button type="submit" disabled={!url.trim() || busy}>{actions.busy === 'github' ? 'Opening…' : 'Open'}</Button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button disabled={busy} icon={<FolderOpen size={14} strokeWidth={1.5} aria-hidden="true" />} onClick={() => { close(); void actions.openFolder(); }}>Open local folder</Button>
          {actions.lastFolder && (
            <Button disabled={busy} onClick={() => { close(); void actions.reopenFolder(); }}>Reopen {actions.lastFolder}</Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => { close(); void actions.trySample(); }}>Try the sample</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { close(); actions.startEmpty(session.blueprint?.system.name ?? 'Untitled system'); }}>Start empty</Button>
        </div>
        {actions.error && <p role="alert" className="mt-2 text-small text-bad">{actions.error}</p>}
      </SheetSection>

      <SheetSection title="Appearance" className="border-t border-line-subtle">
        <div className="flex items-center justify-between gap-3">
          <span className="text-small font-medium text-fg">Theme</span>
          <SegmentedControl<Theme>
            label="Theme"
            value={theme}
            onChange={setTheme}
            className="bg-canvas"
            options={[
              { value: 'dark', label: 'Dark', icon: <Moon size={13} strokeWidth={1.5} aria-hidden="true" /> },
              { value: 'light', label: 'Light', icon: <SunMedium size={13} strokeWidth={1.5} aria-hidden="true" /> },
            ]}
          />
        </div>
        <div className="mt-3">
          <Switch label="Solid surfaces" hint="Turns off the translucent blur on floating controls." checked={solid} onChange={setSolidSurfaces} />
        </div>
      </SheetSection>

      <nav aria-label="More" className="flex flex-wrap gap-2 border-t border-line-subtle px-4 py-4">
        <Link href="/settings" className={buttonClass('ghost', 'md')}>
          <Settings size={14} strokeWidth={1.5} aria-hidden="true" /> Settings
        </Link>
      </nav>
    </Sheet>
  );
}
