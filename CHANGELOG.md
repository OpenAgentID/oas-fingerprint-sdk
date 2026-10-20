# Changelog

All notable changes to `oas-fingerprint-sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The package is at version 0.1.0 and installs from this repository; it has not
been published to npm.

### Added

- `did:oas` identity generation with namespace, kind and identifier
  validation; Ed25519 key generation and verification; OAS credential envelopes
  with `Ed25519Signature2020` proofs; and Reed-Solomon protected visual
  transport over the particle cloud, for browser, terminal, GIF and still-image
  surfaces.
- Community health files, CI on Node 18, 20 and 22, issue forms, a support
  policy, a code of conduct and Dependabot updates for npm and GitHub Actions.

### Fixed

- `Fingerprint.restore()` no longer throws a `ReferenceError` on Node 18.

### Changed

- The README installs the package from GitHub, where it is available today.
