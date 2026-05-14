import { useState } from "react";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillCreds(u, p) {
    setUsername(u);
    setPassword(p);
    setError("");
  }

  return (
    <div className="page-center">
      <div className="card login-card">
        <div className="card-header">
          <div className="attack-badge">VULNERABLE APP</div>
          <h2>Sign In</h2>
          <p className="subtitle">JWT stored in <code>localStorage</code> — readable by any JS</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="off"
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="password"
              required
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Authenticating…" : "Login"}
          </button>
        </form>

        <div className="cred-hints">
          <p>Quick credentials:</p>
          <div className="cred-list">
            <button className="cred-btn" onClick={() => fillCreds("alice", "password123")}>
              <span className="cred-user">alice</span>
              <span className="cred-role role-user">user</span>
            </button>
            <button className="cred-btn" onClick={() => fillCreds("admin", "admin123")}>
              <span className="cred-user">admin</span>
              <span className="cred-role role-admin">admin</span>
            </button>
          </div>
        </div>

        <div className="vuln-note">
          <span className="vuln-icon">⚠</span>
          After login, the JWT is saved to <code>localStorage.jwt_token</code>.
          Navigate to <strong>Dashboard</strong> to trigger the stored XSS and watch the
          token get exfiltrated. Then check <strong>Attacker View</strong>.
        </div>
      </div>
    </div>
  );
}
