// ═══════════════════════════════════════════
// settings.js — 设置面板模块
// ═══════════════════════════════════════════

class SettingsManager {
    constructor() {
        this.panel = Utils.$('#settings-panel');
        this.config = {};
    }

    /**
     * 初始化
     */
    init() {
        // 打开/关闭设置面板
        Utils.$('#btn-settings')?.addEventListener('click', () => this.toggle());
        Utils.$('#btn-close-settings')?.addEventListener('click', () => this.hide());

        // 保存按钮
        Utils.$('#btn-save-config')?.addEventListener('click', () => this.save());

        // 加载配置
        this.load();
    }

    /**
     * 从后端加载配置
     */
    async load() {
        try {
            const res = await fetch('/api/config');
            this.config = await res.json();
            this.populateForm();
        } catch (e) {
            console.error('[Settings] 加载配置失败:', e);
        }
    }

    /**
     * 填充表单
     */
    populateForm() {
        const setValue = (id, value) => {
            const el = Utils.$(id);
            if (el) el.value = value || '';
        };

        setValue('#cfg-api-key', this.config.api_key);
        setValue('#cfg-model', this.config.model);
        setValue('#cfg-work-dir', this.config.work_dir);
        setValue('#cfg-shell', this.config.shell);
        setValue('#cfg-port', this.config.port);
    }

    /**
     * 保存配置
     */
    async save() {
        const getVal = (id) => {
            const el = Utils.$(id);
            return el ? el.value : '';
        };

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

            // 通知文件树刷新
            if (window.fileTreeManager) {
                await window.fileTreeManager.loadDirectory(update.work_dir);
            }
        } catch (e) {
            console.error('[Settings] 保存失败:', e);
            this.showStatus('保存失败', 'text-red-400');
        }
    }

    /**
     * 显示保存状态
     */
    showStatus(text, colorClass) {
        const el = Utils.$('#config-status');
        if (el) {
            el.textContent = text;
            el.className = `mt-2 text-xs text-center ${colorClass}`;
            setTimeout(() => {
                el.textContent = '';
            }, 3000);
        }
    }

    /**
     * 显示面板
     */
    show() {
        this.panel?.classList.remove('hidden');
        this.panel?.classList.add('flex');
    }

    /**
     * 隐藏面板
     */
    hide() {
        this.panel?.classList.add('hidden');
        this.panel?.classList.remove('flex');
    }

    /**
     * 切换面板
     */
    toggle() {
        if (this.panel?.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    }
}

// 全局实例
window.settingsManager = new SettingsManager();
