import { Pool, type PoolClient, type QueryResultRow } from "pg";
import crypto from "crypto";
import type { components } from "../../spec/generated/openapi-types";
import { loadAppConfig } from "./config";

let pool: Pool | null = null;
function getPool(): Pool {
  if (pool) return pool;
  const cfg = loadAppConfig();
  if (!cfg.databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  pool = new Pool({ connectionString: cfg.databaseUrl });
  return pool;
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await getPool().query<T>(sql, params);
  return res.rows;
}

type Employee = components["schemas"]["Employee"];
type ShiftMonth = components["schemas"]["ShiftMonth"];
type ShiftSubmission = components["schemas"]["ShiftSubmission"];

function seedPasswordHash(password: string): string {
  const salt = "seed-admin-salt-2026";
  const iter = 16384;
  const keyLen = 64;
  const digest = "sha512";
  const hash = crypto.pbkdf2Sync(password, salt, iter, keyLen, digest).toString("hex");
  return `pbkdf2$${digest}$${iter}$${salt}$${hash}`;
}

export async function listOpenShiftMonths(): Promise<ShiftMonth[]> {
  const rows = await query<{
    id: number;
    year_month: string;
    start_date: string;
    end_date: string;
    status: "open" | "closed";
  }>(
    `
      SELECT id, year_month, start_date::text, end_date::text, status
      FROM shift_months
      WHERE status='open'
      ORDER BY year_month ASC
    `
  );
  return rows.map((r) => ({
    id: r.id,
    yearMonth: r.year_month,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
  }));
}

export async function listActiveEmployees(): Promise<Employee[]> {
  const rows = await query<{
    id: number;
    employee_code: string;
    display_name: string;
    department: string | null;
    is_active: boolean;
  }>(
    `
      SELECT id, employee_code, display_name, department, is_active
      FROM employees
      WHERE is_active=true
      ORDER BY employee_code ASC
    `
  );
  return rows.map((r) => ({
    id: r.id,
    employeeCode: r.employee_code,
    displayName: r.display_name,
    department: r.department,
    isActive: r.is_active,
  }));
}

export async function listEmployees(): Promise<Employee[]> {
  const rows = await query<{
    id: number;
    employee_code: string;
    display_name: string;
    department: string | null;
    is_active: boolean;
  }>(
    `
      SELECT id, employee_code, display_name, department, is_active
      FROM employees
      ORDER BY employee_code ASC
    `
  );
  return rows.map((r) => ({
    id: r.id,
    employeeCode: r.employee_code,
    displayName: r.display_name,
    department: r.department,
    isActive: r.is_active,
  }));
}

export async function ensureShiftMonth(yearMonth: string): Promise<number> {
  const existed = await query<{ id: number }>(
    `SELECT id FROM shift_months WHERE year_month=$1`,
    [yearMonth]
  );
  if (existed[0]) return existed[0].id;

  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${yearMonth}-01`;
  const endDate = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${yearMonth}-${String(endDate).padStart(2, "0")}`;
  const inserted = await query<{ id: number }>(
    `
      INSERT INTO shift_months (year_month, start_date, end_date, status)
      VALUES ($1,$2,$3,'open')
      RETURNING id
    `,
    [yearMonth, start, end]
  );
  return inserted[0].id;
}

export async function findSubmissionByEmployeeAndMonth(
  employeeId: number,
  yearMonth: string
): Promise<ShiftSubmission | null> {
  const rows = await query<{
    id: number;
    employee_id: number;
    year_month: string;
    submitted_at: string;
    source: "employee" | "admin";
    note: string | null;
  }>(
    `
      SELECT s.id, s.employee_id, m.year_month, s.submitted_at::text, s.source, s.note
      FROM shift_submissions s
      JOIN shift_months m ON m.id=s.shift_month_id
      WHERE s.employee_id=$1 AND m.year_month=$2
      LIMIT 1
    `,
    [employeeId, yearMonth]
  );
  if (!rows[0]) return null;
  const [r] = rows;
  const details = await query<{
    target_date: string;
    availability: "available" | "unavailable" | "negotiable";
    memo: string | null;
  }>(
    `
      SELECT target_date::text, availability, memo
      FROM shift_submission_details
      WHERE shift_submission_id=$1
      ORDER BY target_date ASC
    `,
    [r.id]
  );
  return {
    id: r.id,
    employeeId: r.employee_id,
    yearMonth: r.year_month,
    submittedAt: r.submitted_at,
    source: r.source,
    note: r.note,
    details: details.map((d) => ({
      targetDate: d.target_date,
      availability: d.availability,
      memo: d.memo,
    })),
  };
}

export async function createSubmission(input: {
  employeeId: number;
  yearMonth: string;
  note?: string;
  source: "employee" | "admin";
  submittedByUserId: number;
  details: Array<{ targetDate: string; availability: "available" | "unavailable" | "negotiable"; memo?: string | null }>;
}): Promise<ShiftSubmission> {
  return withTx(async (client) => {
    const monthId = await ensureShiftMonth(input.yearMonth);
    const header = await client.query<{
      id: number;
      submitted_at: string;
    }>(
      `
        INSERT INTO shift_submissions
          (employee_id, shift_month_id, submitted_by_user_id, note, source)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id, submitted_at::text
      `,
      [input.employeeId, monthId, input.submittedByUserId, input.note ?? null, input.source]
    );
    const submissionId = header.rows[0].id;
    for (const d of input.details) {
      await client.query(
        `
          INSERT INTO shift_submission_details
            (shift_submission_id, target_date, availability, memo)
          VALUES ($1,$2,$3,$4)
        `,
        [submissionId, d.targetDate, d.availability, d.memo ?? null]
      );
    }
    return {
      id: submissionId,
      employeeId: input.employeeId,
      yearMonth: input.yearMonth,
      submittedAt: header.rows[0].submitted_at,
      source: input.source,
      note: input.note ?? null,
      details: input.details.map((d) => ({
        targetDate: d.targetDate,
        availability: d.availability,
        memo: d.memo ?? null,
      })),
    };
  });
}

export async function listSubmissionsByMonth(yearMonth: string): Promise<ShiftSubmission[]> {
  const headers = await query<{
    id: number;
    employee_id: number;
    year_month: string;
    submitted_at: string;
    source: "employee" | "admin";
    note: string | null;
  }>(
    `
      SELECT s.id, s.employee_id, m.year_month, s.submitted_at::text, s.source, s.note
      FROM shift_submissions s
      JOIN shift_months m ON m.id=s.shift_month_id
      WHERE m.year_month=$1
      ORDER BY s.id ASC
    `,
    [yearMonth]
  );
  const out: ShiftSubmission[] = [];
  for (const h of headers) {
    const details = await query<{
      target_date: string;
      availability: "available" | "unavailable" | "negotiable";
      memo: string | null;
    }>(
      `
        SELECT target_date::text, availability, memo
        FROM shift_submission_details
        WHERE shift_submission_id=$1
        ORDER BY target_date ASC
      `,
      [h.id]
    );
    out.push({
      id: h.id,
      employeeId: h.employee_id,
      yearMonth: h.year_month,
      submittedAt: h.submitted_at,
      source: h.source,
      note: h.note,
      details: details.map((d) => ({
        targetDate: d.target_date,
        availability: d.availability,
        memo: d.memo,
      })),
    });
  }
  return out;
}

export async function updateSubmissionById(
  id: number,
  patch: { note?: string; details?: Array<{ targetDate: string; availability: "available" | "unavailable" | "negotiable"; memo?: string | null }> }
): Promise<ShiftSubmission | null> {
  return withTx(async (client) => {
    const curRows = await client.query<{
      id: number;
      employee_id: number;
      year_month: string;
      submitted_at: string;
      source: "employee" | "admin";
      note: string | null;
    }>(
      `
        SELECT s.id, s.employee_id, m.year_month, s.submitted_at::text, s.source, s.note
        FROM shift_submissions s
        JOIN shift_months m ON m.id=s.shift_month_id
        WHERE s.id=$1
      `,
      [id]
    );
    if (!curRows.rows[0]) return null;
    const cur = curRows.rows[0];

    await client.query(
      `UPDATE shift_submissions SET note=COALESCE($2, note), source='admin' WHERE id=$1`,
      [id, patch.note ?? null]
    );
    if (patch.details) {
      await client.query(`DELETE FROM shift_submission_details WHERE shift_submission_id=$1`, [id]);
      for (const d of patch.details) {
        await client.query(
          `
            INSERT INTO shift_submission_details (shift_submission_id, target_date, availability, memo)
            VALUES ($1,$2,$3,$4)
          `,
          [id, d.targetDate, d.availability, d.memo ?? null]
        );
      }
    }

    const detailRows = await client.query<{
      target_date: string;
      availability: "available" | "unavailable" | "negotiable";
      memo: string | null;
    }>(
      `SELECT target_date::text, availability, memo FROM shift_submission_details WHERE shift_submission_id=$1 ORDER BY target_date ASC`,
      [id]
    );
    return {
      id: cur.id,
      employeeId: cur.employee_id,
      yearMonth: cur.year_month,
      submittedAt: cur.submitted_at,
      source: "admin",
      note: patch.note ?? cur.note,
      details: detailRows.rows.map((d) => ({
        targetDate: d.target_date,
        availability: d.availability,
        memo: d.memo,
      })),
    };
  });
}

async function resolveOrCreateEmployeeIdByName(
  client: PoolClient,
  input: { keySeed: string; fullName: string; fullNameKana?: string | null; email: string }
): Promise<number | null> {
  const normalizedName = input.fullName.trim();
  const normalizedKana = input.fullNameKana?.trim() || null;
  const matched = await client.query<{ id: number }>(
    `
      SELECT id
      FROM employees
      WHERE regexp_replace(display_name, '[\\s　]+', '', 'g') = regexp_replace($1, '[\\s　]+', '', 'g')
         OR (
           $2::text IS NOT NULL
           AND display_name_kana IS NOT NULL
           AND regexp_replace(display_name_kana, '[\\s　]+', '', 'g') = regexp_replace($2, '[\\s　]+', '', 'g')
         )
      ORDER BY is_active DESC, id ASC
      LIMIT 1
    `,
    [normalizedName, normalizedKana]
  );

  let employeeId = matched.rows[0]?.id ?? null;
  if (employeeId) return employeeId;

  const base = input.keySeed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-8) || "USER";
  for (let i = 0; i < 100 && !employeeId; i += 1) {
    const employeeCode = i === 0 ? `AUTO-${base}` : `AUTO-${base}-${i}`;
    const created = await client.query<{ id: number }>(
      `
        INSERT INTO employees (employee_code, display_name, display_name_kana, department, is_active)
        VALUES ($1,$2,$3,$4,true)
        ON CONFLICT (employee_code) DO NOTHING
        RETURNING id
      `,
      [employeeCode, normalizedName || input.email, normalizedKana, "未設定"]
    );
    employeeId = created.rows[0]?.id ?? null;
  }
  return employeeId;
}

export async function upsertUserByGoogle(input: {
  googleSub: string;
  email: string;
  role: "admin" | "employee";
  fullName: string;
  fullNameKana?: string | null;
}): Promise<{ id: number; email: string; role: "admin" | "employee"; employeeId: number | null }> {
  return withTx(async (client) => {
    const users = await client.query<{
      id: number;
      email: string;
      role: "admin" | "employee";
      employee_id: number | null;
    }>(
      `
        INSERT INTO users (google_sub, email, role, full_name, auth_provider, last_login_at)
        VALUES ($1,$2,$3,$4,'google',NOW())
        ON CONFLICT (google_sub)
        DO UPDATE SET email=EXCLUDED.email, role=EXCLUDED.role, full_name=EXCLUDED.full_name, auth_provider='google', last_login_at=NOW()
        RETURNING id, email, role, employee_id
      `,
      [input.googleSub, input.email, input.role, input.fullName]
    );
    const user = users.rows[0];
    if (user.employee_id) {
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employee_id,
      };
    }

    const employeeId = await resolveOrCreateEmployeeIdByName(client, {
      keySeed: input.googleSub,
      fullName: input.fullName,
      fullNameKana: input.fullNameKana,
      email: input.email,
    });

    if (employeeId) {
      await client.query(`UPDATE users SET employee_id=$2 WHERE id=$1`, [user.id, employeeId]);
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId,
    };
  });
}

export async function registerLocalUser(input: {
  email: string;
  role: "admin" | "employee";
  fullName: string;
  passwordHash: string;
}): Promise<{ id: number; email: string; role: "admin" | "employee"; employeeId: number | null; fullName: string }> {
  return withTx(async (client) => {
    const existing = await client.query<{ id: number }>(`SELECT id FROM users WHERE email=$1 LIMIT 1`, [
      input.email,
    ]);
    if (existing.rows[0]) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }

    const sub = `local:${input.email.toLowerCase()}`;
    const createdUser = await client.query<{
      id: number;
      email: string;
      role: "admin" | "employee";
      employee_id: number | null;
      full_name: string | null;
    }>(
      `
        INSERT INTO users (google_sub, email, role, full_name, password_hash, auth_provider, last_login_at)
        VALUES ($1,$2,$3,$4,$5,'local',NOW())
        RETURNING id, email, role, employee_id, full_name
      `,
      [sub, input.email, input.role, input.fullName, input.passwordHash]
    );
    const user = createdUser.rows[0];
    const employeeId = await resolveOrCreateEmployeeIdByName(client, {
      keySeed: sub,
      fullName: input.fullName,
      email: input.email,
    });
    if (employeeId) {
      await client.query(`UPDATE users SET employee_id=$2 WHERE id=$1`, [user.id, employeeId]);
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId,
      fullName: user.full_name ?? input.fullName,
    };
  });
}

export async function findLocalUserByEmail(input: { email: string }): Promise<{
  id: number;
  email: string;
  role: "admin" | "employee";
  employeeId: number | null;
  fullName: string;
  passwordHash: string | null;
} | null> {
  const rows = await query<{
    id: number;
    email: string;
    role: "admin" | "employee";
    employee_id: number | null;
    full_name: string | null;
    password_hash: string | null;
  }>(
    `
      SELECT id, email, role, employee_id, full_name, password_hash
      FROM users
      WHERE lower(email)=lower($1)
      LIMIT 1
    `,
    [input.email]
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    email: rows[0].email,
    role: rows[0].role,
    employeeId: rows[0].employee_id,
    fullName: rows[0].full_name ?? rows[0].email,
    passwordHash: rows[0].password_hash,
  };
}

export async function ensureEmployeeForUser(userId: number): Promise<number | null> {
  return withTx(async (client) => {
    const rows = await client.query<{
      id: number;
      email: string;
      google_sub: string;
      full_name: string | null;
      employee_id: number | null;
    }>(
      `
        SELECT id, email, google_sub, full_name, employee_id
        FROM users
        WHERE id=$1
        LIMIT 1
      `,
      [userId]
    );
    const user = rows.rows[0];
    if (!user) return null;
    if (user.employee_id) return user.employee_id;

    const employeeId = await resolveOrCreateEmployeeIdByName(client, {
      keySeed: user.google_sub || `user:${user.id}`,
      fullName: user.full_name ?? user.email,
      email: user.email,
    });
    if (employeeId) {
      await client.query(`UPDATE users SET employee_id=$2 WHERE id=$1`, [user.id, employeeId]);
    }
    return employeeId;
  });
}

export async function findUserIdByEmail(email: string): Promise<number | null> {
  const rows = await query<{ id: number }>(
    `
      SELECT id
      FROM users
      WHERE lower(email)=lower($1)
      LIMIT 1
    `,
    [email]
  );
  return rows[0]?.id ?? null;
}

export async function loginByEmployeeSelection(input: {
  employeeId: number;
  email: string;
  role: "admin" | "employee";
}): Promise<{ id: number; email: string; role: "admin" | "employee"; employeeId: number; name: string }> {
  return withTx(async (client) => {
    const empRows = await client.query<{
      id: number;
      display_name: string;
      is_active: boolean;
    }>(
      `
        SELECT id, display_name, is_active
        FROM employees
        WHERE id=$1
        LIMIT 1
      `,
      [input.employeeId]
    );
    const emp = empRows.rows[0];
    if (!emp || !emp.is_active) {
      throw new Error("EMPLOYEE_NOT_FOUND");
    }

    const emailTaken = await client.query<{ id: number }>(
      `
        SELECT id
        FROM users
        WHERE lower(email)=lower($1)
          AND (employee_id IS NULL OR employee_id <> $2)
        LIMIT 1
      `,
      [input.email, input.employeeId]
    );
    if (emailTaken.rows[0]) {
      throw new Error("EMAIL_ALREADY_IN_USE");
    }

    await client.query(`UPDATE employees SET email=$2 WHERE id=$1`, [input.employeeId, input.email]);

    const sub = `employee-login:${input.employeeId}`;
    const userRows = await client.query<{
      id: number;
      email: string;
      role: "admin" | "employee";
      employee_id: number;
      full_name: string | null;
    }>(
      `
        INSERT INTO users (google_sub, email, role, employee_id, full_name, auth_provider, last_login_at)
        VALUES ($1,$2,$3,$4,$5,'local',NOW())
        ON CONFLICT (employee_id)
        DO UPDATE SET
          google_sub=EXCLUDED.google_sub,
          email=EXCLUDED.email,
          role=EXCLUDED.role,
          full_name=EXCLUDED.full_name,
          auth_provider='local',
          last_login_at=NOW()
        RETURNING id, email, role, employee_id, full_name
      `,
      [sub, input.email, input.role, input.employeeId, emp.display_name]
    );
    const user = userRows.rows[0];
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id,
      name: user.full_name ?? emp.display_name,
    };
  });
}

export async function ensureBootstrapData(): Promise<void> {
  const employeeCount = await query<{ c: string }>(`SELECT COUNT(*)::text c FROM employees`);
  if (Number(employeeCount[0].c) === 0) {
    await query(
      `
        INSERT INTO employees (employee_code, display_name, department, is_active)
        VALUES
          ('E001','山田 太郎','営業',true),
          ('E002','佐藤 花子','管理',true),
          ('E003','田中 一郎','開発',true)
      `
    );
  }
  const localUser = await query<{ id: number }>(
    `SELECT id FROM users WHERE google_sub='local-dev-admin' LIMIT 1`
  );
  if (!localUser[0]) {
    await query(
      `
        INSERT INTO users (google_sub, email, role, last_login_at)
        VALUES ('local-dev-admin','admin@local','admin',NOW())
      `
    );
  }

  const seedEmployee = await query<{ id: number }>(
    `SELECT id FROM employees WHERE employee_code='ADM001' LIMIT 1`
  );
  const adminEmployeeId = seedEmployee[0]?.id
    ? seedEmployee[0].id
    : (
        await query<{ id: number }>(
          `
            INSERT INTO employees (employee_code, display_name, display_name_kana, department, is_active)
            VALUES ('ADM001','仮管理者','カリカンリシャ','管理',true)
            RETURNING id
          `
        )
      )[0].id;

  const seededAdmin = await query<{ id: number }>(
    `SELECT id FROM users WHERE lower(email)=lower('admin.demo@example.com') LIMIT 1`
  );
  if (!seededAdmin[0]) {
    await query(
      `
        INSERT INTO users
          (google_sub, email, role, employee_id, full_name, password_hash, auth_provider, last_login_at)
        VALUES
          ('local:admin.demo@example.com','admin.demo@example.com','admin',$1,'仮管理者',$2,'local',NOW())
      `,
      [adminEmployeeId, seedPasswordHash("Admin1234!")]
    );
  }
  await query(
    `
      UPDATE users
      SET role='admin', employee_id=$1, full_name=COALESCE(full_name, 'admin demo')
      WHERE lower(email)=lower('admin.demo@example.com')
    `,
    [adminEmployeeId]
  );
}

export async function getLocalActorUserId(): Promise<number> {
  const rows = await query<{ id: number }>(
    `SELECT id FROM users WHERE google_sub='local-dev-admin' LIMIT 1`
  );
  if (rows[0]) return rows[0].id;
  await ensureBootstrapData();
  const retried = await query<{ id: number }>(
    `SELECT id FROM users WHERE google_sub='local-dev-admin' LIMIT 1`
  );
  return retried[0].id;
}

export async function createEmployee(input: {
  employeeCode: string;
  displayName: string;
  department?: string;
  joinedOn?: string;
}): Promise<Employee> {
  const rows = await query<{
    id: number;
    employee_code: string;
    display_name: string;
    department: string | null;
    is_active: boolean;
  }>(
    `
      INSERT INTO employees (employee_code, display_name, department, joined_on, is_active)
      VALUES ($1,$2,$3,$4,true)
      RETURNING id, employee_code, display_name, department, is_active
    `,
    [input.employeeCode, input.displayName, input.department ?? null, input.joinedOn ?? null]
  );
  const r = rows[0];
  return {
    id: r.id,
    employeeCode: r.employee_code,
    displayName: r.display_name,
    department: r.department,
    isActive: r.is_active,
  };
}

export async function updateEmployee(id: number, patch: {
  displayName?: string;
  department?: string;
  isActive?: boolean;
  leftOn?: string;
}): Promise<Employee | null> {
  const rows = await query<{
    id: number;
    employee_code: string;
    display_name: string;
    department: string | null;
    is_active: boolean;
  }>(
    `
      UPDATE employees
      SET
        display_name = COALESCE($2, display_name),
        department = COALESCE($3, department),
        is_active = COALESCE($4, is_active),
        left_on = COALESCE($5, left_on)
      WHERE id=$1
      RETURNING id, employee_code, display_name, department, is_active
    `,
    [id, patch.displayName ?? null, patch.department ?? null, patch.isActive ?? null, patch.leftOn ?? null]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    employeeCode: r.employee_code,
    displayName: r.display_name,
    department: r.department,
    isActive: r.is_active,
  };
}

export async function listUnsubmittedEmployees(yearMonth: string): Promise<Employee[]> {
  const rows = await query<{
    id: number;
    employee_code: string;
    display_name: string;
    department: string | null;
    is_active: boolean;
  }>(
    `
      SELECT e.id, e.employee_code, e.display_name, e.department, e.is_active
      FROM employees e
      WHERE e.is_active=true
        AND NOT EXISTS (
          SELECT 1
          FROM shift_submissions s
          JOIN shift_months m ON m.id=s.shift_month_id
          WHERE s.employee_id=e.id AND m.year_month=$1
        )
      ORDER BY e.employee_code ASC
    `,
    [yearMonth]
  );
  return rows.map((r) => ({
    id: r.id,
    employeeCode: r.employee_code,
    displayName: r.display_name,
    department: r.department,
    isActive: r.is_active,
  }));
}

export async function createSyncJob(input: {
  triggeredByUserId: number;
  triggerType: "auto" | "manual" | "retry";
  spreadsheetId: string;
  sheetName: string;
  status?: "queued" | "running" | "success" | "failed";
}): Promise<components["schemas"]["SyncJob"]> {
  const rows = await query<{
    id: number;
    trigger_type: "auto" | "manual" | "retry";
    status: "queued" | "running" | "success" | "failed";
    spreadsheet_id: string;
    sheet_name: string;
    started_at: string | null;
    finished_at: string | null;
    error_message: string | null;
    created_at: string;
  }>(
    `
      INSERT INTO sync_jobs
        (triggered_by_user_id, trigger_type, status, spreadsheet_id, sheet_name, started_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      RETURNING id, trigger_type, status, spreadsheet_id, sheet_name, started_at::text, finished_at::text, error_message, created_at::text
    `,
    [input.triggeredByUserId, input.triggerType, input.status ?? "running", input.spreadsheetId, input.sheetName]
  );
  const r = rows[0];
  return {
    id: r.id,
    triggerType: r.trigger_type,
    status: r.status,
    spreadsheetId: r.spreadsheet_id,
    sheetName: r.sheet_name,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  };
}

export async function addSyncJobItem(input: {
  syncJobId: number;
  shiftSubmissionId: number;
  status: "success" | "failed";
  errorMessage?: string | null;
}): Promise<void> {
  await query(
    `
      INSERT INTO sync_job_items (sync_job_id, shift_submission_id, status, error_message)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (sync_job_id, shift_submission_id)
      DO UPDATE SET status=EXCLUDED.status, error_message=EXCLUDED.error_message
    `,
    [input.syncJobId, input.shiftSubmissionId, input.status, input.errorMessage ?? null]
  );
}

export async function finishSyncJob(input: {
  id: number;
  status: "success" | "failed";
  errorMessage?: string | null;
}): Promise<void> {
  await query(
    `
      UPDATE sync_jobs
      SET status=$2, error_message=$3, finished_at=NOW()
      WHERE id=$1
    `,
    [input.id, input.status, input.errorMessage ?? null]
  );
}

export async function listSyncJobs(): Promise<components["schemas"]["SyncJob"][]> {
  const rows = await query<{
    id: number;
    trigger_type: "auto" | "manual" | "retry";
    status: "queued" | "running" | "success" | "failed";
    spreadsheet_id: string;
    sheet_name: string;
    started_at: string | null;
    finished_at: string | null;
    error_message: string | null;
    created_at: string;
  }>(
    `
      SELECT id, trigger_type, status, spreadsheet_id, sheet_name, started_at::text, finished_at::text, error_message, created_at::text
      FROM sync_jobs
      ORDER BY id DESC
    `
  );
  return rows.map((r) => ({
    id: r.id,
    triggerType: r.trigger_type,
    status: r.status,
    spreadsheetId: r.spreadsheet_id,
    sheetName: r.sheet_name,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  }));
}

export async function getSyncJobById(id: number): Promise<components["schemas"]["SyncJob"] | null> {
  const rows = await query<{
    id: number;
    trigger_type: "auto" | "manual" | "retry";
    status: "queued" | "running" | "success" | "failed";
    spreadsheet_id: string;
    sheet_name: string;
    started_at: string | null;
    finished_at: string | null;
    error_message: string | null;
    created_at: string;
  }>(
    `
      SELECT id, trigger_type, status, spreadsheet_id, sheet_name, started_at::text, finished_at::text, error_message, created_at::text
      FROM sync_jobs
      WHERE id=$1
    `,
    [id]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    triggerType: r.trigger_type,
    status: r.status,
    spreadsheetId: r.spreadsheet_id,
    sheetName: r.sheet_name,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  };
}

export async function listSyncJobItems(id: number): Promise<components["schemas"]["SyncJobItem"][]> {
  const rows = await query<{
    shift_submission_id: number;
    status: "success" | "failed";
    error_message: string | null;
  }>(
    `
      SELECT shift_submission_id, status, error_message
      FROM sync_job_items
      WHERE sync_job_id=$1
      ORDER BY shift_submission_id ASC
    `,
    [id]
  );
  return rows.map((r) => ({
    shiftSubmissionId: r.shift_submission_id,
    status: r.status,
    errorMessage: r.error_message,
  }));
}

export async function getSubmissionById(id: number): Promise<ShiftSubmission | null> {
  const rows = await query<{
    id: number;
    employee_id: number;
    year_month: string;
    submitted_at: string;
    source: "employee" | "admin";
    note: string | null;
  }>(
    `
      SELECT s.id, s.employee_id, m.year_month, s.submitted_at::text, s.source, s.note
      FROM shift_submissions s
      JOIN shift_months m ON m.id=s.shift_month_id
      WHERE s.id=$1
    `,
    [id]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  const details = await query<{
    target_date: string;
    availability: "available" | "unavailable" | "negotiable";
    memo: string | null;
  }>(
    `SELECT target_date::text, availability, memo FROM shift_submission_details WHERE shift_submission_id=$1 ORDER BY target_date ASC`,
    [id]
  );
  return {
    id: r.id,
    employeeId: r.employee_id,
    yearMonth: r.year_month,
    submittedAt: r.submitted_at,
    source: r.source,
    note: r.note,
    details: details.map((d) => ({
      targetDate: d.target_date,
      availability: d.availability,
      memo: d.memo,
    })),
  };
}

