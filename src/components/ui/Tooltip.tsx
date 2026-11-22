'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement } from 'react';

import { Kbd } from './Kbd';

/**
 * An open tooltip is the top-most dismissable layer, so it would swallow the
 * Escape meant for the sheet underneath (Tab to "Close", press Escape, nothing
 * closes). Hand the key on to the sheet once the tooltip has gone.
 */
function passEscapeToSheet() {
  if (!document.querySelector('[role="dialog"][data-state="open"]')) return;
  setTimeout(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }, 0);
}

/** Hover/focus hint. The trigger keeps its own accessible name; the tooltip is supplementary. */
export function Tooltip({
  label,
  shortcut,
  side = 'top',
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactElement;
}) {
  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            onEscapeKeyDown={passEscapeToSheet}
            className="z-[90] flex animate-pop items-center gap-2 rounded-sm bg-overlay px-2 py-1 text-meta font-medium text-fg shadow-elev-2"
          >
            {label}
            {shortcut && <Kbd>{shortcut}</Kbd>}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
