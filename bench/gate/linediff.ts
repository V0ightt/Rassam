// Minimal line diff (LCS) that turns two snapshots into the `ChangedFile[]`
// shape the gate consumes, with git-style rename detection.

import type { ChangedFile, DiffLine, SourceFile } from "../../src/blueprint/index";

function splitLines(content: string): string[] {
  if (content.length === 0) return [];
  const lines = content.split("\n").map((line) => line.replace(/\r$/, ""));
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Added lines carry head line numbers, removed lines carry base line numbers (both 1-based). */
export function diffLines(base: string, head: string): { added: DiffLine[]; removed: DiffLine[] } {
  const left = splitLines(base);
  const right = splitLines(head);
  const rows = left.length;
  const cols = right.length;
  // lcs[i][j] = length of the LCS of left[i..] and right[j..].
  const lcs: Uint32Array[] = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      lcs[i][j] = left[i] === right[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      removed.push({ line: i + 1, text: left[i] });
      i += 1;
    } else {
      added.push({ line: j + 1, text: right[j] });
      j += 1;
    }
  }
  for (; i < rows; i += 1) removed.push({ line: i + 1, text: left[i] });
  for (; j < cols; j += 1) added.push({ line: j + 1, text: right[j] });
  return { added, removed };
}

export interface SnapshotDiff {
  changes: ChangedFile[];
  /** Base contents of modified, deleted and renamed files (the gate's `baseFiles` input). */
  baseOfChanged: SourceFile[];
}

/** Share of lines two files have in common, like git's rename similarity index. */
function similarity(base: string, head: string): number {
  const baseLines = splitLines(base).length;
  const headLines = splitLines(head).length;
  if (baseLines === 0 && headLines === 0) return 1;
  const { removed } = diffLines(base, head);
  const common = baseLines - removed.length;
  return (2 * common) / (baseLines + headLines);
}

const RENAME_THRESHOLD = 0.5;

/**
 * Diff two snapshots the way `git diff` does by default: a deleted file and an
 * added file that share at least half their lines are reported as one rename.
 */
export function diffSnapshots(baseFiles: readonly SourceFile[], headFiles: readonly SourceFile[]): SnapshotDiff {
  const base = new Map(baseFiles.map((file) => [file.path, file]));
  const head = new Map(headFiles.map((file) => [file.path, file]));
  const deleted = [...base.keys()].filter((path) => !head.has(path)).sort();
  const added = [...head.keys()].filter((path) => !base.has(path)).sort();

  // Pair each deleted file with its most similar added file.
  const renamedFrom = new Map<string, string>();
  const taken = new Set<string>();
  for (const oldPath of deleted) {
    let bestPath: string | null = null;
    let bestScore = RENAME_THRESHOLD;
    for (const newPath of added) {
      if (taken.has(newPath)) continue;
      const score = similarity(base.get(oldPath)?.content ?? "", head.get(newPath)?.content ?? "");
      if (score >= bestScore && (bestPath === null || score > bestScore)) {
        bestPath = newPath;
        bestScore = score;
      }
    }
    if (bestPath !== null) {
      renamedFrom.set(bestPath, oldPath);
      taken.add(bestPath);
    }
  }
  const renamedAway = new Set(renamedFrom.values());

  const paths = [...new Set([...base.keys(), ...head.keys()])].sort();
  const changes: ChangedFile[] = [];
  const baseOfChanged: SourceFile[] = [];
  for (const path of paths) {
    const before = base.get(path);
    const after = head.get(path);
    if (before && after) {
      if (before.content === after.content) continue;
      const diff = diffLines(before.content ?? "", after.content ?? "");
      changes.push({ path, status: "modified", added: diff.added, removed: diff.removed });
      baseOfChanged.push(before);
    } else if (after) {
      const previousPath = renamedFrom.get(path);
      const previous = previousPath === undefined ? undefined : base.get(previousPath);
      if (previousPath !== undefined && previous) {
        const diff = diffLines(previous.content ?? "", after.content ?? "");
        changes.push({ path, previousPath, status: "renamed", added: diff.added, removed: diff.removed });
        baseOfChanged.push(previous);
      } else {
        changes.push({ path, status: "added", added: diffLines("", after.content ?? "").added, removed: [] });
      }
    } else if (before && !renamedAway.has(path)) {
      changes.push({ path, status: "deleted", added: [], removed: diffLines(before.content ?? "", "").removed });
      baseOfChanged.push(before);
    }
  }
  return { changes, baseOfChanged };
}
