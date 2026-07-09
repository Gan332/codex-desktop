## 完整优化计划：Codex Desktop

### 第一阶段：修复严重 Bug（6 个文件改动）

**目标：消除崩溃和泄漏风险**

1. **`src/pty.rs`** — 错误传播改造
   - `spawn()` 返回类型从 `Self` → `Result<Self, String>`
   - 4 处 `unwrap()` 替换为 `?`
   
2. **`src/terminal/mod.rs`** — Session 创建健壮化
   - `create_session` 返回 `Result<String, String>`
   - 添加 `CancelToken` 字段管理 forward task
   
3. **`src/server.rs`** — 资源泄漏修复
   - WS 断开时自动 kill 所有关联 session
   - forward_output 支持取消令牌（CancellationToken）
   - `TerminalCreate` 失败时发送 Error 消息至前端

### 第二阶段：增强可靠性（4 个文件改动）

**目标：防御性编程**

4. **`src/server.rs`** — 路径遍历防护
   - 文件 API 统一做 `canonicalize()` 标准化
   - 拒绝包含 `..` 或启动驱动器之外的路径
   
5. **`src/config/mod.rs`** — 错误可见性
   - 保存/读取失败时记录日志（eprintln!），不再静默吞错误
   - `load()` 中若 JSON 解析失败返回错误提示

6. **`src/files/mod.rs`** — 搜索深度参数化
   - `max_depth` 从硬编码 8 改为 12
   - 支持自定义路径参数

7. **`src/server.rs` + `src/terminal/mod.rs`** — Session 生命周期管理
   - `kill_session` 触发 CancellationToken 取消 forward task
   - 添加 `active_sessions` 计数清理

### 第三阶段：UI/UX 优化（5 个前端文件改动）

**目标：更好的用户体验**

8. **`src/static/js/terminal.js`**
   - 修复标签计数：`this.sessions.size` → `this.sessions.size + 1` 改为标签创建时从实际数目算
   - 添加键盘快捷键：Ctrl+W 关闭标签，Ctrl+Tab 切换
   - 添加终端初始化加载状态
   
9. **`src/static/js/filetree.js`**
   - 添加文件树加载 spinner
   - 搜索增加防抖优化（已存在，增强）
   
10. **`src/static/js/settings.js`**
    - 保存设置时按钮显示 spinner + 禁用状态防重复提交
    - 增加更清晰的状态反馈
    
11. **`src/static/css/app.css`**
    - 添加骨架屏/加载动画 CSS 类

12. **`src/static/js/app.js`**
    - 初始加载时显示全局 loading 状态

### 第四阶段：代码清理（4 个文件改动）

**目标：减少技术债务**

13. **`src/files/watcher.rs`** — 添加 `#[allow(dead_code)]` 和清晰 TODO
14. **`src/static/js/terminal.js`** — 移除客户端无用的 session_id 生成逻辑
15. **`src/server.rs`** — 精简 `include_str!` 注释
16. **`src/main.rs`** — 添加 Ctrl+C 优雅关闭（释放所有 PTY 进程）

### 不包含在本计划中的事项
- ❌ 不引入额外 Rust 依赖（保持 Cargo.toml 不变）
- ❌ 不改动构建流程/CI 配置
- ❌ 不修改 HTML 结构（保持向后兼容）
- ❌ 不进行大规模重构（最小变更原则）

### 改动汇总
| 阶段 | 文件数 | 预期风险 |
|------|--------|---------|
| 一：Bug 修复 | 3 | 中等（核心逻辑修改） |
| 二：可靠性 | 4 | 低（防御性代码） |
| 三：UI/UX | 5 | 低（前端增强） |
| 四：清理 | 4 | 极低（注释/清理） |
