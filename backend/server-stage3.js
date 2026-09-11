import express from "express";
import cors from "cors";
import pg from "pg";
import path from "node:path";
import fs from "node:fs";
import { createStage3CandCRouter } from "./stage3-candc.js";

const { Pool } = pg;
const app = express();
app.use(express.json());

const rawOrigins = (process.env.ALLOWED_ORIGINS || "").trim();
const corsOrigin = rawOrigins === "*" || rawOrigins === ""
  ? "*"
  : rawOrigins.split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin }));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ENABLE_STAGE3_CANDC = process.env.ENABLE_STAGE3_CANDC === "true";

if (ENABLE_STAGE3_CANDC) {
  app.use(
    "/api/candc",
    createStage3CandCRouter({
      pool,
      lecturerKey: process.env.CANDC_LECTURER_KEY || "",
    })
  );
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, stage3_candc_enabled: ENABLE_STAGE3_CANDC, consolidated_app: true });
});

// Do not let unknown API paths fall through to the SPA shell.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Unknown API route" });
});

// In the consolidated deployment the Vite build is copied here by the root Dockerfile.
// Development and the legacy split deployment can still run the backend without it.
const staticDir = process.env.STATIC_DIR || path.resolve(process.cwd(), "../frontend-dist");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get("*", (req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`C&C app listening on :${PORT} (enabled=${ENABLE_STAGE3_CANDC}, static=${fs.existsSync(staticDir)})`);
});
