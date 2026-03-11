# Phantom Wallet 連携フロー

この文書では、we-ne が Phantom wallet とどのように連携して接続・署名を行うかを整理します。

デバッグ:

- `signTransaction` 後にアプリへ戻らない場合は [PHANTOM_DEBUG.md](./PHANTOM_DEBUG.md) を参照してください。

## 概要

we-ne は Phantom の [deep link protocol](https://docs.phantom.app/phantom-deeplinks/deeplinks-ios-and-android) を使って、モバイル端末上で non-custodial な署名フローを実現しています。アプリ本体は秘密鍵を保持せず、Phantom が署名だけを担当します。

## 接続フロー

```text
┌─────────────┐                    ┌─────────────┐
│  we-ne App  │                    │   Phantom   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ 1. X25519 鍵ペア生成             │
       │    (dappPublicKey, dappSecretKey)│
       │                                  │
       │ 2. connect deep link を開く ─────►
       │    phantom.app/ul/v1/connect     │
       │    ?dapp_encryption_public_key   │
       │    &redirect_link                │
       │    &cluster=devnet               │
       │                                  │
       │                    3. ユーザー承認
       │                                  │
       │ ◄─────────────── 4. redirect back│
       │    wene://phantom/connect        │
       │    ?data=<encrypted>             │
       │    &nonce=<nonce>                │
       │    &phantom_encryption_public_key│
       │                                  │
       │ 5. dappSecretKey + phantomPubKey │
       │    で復号                        │
       │    -> { publicKey, session }     │
       │                                  │
       │ 6. session を保持                │
       ▼                                  ▼
```

## 署名フロー

```text
┌─────────────┐                    ┌─────────────┐
│  we-ne App  │                    │   Phantom   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ 1. 未署名 transaction を構築     │
       │                                  │
       │ 2. payload を暗号化              │
       │    { transaction, session }      │
       │                                  │
       │ 3. signTransaction deep link ───►
       │    phantom.app/ul/v1/signTransaction
       │    ?payload=<encrypted>          │
       │    &dapp_encryption_public_key   │
       │    &nonce                        │
       │    &cluster=devnet               │
       │                                  │
       │                    4. ユーザー確認・署名
       │                                  │
       │ ◄─────────────── 5. redirect back│
       │    wene://phantom/signTransaction│
       │    ?data=<encrypted>             │
       │    &nonce                        │
       │                                  │
       │ 6. 復号 -> signed transaction    │
       │                                  │
       │ 7. Solana RPC へ送信             │
       ▼                                  ▼
```

## Deep Link フォーマット

### Connect Request

```text
https://phantom.app/ul/v1/connect
  ?app_url=https://wene.app
  &dapp_encryption_public_key=<base64>
  &redirect_link=wene://phantom/connect
  &cluster=devnet
```

### Connect Response

```text
wene://phantom/connect
  ?data=<base64_encrypted>
  &nonce=<base64>
  &phantom_encryption_public_key=<base64>
```

復号後の payload:

```json
{
  "public_key": "ABC123...",
  "session": "xyz789..."
}
```

### Sign Transaction Request

```text
https://phantom.app/ul/v1/signTransaction
  ?dapp_encryption_public_key=<base64>
  &nonce=<base58>
  &redirect_link=wene://phantom/signTransaction
  &payload=<base58_encrypted>
  &app_url=https://wene.app
  &cluster=devnet
```

### Sign Transaction Response

```text
wene://phantom/signTransaction
  ?data=<base64_encrypted>
  &nonce=<base64>
  &phantom_encryption_public_key=<base64>
```

復号後の payload:

```json
{
  "signed_transaction": "<base64_serialized_tx>"
}
```

## 主要ファイル

| ファイル | 役割 |
| --- | --- |
| `wene-mobile/src/utils/phantom.ts` | URL 構築、暗号化、復号 |
| `wene-mobile/src/store/phantomStore.ts` | 鍵ペア保持と session 状態 |
| `wene-mobile/src/wallet/openPhantom.ts` | Phantom 起動とフォールバック |
| `wene-mobile/app/phantom/[action].tsx` | redirect 受信ルート |
| `wene-mobile/src/wallet/PhantomWalletAdapter.ts` | wallet adapter 実装 |

## エラーハンドリング

### よくあるエラー

| エラー | 原因 | 対処 |
| --- | --- | --- |
| `Phantom public key not found` | URL パラメータ不足 | redirect URL 形式を確認 |
| `Failed to decrypt` | 鍵ペア不一致 | 同じ dapp 鍵ペアで connect / sign しているか確認 |
| `Encryption key pair not found` | AsyncStorage が消えている | 再接続する |
| Timeout | ユーザーが戻ってこない | 再試行ボタンを出す |

### Timeout 例

```typescript
timeoutId = setTimeout(() => {
  setStatus('error');
  setErrorMessage('Phantomからのリダイレクトがタイムアウトしました');
}, 30000);
```

## セキュリティ上の注意

1. `dappSecretKey` は app sandbox 内に保持する
2. session は期限切れを前提に再接続導線を持つ
3. URL パラメータは常に検証する
4. nonce は毎回新しく生成する

## テスト

### 手動確認

1. 検証端末に Phantom をインストールする
2. 開発モードでアプリを起動する
3. `Connect Wallet` を押す
4. Phantom で承認する
5. redirect と session 保持を確認する

### Debug Logging

開発時には localhost へ debug log を送る実装があります。

```typescript
fetch('http://127.0.0.1:7242/ingest/...', { ... })
```

本番ビルドでは no-op として扱います。
