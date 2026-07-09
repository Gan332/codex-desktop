// ═══════════════════════════════════════════
// utils.js — 工具函数（挂载到 window.codex.utils）
// ═══════════════════════════════════════════

window.codex = window.codex || {};

window.codex.utils = {
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    getFileIcon(name, isDir) {
        if (isDir) return 'icon-folder';
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const map = {
            js: 'icon-js', jsx: 'icon-js', mjs: 'icon-js',
            ts: 'icon-ts', tsx: 'icon-ts',
            rs: 'icon-rs',
            py: 'icon-py',
            json: 'icon-json',
            md: 'icon-md',
            html: 'icon-html', htm: 'icon-html',
            css: 'icon-css', scss: 'icon-css',
        };
        return map[ext] || 'icon-file';
    },

    getFileIconSvg(name, isDir) {
        if (isDir) {
            return `<svg class="tree-icon icon-folder" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>`;
        }
        return `<svg class="tree-icon ${this.getFileIcon(name, false)}" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
        </svg>`;
    },

    debounce(fn, delay = 300) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    $(selector) {
        return document.querySelector(selector);
    },

    $$(selector) {
        return document.querySelectorAll(selector);
    },

    createElement(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([key, val]) => {
            if (key === 'className') el.className = val;
            else if (key === 'innerHTML') el.innerHTML = val;
            else if (key === 'textContent') el.textContent = val;
            else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
            else el.setAttribute(key, val);
        });
        children.forEach(child => {
            if (typeof child === 'string') el.appendChild(document.createTextNode(child));
            else if (child) el.appendChild(child);
        });
        return el;
    },
};

// 便捷别名
const Utils = window.codex.utils;
