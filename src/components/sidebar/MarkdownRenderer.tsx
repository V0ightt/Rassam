'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, FileCode, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Custom code block component with copy functionality
const CodeBlock = ({ 
  language, 
  children 
}: { 
  language: string; 
  children: string;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <FileCode size={12} className="text-slate-400" />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            {language || 'code'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors px-2 py-0.5 rounded hover:bg-slate-700"
        >
          {copied ? (
            <>
              <Check size={10} className="text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={10} />
              Copy
            </>
          )}
        </button>
      </div>
      
      {/* Code */}
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '12px',
          background: 'rgba(15, 23, 42, 0.8)',
          fontSize: '12px',
          borderRadius: 0,
        }}
        codeTagProps={{
          style: {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

// Inline code component
const InlineCode = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1.5 py-0.5 bg-slate-800 rounded text-cyan-300 text-xs font-mono border border-slate-700/50">
    {children}
  </code>
);

// File path component
const FilePath = ({ path }: { path: string }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-900/30 border border-amber-700/30 rounded text-amber-300 text-xs font-mono">
    <FileCode size={10} />
    {path}
  </span>
);

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // Pre-process content to detect file paths (only paths with directory separators)
  const processedContent = content.replace(
    /`((?:[a-zA-Z0-9_\-]+\/)+[a-zA-Z0-9_\-]+\.(ts|tsx|js|jsx|css|json|md|py|go|rs|java|c|cpp|h|hpp))`/g,
    '**FILE:$1**'
  );

  return (
    <div className={cn("prose prose-invert prose-sm max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;
            
            if (isInline) {
              return <InlineCode {...props}>{children}</InlineCode>;
            }
            
            return (
              <CodeBlock language={match?.[1] || ''}>
                {String(children).replace(/\n$/, '')}
              </CodeBlock>
            );
          },
          
          // Links
          a({ href, children, ...props }) {
            return (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 underline underline-offset-2"
                {...props}
              >
                {children}
                <ExternalLink size={10} />
              </a>
            );
          },
          
          // Paragraphs
          p({ children, ...props }) {
            // Check for file path markers
            if (typeof children === 'string' && children.includes('**FILE:')) {
              const parts = children.split(/\*\*FILE:([^*]+)\*\*/);
              return (
                <p className="text-slate-300 leading-relaxed my-1" {...props}>
                  {parts.map((part, i) => 
                    i % 2 === 1 ? <FilePath key={i} path={part} /> : part
                  )}
                </p>
              );
            }
            return <p className="text-slate-300 leading-relaxed my-1" {...props}>{children}</p>;
          },
          
          // Strong/bold - handle file paths
          strong({ children, ...props }) {
            const text = String(children);
            if (text.startsWith('FILE:')) {
              return <FilePath path={text.replace('FILE:', '')} />;
            }
            return <strong className="text-slate-100 font-semibold" {...props}>{children}</strong>;
          },
          
          // Lists
          ul({ children, ...props }) {
            return <ul className="list-disc list-inside space-y-1 text-slate-300" {...props}>{children}</ul>;
          },
          ol({ children, ...props }) {
            return <ol className="list-decimal list-inside space-y-1 text-slate-300" {...props}>{children}</ol>;
          },
          li({ children, ...props }) {
            return <li className="text-slate-300" {...props}>{children}</li>;
          },
          
          // Headers
          h1({ children, ...props }) {
            return <h1 className="text-lg font-bold text-slate-100 mt-3 mb-1" {...props}>{children}</h1>;
          },
          h2({ children, ...props }) {
            return <h2 className="text-base font-semibold text-slate-100 mt-2 mb-1" {...props}>{children}</h2>;
          },
          h3({ children, ...props }) {
            return <h3 className="text-sm font-semibold text-slate-200 mt-2 mb-1" {...props}>{children}</h3>;
          },
          
          // Blockquote
          blockquote({ children, ...props }) {
            return (
              <blockquote className="border-l-2 border-cyan-500 pl-3 my-2 text-slate-400 italic" {...props}>
                {children}
              </blockquote>
            );
          },
          
          // Table
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="w-full text-xs border-collapse border border-slate-700" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          th({ children, ...props }) {
            return <th className="border border-slate-700 px-2 py-1 bg-slate-800 text-left text-slate-300" {...props}>{children}</th>;
          },
          td({ children, ...props }) {
            return <td className="border border-slate-700 px-2 py-1 text-slate-400" {...props}>{children}</td>;
          },
          
          // Horizontal rule
          hr({ ...props }) {
            return <hr className="border-slate-700 my-3" {...props} />;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
