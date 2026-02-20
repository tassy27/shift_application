# 3. API一覧

## 前提
- ベースURL: `/api/v1`
- 認証: セッション
- 権限: `employee`, `admin`
- 形式: `application/json`

## 3.1 認証

| Method | Path | 権限 | 用途 |
|---|---|---|---|
| GET | `/public/employees/active` | public | ログイン前の社員プルダウン取得 |
| POST | `/auth/employee-login` | public | 社員選択 + メールでログイン（メールをDB保存） |
| POST | `/auth/logout` | login | ログアウト |
| GET | `/me` | login | 自分のセッション情報取得 |

### `POST /auth/employee-login` リクエスト例
```json
{
  "employeeId": 1,
  "email": "user@example.com"
}
```

## 3.2 社員向け（提出）

| Method | Path | 権限 | 用途 |
|---|---|---|---|
| GET | `/shift-months/open` | employee/admin | 提出可能な対象月一覧 |
| GET | `/employees/active` | employee/admin | 社員一覧 |
| GET | `/shift-submissions/my/:yearMonth` | employee/admin | 自分の提出状況取得 |
| POST | `/shift-submissions` | employee/admin | シフト希望提出（1社員1月1回） |

### `POST /shift-submissions` リクエスト例
```json
{
  "yearMonth": "2026-03",
  "note": "水曜は17時まで希望",
  "details": [
    { "targetDate": "2026-03-01", "availability": "available", "memo": "09:00-17:00" },
    { "targetDate": "2026-03-02", "availability": "unavailable", "memo": "" }
  ]
}
```

## 3.3 管理者向け

| Method | Path | 権限 | 用途 |
|---|---|---|---|
| GET | `/admin/shift-submissions/:yearMonth` | admin | 月次提出一覧取得 |
| GET | `/admin/unsubmitted/:yearMonth` | admin | 未提出者一覧取得 |
| PATCH | `/admin/shift-submissions/by-id/:id` | admin | 提出内容の管理者修正 |
| GET | `/admin/employees` | admin | 社員一覧取得 |
| POST | `/admin/employees` | admin | 社員新規登録 |
| PATCH | `/admin/employees/:id` | admin | 社員更新/無効化 |

## 3.4 CSV出力（差分反映）

| Method | Path | 権限 | 用途 |
|---|---|---|---|
| POST | `/admin/sync-jobs` | admin | 手動CSV出力実行（差分がある場合のみ新規ファイル作成） |
| GET | `/admin/sync-jobs` | admin | 出力ジョブ履歴取得 |
| GET | `/admin/sync-jobs/:id` | admin | ジョブ詳細・成果物参照 |

### `POST /admin/sync-jobs` リクエスト例
```json
{
  "yearMonth": "2026-03"
}
```

## 3.5 共通レスポンス
- 成功: `{ "data": ... }`
- 失敗: `{ "error": { "code": "...", "message": "..." } }`
