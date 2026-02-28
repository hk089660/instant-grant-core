# Roadmap

This document outlines the development roadmap for we-ne.

## Vision

Enable instant, transparent, and low-cost benefit distribution for public support programs in Japan and beyond.

## Current Status (MVP)

✅ **Completed**
- SPL token-based periodic grants (smart contract)
- Mobile app for recipients (React Native/Expo)
- Phantom wallet integration
- Deep link support (custom scheme + Universal Links)
- Basic claim flow with double-claim prevention
- Merkle-based allowlist claim path (`claim_grant_with_proof`)
- PoP signature verification on Solana (`verify_and_record_pop_proof`)
- Admin/master audit visibility APIs and receipt verification endpoint

## Status Snapshot (as of 2026-02-22)

Implemented now:
- On/off-chain route policy toggle (enforced vs non-enforced) per event; PoP verification remains mandatory inside on-chain claim instructions
- Runtime/PoP/audit readiness endpoints for operator verification
- Hash-chain based transfer and participation receipt audit traces

Planned next:
- External audit execution and remediation
- CI/CD and test coverage hardening
- Federation/adapter design generalization
- Trust-assumption reduction plan (single-operator/signer -> multi-operator/multi-signer)
- One real-world pilot (anonymous organization allowed) + fixed one-page onboarding flow

## Pilot Validation (Real Adopter Fit)

Purpose:
- Avoid "too-early" evaluation by showing at least one real operator can run the flow end-to-end.

Profile (anonymous allowed):
- 1 institution (school / education NPO / municipal contractor)
- `admin 1-3` operators, `20-200` participants

Pilot timeline targets:
- [ ] Candidate lock (anonymous naming policy confirmed): 2026-03-10
- [ ] Operator dry-run complete: 2026-03-24
- [ ] Live pilot event execution: 2026-04-15
- [ ] Redacted evidence package published: 2026-04-22

Pilot success criteria:
- At least one event runs through `admin login -> QR issuance -> user claim -> success -> audit verification`
- Runtime/readiness snapshots (`/v1/school/pop-status`, `/v1/school/runtime-status`, `/v1/school/audit-status`) are captured
- Receipt verification by code (`/api/audit/receipts/verify-code`) is reproducible
- If on-chain path is used, `txSignature` and `receiptPubkey` are captured and independently verifiable

Reference one-page flow:
- `docs/PILOT_ONBOARDING_FLOW.md`

## Short Term (2 Weeks)

### Smart Contract
- [x] Merkle-based allowlist verification
- [ ] Event emission for better indexing
- [ ] Instruction to update grant parameters
- [ ] Additional negative-path tests for PoP message validation

### Mobile App
- [ ] Improved error handling and user feedback
- [ ] Transaction history screen
- [ ] Offline-capable grant info caching

### Infrastructure
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Automated testing coverage >60%
- [ ] Devnet deployment scripts
- [ ] PoP chain recovery drill (`reset/fork handling/stream cut`) and operator runbook validation

## Medium Term (1 Month)

### Smart Contract
- [ ] Multi-token grant support
- [ ] Batch claim optimization
- [ ] Grant expiry and auto-close

### Mobile App
- [ ] Multiple wallet support (Solflare, etc.)
- [ ] Push notifications for claim availability
- [ ] Localization (EN/JA complete)

### Admin Tools
- [ ] Web dashboard for grant creators
- [ ] Analytics and monitoring
- [ ] Bulk allowlist management

### Security
- [ ] Smart contract audit (external) - vendor selection target: 2026-03-15
- [ ] Smart contract audit kickoff target: 2026-04-01
- [ ] Mobile app security review target: 2026-04-15
- [ ] Bug bounty program launch

### Trust Assumption Reduction (Operator/Signer Decentralization)
- [ ] Role-key separation (`operator`, `pop_signer`, `audit_admin`) + key-rotation runbook target: 2026-03-31
- [ ] `2-of-3 multisig` for high-impact grant operations (`upsert_pop_config`, `set_paused`, `set_allowlist_root`, `close_grant`) target: 2026-04-30
- [ ] `threshold PoP signer (t-of-n)` design freeze + devnet PoC target: 2026-05-31

## Long Term (3 Months)

### Cost of Forgery Integration
- [ ] Sybil resistance layer
- [ ] Privacy-preserving eligibility proofs
- [ ] Cross-grant deduplication

### Ecosystem
- [ ] SDK for third-party integrations
- [ ] API for grant discovery
- [ ] Partner onboarding tools

### Compliance
- [ ] KYC integration (optional, for regulated use cases)
- [ ] Audit trail and reporting tools
- [ ] Multi-sig grant administration

### Scale
- [ ] Mainnet deployment
- [ ] Performance optimization
- [ ] Geographic expansion beyond Japan

## Grant Milestones (for Solana Foundation)

| Milestone | Deliverable | Timeline |
|-----------|-------------|----------|
| M1 | Devnet MVP with docs | Complete |
| M2 | Allowlist + audit prep | Target: 2026-03-08 |
| M3 | Admin dashboard + audit + role-key separation | Target: 2026-03-31 |
| M4 | One pilot (anonymous allowed) + one-page onboarding flow + redacted evidence package | Target: 2026-04-22 |
| M5 | Mainnet beta readiness + multisig/threshold signer PoC | Target: 2026-05-31 |

## How to Contribute

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

Priority areas for contributions:
1. Testing (unit + integration)
2. Documentation improvements
3. Localization
4. Security review
5. UI/UX feedback

## Contact

- GitHub Issues: Feature requests and bugs
- GitHub Discussions: General questions
