# 学校向け PoC: LAN での管理画面・QR 運用

同一ネットワーク内の PC から管理画面を開き、生徒向け QR を表示・印刷するための設定例です。

## 前提

- 管理画面（Admin）は Web で `http://<host>:8081/admin` にアクセス
- 学校 API は `http://<host>:3000/school` で起動
- Cookie 認証のため、CORS で **オリジンを許可リスト** に含める必要がある（`*` は不可）

## サーバー側（API）

複数オリジンをカンマ区切りで指定します。

```bash
# 例: localhost + PC の LAN IP
SCHOOL_ADMIN_PASSCODE=12345678 \
SCHOOL_ADMIN_WEB_ORIGIN="http://localhost:8081,http://192.168.0.10:8081" \
npm start
```

- **localhost**: 同じ PC のブラウザで `http://localhost:8081/admin` を開くとき
- **LAN IP**（例: 192.168.0.10）: 同じ PC を `http://192.168.0.10:8081/admin` で開く、または別端末からその PC の 8081 にアクセスするとき

PC の LAN IP の調べ方（例）:
- macOS: `ifconfig | grep "inet "`
- Windows: `ipconfig`

## クライアント側（Expo Web）

- `.env` の `EXPO_PUBLIC_SCHOOL_API_URL` は **API サーバーに届く URL** にします。
- 同じ PC で API も Web も動かす場合: `http://localhost:3000/school` のままでよい。
- 別 PC から「この PC の 8081」で管理画面を開く場合、API は「その PC の 3000」に届く必要があるので、`EXPO_PUBLIC_SCHOOL_API_URL=http://192.168.0.10:3000/school` のように **その PC の IP** を指定します。

## 参加用トークン（QR の安全ライン）

- サーバーは **参加用トークン**（署名＋有効期限）を発行できます。管理画面の「印刷用QR」で API 有効時はこのトークン付きの参加 URL が QR に含まれます。
- **SCHOOL_JOIN_TOKEN_SECRET**: トークン署名用の秘密鍵。**サーバー環境変数のみ**で設定し、クライアントの `EXPO_PUBLIC_*` には入れません。
- **SCHOOL_REQUIRE_JOIN_TOKEN**:  
  - `0`（デフォルト）: トークンなしでも参加可能（開発・PoC 向け）  
  - `1`: トークン必須。不正URL・期限切れは 401 で弾く（本番運用向け）
- **SCHOOL_JOIN_TOKEN_TTL_SECONDS**: トークン有効期限（秒）。デフォルト 28800（8時間＝授業1日想定）。

## 運用イメージ

1. 先生用 PC で API と Web を起動（例: 192.168.0.10）
2. ブラウザで `http://192.168.0.10:8081/admin` を開き、8桁パスコードでログイン
3. イベントの QR を表示・印刷し、生徒に配布（API 有効時はトークン付き URL）
4. 生徒はその QR を読み取り、参加申込

## DevTools での確認

- **Request Headers**: `Origin: http://192.168.0.10:8081` が付いていること
- **Response Headers**: `Access-Control-Allow-Origin: http://192.168.0.10:8081`（`*` ではないこと）、`Access-Control-Allow-Credentials: true`
- ログイン成功時: `Set-Cookie: school_admin_session=...` が返ること
