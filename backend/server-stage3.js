import express from "express";
import cors from "cors";
import pg from "pg";
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
  res.json({ ok: true, stage3_candc_enabled: ENABLE_STAGE3_CANDC });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`C&C Stage 3 API listening on :${PORT} (enabled=${ENABLE_STAGE3_CANDC})`);
});
