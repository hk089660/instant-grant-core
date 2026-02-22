# Pilot Onboarding Flow (One Page)

Status: fixed as of 2026-02-22.

## Goal

Run one real pilot (anonymous organization allowed) with re-verifiable evidence.

## Target Profile

- Organization: 1 institution (school / education NPO / municipal contractor)
- Operators: `admin 1-3`
- Participants: `20-200` (mixed wallet and non-wallet users)

## End-to-End Flow

| Step | Owner | Action | Exit Criteria |
|---|---|---|---|
| 1. Intake + scope freeze | Operator + project team | Confirm pilot scope, anonymity policy, and event size | Pilot scope doc approved and dated |
| 2. Runtime readiness | Operator | Validate `/v1/school/pop-status`, `/v1/school/runtime-status`, `/v1/school/audit-status` | All required readiness checks pass |
| 3. Event setup | Operator | Create/prepare event in admin flow, print QR route, and participant instructions | Event reaches publish-ready state |
| 4. Dry run (small) | Operator + sample users | Execute one rehearsal flow: `admin login -> QR -> /u/scan -> /u/confirm -> /u/success` | Rehearsal completes without blocker |
| 5. Live pilot run | Operator + real users | Execute at least one real event using the same flow | Real event completes and ticket receipts are issued |
| 6. Evidence packaging | Project team | Publish redacted evidence set and verification instructions | Third party can reproduce checks from provided evidence |

## Minimum Evidence Set

- Runtime/readiness snapshots:
  - `/v1/school/pop-status`
  - `/v1/school/runtime-status`
  - `/v1/school/audit-status`
- Receipt verification proof:
  - one or more `confirmationCode` checks via `/api/audit/receipts/verify-code`
- User flow evidence:
  - success screen outputs (`confirmationCode`, `receipt_id`, `receipt_hash`)
- Optional on-chain evidence (if route used):
  - `txSignature`
  - `receiptPubkey`

## Redaction Policy (for anonymous pilot)

- Remove school/org names and personal identifiers.
- Keep technical evidence fields unchanged (hashes, signatures, pubkeys, timestamps).
- Publish only what is needed for independent verification.
