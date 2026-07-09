// ═══════════════════════════════════════════
// app.js — 主控制器
// ═══════════════════════════════════════════

window.codex = window.codex || {};

(async function init() {
    'use strict';

    console.log('[App] Codex Desktop 启动中...');

    const $ = window.codex.utils.$;

    // 显示加载提示
    const loadingEl = window.codex.utils.createElement('div', {
        className: 'absolute inset-0 flex items-center justify-center bg-surface-900/80 z-20',
        id: 'app-loading',
        innerHTML: `
            <div class="text-center">
                <div class="spinner mx-auto mb-3"></div>
                <p class="text-sm text-gray-400">正在初始化...</p>
            </div>
        `,
    });
    document.querySelector('#terminal-area')?.appendChild(loadingEl);

    try {
        // 1. 加载主题偏好
        window.codex.layout.loadTheme();

        // 2. 初始化各模块
        window.codex.settings.init();
        window.codex.layout.init();
        await window.codex.filetree.init();
        window.codex.terminal.init();

        // 3. 建立 WebSocket 连接
        window.codex.ws.connect();

        // 4. 检查后端健康状态
        const res = await fetch('/api/health');
        const data = await res.json();
        console.log('[App] 后端状态:', data);
        $('#status-version').textContent = `Codex Desktop v${data.version}`;
    } catch (e) {
        console.error('[App] 初始化失败:', e);
        showError('应用初始化失败');
    } finally {
        loadingEl?.remove();
    }

    console.log('[App] 初始化完成');

    function showError(message) {
        const container = $('#terminal-wrapper');
        if (!container) return;
        const errorEl = window.codex.utils.createElement('div', {
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
})();