# ローカルで本番相当の処理を再現する手順

目的: DB接続、マイグレーション、API、CSV差分出力をローカルで同等に動かす。

## パターンA: ローカルNode + ローカルDB
1. `config/runtime-params.local.csv` を調整
2. 必要なら `config/runtime-params.csv` に反映
3. `npm install`
4. `npm run db:migrate`
5. `npm run local:up`
6. `http://localhost:3001/api/v1/health` を確認

`local:up` 実行内容:
- `api:build`
- `env:sync`
- `db:migrate`
- `node dist/backend/server.js`

## パターンB: Docker
1. `config/runtime-params.docker.csv` を調整
2. `docker compose -f docker-compose.local.yml up -d --build`
3. `docker compose -f docker-compose.local.yml ps`
4. `http://localhost:3001/api/v1/health` を確認
5. 停止: `docker compose -f docker-compose.local.yml down`

## よくあるエラー
1. `DATABASE_URL is not set`
   - CSVの `DATABASE_URL` を設定して再起動
2. `employee context is missing`
   - ログイン画面で社員選択 + メール入力ログインを実施
3. CSVが更新されない
   - 差分がない場合は新規CSVを作成しない仕様
