# セキュリティポリシー

## 脆弱性の報告

**セキュリティ脆弱性は、公開 GitHub Issue では報告しないでください。**

脆弱性を見つけた場合は、以下の手段で非公開に報告してください。

1. GitHub の [Private Security Advisory](https://github.com/hk089660/instant-grant-core/security/advisories/new) を作成する
2. 可能であれば以下を含める
   - 脆弱性の概要
   - 再現手順
   - 想定される影響
   - 修正案（あれば）

受領後 48 時間以内に初回応答し、7 日以内を目安に詳細な返信を行います。

## サポート対象バージョン

| バージョン | サポート |
| --- | --- |
| `main` | ✅ |
| `main` 以外の過去状態 | ❌ |

## セキュリティモデル

### Smart Contract（`grant_program`）

- 非保管型: ユーザーは自分のウォレットを保持する
- PDA ベース: 主要状態は Program Derived Address で管理する
- 特権の最小化: grant owner 以外の常設管理キーを持たない設計を基本とする
- 監査状況: **未監査**。本番利用前の外部監査が前提

### Mobile App（`wene-mobile`）

- 秘密鍵を保持しない: アプリはウォレット秘密鍵へアクセスしない
- Phantom 連携: 鍵は Phantom 側に留まる
- セッショントークン: NaCl box を用いた暗号化レスポンスとして扱う
- Deep link 検証: URL パラメータを厳格に検証する

## 既知の制約

1. Sybil resistance は現状 allowlist ベースであり、本人確認ベースではない
2. リプレイ攻撃は `period_index + ClaimReceipt PDA` で抑止している
3. Front-running は公開 mempool 上で理論上あり得るが、現行 claim モデルでは影響は限定的

## コントリビューター向けベストプラクティス

1. 秘密情報をコミットしない
   - `.env.example` をテンプレートとして使う
2. 入力を必ず検証する
   - 特に deep link と API 入力は厳格に扱う
3. 暗号処理では constant-time 比較を優先する
4. 依存関係の既知脆弱性を定期確認する
5. 空入力、壊れた入力、タイムアウトなどの edge case をテストする

## 公開方針

- responsible disclosure を採用する
- 修正がデプロイされた後に公開開示する
- 匿名希望がなければ報告者へクレジットを付与する
