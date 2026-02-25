# 認証仕様（運用確定版）

最終更新: 2026-02-25

このドキュメントは、`USE_AUTH=true` を前提にした認証・認可の運用ルールを定義します。
現行実装は Google OAuth ではなく、メールアドレス + 氏名（漢字 / カナ）によるローカル登録・ログイン方式です。

## 1. 用語

- `employee` : 一般社員ロール
- `admin` : 管理者ロール
- `PRESIDENT_EMAIL` : 管理者判定に使う特別なメールアドレス（1件）

## 2. 現行の認証方式（実装ベース）

標準UIの認証導線は以下です。

1. sign in（登録）`POST /api/v1/auth/sign-in`
- `sign-in.html` から利用。
- `email` / `fullName` / `fullNameKana` を登録する。
- 登録のみで、セッションは発行しない。

2. name login（ログイン）`POST /api/v1/auth/name-login`
- `login.html` から利用。
- `email` / `fullName` / `fullNameKana` の完全一致でログイン。
- 成功時にセッションを発行。

3. 旧ローカルAPI（互換用）
- `POST /api/v1/auth/employee-login`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- API は残っているが、標準UI導線では使用しない。

補足:
- Google OAuth ルートは削除済み（現行導線では使用しません）。

## 3. 画面遷移（現行UI）

1. `index.html`（タイトル画面）
- `sign in` / `login` の入口のみ表示。

2. `sign-in.html`（登録画面）
- 登録成功後に完了表示。
- `login画面へ進む` からログインへ遷移。

3. `login.html`（ログイン画面）
- ログイン成功時の遷移:
  - `admin` -> `admin.html`
  - `employee` -> `employee.html`

4. `employee.html` -> `employee-confirm.html`
- 提出前はブラウザ `sessionStorage` に下書きを保持（キー: `shiftSubmissionDraft`）。
- `この内容で提出する` 実行後に DB へ保存。

## 4. USE_AUTH の動作ルール

### `USE_AUTH=false`（ローカルデモモード）
- 認証必須APIでもアクセスを通す（`requireAuth` がスキップされる）。
- `GET /api/v1/me` は未ログイン時でもダミーの `admin` を返す。
- 管理者APIは `x-role` ヘッダー（未指定時 `admin` 扱い）で通るため、開発確認向け。

### `USE_AUTH=true`（本番想定モード）
- セッション未ログインの場合、保護APIは `401` を返す。
- 管理者APIは `req.user.role === 'admin'` のときのみ許可。
- `GET /api/v1/me` は未ログイン時 `401`。

## 5. 管理者判定（`PRESIDENT_EMAIL`）

次のいずれかで `admin` になります。

1. ログイン時のメールアドレスが `PRESIDENT_EMAIL` と一致（大文字小文字は無視）
2. 既存ユーザーがすでに `admin` ロールで保存されている

補足:
- 起動時ブートストラップで `admin.demo@example.com` は `admin` に補正される。
- デモ管理者の氏名/カナも name-login で使えるように補完される。

## 6. `PRESIDENT_EMAIL` 運用ルール（確定）

### 基本方針
- `PRESIDENT_EMAIL` は「現行の管理責任者」1名を示すメールアドレスとして運用する。
- 値は `.env` で管理し、変更はデプロイ単位で実施する。

### 変更手順（管理者交代）
1. 新しい管理者メールを決定する。
2. `.env` の `PRESIDENT_EMAIL` を新しいメールへ更新する。
3. アプリを再起動する。
4. 新管理者がログインして `admin` 権限になることを確認する（`/api/v1/me` または管理者画面）。
5. 旧管理者を一般社員へ戻す必要がある場合は、DB上の `users.role` を運用手順に沿って更新する。

## 7. 推奨設定（本番/準本番）

```env
USE_AUTH=true
STRICT_CONFIG=true
PRESIDENT_EMAIL=admin@example.com
SESSION_SECRET=<十分に長いランダム文字列>
DATABASE_URL=postgres://...
```

## 8. 運用チェックリスト（認証まわり）

- `USE_AUTH=true`
- `STRICT_CONFIG=true`
- `PRESIDENT_EMAIL` が空でない
- `SESSION_SECRET` が初期値でない
- `GET /api/v1/me` 未ログイン時に `401` になる
- `sign-in -> login` の導線で社員ログインできる
- 管理者ログイン後に `/admin.html` へ遷移できる
- 一般社員ログインで管理者APIが `403` になる

## 9. 現時点の制約（今後改善候補）

- 氏名/カナの完全一致に依存するため、表記ゆれ対策（正規化ルール強化）が今後の改善候補
- 管理者の複数人運用は `PRESIDENT_EMAIL` 単体では表現しづらい（DBベース管理へ移行余地あり）
- 旧互換API（`/auth/login`, `/auth/register`, `/auth/employee-login`）の削除時期は未定
