# we-ne へのコントリビュート

コントリビュートに関心を持っていただきありがとうございます。ここでは、we-ne へ変更を加えるときの基本ルールをまとめています。

## 目次

- [はじめ方](#はじめ方)
- [開発フロー](#開発フロー)
- [ブランチ命名](#ブランチ命名)
- [コミット規約](#コミット規約)
- [Pull Request の進め方](#pull-request-の進め方)
- [コードスタイル](#コードスタイル)

## はじめ方

1. リポジトリを fork する
2. fork を clone する  
   `git clone https://github.com/<YOUR_USERNAME>/instant-grant-core.git`
3. upstream を追加する  
   `git remote add upstream https://github.com/hk089660/instant-grant-core.git`
4. 依存関係をインストールする  
   手順は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) を参照

## 開発フロー

1. `main` から新しいブランチを切る
2. 変更を加える
3. 必要に応じてテストを追加または更新する
4. ローカルで lint / test / typecheck を実行する
5. Conventional Commits に沿ってコミットする
6. 自分の fork に push する
7. Pull Request を作成する

## ブランチ命名

ブランチ名は、内容が分かるものを使ってください。

```text
feat/add-allowlist-merkle
fix/phantom-redirect-timeout
docs/update-security-model
chore/upgrade-dependencies
```

主な接頭辞:

- `feat/`: 新機能
- `fix/`: バグ修正
- `docs/`: ドキュメントのみ
- `chore/`: 保守作業、依存関係更新
- `refactor/`: リファクタリング
- `test/`: テスト追加・修正

## コミット規約

[Conventional Commits](https://www.conventionalcommits.org/) を採用しています。

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### type 一覧

- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: 形式調整のみ
- `refactor`: 構造改善
- `test`: テスト追加・変更
- `chore`: 保守作業

### 例

```text
feat(grant): add merkle-based allowlist verification
fix(mobile): handle Phantom redirect timeout
docs(readme): add quickstart section
chore(deps): upgrade @solana/web3.js to 1.98.x
```

## Pull Request の進め方

1. タイトルは conventional commit 形式に合わせる
2. 説明では `何を / なぜ / どう変えたか` を書く
3. 以下のチェックを埋める
   - [ ] ローカルでテストが通っている
   - [ ] lint / typecheck が通っている
   - [ ] 必要なドキュメント更新を含めた
   - [ ] 秘密情報をコミットしていない
4. メンテナーのレビューを待つ
5. 承認後に squash and merge する

### PR テンプレート例

```markdown
## Summary
変更の要約

## Changes
- 変更点 1
- 変更点 2

## Testing
確認方法

## Screenshots (if UI changes)
```

## コードスタイル

### TypeScript（主に `wene-mobile` / `api-worker`）

- TypeScript の strict mode を前提にする
- React では hooks ベースの関数コンポーネントを優先する
- named export を優先する
- 公開 API には必要に応じて JSDoc を付ける

### Rust（Anchor Program）

- Rust の標準的な規約に従う
- コミット前に `cargo fmt` を実行する
- 公開要素には必要に応じて doc comment を付ける

### 全般

- 関数は小さく、役割を明確に保つ
- 説明コメントより self-documenting code を優先する
- 複雑なロジックには簡潔なコメントを付ける
- 秘密情報や鍵をハードコードしない

## 質問

不明点があれば Issue または Discussion を作成してください。
