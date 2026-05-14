import { useState, useEffect, useRef } from "react";

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export default function AttackerLog() {
  const [entries, setEntries] = useState([]);
  const [replayResult, setReplayResult] = useState(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchLog();
    pollRef.current = setInterval(fetchLog, 2000);
    return () => clearInterval(pollRef.current);
  }, []);

  async function fetchLog() {
    try {
      const res = await fetch("http://localhost:3001/api/attacker/log");
      const data = await res.json();
      setEntries(data);
      if (data.length > 0 && !selectedToken) {
        setSelectedToken(data[data.length - 1].token);
      }
    } catch {
      // ignore
    }
  }

  async function replayAttack(token) {
    setReplayLoading(true);
    setReplayResult(null);
    try {
      const res = await fetch("http://localhost:3001/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setReplayResult({ success: res.ok, data, status: res.status });
    } catch (err) {
      setReplayResult({ success: false, data: { error: err.message }, status: 0 });
    } finally {
      setReplayLoading(false);
    }
  }

  const activeDecoded = selectedToken ? decodeJwt(selectedToken) : null;

  return (
    <div className="attacker-view">
      <div className="attacker-header">
        <div className="hacker-badge">ATTACKER CONSOLE</div>
        <h2>Exfiltrated Tokens</h2>
        <p className="subtitle">
          Simulating attacker's server receiving stolen JWTs via XSS.
          Polling <code>/api/attacker/log</code> every 2s.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <p>No tokens captured yet.</p>
          <p>Log in as any user, then visit the <strong>Dashboard</strong> to trigger the XSS.</p>
        </div>
      ) : (
        <div className="attacker-grid">
          {/* Captured tokens list */}
          <div className="captured-list">
            <div className="panel-label">Captured Tokens ({entries.length})</div>
            {entries.map((entry, i) => {
              const dec = decodeJwt(entry.token);
              return (
                <div
                  key={i}
                  className={`captured-entry ${selectedToken === entry.token ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedToken(entry.token);
                    setReplayResult(null);
                  }}
                >
                  <div className="entry-top">
                    <span className="entry-user">{dec?.username || "unknown"}</span>
                    <span className={`cred-role ${dec?.role === "admin" ? "role-admin" : "role-user"}`}>
                      {dec?.role || "?"}
                    </span>
                  </div>
                  <div className="entry-meta">
                    <span className="entry-source">{entry.source}</span>
                    <span className="entry-time">{new Date(entry.capturedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="entry-page">{entry.page}</div>
                </div>
              );
            })}
          </div>

          {/* Token inspector + replay */}
          {selectedToken && (
            <div className="token-inspector">
              <div className="panel-label">Token Inspector</div>

              <div className="inspector-section">
                <div className="inspector-label">Raw JWT</div>
                <div className="token-raw">{selectedToken}</div>
              </div>

              {activeDecoded && (
                <div className="inspector-section">
                  <div className="inspector-label">Decoded Payload</div>
                  <table className="decoded-table">
                    <tbody>
                      {Object.entries(activeDecoded).map(([k, v]) => (
                        <tr key={k}>
                          <td className="dt-key">{k}</td>
                          <td className="dt-val">
                            {k === "exp" || k === "iat"
                              ? `${v} → ${new Date(v * 1000).toLocaleString()}`
                              : String(v)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="inspector-section">
                <div className="inspector-label">Token Replay Attack</div>
                <p className="replay-desc">
                  Use the stolen token to call a protected API endpoint as the victim —
                  no password required.
                </p>
                <button
                  className="btn-danger"
                  onClick={() => replayAttack(selectedToken)}
                  disabled={replayLoading}
                >
                  {replayLoading ? "Replaying…" : "Replay → GET /api/profile"}
                </button>

                {replayResult && (
                  <div className={`replay-result ${replayResult.success ? "replay-success" : "replay-fail"}`}>
                    <div className="replay-status">
                      {replayResult.success ? "✓ SUCCESS" : "✗ FAILED"} — HTTP {replayResult.status}
                    </div>
                    <pre className="replay-body">{JSON.stringify(replayResult.data, null, 2)}</pre>
                    {replayResult.success && (
                      <div className="replay-impact">
                        Attacker now has full authenticated access as <strong>{replayResult.data?.user?.username}</strong>.
                        Session hijack complete.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* British Airways reference */}
      <div className="card reference-card">
        <div className="panel-label">British Airways Breach — What Actually Happened (2018)</div>
        <div className="ba-grid">
          <div className="ba-item">
            <div className="ba-step">1</div>
            <div>
              <strong>Supply-chain injection</strong><br />
              Attackers compromised a third-party script (Feedify) loaded on ba.com,
              injecting ~22 lines of malicious JS into the checkout page.
            </div>
          </div>
          <div className="ba-item">
            <div className="ba-step">2</div>
            <div>
              <strong>Form-jacking + token theft</strong><br />
              The script intercepted payment form submissions <em>and</em> read session
              tokens / auth cookies available to JS, shipping them to a lookalike domain
              (<code>baways.com</code>).
            </div>
          </div>
          <div className="ba-item">
            <div className="ba-step">3</div>
            <div>
              <strong>Impact</strong><br />
              500,000 customers' payment card details and PII stolen over 15 days.
              BA fined £20M by the ICO under GDPR.
            </div>
          </div>
          <div className="ba-item">
            <div className="ba-step">4</div>
            <div>
              <strong>The localStorage angle</strong><br />
              Any token stored in <code>localStorage</code> is accessible to injected
              scripts on the same origin. Storing JWT in <code>httpOnly</code> cookies
              would have prevented JS-level token theft.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
