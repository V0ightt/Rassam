'use client';

import { useCallback, useMemo, useState } from 'react';

import type { SourceLocation } from '@/lib/source-location';
import type { RepoDetails } from '@/types';
import type { BlueprintGithubProject } from './BlueprintPanel';
import type { BlueprintSession } from './session';
import type { SourceTarget } from './ui';
import { useBlueprintUi } from './useBlueprintUi';

export type CanvasView = 'map' | 'blueprint';

interface BlueprintHostOptions {
  session: BlueprintSession;
  repoDetails: RepoDetails | null;
  refreshSourceGrant: () => Promise<string | null | undefined>;
  /** Open a repository file in the workbench editor. */
  openSource: (location: SourceLocation) => void;
  /** Bring the canvas tab to the front. */
  showCanvas: () => void;
  /** Open the Blueprint side panel. */
  openPanel: () => void;
}

/**
 * Glue between the workbench shell and the blueprint UI, kept here so the
 * shell stays a wiring layer: which canvas view is showing, which GitHub
 * project a blueprint can be loaded from, and when file links are safe to open.
 */
export function useBlueprintHost({ session, repoDetails, refreshSourceGrant, openSource, showCanvas, openPanel }: BlueprintHostOptions) {
  const ui = useBlueprintUi();
  const [canvasView, setCanvasView] = useState<CanvasView>('map');
  const { focusComponents } = ui;

  const githubProject = useMemo<BlueprintGithubProject | null>(() => (
    repoDetails?.commitSha
      ? {
          owner: repoDetails.owner,
          repo: repoDetails.repo,
          commitSha: repoDetails.commitSha,
          sourceGrant: repoDetails.sourceGrant,
          refreshSourceGrant,
        }
      : null
  ), [refreshSourceGrant, repoDetails]);

  // File links open in the editor only when the blueprint describes the revision the editor is showing.
  const source = session.source;
  const sourceMatchesProject = Boolean(
    source?.kind === 'github' && repoDetails
    && source.owner === repoDetails.owner && source.repo === repoDetails.repo && source.commitSha === repoDetails.commitSha,
  );
  const navigate = useCallback((target: SourceTarget) => {
    openSource({ path: target.path, startLine: target.line });
  }, [openSource]);

  const showOnCanvas = useCallback((componentIds: string[]) => {
    setCanvasView('blueprint');
    showCanvas();
    focusComponents(componentIds);
  }, [focusComponents, showCanvas]);

  const openLocalFolder = useCallback(() => {
    setCanvasView('blueprint');
    openPanel();
    void session.openLocalFolder().catch(() => undefined);
  }, [openPanel, session]);

  const attentionCount = session.report ? session.report.summary.errors + session.report.summary.warnings : 0;

  return {
    ui,
    canvasView,
    setCanvasView,
    githubProject,
    onNavigateToSource: sourceMatchesProject ? navigate : undefined,
    showOnCanvas,
    openLocalFolder,
    attentionCount,
  };
}
