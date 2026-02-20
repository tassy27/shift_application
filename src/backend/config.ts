import dotenv from "dotenv";

dotenv.config();

export type AppConfig = {
  databaseUrl: string;
  port: number;
  appBaseUrl: string;
  sessionSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  googleCallbackUrl: string;
  presidentEmail: string;
  useAuth: boolean;
  spreadsheetId: string;
  googleServiceAccountFile: string;
  googleServiceAccountJson: string;
  runtimeParamsCsvPath: string;
  strictConfig: boolean;
};

export type ConfigStatus = {
  hasDatabaseUrl: boolean;
  useAuth: boolean;
  hasGoogleOAuth: boolean;
  hasPresidentEmail: boolean;
  hasSpreadsheetId: boolean;
  hasServiceAccount: boolean;
  runtimeParamsCsvPath: string;
  missingForAuth: string[];
  missingForSheets: string[];
  missingForDatabase: string[];
};

function envString(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function envBool(key: string, fallback = false): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === "true";
}

export function loadAppConfig(): AppConfig {
  return {
    databaseUrl: envString("DATABASE_URL", ""),
    port: Number(envString("PORT", "3001")),
    appBaseUrl: envString("APP_BASE_URL", "http://localhost:3001"),
    sessionSecret: envString("SESSION_SECRET", "dev-session-secret"),
    googleClientId: envString("GOOGLE_CLIENT_ID", ""),
    googleClientSecret: envString("GOOGLE_CLIENT_SECRET", ""),
    googleCallbackUrl: envString("GOOGLE_CALLBACK_URL", "http://localhost:3001/api/v1/auth/google/callback"),
    presidentEmail: envString("PRESIDENT_EMAIL", ""),
    useAuth: envBool("USE_AUTH", false),
    spreadsheetId: envString("GOOGLE_SHEETS_SPREADSHEET_ID", "president-sheet"),
    googleServiceAccountFile: envString("GOOGLE_SERVICE_ACCOUNT_FILE", ""),
    googleServiceAccountJson: envString("GOOGLE_SERVICE_ACCOUNT_JSON", ""),
    runtimeParamsCsvPath: ".env",
    strictConfig: envBool("STRICT_CONFIG", false),
  };
}

export function getConfigStatus(cfg: AppConfig): ConfigStatus {
  const missingForAuth: string[] = [];
  if (!cfg.presidentEmail) missingForAuth.push("PRESIDENT_EMAIL");

  const missingForSheets: string[] = [];

  const missingForDatabase: string[] = [];
  if (!cfg.databaseUrl) missingForDatabase.push("DATABASE_URL");

  return {
    hasDatabaseUrl: !!cfg.databaseUrl,
    useAuth: cfg.useAuth,
    hasGoogleOAuth: !!cfg.googleClientId && !!cfg.googleClientSecret && !!cfg.googleCallbackUrl,
    hasPresidentEmail: !!cfg.presidentEmail,
    hasSpreadsheetId: !!cfg.spreadsheetId,
    hasServiceAccount: !!cfg.googleServiceAccountFile || !!cfg.googleServiceAccountJson,
    runtimeParamsCsvPath: cfg.runtimeParamsCsvPath,
    missingForAuth,
    missingForSheets,
    missingForDatabase,
  };
}
