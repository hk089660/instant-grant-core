# Phantom Wallet Integration

This document describes how we-ne integrates with Phantom wallet for transaction signing.

## Overview

we-ne uses Phantom's [deep link protocol](https://docs.phantom.app/phantom-deeplinks/deeplinks-ios-and-android) for mobile wallet integration. This allows non-custodial signing without exposing private keys to the app.

## Connection Flow

```
┌─────────────┐                    ┌─────────────┐
│  we-ne App  │                    │   Phantom   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ 1. Generate X25519 keypair       │
       │    (dappPublicKey, dappSecretKey)│
       │                                  │
       │ 2. Open deep link ───────────────►
       │    phantom.app/ul/v1/connect     │
       │    ?dapp_encryption_public_key   │
       │    &redirect_link                │
       │    &cluster                      │
       │                                  │
       │                    3. User approves
       │                                  │
       │ ◄─────────────── 4. Redirect back│
       │    wene://phantom/connect        │
       │    ?data=<encrypted>             │
       │    &nonce=<nonce>                │
       │    &phantom_encryption_public_key│
       │                                  │
       │ 5. Decrypt response with         │
       │    dappSecretKey + phantomPubKey │
       │    → { publicKey, session }      │
       │                                  │
       │ 6. Store session for signing     │
       ▼                                  ▼
```

## Sign Transaction Flow

```
┌─────────────┐                    ┌─────────────┐
│  we-ne App  │                    │   Phantom   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ 1. Build unsigned transaction    │
       │                                  │
       │ 2. Encrypt payload with          │
       │    phantomEncryptionPublicKey    │
       │    { transaction, session }      │
       │                                  │
       │ 3. Open deep link ───────────────►
       │    phantom.app/ul/v1/signTransaction
       │    ?payload=<encrypted>          │
       │    &dapp_encryption_public_key   │
       │    &nonce                        │
       │                                  │
       │                    4. User reviews
       │                       and signs  │
       │                                  │
       │ ◄─────────────── 5. Redirect back│
       │    wene://phantom/signTransaction│
       │    ?data=<encrypted>             │
       │    &nonce                        │
       │                                  │
       │ 6. Decrypt → signed transaction  │
       │                                  │
       │ 7. Submit to Solana RPC          │
       ▼                                  ▼
```

## Deep Link Formats

### Connect Request
```
https://phantom.app/ul/v1/connect
  ?app_url=https://wene.app
  &dapp_encryption_public_key=<base64>
  &redirect_link=wene://phantom/connect
  &cluster=devnet
```

### Connect Response
```
wene://phantom/connect
  ?data=<base64_encrypted>
  &nonce=<base64>
  &phantom_encryption_public_key=<base64>
```

Decrypted payload:
```json
{
  "public_key": "ABC123...",
  "session": "xyz789..."
}
```

### Sign Transaction Request
```
https://phantom.app/ul/v1/signTransaction
  ?dapp_encryption_public_key=<base64>
  &nonce=<base58>
  &redirect_link=wene://phantom/signTransaction
  &payload=<base58_encrypted>
  &app_url=https://wene.app
  &cluster=devnet
```

### Sign Transaction Response
```
wene://phantom/signTransaction
  ?data=<base64_encrypted>
  &nonce=<base64>
  &phantom_encryption_public_key=<base64>
```

Decrypted payload:
```json
{
  "signed_transaction": "<base64_serialized_tx>"
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/utils/phantom.ts` | URL building, encryption/decryption |
| `src/store/phantomStore.ts` | Keypair storage, session state |
| `src/wallet/openPhantom.ts` | Deep link opening with fallbacks |
| `app/phantom/[action].tsx` | Redirect handler screen |

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Phantom public key not found" | Missing URL param | Check redirect URL format |
| "Failed to decrypt" | Wrong keypair | Ensure same keypair used |
| "Encryption key pair not found" | AsyncStorage cleared | Reconnect wallet |
| Timeout | User didn't return | Show retry button |

### Timeout Handling

```typescript
// app/phantom/[action].tsx
timeoutId = setTimeout(() => {
  setStatus('error');
  setErrorMessage('Phantomからのリダイレクトがタイムアウトしました');
}, 30000); // 30 second timeout for connect
```

## Security Considerations

1. **Keypair Storage**: `dappSecretKey` stored in AsyncStorage (app-sandboxed)
2. **Session Validity**: Sessions may expire; handle reconnection gracefully
3. **URL Validation**: Always validate URL parameters before processing
4. **Nonce Usage**: Each request uses fresh random nonce

## Testing

### Manual Testing
1. Install Phantom on test device
2. Run app in development mode
3. Tap "Connect Wallet" 
4. Approve in Phantom
5. Verify redirect and session storage

### Debug Logging
Debug logs are sent to localhost during development:
```typescript
fetch('http://127.0.0.1:7242/ingest/...', { ... })
```
These are no-ops in production.
