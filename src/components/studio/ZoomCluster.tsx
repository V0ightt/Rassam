'use client';

import { CircleHelp, ListTree, Maximize, Minus, Plus } from 'lucide-react';

import { CanvasLegend, type CanvasApi } from '@/components/blueprint/BlueprintCanvas';
import { QUESTIONS, type CanvasQuestion } from '@/components/blueprint/useBlueprintCanvas';
import { IconButton } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Popover } from '@/components/ui/Popover';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

/** Bottom-right: the view switch (three questions over one model), zoom, fit, the legend and the outline. */
export default function ZoomCluster({
  api,
  question,
  onQuestionChange,
  outlineOpen,
  onToggleOutline,
  className,
}: {
  api: CanvasApi | null;
  question: CanvasQuestion;
  onQuestionChange: (question: CanvasQuestion) => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  className?: string;
}) {
  return (
    <div data-canvas-shortcuts="off" className={cx('flex flex-col items-end gap-2', className)}>
      <SegmentedControl<CanvasQuestion>
        label="View"
        value={question}
        onChange={onQuestionChange}
        className="glass rounded-lg shadow-elev-2"
        options={QUESTIONS.map((item) => ({ value: item.id, label: item.label, hint: item.question }))}
      />
      <div role="group" aria-label="Canvas controls" className="glass flex items-center gap-0.5 rounded-lg p-0.5 shadow-elev-2">
        <IconButton label="Zoom out" size="sm" disabled={!api} onClick={() => api?.zoomOut()}>
          <Minus size={15} strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
        <IconButton label="Zoom in" size="sm" disabled={!api} onClick={() => api?.zoomIn()}>
          <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
        <IconButton label="Fit view" shortcut="Shift+1" size="sm" disabled={!api} onClick={() => api?.fit()}>
          <Maximize size={14} strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
        <IconButton label="Outline" shortcut="Ctrl+\" size="sm" active={outlineOpen} aria-pressed={outlineOpen} onClick={onToggleOutline}>
          <ListTree size={15} strokeWidth={1.5} aria-hidden="true" />
        </IconButton>
        <Popover
          label="Legend"
          side="top"
          align="end"
          className="w-80"
          trigger={(
            <button type="button" aria-label="Legend" title="Legend" className="focus-ring grid h-7 w-7 place-items-center rounded-sm text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg">
              <CircleHelp size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
        >
          <CanvasLegend />
        </Popover>
      </div>
    </div>
  );
}
