import { useState, useEffect } from "react";

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export default function Dashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [postStatus, setPostStatus] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("jwt_token"));
  const [attackFired, setAttackFired] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchComments();
  }, []);

  async function fetchProfile() {
    const t = localStorage.getItem("jwt_token");
    setToken(t);
    try {
      const res = await fetch("http://localhost:3001/api/profile", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      setProfile(data);
    } catch {
      setProfile(null);
    }
  }

  async function fetchComments() {
    const res = await fetch("http://localhost:3001/api/comments");
    const data = await res.json();
    setComments(data);
  }

  async function postComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    const t = localStorage.getItem("jwt_token");
    setPostStatus("posting…");
    try {
      const res = await fetch("http://localhost:3001/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ text: newComment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setComments(prev => [...prev, data]);
      setNewComment("");
      setPostStatus("Posted!");
      setTimeout(() => setPostStatus(""), 2000);
    } catch (err) {
      setPostStatus(`Error: ${err.message}`);
    }
  }

  const decoded = token ? decodeJwt(token) : null;

  return (
    <div className="dashboard">
      {/* Attack Flow Banner */}
      <div className="attack-banner">
        <div className="attack-flow">
          <div className="flow-step">
            <div className="flow-icon safe">1</div>
            <div className="flow-label">Login<br /><small>JWT issued</small></div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="flow-icon vuln">2</div>
            <div className="flow-label">localStorage<br /><small>Token stored</small></div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="flow-icon danger">3</div>
            <div className="flow-label">XSS fires<br /><small>Reads token</small></div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="flow-icon danger">4</div>
            <div className="flow-label">Exfiltrate<br /><small>POST to attacker</small></div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="flow-icon danger">5</div>
            <div className="flow-label">Token Replay<br /><small>Full account access</small></div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Left column */}
        <div className="left-col">
          {/* Profile card */}
          {profile && (
            <div className="card">
              <div className="section-label safe-label">PROTECTED ENDPOINT /api/profile</div>
              <div className="profile-info">
                <div className="avatar">{user?.username?.[0]?.toUpperCase()}</div>
                <div>
                  <div className="profile-name">{profile.user?.username}</div>
                  <span className={`cred-role ${profile.user?.role === "admin" ? "role-admin" : "role-user"}`}>
                    {profile.user?.role}
                  </span>
                </div>
              </div>
              <div className="sensitive-data">
                <span className="sensitive-label">Sensitive Data Exposed:</span>
                <div className="sensitive-value">{profile.secret}</div>
              </div>
            </div>
          )}

          {/* JWT Display */}
          {token && (
            <div className="card">
              <div className="section-label vuln-label">localStorage.jwt_token</div>
              <div className="token-display">{token}</div>
              <div className="decoded-header">Decoded Payload:</div>
              <div className="decoded-payload">
                {decoded && Object.entries(decoded).map(([k, v]) => (
                  <div key={k} className="decoded-row">
                    <span className="decoded-key">{k}</span>
                    <span className="decoded-val">
                      {k === "exp" || k === "iat"
                        ? `${v} (${new Date(v * 1000).toLocaleTimeString()})`
                        : String(v)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="vuln-note small">
                <span className="vuln-icon">⚠</span>
                Any script running on this origin can read this token via
                <code>localStorage.getItem('jwt_token')</code>
              </div>
            </div>
          )}
        </div>

        {/* Right column — Comments / XSS vector */}
        <div className="right-col">
          <div className="card">
            <div className="section-label danger-label">
              STORED XSS VECTOR — Comments (dangerouslySetInnerHTML)
            </div>

            <div className="comments-list">
              {comments.map(c => (
                <div key={c.id} className={`comment ${c.safe ? "" : "comment-malicious"}`}>
                  <div className="comment-header">
                    <span className="comment-author">{c.author}</span>
                    {!c.safe && (
                      <span className="xss-badge">
                        XSS PAYLOAD
                      </span>
                    )}
                  </div>
                  {c.safe ? (
                    <div className="comment-text">{c.text}</div>
                  ) : (
                    <>
                      <div className="xss-payload-label">Raw payload (stored in DB):</div>
                      <code className="xss-source">{c.text}</code>
                      <div className="xss-payload-label rendered">Rendered as HTML (fires XSS):</div>
                      <div
                        className="comment-text rendered-html"
                        dangerouslySetInnerHTML={{ __html: c.text }}
                        ref={el => {
                          if (el && !attackFired) {
                            setAttackFired(true);
                          }
                        }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>

            {attackFired && (
              <div className="attack-fired-banner">
                XSS fired — token exfiltrated to attacker. Check <strong>Attacker View →</strong>
              </div>
            )}

            {/* Post comment form */}
            <form onSubmit={postComment} className="comment-form">
              <div className="section-label" style={{ marginBottom: "8px" }}>Post a comment (stored as-is, no sanitization)</div>
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder={`Try: <img src=x onerror="alert('xss')">`}
                rows={3}
              />
              <div className="comment-form-footer">
                {postStatus && <span className="post-status">{postStatus}</span>}
                <button type="submit" className="btn-primary small">Post Comment</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
