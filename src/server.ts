import "dotenv/config";
import express from "express";
import session from "express-session";
import path from "node:path";
import { config } from "./config";
import { requireAuth } from "./auth";
import { authRouter } from "./routes/auth";
import { ingestRouter } from "./routes/ingest";
import { videosRouter } from "./routes/videos";
import { publishRouter } from "./routes/publish";
import { db } from "./db";

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);

app.use(authRouter);

// Machine-to-machine routes authenticate with their own X-Service-Token
// check, so they're mounted before the browser session gate below.
app.use(ingestRouter);
app.use(publishRouter);

app.use((req, res, next) => {
  if (req.path === "/login" || req.path === "/api/login") {
    next();
    return;
  }
  requireAuth(req, res, next);
});

app.use(videosRouter);

app.use("/storage", express.static(config.storageDir));
app.use(express.static(path.join(__dirname, "..", "public")));

const server = app.listen(config.port, () => {
  console.log(`solid-que listening on port ${config.port}`);
});

function shutdown() {
  console.log("shutting down, closing db...");
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
