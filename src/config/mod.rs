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
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
                eprintln!("[Config] 配置文件解析失败 ({}), 使用默认配置: {}", path.display(), e);
                AppConfig::default()
            }),
            Err(e) => {
                eprintln!("[Config] 配置文件读取失败 ({}): {}", path.display(), e);
                AppConfig::default()
            }
        }
    } else {
        let cfg = AppConfig::default();
        save(&cfg);
        cfg
    }
}

/// 保存配置到文件，返回是否成功
pub fn save(cfg: &AppConfig) -> bool {
    let path = config_path();
    if let Some(parent) = path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            eprintln!("[Config] 创建配置目录失败 ({}): {}", parent.display(), e);
            return false;
        }
    }
    match serde_json::to_string_pretty(cfg) {
        Ok(json) => match fs::write(&path, json) {
            Ok(_) => true,
            Err(e) => {
                eprintln!("[Config] 配置文件写入失败 ({}): {}", path.display(), e);
                false
            }
        },
        Err(e) => {
            eprintln!("[Config] 配置序列化失败: {}", e);
            false
        }
    }
}
