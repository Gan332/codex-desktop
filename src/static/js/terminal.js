// ═══════════════════════════════════════════
// terminal.js — 终端管理模块
// ═══════════════════════════════════════════

window.codex = window.codex || {};

class TerminalManager {
    constructor() {
        this.sessions = new Map();
        this.activeSessionId = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;

        const ws = window.codex.ws;
        const $ = window.codex.utils.$;

        this.tabContainer = $('#terminal-tabs');
        this.wrapperEl = $('#terminal-wrapper');

        ws.on('session_created', (msg) => {
            console.log('[Terminal] 会话已创建:', msg.session_id);
            this.setupTerminal(msg.session_id);
            this.updateStatusPTY(msg.session_id, '运行中');
        });

        ws.on('terminal_output', (msg) => {
            const session = this.sessions.get(msg.session_id);
            if (session) {
                session.term.write(msg.data);
            }
        });

        ws.on('error', (msg) => {
            console.error('[Terminal] 错误:', msg.message);
        });

        ws.on('connected', () => {
            this.createSession();
        });

        window.addEventListener('resize', window.codex.utils.debounce(() => {
            this.fitActive();
        }, 150));

        $('#btn-new-tab')?.addEventListener('click', () => {
            this.createSession();
        });

        // ── 键盘快捷键 ──
        document.addEventListener('keydown', (e) => {
            // Ctrl+W: 关闭当前标签
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
                e.preventDefault();
                if (this.activeSessionId) {
                    this.killSession(this.activeSessionId);
                }
            }
            // Ctrl+Tab: 切换标签
            if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
                e.preventDefault();
                const ids = [...this.sessions.keys()];
                if (ids.length < 2) return;
                const currentIdx = ids.indexOf(this.activeSessionId);
                const nextIdx = e.shiftKey
                    ? (currentIdx - 1 + ids.length) % ids.length
                    : (currentIdx + 1) % ids.length;
                this.switchTo(ids[nextIdx]);
            }
        });

        if (ws.isConnected) {
            this.createSession();
        }
    }

    createSession() {
        // 服务器生成 session_id，前端只需发送创建指令
        window.codex.ws.send({ type: 'terminal_create', session_id: '' });
    }

    setupTerminal(sessionId) {
        if (this.sessions.has(sessionId)) return;

        const $ = window.codex.utils.$;
        const containerEl = window.codex.utils.createElement('div', {
            className: 'absolute inset-0 hidden',
            id: `term-${sessionId}`,
        });
        this.wrapperEl.appendChild(containerEl);

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

        requestAnimationFrame(() => {
            fitAddon.fit();
            this.sendResize(sessionId, term.cols, term.rows);
        });

        term.onData((data) => {
            window.codex.ws.send({
                type: 'terminal_input',
                session_id: sessionId,
                data: data,
            });
        });

        term.onResize(({ cols, rows }) => {
            this.sendResize(sessionId, cols, rows);
        });

        const tabEl = this.createTab(sessionId);

        const session = { term, fitAddon, tabEl, containerEl };
        this.sessions.set(sessionId, session);
        this.switchTo(sessionId);
        console.log('[Terminal] 终端已初始化:', sessionId);
    }

    createTab(sessionId) {
        const $ = window.codex.utils.$;
        const H = window.codex.utils.createElement;
        const tabIndex = this.sessions.size + 1;

        const tab = H('div', {
            className: 'terminal-tab group flex items-center gap-1.5 px-2.5 py-1 text-xs rounded cursor-pointer',
            'data-session-id': sessionId,
        });

        const icon = H('span', {
            innerHTML: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>`,
            className: 'text-gray-400',
        });

        const label = H('span', {
            textContent: `终端 ${tabIndex}`,
        });

        const closeBtn = H('span', {
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

        $('#terminal-tabs').appendChild(tab);
        return tab;
    }

    switchTo(sessionId) {
        this.sessions.forEach((s, id) => {
            s.containerEl.classList.add('hidden');
            s.tabEl.classList.remove('active');
        });

        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.containerEl.classList.remove('hidden');
        session.tabEl.classList.add('active');
        this.activeSessionId = sessionId;

        requestAnimationFrame(() => {
            session.fitAddon.fit();
            session.term.focus();
        });

        this.updateStatusPTY(sessionId, '运行中');
    }

    sendResize(sessionId, cols, rows) {
        window.codex.ws.send({
            type: 'terminal_resize',
            session_id: sessionId,
            cols,
            rows,
        });
    }

    killSession(sessionId) {
        window.codex.ws.send({ type: 'terminal_kill', session_id: sessionId });

        const session = this.sessions.get(sessionId);
        if (session) {
            session.term.dispose();
            session.containerEl.remove();
            session.tabEl.remove();
            this.sessions.delete(sessionId);
        }

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

    fitActive() {
        if (this.activeSessionId) {
            const session = this.sessions.get(this.activeSessionId);
            if (session) {
                session.fitAddon.fit();
            }
        }
    }

    updateStatusPTY(sessionId, status) {
        const el = window.codex.utils.$('#status-pty');
        if (el) {
            el.textContent = sessionId ? `会话: ${sessionId.slice(0, 12)}... ${status}` : '--';
        }
    }

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

window.codex.terminal = new TerminalManager();
const terminalManager = window.codex.terminal;