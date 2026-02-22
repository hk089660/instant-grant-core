# Devnet セットアップ・検証手順

アプリで devnet 上の claim を成功させるための手順。

---

## 前提

- Grant Program は devnet に deploy 済み
- `~/.config/solana/id.json` に devnet 用キーペアがあり、SOL があること

---

## 実機検証手順（コピペ可能）

### a) Grant と Vault を作成・入金

```bash
cd grant_program && npm run devnet:setup
```

- 検証ログで `vault token balance (after fund_grant) > 0`、`authority SOL balance >= 0.01` を確認
- 出力された `_RAW` を `wene-mobile/src/solana/devnetConfig.ts` に貼り付け

### b) アプリをビルド・インストール

```bash
cd wene-mobile && npm run deploy:adb:clean
```

### c) Phantom を devnet に切り替え

Phantom アプリ → 設定 → 開発者設定 → ネットワーク → **Devnet**

### d) ログ取得を開始し、claim を実行

```bash
cd wene-mobile && ./scripts/capture-claim-flow.sh
```

表示されたらアプリで「受け取る」をタップ。

### e) ログ確認

```bash
grep -E 'DEV_ENV|DEV_GRANT|CLAIM|checkpoint|signature|simulate' /tmp/wene_claim_flow.log
```

---

## 成功判定

以下を満たす場合、**成功**とする:

| 条件 | 確認方法 |
|------|----------|
| cluster=devnet | `[DEV_ENV] cluster=devnet` |
| devnetConfig 使用 | `[DEV_ENV] source=devnetConfig` |
| vault に残高あり | `[DEV_GRANT] vaultBalance=` が 0 より大きい |
| simulate 通過 | ログに `simulate passed` または同等 |
| tx 送信完了 | ログに signature が出る |

---

## 失敗でも完成扱いの条件

以下を満たせば、**完成形として許容**する:

- クラッシュしない
- 再試行 UI へ戻る
- ログから原因を **1つ** に特定できる

### 原因分類（ログから判定）

| 分類 | ログの目安 | 対処 |
|------|------------|------|
| grant/vault 未存在 | `vaultBalance=UNKNOWN` | devnet_setup 再実行、devnetConfig の authority/mint/grantId 確認 |
| vault balance 0 | `vaultBalance=0` | fund_grant 再実行 |
| mint 不一致 | ATA / token account の mint エラー | devnetConfig の mint と create_grant の mint が同一か確認 |
| RPC/cluster 不一致 | cluster≠devnet や Phantom が mainnet | DEFAULT_CLUSTER、Phantom ネットワークを devnet に |

---

## セットアップ詳細（初回のみ）

### 1. Grant Program を devnet にデプロイ

```bash
cd grant_program
anchor build
anchor deploy --provider.cluster devnet
```

- `solana config set --url devnet`
- devnet SOL 取得: `solana airdrop 2`（レート制限時は [faucet.solana.com](https://faucet.solana.com) や [devnetfaucet.org](https://www.devnetfaucet.org) を利用）
- デプロイに約 2.4 SOL 必要

### 2. devnetConfig の更新

手順 a) の `_RAW` 出力を `wene-mobile/src/solana/devnetConfig.ts` に貼り付け。

### トラブルシューティング: DeclaredProgramIdMismatch

`devnet_setup` で `DeclaredProgramIdMismatch` が出る場合、プログラムを再デプロイ（upgrade）する:

```bash
cd grant_program && anchor deploy --provider.cluster devnet
```

残高が足りない場合は [faucet.solana.com](https://faucet.solana.com) で devnet SOL を取得してから実行する。
