// ═══════════════════════════════════════════
// layout.js — 布局管理模块
// ═══════════════════════════════════════════

window.codex = window.codex || {};

class LayoutManager {
    constructor() {
        this.isDragging = false;
        this.startX = 0;
        this.startWidth = 0;
        this.minWidth = 180;
        this.maxWidth = 500;
    }

    init() {
        const $ = window.codex.utils.$;
        this.sidebar = $('#sidebar');
        this.resizer = $('#sidebar-resizer');
        if (!this.resizer || !this.sidebar) return;

        this.resizer.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.startX = e.clientX;
            this.startWidth = this.sidebar.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const overlay = window.codex.utils.createElement('div', {
                className: 'fixed inset-0 z-50',
                id: 'drag-overlay',
            });
            document.body.appendChild(overlay);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const delta = e.clientX - this.startX;
            let newWidth = this.startWidth + delta;
            newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth));
            this.sidebar.style.width = `${newWidth}px`;
            if (window.codex.terminal) {
                window.codex.terminal.fitActive();
            }
        });

        document.addEventListener('mouseup', () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            const overlay = window.codex.utils.$('#drag-overlay');
            if (overlay) overlay.remove();
        });

        $('#btn-theme')?.addEventListener('click', () => this.toggleTheme());
    }

    toggleTheme() {
        const html = document.documentElement;
        const isDark = html.classList.contains('dark');

        if (isDark) {
            html.classList.remove('dark');
            window.codex.utils.$('#icon-moon')?.classList.add('hidden');
            window.codex.utils.$('#icon-sun')?.classList.remove('hidden');
        } else {
            html.classList.add('dark');
            window.codex.utils.$('#icon-moon')?.classList.remove('hidden');
            window.codex.utils.$('#icon-sun')?.classList.add('hidden');
        }

        if (window.codex.terminal) {
            window.codex.terminal.sessions.forEach(session => {
                session.term.options.theme = window.codex.terminal.getTerminalTheme();
            });
        }

        localStorage.setItem('codex-theme', isDark ? 'light' : 'dark');
    }

    loadTheme() {
        const saved = localStorage.getItem('codex-theme');
        const html = document.documentElement;

        if (saved === 'light') {
            html.classList.remove('dark');
            window.codex.utils.$('#icon-moon')?.classList.add('hidden');
            window.codex.utils.$('#icon-sun')?.classList.remove('hidden');
        }
    }
}

window.codex.layout = new LayoutManager();
const layoutManager = window.codex.layout;