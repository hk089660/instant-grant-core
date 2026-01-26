# Architecture

This document describes the high-level architecture of we-ne.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         we-ne System                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Grantor    │     │  Recipient   │     │   Verifier   │    │
│  │  (Admin UI)  │     │ (Mobile App) │     │  (Explorer)  │    │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘    │
│         │                    │                    │             │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Solana Blockchain                     │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │              grant_program (Anchor)              │    │   │
│  │  │                                                  │    │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐    │    │   │
│  │  │  │  Grant  │  │  Claim  │  │ ClaimReceipt │    │    │   │
│  │  │  │   PDA   │  │  Logic  │  │     PDA      │    │    │   │
│  │  │  └─────────┘  └─────────┘  └──────────────┘    │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Smart Contract (`grant_program/`)

**Purpose**: On-chain logic for creating, funding, and claiming grants.

**Key Accounts (PDAs)**:
| Account | Seeds | Description |
|---------|-------|-------------|
| Grant | `["grant", authority, mint, nonce]` | Stores grant configuration |
| ClaimReceipt | `["receipt", grant, claimer, period_index]` | Prevents double-claims |
| Vault | `[grant_pubkey]` (Token Account) | Holds SPL tokens for distribution |

**Instructions**:
- `create_grant` - Initialize a new grant with period settings
- `fund_grant` - Deposit SPL tokens into vault
- `claim` - Recipient claims their periodic benefit
- `pause_grant` / `resume_grant` - Admin controls
- `close_grant` - Withdraw remaining funds and close

**Data Flow (Claim)**:
```
1. Recipient calls `claim` with grant PDA
2. Program calculates current period_index from timestamp
3. Program checks ClaimReceipt doesn't exist for (grant, claimer, period_index)
4. Program transfers tokens from Vault to Recipient
5. Program creates ClaimReceipt PDA
```

### 2. Mobile App (`wene-mobile/`)

**Purpose**: Recipient-facing UI for claiming benefits.

**Tech Stack**:
- React Native (Expo)
- TypeScript
- Expo Router (file-based routing)
- Zustand (state management)

**Key Modules**:
| Module | Path | Purpose |
|--------|------|---------|
| Screens | `app/` | Route definitions (Expo Router) |
| Solana Client | `src/solana/` | RPC calls, transaction building |
| Wallet Adapter | `src/wallet/` | Phantom integration |
| Phantom Utils | `src/utils/phantom.ts` | Deep link encryption/decryption |
| State | `src/store/` | Zustand stores for app state |

**Phantom Integration Flow**:
```
1. App generates ephemeral X25519 keypair (stored in AsyncStorage)
2. App opens Phantom via deep link with dapp_encryption_public_key
3. User approves in Phantom
4. Phantom redirects back with encrypted session
5. App decrypts with dapp_secret_key
6. Session used for subsequent signTransaction calls
```

### 3. Deep Link Routes

| Route | Purpose |
|-------|---------|
| `wene://r/<campaignId>` | Open claim screen for campaign |
| `wene://phantom/connect` | Handle Phantom connect callback |
| `wene://phantom/signTransaction` | Handle signed transaction callback |
| `https://wene.app/r/<campaignId>` | Universal Link (iOS/Android) |

## Data Models

### Grant (On-chain)
```rust
pub struct Grant {
    pub authority: Pubkey,      // Grant creator
    pub mint: Pubkey,           // SPL token mint
    pub amount_per_claim: u64,  // Tokens per claim
    pub period_seconds: i64,    // Claim interval
    pub start_time: i64,        // When claims can begin
    pub end_time: Option<i64>,  // Optional expiry
    pub paused: bool,           // Admin pause flag
    pub total_claimed: u64,     // Tracking
    pub nonce: u8,              // PDA bump
}
```

### Recipient State (Mobile, Zustand)
```typescript
interface RecipientStore {
  campaignId: string | null;
  walletPubkey: string | null;
  phantomSession: string | null;
  state: 'Idle' | 'Connecting' | 'Connected' | 'Claiming' | 'Claimed';
}
```

## Security Boundaries

See [SECURITY.md](./SECURITY.md) for detailed threat model.

```
┌─────────────────────────────────────────┐
│           Trust Boundary                │
│  ┌─────────────────────────────────┐   │
│  │     Phantom Wallet (Trusted)    │   │
│  │     - Holds private keys        │   │
│  │     - Signs transactions        │   │
│  └─────────────────────────────────┘   │
│                  │                      │
│                  │ Encrypted session    │
│                  ▼                      │
│  ┌─────────────────────────────────┐   │
│  │     we-ne Mobile (Untrusted)    │   │
│  │     - Never sees private keys   │   │
│  │     - Builds unsigned txs       │   │
│  └─────────────────────────────────┘   │
│                  │                      │
│                  │ Signed tx           │
│                  ▼                      │
│  ┌─────────────────────────────────┐   │
│  │     Solana (Trustless)          │   │
│  │     - Verifies signatures       │   │
│  │     - Executes program          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```
