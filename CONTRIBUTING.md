# Contributing to oas-fingerprint-sdk

`oas-fingerprint-sdk` is the particle-based visual transport and verification
layer for `did:oas` identities. Changes must preserve cryptographic
verification, deterministic identity handling, and frame compatibility.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Use a bug report for incorrect behavior and a feature request for proposed
  capabilities.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

For substantial protocol, payload, or compatibility changes, open an issue
before implementation so maintainers can confirm the intended contract.

## Development

Use Node.js 18 or newer. The package has no runtime installation step; run:

```bash
npm test
npm pack --dry-run
```

Tests should cover valid verification, tampered input, malformed payloads, and
boundary conditions. Changes to the wire format must update
`docs/PROTOCOL.md`.

## Pull Requests

- Keep each pull request focused and explain why the change is needed.
- Add or update tests for behavior changes.
- Update user-facing documentation and demos when APIs or defaults change.
- Ensure all verification commands pass on supported Node.js versions.
- Use conventional commit messages such as `feat:`, `fix:`, `docs:`, or
  `chore:`.

## License

The project is licensed under the MIT License. By contributing, you agree that
your contribution is licensed under the same terms.
