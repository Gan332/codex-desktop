pub mod handler;
pub mod pty;

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

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

    pub fn get_output_rx(&self, session_id: &str) -> mpsc::Receiver<String> {
        // 创建一个通道用于转发输出
        let (tx, rx) = mpsc::channel(256);
        if let Some(session) = self.sessions.get(session_id) {
            // 将发送端克隆到会话的广播列表
            // 这里简化处理，实际应使用 broadcast channel
            let mut senders = session.output_broadcast.lock().unwrap();
            senders.push(tx);
        }
        rx
    }

    pub fn write_input(&self, session_id: &str, data: &str) {
        if let Some(session) = self.sessions.get(session_id) {
            session.write(data);
        }
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) {
        if let Some(session) = self.sessions.get(session_id) {
            session.resize(cols, rows);
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
