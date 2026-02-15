# 静的検証レポート（設計・統合チェック）

実施日: 2026-02-01  
目的: 実行環境に依存しない型・ビルド・ロジック・ルーティングの整合性確認

---

## 1) 型・ビルド検証

### 結果: ✅ 問題なし

- **TypeScript**: `npx tsc --noEmit` 成功（exit 0）
- **SchoolClaimResult（discriminated union）**:
  - `SchoolClaimResultSuccess` / `SchoolClaimResultFailure` が正しく定義
  - `useSchoolClaim` で `result.success` による絞り込みが正しく行われる
  - 失敗時は `result.error`（`SchoolClaimErrorInfo`）を参照
- **SchoolClaimErrorCode / SchoolClaimErrorInfo**:
  - `schoolClaim.ts` / `schoolClaimClient.mock.ts` で一貫して使用
  - 型の循環・未解決はなし
- **parseEventId / useEventIdFromParams**:
  - `EventIdParse` 型が正しく定義
  - `raw: string | string[] | undefined` を扱い、`Array.isArray` で配列対応
- **import の循環**: なし（types → api → hooks → screens の一方向）
- **未使用 export**: 特になし（`SchoolClaimResult` は re-export で利用）

---

## 2) ロジック整合性チェック（静的）

### 結果: ✅ 破綻なし

- **useSchoolClaim の state 遷移**:
  - `idle` → `handleClaim` → `loading`
  - `loading` → `result` に応じて:
    - `success`（通常）/ `already`（alreadyJoined）/ `error`（失敗）
  - `reset()` で `idle` に戻せる
- **alreadyJoined 時の onSuccess**:
  - `if (result.success) { ... onSuccess?.(); }` の分岐内で、`alreadyJoined` でも `onSuccess` を呼ぶ（L59）
  - 遷移は success と同等に success(eventId) へ
- **isRetryable**:
  - `errorInfo?.code === 'retryable'` のみに依存（L75）

---

## 3) ルーティング・遷移の安全性

### 結果: ✅ 一致（軽微な改善余地あり）

- **schoolRoutes と Screen 利用の一致**:
  - `events` → UserEventsScreen
  - `scan` → UserScanScreen
  - `confirm(eventId)` → UserConfirmScreen
  - `success(eventId)` → UserSuccessScreen
  - `schoolClaim(eventId)` → SchoolClaimScreen（/r/school/[eventId]）
  - `home` → HomeScreen

- **useEventIdFromParams と redirect**:
  - UserConfirmScreen, UserSuccessScreen, SchoolClaimScreen: `redirectOnInvalid: true`
  - eventId 無効時は `router.replace(schoolRoutes.events)` で /u へ遷移
  - `if (!isValid) return null` により、無効時は本体を描画しない

- **eventId 直接参照の残存**:
  - Admin 系（AdminPrintScreen, AdminEventDetailScreen）: `useLocalSearchParams` で eventId 取得 → **admin フローであり school フローと独立**
  - ReceiveScreen: campaignId, code を使用（Solana フロー）
  - **school フロー内では useEventIdFromParams に統一済み**

- **軽微な改善余地**:
  - `schoolRoutes.scan` は定数 `/u/scan` のみ。`?eventId=` 付与は UserScanScreen / UserSuccessScreen で手動連結
  - 一貫性のため `schoolRoutes.scanWithEventId(eventId)` のようなヘルパーを将来追加してもよい（必須ではない）

---

## 4) Mock データ整合性

### 結果: ✅ 矛盾なし

- **adminMock.ts**:
  - evt-001, evt-002 が `mockEvents` に定義
  - `schoolEvents.ts` の `schoolEventProvider.getAll()` / `getById()` 経由で一覧・詳細取得

- **schoolClaimClient.mock.ts と Result 型**:
  - evt-001: `{ success: true, eventName }`（Success）
  - evt-002: `{ success: true, eventName, alreadyJoined: true }`（Success）
  - not_found: `{ success: false, error: { code: 'not_found', message } }`（Failure）
  - その他既参加: `{ success: true, eventName, alreadyJoined: true }`（Success）

- **想定フローとの整合**:
  - 一覧 → 遷移 → claim が evt-001〜002 で一貫して動作する構造

---

## 5) 副作用・将来実装の地雷

### 潜在リスク（現状は動作、将来注意）

| 箇所 | リスク | 対策 |
|------|--------|------|
| **fetch 版への差し替え** | 実 API が 404/500 等を返した場合、`SchoolClaimResult` 形式にマッピングが必要 | 実装時に HTTP ステータス → `SchoolClaimErrorCode` のマッピングを明示的に書く（404→not_found, 5xx/network→retryable） |
| **submitSchoolClaim の catch** | 現状はすべて `retryable` に変換。将来、認証エラーなど「再試行不可」を区別したい場合に拡張が必要 | 必要になったら `error` の型やメッセージに応じて `code: 'unknown'` 等を返す分岐を追加 |
| **errorInfo.message の依存** | UI は `error`（= errorInfo?.message）を表示に使用。実 API の文言やロケールが変わるとそのまま表示される | 現状は想定内。多言語化時は message をキーにして翻訳する設計を検討 |
| **useEventIdFromParams の redirect** | `redirectOnInvalid` 時、useEffect が複数回走ると `router.replace` が複数回呼ばれる可能性 | 現状は実害なし。将来的に問題が出たら、`useRef` で初回のみ実行するようガードを追加 |
| **SchoolClaimScreen の `!eventId || !event`** | eventId は valid だが `getEventById` が null を返す場合（一覧から削除されたイベントなど） | 想定どおり「見つかりません」表示。実 API 差し替え後も `getById` が null を返すケースを考慮済み |

### 問題なし

- UI は `errorInfo.code` で分岐（`isRetryable`）し、表示は `error`（message）を使用。ロジックと表示の責務が分離されている
- `router.replace` の多重呼び出しは、同一先への replace のため実害は小さい

---

## 総括

| 項目 | 状態 |
|------|------|
| 型・ビルド | ✅ 問題なし |
| ロジック整合性 | ✅ 破綻なし |
| ルーティング・遷移 | ✅ 整合 |
| Mock データ | ✅ 矛盾なし |
| 将来実装の地雷 | ⚠️ 軽微な注意点あり（上記表参照） |

**結論**: 現状の設計・統合は問題なく、実行環境を用いた動作確認の準備が整っている。修正の必要はなく、上記の潜在リスクを把握したうえで fetch 版 API 差し替え時にマッピングを明示すればよい。
