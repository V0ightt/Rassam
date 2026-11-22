// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, test, vi } from 'vitest';

import { Button, IconButton } from './Button';
import { Input } from './Input';
import { Kbd } from './Kbd';
import { Badge, Pill } from './Pill';
import { Popover } from './Popover';
import { SegmentedControl } from './SegmentedControl';
import { Sheet } from './Sheet';
import { StatusGlyph } from './StatusGlyph';
import { Receipt, Toast } from './Toast';
import { THEME_BOOT_SCRIPT } from './theme-boot';
import { setSolidSurfaces, setTheme } from './theme';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-solid');
});

function SheetHarness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open sheet</button>
      <button type="button">Outside</button>
      <Sheet open={open} onOpenChange={(next) => { setOpen(next); onOpenChange?.(next); }} title="Attention" description="Two things">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Sheet>
    </>
  );
}

test('a sheet is a labelled modal dialog: focus is trapped, the page behind is inert, Escape closes it and focus returns', async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  render(<SheetHarness onOpenChange={onOpenChange} />);
  const opener = screen.getByRole('button', { name: 'Open sheet' });
  await user.click(opener);

  const dialog = screen.getByRole('dialog', { name: 'Attention' });
  assert.ok(within(dialog).getByRole('heading', { name: 'Attention' }));
  assert.ok(within(dialog).getByText('Two things'));
  assert.ok(document.activeElement === dialog, `focus moves into the sheet (was on ${document.activeElement?.tagName} ${document.activeElement?.textContent?.slice(0, 30)})`);
  assert.ok(screen.queryByRole('button', { name: 'Outside' }) === null, 'content behind the sheet is hidden from assistive technology');

  // Tab cycles inside the sheet and never reaches the page behind it.
  const inside = [within(dialog).getByRole('button', { name: 'Close' }), within(dialog).getByRole('button', { name: 'First' }), within(dialog).getByRole('button', { name: 'Last' })];
  for (let step = 0; step < 7; step += 1) {
    await user.tab();
    assert.ok(dialog.contains(document.activeElement), `Tab ${step + 1} stays inside the sheet`);
  }
  assert.ok(inside.every((element) => dialog.contains(element)));

  // Escape closes the sheet even while a control with a tooltip (Close) has focus.
  within(dialog).getByRole('button', { name: 'Close' }).focus();
  await user.keyboard('{Escape}');
  await waitFor(() => assert.ok(screen.queryByRole('dialog') === null, 'the sheet is closed'));
  assert.deepEqual(onOpenChange.mock.calls.at(-1), [false]);
  assert.ok(document.activeElement === opener, 'focus returns to the control that opened the sheet');
  assert.ok(screen.getByRole('button', { name: 'Outside' }));
});

test('the close button closes a sheet', async () => {
  const user = userEvent.setup();
  render(<SheetHarness />);
  await user.click(screen.getByRole('button', { name: 'Open sheet' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  assert.ok(screen.queryByRole('dialog') === null);
});

test('buttons are real buttons with accessible names; icon buttons are named by their label', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(
    <>
      <Button variant="primary" onClick={onClick}>Apply</Button>
      <Button disabled onClick={onClick}>Disabled</Button>
      <IconButton label="Zoom in" onClick={onClick}><svg aria-hidden="true" /></IconButton>
    </>,
  );
  const apply = screen.getByRole('button', { name: 'Apply' });
  assert.equal(apply.getAttribute('type'), 'button', 'never submits a form by accident');
  assert.match(apply.className, /h-8/);
  await user.click(apply);
  await user.click(screen.getByRole('button', { name: 'Disabled' }));
  await user.click(screen.getByRole('button', { name: 'Zoom in' }));
  assert.equal(onClick.mock.calls.length, 2);
  assert.match(screen.getByRole('button', { name: 'Zoom in' }).className, /h-8 w-8/, 'icon buttons are 32px targets');
});

test('status is glyph, label and colour together, and the label survives being hidden visually', () => {
  render(
    <>
      <StatusGlyph tone="ok" label="On track" />
      <StatusGlyph tone="bad" label="Down" hideLabel />
      <StatusGlyph tone="unknown" label="Status unknown" />
    </>,
  );
  for (const [tone, label] of [['ok', 'On track'], ['bad', 'Down'], ['unknown', 'Status unknown']] as const) {
    const element = document.querySelector(`[data-status="${tone}"]`)!;
    assert.ok(element.querySelector('svg[aria-hidden="true"]'), `${tone} has a glyph`);
    assert.equal(element.textContent, label, `${tone} has a text label`);
  }
  assert.match(screen.getByText('Down').className, /sr-only/);
  const shapes = new Set([...document.querySelectorAll('[data-status] svg')].map((svg) => svg.getAttribute('class')?.match(/lucide-[a-z0-9-]+/)?.[0]));
  assert.equal(shapes.size, 3, 'each status has its own shape');
});

test('a segmented control is a radio group driven by arrow keys', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
    return <SegmentedControl label="View" value={value} onChange={setValue} options={[{ value: 'a', label: 'Dependencies' }, { value: 'b', label: 'Impact' }, { value: 'c', label: 'Reach' }]} />;
  }
  render(<Harness />);
  const group = screen.getByRole('radiogroup', { name: 'View' });
  const radios = within(group).getAllByRole('radio');
  assert.deepEqual(radios.map((radio) => radio.getAttribute('aria-checked')), ['true', 'false', 'false']);
  assert.deepEqual(radios.map((radio) => radio.tabIndex), [0, -1, -1], 'one tab stop for the whole group');

  radios[0].focus();
  await user.keyboard('{ArrowRight}');
  assert.equal(radios[1].getAttribute('aria-checked'), 'true');
  assert.ok(document.activeElement === radios[1]);
  await user.keyboard('{ArrowLeft}{ArrowLeft}');
  assert.equal(radios[2].getAttribute('aria-checked'), 'true', 'wraps around');
  await user.keyboard('{Home}');
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
  await user.click(radios[2]);
  assert.equal(radios[2].getAttribute('aria-checked'), 'true');
});

test('a popover opens from its trigger, takes focus, and closes on Escape or an outside press', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Popover label="Legend" trigger={<button type="button">Legend</button>}>
        <button type="button">Inside</button>
      </Popover>
      <button type="button">Elsewhere</button>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'Legend' });
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');

  await user.click(trigger);
  const panel = screen.getByRole('dialog', { name: 'Legend' });
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(trigger.getAttribute('aria-controls'), panel.id);
  assert.ok(document.activeElement === within(panel).getByRole('button', { name: 'Inside' }));

  await user.keyboard('{Escape}');
  assert.ok(screen.queryByRole('dialog') === null);
  assert.ok(document.activeElement === trigger);

  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
  assert.ok(screen.queryByRole('dialog') === null);
});

test('a receipt is a polite status with the way back; an error toast is an alert', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  const onDismiss = vi.fn();
  render(
    <>
      <Receipt message="Declared API → Database" actionLabel="Undo" onAction={onAction} onDismiss={onDismiss} />
      <Toast tone="bad" toneLabel="Problem">The folder could not be read.</Toast>
    </>,
  );
  const receipt = screen.getByRole('status');
  assert.equal(receipt.getAttribute('aria-live'), 'polite');
  assert.match(receipt.textContent ?? '', /Declared API → Database/);
  await user.click(within(receipt).getByRole('button', { name: 'Undo' }));
  await user.click(within(receipt).getByRole('button', { name: 'Dismiss' }));
  assert.deepEqual([onAction.mock.calls.length, onDismiss.mock.calls.length], [1, 1]);
  assert.match(screen.getByRole('alert').textContent ?? '', /The folder could not be read/);
});

test('small pieces: inputs take labels, pills are buttons, badges and key caps are text', () => {
  render(
    <>
      <label htmlFor="name">Name</label>
      <Input id="name" aria-invalid defaultValue="x" />
      <Pill aria-label="Health: On track">On track</Pill>
      <Badge tone="warn">3 findings</Badge>
      <Kbd label="Escape">Esc</Kbd>
    </>,
  );
  assert.equal(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid'), 'true');
  const pill = screen.getByRole('button', { name: 'Health: On track' });
  assert.match(pill.className, /glass/, 'floating pills are the glass layer');
  assert.match(pill.className, /h-9/);
  assert.ok(screen.getByText('3 findings'));
  assert.equal(screen.getByLabelText('Escape').tagName, 'KBD');
});

test('theme and solid surfaces are attributes on <html>, persisted, and applied before paint', () => {
  setTheme('light');
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(window.localStorage.getItem('rassam_theme'), 'light');
  setSolidSurfaces(true);
  assert.equal(document.documentElement.getAttribute('data-solid'), 'true');
  setSolidSurfaces(false);
  assert.equal(document.documentElement.hasAttribute('data-solid'), false);

  // The boot script restores the stored theme; on a first visit it follows the system preference.
  document.documentElement.removeAttribute('data-theme');
  new Function(THEME_BOOT_SCRIPT)();
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');

  window.localStorage.clear();
  const matchMedia = vi.fn((query: string) => ({ matches: query.includes('light') }));
  vi.stubGlobal('matchMedia', matchMedia);
  new Function(THEME_BOOT_SCRIPT)();
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  new Function(THEME_BOOT_SCRIPT)();
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark', 'dark is the default');
  vi.unstubAllGlobals();
});
