# Evaluation plan

Rassam makes claims that nobody has measured yet. This plan turns them into experiments the codebase can now run, with thresholds that decide whether the direction holds. It follows the research in `reports/Rassam pivot for the AGI era.md`; numbers there are cited with their evidence labels.

Principle: measure behavior, not satisfaction. In METR's 2025 trial, developers believed AI made them about 20% faster while it measured them 19% slower.

## 1. Gate accuracy (runs today)

`bench/gate/` holds labeled scenarios: documented agent reward hacks (skipped or trivialized tests, special-casing tests, forced `exit(0)`, CI and coverage weakening, contract weakening), architecture violations, reach problems (committed tokens, broad permissions), and legitimate changes that must not fail.

- **Run:** `npx tsx bench/gate/run.ts` (results in `bench/gate/RESULTS.md`; `src/blueprint/bench.test.ts` guards against regressions).
- **Report:** recall per category, false positives on negatives, and how many positives would fail CI versus only warn.
- **Status (2026-11-21, 109 cases):** the first run measured 75.6% recall with two legitimate changes failing CI. After fixing every miss it surfaced: 89.0% recall, 100% of non-hard expected findings, 0 legitimate changes failing CI, 5 of 33 negatives with a spurious warning. The nine hard evasions (semantic test weakening, re-export laundering, computed secret keys) remain undetected by design of a line-based gate.
- **Bar:** zero negatives fail CI; recall stays at or above the recorded baseline on every release.
- **Limit:** the heuristics are line-based. An adversary that knows them can evade them. The gate raises the cost of cheating and surfaces changes to the checks for a human; it does not prove correctness.

## 2. Does an executable contract reduce agent violations? (needs agent runs)

Research question: prose context files did not reliably help agents (ETH Zurich 2026: LLM-written files −0.5 to −2 points and +20% cost; human-written +2.4 points, not significant). Verification steps did (MAST: +15.6%).

- **Design:** at least 120 tasks (power estimate for a 10-point effect: 120–200 tasks) on repositories with a human-written blueprint. Arms: (A) no Rassam; (B) blueprint file only; (C) MCP server (`explain_path`, `check_dependency`, `check_changes`, `report_conflict`); (D) C plus the gate in CI with retries.
- **Measures:** new architecture violations per task (from the gate), task success, tokens and tool calls, use of `report_conflict` on tasks seeded with an impossible constraint, and test/CI tampering rate.
- **Kill or re-scope:** if C and D show no drop in violations versus A, the MCP layer is just another context file. Focus the product on the gate and review.

## 3. Do people write intent? (design partners)

The scarce asset is human-authored intent, and teams rarely write it down (6 of 46 architects surveyed had used ADRs).

- **Measures per partner repository, 30 and 90 days after install:** human-authored ratio (shown in every report), human-written invariants, gate kept on, flags per PR (target ≤ 5% of PRs), share of flags reviewers judge useful (target ≥ 50%).
- **Kill or re-scope (from the 90-day plan):** fewer than 3 of the partners keep the gate on after 30 days, or blueprints stay more than 80% machine-derived and unedited.

## 4. Visual versus text oversight (open question)

No study compares a graph view with text diffs and transcripts for catching agent misbehavior.

- **Design:** within-subject study; agent PRs with seeded violations (forbidden edges, reach expansion, test tampering); conditions: GitHub diff only, diff plus the Rassam text report, diff plus the Blueprint canvas.
- **Measures:** detection rate, time to decision, false alarms, and approval-without-edit rate.
- **Caution:** when AI outperforms people, human-AI teams do worse than the AI alone (meta-analysis, g = −0.54). The study should also test whether the canvas improves *intent authoring and sign-off*, not only line-level checking.

## 5. Rubber-stamp detection (ongoing)

If humans approve more than 95% of agent-proposed changes unedited for two quarters, sign-off has become automation bias. Track approval-without-edit rates for blueprint proposals and approval labels; when the threshold is crossed, cut human gates to irreversible changes and add opt-in cognitive forcing for high-stakes edits.

## Publishing

Publish every result, including negative ones, with the dataset and the exact Rassam version. Competitors' accuracy claims are self-reported; a small project's measured results are its cheapest form of credibility.
