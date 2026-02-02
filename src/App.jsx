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

  const preparedConfig = useMemo(
    () => ({
      host: config.host.trim(),
      port: Number(config.port) || 22,
      username: config.username.trim(),
      password: config.password.trim() || null,
      privateKey: config.privateKey.trim() || null,
      passphrase: config.passphrase.trim() || null,
    }),
    [config],
  );

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
    const id = activeProfileId || crypto.randomUUID();
    const next = profiles.filter((profile) => profile.id !== id);
    next.unshift({ ...config, id, name });
    persistProfiles(next, id);
    setStatus("Profile saved.");
  };

  const handleSelectProfile = (profile) => {
    setActiveProfileId(profile.id);
    setConfig({ ...defaultConfig, ...profile });
    setStatus(`Selected: ${profile.name}`);
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

  const loadVideos = async () => {
    setBusy(true);
    setStatus("Fetching video list...");
    try {
      await invoke("set_active_config", { config: preparedConfig });
      const result = await invoke("list_videos", {
        config: preparedConfig,
        folder: config.folder.trim(),
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
      <ConnectScreen
        config={config}
        setConfig={setConfig}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onSelectProfile={handleSelectProfile}
        onDeleteProfile={handleDeleteProfile}
        onSaveProfile={handleSaveProfile}
        onConnect={loadVideos}
        busy={busy}
        status={status}
      />
    );
  }

  return (
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
  );
}

export default App;
