# Shift Aggregation

シフト申請を集約する Web アプリケーションです。  
フロントは `public/` 配下の静的ページ、バックエンドは Node.js + Express + PostgreSQL で動作します。

## 1. 前提条件

- Node.js 22 以上
- npm 11 以上
- Docker Desktop（Docker 起動方式を使う場合）

## 2. クイックスタート（推奨: Docker）

1. リポジトリ直下で `.env` を作成

```powershell
Copy-Item .env.example .env
```

2. コンテナ起動

```powershell
npm run docker:local:up
```

3. 起動確認

- アプリ: `http://localhost:3001`
- ヘルスチェック: `http://localhost:3001/api/v1/health`

4. 停止

```powershell
npm run docker:local:down
```

## 3. ローカル実行（Node + ローカル PostgreSQL）

1. 依存インストール

```powershell
npm install
```

2. `.env` 作成

```powershell
Copy-Item .env.example .env
```

3. `.env` の `DATABASE_URL` を設定（例）

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/shift_aggregation
```

4. 起動

```powershell
npm run local:up
```

## 4. 主要コマンド

- `npm run docker:local:up` : Docker で起動（DB + migrate + app）
- `npm run docker:local:down` : Docker 停止
- `npm run docker:local:ps` : コンテナ状態確認
- `npm run docker:local:logs` : アプリログ確認
- `npm run api:build` : TypeScript ビルド
- `npm run db:migrate` : マイグレーション実行
- `npm run local:up` : ローカル DB 前提で起動

## 5. 環境変数

主に使う値:

- `DATABASE_URL` : PostgreSQL 接続文字列
- `PORT` : API ポート（既定 `3001`）
- `APP_BASE_URL` : アプリのベース URL
- `USE_AUTH` : `true` で認証有効、`false` でローカルデモモード
- `STRICT_CONFIG` : `true` で必須設定不足時に起動エラー
- `SESSION_SECRET` : セッション用シークレット
- `PRESIDENT_EMAIL` : 管理者判定に使うメールアドレス

補足:

- 現在の実装は `.env` を直接読み込みます（CSV 同期は不要）。
- `scripts/sync-csv-to-env.js` / `npm run env:sync` は旧CSV設定から `.env` へ移行するための互換用ユーティリティです（通常運用では不要）。

## 6. 画面と動作確認

主な画面:

- タイトル画面: `http://localhost:3001/`
- sign in 画面: `http://localhost:3001/sign-in.html`
- login 画面: `http://localhost:3001/login.html`
- 申請画面: `http://localhost:3001/employee.html`
- 確認画面: `http://localhost:3001/employee-confirm.html`
- 管理者画面: `http://localhost:3001/admin.html`

ログイン導線（現行）:

1. `sign-in.html` で `メールアドレス / 氏名（漢字） / 氏名（カナ）` を登録
2. `login.html` で同じ 3 項目を入力してログイン
3. 社員は `employee.html`、管理者は `admin.html` へ遷移

## 7. よくあるエラー

- `DATABASE_URL is not configured`
: `.env` の `DATABASE_URL` が未設定です。設定後に再起動してください。

- Docker 起動時に `.env` が見つからない
: リポジトリ直下に `.env` を作成してください。

- `http://localhost:3001/api/v1/health` が応答しない
: `npm run docker:local:ps` で `app` が `healthy` か確認し、必要に応じて `npm run docker:local:logs` を確認してください。


## 8. 認証運用ルール

- 現行の認証仕様（名前ベース login / admin 判定 / 運用ルール）は `docs/10_auth_spec.md` を参照してください。
- Google OAuth は現行UI導線では使用していません（関連ルートは削除済み）。
