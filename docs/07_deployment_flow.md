# デプロイまでの流れ

## 1. ローカル確認
1. `npm install`
2. `npm run db:migrate`
3. `npm run typecheck`
4. `npm run api:build`
5. `npm run local:server`
6. `http://localhost:3001/api/v1/health` を確認

## 2. 現行仕様の要点
1. ログインは「社員選択 + メール入力」方式
2. シフト提出は `POST /api/v1/shift-submissions`
3. 同期は DB から CSV への出力のみ
4. 差分がない場合は新規CSVを作成しない
5. 成果物は `storage/csv` にバージョン保存

## 3. 環境設定
- `DATABASE_URL`
- `PORT`
- `SESSION_SECRET`
- `PRESIDENT_EMAIL`
- `USE_AUTH`
- `STRICT_CONFIG`

補足:
- `config/runtime-params.csv` で設定管理
- `RUNTIME_PARAMS_CSV_PATH` で読み込みファイルを切り替え可能

## 4. Docker 本番手順
1. `docker compose -f docker-compose.prod.yml up -d --build`
2. `docker compose -f docker-compose.prod.yml ps`
3. `docker compose -f docker-compose.prod.yml logs -f app`
4. ヘルスチェック: `http://localhost:3001/api/v1/health`

## 5. リリース後チェック
1. ログイン画面で社員選択ログインできる
2. シフト提出でデータがDBへ保存される
3. `storage/csv/{yearMonth}` にCSVが出力される
4. 再実行時、差分なしならCSVバージョンが増えない
5. 管理者画面でジョブ履歴が確認できる
