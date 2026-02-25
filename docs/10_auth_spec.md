# 認証仕様（運用確定版）

最終更新: 2026-02-25

このドキュメントは、`USE_AUTH=true` を前提にした認証・認可の運用ルールを定義します。

## 1. 用語

- `employee` : 一般社員ロール
- `admin` : 管理者ロール
- `PRESIDENT_EMAIL` : 管理者判定に使う特別なメールアドレス（1件）

## 2. 現行の認証方式（実装ベース）

本システムには以下のログイン経路があります。

1. 社員選択 + メール入力ログイン（`POST /api/v1/auth/employee-login`）
- `login.html` の標準UIで使用。
- 入力された `employeeId` と `email` を使ってユーザーを作成/更新し、セッションを発行。

2. ローカルID/PWログイン（`POST /api/v1/auth/login`）
- API は存在するが、標準UIには未接続（将来/運用用途）。

3. ローカル登録（`POST /api/v1/auth/register`）
- API は存在するが、標準UIには未接続（将来/運用用途）。

4. Google OAuth（`/api/v1/auth/google`）
- `USE_AUTH=true` かつ `GOOGLE_CLIENT_ID/SECRET` 設定時のみ有効。


## 2.1 本番運用方針（ローカルログイン廃止予定）

将来的なレンタルサーバー運用を見据え、**本番ではローカルログインを使用しない** 方針とする。

- 本番/準本番は `USE_AUTH=true` を前提とする
- 認証経路は Google OAuth を基本とする
- `POST /api/v1/auth/employee-login` / `POST /api/v1/auth/login` / `POST /api/v1/auth/register` は開発用途に限定する
- 段階的に、`USE_AUTH=true` 時はローカルログインAPIを無効化する実装へ移行する


## 3. USE_AUTH の動作ルール

### `USE_AUTH=false`（ローカルデモモード）
- 認証必須APIでもアクセスを通す（`requireAuth` がスキップされる）。
- `GET /api/v1/me` は未ログイン時でもダミーの `admin` を返す。
- 管理者APIは `x-role` ヘッダー（未指定時 `admin` 扱い）で通るため、開発確認向け。

### `USE_AUTH=true`（本番想定モード）
- セッション未ログインの場合、保護APIは `401` を返す。
- 管理者APIは `req.user.role === 'admin'` のときのみ許可。
- `GET /api/v1/me` は未ログイン時 `401`。

## 4. 管理者判定（`PRESIDENT_EMAIL`）

## 判定ルール

次のいずれかで `admin` になります。

1. ログイン時のメールアドレスが `PRESIDENT_EMAIL` と一致（大文字小文字は無視）
2. 既存ユーザーがすでに `admin` ロールで保存されている

補足:
- `employee-login` 再実行時に、既存 `admin` を `employee` に降格しないよう修正済み。
- ブートストラップ用の `admin.demo@example.com` は起動時に `admin` へ補正される。

## 5. `PRESIDENT_EMAIL` 運用ルール（確定）

### 基本方針
- `PRESIDENT_EMAIL` は「現行の管理責任者」1名を示すメールアドレスとして運用する。
- 値は `.env` で管理し、変更はデプロイ単位で実施する。

### 変更手順（管理者交代）
1. 新しい管理者メールを決定する。
2. `.env` の `PRESIDENT_EMAIL` を新しいメールへ更新する。
3. アプリを再起動する。
4. 新管理者がログインして `admin` 権限になることを確認する（`/api/v1/me` または管理者画面）。
5. 旧管理者を一般社員へ戻す必要がある場合は、DB上の `users.role` を運用手順に沿って更新する。

### 注意点
- `PRESIDENT_EMAIL` を空欄のまま `USE_AUTH=true` にすると、`STRICT_CONFIG=true` の場合は起動失敗となる。
- `STRICT_CONFIG=false` でも、管理者判定が不明確になるため本番運用では禁止。

## 6. 推奨設定（本番/準本番）

```env
USE_AUTH=true
STRICT_CONFIG=true
PRESIDENT_EMAIL=admin@example.com
SESSION_SECRET=<十分に長いランダム文字列>
DATABASE_URL=postgres://...
```

Google OAuth を使う場合は以下も設定:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://<your-domain>/api/v1/auth/google/callback
```

## 7. 運用チェックリスト（認証まわり）

- `USE_AUTH=true`
- `STRICT_CONFIG=true`
- `PRESIDENT_EMAIL` が空でない
- `SESSION_SECRET` が初期値でない
- `GET /api/v1/me` 未ログイン時に `401` になる
- 管理者ログイン後に `/admin.html` へ遷移できる
- 一般社員ログインで管理者APIが `403` になる

## 8. 現時点の制約（今後改善候補）

- 管理者の複数人運用は `PRESIDENT_EMAIL` 単体では表現しづらい（DBベース管理へ移行余地あり）
- 標準UIは現在 `employee-login` 中心で、`/auth/login` `/auth/register` の画面導線は未整備



