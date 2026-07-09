// terminal/handler.rs — WebSocket 消息处理辅助工具
// 消息协议定义在 terminal/mod.rs 的 WsMessage 枚举中
// 此文件包含消息验证和转换的辅助函数

use super::WsMessage;

/// 验证终端输入数据是否安全
pub fn validate_input(data: &str) -> bool {
    // 基本安全检查：限制输入长度
    data.len() <= 65536
}

/// 格式化终端输出用于调试日志
pub fn format_output_for_log(data: &str) -> String {
    if data.len() > 200 {
        format!("{}...(len={})", &data[..200], data.len())
    } else {
        data.to_string()
    }
}
