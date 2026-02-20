import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { loadAppConfig, type AppConfig } from "./config";
import { upsertUserByGoogle } from "./db";

type SessionUser = {
  id: string;
  dbUserId: number;
  email: string;
  name: string;
  role: "admin" | "employee";
  employeeId: number | null;
};

declare global {
  namespace Express {
    interface User extends SessionUser {}
  }
}

export function configurePassport(appConfig: AppConfig) {
  if (appConfig.googleClientId && appConfig.googleClientSecret) {
    passport.use(
    new GoogleStrategy(
      {
        clientID: appConfig.googleClientId,
        clientSecret: appConfig.googleClientSecret,
        callbackURL: appConfig.googleCallbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value ?? "";
          const profileJson = (profile._json ?? {}) as Record<string, unknown>;
          const fullNameCandidate = profile.displayName || String(profileJson.name ?? "");
          const fullName = fullNameCandidate.trim() || email;
          const fullNameKanaRaw =
            typeof profileJson.name_kana === "string"
              ? profileJson.name_kana
              : typeof profileJson.kana === "string"
                ? profileJson.kana
                : "";
          const fullNameKana = fullNameKanaRaw.trim() || null;
          const role =
            appConfig.presidentEmail && email.toLowerCase() === appConfig.presidentEmail.toLowerCase()
              ? "admin"
              : "employee";
          const dbUser = await upsertUserByGoogle({
            googleSub: profile.id,
            email,
            role,
            fullName,
            fullNameKana,
          });
          const user: SessionUser = {
            id: profile.id,
            dbUserId: dbUser.id,
            email,
            name: fullName,
            role,
            employeeId: dbUser.employeeId,
          };
          done(null, user);
        } catch (e) {
          done(e as Error);
        }
      }
    )
  );

  }

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user: SessionUser, done) => done(null, user));
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const appConfig = (req.app.locals.appConfig as AppConfig | undefined) ?? loadAppConfig();
  if (!appConfig.useAuth) return next();
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "login required" } });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const appConfig = (req.app.locals.appConfig as AppConfig | undefined) ?? loadAppConfig();
  if (!appConfig.useAuth) {
    const role = req.header("x-role") ?? "admin";
    if (role === "admin") return next();
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "admin role required" } });
  }
  if (req.isAuthenticated?.() && req.user?.role === "admin") return next();
  return res.status(403).json({ error: { code: "FORBIDDEN", message: "admin role required" } });
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const iter = 16384;
  const keyLen = 64;
  const digest = "sha512";
  const hash = crypto.pbkdf2Sync(password, salt, iter, keyLen, digest).toString("hex");
  return `pbkdf2$${digest}$${iter}$${salt}$${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const digest = parts[1];
  const iter = Number(parts[2]);
  const salt = parts[3];
  const hash = parts[4];
  if (!Number.isFinite(iter) || iter <= 0 || !salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, iter, hash.length / 2, digest).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
