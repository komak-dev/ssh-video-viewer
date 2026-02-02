import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import VideoPlayer from "./VideoPlayer";

function PlayerScreen({
    files,
    currentPath,
    currentSrc,
    status,
    busy,
    config,
    autoPlayNext,
    setAutoPlayNext,
    onPlayFile,
    onPlayNext,
    onPlayPrevious,
    onRefreshList,
    onBack,
}) {
    const [showToast, setShowToast] = useState(false);
    const [lastStatus, setLastStatus] = useState("");
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    // Simple toast logic: show when status changes and is not empty
    useEffect(() => {
        if (status && status !== lastStatus) {
            setLastStatus(status);
            setShowToast(true);
            const timer = setTimeout(() => setShowToast(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [status, lastStatus]);

    return (
        <div className="screen-player">
            {/* Mobile Menu Button - Visible via CSS only on small screens */}
            <button
                className="mobile-menu-btn"
                onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>

            {/* Mobile Backdrop */}
            {isMobileSidebarOpen && (
                <div
                    className="mobile-backdrop"
                    onClick={() => setIsMobileSidebarOpen(false)}
                />
            )}

            <div className={`sidebar-wrapper ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
                <Sidebar
                    files={files}
                    currentPath={currentPath}
                    onPlayFile={(path) => {
                        onPlayFile(path);
                        setIsMobileSidebarOpen(false); // Close on select
                    }}
                    onBack={onBack}
                    configName={config.name}
                    autoPlayNext={autoPlayNext}
                    setAutoPlayNext={setAutoPlayNext}
                    busy={busy}
                />
            </div>

            <main className="player-main">
                {/* Toast Notification */}
                {showToast && (
                    <div className="toast-container">
                        <div className="toast">
                            <span>ℹ️</span>
                            <span>{status}</span>
                        </div>
                    </div>
                )}

                {/* Video Area */}
                <VideoPlayer
                    src={currentSrc}
                    onEnded={onPlayNext}
                    onNext={onPlayNext}
                    onPrev={onPlayPrevious}
                />
            </main>
        </div>
    );
}

export default PlayerScreen;
