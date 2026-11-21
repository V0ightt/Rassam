'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileCode,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  buildPinnedGitHubFileUrl,
  clampSourceLocation,
  shouldUsePlainTextViewer,
} from '@/lib/editor-file';
import type { SourceLocation } from '@/lib/source-location';
import { cn } from '@/lib/utils';
import type { RepoDetails } from '@/types';
import type { EditorFileRevision } from '@/hooks/useEditorTabs';

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  html: 'markup',
  xml: 'markup',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  svg: 'markup',
  vue: 'markup',
  svelte: 'markup',
};

type PrismGrammar = Parameters<typeof SyntaxHighlighter.registerLanguage>[1];
type GrammarModule = { default: PrismGrammar };

const LANGUAGE_LOADERS: Record<string, () => Promise<GrammarModule>> = {
  bash: () => import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
  css: () => import('react-syntax-highlighter/dist/esm/languages/prism/css'),
  javascript: () => import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
  json: () => import('react-syntax-highlighter/dist/esm/languages/prism/json'),
  jsx: () => import('react-syntax-highlighter/dist/esm/languages/prism/jsx'),
  markdown: () => import('react-syntax-highlighter/dist/esm/languages/prism/markdown'),
  markup: () => import('react-syntax-highlighter/dist/esm/languages/prism/markup'),
  python: () => import('react-syntax-highlighter/dist/esm/languages/prism/python'),
  tsx: () => import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
  typescript: () => import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
  yaml: () => import('react-syntax-highlighter/dist/esm/languages/prism/yaml'),
};

const registeredLanguages = new Set<string>();
const languageLoads = new Map<string, Promise<void>>();

function loadLanguage(language: string): Promise<void> | null {
  const loader = LANGUAGE_LOADERS[language];
  if (!loader) return null;
  if (registeredLanguages.has(language)) return Promise.resolve();
  const current = languageLoads.get(language);
  if (current) return current;

  const request = loader().then((module) => {
    SyntaxHighlighter.registerLanguage(language, module.default);
    registeredLanguages.add(language);
  }).finally(() => languageLoads.delete(language));
  languageLoads.set(language, request);
  return request;
}

function usePrismLanguage(language: string, enabled: boolean): boolean {
  const [loadedLanguage, setLoadedLanguage] = useState<string | null>(() => (
    registeredLanguages.has(language) ? language : null
  ));

  useEffect(() => {
    let active = true;
    if (!enabled) return () => { active = false; };
    const request = loadLanguage(language);
    if (!request) return () => { active = false; };
    void request.then(() => {
      if (active) setLoadedLanguage(language);
    }).catch(() => {
      if (active) setLoadedLanguage(null);
    });
    return () => { active = false; };
  }, [enabled, language]);

  return enabled && (registeredLanguages.has(language) || loadedLanguage === language);
}

export function detectLanguage(filePath: string): string {
  const name = filePath.split('/').pop()?.toLowerCase() || '';
  if (name === 'dockerfile' || name === 'makefile') return 'bash';
  if (name === '.gitignore' || name === '.dockerignore') return 'bash';
  if (name === '.env' || name.startsWith('.env.')) return 'bash';
  const extension = name.split('.').pop() || '';
  return EXT_TO_LANG[extension] || 'text';
}

export interface FileViewerProps {
  filePath: string;
  content: string | null;
  isLoading: boolean;
  error?: string | null;
  sourceLocation?: SourceLocation;
  navigationKey?: number;
  initialScrollTop?: number;
  revision?: EditorFileRevision;
  repoDetails?: Pick<RepoDetails, 'owner' | 'repo' | 'commitSha'> | null;
  onScrollPositionChange?: (scrollTop: number) => void;
  onRetry?: () => unknown;
  onRefresh?: () => unknown;
  className?: string;
}

const LINE_HEIGHT_PX = 21;
const CONTENT_PADDING_Y = 12;
const OVERSCAN_LINES = 80;
const CHUNK_SIZE = 240;
const SCROLL_REPORT_INTERVAL_MS = 100;

function countLines(text: string): number {
  let count = 1;
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) count++;
  }
  return count;
}

function utf8Size(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

interface ChunkInfo {
  startLine: number;
  endLine: number;
  text: string;
}

interface VisibleRange {
  startLine: number;
  endLine: number;
}

function visibleLineRange(lineCount: number, scrollTop: number, viewportHeight: number): VisibleRange {
  const startLine = Math.max(1, Math.floor(scrollTop / LINE_HEIGHT_PX) - OVERSCAN_LINES);
  const span = Math.ceil(viewportHeight / LINE_HEIGHT_PX) + OVERSCAN_LINES * 2;
  return { startLine, endLine: Math.min(lineCount, startLine + span) };
}

function isLineSelected(line: number, location: SourceLocation | undefined): boolean {
  if (location?.startLine === undefined) return false;
  return line >= location.startLine && line <= (location.endLine ?? location.startLine);
}

const HighlightChunk = memo(function HighlightChunk({
  language,
  text,
}: {
  language: string;
  text: string;
}) {
  return (
    <SyntaxHighlighter
      style={oneDark}
      language={language}
      showLineNumbers={false}
      wrapLongLines={false}
      PreTag="div"
      customStyle={{
        margin: 0,
        padding: 0,
        background: 'transparent',
        fontSize: '13px',
        lineHeight: `${LINE_HEIGHT_PX}px`,
        overflow: 'visible',
      }}
      codeTagProps={{
        style: {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          tabSize: 2,
          lineHeight: `${LINE_HEIGHT_PX}px`,
        },
      }}
    >
      {text}
    </SyntaxHighlighter>
  );
});

const VirtualLineNumbers = memo(function VirtualLineNumbers({
  lineCount,
  scrollTop,
  viewportHeight,
  sourceLocation,
}: {
  lineCount: number;
  scrollTop: number;
  viewportHeight: number;
  sourceLocation?: SourceLocation;
}) {
  const visible = visibleLineRange(lineCount, scrollTop, viewportHeight);
  const offsetY = CONTENT_PADDING_Y + (visible.startLine - 1) * LINE_HEIGHT_PX - scrollTop;
  const numbers = useMemo(() => {
    const list: number[] = [];
    for (let line = visible.startLine; line <= visible.endLine; line++) list.push(line);
    return list;
  }, [visible.endLine, visible.startLine]);

  return (
    <div className="relative h-full" aria-hidden="true">
      <div className="absolute inset-x-0" style={{ transform: `translateY(${offsetY}px)` }}>
        {numbers.map((line) => (
          <div
            key={line}
            className={cn(
              'h-[21px] border-r-2 pr-2 text-right',
              isLineSelected(line, sourceLocation)
                ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200'
                : 'border-transparent',
            )}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
});

function SourceRangeOverlay({ sourceLocation }: { sourceLocation?: SourceLocation }) {
  if (sourceLocation?.startLine === undefined) return null;
  const lineSpan = (sourceLocation.endLine ?? sourceLocation.startLine) - sourceLocation.startLine + 1;
  return (
    <div
      data-testid="source-range-highlight"
      className="pointer-events-none absolute inset-x-0 z-0 border-y border-cyan-400/30 bg-cyan-400/10"
      style={{
        top: `${CONTENT_PADDING_Y + (sourceLocation.startLine - 1) * LINE_HEIGHT_PX}px`,
        height: `${lineSpan * LINE_HEIGHT_PX}px`,
      }}
    />
  );
}

const VirtualHighlightedCode = memo(function VirtualHighlightedCode({
  language,
  chunks,
  lineCount,
  scrollTop,
  viewportHeight,
  sourceLocation,
}: {
  language: string;
  chunks: ChunkInfo[];
  lineCount: number;
  scrollTop: number;
  viewportHeight: number;
  sourceLocation?: SourceLocation;
}) {
  const totalHeight = lineCount * LINE_HEIGHT_PX + CONTENT_PADDING_Y * 2;
  const startChunkIndex = Math.max(0, Math.floor(scrollTop / (CHUNK_SIZE * LINE_HEIGHT_PX)) - 1);
  const endChunkIndex = Math.min(
    chunks.length - 1,
    Math.ceil((scrollTop + viewportHeight) / (CHUNK_SIZE * LINE_HEIGHT_PX)) + 1,
  );
  const visibleChunks = useMemo(
    () => chunks.length ? chunks.slice(startChunkIndex, endChunkIndex + 1) : [],
    [chunks, endChunkIndex, startChunkIndex],
  );

  return (
    <div className="relative" style={{ height: `${totalHeight}px` }}>
      <SourceRangeOverlay sourceLocation={sourceLocation} />
      {visibleChunks.map((chunk) => (
        <div
          key={`${chunk.startLine}-${chunk.endLine}`}
          className="absolute inset-x-0 z-10"
          style={{ top: `${CONTENT_PADDING_Y + (chunk.startLine - 1) * LINE_HEIGHT_PX}px` }}
        >
          <HighlightChunk language={language} text={chunk.text} />
        </div>
      ))}
    </div>
  );
});

const VirtualPlainText = memo(function VirtualPlainText({
  chunks,
  lineCount,
  scrollTop,
  viewportHeight,
  sourceLocation,
}: {
  chunks: ChunkInfo[];
  lineCount: number;
  scrollTop: number;
  viewportHeight: number;
  sourceLocation?: SourceLocation;
}) {
  const totalHeight = lineCount * LINE_HEIGHT_PX + CONTENT_PADDING_Y * 2;
  const visible = visibleLineRange(lineCount, scrollTop, viewportHeight);
  const startChunkIndex = Math.max(0, Math.floor((visible.startLine - 1) / CHUNK_SIZE));
  const endChunkIndex = Math.min(chunks.length - 1, Math.floor((visible.endLine - 1) / CHUNK_SIZE));
  const visibleChunks = useMemo(
    () => chunks.length ? chunks.slice(startChunkIndex, endChunkIndex + 1) : [],
    [chunks, endChunkIndex, startChunkIndex],
  );

  return (
    <div className="relative" style={{ height: `${totalHeight}px` }} data-viewer-mode="plain-virtual">
      <SourceRangeOverlay sourceLocation={sourceLocation} />
      {visibleChunks.map((chunk) => (
        <pre
          key={`${chunk.startLine}-${chunk.endLine}`}
          className="absolute inset-x-0 z-10 m-0 whitespace-pre bg-transparent p-0 font-mono text-[13px] text-slate-200"
          style={{
            top: `${CONTENT_PADDING_Y + (chunk.startLine - 1) * LINE_HEIGHT_PX}px`,
            lineHeight: `${LINE_HEIGHT_PX}px`,
            tabSize: 2,
          }}
        >
          {chunk.text}
        </pre>
      ))}
    </div>
  );
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileViewer({
  filePath,
  content,
  isLoading,
  error,
  sourceLocation,
  navigationKey = 0,
  initialScrollTop = 0,
  revision,
  repoDetails,
  onScrollPositionChange,
  onRetry,
  onRefresh,
  className,
}: FileViewerProps) {
  const language = detectLanguage(filePath);
  const lineCount = useMemo(() => content === null ? 0 : countLines(content), [content]);
  const sizeBytes = useMemo(() => content === null ? 0 : utf8Size(content), [content]);
  const sourceRange = useMemo(
    () => clampSourceLocation(sourceLocation, lineCount),
    [lineCount, sourceLocation],
  );
  const knownLanguage = Boolean(LANGUAGE_LOADERS[language]);
  const plainTextMode = shouldUsePlainTextViewer({
    supportsHighlighting: knownLanguage,
    sizeBytes,
    lineCount,
  });
  const grammarReady = usePrismLanguage(language, !plainTextMode && content !== null);
  const githubUrl = useMemo(
    () => buildPinnedGitHubFileUrl(repoDetails, sourceRange ?? { path: filePath }),
    [filePath, repoDetails, sourceRange],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const onScrollPositionChangeRef = useRef(onScrollPositionChange);
  const latestScrollTopRef = useRef(initialScrollTop);
  const rafRef = useRef<number | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrollTop, setScrollTop] = useState(initialScrollTop);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => { onScrollPositionChangeRef.current = onScrollPositionChange; }, [onScrollPositionChange]);

  const reportScrollPosition = useCallback(() => {
    if (reportTimerRef.current !== null) return;
    reportTimerRef.current = setTimeout(() => {
      reportTimerRef.current = null;
      onScrollPositionChangeRef.current?.(latestScrollTopRef.current);
    }, SCROLL_REPORT_INTERVAL_MS);
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element || rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      latestScrollTopRef.current = element.scrollTop;
      setScrollTop(element.scrollTop);
      reportScrollPosition();
    });
  }, [reportScrollPosition]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    setViewportHeight(element.clientHeight);
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [filePath]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || content === null) return;
    const targetTop = sourceRange?.startLine === undefined
      ? Math.max(0, initialScrollTop)
      : Math.max(0, CONTENT_PADDING_Y + (sourceRange.startLine - 1) * LINE_HEIGHT_PX - element.clientHeight * 0.25);
    element.scrollTop = targetTop;
    latestScrollTopRef.current = targetTop;
    onScrollPositionChangeRef.current?.(targetTop);
    if (sourceRange?.startLine !== undefined) element.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => setScrollTop(targetTop));
    return () => window.cancelAnimationFrame(frame);
  }, [content, filePath, initialScrollTop, navigationKey, sourceRange?.endLine, sourceRange?.startLine]);

  useEffect(() => () => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    if (reportTimerRef.current !== null) clearTimeout(reportTimerRef.current);
    onScrollPositionChangeRef.current?.(latestScrollTopRef.current);
  }, []);

  const lineChunks = useMemo(() => {
    if (content === null) return [];
    const lines = content.split('\n');
    const chunks: ChunkInfo[] = [];
    for (let index = 0; index < lines.length; index += CHUNK_SIZE) {
      const startLine = index + 1;
      const endLine = Math.min(lines.length, index + CHUNK_SIZE);
      chunks.push({ startLine, endLine, text: lines.slice(index, endLine).join('\n') });
    }
    return chunks;
  }, [content]);

  const lineNumberWidthPx = lineCount >= 10_000 ? 64 : lineCount >= 1_000 ? 56 : lineCount >= 100 ? 48 : 42;

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(filePath);
      setCopyStatus('Path copied');
    } catch {
      setCopyStatus('Could not copy the path');
    }
  }, [filePath]);

  const invoke = useCallback((action: (() => unknown) | undefined) => {
    if (action) void action();
  }, []);

  if (isLoading && content === null) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center bg-slate-950', className)} role="status" aria-live="polite">
        <Loader2 size={28} className="mb-3 animate-spin text-cyan-400 motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-sm text-slate-300">Loading {filePath.split('/').pop()}</span>
        <span className="mt-1 text-xs text-slate-500">Reading the pinned repository revision</span>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center bg-slate-950 px-6 text-center', className)}>
        <FileCode size={36} className="mb-3 text-slate-600" aria-hidden="true" />
        <p className="text-sm text-slate-300">{error ?? 'File content is not available.'}</p>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          {error ? 'The existing project and other cached files are unchanged.' : 'Open the file from the explorer or an evidence reference to load it.'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={() => invoke(onRetry)}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm text-slate-200 transition-colors hover:border-cyan-500/60 hover:text-cyan-200 active:translate-y-px"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Retry pinned read
          </button>
        )}
      </div>
    );
  }

  const modeLabel = plainTextMode
    ? knownLanguage ? 'Plain text, large file' : 'Plain text'
    : grammarReady ? language : `Loading ${language} highlighting`;

  return (
    <div className={cn('flex h-full flex-col bg-slate-950', className)} aria-busy={isLoading}>
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-2 text-[11px] text-slate-400">
        <div className="min-w-0 flex-1 px-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="block min-w-0 truncate font-mono text-slate-300" title={filePath}>{filePath}</span>
            {revision?.verified && (
              <span
                className="inline-flex shrink-0 items-center gap-1 text-emerald-300"
                title={revision.actualCommitSha ? `Pinned commit ${revision.actualCommitSha}` : 'Pinned source verified'}
              >
                <Check size={12} aria-hidden="true" /> Pinned
              </span>
            )}
          </div>
          {sourceRange?.startLine !== undefined && (
            <span className="text-cyan-300">
              {sourceRange.endLine !== undefined && sourceRange.endLine !== sourceRange.startLine
                ? `Lines ${sourceRange.startLine} to ${sourceRange.endLine}`
                : `Line ${sourceRange.startLine}`}
            </span>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-2 text-slate-500 xl:flex" aria-label="File details">
          <span>{modeLabel}</span>
          <span>{lineCount.toLocaleString()} lines</span>
          <span>{formatFileSize(sizeBytes)}</span>
        </div>

        <div className="flex shrink-0 items-center" role="toolbar" aria-label="Source file actions">
          <button
            type="button"
            onClick={() => void handleCopyPath()}
            className="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-cyan-200 active:translate-y-px"
            aria-label={`Copy path ${filePath}`}
          >
            <Copy size={15} aria-hidden="true" />
          </button>
          {onRefresh && (
            <button
              type="button"
              onClick={() => invoke(onRefresh)}
              disabled={isLoading}
              className="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-cyan-200 active:translate-y-px disabled:cursor-wait disabled:opacity-50"
              aria-label="Refresh from pinned commit"
            >
              <RefreshCw size={15} className={cn(isLoading && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
            </button>
          )}
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-cyan-200 active:translate-y-px"
              aria-label="Open this pinned file on GitHub"
            >
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
        </div>
        <span className="sr-only" aria-live="polite">{copyStatus}</span>
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" role="alert">
          <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error}</span>
          {onRetry && (
            <button type="button" onClick={() => invoke(onRetry)} className="min-h-10 rounded-lg px-3 font-medium text-amber-100 hover:bg-amber-500/15">
              Retry
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          className="shrink-0 border-r border-slate-800 bg-slate-950/80 font-mono text-[12px] leading-[21px] text-slate-500 select-none"
          style={{ width: `${lineNumberWidthPx}px` }}
        >
          <div className="relative h-full overflow-hidden">
            <VirtualLineNumbers
              lineCount={lineCount}
              scrollTop={scrollTop}
              viewportHeight={viewportHeight}
              sourceLocation={sourceRange}
            />
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          tabIndex={0}
          role="region"
          aria-label={`${filePath} source code`}
          className="custom-scrollbar h-full flex-1 overflow-auto bg-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
        >
          {!plainTextMode && grammarReady ? (
            <VirtualHighlightedCode
              language={language}
              chunks={lineChunks}
              lineCount={lineCount}
              scrollTop={scrollTop}
              viewportHeight={viewportHeight}
              sourceLocation={sourceRange}
            />
          ) : (
            <VirtualPlainText
              chunks={lineChunks}
              lineCount={lineCount}
              scrollTop={scrollTop}
              viewportHeight={viewportHeight}
              sourceLocation={sourceRange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(FileViewer);
