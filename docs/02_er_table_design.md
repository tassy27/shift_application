# 2. ER図（要点）

## ER図（Mermaid）
```mermaid
erDiagram
    USERS ||--o{ SHIFT_SUBMISSIONS : creates
    EMPLOYEES ||--o{ SHIFT_SUBMISSIONS : has
    SHIFT_MONTHS ||--o{ SHIFT_SUBMISSIONS : targets
    SHIFT_SUBMISSIONS ||--o{ SHIFT_SUBMISSION_DETAILS : includes
    SYNC_JOBS ||--o{ SYNC_JOB_ITEMS : contains
    SHIFT_SUBMISSIONS ||--o{ SYNC_JOB_ITEMS : exported_by

    USERS {
      bigint id PK
      string google_sub UK
      string email UK
      string full_name
      string auth_provider
      string role
      bigint employee_id FK
      datetime last_login_at
    }

    EMPLOYEES {
      bigint id PK
      string employee_code UK
      string display_name
      string display_name_kana
      string email
      string department
      boolean is_active
    }

    SHIFT_SUBMISSIONS {
      bigint id PK
      bigint employee_id FK
      bigint shift_month_id FK
      bigint submitted_by_user_id FK
      datetime submitted_at
      string source
    }

    SHIFT_SUBMISSION_DETAILS {
      bigint id PK
      bigint shift_submission_id FK
      date target_date
      string availability
      string memo
    }

    SYNC_JOBS {
      bigint id PK
      bigint triggered_by_user_id FK
      string trigger_type
      string status
      string spreadsheet_id
      string sheet_name
      text error_message
      datetime created_at
    }

    SYNC_JOB_ITEMS {
      bigint id PK
      bigint sync_job_id FK
      bigint shift_submission_id FK
      string status
      text error_message
    }
```

## 現行設計ポイント
- `employees` はログイン画面のプルダウン元
- ログイン時入力メールは `employees.email` と `users.email` に反映
- 同期は外部サービス連携ではなく、DB内容のCSV出力ジョブとして管理
- 出力差分は `storage/csv/**/index.json` のハッシュ比較で判定
