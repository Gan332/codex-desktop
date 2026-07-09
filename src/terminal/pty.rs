use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::task;

pub struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub output_broadcast: Arc<Mutex<Vec<mpsc::Sender<String>>>>,
    _reader_handle: task::JoinHandle<()>,
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

        // 根据平台选择 shell
        let mut cmd = if cfg!(target_os = "windows") {
            if shell == "powershell" || shell.is_empty() {
                CommandBuilder::new("powershell.exe")
            } else if shell == "cmd" {
                CommandBuilder::new("cmd.exe")
            } else {
                CommandBuilder::new(shell)
            }
        } else {
            if shell.is_empty() {
                CommandBuilder::new("bash")
            } else {
                CommandBuilder::new(shell)
            }
        };

        cmd.cwd(work_dir);

        let child = pair.slave.spawn_command(cmd).unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let writer = pair.master.take_writer().unwrap();

        let writer = Arc::new(Mutex::new(writer));
        let output_broadcast = Arc::new(Mutex::new(Vec::<mpsc::Sender<String>>::new()));
        let broadcast_clone = output_broadcast.clone();

        let reader_handle = task::spawn_blocking(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let senders = broadcast_clone.lock().unwrap();
                        for sender in senders.iter() {
                            let _ = sender.try_send(data.clone());
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        // 保存 child 进程句柄（用于清理）
        let _child = child;

        Self {
            writer,
            output_broadcast,
            _reader_handle: reader_handle,
        }
    }

    pub fn write(&self, data: &str) {
        if let Ok(mut w) = self.writer.lock() {
            let _ = w.write_all(data.as_bytes());
            let _ = w.flush();
        }
    }

    pub fn resize(&self, cols: u16, rows: u16) {
        // resize 操作需要通过 master handle 执行
        // portable-pty 的 resize 在不同平台处理方式不同
        // 这里简化处理
    }

    pub fn kill(&mut self) {
        // 清理所有发送者以关闭接收端
        if let Ok(mut senders) = self.output_broadcast.lock() {
            senders.clear();
        }
    }
}
