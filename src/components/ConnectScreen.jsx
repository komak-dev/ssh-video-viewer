import React, { useState } from "react";

function ConnectScreen({
    config,
    setConfig,
    profiles,
    activeProfileId,
    onSelectProfile,
    onNewProfile,
    onDeleteProfile,
    onSaveProfile,
    onConnect,
    busy,
    status,
}) {
    const [view, setView] = useState("list"); // "list" or "form"

    const handleProfileClick = (profile) => {
        onSelectProfile(profile);
        setView("form");
    };

    const handleNewClick = () => {
        onNewProfile();
        setView("form");
    };

    const handleBack = () => {
        setView("list");
    };

    const handleSaveAndBack = () => {
        onSaveProfile();
        setView("list");
    };

    // List View Render
    if (view === "list") {
        return (
            <div className="screen-connect">
                <div className="glass-panel list-mode">
                    <header className="list-header">
                        <h1>Select Profile</h1>
                        <p>{profiles.length} profiles stored</p>
                    </header>

                    <div className="list-grid-wrapper">
                        {/* New Profile Button (Always first) */}
                        <div
                            className="profile-card new-profile-card"
                            onClick={handleNewClick}
                            role="button"
                            tabIndex={0}
                        >
                            <div className="new-icon">+</div>
                            <h3>New Profile</h3>
                        </div>

                        {profiles.map((profile) => (
                            <div
                                key={profile.id}
                                className="profile-card"
                                onClick={() => handleProfileClick(profile)}
                                onDoubleClick={() => onConnect(profile)}
                                role="button"
                                tabIndex={0}
                            >
                                <div className="card-header">
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
                                <div className="card-actions">
                                    <button
                                        className="btn-glass small full-width"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onConnect(profile);
                                        }}
                                    >
                                        Connect
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Form View Render
    return (
        <div className="screen-connect">
            <div className="glass-panel form-mode">
                <header className="config-header">
                    <button className="btn-icon round back-btn" onClick={handleBack} title="Back to List">
                        ←
                    </button>
                    <h1>{activeProfileId ? "Edit Profile" : "New Connection"}</h1>
                </header>

                <div className="config-scroll-area">
                    <div className="form-grid-v2">
                        <div className="input-group full-width">
                            <label>Connection Name</label>
                            <input
                                value={config.name}
                                onChange={(e) =>
                                    setConfig((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="e.g. My Media Server"
                                autoFocus
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
                            <label>Private Key (File)</label>
                            <div className="file-input-wrapper">
                                <input
                                    type="file"
                                    id="private-key-file"
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = (ev) => {
                                                setConfig((prev) => ({ ...prev, privateKey: ev.target.result }));
                                            };
                                            reader.readAsText(file);
                                        }
                                    }}
                                    style={{ display: "none" }}
                                />
                                <div className="file-input-display">
                                    <span className={`status-badge ${config.privateKey ? "success" : "neutral"}`}>
                                        {config.privateKey
                                            ? "✓ Key Loaded"
                                            : "No private key selected"}
                                    </span>
                                    <button
                                        className="btn-glass small"
                                        onClick={() => document.getElementById("private-key-file").click()}
                                    >
                                        Select File...
                                    </button>
                                    {config.privateKey && (
                                        <button
                                            className="btn-icon danger small"
                                            onClick={() => setConfig((prev) => ({ ...prev, privateKey: "" }))}
                                            title="Clear Key"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            </div>
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
                        <button className="btn-glass" onClick={handleSaveAndBack} disabled={busy}>
                            Save & Close
                        </button>
                        <button className="btn-primary" onClick={() => onConnect()} disabled={busy}>
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
