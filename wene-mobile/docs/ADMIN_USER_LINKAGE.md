# 利用者側・管理者側の連携

利用者アプリと管理者アプリで同じデータを参照し、参加が管理者に反映される仕組みをまとめる。

## データの流れ

### 1. イベント一覧・イベントID（単一ソース）

| 役割 | 参照元 | 説明 |
|------|--------|------|
| 管理者 | `src/data/adminMock.ts` の `mockEvents` | イベント一覧・詳細・印刷で使用 |
| 利用者 | `src/api/schoolEvents.ts` → `mockEvents` を import | `getAllSchoolEvents()` / `getEventById()` で同じリストを参照 |

→ **同じ `mockEvents`（evt-001, evt-002, evt-003）を両方が参照している。**

- 管理者: `AdminEventsScreen`, `AdminEventDetailScreen`, `AdminPrintScreen`
- 利用者: `UserEventsScreen`, `UserConfirmScreen`, `UserScanScreen`（QRで eventId 指定）, `useSchoolClaim`（getEventById）

### 2. 参加申込（利用者 → 管理者への反映）

**参加が記録されるたびに必ず `addSharedParticipation()` を呼ぶこと。** 呼ばないと管理者のリアルタイム参加数・参加者一覧に反映されない。

| 利用者側の参加経路 | 呼び出し場所 | 備考 |
|-------------------|--------------|------|
| QR読み取り → 確認 → 参加する | `schoolClaimClient.mock` の `submit()` 成功時 | `addSharedParticipation({ eventId, eventName })` |
| リンク参加 `/u/join?eventId=...` | `JoinScreen` の参加記録成功後 | `addSharedParticipation({ eventId, eventName, participantId: session.studentId })` |
| 参加券一覧から「参加する」 | `UserEventsScreen` の `handleMockParticipate` 成功後 | `addSharedParticipation({ eventId, eventName, participantId: session.studentId })` |

| 管理者側の表示 | 参照元 | 内容 |
|----------------|--------|------|
| リアルタイム参加数 | `adminMock.getDisplayRtCount(eventId)` | モックの `rtCount` + **同一セッションの共有参加数**（上記3経路すべてを集計） |
| イベント詳細の参加者一覧 | `mockParticipants` + `getSharedParticipationsByEventId(eventId)` | 静的モック + 利用者参加分（内部IDに studentId を表示可能） |
| 参加者検索 | `mockParticipantLogs` + `getSharedParticipations()` | 静的モック + 利用者参加分 |

→ **上記3経路いずれで参加しても、管理者の「リアルタイム参加数」「参加者一覧」「参加者検索」に正確に反映される。**

### 3. 参加履歴（利用者端末内）

- `recipientTicketStore`: 利用者端末の AsyncStorage に保存。完了済みイベントの「参加券」表示に使用。
- `participationStore`: started/completed 状態を端末内に保存。利用者側の「未完了/完了済み」表示に使用。

## 連携の確認方法

1. **管理者でイベント一覧を開く** (`/admin`)  
   - evt-001, evt-002, evt-003 が表示され、リアルタイム参加数が表示される。
2. **利用者で同じイベントに参加する**  
   - `/` → 「参加を開始」→ イベント一覧 → 「参加する」→ QR/続行 → 確認 → 「参加する」  
   - evt-001 などで参加完了にする。
3. **管理者で再確認**  
   - `/admin` のイベント一覧で、該当イベントの参加数が +1 になっている。  
   - `/admin/events/evt-001` で参加者に「参加（デモ）」が追加されている。  
   - `/admin/participants` で「参加（デモ）」の行が追加されている。

## 本番想定

- イベント一覧・参加者・参加数は **サーバーAPI** に置き換える想定。
- `mockEvents` / `schoolEvents` を API に差し替え、`addSharedParticipation` の代わりに API で参加を送信し、管理者は API から参加者・参加数を取得する。

---

## 削除・戻してはいけない実装（安定性チェックリスト）

ビルド・インストール前に以下が壊れていないことを `npm run doctor:build` で確認すること。これらを削除したり実装前に戻すと管理者・利用者両方で不具合が出る。

| 区分 | 内容 |
|------|------|
| **ルート** | `app/_layout.tsx` の Stack に `name="u"` `name="register"` `name="admin"` があること（登録フロー・管理画面が開くため） |
| **利用者** | `schoolRoutes`、`useSchoolClaim`、`handleClaim`、`schoolRoutes.success`、確認/完了の「リダイレクト中…」、参加済み時の「完了画面へ」 |
| **利用者** | `UserScanScreen`: `CameraView`、`useCameraPermissions`、`Platform.OS`、`handleContinueWithoutScan`（Web フォールバック） |
| **管理者** | `roleLabel`・`eventStateLabel`（日本語）、AdminShell「管理画面」・「イベント」「参加者」「カテゴリ」「ログアウト」、StatusBadge は `eventStateLabel` 使用 |
| **連携** | `schoolEvents.ts`: `mockEvents`（adminMock）、`getEventById`、`getAllSchoolEvents` |
| **連携** | `adminMock`: `addSharedParticipation`、`getDisplayRtCount`、`getSharedParticipationsByEventId`、`getSharedParticipations` |
| **連携** | `schoolClaimClient.mock`: `addSharedParticipation` 呼び出し、`isJoined`、`alreadyJoined`（同一端末再ログインを通す） |
| **連携** | `JoinScreen`: 参加記録成功後に `addSharedParticipation` を呼ぶ（リンク参加を管理者に反映） |
| **連携** | `UserEventsScreen`: `handleMockParticipate` 成功後に `addSharedParticipation` を呼ぶ（一覧からの参加を管理者に反映） |
| **管理者画面** | AdminEventsScreen: `getDisplayRtCount`。AdminEventDetailScreen: `getDisplayRtCount`、`getSharedParticipationsByEventId`、参加者アカウント絞り込み。AdminParticipantsScreen: `getSharedParticipations`、アカウント情報で絞り込み |
| **管理者UI（文字色）** | 管理者は暗色背景のため、文字は白系にすること。EventRow: `tone="dark"` で白文字。Button: `tone="dark"` で白文字。AdminEventsScreen: イベント一覧の EventRow に `tone="dark"`、タイトルに `#ffffff`。doctor が必須パターンで保護。 |
