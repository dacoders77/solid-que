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
import { mediaRouter } from "./routes/media";
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
app.use(mediaRouter);

// Static assets (JS/CSS) carry no sensitive data and must load even when
// the session has gone stale, otherwise a login-redirected <script src>
// silently fails to execute and every button on the page appears dead.
// index.html is excluded here (index: false) and served explicitly below,
// behind auth, so an unauthenticated "/" still bounces to the login page.
//
// no-store: this app is actively developed and redeployed often; a stale
// cached JS/CSS file has repeatedly caused "the buttons don't work" reports
// that were actually just an old browser cache. Never worth the tradeoff
// here — always fetch fresh.
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    index: false,
    setHeaders: (res) => res.setHeader("Cache-Control", "no-store"),
  })
);

app.use((req, res, next) => {
  if (req.path === "/login" || req.path === "/api/login") {
    next();
    return;
  }
  requireAuth(req, res, next);
});

app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile("index.html", { root: path.join(__dirname, "..", "public") });
});

app.get("/trash", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile("trash.html", { root: path.join(__dirname, "..", "public") });
});

app.use(videosRouter);

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
