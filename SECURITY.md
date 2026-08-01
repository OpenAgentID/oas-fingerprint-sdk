# Security Policy

## Reporting a Vulnerability

Do not open a public issue for an unpatched vulnerability.

Report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/OpenAgentID/oas-fingerprint-sdk/security/advisories/new).
If private vulnerability reporting is unavailable, email
**security@openagent.id**.

Include the affected version or commit, impact, reproduction steps, and a
minimal proof of concept when possible. Never include private keys, production
credentials, or personal data in a report.

We aim to acknowledge reports within 3 business days and provide a remediation
plan or a reasoned rejection within 14 days. We coordinate disclosure and
credit with the reporter after a fix is available.

## Supported Versions

Security fixes are applied to the latest released version and the `main`
branch. Older releases may require upgrading to receive a fix.

## Scope

Security-sensitive areas include:

- signature or challenge-response verification bypasses;
- private-key exposure through serialization, logging, rendering, or browser
  APIs;
- malformed payloads or frames that cause denial of service, unsafe resource
  consumption, or incorrect identity reconstruction;
- validation bypasses that accept malformed `did:oas` identities; and
- dependency vulnerabilities with a reachable exploit path.

The fingerprint is a visual transport for an OAS identity, not an authority
signal. Reports that rely only on visual similarity, without a cryptographic,
encoding, or verification failure, are generally out of scope.
