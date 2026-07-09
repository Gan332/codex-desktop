// ═══════════════════════════════════════════
// terminal.js — 终端管理模块
// ═══════════════════════════════════════════

class TerminalManager {
    constructor() {
        this.sessions = new Map();  // sessionId -> { term, fitAddon, tabEl }
        this.activeSessionId = null;
        this.tabContainer = Utils.$('#terminal-tabs');
        this.wrapperEl = Utils.$('#terminal-wrapper');
    }

    /**
     * 初始化：创建第一个终端会话
     */
    init() {
        // 监听后端会话创建响应
        wsManager.on('session_created', (msg) => {
            console.log('[Terminal] 会话已创建:', msg.session_id);
            this.setupTerminal(msg.session_id);
            this.updateStatusPTY(msg.session_id, '运行中');
        });

        // 监听终端输出
        wsManager.on('terminal_output', (msg) => {
            const session = this.sessions.get(msg.session_id);
            if (session) {
                session.term.write(msg.data);
            }
        });

        // 监听错误
        wsManager.on('error', (msg) => {
            console.error('[Terminal] 错误:', msg.message);
        });

        // 监听连接/断开
        wsManager.on('connected', () => {
            this.createSession();
        });

        // 窗口 resize 时更新终端
        window.addEventListener('resize', Utils.debounce(() => {
            this.fitActive();
        }, 150));

        // 创建新终端按钮
        Utils.$('#btn-new-tab')?.addEventListener('click', () => {
            this.createSession();
        });

        // 如果已连接，立即创建终端
        if (wsManager.isConnected) {
            this.createSession();
        }
    }

    /**
     * 通过 WebSocket 创建新终端会话
     */
    createSession() {
        const id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        wsManager.send({ type: 'terminal_create', session_id: id });
    }

    /**
     * 初始化 xterm 实例
     */
    setupTerminal(sessionId) {
        // 检查是否已存在
        if (this.sessions.has(sessionId)) return;

        // 创建终端容器
        const containerEl = Utils.createElement('div', {
            className: 'absolute inset-0 hidden',
            id: `term-${sessionId}`,
        });
        this.wrapperEl.appendChild(containerEl);

        // 创建 xterm 实例
        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
            theme: this.getTerminalTheme(),
            allowProposedApi: true,
            scrollback: 10000,
        });

        const fitAddon = new FitAddon.FitAddon();
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);

        term.open(containerEl);

        // 延迟 fit 以确保容器尺寸正确
        requestAnimationFrame(() => {
            fitAddon.fit();
            this.sendResize(sessionId, term.cols, term.rows);
        });

        // 用户输入 → WebSocket
        term.onData((data) => {
            wsManager.send({
                type: 'terminal_input',
                session_id: sessionId,
                data: data,
            });
        });

        // 终端尺寸变化 → WebSocket
        term.onResize(({ cols, rows }) => {
            this.sendResize(sessionId, cols, rows);
        });

        // 创建标签页
        const tabEl = this.createTab(sessionId);

        const session = {
            term,
            fitAddon,
            tabEl,
            containerEl,
        };
        this.sessions.set(sessionId, session);

        // 切换到新标签页
        this.switchTo(sessionId);

        console.log('[Terminal] 终端已初始化:', sessionId);
    }

    /**
     * 创建标签页 UI
     */
    createTab(sessionId) {
        const tab = Utils.createElement('div', {
            className: 'terminal-tab group flex items-center gap-1.5 px-2.5 py-1 text-xs rounded cursor-pointer',
        });

        const icon = Utils.createElement('span', {
            innerHTML: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>`,
            className: 'text-gray-400',
        });

        const label = Utils.createElement('span', {
            textContent: `终端 ${this.sessions.size + 1}`,
        });

        const closeBtn = Utils.createElement('span', {
            className: 'tab-close',
            innerHTML: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>`,
            onClick: (e) => {
                e.stopPropagation();
                this.killSession(sessionId);
            },
        });

        tab.appendChild(icon);
        tab.appendChild(label);
        tab.appendChild(closeBtn);

        tab.addEventListener('click', () => this.switchTo(sessionId));

        this.tabContainer.appendChild(tab);
        return tab;
    }

    /**
     * 切换到指定会话
     */
    switchTo(sessionId) {
        // 隐藏所有终端
        this.sessions.forEach((s, id) => {
            s.containerEl.classList.add('hidden');
            s.tabEl.classList.remove('active');
        });

        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.containerEl.classList.remove('hidden');
        session.tabEl.classList.add('active');
        this.activeSessionId = sessionId;

        // 重新 fit 并聚焦
        requestAnimationFrame(() => {
            session.fitAddon.fit();
            session.term.focus();
        });

        this.updateStatusPTY(sessionId, '运行中');
    }

    /**
     * 发送 resize 消息
     */
    sendResize(sessionId, cols, rows) {
        wsManager.send({
            type: 'terminal_resize',
            session_id: sessionId,
            cols,
            rows,
        });
    }

    /**
     * 关闭终端会话
     */
    killSession(sessionId) {
        wsManager.send({ type: 'terminal_kill', session_id: sessionId });

        const session = this.sessions.get(sessionId);
        if (session) {
            session.term.dispose();
            session.containerEl.remove();
            session.tabEl.remove();
            this.sessions.delete(sessionId);
        }

        // 切换到另一个会话
        if (this.activeSessionId === sessionId) {
            const remaining = [...this.sessions.keys()];
            if (remaining.length > 0) {
                this.switchTo(remaining[remaining.length - 1]);
            } else {
                this.activeSessionId = null;
                this.updateStatusPTY(null, '--');
            }
        }
    }

    /**
     * 重新适配终端尺寸
     */
    fitActive() {
        if (this.activeSessionId) {
            const session = this.sessions.get(this.activeSessionId);
            if (session) {
                session.fitAddon.fit();
            }
        }
    }

    /**
     * 更新状态栏 PTY 信息
     */
    updateStatusPTY(sessionId, status) {
        const el = Utils.$('#status-pty');
        if (el) {
            el.textContent = sessionId ? `会话: ${sessionId.slice(0, 12)}... ${status}` : '--';
        }
    }

    /**
     * 获取终端配色主题
     */
    getTerminalTheme() {
        const isDark = document.documentElement.classList.contains('dark');
        return {
            background: isDark ? '#0f172a' : '#ffffff',
            foreground: isDark ? '#e2e8f0' : '#1e293b',
            cursor: isDark ? '#6366f1' : '#4f46e5',
            cursorAccent: isDark ? '#0f172a' : '#ffffff',
            selectionBackground: isDark ? '#334155' : '#c7d2fe',
            black: '#1e293b',
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#eab308',
            blue: '#3b82f6',
            magenta: '#d946ef',
            cyan: '#06b6d4',
            white: '#e2e8f0',
            brightBlack: '#64748b',
            brightRed: '#f87171',
            brightGreen: '#4ade80',
            brightYellow: '#facc15',
            brightBlue: '#60a5fa',
            brightMagenta: '#e879f9',
            brightCyan: '#22d3ee',
            brightWhite: '#f8fafc',
        };
    }
}

// 全局实例
window.terminalManager = new TerminalManager();
