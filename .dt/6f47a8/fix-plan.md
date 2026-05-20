# Fix Plan - Ticket #6f47a8

## Trivy Scan Results (HIGH/CRITICAL)

| CVE/GHSA | Package | Installed | Fixed In | Severity |
|---|---|---|---|---|
| CVE-2026-44573 | next | 14.2.35 | 15.5.16, 16.2.5 | HIGH |
| CVE-2026-44578 | next | 14.2.35 | 15.5.16, 16.2.5 | HIGH |
| GHSA-8h8q-6873-q5fj | next | 14.2.35 | 15.5.16, 16.2.5 | HIGH |
| GHSA-h25m-26qc-wcjf | next | 14.2.35 | 15.0.8+ | HIGH |
| GHSA-q4gf-8mx6-v5v3 | next | 14.2.35 | 15.5.15, 16.2.3 | HIGH |
| npm-audit: glob CLI injection | glob (via eslint-config-next) | - | eslint-config-next 15.x+ | HIGH |

## Fix Strategy

1. Bump `next` from ^14.1.0 to ^15.5.18 (covers all 5 CVEs)
2. Bump `react` and `react-dom` from ^18.2.0 to ^19.0.0 (required by Next.js 15)
3. Bump `@types/react` to ^19.0.0
4. Bump `eslint-config-next` from ^14.1.0 to ^15.5.18 (fixes glob transitive vuln)
5. Regenerate package-lock.json
6. Run vitest tests to verify no regressions

## Notes

- tar, minimatch, cross-spawn: NOT found vulnerable in current scan
- Next.js 14.2.35 is the latest 14.x; no fix available within v14 line
- Minimum fix version across all CVEs: next@15.5.16
