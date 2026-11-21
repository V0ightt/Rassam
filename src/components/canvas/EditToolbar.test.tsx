// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, test, vi } from 'vitest';

import EditToolbar from './EditToolbar';

afterEach(cleanup);

test('uses a labelled, focus-managed dialog for node creation', async () => {
  const add = vi.fn();
  render(
    <EditToolbar
      selectedNode={null}
      onAddNode={add}
      onDeleteNode={() => undefined}
      onUpdateNode={() => undefined}
    />,
  );

  const trigger = screen.getByRole('button', { name: 'Add node' });
  fireEvent.click(trigger);
  assert.ok(screen.getByRole('dialog', { name: 'Add node' }));
  fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Repository gateway' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Pins public revisions' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add node' }));
  assert.equal(add.mock.calls[0][0].label, 'Repository gateway');
  await waitFor(() => assert.equal(document.activeElement === trigger, true));

});
