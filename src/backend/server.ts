import express from "express";
import path from "path";
import session from "express-session";
import passport from "passport";
import { z } from "zod";
import { adminRouter } from "./routes/admin-routes";
import { employeeRouter } from "./routes/employee-routes";
import { ok } from "./http";
import { getConfigStatus, loadAppConfig } from "./config";
import { configurePassport, hashPassword, requireAuth, verifyPassword } from "./auth";
import {
  ensureBootstrapData,
  ensureEmployeeForUser,
  findLocalUserByEmail,
  listActiveEmployees,
  loginByEmployeeSelection,
  registerLocalUser,
} from "./db";
import { exportEmployeesCsvDiff } from "./services/sync-service";

const config = loadAppConfig();
const app = express();
app.locals.appConfig = config;
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(process.cwd(), "public")));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  })
);

configurePassport(config);
app.use(passport.initialize());
app.use(passport.session());

const cfgStatus = getConfigStatus(config);
if (config.strictConfig) {
  const missing: string[] = [];
  missing.push(...cfgStatus.missingForDatabase);
  if (config.useAuth) missing.push(...cfgStatus.missingForAuth);
  if (missing.length > 0) {
    throw new Error(
      `strict config validation failed. missing: ${[...new Set(missing)].join(", ")}`
    );
  }
}

app.get("/api/v1/health", (_req, res) => ok(res, { status: "ok" }));
app.get("/api/v1/config/status", (_req, res) => {
  const status = getConfigStatus(config);
  return ok(res, status);
});

function resetSession(req: express.Request): Promise<void> {
  return new Promise((resolve) => {
    req.logout(() => {
      req.session.regenerate(() => resolve());
    });
  });
}
const authRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(100),
});
const authLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});
const authEmployeeLoginSchema = z.object({
  employeeId: z.number().int().positive(),
  email: z.string().email(),
});

app.get("/api/v1/public/employees/active", async (_req, res) => {
  const employees = await listActiveEmployees();
  return ok(res, employees);
});

app.post("/api/v1/auth/register", async (req, res) => {
  const parsed = authRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "BAD_REQUEST", message: parsed.error.issues.map((i) => i.message).join(", ") },
    });
  }
  const input = parsed.data;
  const role =
    config.presidentEmail && input.email.toLowerCase() === config.presidentEmail.toLowerCase()
      ? "admin"
      : "employee";
  try {
    await resetSession(req);
    const registered = await registerLocalUser({
      email: input.email,
      fullName: input.fullName,
      role,
      passwordHash: hashPassword(input.password),
    });
    const sessionUser = {
      id: `local:${registered.id}`,
      dbUserId: registered.id,
      email: registered.email,
      name: registered.fullName,
      role: registered.role,
      employeeId: registered.employeeId,
    };
    req.login(sessionUser, (err) => {
      if (err) {
        return res
          .status(500)
          .json({ error: { code: "SESSION_ERROR", message: "failed to create session" } });
      }
      return res.status(201).json({ data: { ...sessionUser } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({ error: { code: "CONFLICT", message: "email already registered" } });
    }
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "register failed" } });
  }
});

app.post("/api/v1/auth/login", async (req, res) => {
  const parsed = authLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "BAD_REQUEST", message: parsed.error.issues.map((i) => i.message).join(", ") },
    });
  }
  const input = parsed.data;
  const user = await findLocalUserByEmail({ email: input.email });
  if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "invalid email or password" } });
  }
  const role =
    config.presidentEmail && user.email.toLowerCase() === config.presidentEmail.toLowerCase()
      ? "admin"
      : user.role;
  await resetSession(req);
  const employeeId = user.employeeId ?? (await ensureEmployeeForUser(user.id));
  const sessionUser = {
    id: `local:${user.id}`,
    dbUserId: user.id,
    email: user.email,
    name: user.fullName,
    role,
    employeeId,
  };
  return req.login(sessionUser, (err) => {
    if (err) {
      return res.status(500).json({ error: { code: "SESSION_ERROR", message: "failed to create session" } });
    }
    return res.json({ data: { ...sessionUser } });
  });
});

app.post("/api/v1/auth/employee-login", async (req, res) => {
  const parsed = authEmployeeLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "BAD_REQUEST", message: parsed.error.issues.map((i) => i.message).join(", ") },
    });
  }
  const input = parsed.data;
  const isPresident =
    !!config.presidentEmail && input.email.toLowerCase() === config.presidentEmail.toLowerCase();
  const existingUser = await findLocalUserByEmail({ email: input.email });
  const role: "admin" | "employee" =
    isPresident || existingUser?.role === "admin" ? "admin" : "employee";
  try {
    await resetSession(req);
    const loggedIn = await loginByEmployeeSelection({
      employeeId: input.employeeId,
      email: input.email,
      role,
    });
    await exportEmployeesCsvDiff();
    const sessionUser = {
      id: `employee:${loggedIn.employeeId}`,
      dbUserId: loggedIn.id,
      email: loggedIn.email,
      name: loggedIn.name,
      role: loggedIn.role,
      employeeId: loggedIn.employeeId,
    };
    return req.login(sessionUser, (err) => {
      if (err) {
        return res.status(500).json({ error: { code: "SESSION_ERROR", message: "failed to create session" } });
      }
      return res.json({ data: { ...sessionUser } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "EMPLOYEE_NOT_FOUND") {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "employee not found" } });
    }
    if (e instanceof Error && e.message === "EMAIL_ALREADY_IN_USE") {
      return res.status(409).json({ error: { code: "CONFLICT", message: "email already in use" } });
    }
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "employee login failed" } });
  }
});

app.get("/api/v1/auth/google", (req, res, next) => {
  if (!config.useAuth) return res.redirect("/");
  if (!config.googleClientId || !config.googleClientSecret) {
    return res.status(500).json({
      error: { code: "AUTH_NOT_CONFIGURED", message: "google oauth env is not configured" },
    });
  }
  return passport.authenticate("google", {
    scope: ["profile", "email"],
    session: true,
  })(req, res, next);
});

app.get("/api/v1/auth/google/callback", (req, res, next) => {
  if (!config.useAuth) return res.redirect("/");
  return passport.authenticate("google", { failureRedirect: "/", session: true })(
    req,
    res,
    () => {
      if (req.user?.role === "admin") return res.redirect("/admin.html");
      return res.redirect("/employee.html");
    }
  );
});

app.post("/api/v1/auth/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ data: { loggedOut: true } });
    });
  });
});

app.get("/api/v1/me", (req, res) => {
  if (!config.useAuth) {
    if (req.user) {
      return ok(res, {
        id: req.user.dbUserId,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        employeeId: req.user.employeeId,
      });
    }
    return ok(res, { id: 1, email: "admin@example.com", name: "local admin", role: "admin", employeeId: null });
  }
  if (!req.user) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "login required" } });
  }
  return ok(res, {
    id: req.user.dbUserId,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    employeeId: req.user.employeeId,
  });
});

app.use("/api/v1", requireAuth, employeeRouter);
app.use("/api/v1/admin", adminRouter);

const port = config.port;
ensureBootstrapData()
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`API server running on http://localhost:${port}`);
    });
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error("bootstrap failed:", e);
    process.exit(1);
  });
