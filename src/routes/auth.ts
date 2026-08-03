import { Router } from "express";
import { verifyPassword } from "../auth";

export const authRouter = Router();

authRouter.get("/login", (req, res) => {
  if (req.session.loggedIn) {
    res.redirect("/");
    return;
  }
  res.sendFile("login.html", { root: "public" });
});

authRouter.post("/api/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  if (!verifyPassword(username, password)) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  req.session.loggedIn = true;
  res.json({ ok: true });
});

authRouter.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});
