# Asuka Network Core (Prototype)
> Public infrastructure protocol that makes administrative process integrity verifiable through Proof of Process (PoP).

[![Solana](https://img.shields.io/badge/Solana-Devnet-green?style=flat&logo=solana)]
[![Edge](https://img.shields.io/badge/Edge-Cloudflare_Workers-orange?style=flat&logo=cloudflare)]
[![License](https://img.shields.io/badge/License-MIT-blue)]
[![Status](https://img.shields.io/badge/Status-Mitou_Applied-red)]

[Japanese README](./README.ja.md)

## Demo
- User app: https://instant-grant-core.pages.dev/
- Admin app: https://instant-grant-core.pages.dev/admin/login

## We-ne
We-ne is the reference application built on this core protocol, focused on school/public participation and grant operation flows.

For product-level details, see:
- `wene-mobile/README.md`
- `wene-mobile/docs/STATIC_VERIFICATION_REPORT.md`

## Reviewer Summary (as of February 22, 2026)
This repository proposes and implements a practical answer to one question:
How can public systems prove not only what happened on-chain, but also how decisions and operations happened before settlement?

Core answer:
- PoP (Proof of Process): bind API-side process logs to on-chain settlement.
- Three-layer architecture:
1. Layer 1 (Solana, Anchor): settlement finality and anti-double-claim controls.
2. Layer 2 (Cloudflare Workers + Durable Objects): append-only process hash chain and operator APIs.
3. Layer 3 (Web/Mobile UI): user, admin, and master operations.

What is unique:
- Process integrity and settlement integrity are cryptographically linked.
- Operational strict levels are separated (`master > admin`) for transfer/PII visibility.
- Master search is server-side indexed and persisted in Durable Object SQLite (stable latency even after cold start).

## What Works Today
- On-chain PoP verification in claim flow (`claim_grant` / `claim_grant_with_proof`).
- Global and per-event audit chain (`prev_hash`, `stream_prev_hash`).
- Immutable audit persistence outside DO (R2 + optional ingest), with fail-closed mode.
- Operator auth hardening:
  - Admin-protected APIs require Bearer auth.
  - Master-only APIs require non-placeholder `ADMIN_PASSWORD`.
- Master governance UI:
  - Invite issue/revoke/rename.
  - Full admin/user disclosure.
  - Server-side indexed search endpoint: `GET /api/master/search`.

## 5-Minute Verification for Reviewers
Run these from repository root:

```bash
cd api-worker && npm test && npx tsc --noEmit
cd ../wene-mobile && npm run test:server && npx tsc --noEmit
```

Recommended runtime checks:
- `GET /v1/school/runtime-status` => `ready: true`
- `GET /v1/school/pop-status` => signer configured
- `GET /api/master/audit-integrity?limit=50` => `ok: true`
- `GET /api/master/search?q=<keyword>&limit=50` => indexed search results

## Architecture at a Glance
- `grant_program/`: Solana program (Layer 1)
- `api-worker/`: API, PoP process proof, audit, role-level APIs (Layer 2)
- `wene-mobile/`: user/admin/master UI (Layer 3)
- `functions/` and `wene-mobile/functions/`: Pages proxy routing (`/api`, `/v1`, `/metadata`, `/health`)

## Vision: Made-in-Japan Public Digital Infrastructure
Goal:
A domestic, auditable, and interoperable digital public infrastructure for grants, subsidies, and administrative workflows.

Long-term objective:
Expand PoP implementation to domestic Japanese server/compute infrastructure, including Fugaku-class environments, so servers can prove when, by whom, and through which process operations were executed.
In this project, we describe this as “injecting time into domestic servers.”

Principles:
- Accountability by default: every critical operation leaves a verifiable process trail.
- Non-custodial participation: users keep control of keys and signatures.
- Operational sovereignty: architecture that can be run by domestic institutions and public operators.
- Progressive decentralization: start practical, then federate.

## Future Operation on an Independent Chain (Planned)
Current production target is devnet-first validation on Solana.
In parallel, the longer-term roadmap includes operation on an independent chain.

Planned direction:
1. Federation phase: consortium-style operation across municipalities/institutions.
2. Sovereign infra phase: domestic validator and audit-network operations.
3. Independent chain phase: PoP-native chain where process proofs are first-class consensus objects.

Design intent for independent chain:
- Native data model for process proofs (not only transaction outcomes).
- Deterministic grant/distribution vault semantics inherited from current program logic.
- Interoperability with existing ecosystems (including Solana) for migration and bridge use cases.

Status note:
- This independent-chain operation is a roadmap item, not yet implemented in this repository.

## Repository Map
- `grant_program/` Solana program and tests
- `api-worker/` Worker API, audit logic, role-control APIs
- `wene-mobile/` Expo app (Web/Mobile), admin/master UI
- `docs/` architecture, security, development, roadmap

## Detailed Docs
- Architecture: `docs/ARCHITECTURE.md`
- Security: `docs/SECURITY.md`
- Roadmap: `docs/ROADMAP.md`
- Devnet setup: `docs/DEVNET_SETUP.md`
- API details: `api-worker/README.md`
- App details: `wene-mobile/README.md`

## Author
Kira (hk089660), 19 years old

## Applications
- IPA Mitou Program (Applied)
- Solana Foundation grant track (Applied)
- Masayoshi Son Foundation (Applied)

## License
MIT
