// A small bundled repository so the Studio can be explored offline in a few
// seconds. It is presented to the data layer as an in-memory folder, so it
// goes through exactly the same scan → analyse → check path as a real one.

import type { LocalDirectoryHandle, LocalFileHandle } from '@/lib/blueprint-client/local-folder';

export const SAMPLE_NAME = 'orbit-notes (sample)';

const BLUEPRINT = {
  version: '0.1',
  system: { name: 'Orbit Notes', description: 'A small notes product used as the Rassam sample.' },
  components: [
    {
      id: 'web',
      name: 'Web',
      kind: 'component',
      paths: ['src/web/**'],
      intent: 'Renders the product. Talks to the API only.',
      provenance: { source: 'human' },
    },
    {
      id: 'api',
      name: 'API',
      kind: 'api',
      paths: ['src/api/**'],
      intent: 'The only way in: validates requests, then calls the domain.',
      provenance: { source: 'human' },
    },
    {
      id: 'domain',
      name: 'Domain',
      kind: 'service',
      paths: ['src/domain/**'],
      intent: 'Notes, sharing and plan limits. No HTTP, no UI.',
      provenance: { source: 'human' },
      verified: { by: 'Sam Rivera', at: '2026-10-02T09:00:00.000Z' },
    },
    {
      id: 'auth',
      name: 'Auth',
      kind: 'service',
      paths: ['src/auth/**'],
      intent: 'Sessions and sign-in. Owns the session secret.',
      provenance: { source: 'human' },
    },
    {
      id: 'billing',
      name: 'Billing',
      kind: 'service',
      paths: ['src/billing/**'],
      provenance: { source: 'derived' },
    },
    {
      id: 'storage',
      name: 'Storage',
      kind: 'database',
      paths: ['src/storage/**'],
      intent: 'The database client. Nothing above the domain touches it.',
      provenance: { source: 'human' },
    },
  ],
  dependencies: [
    { from: 'web', to: 'api', kind: 'calls', provenance: { source: 'human' } },
    { from: 'api', to: 'domain', kind: 'imports', provenance: { source: 'human' } },
    { from: 'api', to: 'auth', kind: 'imports', provenance: { source: 'human' } },
    { from: 'domain', to: 'storage', kind: 'imports', provenance: { source: 'human' } },
    { from: 'domain', to: 'billing', kind: 'imports', provenance: { source: 'derived' } },
    { from: 'auth', to: 'storage', kind: 'imports', provenance: { source: 'human' } },
  ],
  rules: [
    {
      id: 'domain-is-headless',
      kind: 'forbid',
      from: 'domain',
      to: 'web',
      severity: 'error',
      reason: 'Domain logic never depends on the UI.',
      provenance: { source: 'human' },
    },
    { id: 'no-cycles', kind: 'no-cycles', provenance: { source: 'human' } },
  ],
  invariants: [],
  decisions: [],
};

const FILES: Record<string, string> = {
  '.rassam/blueprint.json': `${JSON.stringify(BLUEPRINT, null, 2)}\n`,
  'package.json': `${JSON.stringify({ name: 'orbit-notes', private: true, version: '1.0.0' }, null, 2)}\n`,
  'src/web/App.tsx': [
    "import { listNotes } from '../api/client';",
    "import { NotesPage } from './pages/NotesPage';",
    '',
    'export async function App() {',
    '  return NotesPage({ notes: await listNotes() });',
    '}',
    '',
  ].join('\n'),
  'src/web/pages/NotesPage.tsx': [
    "import { saveNote } from '../../api/client';",
    "import { db } from '../../storage/db';",
    '',
    '// Shortcut that skips the API: the kind of drift Rassam is there to catch.',
    'export function NotesPage({ notes }: { notes: string[] }) {',
    '  return { notes, save: saveNote, total: db.count() };',
    '}',
    '',
  ].join('\n'),
  'src/api/client.ts': [
    "export const listNotes = async (): Promise<string[]> => (await fetch('/api/notes')).json();",
    "export const saveNote = async (text: string) => fetch('/api/notes', { method: 'POST', body: text });",
    '',
  ].join('\n'),
  'src/api/routes.ts': [
    "import { requireSession } from '../auth/session';",
    "import { createNote, notesFor } from '../domain/notes';",
    "import { shareNote } from '../domain/sharing';",
    '',
    'export function routes(request: { cookie: string; body: string }) {',
    '  const user = requireSession(request.cookie);',
    '  return { list: () => notesFor(user), create: () => createNote(user, request.body), share: shareNote };',
    '}',
    '',
  ].join('\n'),
  'src/domain/notes.ts': [
    "import { db } from '../storage/db';",
    '',
    'export const notesFor = (user: string) => db.find(user);',
    'export const createNote = (user: string, text: string) => db.insert(user, text);',
    '',
  ].join('\n'),
  'src/domain/sharing.ts': [
    "import { planAllowsSharing } from '../billing/plans';",
    "import { notesFor } from './notes';",
    '',
    'export function shareNote(user: string, index: number) {',
    '  return planAllowsSharing(user) ? notesFor(user)[index] : null;',
    '}',
    '',
  ].join('\n'),
  'src/auth/session.ts': [
    "import { db } from '../storage/db';",
    '',
    'const secret = process.env.SESSION_SECRET;',
    'export function requireSession(cookie: string): string {',
    "  return db.session(cookie, secret) ?? 'anonymous';",
    '}',
    '',
  ].join('\n'),
  'src/billing/plans.ts': [
    'const key = process.env.STRIPE_SECRET_KEY;',
    'export const planAllowsSharing = (user: string) => Boolean(key) && user.length > 0;',
    '',
  ].join('\n'),
  'src/storage/db.ts': [
    'const url = process.env.DATABASE_URL;',
    'export const db = {',
    '  url,',
    '  count: () => 0,',
    '  find: (user: string): string[] => [user],',
    '  insert: (user: string, text: string) => `${user}:${text}`,',
    '  session: (cookie: string, secret?: string) => (secret ? cookie : null),',
    '};',
    '',
  ].join('\n'),
  '.mcp.json': `${JSON.stringify({ mcpServers: { rassam: { command: 'npx', args: ['rassam', 'mcp'] } } }, null, 2)}\n`,
};

interface MemoryDirectory {
  directories: Map<string, MemoryDirectory>;
  files: Map<string, string>;
}

function emptyDirectory(): MemoryDirectory {
  return { directories: new Map(), files: new Map() };
}

function notFound(name: string): Error {
  const error = new Error(`${name} was not found.`);
  error.name = 'NotFoundError';
  return error;
}

function fileHandle(directory: MemoryDirectory, name: string): LocalFileHandle {
  return {
    kind: 'file',
    name,
    async getFile() {
      const bytes = new TextEncoder().encode(directory.files.get(name) ?? '');
      return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
    },
    async createWritable() {
      let text = '';
      return {
        async write(data: string) { text += data; },
        async close() { directory.files.set(name, text); },
        async abort() { text = ''; },
      };
    },
  };
}

function directoryHandle(directory: MemoryDirectory, name: string): LocalDirectoryHandle {
  return {
    kind: 'directory',
    name,
    values() {
      const entries: Array<LocalFileHandle | LocalDirectoryHandle> = [
        ...[...directory.directories.entries()].map(([child, value]) => directoryHandle(value, child)),
        ...[...directory.files.keys()].map((child) => fileHandle(directory, child)),
      ];
      return {
        async *[Symbol.asyncIterator]() {
          yield* entries;
        },
      };
    },
    async getDirectoryHandle(child, options) {
      let value = directory.directories.get(child);
      if (!value) {
        if (!options?.create) throw notFound(child);
        value = emptyDirectory();
        directory.directories.set(child, value);
      }
      return directoryHandle(value, child);
    },
    async getFileHandle(child, options) {
      if (!directory.files.has(child)) {
        if (!options?.create) throw notFound(child);
        directory.files.set(child, '');
      }
      return fileHandle(directory, child);
    },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };
}

/** The sample repository as a folder handle that lives only in memory. */
export function createSampleFolder(): LocalDirectoryHandle {
  const root = emptyDirectory();
  for (const [path, content] of Object.entries(FILES)) {
    const segments = path.split('/');
    const fileName = segments.pop()!;
    let directory = root;
    for (const segment of segments) {
      let next = directory.directories.get(segment);
      if (!next) {
        next = emptyDirectory();
        directory.directories.set(segment, next);
      }
      directory = next;
    }
    directory.files.set(fileName, content);
  }
  return directoryHandle(root, SAMPLE_NAME);
}

type DirectoryPicker = () => Promise<LocalDirectoryHandle>;

/**
 * Open the sample through the session's own "open a folder" path. The data
 * layer asks the browser for a folder; for the duration of this one call the
 * answer is the in-memory sample, then the real picker is put back.
 */
export async function openSample(session: { openLocalFolder(): Promise<void> }): Promise<void> {
  const host = window as unknown as { showDirectoryPicker?: DirectoryPicker };
  const had = Object.prototype.hasOwnProperty.call(host, 'showDirectoryPicker');
  const original = host.showDirectoryPicker;
  host.showDirectoryPicker = async () => createSampleFolder();
  try {
    await session.openLocalFolder();
  } finally {
    if (had) host.showDirectoryPicker = original;
    else delete host.showDirectoryPicker;
  }
}
