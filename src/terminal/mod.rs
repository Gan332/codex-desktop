pub mod pty;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::{broadcast, CancellationToken};

pub struct SessionManager {
    sessions: HashMap<String, pty::PtySession>,
    /// Map session_id → CancellationToken for forward tasks
    cancel_tokens: HashMap<String, CancellationToken>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            cancel_tokens: HashMap::new(),
        }
    }

    pub fn create_session(&mut self, shell: &str, work_dir: &str) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let session = pty::PtySession::spawn(shell, work_dir)?;
        let token = CancellationToken::new();
        self.cancel_tokens.insert(id.clone(), token);
        self.sessions.insert(id.clone(), session);
        Ok(id)
    }

    /// Get the cancellation token for a session, if it exists.
    pub fn get_cancel_token(&self, session_id: &str) -> Option<CancellationToken> {
        self.cancel_tokens.get(session_id).cloned()
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
        // Cancel the forward task first
        if let Some(token) = self.cancel_tokens.remove(session_id) {
            token.cancel();
        }
        if let Some(mut session) = self.sessions.remove(session_id) {
            session.kill();
        }
    }

    /// Kill all sessions (used on WebSocket disconnect / graceful shutdown).
    pub fn kill_all(&mut self) {
        // Cancel all forward tasks
        for (_id, token) in self.cancel_tokens.drain() {
            token.cancel();
        }
        for (_id, mut session) in self.sessions.drain() {
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
