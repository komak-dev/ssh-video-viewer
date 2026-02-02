use base64::Engine;
use serde::Deserialize;
use ssh2::Session;
use std::io::{Read, Seek, SeekFrom};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;

use tauri::http::{header, response::Builder as ResponseBuilder, Response, StatusCode};
use tauri::Manager;

struct StreamState {
    config: Mutex<Option<SshConfig>>,
    version: AtomicU64,
    workers: Mutex<std::collections::HashMap<String, WorkerHandle>>,
}

impl Default for StreamState {
    fn default() -> Self {
        Self {
            config: Mutex::new(None),
            version: AtomicU64::new(0),
            workers: Mutex::new(std::collections::HashMap::new()),
        }
    }
}

struct WorkerHandle {
    version: u64,
    sender: mpsc::Sender<WorkerMessage>,
}

enum WorkerMessage {
    Read {
        range: Option<String>,
        responder: tauri::UriSchemeResponder,
    },
    Shutdown,
}

#[derive(Deserialize, Clone)]
struct SshConfig {
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
}

fn connect_ssh(config: &SshConfig) -> Result<Session, String> {
    let tcp = TcpStream::connect((config.host.as_str(), config.port))
        .map_err(|e| format!("Failed to connect: {e}"))?;
    let mut session = Session::new().map_err(|e| format!("Failed to create SSH session: {e}"))?;
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|e| format!("SSH handshake failed: {e}"))?;

    if let Some(private_key) = config.private_key.as_deref() {
        session
            .userauth_pubkey_memory(
                config.username.as_str(),
                None,
                private_key,
                config.passphrase.as_deref(),
            )
            .map_err(|e| format!("SSH key auth failed: {e}"))?;
    } else if let Some(password) = config.password.as_deref() {
        session
            .userauth_password(config.username.as_str(), password)
            .map_err(|e| format!("SSH password auth failed: {e}"))?;
    } else {
        return Err("Provide a password or private key for authentication.".to_string());
    }

    Ok(session)
}

fn is_video_path(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    matches!(
        ext.to_lowercase().as_str(),
        "mp4" | "mkv" | "mov" | "webm" | "avi" | "m4v"
    )
}

fn map_content_type(path: &str) -> &'static str {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    match extension.as_str() {
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        _ => "application/octet-stream",
    }
}

fn parse_stream_path(uri: &str) -> Result<String, String> {
    let Some(rest) = uri.strip_prefix("sshvideo://stream/") else {
        return Err("Invalid stream URI.".to_string());
    };
    let encoded = rest.split('?').next().unwrap_or(rest);
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "Invalid stream path encoding.".to_string())?;
    String::from_utf8(decoded).map_err(|_| "Stream path is not valid UTF-8.".to_string())
}

const DEFAULT_CHUNK_SIZE: u64 = 2 * 1024 * 1024;

fn parse_range_header(value: &str, total: u64) -> Option<(u64, u64)> {
    let value = value.trim();
    if !value.starts_with("bytes=") {
        return None;
    }
    let range = value.trim_start_matches("bytes=").trim();
    let mut parts = range.split('-');
    let start_part = parts.next()?.trim();
    let end_part = parts.next().unwrap_or("").trim();

    let start = start_part.parse::<u64>().ok()?;
    let end = if end_part.is_empty() {
        total.saturating_sub(1)
    } else {
        end_part.parse::<u64>().ok()?
    };

    if start > end || start >= total {
        None
    } else {
        Some((start, end.min(total.saturating_sub(1))))
    }
}

#[tauri::command]
fn set_active_config(
    state: tauri::State<StreamState>,
    config: SshConfig,
) -> Result<(), String> {
    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Failed to lock config state.".to_string())?;
    *guard = Some(config);
    state.version.fetch_add(1, Ordering::SeqCst);

    let mut workers = state
        .workers
        .lock()
        .map_err(|_| "Failed to lock workers state.".to_string())?;
    for (_, handle) in workers.drain() {
        let _ = handle.sender.send(WorkerMessage::Shutdown);
    }
    Ok(())
}

#[tauri::command]
fn list_videos(
    state: tauri::State<StreamState>,
    config: SshConfig,
    folder: String,
) -> Result<Vec<String>, String> {
    {
        let mut guard = state
            .config
            .lock()
            .map_err(|_| "Failed to lock config state.".to_string())?;
        *guard = Some(config.clone());
    }
    let session = connect_ssh(&config)?;
    let sftp = session
        .sftp()
        .map_err(|e| format!("Failed to start SFTP: {e}"))?;
    let folder_path = if folder.trim().is_empty() {
        PathBuf::from(".")
    } else {
        PathBuf::from(folder.trim())
    };

    let entries = sftp
        .readdir(&folder_path)
        .map_err(|e| format!("Failed to read folder: {e}"))?;

    let mut files: Vec<String> = entries
        .into_iter()
        .filter_map(|(path, _)| {
            if is_video_path(&path) {
                path.to_str().map(|value| value.to_string())
            } else {
                None
            }
        })
        .collect();

    files.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));

    Ok(files)
}

fn stream_video_response_from_file(
    remote: &mut ssh2::File,
    remote_path: &str,
    total_size: u64,
    range: Option<&str>,
) -> Result<Response<Vec<u8>>, String> {
    if total_size == 0 {
        return Err("Remote file is empty or size unavailable.".to_string());
    }

    let (start, end, is_partial) = match range.and_then(|value| parse_range_header(value, total_size))
    {
        Some((start, end)) => (start, end, true),
        None => {
            let end = (DEFAULT_CHUNK_SIZE.saturating_sub(1)).min(total_size.saturating_sub(1));
            (0, end, true)
        }
    };

    remote
        .seek(SeekFrom::Start(start))
        .map_err(|e| format!("Failed to seek remote file: {e}"))?;

    let mut buffer = Vec::with_capacity((end - start + 1) as usize);
    let mut limited = remote.take(end - start + 1);
    limited
        .read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read remote file: {e}"))?;

    let mut builder = ResponseBuilder::new();
    let status = if is_partial {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{}", start, end, total_size),
        );
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };

    builder
        .status(status)
        .header(header::CONTENT_TYPE, map_content_type(remote_path))
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, buffer.len().to_string())
        .header(header::CACHE_CONTROL, "no-store")
        .body(buffer)
        .map_err(|e| format!("Failed to build response: {e}"))
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(StreamState::default())
        .register_asynchronous_uri_scheme_protocol("sshvideo", |ctx, request, responder| {
            let uri = request.uri().to_string();
            let remote_path = match parse_stream_path(&uri) {
                Ok(path) => path,
                Err(error) => {
                    responder.respond(
                        ResponseBuilder::new()
                            .status(StatusCode::BAD_REQUEST)
                            .body(error.into_bytes())
                            .unwrap(),
                    );
                    return;
                }
            };

            let range = request
                .headers()
                .get(header::RANGE)
                .and_then(|value| value.to_str().ok())
                .map(|value| value.to_string());

            let state = ctx.app_handle().state::<StreamState>();
            let config = {
                let guard = state.config.lock();
                let Ok(guard) = guard else {
                    responder.respond(
                        ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .body(b"Failed to access config state.".to_vec())
                            .unwrap(),
                    );
                    return;
                };
                guard.clone()
            };

            let Some(config) = config else {
                responder.respond(
                    ResponseBuilder::new()
                        .status(StatusCode::UNAUTHORIZED)
                        .body(b"SSH config not set.".to_vec())
                        .unwrap(),
                );
                return;
            };

            let version = state.version.load(Ordering::SeqCst);
            let sender = {
                let mut workers = match state.workers.lock() {
                    Ok(guard) => guard,
                    Err(_) => {
                        responder.respond(
                            ResponseBuilder::new()
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .body(b"Failed to lock workers.".to_vec())
                                .unwrap(),
                        );
                        return;
                    }
                };
                let needs_new = match workers.get(&remote_path) {
                    Some(handle) => handle.version != version,
                    None => true,
                };
                if needs_new {
                    let (tx, rx) = mpsc::channel::<WorkerMessage>();
                    let path_clone = remote_path.clone();
                    let config_clone = config.clone();
                    thread::spawn(move || stream_worker_loop(config_clone, path_clone, rx));
                    workers.insert(
                        remote_path.clone(),
                        WorkerHandle {
                            version,
                            sender: tx.clone(),
                        },
                    );
                    tx
                } else {
                    workers
                        .get(&remote_path)
                        .map(|handle| handle.sender.clone())
                        .unwrap()
                }
            };

            if let Err(error) = sender.send(WorkerMessage::Read { range, responder }) {
                if let WorkerMessage::Read { responder, .. } = error.0 {
                    responder.respond(
                        ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .body(b"Stream worker unavailable.".to_vec())
                            .unwrap(),
                    );
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet, list_videos, set_active_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn stream_worker_loop(config: SshConfig, remote_path: String, rx: mpsc::Receiver<WorkerMessage>) {
    let session = match connect_ssh(&config) {
        Ok(session) => session,
        Err(error) => {
            for message in rx {
                if let WorkerMessage::Read { responder, .. } = message {
                    responder.respond(
                        ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .body(error.clone().into_bytes())
                            .unwrap(),
                    );
                }
            }
            return;
        }
    };

    let sftp = match session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            let error = format!("Failed to start SFTP: {error}");
            for message in rx {
                if let WorkerMessage::Read { responder, .. } = message {
                    responder.respond(
                        ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .body(error.clone().into_bytes())
                            .unwrap(),
                    );
                }
            }
            return;
        }
    };

    let total_size = match sftp.stat(Path::new(&remote_path)) {
        Ok(stat) => stat.size.unwrap_or(0),
        Err(error) => {
            let error = format!("Failed to stat remote file: {error}");
            for message in rx {
                if let WorkerMessage::Read { responder, .. } = message {
                    responder.respond(
                        ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .body(error.clone().into_bytes())
                            .unwrap(),
                    );
                }
            }
            return;
        }
    };

    let mut remote = match sftp.open(Path::new(&remote_path)) {
        Ok(file) => file,
        Err(error) => {
            let error = format!("Failed to open remote file: {error}");
            for message in rx {
                if let WorkerMessage::Read { responder, .. } = message {
                    responder.respond(
                        ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .body(error.clone().into_bytes())
                            .unwrap(),
                    );
                }
            }
            return;
        }
    };

    for message in rx {
        match message {
            WorkerMessage::Shutdown => break,
            WorkerMessage::Read { range, responder } => {
                let response = match stream_video_response_from_file(
                    &mut remote,
                    &remote_path,
                    total_size,
                    range.as_deref(),
                ) {
                    Ok(response) => response,
                    Err(error) => ResponseBuilder::new()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .body(error.into_bytes())
                        .unwrap(),
                };
                responder.respond(response);
            }
        }
    }
}
