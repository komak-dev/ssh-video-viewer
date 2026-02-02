import React, { useState, useCallback, useEffect } from "react";

function Sidebar({
    files,
    currentPath,
    onPlayFile,
    onBack,
    configName,
    autoPlayNext,
    setAutoPlayNext,
    busy,
}) {
    const [width, setWidth] = useState(300);
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback((mouseDownEvent) => {
        mouseDownEvent.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback(
        (mouseMoveEvent) => {
            if (isResizing) {
                // Constrain width between 200 and 600
                const newWidth = Math.max(200, Math.min(600, mouseMoveEvent.clientX));
                setWidth(newWidth);
            }
        },
        [isResizing]
    );

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
        } else {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    const fileLabel = (path) => {
        const parts = path.split("/");
        return parts[parts.length - 1] || path;
    };

    return (
        <aside
            className="video-sidebar"
            style={{ width: `${width}px` }}
        >
            <div className="resizer" onMouseDown={startResizing} />

            <div className="sidebar-top">
                <div className="back-link" onClick={onBack}>
                    <span>←</span>
                    <span>Back to Connect</span>
                </div>
                <div className="connection-info">
                    <p className="eyebrow" style={{ color: "var(--accent-color)" }}>
                        {configName || "Library"}
                    </p>
                    <h2>Videos</h2>
                </div>
            </div>

            <div className="video-list custom-scroll">
                {files.length === 0 ? (
                    <div style={{ padding: "0 20px", color: "var(--text-tertiary)" }}>
                        No videos found.
                    </div>
                ) : (
                    files.map((path) => (
                        <div
                            key={path}
                            className={`video-item ${path === currentPath ? "active" : ""}`}
                            onClick={() => onPlayFile(path)}
                        >
                            <div className="video-item-icon">
                                {path === currentPath ? "▶" : "•"}
                            </div>
                            <div className="video-item-name">{fileLabel(path)}</div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer / Toggle */}
            <div
                style={{
                    padding: "20px",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
            >
                <label
                    className="toggle"
                    style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
                >
                    <input
                        type="checkbox"
                        checked={autoPlayNext}
                        onChange={(e) => setAutoPlayNext(e.target.checked)}
                        style={{ width: "auto", margin: 0 }}
                    />
                    <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        Auto-play next
                    </span>
                </label>
            </div>
        </aside>
    );
}

export default Sidebar;
