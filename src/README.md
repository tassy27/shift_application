# DTO/Client 雛形

`openapi-types.d.ts` を基準に、フロント/バック共通で型安全に扱うための雛形。

## 構成
- `src/shared/dto.ts`
  - OpenAPI `components.schemas` からDTO型を再エクスポート
- `src/shared/openapi-type-helpers.ts`
  - Path/Method 単位で Request/Response 型を引くユーティリティ
- `src/frontend/api/client.ts`
  - fetchベースの型付きAPIクライアント雛形
- `src/frontend/api/hooks.ts`
  - React Query 用 hooks 雛形
- `src/frontend/api/query-client.ts`
  - QueryClient 初期化
- `src/backend/dto/shift-submission-dto.ts`
  - リクエスト検証、DB row -> DTO 変換雛形
- `src/backend/server.ts`
  - Express API 雛形（`/api/v1`）
- `src/backend/routes/*.ts`
  - 社員向け/管理者向けルートの最小実装（モックDB）

## 運用手順
1. `npm run openapi:types` で `spec/generated/openapi-types.d.ts` を再生成
2. API変更に合わせて `src/shared/*` と `src/frontend/*` / `src/backend/*` を追従
3. バックエンドはDTO関数をController/UseCaseから利用
4. ローカルAPI起動は `npm run api:dev`
