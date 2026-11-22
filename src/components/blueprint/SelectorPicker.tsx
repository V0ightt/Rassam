'use client';

import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { freeSelectorError } from './model';
import { hintClass, inputClass, labelClass, secondaryButtonClass } from './ui';

interface SelectorPickerProps {
  legend: string;
  hint?: string;
  components: Array<{ id: string; name: string }>;
  /** Selector entries: bare component ids plus tag:/path:/package: entries and ! exclusions. */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Builds a selector without making people remember the grammar: tick the
 * components, then add tag:/path:/package: entries or "!" exclusions by hand.
 */
export default function SelectorPicker({ legend, hint, components, value, onChange }: SelectorPickerProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const componentIds = new Set(components.map((component) => component.id));
  const names = new Map(components.map((component) => [component.id, component.name]));
  const extras = value.filter((entry) => !componentIds.has(entry));

  const toggle = (id: string, checked: boolean) => onChange(checked ? [...value, id] : value.filter((entry) => entry !== id));

  const addDraft = () => {
    const entry = draft.trim();
    // "!billing" excludes a component; everything else needs a prefix.
    const excludedComponent = entry.startsWith('!') && componentIds.has(entry.slice(1));
    const problem = excludedComponent ? null : freeSelectorError(entry);
    if (problem) {
      setError(problem);
      return;
    }
    if (!value.includes(entry)) onChange([...value, entry]);
    setDraft('');
    setError(null);
  };

  return (
    <fieldset className="rounded-md border border-slate-800 p-2">
      <legend className="px-1 text-xs font-medium text-slate-300">{legend}</legend>
      {hint && <p className="mb-1.5 text-xs leading-4 text-slate-500">{hint}</p>}

      {components.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded border border-slate-800 bg-slate-950/60 p-1">
          {components.map((component) => (
            <label key={component.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-200 hover:bg-slate-800/70">
              <input
                type="checkbox"
                className="accent-cyan-400"
                checked={value.includes(component.id)}
                onChange={(event) => toggle(component.id, event.target.checked)}
              />
              <span className="truncate">{component.name}</span>
            </label>
          ))}
        </div>
      )}

      {extras.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={`${legend}: other selectors`}>
          {extras.map((entry) => {
            const excluded = entry.startsWith('!');
            const label = excluded && names.has(entry.slice(1)) ? `not ${names.get(entry.slice(1))}` : entry;
            return (
              <li key={entry} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs ${excluded ? 'border-red-500/40 text-red-200' : 'border-slate-600 text-slate-200'}`}>
                {label}
                <button type="button" aria-label={`Remove ${entry}`} onClick={() => onChange(value.filter((item) => item !== entry))} className="rounded text-slate-400 hover:text-slate-100">
                  <X size={10} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-1.5">
        <label htmlFor={inputId} className={labelClass}>Add tag:, path:, package: or !exclusion</label>
        <div className="flex gap-1.5">
          <input
            id={inputId}
            className={`${inputClass} font-mono`}
            value={draft}
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            placeholder="package:node:fs"
            onChange={(event) => { setDraft(event.target.value); setError(null); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); addDraft(); }
            }}
          />
          <button type="button" className={secondaryButtonClass} onClick={addDraft} aria-label={`Add selector to ${legend}`}>
            <Plus size={12} aria-hidden="true" />
          </button>
        </div>
        {error && <p id={errorId} role="alert" className={`${hintClass} text-red-300`}>{error}</p>}
      </div>
    </fieldset>
  );
}
