# Codex Desktop

封装 [OpenAI Codex CLI](https://github.com/openai/codex) 的高性能 Web 桌面应用。

## 特性

- 🖥️ **嵌入式终端** — 在浏览器中直接使用 Codex CLI，支持多标签页
- 📁 **文件浏览器** — 树形文件目录，点击即可预览文件内容
- ⚙️ **配置管理** — 图形化配置 API Key、模型参数、Shell 路径等
- 🎨 **主题切换** — 支持暗色/亮色主题
- 🔌 **实时连接** — WebSocket 双向通信，低延迟终端交互
- 📦 **单文件分发** — 编译为单个可执行文件，下载即用

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust + Axum + Tokio |
| 终端 | portable-pty + xterm.js |
| 前端 | 原生 JavaScript + TailwindCSS |
| 通信 | WebSocket + REST API |

## 快速开始

### 前置要求

- [Rust](https://www.rust-lang.org/tools/install) 1.75+
- [Node.js](https://nodejs.org/)（用于运行 Codex CLI）
- [Codex CLI](https://github.com/openai/codex) 已安装

### 编译

```bash
# 克隆项目
git clone <repo-url>
cd codex

# 编译发布版本（优化体积）
cargo build --release

# 编译后的二进制文件位于:
# target/release/codex-desktop.exe  (Windows)
# target/release/codex-desktop       (macOS/Linux)
```

### 运行

```bash
# 直接运行
./target/release/codex-desktop

# 或指定端口（修改配置文件 ~/.codex-desktop/config.json）
```

运行后自动打开浏览器访问 `http://localhost:9527`

## 使用说明

### 终端

- 点击 **+** 按钮创建新终端标签页
- 直接在终端中输入 Codex CLI 命令
- 支持多标签页并行运行

### 文件浏览器

- 左侧栏展示当前工作目录的文件树
- 点击文件夹展开/折叠
- 点击文件在终端中预览内容
- 支持文件名搜索

### 设置

- 点击右上角 **齿轮图标** 打开设置面板
- **API Key** — 你的 OpenAI API Key
- **模型** — 默认 AI 模型 (o4-mini, o3, gpt-4o, gpt-4o-mini)
- **工作目录** — 终端的默认工作路径
- **Shell** — 终端 Shell (PowerShell / CMD / Bash / Zsh)
- **端口** — Web 服务端口

## 项目结构

```
codex-desktop/
├── Cargo.toml                     # Rust 配置
├── src/
│   ├── main.rs                    # 入口
│   ├── server.rs                  # Web 路由 + 静态资源
│   ├── terminal/                  # 终端管理
│   │   ├── mod.rs                 # 会话管理器 + WebSocket 协议
│   │   ├── pty.rs                 # PTY 伪终端封装
│   │   └── handler.rs             # 消息处理辅助
│   ├── config/                    # 配置管理
│   │   ├── mod.rs                 # 配置读写
│   │   └── schema.rs              # 配置数据结构
│   ├── files/                     # 文件系统
│   │   ├── mod.rs                 # 文件操作 API
│   │   └── watcher.rs             # 文件监控
│   └── static/                    # 前端资源
│       ├── index.html
│       ├── css/app.css
│       └── js/                    # 模块化 JS
└── README.md
```

## WebSocket 协议

```json
// 终端输入
{ "type": "terminal_input", "session_id": "...", "data": "ls\n" }

// 终端输出
{ "type": "terminal_output", "session_id": "...", "data": "..." }

// 窗口尺寸
{ "type": "terminal_resize", "session_id": "...", "cols": 120, "rows": 40 }

// 创建/关闭终端
{ "type": "terminal_create", "session_id": "..." }
{ "type": "terminal_kill", "session_id": "..." }
```

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/config` | 获取配置 |
| POST | `/api/config` | 保存配置 |
| GET | `/api/files/list?path=` | 列出目录 |
| GET | `/api/files/read?path=` | 读取文件 |
| GET | `/api/files/search?path=&keyword=` | 搜索文件 |
| GET | `/api/sessions` | 列出会话 |

## License

MIT
