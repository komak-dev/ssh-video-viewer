import React from "react";

function ConnectScreen({
    config,
    setConfig,
    profiles,
    activeProfileId,
    onSelectProfile,
    onDeleteProfile,
    onSaveProfile,
    onConnect,
    busy,
    status,
}) {
    return (
        <div className="screen-connect">
            <div className="glass-panel">
                {/* Left Sidebar: Profiles */}
                <aside className="profiles-sidebar">
                    <div className="profiles-header">
                        <h2>Profiles</h2>
                    </div>
                    <div className="profiles-list">
                        {profiles.length === 0 ? (
                            <div style={{ padding: "0 20px", color: "var(--text-tertiary)" }}>
                                No saved profiles.
                            </div>
                        ) : (
                            profiles.map((profile) => (
                                <div
                                    key={profile.id}
                                    className={`profile-card ${profile.id === activeProfileId ? "active" : ""
                                        }`}
                                    onClick={() => onSelectProfile(profile)}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <div className="profile-info">
                                        <h3>{profile.name}</h3>
                                        <p>
                                            {profile.username}@{profile.host}
                                        </p>
                                    </div>
                                    <button
                                        className="btn-icon danger"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteProfile(profile.id);
                                        }}
                                        title="Delete Profile"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </aside>

                {/* Right Area: Form */}
                <div className="config-area">
                    <header className="config-header">
                        <h1>SSH Video Viewer</h1>
                        <p>Securely stream videos from your remote server.</p>
                    </header>

                    <div className="form-grid-v2">
                        <div className="input-group full-width">
                            <label>Connection Name</label>
                            <input
                                value={config.name}
                                onChange={(e) =>
                                    setConfig((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="e.g. My Media Server"
                            />
                        </div>

                        <div className="input-group">
                            <label>Host</label>
                            <input
                                value={config.host}
                                onChange={(e) =>
                                    setConfig((prev) => ({ ...prev, host: e.target.value }))
                                }
                                placeholder="192.168.1.10"
                            />
                        </div>

                        <div className="input-group">
                            <label>Port</label>
                            <input
                                value={config.port}
                                onChange={(e) =>
                                    setConfig((prev) => ({ ...prev, port: e.target.value }))
                                }
                                placeholder="22"
                            />
                        </div>

                        <div className="input-group">
                            <label>Username</label>
                            <input
                                value={config.username}
                                onChange={(e) =>
                                    setConfig((prev) => ({ ...prev, username: e.target.value }))
                                }
                                placeholder="root"
                            />
                        </div>

                        <div className="input-group">
                            <label>Password</label>
                            <input
                                type="password"
                                value={config.password}
                                onChange={(e) =>
                                    setConfig((prev) => ({ ...prev, password: e.target.value }))
                                }
                                placeholder="••••••••"
                            />
                        </div>

                        <div className="input-group full-width">
                            <label>Private Key</label>
                            <textarea
                                rows={3}
                                value={config.privateKey}
                                onChange={(e) =>
                                    setConfig((prev) => ({ ...prev, privateKey: e.target.value }))
                                }
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                            />
                        </div>

                        <div className="input-group full-width">
                            <label>Video Folder Path</label>
                            <input
                                value={config.folder}
                                onChange={(e) =>
                                    setConfig((prev) => ({ ...prev, folder: e.target.value }))
                                }
                                placeholder="/home/user/videos"
                            />
                        </div>
                    </div>

                    <div className="actions-row">
                        <button className="btn-glass" onClick={onSaveProfile} disabled={busy}>
                            Save Profile
                        </button>
                        <button className="btn-primary" onClick={onConnect} disabled={busy}>
                            {busy ? "Connecting..." : "Connect Now"}
                        </button>
                    </div>

                    <div style={{ textAlign: "center", marginTop: "10px" }}>
                        <p style={{ color: "var(--accent-color)", fontSize: "0.9rem" }}>{status}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ConnectScreen;
