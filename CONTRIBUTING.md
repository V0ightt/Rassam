# Contributing to Rassam

## Development setup

1. Install Node.js 22 and npm 10 or newer.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and configure only the providers you intend to test.
4. Run `npm run dev`.

## Required checks

Before submitting a change, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run `npm run test:e2e` for user-flow or browser-facing changes.

## Engineering expectations

- Preserve public-repository-only access rules and pinned revisions.
- Add runtime validation at every browser, GitHub, provider, import, and storage boundary.
- Keep graph changes project-scoped, revisioned, atomic, persistent, and undoable.
- Treat repository content as untrusted input.
- Do not log source, prompts, chat text, repository URLs, filenames, or credentials.
- Include loading, empty, error, cancellation, keyboard, and reduced-motion behavior for UI changes.
- Add tests at the lowest useful level and an E2E scenario for critical workflows.

The repository may contain local work in progress. Do not reset or overwrite changes you did not create.
