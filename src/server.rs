use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query,
    },
    response::{Html, Json, IntoResponse},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

use crate::config;
use crate::files;
use crate::terminal::{self, SessionManager};

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

// ── 应用状态 ──────────────────────────────────────────────────
pub struct AppState {
    pub sessions: RwLock<SessionManager>,
    pub config: RwLock<config::AppConfig>,
}

pub fn build_router() -> Router {
    let state = Arc::new(AppState {
        sessions: RwLock::new(SessionManager::new()),
        config: RwLock::new(config::load()),
    });

    Router::new()
        // 前端静态资源
        .route("/", get(index_page))
        .route("/css/app.css", get(css_page))
        .route("/js/app.js", get(|_| async { js_response(JS_APP) }))
        .route("/js/terminal.js", get(|_| async { js_response(JS_TERMINAL) }))
        .route("/js/filetree.js", get(|_| async { js_response(JS_FILETREE) }))
        .route("/js/settings.js", get(|_| async { js_response(JS_SETTINGS) }))
        .route("/js/websocket.js", get(|_| async { js_response(JS_WEBSOCKET) }))
        .route("/js/layout.js", get(|_| async { js_response(JS_LAYOUT) }))
        .route("/js/utils.js", get(|_| async { js_response(JS_UTILS) }))
        // WebSocket 终端
        .route("/ws/terminal", get(ws_terminal_handler))
        // REST API
        .route("/api/config", get(get_config).post(save_config))
        .route("/api/files/list", get(list_directory))
        .route("/api/files/read", get(read_file))
        .route("/api/files/search", get(search_files))
        .route("/api/sessions", get(list_sessions))
        .route("/api/health", get(health_check))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

// ── 静态资源处理器 ────────────────────────────────────────────

fn js_response(js: &str) -> axum::response::Response {
    (
        [("content-type", "application/javascript; charset=utf-8")],
        js.to_string(),
    )
        .into_response()
}

async fn index_page() -> Html<&'static str> {
    Html(INDEX_HTML)
}

async fn css_page() -> impl IntoResponse {
    (
        [("content-type", "text/css; charset=utf-8")],
        APP_CSS.to_string(),
    )
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

    // 创建新的终端会话
    let session_id = {
        let mut sessions = state.sessions.write().await;
        let cfg = state.config.read().await;
        sessions.create_session(&cfg.shell, &cfg.work_dir)
    };

    // 通知前端会话 ID
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&terminal::WsMessage::SessionCreated {
                session_id: session_id.clone(),
            })
            .unwrap()
            .into(),
        ))
        .await;

    // 获取输出接收器
    let mut output_rx = {
        let sessions = state.sessions.read().await;
        sessions.get_output_rx(&session_id)
    };

    // 双向消息转发
    let state_clone = state.clone();
    let sid = session_id.clone();

    // 读取任务：PTY 输出 → WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Some(Ok(data)) = output_rx.recv().await {
            let msg = terminal::WsMessage::TerminalOutput {
                session_id: sid.clone(),
                data,
            };
            if sender
                .send(Message::Text(
                    serde_json::to_string(&msg).unwrap().into(),
                ))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // 写入任务：WebSocket 输入 → PTY
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.recv().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(ws_msg) = serde_json::from_str::<terminal::WsMessage>(&text) {
                        match ws_msg {
                            terminal::WsMessage::TerminalInput {
                                session_id,
                                data,
                            } => {
                                let sessions = state_clone.sessions.read().await;
                                sessions.write_input(&session_id, &data);
                            }
                            terminal::WsMessage::TerminalResize {
                                session_id,
                                cols,
                                rows,
                            } => {
                                let sessions = state_clone.sessions.read().await;
                                sessions.resize(&session_id, cols, rows);
                            }
                            terminal::WsMessage::TerminalKill { session_id } => {
                                let mut sessions = state_clone.sessions.write().await;
                                sessions.kill_session(&session_id);
                                break;
                            }
                            _ => {}
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // 任一任务结束则清理
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    // 清理会话
    let mut sessions = state.sessions.write().await;
    sessions.kill_session(&session_id);
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

async fn get_config(State(state): State<Arc<AppConfig>>) -> Json<config::AppConfig> {
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
) -> Json<config::AppConfig> {
    let mut cfg = state.config.write().await;
    if let Some(v) = update.api_key { cfg.api_key = v; }
    if let Some(v) = update.model { cfg.model = v; }
    if let Some(v) = update.work_dir { cfg.work_dir = v; }
    if let Some(v) = update.shell { cfg.shell = v; }
    if let Some(v) = update.theme { cfg.theme = v; }
    if let Some(v) = update.port { cfg.port = v; }
    config::save(&cfg);
    Json(cfg.clone())
}

#[derive(Deserialize)]
struct ListQuery {
    path: Option<String>,
}

async fn list_directory(Query(query): Query<ListQuery>) -> impl IntoResponse {
    let path = query.path.unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    match files::list_dir(&path) {
        Ok(entries) => Json(serde_json::to_value(entries).unwrap()),
        Err(e) => Json(serde_json::json!({ "error": e.to_string() })),
    }
}

#[derive(Deserialize)]
struct ReadQuery {
    path: String,
}

async fn read_file(Query(query): Query<ReadQuery>) -> impl IntoResponse {
    match files::read_file(&query.path) {
        Ok(content) => Json(serde_json::json!({ "content": content })),
        Err(e) => Json(serde_json::json!({ "error": e.to_string() })),
    }
}

#[derive(Deserialize)]
struct SearchQuery {
    path: Option<String>,
    keyword: String,
}

async fn search_files(Query(query): Query<SearchQuery>) -> impl IntoResponse {
    let base = query.path.unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    match files::search(&base, &query.keyword) {
        Ok(results) => Json(serde_json::to_value(results).unwrap()),
        Err(e) => Json(serde_json::json!({ "error": e.to_string() })),
    }
}

async fn list_sessions(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let sessions = state.sessions.read().await;
    let ids: Vec<String> = sessions.list_ids();
    Json(serde_json::json!({ "sessions": ids }))
}
