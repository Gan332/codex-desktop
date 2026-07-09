// ═══════════════════════════════════════════
// filetree.js — 文件树浏览模块
// ═══════════════════════════════════════════

window.codex = window.codex || {};

class FileTreeManager {
    constructor() {
        this.currentPath = '';
        this.expandedDirs = new Set();
        this.selectedFile = null;
        // LRU 目录缓存：path → [FileEntry]
        this._dirCache = new Map();
        this._maxCacheSize = 50;
    }

    async init() {
        const $ = window.codex.utils.$;
        this.treeEl = $('#file-tree');
        this.pathEl = $('#current-path');
        this.searchEl = $('#file-search');

        this.searchEl?.addEventListener('input', window.codex.utils.debounce((e) => {
            this.handleSearch(e.target.value);
        }, 400));

        await this.loadConfig();
    }

    async loadConfig() {
        try {
            const res = await fetch('/api/config');
            const cfg = await res.json();
            this.currentPath = cfg.work_dir || '~';
            this.updatePathDisplay();
            await this.loadDirectory(this.currentPath);
        } catch (e) {
            console.error('[FileTree] 加载配置失败:', e);
            this.currentPath = '~';
            this.updatePathDisplay();
        }
    }

    updatePathDisplay() {
        if (this.pathEl) {
            this.pathEl.textContent = this.currentPath;
        }
        window.codex.utils.$('#status-cwd').textContent = this.currentPath;
    }

    async loadDirectory(path) {
        this.treeEl.innerHTML = `<div class="p-2 text-xs text-gray-500">加载中...</div>`;

        try {
            let data;
            if (this._dirCache.has(path)) {
                data = this._dirCache.get(path);
            } else {
                const res = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
                data = await res.json();
                if (!data.error) {
                    this._dirCache.set(path, data);
                    if (this._dirCache.size > this._maxCacheSize) {
                        const firstKey = this._dirCache.keys().next().value;
                        this._dirCache.delete(firstKey);
                    }
                }
            }

            if (data.error) {
                this.treeEl.innerHTML = `<div class="p-2 text-xs text-red-400">${data.error}</div>`;
                return;
            }

            this.currentPath = path;
            this.updatePathDisplay();
            this.renderTree(data);
        } catch (e) {
            this.treeEl.innerHTML = `<div class="p-2 text-xs text-red-400">加载失败</div>`;
            console.error('[FileTree] 加载目录失败:', e);
        }
    }

    renderTree(entries) {
        this.treeEl.innerHTML = '';

        if (!entries || entries.length === 0) {
            this.treeEl.innerHTML = `<div class="p-2 text-xs text-gray-500">空目录</div>`;
            return;
        }

        if (this.currentPath !== '~' && this.currentPath !== '/') {
            const parentPath = this.getParentPath(this.currentPath);
            const upItem = this.createTreeItem({
                name: '..',
                path: parentPath,
                is_dir: true,
                size: 0,
                extension: '',
            }, true);
            this.treeEl.appendChild(upItem);
        }

        entries.forEach(entry => {
            const item = this.createTreeItem(entry);
            this.treeEl.appendChild(item);
        });
    }

    createTreeItem(entry, isParent = false) {
        const H = window.codex.utils.createElement;
        const item = H('div', {
            className: `tree-item ${this.selectedFile === entry.path ? 'selected' : ''}`,
            'data-path': entry.path,
            'data-is-dir': entry.is_dir ? 'true' : 'false',
        });

        const iconHtml = isParent
            ? `<svg class="tree-icon icon-folder" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
               </svg>`
            : window.codex.utils.getFileIconSvg(entry.name, entry.is_dir);

        const icon = H('span', { innerHTML: iconHtml });
        const name = H('span', { className: 'truncate flex-1', textContent: entry.name });

        item.appendChild(icon);
        item.appendChild(name);

        if (!entry.is_dir && entry.size > 0) {
            const sizeEl = H('span', {
                className: 'text-[10px] text-gray-600 ml-auto shrink-0',
                textContent: window.codex.utils.formatSize(entry.size),
            });
            item.appendChild(sizeEl);
        }

        item.addEventListener('click', async () => {
            if (entry.is_dir) {
                await this.toggleDir(entry.path, item);
            } else {
                this.selectFile(entry);
            }
        });

        return item;
    }

    async toggleDir(path, itemEl) {
        const existingChildren = itemEl.nextElementSibling;
        if (existingChildren && existingChildren.classList.contains('tree-children')) {
            existingChildren.remove();
            this.expandedDirs.delete(path);
            // invalidate cache when collapsing
            this._dirCache.delete(path);
            return;
        }

        try {
            let data;
            if (this._dirCache.has(path)) {
                data = this._dirCache.get(path);
            } else {
                const res = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
                data = await res.json();
                if (!data.error) {
                    this._dirCache.set(path, data);
                    if (this._dirCache.size > this._maxCacheSize) {
                        const firstKey = this._dirCache.keys().next().value;
                        this._dirCache.delete(firstKey);
                    }
                }
            }

            if (data.error) {
                console.error('[FileTree] 加载子目录失败:', data.error);
                return;
            }

            this.expandedDirs.add(path);
            const childrenEl = window.codex.utils.createElement('div', { className: 'tree-children pl-3' });
            data.forEach(entry => {
                childrenEl.appendChild(this.createTreeItem(entry));
            });
            itemEl.after(childrenEl);
        } catch (e) {
            console.error('[FileTree] 加载子目录失败:', e);
        }
    }

    async selectFile(entry) {
        window.codex.utils.$$('.tree-item.selected').forEach(el => el.classList.remove('selected'));
        const itemEl = window.codex.utils.$(`[data-path="${CSS.escape(entry.path)}"]`);
        if (itemEl) itemEl.classList.add('selected');
        this.selectedFile = entry.path;

        if (!entry.is_dir) {
            try {
                const res = await fetch(`/api/files/read?path=${encodeURIComponent(entry.path)}`);
                const data = await res.json();
                if (data.error) {
                    console.error('[FileTree] 读取文件失败:', data.error);
                    return;
                }

                const tm = window.codex.terminal;
                if (tm && tm.activeSessionId) {
                    const session = tm.sessions.get(tm.activeSessionId);
                    if (session) {
                        session.term.writeln('');
                        session.term.writeln(`\x1b[36m── ${entry.name} ──\x1b[0m`);
                        const lines = data.content.split('\n');
                        lines.forEach(line => session.term.writeln(line));
                        session.term.writeln('');
                    }
                }
            } catch (e) {
                console.error('[FileTree] 读取文件失败:', e);
            }
        }
    }

    async handleSearch(keyword) {
        if (!keyword.trim()) {
            await this.loadDirectory(this.currentPath);
            return;
        }

        try {
            const res = await fetch(`/api/files/search?path=${encodeURIComponent(this.currentPath)}&keyword=${encodeURIComponent(keyword)}`);
            const data = await res.json();

            if (data.error) {
                this.treeEl.innerHTML = `<div class="p-2 text-xs text-red-400">${data.error}</div>`;
                return;
            }

            this.treeEl.innerHTML = '';
            if (data.length === 0) {
                this.treeEl.innerHTML = `<div class="p-2 text-xs text-gray-500">未找到匹配文件</div>`;
                return;
            }

            data.forEach(entry => {
                this.treeEl.appendChild(this.createTreeItem(entry));
            });
        } catch (e) {
            console.error('[FileTree] 搜索失败:', e);
        }
    }

    getParentPath(path) {
        const normalized = path.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        if (lastSlash <= 0) return '/';
        return normalized.substring(0, lastSlash);
    }
}

window.codex.filetree = new FileTreeManager();
const fileTreeManager = window.codex.filetree;