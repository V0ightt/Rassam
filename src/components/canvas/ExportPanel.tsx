'use client';

import React, { useCallback, useEffect, useRef, memo } from 'react';
import { toPng, toSvg } from 'html-to-image';
import { useReactFlow, getNodesBounds, getViewportForBounds } from 'reactflow';
import { 
  Download, 
  Image, 
  FileJson, 
  FileCode,
  ChevronDown,
  Upload,
  Archive,
  MessagesSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Project, RepoDetails } from '@/types';
import {
  createRassamGraphExport,
  createRassamProjectBackup,
  serializeRassamExport,
} from '@/lib/project-export';

interface ExportPanelProps {
  repoDetails?: RepoDetails | null;
  /** Full project context enables revision/coverage metadata and local backups. */
  project?: Project | null;
  onImportProject?: (file: File) => void;
  /** Render as icon-only button with rightward dropdown (for navbar) */
  compact?: boolean;
}

const imageWidth = 1920;
const imageHeight = 1080;
type ImageExportOptions = NonNullable<Parameters<typeof toPng>[1]>;
type ImageConverter = (element: HTMLElement, options?: ImageExportOptions) => Promise<string>;

function exportMetadata(repoDetails?: RepoDetails | null): string {
  const identity = repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : 'Rassam diagram';
  const revision = repoDetails?.commitSha
    ? `${repoDetails.requestedRef || repoDetails.defaultBranch || 'revision'} @ ${repoDetails.commitSha.slice(0, 12)}`
    : 'local diagram';
  return `${identity}  ·  ${revision}  ·  Exported ${new Date().toISOString()}`;
}

async function addPngMetadataFooter(dataUrl: string, footer: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const exportedImage = new window.Image();
    exportedImage.onload = () => {
      const footerHeight = Math.max(64, Math.round(exportedImage.height * 0.045));
      const canvas = document.createElement('canvas');
      canvas.width = exportedImage.width;
      canvas.height = exportedImage.height + footerHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not prepare the image metadata footer.'));
        return;
      }
      context.fillStyle = '#020617';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(exportedImage, 0, 0);
      context.fillStyle = '#0f172a';
      context.fillRect(0, exportedImage.height, canvas.width, footerHeight);
      context.strokeStyle = '#334155';
      context.beginPath();
      context.moveTo(0, exportedImage.height + 0.5);
      context.lineTo(canvas.width, exportedImage.height + 0.5);
      context.stroke();
      context.fillStyle = '#cbd5e1';
      context.font = `${Math.max(18, Math.round(footerHeight * 0.34))}px ui-monospace, SFMono-Regular, Consolas, monospace`;
      context.textBaseline = 'middle';
      context.fillText(footer, Math.round(footerHeight * 0.45), exportedImage.height + footerHeight / 2);
      resolve(canvas.toDataURL('image/png'));
    };
    exportedImage.onerror = () => reject(new Error('Could not render the image metadata footer.'));
    exportedImage.src = dataUrl;
  });
}

async function addSvgMetadataFooter(dataUrl: string, footer: string): Promise<string> {
  const separator = dataUrl.indexOf(',');
  if (separator < 0) throw new Error('Could not read the exported SVG.');
  const header = dataUrl.slice(0, separator);
  const payload = dataUrl.slice(separator + 1);
  const svgText = header.includes(';base64')
    ? window.atob(payload)
    : decodeURIComponent(payload);
  const documentNode = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = documentNode.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || documentNode.querySelector('parsererror')) {
    throw new Error('Could not render the SVG metadata footer.');
  }
  const width = Number.parseFloat(root.getAttribute('width') || String(imageWidth));
  const height = Number.parseFloat(root.getAttribute('height') || String(imageHeight));
  const footerHeight = 54;
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height + footerHeight));
  root.setAttribute('viewBox', `0 0 ${width} ${height + footerHeight}`);

  const namespace = 'http://www.w3.org/2000/svg';
  const background = documentNode.createElementNS(namespace, 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', String(height));
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(footerHeight));
  background.setAttribute('fill', '#0f172a');
  background.setAttribute('stroke', '#334155');
  const text = documentNode.createElementNS(namespace, 'text');
  text.setAttribute('x', '24');
  text.setAttribute('y', String(height + 33));
  text.setAttribute('fill', '#cbd5e1');
  text.setAttribute('font-size', '14');
  text.setAttribute('font-family', 'ui-monospace, SFMono-Regular, Consolas, monospace');
  text.textContent = footer;
  root.append(background, text);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
}

export default memo(function ExportPanel({ repoDetails, project, onImportProject, compact }: ExportPanelProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [includeImageFooter, setIncludeImageFooter] = React.useState(true);
  const { getNodes, getEdges } = useReactFlow();
  const exportRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Click away listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);
  
  const downloadImage = useCallback((dataUrl: string, extension: string) => {
    const fileName = repoDetails 
      ? `${repoDetails.owner}-${repoDetails.repo}-flowchart.${extension}`
      : `flowchart.${extension}`;
    
    const a = document.createElement('a');
    a.setAttribute('download', fileName);
    a.setAttribute('href', dataUrl);
    a.click();
  }, [repoDetails]);

  const exportAsImage = useCallback(async (
    format: 'png' | 'svg',
    converter: ImageConverter,
    extraOptions?: ImageExportOptions,
  ) => {
    const nodes = getNodes();
    if (nodes.length === 0) {
      alert('No nodes to export. Please visualize a repository first.');
      return;
    }

    setIsExporting(true);
    setIsOpen(false);
    
    try {
      const nodesBounds = getNodesBounds(nodes);
      const viewport = getViewportForBounds(
        nodesBounds,
        imageWidth,
        imageHeight,
        0.5,
        2,
        0.1
      );
      
      const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement;
      
      if (!viewportElement) {
        throw new Error('Canvas element not found');
      }

      let dataUrl = await converter(viewportElement, {
        backgroundColor: '#020617',
        width: imageWidth,
        height: imageHeight,
        cacheBust: true,
        skipFonts: true,
        filter: (node: HTMLElement) => {
          const classList = node.classList;
          return !classList.contains('react-flow__minimap') &&
                 !classList.contains('react-flow__controls');
        },
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
        ...extraOptions,
      });

      if (includeImageFooter) {
        const footer = exportMetadata(repoDetails);
        dataUrl = format === 'png'
          ? await addPngMetadataFooter(dataUrl, footer)
          : await addSvgMetadataFooter(dataUrl, footer);
      }
      
      downloadImage(dataUrl, format);
    } catch (err) {
      console.error(`${format.toUpperCase()} export failed:`, err);
      alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  }, [downloadImage, getNodes, includeImageFooter, repoDetails]);

  const exportAsPng = useCallback(() => exportAsImage('png', toPng, { pixelRatio: 2 }), [exportAsImage]);
  const exportAsSvg = useCallback(() => exportAsImage('svg', toSvg), [exportAsImage]);

  const downloadJson = useCallback((contents: string, suffix: string) => {
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stem = repoDetails ? `${repoDetails.owner}-${repoDetails.repo}` : 'rassam-diagram';
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${stem}.${suffix}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [repoDetails]);

  const exportAsJson = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    try {
      const document = createRassamGraphExport({ nodes, edges, repoDetails, project });
      downloadJson(serializeRassamExport(document), 'graph');
      setIsOpen(false);
    } catch (error) {
      alert(`Graph export failed validation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [downloadJson, getEdges, getNodes, project, repoDetails]);

  const exportBackup = useCallback((includeChats: boolean) => {
    if (!project) return;
    if (includeChats && !window.confirm(
      'Include chat history in this backup? Chat messages may contain source excerpts or other sensitive text. Cached source and provider credentials will remain excluded.',
    )) return;

    try {
      const liveProject: Project = { ...project, nodes: getNodes(), edges: getEdges() };
      const document = createRassamProjectBackup(liveProject, { includeChats });
      downloadJson(serializeRassamExport(document), includeChats ? 'backup-with-chats' : 'backup');
      setIsOpen(false);
    } catch (error) {
      alert(`Project backup failed validation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [downloadJson, getEdges, getNodes, project]);

  const handleImportClick = useCallback(() => {
    setIsOpen(false);
    importInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportProject) {
      onImportProject(file);
    }
    e.target.value = '';
  }, [onImportProject]);

  const exportOptions = [
    { icon: Image, label: 'Export as PNG', action: exportAsPng, color: 'text-cyan-400' },
    { icon: FileCode, label: 'Export as SVG', action: exportAsSvg, color: 'text-green-400' },
    { icon: FileJson, label: 'Export graph JSON', action: exportAsJson, color: 'text-amber-400' },
    ...(project ? [
      { icon: Archive, label: 'Backup project', action: () => exportBackup(false), color: 'text-blue-400' },
      { icon: MessagesSquare, label: 'Backup with chats…', action: () => exportBackup(true), color: 'text-violet-400' },
    ] : []),
    ...(onImportProject ? [{ icon: Upload, label: 'Import JSON', action: handleImportClick, color: 'text-purple-400' }] : []),
  ];

  return (
    <div className="relative" ref={exportRef}>
      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className={cn(
          compact
            ? 'p-2 rounded-lg transition-colors'
            : 'flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 backdrop-blur border border-slate-700 hover:bg-slate-800 transition-colors text-slate-200 text-sm',
          compact && (isOpen ? 'text-cyan-400 bg-slate-800' : 'text-slate-500 hover:text-slate-200'),
          !compact && isOpen && 'bg-slate-800 border-slate-600',
          isExporting && 'opacity-50 cursor-not-allowed'
        )}
        title={compact ? 'Export / Import' : undefined}
        aria-label={compact ? 'Export or import project' : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Download size={compact ? 20 : 16} className={isExporting ? 'animate-pulse' : ''} />
        {!compact && (isExporting ? 'Exporting...' : 'Export')}
        {!compact && <ChevronDown size={14} className={cn('transition-transform', isOpen && 'rotate-180')} />}
      </button>
      
      {isOpen && (
        <div className={cn(
          'absolute w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50',
          compact ? 'left-full top-0 ml-2' : 'top-full right-0 mt-2'
        )} role="menu" aria-label="Export and import options">
          <label className="flex min-h-10 items-center gap-3 border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={includeImageFooter}
              onChange={(event) => setIncludeImageFooter(event.target.checked)}
              className="size-4 accent-cyan-400"
            />
            Add revision footer to images
          </label>
          {exportOptions.map((option, i) => (
            <button
              key={i}
              onClick={() => option.action()}
              disabled={isExporting}
              role="menuitem"
              className="flex min-h-10 items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option.icon size={16} className={option.color} />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
