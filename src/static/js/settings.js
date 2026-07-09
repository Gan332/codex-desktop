// ═══════════════════════════════════════════
// settings.js — 设置面板模块
// ═══════════════════════════════════════════

window.codex = window.codex || {};

class SettingsManager {
    constructor() {
        this.config = {};
    }

    init() {
        const $ = window.codex.utils.$;
        this.panel = $('#settings-panel');

        $('#btn-settings')?.addEventListener('click', () => this.toggle());
        $('#btn-close-settings')?.addEventListener('click', () => this.hide());
        $('#btn-save-config')?.addEventListener('click', () => this.save());
        this.load();
    }

    async load() {
        try {
            const res = await fetch('/api/config');
            this.config = await res.json();
            this.populateForm();
        } catch (e) {
            console.error('[Settings] 加载配置失败:', e);
        }
    }

    populateForm() {
        const $ = window.codex.utils.$;
        const setValue = (id, value) => {
            const el = $(id);
            if (el) el.value = value || '';
        };
        setValue('#cfg-api-key', this.config.api_key);
        setValue('#cfg-model', this.config.model);
        setValue('#cfg-work-dir', this.config.work_dir);
        setValue('#cfg-shell', this.config.shell);
        setValue('#cfg-port', this.config.port);
    }

    async save() {
        const $ = window.codex.utils.$;
        const getVal = (id) => { const el = $(id); return el ? el.value : ''; };

        const update = {
            api_key: getVal('#cfg-api-key'),
            model: getVal('#cfg-model'),
            work_dir: getVal('#cfg-work-dir'),
            shell: getVal('#cfg-shell'),
            port: parseInt(getVal('#cfg-port')) || 9527,
        };

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(update),
            });
            this.config = await res.json();
            this.showStatus('设置已保存 ✓', 'text-green-400');
            if (window.codex.filetree) {
                await window.codex.filetree.loadDirectory(update.work_dir);
            }
        } catch (e) {
            console.error('[Settings] 保存失败:', e);
            this.showStatus('保存失败', 'text-red-400');
        }
    }

    showStatus(text, colorClass) {
        const el = window.codex.utils.$('#config-status');
        if (el) {
            el.textContent = text;
            el.className = `mt-2 text-xs text-center ${colorClass}`;
            setTimeout(() => { el.textContent = ''; }, 3000);
        }
    }

    show() {
        this.panel?.classList.remove('hidden');
        this.panel?.classList.add('flex');
    }

    hide() {
        this.panel?.classList.add('hidden');
        this.panel?.classList.remove('flex');
    }

    toggle() {
        if (this.panel?.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    }
}

window.codex.settings = new SettingsManager();
const settingsManager = window.codex.settings;