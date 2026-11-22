// Navigation commands of the intent bar: typed after ">".

export interface StudioCommand {
  id: string;
  label: string;
  /** Extra words that should match. */
  keywords?: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

export interface CommandContext {
  watching: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  theme: 'dark' | 'light';
  openSettings(): void;
  toggleWatch(): void;
  fitView(): void;
  undo(): void;
  redo(): void;
  save(): void;
  switchTheme(): void;
  openAttention(): void;
  openSource(): void;
  toggleOutline(): void;
  openManual(): void;
}

export function buildCommands(context: CommandContext): StudioCommand[] {
  return [
    { id: 'attention', label: 'Show what needs attention', keywords: 'health findings rulings reach status', run: context.openAttention },
    { id: 'source', label: 'Open source and history', keywords: 'commit switch repository folder sync', run: context.openSource },
    { id: 'fit', label: 'Fit view', keywords: 'zoom canvas', shortcut: 'Shift+1', run: context.fitView },
    { id: 'outline', label: 'Toggle outline', keywords: 'list accessible components', shortcut: 'Ctrl+\\', run: context.toggleOutline },
    { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !context.canUndo, run: context.undo },
    { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !context.canRedo, run: context.redo },
    { id: 'save', label: context.canSave ? 'Save blueprint to the folder' : 'Download blueprint.json', keywords: 'save write download export', run: context.save },
    { id: 'watch', label: context.watching ? 'Stop watching for new commits' : 'Watch for new commits', keywords: 'toggle watch live', run: context.toggleWatch },
    { id: 'manual', label: 'Edit blueprint manually', keywords: 'forms components rules invariants decisions', run: context.openManual },
    { id: 'theme', label: context.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', keywords: 'switch theme appearance', run: context.switchTheme },
    { id: 'settings', label: 'Open settings', keywords: 'model provider', run: context.openSettings },
  ];
}

/** `query` is what follows ">". Every word must appear in the label or keywords. */
export function filterCommands(commands: StudioCommand[], query: string): StudioCommand[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands.filter((command) => {
    const haystack = `${command.label} ${command.keywords ?? ''}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
