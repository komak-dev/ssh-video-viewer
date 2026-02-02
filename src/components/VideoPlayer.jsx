import React, { useRef, useEffect, useState } from "react";
import { getCurrentWindow } from '@tauri-apps/api/window';

function VideoPlayer({ src, onEnded }) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const controlTimeoutRef = useRef(null); // Ref for auto-hide timer

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true); // Default to true initially

    // Format time (e.g. 90 -> 1:30)
    const formatTime = (time) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    };

    useEffect(() => {
        // Initial 3s timer to hide controls if starting immediately
        startHideTimer();

        const handleKeyDown = (e) => {
            // Don't trigger if video is not loaded
            if (!videoRef.current) return;

            // On any key interaction, show controls momentarily
            handleInternalMouseMove();

            switch (e.key) {
                case "ArrowRight":
                    seek(10);
                    break;
                case "ArrowLeft":
                    seek(-10);
                    break;
                case " ": // Space to toggle play/pause
                    e.preventDefault();
                    togglePlay();
                    break;
                case "f":
                case "F":
                    toggleFullscreen();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            if (controlTimeoutRef.current) clearTimeout(controlTimeoutRef.current);
        };
    }, [isPlaying]); // Re-bind if play state changes changes timer logic? No, handleInternal checks state.

    const startHideTimer = () => {
        if (controlTimeoutRef.current) clearTimeout(controlTimeoutRef.current);
        if (!isPlaying) return; // Don't hide if paused

        controlTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);
    };

    const handleInternalMouseMove = () => {
        setShowControls(true);
        startHideTimer();
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play();
                setIsPlaying(true);
                startHideTimer(); // Restart timer now that we are playing
            } else {
                videoRef.current.pause();
                setIsPlaying(false);
                setShowControls(true); // Always show when paused
                if (controlTimeoutRef.current) clearTimeout(controlTimeoutRef.current);
            }
        }
    };

    const seek = (seconds) => {
        if (videoRef.current) {
            videoRef.current.currentTime += seconds;
        }
        handleInternalMouseMove();
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    };

    const handleScrubberChange = (e) => {
        const time = parseFloat(e.target.value);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
        handleInternalMouseMove();
    };

    const toggleFullscreen = async () => {
        try {
            // Use Tauri's native window API
            const appWindow = getCurrentWindow();
            const isFull = await appWindow.isFullscreen();

            console.log("Tauri Native Fullscreen Toggle. Current:", isFull);
            await appWindow.setFullscreen(!isFull);

            // Update local state immediately for UI response
            setIsFullscreen(!isFull);
            handleInternalMouseMove();

        } catch (error) {
            console.error("Failed to toggle native fullscreen (are you running in a browser?):", error);

            // Fallback to Web API for dev/browser environment
            if (!containerRef.current) return;
            const isFullWeb = document.fullscreenElement || document.webkitFullscreenElement;

            if (!isFullWeb) {
                if (containerRef.current.requestFullscreen) containerRef.current.requestFullscreen();
                else if (containerRef.current.webkitRequestFullscreen) containerRef.current.webkitRequestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
        }
    };

    // Keep event listener for verification syncing
    useEffect(() => {
        const handleFullscreenChange = () => {
            // Logic for syncing state if external change happens
            const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
            // setIsFullscreen(isFull);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    if (!src) {
        return (
            <div className="empty-placeholder">
                <span>🎬</span>
                <p>Select a video to start cinematic playback</p>
            </div>
        );
    }

    return (
        <div
            className={`player-wrapper ${isFullscreen ? 'fullscreen-active' : ''}`}
            onMouseMove={handleInternalMouseMove}
            onMouseLeave={() => {
                // If playing, hide immediately when leaving the area (optional, user asked for time-based, but cleaner)
                // Actually user said "after a while", but standard behavior is usually hide on leave + timer.
                // Let's stick to timer logic predominately, but clearing if we leave the window might be good.
                // For now, let's just let the timer handle it or hide immediately? 
                // Existing behavior was: onMouseLeave={() => setShowControls(false)}
                // Let's keep that for immediate cleanliness if mouse isn't hovering.
                if (isPlaying) setShowControls(false);
            }}
            style={{
                cursor: showControls ? 'auto' : 'none'
            }}
        >
            <div
                className="cinema-container group"
                ref={containerRef}
            >
                <video
                    ref={videoRef}
                    key={src}
                    src={src}
                    autoPlay
                    preload="metadata"
                    playsInline
                    onEnded={onEnded}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onClick={togglePlay}
                    className="video-element"
                />



                {/* Custom Control Bar */}
                <div className={`custom-controls ${showControls || !isPlaying ? 'visible' : ''}`}>

                    <div className="scrubber-row">
                        <input
                            type="range"
                            min="0"
                            max={duration || 0}
                            value={currentTime}
                            onChange={handleScrubberChange}
                            className="video-scrubber"
                            style={{
                                background: `linear-gradient(to right, var(--accent-color) ${(currentTime / duration) * 100}%, rgba(255,255,255,0.2) ${(currentTime / duration) * 100}%)`
                            }}
                        />
                    </div>

                    <div className="controls-row">
                        <div className="left-controls">
                            <button onClick={togglePlay} className="control-btn-icon" title={isPlaying ? "Pause" : "Play"}>
                                {isPlaying ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                                ) : (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                )}
                            </button>

                            <span className="time-display">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                        </div>

                        <div className="center-controls">
                            <button onClick={() => seek(-10)} className="control-btn-icon" title="-10s">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M9 13a4 4 0 0 1 7 0"></path><path d="M12 13v4"></path></svg>
                            </button>
                            <button onClick={() => seek(10)} className="control-btn-icon" title="+10s">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M15 13a4 4 0 0 0-7 0"></path><path d="M12 13v4"></path></svg>
                            </button>
                        </div>

                        <div className="right-controls">
                            <button
                                onClick={toggleFullscreen}
                                className="control-btn-icon"
                                title={isFullscreen ? "Exit Fullscreen (F)" : "Enter Fullscreen (F)"}
                            >
                                {isFullscreen ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>
                                ) : (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default VideoPlayer;
