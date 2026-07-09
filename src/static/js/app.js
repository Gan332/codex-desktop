// ═══════════════════════════════════════════
// app.js — 主控制器
// ═══════════════════════════════════════════

(function () {
    'use strict';

    /**
     * 应用启动
     */
    async function init() {
        console.log('[App] Codex Desktop 启动中...');

        // 1. 加载主题偏好
        layoutManager.loadTheme();

        // 2. 初始化各模块
        settingsManager.init();
        layoutManager.init();
        await fileTreeManager.init();

        // 3. 建立 WebSocket 连接
        // 连接成功后会自动创建终端会话
        wsManager.connect();

        // 4. 终端管理器初始化（监听 ws 事件）
        terminalManager.init();

        // 5. 检查后端健康状态
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            console.log('[App] 后端状态:', data);
            Utils.$('#status-version').textContent = `Codex Desktop v${data.version}`;
        } catch (e) {
            console.error('[App] 后端连接失败:', e);
            showError('无法连接到后端服务');
        }

        console.log('[App] 初始化完成');
    }

    /**
     * 显示全局错误提示
     */
    function showError(message) {
        const container = Utils.$('#terminal-wrapper');
        if (!container) return;

        const errorEl = Utils.createElement('div', {
            className: 'absolute inset-0 flex items-center justify-center',
            innerHTML: `
                <div class="text-center text-gray-400">
                    <svg class="w-12 h-12 mx-auto mb-3 text-red-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                    </svg>
                    <p class="text-sm mb-2">${message}</p>
                    <p class="text-xs text-gray-500">请确保 codex-desktop 后端正在运行</p>
                </div>
            `,
        });
        container.appendChild(errorEl);
    }

    // DOM 就绪后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
