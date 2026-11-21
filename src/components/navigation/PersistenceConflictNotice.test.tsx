// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, test, vi } from 'vitest';
import { axe } from 'vitest-axe';

import PersistenceConflictNotice from './PersistenceConflictNotice';

afterEach(cleanup);

const conflict = {
  projectId: 'project-1',
  reason: 'newer-revision' as const,
  localGraphRevision: 4,
  externalGraphRevision: 5,
  externalChecksum: 'external',
  detectedAt: new Date(0).toISOString(),
};

test('offers explicit reload and local-copy conflict recovery', async () => {
  const user = userEvent.setup();
  const reload = vi.fn(async () => true);
  const duplicate = vi.fn(async () => 'copy-id');
  const { container } = render(
    <PersistenceConflictNotice conflict={conflict} onReload={reload} onDuplicateLocalWork={duplicate} />,
  );

  assert.ok(screen.getByRole('alert'));
  await user.click(screen.getByRole('button', { name: 'Reload saved version' }));
  assert.equal(reload.mock.calls.length, 1);
  await user.click(screen.getByRole('button', { name: 'Keep local recovery copy' }));
  assert.equal(duplicate.mock.calls.length, 1);

  const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
  assert.equal(results.violations.length, 0, results.violations.map((item) => item.id).join(', '));
});

test('keeps the conflict visible when recovery fails', async () => {
  const user = userEvent.setup();
  render(
    <PersistenceConflictNotice conflict={conflict} onReload={async () => false} onDuplicateLocalWork={async () => null} />,
  );
  await user.click(screen.getByRole('button', { name: 'Reload saved version' }));
  assert.ok(screen.getByText(/could not be completed/));
});
