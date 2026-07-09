// files/watcher.rs — 文件系统监控（预留接口）
// 使用 notify crate 监控目录变更
// 当前端连接 WebSocket 时可订阅文件变更事件
// TODO: 集成到 WebSocket 会话中，向所有客户端广播文件变更

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use tokio::sync::mpsc;

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
}

impl FileWatcher {
    pub fn new() -> (Self, mpsc::Receiver<Event>) {
        let (tx, rx) = mpsc::channel(64);

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.try_send(event);
                }
            },
            Config::default(),
        )
        .unwrap();

        (Self { _watcher: watcher }, rx)
    }

    pub fn watch(&mut self, path: &Path) -> Result<(), String> {
        self._watcher
            .watch(path, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())
    }

    pub fn unwatch(&mut self, path: &Path) -> Result<(), String> {
        self._watcher.unwatch(path).map_err(|e| e.to_string())
    }
}
