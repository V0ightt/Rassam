'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileCode, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Language detection from file extension ────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  xml: 'xml',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  env: 'bash',
  dockerfile: 'docker',
  graphql: 'graphql',
  gql: 'graphql',
  svg: 'xml',
  vue: 'html',
  svelte: 'html',
  prisma: 'prisma',
  tf: 'hcl',
  r: 'r',
  dart: 'dart',
  lua: 'lua',
  makefile: 'makefile',
  cmake: 'cmake',
};

function detectLanguage(filePath: string): string {
  const name = filePath.split('/').pop()?.toLowerCase() || '';
  if (name === 'dockerfile') return 'docker';
  if (name === 'makefile') return 'makefile';
  if (name === '.gitignore' || name === '.dockerignore') return 'bash';
  if (name === '.env' || name.startsWith('.env.')) return 'bash';

  const ext = name.split('.').pop() || '';
  return EXT_TO_LANG[ext] || 'text';
}

// ── FileViewer Component ──────────────────────────────────────

interface FileViewerProps {
  filePath: string;
  content: string | null;
  isLoading: boolean;
  className?: string;
}

const LINE_HEIGHT_PX = 21;
const CONTENT_PADDING_Y = 12;
const OVERSCAN_LINES = 80;
const CHUNK_SIZE = 240;

function countLines(text: string): number {
  let count = 1;
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) count++;
  }
  return count;
}

interface ChunkInfo {
  startLine: number;
  endLine: number;
  text: string;
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
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
}: {
  lineCount: number;
  scrollTop: number;
  viewportHeight: number;
}) {
  const visibleStartLine = Math.max(1, Math.floor(scrollTop / LINE_HEIGHT_PX) - OVERSCAN_LINES);
  const visibleLineSpan = Math.ceil(viewportHeight / LINE_HEIGHT_PX) + OVERSCAN_LINES * 2;
  const visibleEndLine = Math.min(lineCount, visibleStartLine + visibleLineSpan);
  const offsetY = CONTENT_PADDING_Y + (visibleStartLine - 1) * LINE_HEIGHT_PX - scrollTop;

  const numbers = useMemo(() => {
    const list: number[] = [];
    for (let line = visibleStartLine; line <= visibleEndLine; line++) {
      list.push(line);
    }
    return list;
  }, [visibleStartLine, visibleEndLine]);

  return (
    <div className="relative h-full">
      <div className="absolute left-0 right-0" style={{ transform: `translateY(${offsetY}px)` }}>
        {numbers.map((line) => (
          <div key={line} className="h-[21px] text-right pr-2">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
});

const VirtualHighlightedCode = memo(function VirtualHighlightedCode({
  language,
  chunks,
  scrollTop,
  viewportHeight,
}: {
  language: string;
  chunks: ChunkInfo[];
  scrollTop: number;
  viewportHeight: number;
}) {
  const lineCount = chunks.length ? chunks[chunks.length - 1].endLine : 0;
  const totalHeight = lineCount * LINE_HEIGHT_PX + CONTENT_PADDING_Y * 2;

  const startChunkIndex = Math.max(0, Math.floor(scrollTop / (CHUNK_SIZE * LINE_HEIGHT_PX)) - 1);
  const endChunkIndex = Math.min(
    chunks.length - 1,
    Math.ceil((scrollTop + viewportHeight) / (CHUNK_SIZE * LINE_HEIGHT_PX)) + 1,
  );

  const visibleChunks = useMemo(() => {
    if (!chunks.length) return [] as ChunkInfo[];
    return chunks.slice(startChunkIndex, endChunkIndex + 1);
  }, [chunks, startChunkIndex, endChunkIndex]);

  return (
    <div className="relative" style={{ height: `${totalHeight}px` }}>
      {visibleChunks.map((chunk) => {
        const top = CONTENT_PADDING_Y + (chunk.startLine - 1) * LINE_HEIGHT_PX;
        return (
          <div
            key={`${chunk.startLine}-${chunk.endLine}`}
            className="absolute left-0 right-0"
            style={{ top: `${top}px` }}
          >
            <HighlightChunk language={language} text={chunk.text} />
          </div>
        );
      })}
    </div>
  );
});

function FileViewer({ filePath, content, isLoading, className }: FileViewerProps) {
  const language = detectLanguage(filePath);
  const charCount = content?.length ?? 0;
  const lineCount = useMemo(() => (content ? countLines(content) : 0), [content]);
  const supportsHighlighting = language !== 'text';

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(el.scrollTop);
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.scrollTop = 0;
    setViewportHeight(el.clientHeight);

    const observer = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });

    observer.observe(el);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      observer.disconnect();
    };
  }, [filePath]);

  const lineChunks = useMemo(() => {
    if (!content || !lineCount) return [] as ChunkInfo[];

    const lines = content.split('\n');
    const chunks: ChunkInfo[] = [];
    for (let index = 0; index < lines.length; index += CHUNK_SIZE) {
      const startLine = index + 1;
      const endLine = Math.min(lines.length, index + CHUNK_SIZE);
      chunks.push({
        startLine,
        endLine,
        text: lines.slice(index, endLine).join('\n'),
      });
    }

    return chunks;
  }, [content, lineCount]);

  const lineNumberWidthPx = useMemo(() => {
    if (lineCount >= 10000) return 64;
    if (lineCount >= 1000) return 56;
    if (lineCount >= 100) return 48;
    return 42;
  }, [lineCount]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full bg-slate-950', className)}>
        <Loader2 size={28} className="animate-spin text-cyan-400 mb-3" />
        <span className="text-sm text-slate-400">Loading {filePath.split('/').pop()}...</span>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full bg-slate-950', className)}>
        <FileCode size={36} className="text-slate-600 mb-3" />
        <span className="text-sm text-slate-400">File content not available</span>
        <span className="text-xs text-slate-600 mt-1">Click the file in the explorer to fetch it</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-slate-950', className)}>
      {/* File info bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[11px] text-slate-500 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 font-mono">{filePath}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{language}</span>
          <span>{lineCount.toLocaleString()} lines</span>
          <span>{formatFileSize(charCount)}</span>
        </div>
      </div>

      {/* Syntax-highlighted viewer with virtualized line numbers/chunks */}
      <div className="flex-1 flex" style={{ minHeight: 0 }}>
        <div
          className="shrink-0 border-r border-slate-800 bg-slate-950/80 text-slate-500 text-[12px] leading-[21px] font-mono select-none"
          style={{ width: `${lineNumberWidthPx}px` }}
        >
          <div className="relative h-full overflow-hidden">
            <VirtualLineNumbers
              lineCount={lineCount}
              scrollTop={scrollTop}
              viewportHeight={viewportHeight}
            />
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 h-full overflow-auto custom-scrollbar bg-slate-950"
        >
          {supportsHighlighting ? (
            <VirtualHighlightedCode
              language={language}
              chunks={lineChunks}
              scrollTop={scrollTop}
              viewportHeight={viewportHeight}
            />
          ) : (
            <pre
              className="m-0 p-3 text-[13px] text-slate-200 font-mono whitespace-pre"
              style={{
                lineHeight: `${LINE_HEIGHT_PX}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                tabSize: 2,
              }}
            >
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(FileViewer);
