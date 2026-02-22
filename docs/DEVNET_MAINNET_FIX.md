# Devnet 完全固定・mainnet 混入防止

## 1) mainnet 痕跡一覧（修正済み方針）

コード内の mainnet 関連は以下のみ。**DEV 時は cluster を常に devnet に固定**しているため、実行時には mainnet は使われない。

| ファイル | 内容 | 役割 |
|----------|------|------|
| `cluster.ts` | `SolanaCluster` 型に `'mainnet-beta'`、`RPC_ENDPOINTS['mainnet-beta']`、本番時の `_resolveCluster()` 戻り値 | 型定義と本番用フォールバック。**__DEV__ 時は `_resolveCluster()` が常に `'devnet'` を返す** |
| `config.ts` | `MAINNET_PROGRAM_ID`、`getGrantProgramId` の mainnet 分岐 | cluster が mainnet のとき用。DEV 時は DEFAULT_CLUSTER=devnet のため未使用 |
| `singleton.ts` | コメント「本番=mainnet-beta」 | 説明のみ |
| `phantom.ts` | 型 `cluster?: 'devnet' \| 'mainnet-beta'`、デフォルト `'devnet'` | 型とデフォルト。呼び出し元はすべて `cluster: 'devnet'` を明示 |
| `solana/index.ts` | コメント「mainnet 切り替え用」 | 説明のみ |

**結論**: 実行経路で mainnet の RPC / programId が使われる箇所はない。DEV 時は `cluster.ts` の `_resolveCluster()` が常に `'devnet'` を返す。

---

## 2) 実行時ログで「実際に使った RPC」を確認する

`__DEV__` 時に次のログが出力される。

| ポイント | ログ | ファイル |
|----------|------|----------|
| getConnection() 生成直後 | `[RPC] getConnection() rpcEndpoint= ... cluster= devnet` | `singleton.ts` |
| getProvider() 生成直後 | `[RPC] getProvider() connection.rpcEndpoint= ...` | `singleton.ts` |
| buildClaimTx() 開始時 | `[RPC] buildClaimTx() connection.rpcEndpoint= ...` | `txBuilders.ts` |
| sendSignedTx() 入口 | `[RPC] sendSignedTx() connection.rpcEndpoint= ...` | `sendTx.ts` |
| simulate 直前 | `[RPC] sendSignedTx() simulate 直前 rpcEndpoint= ...` | `sendTx.ts` |

**確認**: 上記の `rpcEndpoint` がすべて devnet の URL（例: `https://solana-devnet.api.onfinality.io/public`）であること。mainnet の URL（`https://api.mainnet-beta.solana.com`）が 1 件でも出たら、その Connection の生成元を特定する。

---

## 3) Connection の生成の単一化

- **唯一の生成箇所**: `singleton.ts` の `getConnection()` のみが `new Connection(...)` を行う。
- **URL の決定**: `getRpcUrl(DEFAULT_CLUSTER)` のみを使用。import 時に Connection は作らない（遅延初期化）。
- **DEFAULT_CLUSTER**: `cluster.ts` の `_resolveCluster()` が唯一のソース。**__DEV__ 時は常に `'devnet'`**。

---

## 4) Phantom deep link の cluster=devnet 確認

`__DEV__` 時に以下が 1 回ずつ出力される。

- Connect: `[PHANTOM] connect cluster=devnet 確認: OK`（または `NG`）と URL
- Sign: `[PHANTOM] sign cluster=devnet 確認: OK`（または `NG`）と URL

`NG` の場合は URL に `cluster=devnet` が含まれていない。呼び出し元はすべて `cluster: 'devnet'` を渡しているため、通常は `OK`。

---

## 5) devnetConfig と devnet_setup の一致確認

### programId

- **アプリ**: `wene-mobile/src/solana/config.ts` の `DEVNET_PROGRAM_ID` = `GZcUoGHk8SfAArTKicL1jiRHZEQa3EuzgYcC2u4yWfSR`
- **grant_program**: `grant_program/programs/grant_program/src/lib.rs` の `declare_id!("GZcUoGHk8SfAArTKicL1jiRHZEQa3EuzgYcC2u4yWfSR")`
- **devnet_setup**: Anchor の `program.programId`（デプロイ先 = 上記と一致している前提）

→ 同一であること。mainnet 用の `8SVRtAyWXcd47PKeeMSGpC1oQFNt2yM865M46QgjKUZ` が devnet 側に混ざっていないこと。

### devnetConfig.ts の _RAW

- **含めるもの**: `authority`, `mint`, `grantId`, `startTs`, `periodSeconds` のみ（devnet_setup の _RAW 貼り付け用ブロックと同じ）。
- **確認**: `npm run devnet:setup`（または `npx ts-node tests/devnet_setup.ts`）実行後、標準出力の「_RAW（wene-mobile/src/solana/devnetConfig.ts に貼り付け）」ブロックと、`wene-mobile/src/solana/devnetConfig.ts` の `_RAW` を比較し、**完全一致**させる。
- **vault**: devnetConfig には持たない。アプリ側で `getVaultPda(grantPda)` から計算。authority / mint / grantId / programId が一致していれば vault PDA も一致する。

mainnet 由来の ID を貼り込まないこと（devnet_setup は devnet RPC に対して実行した結果だけを貼る）。

---

## 完了条件のチェックリスト

- [ ] 実行ログで `[RPC] ... rpcEndpoint=` がすべて devnet の URL である
- [ ] `[PHANTOM] connect cluster=devnet 確認: OK` および `[PHANTOM] sign cluster=devnet 確認: OK` が出ている
- [ ] Phantom の「mainnet 侵害 / メインネットの可能性」系の警告が出ない
- [ ] devnetConfig の _RAW が devnet_setup の _RAW 出力と一致している
- [ ] config.ts の DEVNET_PROGRAM_ID が grant_program の declare_id と一致している
