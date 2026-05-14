import { useState, useEffect } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";
import AttackerLog from "./AttackerLog";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("login"); // login | dashboard | attacker
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    const stored = localStorage.getItem("jwt_user");
    if (token && stored) {
      setUser(JSON.parse(stored));
      setPage("dashboard");
    }
  }, []);

  function handleLogin(token, userData) {
    // VULNERABLE: storing JWT in localStorage — readable by any JS on this page
    localStorage.setItem("jwt_token", token);
    localStorage.setItem("jwt_user", JSON.stringify(userData));
    setUser(userData);
    setPage("dashboard");
  }

  function handleLogout() {
    localStorage.removeItem("jwt_token");
    localStorage.removeItem("jwt_user");
    setUser(null);
    setPage("login");
  }

  return (
    <div className="app">
      <nav className="navbar">
        <span className="brand">JWT + XSS POC</span>
        <div className="nav-links">
          <button onClick={() => setPage("login")} className={page === "login" ? "active" : ""}>Login</button>
          {user && <button onClick={() => setPage("dashboard")} className={page === "dashboard" ? "active" : ""}>Dashboard</button>}
          <button onClick={() => setPage("attacker")} className={`danger ${page === "attacker" ? "active" : ""}`}>
            Attacker View
          </button>
          {user && <button onClick={handleLogout} className="logout">Logout ({user.username})</button>}
        </div>
      </nav>

      <main>
        {page === "login" && <Login onLogin={handleLogin} />}
        {page === "dashboard" && <Dashboard user={user} />}
        {page === "attacker" && <AttackerLog />}
      </main>
    </div>
  );
}
