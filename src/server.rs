use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, CancellationToken, RwLock};
use tower_http::cors::{Any, CorsLayer};

use crate::config;
use crate::files;
use crate::terminal;

// ── 内嵌前端资源 ──────────────────────────────────────────────
const INDEX_HTML: &str = include_str!("static/index.html");
const APP_CSS: &str = include_str!("static/css/app.css");
const JS_APP: &str = include_str!("static/js/app.js");
const JS_TERMINAL: &str = include_str!("static/js/terminal.js");
const JS_FILETREE: &str = include_str!("static/js/filetree.js");
const JS_SETTINGS: &str = include_str!("static/js/settings.js");
const JS_WEBSOCKET: &str = include_str!("static/js/websocket.js");
const JS_LAYOUT: &str = include_str!("static/js/layout.js");
const JS_UTILS: &str = include_str!("static/js/utils.js");
const VENDOR_XTERM_CSS: &str = include_str!("static/vendor/xterm.min.css");
const VENDOR_XTERM_JS: &str = include_str!("static/vendor/xterm.min.js");
const VENDOR_FIT_JS: &str = include_str!("static/vendor/addon-fit.min.js");
const VENDOR_WEBLINKS_JS: &str = include_str!("static/vendor/addon-web-links.min.js");
const VENDOR_TAILWIND_JS: &str = include_str!("static/vendor/tailwind.min.js");

// ── 应用状态 ──────────────────────────────────────────────────
pub struct AppState {
    pub sessions: RwLock<terminal::SessionManager>,
    pub config: RwLock<config::AppConfig>,
}

pub fn build_router(cfg: config::AppConfig) -> Router {
    let port = cfg.port;
    let state = Arc::new(AppState {
        sessions: RwLock::new(terminal::SessionManager::new()),
        config: RwLock::new(cfg),
    });

    let cors = CorsLayer::new()
        .allow_origin(vec![
            format!("http://localhost:{}", port).parse().unwrap(),
            format!("http://127.0.0.1:{}", port).parse().unwrap(),
        ])
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/", get(index_page))
        .route("/css/app.css", get(css_page))
        .route("/js/{*path}", get(js_handler))
        // Vendor static files (served from filesystem for size)
        .route("/vendor/{*path}", get(vendor_handler))
        .route("/ws/terminal", get(ws_terminal_handler))
        .route("/api/config", get(get_config).post(save_config))
        .route("/api/files/list", get(list_directory))
        .route("/api/files/read", get(read_file))
        .route("/api/files/search", get(search_files))
        .route("/api/sessions", get(list_sessions))
        .route("/api/health", get(health_check))
        .layer(cors)
        .with_state(state)
}

// ── 静态资源处理器 ────────────────────────────────────────────

async fn index_page() -> Html<&'static str> {
    Html(INDEX_HTML)
}

async fn css_page() -> impl IntoResponse {
    (
        [("content-type", "text/css; charset=utf-8")],
        APP_CSS.to_string(),
    )
}

async fn js_handler(axum::extract::Path(path): axum::extract::Path<String>) -> impl IntoResponse {
    let content: &str = match path.as_str() {
        "app.js" => JS_APP,
        "terminal.js" => JS_TERMINAL,
        "filetree.js" => JS_FILETREE,
        "settings.js" => JS_SETTINGS,
        "websocket.js" => JS_WEBSOCKET,
        "layout.js" => JS_LAYOUT,
        "utils.js" => JS_UTILS,
        _ => return ([("content-type", "text/plain")], "Not Found".to_string()).into_response(),
    };
    (
        [("content-type", "application/javascript; charset=utf-8")],
        content.to_string(),
    )
        .into_response()
}

async fn vendor_handler(
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl IntoResponse {
    let (content, content_type): (&str, &str) = match path.as_str() {
        "xterm.min.css" => (VENDOR_XTERM_CSS, "text/css"),
        "xterm.min.js" => (VENDOR_XTERM_JS, "application/javascript"),
        "addon-fit.min.js" => (VENDOR_FIT_JS, "application/javascript"),
        "addon-web-links.min.js" => (VENDOR_WEBLINKS_JS, "application/javascript"),
        "tailwind.min.js" => (VENDOR_TAILWIND_JS, "application/javascript"),
        _ => return ([("content-type", "text/plain")], "Not Found".to_string()).into_response(),
    };
    (
        [("content-type", format!("{}; charset=utf-8", content_type))],
        content.to_string(),
    )
        .into_response()
}

// ── 内部消息：WS 发送任务从不同来源收消息 ────────────────────
enum WsSendMsg {
    Output { session_id: String, data: String },
    SessionCreated { session_id: String },
    Error { session_id: String, data: String },
}

// ── WebSocket 终端 ────────────────────────────────────────────

async fn ws_terminal_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_terminal_ws(socket, state))
}

async fn handle_terminal_ws(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // 内部 channel：所有 session 的输出 + 事件 → WS 发送任务
    let (shared_tx, mut shared_rx) = mpsc::unbounded_channel::<WsSendMsg>();

    // 不在此处初始创建会话 —— 由前端发起的 terminal_create 消息驱动

    // 发送任务：内部消息 → WS
    let send_task = tokio::spawn(async move {
        while let Some(internal) = shared_rx.recv().await {
            let ws_msg: terminal::WsMessage = match internal {
                WsSendMsg::Output { session_id, data } => {
                    terminal::WsMessage::TerminalOutput { session_id, data }
                }
                WsSendMsg::SessionCreated { session_id } => {
                    terminal::WsMessage::SessionCreated { session_id }
                }
                WsSendMsg::Error { session_id, data } => {
                    terminal::WsMessage::Error {
                        message: if session_id.is_empty() {
                            data
                        } else {
                            format!("[{}] {}", session_id, data)
                        },
                    }
                }
            };
            if sender
                .send(Message::Text(
                    serde_json::to_string(&ws_msg).unwrap().into(),
                ))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // 接收任务：WS → dispatch
    let state2 = state.clone();
    let tx_for_recv = shared_tx.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.recv().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(ws_msg) = serde_json::from_str::<terminal::WsMessage>(&text) {
                        handle_ws_message(ws_msg, &state2, &tx_for_recv).await;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // 任一任务结束则全部清理
    tokio::select! {
        _ = send_task => recv_task.abort(),
        _ = recv_task => send_task.abort(),
    }

    // ── WebSocket 断开后清理所有关联的 session ──
    let mut mgr = state.sessions.write().await;
    mgr.kill_all();
}

/// 将 broadcast::Receiver 的输出转发到内部 channel
/// 支持 CancellationToken 用于外部取消
async fn forward_output(
    session_id: String,
    mut rx: broadcast::Receiver<String>,
    tx: mpsc::UnboundedSender<WsSendMsg>,
    cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            result = rx.recv() => {
                match result {
                    Ok(data) => {
                        if tx
                            .send(WsSendMsg::Output {
                                session_id: session_id.clone(),
                                data,
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                }
            }
        }
    }
}

async fn handle_ws_message(
    msg: terminal::WsMessage,
    state: &Arc<AppState>,
    shared_tx: &mpsc::UnboundedSender<WsSendMsg>,
) {
    match msg {
        terminal::WsMessage::TerminalInput { session_id, data } => {
            let sessions = state.sessions.read().await;
            sessions.write_input(&session_id, &data);
        }
        terminal::WsMessage::TerminalResize {
            session_id,
            cols,
            rows,
        } => {
            let sessions = state.sessions.read().await;
            let _ = sessions.resize(&session_id, cols, rows);
        }
        terminal::WsMessage::TerminalCreate { .. } => {
            let (sid, cancel_token) = {
                let cfg = state.config.read().await;
                let mut mgr = state.sessions.write().await;
                match mgr.create_session(&cfg.shell, &cfg.work_dir) {
                    Ok(sid) => {
                        let token = mgr.get_cancel_token(&sid).unwrap_or_default();
                        (Some(sid), token)
                    }
                    Err(e) => {
                        let _ = shared_tx.send(WsSendMsg::Error {
                            session_id: String::new(),
                            data: e,
                        });
                        (None, CancellationToken::new())
                    }
                }
            };
            if let Some(sid) = sid {
                // Notify frontend about the new session
                let _ = shared_tx.send(WsSendMsg::SessionCreated {
                    session_id: sid.clone(),
                });
                // Start forwarding output with cancellation support
                if let Some(rx) = state.sessions.read().await.get_output_rx(&sid) {
                    let tx = shared_tx.clone();
                    tokio::spawn(async move {
                        forward_output(sid, rx, tx, cancel_token).await;
                    });
                }
            }
        }
        terminal::WsMessage::TerminalKill { session_id } => {
            let mut sessions = state.sessions.write().await;
            sessions.kill_session(&session_id);
        }
        _ => {}
    }
}

// ── REST API 处理器 ────────────────────────────────────────────

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    })
}

async fn get_config(State(state): State<Arc<AppState>>) -> Json<config::AppConfig> {
    let cfg = state.config.read().await;
    Json(cfg.clone())
}

#[derive(Deserialize)]
struct ConfigUpdate {
    api_key: Option<String>,
    model: Option<String>,
    work_dir: Option<String>,
    shell: Option<String>,
    theme: Option<String>,
    port: Option<u16>,
}

async fn save_config(
    State(state): State<Arc<AppState>>,
    Json(update): Json<ConfigUpdate>,
) -> Json<serde_json::Value> {
    let mut cfg = state.config.write().await;
    if let Some(v) = update.api_key {
        cfg.api_key = v;
    }
    if let Some(v) = update.model {
        cfg.model = v;
    }
    if let Some(v) = update.work_dir {
        cfg.work_dir = v;
    }
    if let Some(v) = update.shell {
        cfg.shell = v;
    }
    if let Some(v) = update.theme {
        cfg.theme = v;
    }
    if let Some(v) = update.port {
        cfg.port = v;
    }
    let saved = config::save(&cfg);
    let mut response = serde_json::json!(cfg.clone());
    response["saved"] = serde_json::json!(saved);
    Json(response)
}

/// 路径遍历防护：canonicalize 后校验路径必须在 base_dir 范围内，
/// 防止通过绝对路径、`..` 或符号链接越权访问系统敏感文件。
fn sanitize_path(path: &str, base_dir: &str) -> Result<String, String> {
    use std::path::Path;

    let base_canonical = Path::new(base_dir)
        .canonicalize()
        .map_err(|e| format!("工作目录无效: {}", e))?;

    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("路径无效: {}", e))?;

    if !canonical.starts_with(&base_canonical) {
        return Err("路径越界：不允许访问工作目录以外的文件".into());
    }

    Ok(canonical.to_string_lossy().to_string())
}

#[derive(Deserialize)]
struct ListQuery {
    path: Option<String>,
}

async fn list_directory(
    Query(query): Query<ListQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let work_dir = state.config.read().await.work_dir.clone();
    let raw_path = query.path.unwrap_or_else(|| work_dir.clone());
    let path = match sanitize_path(&raw_path, &work_dir) {
        Ok(p) => p,
        Err(e) => return Json(serde_json::json!({ "error": e })),
    };
    match files::list_dir(&path) {
        Ok(entries) => Json(serde_json::to_value(entries).unwrap()),
        Err(e) => Json(serde_json::json!({ "error": e })),
    }
}

#[derive(Deserialize)]
struct ReadQuery {
    path: String,
}

async fn read_file(
    Query(query): Query<ReadQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let work_dir = state.config.read().await.work_dir.clone();
    let path = match sanitize_path(&query.path, &work_dir) {
        Ok(p) => p,
        Err(e) => return Json(serde_json::json!({ "error": e })),
    };
    match files::read_file(&path) {
        Ok(content) => Json(serde_json::json!({ "content": content })),
        Err(e) => Json(serde_json::json!({ "error": e })),
    }
}

#[derive(Deserialize)]
struct SearchQuery {
    path: Option<String>,
    keyword: String,
}

async fn search_files(
    Query(query): Query<SearchQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let work_dir = state.config.read().await.work_dir.clone();
    let raw_path = query.path.unwrap_or_else(|| work_dir.clone());
    let base = match sanitize_path(&raw_path, &work_dir) {
        Ok(p) => p,
        Err(e) => return Json(serde_json::json!({ "error": e })),
    };
    match files::search(&base, &query.keyword) {
        Ok(results) => Json(serde_json::to_value(results).unwrap()),
        Err(e) => Json(serde_json::json!({ "error": e })),
    }
}

async fn list_sessions(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let sessions = state.sessions.read().await;
    let ids: Vec<String> = sessions.list_ids();
    Json(serde_json::json!({ "sessions": ids }))
}
