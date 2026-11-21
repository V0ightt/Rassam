import assert from 'node:assert/strict';
import fc from 'fast-check';
import { test } from 'vitest';
import {
  checksumProjectPayload,
  evaluateProjectWritePrecondition,
  normalizeProjectDocument,
  parseLegacyProjectPayload,
  projectPersistenceTokensMatch,
  type ProjectPersistenceToken,
} from './project-store';

function projectCandidate(id = 'project-1'): Record<string, unknown> {
  return {
    id,
    name: 'Example',
    repoUrl: '',
    source: 'empty',
    repoDetails: null,
    nodes: [
      {
        id: 'node-1',
        type: 'enhanced',
        position: { x: 10, y: 20 },
        data: {
          label: 'Core',
          description: '',
          category: 'core',
          files: [],
        },
      },
    ],
    edges: [],
    layoutDirection: 'TB',
    aiContextSnapshot: null,
    lastSyncedAt: null,
    chatSessions: [
      {
        id: 'chat-1',
        title: 'Chat 1',
        messages: [
          {
            id: 'message-1',
            role: 'assistant',
            content: 'Hello',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    activeChatSessionId: 'chat-1',
    fileTree: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

test('legacy migration validates projects independently', () => {
  const raw = JSON.stringify([
    projectCandidate(),
    { name: 'Missing identity', nodes: [], edges: [] },
  ]);

  const parsed = parseLegacyProjectPayload(raw);
  assert.equal(parsed.projects.length, 1);
  assert.equal(parsed.projects[0].id, 'project-1');
  assert.equal(parsed.failures.length, 1);
  assert.match(parsed.failures[0].reason, /stable string id/i);
  assert.equal(parsed.rootError, undefined);
});

test('legacy migration quarantines duplicate project ids instead of overwriting', () => {
  const parsed = parseLegacyProjectPayload(JSON.stringify([
    projectCandidate('duplicate'),
    projectCandidate('duplicate'),
  ]));

  assert.equal(parsed.projects.length, 1);
  assert.equal(parsed.failures.length, 1);
  assert.match(parsed.failures[0].reason, /duplicate project id/i);
});

test('project normalization restores dates and safely drops dangling edges', () => {
  const candidate = projectCandidate();
  candidate.edges = [{ id: 'edge-1', source: 'node-1', target: 'missing' }];

  const normalized = normalizeProjectDocument(candidate);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;

  assert.ok(normalized.project.createdAt instanceof Date);
  assert.ok(normalized.project.chatSessions[0].messages[0].timestamp instanceof Date);
  assert.deepEqual(normalized.project.edges, []);
  assert.ok(normalized.warnings.some((warning) => warning.includes('dangling edge')));
});

test('invalid legacy roots remain recoverable errors', () => {
  const invalidJson = parseLegacyProjectPayload('{invalid');
  assert.match(invalidJson.rootError ?? '', /valid JSON/i);

  const wrongRoot = parseLegacyProjectPayload(JSON.stringify({ project: projectCandidate() }));
  assert.match(wrongRoot.rootError ?? '', /array/i);
});

test('project checksums are deterministic and detect payload changes', () => {
  const payload = JSON.stringify(projectCandidate());
  assert.equal(checksumProjectPayload(payload), checksumProjectPayload(payload));
  assert.notEqual(checksumProjectPayload(payload), checksumProjectPayload(`${payload} `));
});

const tokenArbitrary = fc.record({
  graphRevision: fc.nat({ max: Number.MAX_SAFE_INTEGER }),
  checksum: fc.string({
    unit: fc.constantFrom(...'0123456789abcdef'),
    minLength: 8,
    maxLength: 8,
  }),
}) as fc.Arbitrary<ProjectPersistenceToken>;

test('persistence tokens require both graph revision and checksum', () => {
  fc.assert(fc.property(tokenArbitrary, tokenArbitrary, (left, right) => {
    assert.equal(
      projectPersistenceTokensMatch(left, right),
      left.graphRevision === right.graphRevision && left.checksum === right.checksum,
    );
  }));
});

test('two different writers starting at the same token cannot both win', () => {
  fc.assert(fc.property(
    tokenArbitrary,
    tokenArbitrary,
    tokenArbitrary,
    (base, firstDesired, secondDesiredInput) => {
      const secondDesired = secondDesiredInput.checksum === firstDesired.checksum
        ? { ...secondDesiredInput, checksum: firstDesired.checksum === '00000000' ? '00000001' : '00000000' }
        : secondDesiredInput;
      assert.equal(evaluateProjectWritePrecondition(base, base, firstDesired), 'write');
      assert.equal(evaluateProjectWritePrecondition(firstDesired, base, secondDesired), 'conflict');
    },
  ));
});

test('a committed retry is idempotent while a colliding create is rejected', () => {
  const token = { graphRevision: 7, checksum: 'deadbeef' };
  assert.equal(evaluateProjectWritePrecondition(token, token, token), 'idempotent');
  assert.equal(evaluateProjectWritePrecondition(token, null, token), 'conflict');
});
