'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, ChevronRight, Sparkles, X } from 'lucide-react';

import type { BlueprintSession } from '@/components/blueprint/session';
import { IconButton } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Kbd } from '@/components/ui/Kbd';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { Receipt } from '@/components/ui/Toast';

import { filterCommands, type StudioCommand } from './commands';
import ProposalCard from './ProposalCard';

export interface IntentBarHandle {
  focus(): void;
  /** Put text in the box without sending it. */
  fill(text: string): void;
}

type IntentSession = Pick<
  BlueprintSession,
  | 'intent' | 'suggestions' | 'receipts' | 'report' | 'blueprint' | 'canUndo' | 'canRedo'
  | 'proposeIntent' | 'chooseIntentOption' | 'applyProposal' | 'discardProposal' | 'undo' | 'redo'
>;

interface IntentBarProps {
  session: IntentSession;
  /** Selected component ids: the scope sent with the instruction. */
  selection: string[];
  onRemoveScope: (id: string) => void;
  commands: StudioCommand[];
  className?: string;
}

interface Item {
  key: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  activate: () => void;
}

const SUGGESTION_LIMIT = 5;
const RECEIPT_LIMIT = 3;

function timeOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The primary control: say what should change, see it staged on the canvas,
 * apply or discard. Typing ">" turns it into a command palette.
 */
const IntentBar = forwardRef<IntentBarHandle, IntentBarProps>(function IntentBar({ session, selection, onRemoveScope, commands, className }, ref) {
  const { intent, suggestions, receipts, blueprint } = session;
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'applied' | 'undone'; label: string } | null>(null);
  const [seenReceipt, setSeenReceipt] = useState<string | null>(receipts[0]?.id ?? null);
  const [seenProposal, setSeenProposal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    fill: (value: string) => {
      setText(value);
      setActive(-1);
      inputRef.current?.focus();
    },
  }), []);

  // A new receipt means something was just applied: offer the way back.
  const newestReceipt = receipts[0] ?? null;
  if ((newestReceipt?.id ?? null) !== seenReceipt) {
    setSeenReceipt(newestReceipt?.id ?? null);
    if (newestReceipt) setNotice({ kind: 'applied', label: newestReceipt.label });
  }

  const proposal = intent.status === 'proposed' ? intent.proposal : null;
  if ((proposal?.id ?? null) !== seenProposal) {
    setSeenProposal(proposal?.id ?? null);
    setConfirming(false);
  }
  // A staged proposal is answered from the keyboard: Enter applies, Escape discards.
  useEffect(() => {
    if (proposal?.id) inputRef.current?.focus();
  }, [proposal?.id]);

  const names = useMemo(() => new Map((blueprint?.components ?? []).map((component) => [component.id, component.name])), [blueprint]);
  const scope = selection.filter((id) => names.has(id));
  const commandMode = text.startsWith('>');

  const submit = (instruction: string) => {
    const value = instruction.trim();
    if (!value) return;
    setNotice(null);
    setText('');
    setActive(-1);
    void session.proposeIntent(value, scope.length ? { selection: scope } : undefined);
  };

  const items = useMemo<Item[]>(() => {
    if (commandMode) {
      return filterCommands(commands, text.slice(1)).map((command) => ({
        key: `command:${command.id}`,
        label: command.label,
        hint: command.shortcut,
        disabled: command.disabled,
        activate: () => {
          setText('');
          setActive(-1);
          command.run();
        },
      }));
    }
    if (intent.status === 'ambiguous') {
      return intent.options.map((option, index) => ({
        key: `option:${index}`,
        label: option.label,
        activate: () => session.chooseIntentOption(index),
      }));
    }
    if (intent.status === 'unknown') {
      return intent.examples.slice(0, SUGGESTION_LIMIT).map((example) => ({
        key: `example:${example}`,
        label: example,
        activate: () => {
          setText(example);
          setActive(-1);
          inputRef.current?.focus();
        },
      }));
    }
    if (intent.status === 'idle' && focused && !text.trim()) {
      return suggestions.slice(0, SUGGESTION_LIMIT).map((suggestion) => ({
        key: `suggestion:${suggestion}`,
        label: suggestion,
        activate: () => {
          // A suggestion that ends in a blank for the person to fill is put in the box instead of sent.
          if (/^write intent for /i.test(suggestion)) {
            setText(`set intent of ${suggestion.replace(/^write intent for /i, '')} to "`);
            inputRef.current?.focus();
          } else {
            submit(suggestion);
          }
        },
      }));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `submit` only closes over values listed here
  }, [commandMode, commands, focused, intent, session, suggestions, text, scope.join('|')]);

  const applyProposal = () => {
    if (!proposal) return;
    if (proposal.weakens) {
      setConfirming(true);
      return;
    }
    session.applyProposal();
  };

  const stepBack = (): boolean => {
    if (intent.status !== 'idle') {
      session.discardProposal();
      return true;
    }
    if (text) {
      setText('');
      setActive(-1);
      return true;
    }
    return false;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => {
        const next = current + step;
        return next < -1 ? items.length - 1 : next >= items.length ? -1 : next;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = active >= 0 ? items[active] : commandMode ? items.find((item) => !item.disabled) : undefined;
      if (chosen) {
        if (!chosen.disabled) chosen.activate();
        return;
      }
      if (commandMode) return;
      if (text.trim()) {
        submit(text);
        return;
      }
      // Enter on an empty box answers the staged proposal, unless that would loosen the contract.
      if (proposal && !confirming) applyProposal();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!stepBack()) inputRef.current?.blur();
    }
  };

  const thinking = intent.status === 'thinking';
  const componentCount = blueprint?.components.length ?? 0;
  const showIdlePanel = intent.status === 'idle' && focused && !notice && !text.trim() && (items.length > 0 || receipts.length > 0);
  const showItems = items.length > 0 && (commandMode || intent.status !== 'idle' || showIdlePanel);
  const activeId = active >= 0 && showItems ? `${listId}-${active}` : undefined;

  const announcement = intent.status === 'proposed'
    ? `Proposal ready, ${intent.proposal.applied.length} ${intent.proposal.applied.length === 1 ? 'change' : 'changes'}. Press Enter to apply or Escape to discard.`
    : intent.status === 'thinking' ? 'Working on it.'
      : intent.status === 'ambiguous' ? intent.message
        : intent.status === 'unknown' ? intent.message : '';

  const list = showItems && (
    <ul id={listId} role="listbox" aria-label={commandMode ? 'Commands' : intent.status === 'ambiguous' ? 'Which one did you mean?' : intent.status === 'unknown' ? 'Examples' : 'Suggestions'} className="py-1">
      {items.map((item, index) => (
        <li
          key={item.key}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === active}
          aria-disabled={item.disabled || undefined}
          // Keep focus in the input: the option is activated without moving it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { if (!item.disabled) item.activate(); }}
          onMouseEnter={() => setActive(index)}
          className={cx(
            'mx-1 flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-3 text-small',
            item.disabled ? 'cursor-not-allowed text-fg-disabled' : 'text-fg',
            index === active && !item.disabled && 'bg-hover',
          )}
        >
          {commandMode && <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden="true" />}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint && <Kbd>{item.hint}</Kbd>}
        </li>
      ))}
    </ul>
  );

  return (
    <div
      ref={wrapperRef}
      data-canvas-shortcuts="off"
      className={cx('flex flex-col gap-2', className)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
          setActive(-1);
        }
      }}
    >
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>

      {proposal ? (
        <ProposalCard
          proposal={proposal}
          report={session.report}
          confirming={confirming}
          onApply={applyProposal}
          onConfirmWeakening={() => session.applyProposal()}
          onDiscard={() => session.discardProposal()}
        />
      ) : thinking ? (
        <div className="animate-rise rounded-xl bg-overlay px-4 py-3 text-small text-fg-2 shadow-elev-2" data-testid="intent-thinking">
          <StatusGlyph tone="working" label={`Working out what “${intent.instruction}” changes across ${componentCount} ${componentCount === 1 ? 'component' : 'components'}…`} />
        </div>
      ) : intent.status === 'error' ? (
        <div role="alert" className="flex animate-rise items-start gap-2 rounded-xl bg-overlay py-2 pl-4 pr-2 text-small text-fg shadow-elev-2">
          <StatusGlyph tone="bad" label="Could not do that" hideLabel className="mt-1" />
          <p className="min-w-0 flex-1 py-1 leading-5">{intent.message}</p>
          <IconButton label="Dismiss" size="sm" onClick={() => session.discardProposal()}>
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </IconButton>
        </div>
      ) : intent.status === 'ambiguous' || intent.status === 'unknown' ? (
        <div className="animate-rise rounded-xl bg-overlay pt-3 text-small text-fg shadow-elev-2" data-testid={`intent-${intent.status}`}>
          <p className="px-4 leading-5">{intent.message}</p>
          <p className="mt-2 px-4 text-meta font-medium uppercase tracking-wider text-fg-3">
            {intent.status === 'ambiguous' ? 'Choose one' : 'Things you can say'}
          </p>
          {list}
        </div>
      ) : commandMode ? (
        <div className="animate-rise rounded-xl bg-overlay text-fg shadow-elev-2">
          {items.length ? list : <p className="px-4 py-3 text-small text-fg-3">No command matches.</p>}
        </div>
      ) : notice ? (
        <Receipt
          message={notice.kind === 'applied' ? notice.label : `Undone: ${notice.label}`}
          tone={notice.kind === 'applied' ? 'ok' : 'unknown'}
          toneLabel={notice.kind === 'applied' ? 'Applied' : 'Undone'}
          actionLabel={notice.kind === 'applied' ? (session.canUndo ? 'Undo' : undefined) : (session.canRedo ? 'Redo' : undefined)}
          actionShortcut={notice.kind === 'applied' ? 'Ctrl+Z' : 'Ctrl+Shift+Z'}
          onAction={() => {
            if (notice.kind === 'applied') {
              session.undo();
              setNotice({ kind: 'undone', label: notice.label });
            } else {
              session.redo();
              setNotice(null);
            }
          }}
          onDismiss={() => setNotice(null)}
        />
      ) : showIdlePanel ? (
        <div className="animate-rise rounded-xl bg-overlay pt-2 text-fg shadow-elev-2" data-testid="intent-suggestions">
          {items.length > 0 && (
            <>
              <p className="px-4 pt-1 text-meta font-medium uppercase tracking-wider text-fg-3">Suggestions</p>
              {list}
            </>
          )}
          {receipts.length > 0 && (
            <div className="border-t border-line-subtle px-4 py-2">
              <p className="text-meta font-medium uppercase tracking-wider text-fg-3">Recent</p>
              <ul aria-label="Recent changes" className="mt-1 space-y-1">
                {receipts.slice(0, RECEIPT_LIMIT).map((receipt) => (
                  <li key={receipt.id} className="flex items-baseline gap-2 text-small text-fg-2">
                    <span className="min-w-0 flex-1 truncate">{receipt.label}</span>
                    <span className="tabular shrink-0 text-meta text-fg-3">{timeOf(receipt.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="border-t border-line-subtle px-4 py-2 text-meta text-fg-3">
            Changes are previewed before anything is applied. Type <Kbd>&gt;</Kbd> for commands.
          </p>
        </div>
      ) : null}

      <div
        className={cx(
          'glass flex h-12 items-center gap-2 rounded-xl pl-4 pr-2 shadow-elev-3 transition-shadow duration-100',
          focused && 'shadow-[var(--elev-3),0_0_0_2px_var(--accent)]',
        )}
      >
        <Sparkles
          size={18}
          strokeWidth={1.5}
          aria-hidden="true"
          className={cx('shrink-0', thinking ? 'animate-breathe text-accent-text' : proposal ? 'text-accent-text' : 'text-fg-3')}
        />
        {scope.length > 0 && (
          <ul aria-label="Scope" className="flex max-w-[45%] shrink-0 items-center gap-1 overflow-hidden">
            {scope.map((id) => (
              <li key={id} className="inline-flex h-7 min-w-0 items-center rounded-sm bg-accent-muted pl-2 text-meta font-medium text-accent-text">
                <span className="truncate">{names.get(id)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${names.get(id)} from scope`}
                  onClick={() => onRemoveScope(id)}
                  className="focus-ring ml-0.5 grid h-7 w-6 place-items-center rounded-sm hover:bg-hover"
                >
                  <X size={12} strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Tell Rassam what to change"
          aria-expanded={Boolean(showItems)}
          aria-controls={showItems ? listId : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          maxLength={2_000}
          value={text}
          placeholder={proposal ? 'Enter to apply, Esc to discard, or keep typing to refine…' : 'Tell Rassam what to change…'}
          onChange={(event) => { setText(event.target.value); setActive(-1); }}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-input text-fg placeholder:text-fg-3 focus:outline-none"
        />
        {text.trim() && !commandMode ? (
          <IconButton label="Send" shortcut="Enter" onClick={() => submit(text)} className="bg-accent text-on-accent hover:bg-accent-hover hover:text-on-accent">
            <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        ) : (
          <span className="mr-2 hidden shrink-0 items-center gap-1 sm:inline-flex" aria-hidden="true">
            <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
          </span>
        )}
      </div>
    </div>
  );
});

export default IntentBar;
