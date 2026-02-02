import { useMemo, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import ConnectScreen from "./components/ConnectScreen";
import PlayerScreen from "./components/PlayerScreen";

const defaultConfig = {
  name: "",
  host: "",
  port: "22",
  username: "",
  password: "",
  privateKey: "",
  passphrase: "",
  folder: "",
};

const STORAGE_KEY = "ssh-video-viewer.profiles";

const stringifyError = (error) => {
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  return JSON.stringify(error);
};

const base64UrlEncode = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const loadProfiles = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const saveProfiles = (profiles) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
};

function App() {
  const [screen, setScreen] = useState("connect");
  const [config, setConfig] = useState(defaultConfig);
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [currentSrc, setCurrentSrc] = useState("");
  const [status, setStatus] = useState("Enter connection details.");
  const [busy, setBusy] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(true);

  useEffect(() => {
    const stored = loadProfiles();
    setProfiles(stored);
    if (stored.length > 0) {
      const first = stored[0];
      setActiveProfileId(first.id);
      setConfig({ ...defaultConfig, ...first });
    }
  }, []);

  const getSshConfig = (sourceConfig) => ({
    host: sourceConfig.host.trim(),
    port: Number(sourceConfig.port) || 22,
    username: sourceConfig.username.trim(),
    password: sourceConfig.password?.trim() || null,
    privateKey: sourceConfig.privateKey?.trim() || null,
    passphrase: sourceConfig.passphrase?.trim() || null,
  });

  const preparedConfig = useMemo(() => getSshConfig(config), [config]);

  const persistProfiles = (nextProfiles, nextActiveId = activeProfileId) => {
    setProfiles(nextProfiles);
    saveProfiles(nextProfiles);
    if (nextActiveId) setActiveProfileId(nextActiveId);
  };

  const handleSaveProfile = () => {
    const name = config.name.trim();
    if (!name) {
      setStatus("Please enter a connection name.");
      return;
    }
    // Always create a new ID (Save as New)
    const id = crypto.randomUUID();
    const next = [...profiles];
    next.unshift({ ...config, id, name });
    persistProfiles(next, id);
    setStatus("Profile saved as new connection.");
  };

  const handleSelectProfile = (profile) => {
    setActiveProfileId(profile.id);
    setConfig({ ...defaultConfig, ...profile });
    setStatus(`Selected: ${profile.name}`);
  };

  const handleNewProfile = () => {
    setActiveProfileId(null);
    setConfig(defaultConfig);
    setStatus("New profile created.");
  };

  const handleDeleteProfile = (profileId) => {
    const next = profiles.filter((profile) => profile.id !== profileId);
    persistProfiles(next, next[0]?.id || null);
    if (next.length === 0) {
      setConfig(defaultConfig);
      setStatus("Enter connection details.");
    } else {
      setConfig({ ...defaultConfig, ...next[0] });
      setStatus(`Selected: ${next[0].name}`);
    }
  };

  const loadVideos = async (overrideProfile = null) => {
    // Check if overrideProfile is a click event (synthetic event) or null
    const isProfile = overrideProfile && overrideProfile.host;

    setBusy(true);
    setStatus("Fetching video list...");

    try {
      // Use override config if provided, otherwise use current state
      let activeConfig = preparedConfig;

      if (isProfile) {
        // If connecting via double-click (override), update state to match
        setActiveProfileId(overrideProfile.id);
        setConfig({ ...defaultConfig, ...overrideProfile });
        activeConfig = getSshConfig(overrideProfile);
      }

      await invoke("set_active_config", { config: activeConfig });
      const result = await invoke("list_videos", {
        config: activeConfig,
        folder: (isProfile ? overrideProfile.folder : config.folder).trim(),
      });
      setFiles(result);
      setCurrentPath("");
      setCurrentSrc("");
      if (result.length === 0) {
        setStatus("No videos found.");
      } else {
        setStatus(`${result.length} videos found.`);
      }
      setScreen("player");
    } catch (error) {
      setStatus(`Error: ${stringifyError(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const playFile = async (remotePath) => {
    setBusy(true);
    setStatus("Preparing stream...");
    try {
      await invoke("set_active_config", { config: preparedConfig });
      const encoded = base64UrlEncode(remotePath);
      const fileSrc = `sshvideo://stream/${encoded}`;
      setCurrentPath(remotePath);
      setCurrentSrc(fileSrc);
      setStatus(`Playing: ${remotePath.split("/").pop()}`);
    } catch (error) {
      setStatus(`Error: ${stringifyError(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const playNext = async () => {
    if (!autoPlayNext || files.length === 0 || !currentPath) return;
    const currentIndex = files.indexOf(currentPath);
    if (currentIndex === -1) return;
    const nextPath = files[currentIndex + 1];
    if (!nextPath) return;
    await playFile(nextPath);
  };

  const playPrevious = async () => {
    if (files.length === 0 || !currentPath) return;
    const currentIndex = files.indexOf(currentPath);
    if (currentIndex <= 0) return;
    const prevPath = files[currentIndex - 1];
    if (!prevPath) return;
    await playFile(prevPath);
  };

  if (screen === "connect") {
    return (
      <>
        <ConnectScreen
          config={config}
          setConfig={setConfig}
          profiles={profiles}
          activeProfileId={activeProfileId}
          onSelectProfile={handleSelectProfile}
          onNewProfile={handleNewProfile}
          onDeleteProfile={handleDeleteProfile}
          onSaveProfile={handleSaveProfile}
          onConnect={loadVideos}
          busy={busy}
          status={status}
        />
      </>
    );
  }

  return (
    <>
      {/* Re-enable pointer events for buttons inside the drag region if any (traffic lights handle themselves) */}

      <PlayerScreen
        files={files}
        currentPath={currentPath}
        currentSrc={currentSrc}
        status={status}
        busy={busy}
        config={config}
        autoPlayNext={autoPlayNext}
        setAutoPlayNext={setAutoPlayNext}
        onPlayFile={playFile}
        onPlayNext={playNext}
        onPlayPrevious={playPrevious}
        onRefreshList={loadVideos}
        onBack={() => setScreen("connect")}
      />
    </>
  );
}

export default App;
