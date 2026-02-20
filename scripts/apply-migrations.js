const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config();

const root = process.cwd();
const migrationsDir = path.resolve(root, "db", "migrations");
const connectionString = process.env.DATABASE_URL;

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedSet(client) {
  const res = await client.query(`SELECT filename FROM schema_migrations`);
  return new Set(res.rows.map((r) => r.filename));
}

async function applyOne(client, filename, sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
      [filename]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

async function main() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. set it in config/runtime-params.csv and run env:sync");
  }
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`migrations dir not found: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await appliedSet(client);
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const full = path.join(migrationsDir, file);
      const sql = fs.readFileSync(full, "utf-8");
      await applyOne(client, file, sql);
      count += 1;
      // eslint-disable-next-line no-console
      console.log(`applied migration: ${file}`);
    }
    // eslint-disable-next-line no-console
    console.log(`migration done. applied=${count}, total=${files.length}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("migration failed:", e.message);
  process.exit(1);
});
