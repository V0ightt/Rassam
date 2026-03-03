'use client';

import React, { memo, useRef, useCallback, useState, useEffect } from 'react';
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

// ── LineGutter – rendered separately for perfect alignment ────

const LINE_HEIGHT = 1.6;     // must match SyntaxHighlighter lineHeight
const FONT_SIZE = 13;        // must match SyntaxHighlighter fontSize
const PADDING_TOP = 12;      // must match SyntaxHighlighter padding top

const LineGutter = memo(function LineGutter({ count }: { count: number }) {
  const gutterWidth = count >= 1000 ? '5em' : count >= 100 ? '4em' : '3.5em';
  const lines: React.ReactNode[] = [];
  for (let i = 1; i <= count; i++) {
    lines.push(
      <div
        key={i}
        style={{
          height: `${FONT_SIZE * LINE_HEIGHT}px`,
          lineHeight: `${LINE_HEIGHT}`,
          fontSize: `${FONT_SIZE}px`,
          paddingRight: '1em',
          textAlign: 'right',
          color: '#334155',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        {i}
      </div>,
    );
  }
  return (
    <div
      style={{
        minWidth: gutterWidth,
        width: gutterWidth,
        paddingTop: `${PADDING_TOP}px`,
        borderRight: '1px solid #1e293b',
        userSelect: 'none',
        flexShrink: 0,
        background: '#020617',
      }}
    >
      {lines}
    </div>
  );
});

// ── FileViewer Component ──────────────────────────────────────

interface FileViewerProps {
  filePath: string;
  content: string | null;
  isLoading: boolean;
  className?: string;
}

function FileViewer({ filePath, content, isLoading, className }: FileViewerProps) {
  const language = detectLanguage(filePath);
  const lineCount = content?.split('\n').length ?? 0;
  const fileSize = content ? new Blob([content]).size : 0;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Sync gutter scroll with code scroll
  const gutterRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const scrolling = useRef(false);

  const handleCodeScroll = useCallback(() => {
    if (scrolling.current) return;
    scrolling.current = true;
    if (gutterRef.current && codeRef.current) {
      gutterRef.current.scrollTop = codeRef.current.scrollTop;
    }
    scrolling.current = false;
  }, []);

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
          <span>{lineCount} lines</span>
          <span>{formatFileSize(fileSize)}</span>
        </div>
      </div>

      {/* Code area: gutter + highlighted code, sharing one scroll position */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <div className="absolute inset-0 flex">
          {/* Line number gutter (scroll hidden, synced from code pane) */}
          <div
            ref={gutterRef}
            className="overflow-hidden shrink-0"
            style={{ background: '#020617' }}
          >
            <LineGutter count={lineCount} />
          </div>

          {/* Code pane (scrollable) */}
          <div
            ref={codeRef}
            className="flex-1 overflow-auto custom-scrollbar"
            onScroll={handleCodeScroll}
          >
            <SyntaxHighlighter
              style={oneDark}
              language={language}
              showLineNumbers={false}
              wrapLongLines={false}
              PreTag="div"
              customStyle={{
                margin: 0,
                padding: `${PADDING_TOP}px 16px`,
                background: '#020617',
                fontSize: `${FONT_SIZE}px`,
                lineHeight: `${LINE_HEIGHT}`,
                overflow: 'visible',
              }}
              codeTagProps={{
                style: {
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                },
              }}
            >
              {content}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(FileViewer);
