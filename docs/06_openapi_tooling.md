# OpenAPI検証・モック・型生成

## 追加内容
- `package.json` に OpenAPI関連スクリプトを追加
- `spec/openapi.bundle.yaml` を自動生成
- `spec/generated/openapi-types.d.ts` を自動生成

## 実行コマンド
`shift-aggregation` ディレクトリで実行:

```bash
npm run openapi:lint
npm run openapi:bundle
npm run openapi:types
npm run openapi:all
```

## モックサーバー
起動:

```bash
npm run openapi:mock
```

- URL: `http://127.0.0.1:4010`
- 例:
  - `GET /shift-months/open`
  - `GET /admin/employees`（Authorizationヘッダー付き）

## 検証結果
- `redocly lint` は **エラー 0**（警告のみ）
- `openapi-typescript` による型生成成功
- `prism mock` 起動確認済み、`GET /shift-months/open` の 200 応答確認済み
