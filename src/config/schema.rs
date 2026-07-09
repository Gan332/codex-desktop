use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// OpenAI API Key
    pub api_key: String,
    /// 默认模型
    pub model: String,
    /// 默认工作目录
    pub work_dir: String,
    /// Shell 路径
    pub shell: String,
    /// 主题 (dark / light)
    pub theme: String,
    /// 服务端口
    pub port: u16,
}

impl Default for AppConfig {
    fn default() -> Self {
        let work_dir = dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        Self {
            api_key: String::new(),
            model: "o4-mini".into(),
            work_dir,
            shell: if cfg!(target_os = "windows") {
                "powershell".into()
            } else {
                "bash".into()
            },
            theme: "dark".into(),
            port: 9527,
        }
    }
}
