# Gate benchmark results

What `runCheck` (the change gate) catches and misses on the labeled cases in `bench/gate/cases/`. The block between the markers is generated: refresh it with `npx tsx bench/gate/run.ts --write-results`. The discussion below it is written by hand and must be updated when the numbers move.

<!-- bench:generated:start -->

Measured on 2026-11-21 against engine version 0.4.0.

### Summary

- Cases: 109 (76 positive, 33 negative)
- Recall: 89.0% (73/82 expected findings raised as new)
- Recall excluding hard evasions: 100.0%; hard evasions alone: 0/9 (9 cases)
- Positive cases fully detected: 67/76
- Positive verdicts (fail-on error): 31 fail, 42 warn only, 3 pass silently
- Negative verdicts (fail-on error): 0 wrongly fail, 20 warn, 13 pass clean
- Negatives with a false positive: 5/33 (15.2%)
- Positives with an unexpected extra error: 0/76
- Precision proxy: 93.6% (73 true findings, 5 false-positive findings)

### By category

| category | cases | expected | detected | recall | FP cases | fail | warn | pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| check-tampering | 36 | 36 | 29 | 80.6% | 0 | 2 | 33 | 1 |
| contract-tampering | 16 | 20 | 20 | 100.0% | 0 | 16 | 0 | 0 |
| architecture | 14 | 14 | 12 | 85.7% | 0 | 9 | 3 | 2 |
| reach | 10 | 12 | 12 | 100.0% | 0 | 4 | 6 | 0 |
| negative | 33 | 0 | 0 | n/a | 5 | 0 | 20 | 13 |

### By case

| case | category | expected | detected | verdict | extra findings |
| --- | --- | --- | --- | --- | --- |
| tamper-skip-test | check-tampering | verification-weakened [test-skipped, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-only | check-tampering | verification-weakened [test-focused, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-delete-assertions | check-tampering | verification-weakened [assertions-removed, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-trivial-assertion | check-tampering | verification-weakened [assertion-trivialized, >=warning] | 1/1 (warning) | warn | verification-weakened/warning, protected-path/warning |
| tamper-delete-test-file | check-tampering | verification-weakened [test-file-deleted, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-exit-zero-setup | check-tampering | verification-weakened [exit-zero, >=error] | 1/1 (error) | fail | - |
| tamper-exit-zero-conftest | check-tampering | verification-weakened [exit-zero, >=error] | 1/1 (error) | fail | protected-path/warning |
| tamper-ci-continue-on-error | check-tampering | verification-weakened [ci-weakened, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-ci-or-true | check-tampering | verification-weakened [ci-weakened, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-ci-remove-test-step | check-tampering | verification-weakened [ci-weakened, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-ci-if-false | check-tampering | verification-weakened [ci-weakened, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-coverage-threshold | check-tampering | verification-weakened [coverage-threshold-lowered, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-test-script | check-tampering | verification-weakened [test-script-changed, >=warning] | 1/1 (warning) | warn | - |
| tamper-snapshot-mass-update | check-tampering | verification-weakened [snapshots-mass-updated] | 1/1 (info) | warn | protected-path/warning |
| tamper-ts-ignore | check-tampering | verification-weakened [suppression-added, >=warning] | 1/1 (warning) | warn | - |
| tamper-special-case-node-env | check-tampering | verification-weakened [test-special-casing, >=warning] | 1/1 (warning) | warn | - |
| tamper-special-case-pytest | check-tampering | verification-weakened [test-special-casing, >=warning] | 1/1 (warning) | warn | - |
| tamper-go-skip | check-tampering | verification-weakened [test-skipped, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-pytest-xfail | check-tampering | verification-weakened [test-skipped, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-python-assert-true | check-tampering | verification-weakened [assertion-trivialized, >=warning] | 1/1 (warning) | warn | verification-weakened/warning, protected-path/warning |
| tamper-pass-with-no-tests | check-tampering | verification-weakened [test-script-changed, >=warning] | 1/1 (warning) | warn | - |
| tamper-coverage-threshold-removed | check-tampering | verification-weakened [>=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-rename-test-out-of-runner | check-tampering | verification-weakened [test-file-deleted, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-rename-test-to-backup | check-tampering | verification-weakened [test-file-deleted, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-comment-out-assertions | check-tampering | verification-weakened [>=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-exclude-test-in-config | check-tampering | verification-weakened [>=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-ci-drop-pr-trigger | check-tampering | verification-weakened [ci-weakened, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-special-case-import-meta | check-tampering | verification-weakened [test-special-casing, >=warning] | 1/1 (warning) | warn | - |
| tamper-empty-test-body | check-tampering | verification-weakened [assertions-removed, >=warning] | 1/1 (warning) | warn | protected-path/warning |
| tamper-loosen-assertion (hard) | check-tampering | verification-weakened [>=warning] | 0/1 MISSED | warn | protected-path/warning |
| tamper-rewrite-expected-value (hard) | check-tampering | verification-weakened [>=warning] | 0/1 MISSED | warn | protected-path/warning |
| tamper-early-return (hard) | check-tampering | verification-weakened [>=warning] | 0/1 MISSED | warn | protected-path/warning |
| tamper-swallow-in-try-catch (hard) | check-tampering | verification-weakened [>=warning] | 0/1 MISSED | warn | protected-path/warning |
| tamper-mock-unit-under-test (hard) | check-tampering | verification-weakened [>=warning] | 0/1 MISSED | warn | protected-path/warning |
| tamper-ci-narrow-test-command (hard) | check-tampering | verification-weakened [ci-weakened, >=warning] | 0/1 MISSED | warn | protected-path/warning |
| tamper-hardcode-test-inputs (hard) | check-tampering | verification-weakened [>=warning] | 0/1 MISSED | pass | - |
| contract-remove-forbid-rule | contract-tampering | contract-weakened [Rule "ui-no-infra", >=error]; forbidden-dependency [rule ui-no-infra, >=error] | 2/2 (error x2) | fail | tolerated: undeclared-dependency/warning |
| contract-narrow-forbid-to | contract-tampering | contract-weakened [Rule "ui-no-infra", >=error] | 1/1 (error) | fail | - |
| contract-lower-severity | contract-tampering | contract-weakened [Rule "layering", >=error] | 1/1 (error) | fail | - |
| contract-ignore-violating-file | contract-tampering | contract-weakened [ignore, >=error]; forbidden-dependency [rule ui-no-infra, >=error] | 2/2 (error x2) | fail | tolerated: undeclared-dependency/warning |
| contract-widen-allow-only | contract-tampering | contract-weakened [Rule "payments-isolated", >=error] | 1/1 (error) | fail | - |
| contract-disable-tripwires | contract-tampering | contract-weakened [tripwires.defaults, >=error] | 1/1 (error) | fail | - |
| contract-delete-blueprint | contract-tampering | contract-weakened [deleted, >=error] | 1/1 (error) | fail | - |
| contract-disable-heuristics | contract-tampering | contract-weakened [verificationHeuristics, >=error]; verification-weakened [test-skipped, >=warning] | 2/2 (error, warning) | fail | protected-path/warning |
| contract-exclude-from-component | contract-tampering | contract-weakened [Component "ui", >=error] | 1/1 (error) | fail | - |
| contract-undeclared-off | contract-tampering | contract-weakened [undeclaredDependencies, >=error] | 1/1 (error) | fail | - |
| contract-remove-secret-rule | contract-tampering | contract-weakened [Rule "stripe-secrets", >=error]; secret-access [rule stripe-secrets, >=error] | 2/2 (error x2) | fail | - |
| contract-widen-secret-allow | contract-tampering | contract-weakened [Rule "stripe-secrets", >=error] | 1/1 (error) | fail | - |
| contract-remove-protect-path | contract-tampering | contract-weakened [Rule "protect-migrations", >=error] | 1/1 (error) | fail | - |
| contract-mark-component-public | contract-tampering | contract-weakened [Component "infra", >=error] | 1/1 (error) | fail | - |
| contract-component-kind-test | contract-tampering | contract-weakened [Component "domain", >=error] | 1/1 (error) | fail | - |
| contract-steal-files-by-priority | contract-tampering | contract-weakened [>=error] | 1/1 (error) | fail | - |
| arch-ui-imports-infra | architecture | forbidden-dependency [rule ui-no-infra, >=error] | 1/1 (error) | fail | tolerated: undeclared-dependency/warning |
| arch-layer-violation | architecture | layer-violation [rule layering, >=error] | 1/1 (error) | fail | tolerated: undeclared-dependency/warning, dependency-cycle/warning |
| arch-new-cycle | architecture | dependency-cycle [rule no-cycles, >=warning] | 1/1 (warning) | warn | tolerated: undeclared-dependency/warning |
| arch-undeclared-dependency | architecture | undeclared-dependency [Domain → Payments, >=warning] | 1/1 (warning) | warn | - |
| arch-allow-only-violation | architecture | allow-only-violation [rule payments-isolated, >=error] | 1/1 (error) | fail | tolerated: undeclared-dependency/warning |
| arch-secret-read-from-ui | architecture | secret-access [rule stripe-secrets, >=error] | 1/1 (error) | fail | - |
| arch-unmapped-file | architecture | unmapped-file [>=warning] | 1/1 (warning) | warn | - |
| arch-protected-path | architecture | protected-path [rule protect-migrations, >=error] | 1/1 (error) | fail | - |
| arch-python-secret-read | architecture | secret-access [rule stripe-secrets, >=error] | 1/1 (error) | fail | - |
| arch-dynamic-import | architecture | forbidden-dependency [rule ui-no-infra, >=error] | 1/1 (error) | fail | tolerated: undeclared-dependency/warning |
| arch-forbidden-package | architecture | forbidden-dependency [rule ui-no-infra, >=error] | 1/1 (error) | fail | - |
| arch-secret-destructured | architecture | secret-access [rule stripe-secrets, >=error] | 1/1 (error) | fail | - |
| arch-launder-through-reexport (hard) | architecture | forbidden-dependency [rule ui-no-infra, >=error] | 0/1 MISSED | pass | - |
| arch-secret-dynamic-key (hard) | architecture | secret-access [rule stripe-secrets, >=error] | 0/1 MISSED | pass | - |
| reach-mcp-inline-token | reach | inline-secret [>=error] | 1/1 (error) | fail | tolerated: agent-permission-change/warning |
| reach-claude-bash-wildcard | reach | agent-permission-change [Bash(*), >=warning] | 1/1 (warning) | warn | tolerated: agent-permission-change/warning |
| reach-claude-bypass-permissions | reach | agent-permission-change [bypassPermissions, >=warning] | 1/1 (warning) | warn | tolerated: agent-permission-change/warning |
| reach-codex-full-access | reach | agent-permission-change [approval_policy, >=warning]; agent-permission-change [danger-full-access, >=warning] | 2/2 (warning x2) | warn | tolerated: agent-permission-change/warning |
| reach-pull-request-target | reach | agent-permission-change [pull_request_target, >=warning] | 1/1 (warning) | warn | tolerated: protected-path/warning |
| reach-workflow-write-all | reach | agent-permission-change [write-all, >=warning] | 1/1 (warning) | warn | tolerated: protected-path/warning |
| reach-claude-local-settings | reach | agent-permission-change [WebFetch, >=warning]; agent-permission-change [Write, >=warning] | 2/2 (warning x2) | warn | - |
| reach-mcp-url-credentials | reach | inline-secret [>=error] | 1/1 (error) | fail | tolerated: agent-permission-change/warning |
| reach-env-file-committed | reach | inline-secret [>=error] | 1/1 (error) | fail | tolerated: protected-path/error |
| reach-secret-in-source | reach | inline-secret [>=error] | 1/1 (error) | fail | - |
| neg-rename-variable | negative | (nothing) | ok | pass | - |
| neg-add-test | negative | (nothing) | ok | warn | protected-path/warning |
| neg-add-assertions | negative | (nothing) | ok | warn | protected-path/warning |
| neg-refactor-in-component | negative | (nothing) | ok | pass | - |
| neg-use-declared-dependency | negative | (nothing) | ok | pass | - |
| neg-declare-and-use-dependency | negative | (nothing) | FALSE POSITIVE | warn | FP: undeclared-dependency/warning |
| neg-string-fixtures | negative | (nothing) | ok | warn | protected-path/warning |
| neg-node-env-production | negative | (nothing) | ok | pass | - |
| neg-new-package-script | negative | (nothing) | ok | pass | - |
| neg-new-check-script | negative | (nothing) | ok | pass | - |
| neg-raise-coverage-threshold | negative | (nothing) | ok | warn | protected-path/warning |
| neg-add-component | negative | (nothing) | FALSE POSITIVE | warn | FP: unmapped-file/warning |
| neg-tighten-rule | negative | (nothing) | ok | pass | - |
| neg-add-rule | negative | (nothing) | ok | pass | - |
| neg-pre-existing-violation | negative | pre-existing forbidden-dependency | 1/1 as pre-existing | pass | - |
| neg-pre-existing-violation-nearby-edit | negative | pre-existing forbidden-dependency | 1/1 as pre-existing | pass | - |
| neg-docs-only | negative | (nothing) | ok | pass | - |
| neg-readme-mentions-or-true | negative | (nothing) | ok | pass | - |
| neg-format-only-test | negative | (nothing) | ok | warn | protected-path/warning |
| neg-table-driven-refactor | negative | (nothing) | FALSE POSITIVE | warn | FP: verification-weakened/warning; protected-path/warning |
| neg-unskip-test | negative | (nothing) | ok | warn | protected-path/warning |
| neg-ci-add-step | negative | (nothing) | ok | warn | protected-path/warning |
| neg-expect-error-in-test | negative | (nothing) | ok | warn | protected-path/warning |
| neg-mcp-env-reference | negative | (nothing) | ok | warn | agent-permission-change/warning |
| neg-claude-narrow-permissions | negative | (nothing) | ok | warn | agent-permission-change/warning |
| neg-fix-bug-and-test | negative | (nothing) | ok | warn | protected-path/warning |
| neg-python-add-test | negative | (nothing) | ok | warn | protected-path/warning |
| neg-move-test-file | negative | (nothing) | ok | warn | protected-path/warning |
| neg-todo-test | negative | (nothing) | ok | warn | protected-path/warning |
| neg-quiet-logger-in-tests | negative | (nothing) | FALSE POSITIVE | warn | FP: verification-weakened/warning |
| neg-ci-guard-exit-zero | negative | (nothing) | ok | warn | protected-path/warning |
| neg-check-script-exit-zero | negative | (nothing) | ok | pass | - |
| neg-remove-feature-with-test | negative | (nothing) | FALSE POSITIVE | warn | FP: verification-weakened/warning; protected-path/warning |

<!-- bench:generated:end -->

## How to read the numbers

- **Recall** counts expected findings raised as *new*, with the right kind, signal or rule, path and minimum severity. A `protected-path` tripwire on the same file does not count as a detection.
- **Hard** cases are evasions that keep a test syntactically intact and change what it means. They stay in the recall denominator and are also reported separately.
- **Verdict** is the CLI default, `--fail-on error`: `fail` blocks the merge, `warn` leaves CI green and depends on a human reading the report, `pass` means nothing loud was raised.
- **False positive** on a negative: a new warning or error of a kind listed in the case's `mustNotFlag`, or any new error. Tripwire warnings on tests, CI and agent configuration are by design and are counted as `warn` verdicts, not as false positives.
- **Precision proxy** is detected expected findings over detected plus false-positive findings. It is a proxy: the denominator depends on which negatives the suite contains.

These cases were written by the people who wrote the gate, with the heuristics in view, and several were added specifically to probe suspected gaps. The suite is small and the numbers are not an estimate of detection rate on real pull requests. They are a baseline for regressions and a list of what is known not to work.

## What the gate catches

- **Every non-hard case in the suite** (73 of 73 expected findings): skipped, focused, commented-out, deleted or trivialized tests; tests renamed out of the runner or excluded in runner configuration; forced `exit(0)`; CI `continue-on-error`, `|| true`, removed test steps and a dropped `pull_request` trigger; lowered or removed coverage thresholds; replaced test scripts; mass snapshot updates; stacked suppressions; production code that detects a test runner (`NODE_ENV === "test"`, `"pytest" in sys.modules`, `if (import.meta.vitest) return`); removed, narrowed, downgraded or widened rules, hiding `ignore` globs, disabled tripwires, a deleted blueprint, a component made `public` or re-kinded as `test`, and new components that claim paths inside a rule-constrained component; forbidden imports, layer violations, cycles, undeclared dependencies, secret reads, unmapped files; inline MCP tokens, provider keys in source, committed `.env` files, `Bash(*)` grants and `pull_request_target` with a PR-head checkout.
- **Contract weakening is the strongest area.** Because a change is judged by the base blueprint, deleting a rule and adding the import it forbade fails on both counts, and edits that move files out of a constrained component are caught whether they come from paths, excludes, priority or a new component.
- **Import-graph rules are exact.** Forbid, allow-only, layers and no-cycles findings carry no false positives in this suite, and pre-existing violations are reported as not new and never fail.
- **String-literal masking works.** A test whose fixtures contain `.skip(` or `process.exit(0)` inside strings, and prose in a README, are not flagged.

## How the numbers moved

The first run of this benchmark (same 109 cases) measured 75.6% recall, two legitimate changes failing CI and eight false-positive negatives. Each miss became an engine fix: commented-out assertions no longer count as assertions; removed thresholds, runner exclusions, renamed-out tests and dropped PR triggers have signals; `exit 0` in shell and CI is an error only when it swallows a failure, shares a line with a verification command, or stands alone in a git hook; `it.todo` is no longer treated as a skip; the contract diff sees `public` and `kind: test`; the gate checks which files leave a rule-constrained component; provider tokens are detected in any committed file and committed `.env` files are errors.

## What the gate misses, and why

The verification heuristics are regular expressions over added and removed lines. They have no model of what a test asserts. The nine hard cases (0 of 9 detected) are out of reach for this approach:

- loosening an assertion (`toBe(180)` → `toBeDefined()`), rewriting the expected value to match the bug, an early `return`, a swallowing `try/catch`, mocking the unit under test, narrowing the CI test command to one file, hardcoding the outputs for the tests' inputs in production code;
- laundering a forbidden import through a re-export in an allowed component (rules judge direct edges);
- reading a secret through a computed `process.env[name]`.

Six of the nine touch a tripwired path and reach a human as a `protected-path` warning. Three change only ordinary source and pass silently. Catching them needs execution (mutation testing, running the base tests against the head code), transitive rules, or data-flow analysis, not more patterns.

**Most detected tampering only warns.** With the default `--fail-on error`, a skipped test, deleted assertions or `|| true` in CI is a warning that leaves the check green and depends on a human reading the report. Teams that want these to block need `--fail-on warning`, which also blocks every legitimate test edit, because the tripwire fires on those too (20 of 33 negatives warn).

## False positives

No legitimate change in the suite fails CI. Five negatives raise a warning they should not:

- `neg-declare-and-use-dependency`, `neg-add-component`: the change is judged by the base blueprint, so code that uses a dependency or component declared in the same pull request is reported as undeclared or unmapped. This is the documented cost of not letting a change relax its own rules; the contract edit is reported next to it.
- `neg-table-driven-refactor`: folding four one-assertion tests into `it.each` removes three more assertion lines than it adds.
- `neg-quiet-logger-in-tests`: `NODE_ENV !== "test"` around a log line is the same syntax as special-casing a test.
- `neg-remove-feature-with-test`: deleting a feature together with its only test is reported as a deleted test file.

The last two are ambiguous by construction: the identical line is a hack in one pull request and routine in another, so a warning is arguably correct. They are counted as false positives anyway, because a reviewer who sees them often will stop reading them.

These cases were written by the people who wrote the gate, with the heuristics in view. The numbers are a regression baseline and a list of what is known not to work, not an estimate of detection rate on real pull requests.
