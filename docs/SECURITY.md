# Security Model & Threat Analysis

## Overview

we-ne is designed with a **non-custodial** security model. The mobile app never has access to user private keys.

## Threat Model

### 1. Deep Link Injection

**Threat**: Malicious app intercepts or crafts deep links to steal sessions.

**Mitigations**:
- All Phantom responses are encrypted with NaCl box
- Decryption requires `dappSecretKey` stored only in app's AsyncStorage
- URL parameters are strictly validated before processing
- Session tokens are bound to specific dapp encryption keypair

**Code Location**: `src/utils/phantom.ts` - `parsePhantomRedirect()`, `decryptPhantomResponse()`

### 2. Session Hijacking

**Threat**: Attacker steals Phantom session token to sign transactions.

**Mitigations**:
- Session is encrypted and stored in AsyncStorage (app-sandboxed)
- Session alone is insufficient - requires `phantomEncryptionPublicKey` for signing
- Each transaction requires user approval in Phantom app

**Residual Risk**: Root/jailbroken devices can access AsyncStorage

### 3. Replay Attacks

**Threat**: Attacker replays valid claim transaction to double-claim.

**Mitigations**:
- On-chain `ClaimReceipt` PDA prevents same-period claims
- PDA seeds include `period_index` - one receipt per period per user
- Solana's built-in replay protection via recent blockhash

**Code Location**: `grant_program/src/lib.rs` - `claim` instruction

### 4. Sybil Attacks

**Threat**: Attacker creates multiple wallets to claim multiple times.

**Mitigations**:
- **Current**: Allowlist-based eligibility (Merkle root)
- **Planned**: Cost of Forgery integration for Sybil resistance
- **Design Choice**: Not identity-based to preserve privacy

**Limitations**: Allowlist management is off-chain responsibility

### 5. Front-Running

**Threat**: MEV bots observe pending claims and front-run.

**Analysis**:
- Claims are user-specific (claimer pubkey in instruction)
- Front-running doesn't benefit attacker for standard claims
- Potential issue only if future features involve competitive claiming

**Status**: Low risk for current design

### 6. Man-in-the-Middle (MITM)

**Threat**: Attacker intercepts RPC calls or deep links.

**Mitigations**:
- RPC calls use HTTPS to trusted endpoints
- Deep link payloads are encrypted end-to-end
- Phantom's encryption prevents MITM on wallet communication

### 7. Phishing

**Threat**: Fake app or website tricks users into approving malicious transactions.

**Mitigations**:
- Transaction details shown in Phantom before signing
- Universal Links require domain verification (AASA/assetlinks.json)
- Users educated to verify transaction details

**User Responsibility**: Always review transaction in Phantom

## Sensitive Data Handling

### What we store (AsyncStorage)

| Data | Encrypted | Purpose |
|------|-----------|---------|
| `dappSecretKey` | No* | Decrypt Phantom responses |
| `phantomSession` | Yes (by Phantom) | Authenticate to Phantom |
| `walletPubkey` | No | Display connected wallet |

*Stored in app-sandboxed storage, not accessible to other apps on non-rooted devices.

### What we NEVER store

- Wallet private keys
- Seed phrases / mnemonics
- Plaintext session tokens from other apps

## Logging Policy

- **Production**: No sensitive data logged
- **Debug**: May log encrypted payloads (not keys)
- **Never logged**: Private keys, session tokens, decrypted payloads

**Code**: Debug logging uses `fetch()` to localhost only, disabled in production builds.

## Audit Status

| Component | Audited | Notes |
|-----------|---------|-------|
| grant_program | ❌ No | External audit kickoff target: 2026-04-01 |
| wene-mobile | ❌ No | Mobile app security review target: 2026-04-15 |
| Dependencies | Partial | Major deps are audited |

## External Assurance Plan (as of 2026-02-22)

1. 2026-03-15: Audit scope freeze for `grant_program` and API trust boundaries.
2. 2026-04-01: External smart contract audit kickoff.
3. 2026-04-30: Publish remediation status summary in repository docs.

## Recommendations for Production

1. **Smart Contract Audit**: Mandatory before mainnet
2. **Penetration Testing**: Mobile app security review
3. **Bug Bounty**: Establish responsible disclosure program
4. **Monitoring**: On-chain event monitoring for anomalies
5. **Rate Limiting**: RPC endpoint protection
