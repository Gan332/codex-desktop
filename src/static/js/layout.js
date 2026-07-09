// ═══════════════════════════════════════════
// layout.js — 布局管理模块
// ═══════════════════════════════════════════

class LayoutManager {
    constructor() {
        this.sidebar = Utils.$('#sidebar');
        this.resizer = Utils.$('#sidebar-resizer');
        this.isDragging = false;
        this.startX = 0;
        this.startWidth = 0;
        this.minWidth = 180;
        this.maxWidth = 500;
    }

    /**
     * 初始化拖拽分栏
     */
    init() {
        if (!this.resizer || !this.sidebar) return;

        this.resizer.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.startX = e.clientX;
            this.startWidth = this.sidebar.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            // 添加遮罩防止 iframe 抢焦点
            const overlay = Utils.createElement('div', {
                className: 'fixed inset-0 z-50',
                id: 'drag-overlay',
            });
            document.body.appendChild(overlay);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const delta = e.clientX - this.startX;
            let newWidth = this.startWidth + delta;

            // 限制宽度范围
            newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth));

            this.sidebar.style.width = `${newWidth}px`;

            // 通知终端重新适配
            if (window.terminalManager) {
                window.terminalManager.fitActive();
            }
        });

        document.addEventListener('mouseup', () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            const overlay = Utils.$('#drag-overlay');
            if (overlay) overlay.remove();
        });

        // 主题切换
        Utils.$('#btn-theme')?.addEventListener('click', () => this.toggleTheme());
    }

    /**
     * 切换暗色/亮色主题
     */
    toggleTheme() {
        const html = document.documentElement;
        const isDark = html.classList.contains('dark');

        if (isDark) {
            html.classList.remove('dark');
            Utils.$('#icon-moon')?.classList.add('hidden');
            Utils.$('#icon-sun')?.classList.remove('hidden');
        } else {
            html.classList.add('dark');
            Utils.$('#icon-moon')?.classList.remove('hidden');
            Utils.$('#icon-sun')?.classList.add('hidden');
        }

        // 更新终端主题
        if (window.terminalManager) {
            window.terminalManager.sessions.forEach(session => {
                session.term.options.theme = window.terminalManager.getTerminalTheme();
            });
        }

        // 保存偏好
        localStorage.setItem('codex-theme', isDark ? 'light' : 'dark');
    }

    /**
     * 加载保存的主题偏好
     */
    loadTheme() {
        const saved = localStorage.getItem('codex-theme');
        const html = document.documentElement;

        if (saved === 'light') {
            html.classList.remove('dark');
            Utils.$('#icon-moon')?.classList.add('hidden');
            Utils.$('#icon-sun')?.classList.remove('hidden');
        }
    }
}

// 全局实例
window.layoutManager = new LayoutManager();
