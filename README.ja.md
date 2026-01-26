# we-ne

> **日本の公的支援を変える、Solana上の即時・透明な給付配布システム**

[![CI](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English README](./README.md) | [アーキテクチャ](./docs/ARCHITECTURE.md) | [開発ガイド](./docs/DEVELOPMENT.md)

---

## 🎯 we-neとは？

we-neは、Solana上に構築された**非カストディアルな給付配布システム**です。支援金を即座に、透明性をもって届けます。

**一言で**: SPLトークンによる定期給付、二重受給防止、モバイルウォレット連携——すべてオンチェーンで検証可能

---

## 🚨 解決する課題

### 日本の公的支援の問題

- **遅い**: 申請から受給まで数週間〜数ヶ月
- **コスト高**: 少額給付ほど事務費が重い
- **不透明**: 資金が届いたか検証困難
- **柔軟性がない**: 緊急時に対応できない固定スケジュール

### グローバルな課題

- 届くのが遅すぎる災害支援
- 手数料負けする少額助成
- 説明責任を欠く援助プログラム

### we-neのソリューション

- ⚡ **即時配布**: 数秒で決済完了
- 💰 **低コスト**: 1トランザクション約0.1円
- 🔍 **完全な透明性**: すべての受給がオンチェーンで検証可能
- 📱 **モバイルファースト**: スマートフォンで受給

---

## 🏗️ 仕組み

```
┌─────────────────────────────────────────────────────────────┐
│                      ハイレベルフロー                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   給付者                  Solana                  受給者     │
│   ──────                 ──────                 ─────────   │
│                                                             │
│   1. Grant作成 ────────► Grant PDA                          │
│   2. 資金投入 ─────────► Token Vault                        │
│                                                             │
│                           ┌─────────┐                       │
│                           │ 期間    │◄──── 3. アプリ起動    │
│                           │ チェック │                       │
│                           └────┬────┘                       │
│                                │                            │
│                           ┌────▼────┐                       │
│                           │  受給   │◄──── 4. Phantom       │
│                           │ 記録    │      で署名           │
│                           └────┬────┘                       │
│                                │                            │
│                           ┌────▼────┐                       │
│   5. Explorerで確認 ◄─────┤ トークン├────► ウォレット       │
│                           │ 送金    │                       │
│                           └─────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**主要コンポーネント**:
1. **スマートコントラクト** (`grant_program/`): Grant、Claim、Receiptを管理するAnchorプログラム
2. **モバイルアプリ** (`wene-mobile/`): 受給者向けReact Nativeアプリ
3. **Phantom連携**: ディープリンクによる非カストディアル署名

→ 詳細: [アーキテクチャ](./docs/ARCHITECTURE.md)

---

## 📱 デモ

> 🎬 **デモ動画**: [準備中]

### スクリーンショット

| ホーム | 受給 | 完了 |
|------|------|------|
| ウォレット接続 | 給付内容確認 | トークン受け取り |

---

## 🚀 クイックスタート

### 前提条件
- Node.js v18以上
- スマートコントラクト: Rust, Solana CLI, Anchor
- モバイル: Android StudioまたはXcode

### モバイルアプリ起動（開発）

```bash
# クローンとインストール
git clone https://github.com/hk089660/-instant-grant-core.git
cd we-ne/wene-mobile
npm install

# Expo起動
npm start

# Expo GoアプリでQRスキャン
```

### スマートコントラクトビルド

```bash
cd grant_program
anchor build
anchor test
```

→ 詳細: [開発ガイド](./docs/DEVELOPMENT.md)

---

## 📁 リポジトリ構成

```
we-ne/
├── grant_program/           # Solanaスマートコントラクト（Anchor）
│   ├── programs/grant_program/src/lib.rs   # コアロジック
│   └── tests/               # 統合テスト
│
├── wene-mobile/             # モバイルアプリ（React Native + Expo）
│   ├── app/                 # 画面（Expo Router）
│   ├── src/solana/          # ブロックチェーンクライアント
│   ├── src/wallet/          # Phantomアダプター
│   └── src/utils/phantom.ts # ディープリンク暗号化
│
├── docs/                    # ドキュメント
│   ├── ARCHITECTURE.md      # システム設計
│   ├── SECURITY.md          # 脅威モデル
│   ├── PHANTOM_FLOW.md      # ウォレット連携
│   ├── DEVELOPMENT.md       # 開発セットアップ
│   └── ROADMAP.md           # 将来計画
│
├── .github/workflows/       # CI/CD
├── LICENSE                  # MIT
├── CONTRIBUTING.md          # 貢献ガイド
└── SECURITY.md              # 脆弱性報告
```

---

## 🔐 セキュリティモデル

| 観点 | 実装 |
|------|------|
| **鍵の管理** | 非カストディアル——秘密鍵はPhantomウォレット内のみ |
| **セッショントークン** | NaCl boxで暗号化、アプリサンドボックス内に保存 |
| **二重受給防止** | オンチェーンClaimReceipt PDAで防止 |
| **ディープリンク** | 暗号化ペイロード、厳格なURL検証 |

⚠️ **監査状況**: 未監査——テスト目的でのみ使用してください

→ 詳細: [セキュリティ](./docs/SECURITY.md)

---

## 🗺️ ロードマップ

| フェーズ | 期間 | 成果物 |
|---------|------|--------|
| **MVP** | ✅ 完了 | 基本的な受給フロー、Phantom連携 |
| **Allowlist** | +2週間 | Merkleベースの受給資格 |
| **管理ダッシュボード** | +1ヶ月 | 給付者向けWeb UI |
| **メインネットβ** | +3ヶ月 | 監査、パートナー、本番デプロイ |

→ 詳細: [ロードマップ](./docs/ROADMAP.md)

---

## 💡 なぜSolana？なぜ今？なぜFoundation Grant？

### なぜSolana？

- **速度**: 1秒以下のファイナリティでリアルタイム支援
- **コスト**: 1トランザクション約0.1円で少額給付も可能
- **エコシステム**: Phantom、SPLトークン、開発ツール
- **日本でのプレゼンス**: 成長するSolanaコミュニティ

### なぜ今？

- 日本でデジタル給付配布の検討が進行中
- コロナ後、効率的な支援配布への関心増
- モバイルウォレット普及が加速

### なぜFoundation Grant？

- **新しいユースケース**: 公的支援インフラ（DeFi/NFTではない）
- **実社会へのインパクト**: 実際の支援プログラム向け設計
- **オープンソース**: MITライセンス、再利用可能なコンポーネント
- **日本市場**: ローカルチーム、ローカルパートナーシップ

---

## 🤝 コントリビュート

貢献を歓迎します！[CONTRIBUTING.md](./CONTRIBUTING.md)をご覧ください。

優先領域:
- テストカバレッジ
- ドキュメント翻訳
- セキュリティレビュー
- UI/UXフィードバック

---

## 📜 ライセンス

[MITライセンス](./LICENSE) — 自由に使用、改変、配布可能

---

## 📞 連絡先

- **Issues**: [GitHub Issues](https://github.com/hk089660/-instant-grant-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hk089660/-instant-grant-core/discussions)
- **セキュリティ**: 脆弱性報告は[SECURITY.md](./SECURITY.md)参照

---

<p align="center">
  <i>Solana上で公共のために構築 ❤️</i>
</p>
