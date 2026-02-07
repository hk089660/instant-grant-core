# Update Summary (Stage 2–9)

## What changed (high level)
- School MVP (Admin Web + Student App) flow improvements:
  - Admin auth (8-digit passcode, cookie session)
  - Student join/claim API with idempotency
  - Join token mint + verification (HMAC, TTL)
  - Admin print QR uses server-minted token when API enabled
  - Participations API for admin list / event detail + CSV
  - Server persistence (Stage 9): events/participations survive restart (JSON storage)

## Key directories touched
- wene-mobile/: Admin UI, QR scan/join flow, API client integration
- wene-mobile/server/: School API (auth/events/participations/claim/join-token) + persistence
- docs/: LAN setup, role/state docs, school PoC docs, ops notes

## How to test (Web admin)
1) Server:
   - SCHOOL_ADMIN_PASSCODE=12345678
   - SCHOOL_ADMIN_WEB_ORIGIN="http://localhost:8081,http://<LAN-IP>:8081"
   - SCHOOL_JOIN_TOKEN_SECRET="<set>"
   - SCHOOL_REQUIRE_JOIN_TOKEN=1 (prod-like) / 0 (dev)
   - npm start (from wene-mobile/server)
2) Client:
   - EXPO_PUBLIC_SCHOOL_API_URL=http://localhost:3000/school
   - npx expo start --web -c
3) Open /admin -> login -> create event -> print QR
4) Student scan -> /u/join -> claim ok
5) Admin /admin/participants and /admin/events/:id show logs; CSV download works (Web only)

## Notes
- Secrets are server-only (NO EXPO_PUBLIC_*).
- /claim does not redirect to /admin/login on 401 (student UX).
