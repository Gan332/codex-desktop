use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::task;

pub struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// Broadcast channel: PTY output → all WS listeners
    pub output_tx: broadcast::Sender<String>,
    master: Option<Box<dyn MasterPty + Send>>,
    _reader_handle: task::JoinHandle<()>,
    child: Option<Box<dyn Child>>,
}

impl PtySession {
    pub fn spawn(shell: &str, work_dir: &str) -> Result<Self, String> {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 40,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("PTY 创建失败: {}", e))?;

        let mut cmd = if cfg!(target_os = "windows") {
            match shell {
                "powershell" | "" => CommandBuilder::new("powershell.exe"),
                "cmd" => CommandBuilder::new("cmd.exe"),
                other => CommandBuilder::new(other),
            }
        } else if shell.is_empty() {
            CommandBuilder::new("bash")
        } else {
            CommandBuilder::new(shell)
        };

        cmd.cwd(work_dir);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("PTY 子进程启动失败: {}", e))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("PTY reader 克隆失败: {}", e))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("PTY writer 获取失败: {}", e))?;
        let master: Option<Box<dyn MasterPty + Send>> = Some(pair.master);

        let writer = Arc::new(Mutex::new(writer));
        let (output_tx, _) = broadcast::channel(256);

        let reader_tx = output_tx.clone();
        let reader_handle = task::spawn_blocking(move || {
            let mut buf = [0u8; 8192];
            loop {
                match (&mut reader as &mut dyn Read).read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = reader_tx.send(data);
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(Self {
            writer,
            output_tx,
            master,
            _reader_handle: reader_handle,
            child: Some(child),
        })
    }

    pub fn write(&self, data: &str) {
        if let Ok(mut w) = self.writer.lock() {
            let _ = w.write_all(data.as_bytes());
            let _ = w.flush();
        }
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        if let Some(master) = &self.master {
            master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string())
        } else {
            Err("master handle not available".into())
        }
    }

    pub fn kill(&mut self) {
        self.master = None;
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
        }
    }
}
