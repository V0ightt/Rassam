'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { toPng, toSvg } from 'html-to-image';
import { useReactFlow, getNodesBounds, getViewportForBounds } from 'reactflow';
import { 
  Download, 
  Image, 
  FileJson, 
  FileCode,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExportPanelProps {
  repoDetails?: { owner: string; repo: string } | null;
}

const imageWidth = 1920;
const imageHeight = 1080;

export default function ExportPanel({ repoDetails }: ExportPanelProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const { getNodes, getEdges } = useReactFlow();
  const exportRef = useRef<HTMLDivElement>(null);

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

  const exportAsPng = useCallback(async () => {
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

      const dataUrl = await toPng(viewportElement, {
        backgroundColor: '#020617',
        width: imageWidth,
        height: imageHeight,
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: true,
        filter: (node) => {
          // Skip elements that might cause issues
          if (node instanceof HTMLElement) {
            const classList = node.classList;
            return !classList.contains('react-flow__minimap') && 
                   !classList.contains('react-flow__controls');
          }
          return true;
        },
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      });
      
      downloadImage(dataUrl, 'png');
    } catch (err) {
      console.error('PNG export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  }, [getNodes, downloadImage]);

  const exportAsSvg = useCallback(async () => {
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

      const dataUrl = await toSvg(viewportElement, {
        backgroundColor: '#020617',
        width: imageWidth,
        height: imageHeight,
        cacheBust: true,
        skipFonts: true,
        filter: (node) => {
          // Skip elements that might cause issues
          if (node instanceof HTMLElement) {
            const classList = node.classList;
            return !classList.contains('react-flow__minimap') && 
                   !classList.contains('react-flow__controls');
          }
          return true;
        },
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      });
      
      downloadImage(dataUrl, 'svg');
    } catch (err) {
      console.error('SVG export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  }, [getNodes, downloadImage]);

  const exportAsJson = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    
    const data = {
      metadata: {
        exportedAt: new Date().toISOString(),
        repo: repoDetails || null,
        version: '1.0',
      },
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        data: e.data,
      })),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const fileName = repoDetails 
      ? `${repoDetails.owner}-${repoDetails.repo}-flowchart.json`
      : `flowchart.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [getNodes, getEdges, repoDetails]);

  const exportOptions = [
    { icon: Image, label: 'Export as PNG', action: exportAsPng, color: 'text-cyan-400' },
    { icon: FileCode, label: 'Export as SVG', action: exportAsSvg, color: 'text-green-400' },
    { icon: FileJson, label: 'Export as JSON', action: exportAsJson, color: 'text-amber-400' },
  ];

  return (
    <div className="relative" ref={exportRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 backdrop-blur border border-slate-700 hover:bg-slate-800 transition-colors text-slate-200 text-sm",
          isOpen && "bg-slate-800 border-slate-600",
          isExporting && "opacity-50 cursor-not-allowed"
        )}
      >
        <Download size={16} className={isExporting ? "animate-pulse" : ""} />
        {isExporting ? 'Exporting...' : 'Export'}
        <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          {exportOptions.map((option, i) => (
            <button
              key={i}
              onClick={() => option.action()}
              disabled={isExporting}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option.icon size={16} className={option.color} />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
