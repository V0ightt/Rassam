
import { createElement, type ElementType } from 'react';
import {
  Anchor,
  Archive,
  ArrowLeftRight,
  Box,
  Cloud,
  Container,
  Cpu,
  Database,
  DoorOpen,
  FileText,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Image,
  Layers,
  ListOrdered,
  Monitor,
  Palette,
  Plug,
  Radio,
  Route,
  Scale,
  Server,
  Shield,
  ShieldAlert,
  TestTube,
  Wrench,
  Zap,
} from 'lucide-react';

// Blueprint component kinds are free-form slugs. The well-known ones get an
// icon and an accent colour so the canvas and the component list read alike.

export interface KindColors {
  /** Tailwind text colour class for the kind's icon. */
  icon: string;
}

const kindIcons = {
  // Code-based
  api: Server,
  component: Box,
  config: Wrench,
  database: Database,
  auth: Shield,
  utility: Wrench,
  test: TestTube,
  style: Palette,
  asset: Image,
  documentation: FileText,
  core: Cpu,
  service: Cloud,
  hook: Anchor,
  context: Layers,
  middleware: GitBranch,
  model: Database,
  route: Route,
  // System design
  cache: HardDrive,
  queue: ListOrdered,
  'load-balancer': Scale,
  gateway: DoorOpen,
  storage: Archive,
  cdn: Globe,
  proxy: ArrowLeftRight,
  firewall: ShieldAlert,
  'external-api': Plug,
  'message-broker': Radio,
  container: Container,
  serverless: Zap,
  client: Monitor,
  default: Folder,
} satisfies Record<string, ElementType>;

type KnownKind = keyof typeof kindIcons;

const kindColorTable: Record<KnownKind, KindColors> = {
  // Code-based
  api: { icon: 'text-emerald-400' },
  component: { icon: 'text-blue-400' },
  config: { icon: 'text-amber-400' },
  database: { icon: 'text-purple-400' },
  auth: { icon: 'text-red-400' },
  utility: { icon: 'text-slate-400' },
  test: { icon: 'text-cyan-400' },
  style: { icon: 'text-pink-400' },
  asset: { icon: 'text-orange-400' },
  documentation: { icon: 'text-teal-400' },
  core: { icon: 'text-indigo-400' },
  service: { icon: 'text-violet-400' },
  hook: { icon: 'text-sky-400' },
  context: { icon: 'text-rose-400' },
  middleware: { icon: 'text-lime-400' },
  model: { icon: 'text-fuchsia-400' },
  route: { icon: 'text-yellow-400' },
  // System design
  cache: { icon: 'text-orange-300' },
  queue: { icon: 'text-amber-300' },
  'load-balancer': { icon: 'text-cyan-300' },
  gateway: { icon: 'text-emerald-300' },
  storage: { icon: 'text-violet-300' },
  cdn: { icon: 'text-sky-300' },
  proxy: { icon: 'text-teal-300' },
  firewall: { icon: 'text-red-300' },
  'external-api': { icon: 'text-blue-300' },
  'message-broker': { icon: 'text-pink-300' },
  container: { icon: 'text-indigo-300' },
  serverless: { icon: 'text-yellow-300' },
  client: { icon: 'text-slate-300' },
  default: { icon: 'text-slate-400' },
};

export const KNOWN_KINDS: string[] = [...new Set([...Object.keys(kindIcons), 'test', 'external-api'])]
  .sort((left, right) => (left === 'default' ? -1 : right === 'default' ? 1 : left.localeCompare(right)));

function isKnown(kind: string): kind is KnownKind {
  return Object.prototype.hasOwnProperty.call(kindIcons, kind);
}

export function kindIcon(kind: string | undefined): ElementType {
  return kind && isKnown(kind) ? kindIcons[kind] : kindIcons.default;
}

export function kindColors(kind: string | undefined): KindColors {
  return kind && isKnown(kind) ? kindColorTable[kind] : kindColorTable.default;
}

export function kindOptions(current?: string): string[] {
  return current && !KNOWN_KINDS.includes(current) ? [current, ...KNOWN_KINDS] : KNOWN_KINDS;
}

/** Icon for a component kind. A component (not a lookup in render) so React sees a stable type. */
export function KindIcon({ kind, size = 15, className }: { kind: string | undefined; size?: number; className?: string }) {
  return createElement(kindIcon(kind), { size, className, 'aria-hidden': true });
}
