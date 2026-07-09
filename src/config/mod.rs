pub mod schema;

pub use schema::AppConfig;

use std::fs;
use std::path::PathBuf;

/// 获取配置文件路径: ~/.codex-desktop/config.json
fn config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".codex-desktop").join("config.json")
}

/// 加载配置，如果不存在则返回默认值
pub fn load() -> AppConfig {
    let path = config_path();
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => AppConfig::default(),
        }
    } else {
        let cfg = AppConfig::default();
        save(&cfg);
        cfg
    }
}

/// 保存配置到文件
pub fn save(cfg: &AppConfig) {
    let path = config_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(path, json);
    }
}
