use portable_pty::{ChildKiller, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
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
    child_killer: Option<Box<dyn ChildKiller + Send>>,
}

impl PtySession {
    pub fn spawn(shell: &str, work_dir: &str) -> Self {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 40,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();

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

        let child = pair.slave.spawn_command(cmd).unwrap();
        let reader = pair.master.try_clone_reader().unwrap();
        let writer = pair.master.take_writer().unwrap();
        let killer = child.try_into_killer().ok();
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

        Self {
            writer,
            output_tx,
            master,
            _reader_handle: reader_handle,
            child_killer: killer,
        }
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
        if let Some(killer) = self.child_killer.take() {
            let _ = killer.kill();
        }
    }
}
