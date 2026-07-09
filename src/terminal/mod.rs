pub mod pty;

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

pub struct SessionManager {
    sessions: HashMap<String, pty::PtySession>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn create_session(&mut self, shell: &str, work_dir: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let session = pty::PtySession::spawn(shell, work_dir);
        self.sessions.insert(id.clone(), session);
        id
    }

    /// Subscribe to a session's output broadcast.
    /// Returns `None` if the session doesn't exist.
    pub fn get_output_rx(&self, session_id: &str) -> Option<broadcast::Receiver<String>> {
        self.sessions
            .get(session_id)
            .map(|session| session.output_tx.subscribe())
    }

    pub fn write_input(&self, session_id: &str, data: &str) {
        if let Some(session) = self.sessions.get(session_id) {
            session.write(data);
        }
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        match self.sessions.get(session_id) {
            Some(session) => session.resize(cols, rows),
            None => Err("session not found".into()),
        }
    }

    pub fn kill_session(&mut self, session_id: &str) {
        if let Some(mut session) = self.sessions.remove(session_id) {
            session.kill();
        }
    }

    pub fn list_ids(&self) -> Vec<String> {
        self.sessions.keys().cloned().collect()
    }
}

// ── WebSocket 消息协议 ────────────────────────────────────────

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
    // 前端 → 后端
    TerminalInput {
        session_id: String,
        data: String,
    },
    TerminalResize {
        session_id: String,
        cols: u16,
        rows: u16,
    },
    TerminalCreate {
        session_id: String,
    },
    TerminalKill {
        session_id: String,
    },

    // 后端 → 前端
    SessionCreated {
        session_id: String,
    },
    TerminalOutput {
        session_id: String,
        data: String,
    },
    Error {
        message: String,
    },
}
