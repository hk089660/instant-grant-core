# School Admin API (MVP)

管理者ログイン用セッション API（httpOnly cookie、8桁数字パスコード）。

**重要**: パスコードはサーバー環境変数のみ。クライアントの `EXPO_PUBLIC_*` には絶対に含めないこと。

## 起動

```bash
cd server
npm install
npm start
```

デフォルト: `http://localhost:3000/school`

## 環境変数（サーバーのみ）

| 変数 | 説明 | デフォルト |
|------|------|------------|
| PORT | ポート | 3000 |
| SCHOOL_ADMIN_PASSCODE | **8桁数字**のパスコード（例: `12345678`） | （未設定なら空・ログイン不可） |
| SCHOOL_ADMIN_WEB_ORIGIN | CORS 許可オリジン（カンマ区切り可。credentials のため `*` は不可） | http://localhost:8081 |
| SCHOOL_JOIN_TOKEN_SECRET | 参加用QRトークンの署名鍵（**サーバーのみ**。EXPO_PUBLIC_* に含めない） | （未設定時は join-token 無効） |
| SCHOOL_REQUIRE_JOIN_TOKEN | `1` で参加時にトークン必須、`0` で任意（開発用） | `0` |
| SCHOOL_JOIN_TOKEN_TTL_SECONDS | トークン有効期限（秒） | 28800（8時間） |
| SCHOOL_DATA_DIR | 永続化データのディレクトリ | ./data |
| SCHOOL_EVENTS_FILE | イベントJSONファイル（相対時は DATA_DIR 基準） | events.json |
| SCHOOL_PARTICIPATIONS_FILE | 参加記録JSONファイル（同上） | participations.json |

起動時に `SCHOOL_DATA_DIR` が存在しなければ作成する。イベント・参加記録は再起動後も保持される（JSON 永続化）。

## API 契約

- **POST /school/auth/login**  
  body: `{ "passcode": "12345678" }`（`/^\d{8}$/` のみ有効）  
  - 200: `{ "ok": true, "role": "admin", "expiresAt": "ISO" }` + Set-Cookie（HttpOnly, SameSite=Lax, Path=/school, Max-Age=28800）
  - 401: `{ "ok": false, "error": "invalid_passcode" }`
- **POST /school/auth/logout** — 200 `{ "ok": true }` + cookie 削除
- **GET /school/me** — 200 `{ "ok": true, "role": "admin", "expiresAt": "ISO" }` / 401 `{ "ok": false }`

セッション TTL: 8 時間。

### 参加用トークン（署名・有効期限）

- **POST /school/events/:id/join-token**（requireAdmin）  
  body: `{ "ttlSeconds": 28800 }`（任意）  
  - 200: `{ "ok": true, "token": "<payloadB64>.<sigB64>", "exp": unixSec }`  
  - トークンは HMAC-SHA256 署名。payload に `eventId`, `exp`, `nonce` を含む。  
- **POST /school/claim** で `body.token` を送ると、署名・eventId 一致・有効期限を検証。  
  - `SCHOOL_REQUIRE_JOIN_TOKEN=1` のときは token 必須。未設定・改ざん・期限切れは 401（invalid_token / expired_token）。  
- 本番運用では `SCHOOL_REQUIRE_JOIN_TOKEN=1` とし、開発時は `0` のまま token なしでも参加可能にできる。

## 複数オリジン（LAN 対応）

管理画面を **localhost** と **LAN IP** の両方から開く場合、カンマ区切りで指定します。

```bash
SCHOOL_ADMIN_PASSCODE=12345678 \
SCHOOL_ADMIN_WEB_ORIGIN="http://localhost:8081,http://192.168.0.10:8081" \
npm start
```

- 生徒向け QR を同じ PC の IP（例: 192.168.0.10）で配布する場合、管理画面も `http://192.168.0.10:8081/admin` で開けます。
- Cookie は `credentials: true` のため、許可リストに含まれるオリジンのみ。`*` は使用しません。

## Web クライアントとの連携

1. クライアント `.env` に **API の URL のみ** 設定: `EXPO_PUBLIC_SCHOOL_API_URL=http://localhost:3000/school`（パスコードは含めない）
2. `npx expo start --web -c` で http://localhost:8081 を起動
3. サーバーは `SCHOOL_ADMIN_WEB_ORIGIN` のいずれかのオリジンで CORS（`credentials: true`）を許可
