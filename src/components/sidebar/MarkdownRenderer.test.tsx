// @vitest-environment jsdom

import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, test, vi } from 'vitest';

import MarkdownRenderer from './MarkdownRenderer';

afterEach(cleanup);

test('turns a path:line code span into an actionable source citation', async () => {
  const user = userEvent.setup();
  const navigate = vi.fn();
  render(
    <MarkdownRenderer
      content={'The route is defined in `src/app/page.tsx:18-22`.'}
      onNavigateToSource={navigate}
    />,
  );

  const citation = screen.getByRole('button', {
    name: 'Open src/app/page.tsx, lines 18 to 22',
  });
  citation.focus();
  await user.keyboard('{Enter}');
  assert.deepEqual(navigate.mock.calls[0][0], {
    path: 'src/app/page.tsx',
    startLine: 18,
    endLine: 22,
  });
});

test('keeps citations readable and non-interactive without a navigation handler', () => {
  render(<MarkdownRenderer content={'See `src/lib/github.ts:9` and `npm run test`.'} />);

  assert.equal(screen.queryByRole('button'), null);
  assert.ok(screen.getByText('src/lib/github.ts:9'));
  assert.ok(screen.getByText('npm run test'));
});

test('does not nest a citation button inside an explicit Markdown link', () => {
  const navigate = vi.fn();
  render(
    <MarkdownRenderer
      content={'[`src/app/page.tsx:18`](https://example.test/source)'}
      onNavigateToSource={navigate}
    />,
  );

  const link = screen.getByRole('link', { name: /src\/app\/page\.tsx:18/i });
  assert.equal(link.querySelector('button'), null);
  assert.equal(screen.queryByRole('button'), null);
});

test('does not treat dotted code expressions as source citations', () => {
  const navigate = vi.fn();
  render(
    <MarkdownRenderer
      content={'Use `Object.keys`, `process.env.NODE_ENV`, and version `v1.2.3`.'}
      onNavigateToSource={navigate}
    />,
  );

  assert.equal(screen.queryByRole('button'), null);
  assert.ok(screen.getByText('Object.keys'));
});
