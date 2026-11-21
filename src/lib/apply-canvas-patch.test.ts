import { describe, expect, it } from 'vitest';
import { applyCanvasPatch } from '@/lib/apply-canvas-patch';
import type { FlowEdge, FlowNode } from '@/types';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const edgeId = '33333333-3333-4333-8333-333333333333';
const patchId = '44444444-4444-4444-8444-444444444444';

const node: FlowNode = {
  id: firstId,
  type: 'enhanced',
  position: { x: 0, y: 0 },
  data: { label: 'First', description: '', files: [], category: 'component' },
};

describe('applyCanvasPatch', () => {
  it('applies a complete patch without mutating the source', () => {
    const source = [node];
    const result = applyCanvasPatch(source, [], {
      patchId,
      baseGraphRevision: 4,
      resultingRevision: 5,
      summary: 'Add a related service',
      affectedNodeIds: [secondId],
      affectedEdgeIds: [edgeId],
      operations: [
        {
          action: 'add_node',
          node: {
            id: secondId,
            type: 'enhanced',
            position: { x: 200, y: 0 },
            data: { label: 'Second', description: '', files: [], category: 'service' },
          },
        },
        {
          action: 'add_edge',
          edge: { id: edgeId, source: firstId, target: secondId, type: 'custom', data: { type: 'calls' } },
        },
      ],
    }, 4);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.revision).toBe(5);
    expect(source).toHaveLength(1);
  });

  it('rejects stale and dangling patches without mutating the graph', () => {
    const sourceNodes = [node];
    const sourceEdges: FlowEdge[] = [];
    const patch = {
      patchId,
      baseGraphRevision: 2,
      resultingRevision: 3,
      summary: 'Invalid edge',
      affectedNodeIds: [],
      affectedEdgeIds: [edgeId],
      operations: [{
        action: 'add_edge',
        edge: { id: edgeId, source: firstId, target: secondId, type: 'custom' },
      }],
    };
    expect(() => applyCanvasPatch(sourceNodes, sourceEdges, patch, 1)).toThrow(/changed/);
    expect(() => applyCanvasPatch(sourceNodes, sourceEdges, patch, 2)).toThrow(/dangling/);
    expect(sourceEdges).toEqual([]);
  });
});
