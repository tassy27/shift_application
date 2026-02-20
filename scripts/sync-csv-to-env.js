const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const csvPath =
  process.env.RUNTIME_PARAMS_CSV_PATH || path.resolve(ROOT, "config", "runtime-params.csv");
const envPath = path.resolve(ROOT, ".env");

const BEGIN = "# BEGIN AUTO_FROM_CSV";
const END = "# END AUTO_FROM_CSV";

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuote && next === '"') {
      cur += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (ch === "," && !inQuote) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function readCsvKeyValues(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.startsWith("#")) continue;
    const [key, value = ""] = parseCsvLine(line);
    if (!key) continue;
    rows.push([key, value]);
  }
  return rows;
}

function escapeEnvValue(value) {
  if (value === "") return "";
  const needQuote = /[\s#"'=]/.test(value);
  if (!needQuote) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildManagedBlock(rows) {
  const lines = [BEGIN];
  for (const [key, value] of rows) {
    lines.push(`${key}=${escapeEnvValue(value)}`);
  }
  lines.push(END);
  return lines.join("\n");
}

function upsertManagedBlock(existing, managedBlock) {
  if (!existing || existing.trim() === "") return `${managedBlock}\n`;

  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if (start >= 0 && end > start) {
    const before = existing.slice(0, start).trimEnd();
    const after = existing.slice(end + END.length).trimStart();
    const merged = [before, managedBlock, after].filter(Boolean).join("\n\n");
    return `${merged}\n`;
  }
  return `${existing.trimEnd()}\n\n${managedBlock}\n`;
}

function main() {
  const rows = readCsvKeyValues(csvPath);
  const managedBlock = buildManagedBlock(rows);
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
  const updated = upsertManagedBlock(existing, managedBlock);
  fs.writeFileSync(envPath, updated, "utf-8");
  console.log(`synced ${rows.length} keys from ${csvPath} -> ${envPath}`);
}

main();
