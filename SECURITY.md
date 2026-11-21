# Security policy

## Supported versions

Security fixes are applied to the latest stable release and the active release-candidate branch.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Email `contact@rassam.dev` with:

- Affected version or commit
- Reproduction steps
- Expected impact
- Any suggested mitigation

Avoid including real credentials, private repository content, or personal data. Maintainers should acknowledge a report within three business days and provide a status update within seven business days.

## Security boundary

The hosted 1.0 profile supports public GitHub.com repositories only. It must reject private repositories and must not be configured with a shared GitHub token that can read private repositories. Projects and cached source remain in the browser. Source excerpts may be sent to the explicitly selected AI provider when the user chooses an AI feature.
