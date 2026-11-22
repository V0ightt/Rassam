import { createElement, type ElementType } from 'react';

import { categoryColors, categoryIcons } from '@/components/canvas/NodeTypes';
import type { NodeCategory } from '@/types';

// Blueprint component kinds are free-form slugs; the ones the map already knows
// get the same icon and colour so both views read as one product.

export type KindColors = (typeof categoryColors)[NodeCategory];

export const KNOWN_KINDS: string[] = [...new Set([...Object.keys(categoryIcons), 'test', 'external-api'])]
  .sort((left, right) => (left === 'default' ? -1 : right === 'default' ? 1 : left.localeCompare(right)));

function isKnown(kind: string): kind is NodeCategory {
  return Object.prototype.hasOwnProperty.call(categoryIcons, kind);
}

export function kindIcon(kind: string | undefined): ElementType {
  return kind && isKnown(kind) ? categoryIcons[kind] : categoryIcons.default;
}

export function kindColors(kind: string | undefined): KindColors {
  return kind && isKnown(kind) ? categoryColors[kind] : categoryColors.default;
}

export function kindOptions(current?: string): string[] {
  return current && !KNOWN_KINDS.includes(current) ? [current, ...KNOWN_KINDS] : KNOWN_KINDS;
}

/** Icon for a component kind. A component (not a lookup in render) so React sees a stable type. */
export function KindIcon({ kind, size = 15, className }: { kind: string | undefined; size?: number; className?: string }) {
  return createElement(kindIcon(kind), { size, className, 'aria-hidden': true });
}
