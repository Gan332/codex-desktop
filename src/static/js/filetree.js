// ═══════════════════════════════════════════
// filetree.js — 文件树浏览模块
// ═══════════════════════════════════════════

class FileTreeManager {
    constructor() {
        this.treeEl = Utils.$('#file-tree');
        this.pathEl = Utils.$('#current-path');
        this.searchEl = Utils.$('#file-search');
        this.currentPath = '';
        this.expandedDirs = new Set();
        this.selectedFile = null;
    }

    /**
     * 初始化
     */
    async init() {
        // 搜索防抖
        this.searchEl?.addEventListener('input', Utils.debounce((e) => {
            this.handleSearch(e.target.value);
        }, 400));

        // 加载初始目录
        await this.loadConfig();
    }

    /**
     * 从后端加载配置获取工作目录
     */
    async loadConfig() {
        try {
            const res = await fetch('/api/config');
            const cfg = await res.json();
            this.currentPath = cfg.work_dir || '~';
            this.updatePathDisplay();
            await this.loadDirectory(this.currentPath);
        } catch (e) {
            console.error('[FileTree] 加载配置失败:', e);
            // 使用默认路径
            this.currentPath = '~';
            this.updatePathDisplay();
        }
    }

    /**
     * 更新路径显示
     */
    updatePathDisplay() {
        if (this.pathEl) {
            this.pathEl.textContent = this.currentPath;
        }
        Utils.$('#status-cwd').textContent = this.currentPath;
    }

    /**
     * 从后端加载目录
     */
    async loadDirectory(path) {
        this.treeEl.innerHTML = `<div class="p-2 text-xs text-gray-500">加载中...</div>`;

        try {
            const res = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
            const data = await res.json();

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

    /**
     * 渲染文件树
     */
    renderTree(entries) {
        this.treeEl.innerHTML = '';

        if (!entries || entries.length === 0) {
            this.treeEl.innerHTML = `<div class="p-2 text-xs text-gray-500">空目录</div>`;
            return;
        }

        // "返回上级" 按钮
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

        // 目录在前，文件在后（后端已排序）
        entries.forEach(entry => {
            const item = this.createTreeItem(entry);
            this.treeEl.appendChild(item);
        });
    }

    /**
     * 创建单个文件树项
     */
    createTreeItem(entry, isParent = false) {
        const item = Utils.createElement('div', {
            className: `tree-item ${this.selectedFile === entry.path ? 'selected' : ''}`,
            'data-path': entry.path,
            'data-is-dir': entry.is_dir ? 'true' : 'false',
        });

        // 图标
        const iconHtml = isParent
            ? `<svg class="tree-icon icon-folder" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
               </svg>`
            : Utils.getFileIconSvg(entry.name, entry.is_dir);

        const icon = Utils.createElement('span', { innerHTML: iconHtml });

        // 名称
        const name = Utils.createElement('span', {
            className: 'truncate flex-1',
            textContent: entry.name,
        });

        // 大小（仅文件显示）
        let sizeEl = null;
        if (!entry.is_dir && entry.size > 0) {
            sizeEl = Utils.createElement('span', {
                className: 'text-[10px] text-gray-600 ml-auto shrink-0',
                textContent: Utils.formatSize(entry.size),
            });
        }

        item.appendChild(icon);
        item.appendChild(name);
        if (sizeEl) item.appendChild(sizeEl);

        // 点击事件
        item.addEventListener('click', async () => {
            if (entry.is_dir) {
                await this.toggleDir(entry.path, item);
            } else {
                this.selectFile(entry);
            }
        });

        return item;
    }

    /**
     * 展开/折叠目录
     */
    async toggleDir(path, itemEl) {
        // 检查是否已展开（已有子元素）
        const existingChildren = itemEl.nextElementSibling;
        if (existingChildren && existingChildren.classList.contains('tree-children')) {
            existingChildren.remove();
            this.expandedDirs.delete(path);
            return;
        }

        // 加载目录内容
        try {
            const res = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
            const data = await res.json();

            if (data.error) {
                console.error('[FileTree] 加载子目录失败:', data.error);
                return;
            }

            this.expandedDirs.add(path);

            // 创建子容器
            const childrenEl = Utils.createElement('div', {
                className: 'tree-children pl-3',
            });

            data.forEach(entry => {
                const childItem = this.createTreeItem(entry);
                childrenEl.appendChild(childItem);
            });

            // 插入到父元素后面
            itemEl.after(childrenEl);
        } catch (e) {
            console.error('[FileTree] 加载子目录失败:', e);
        }
    }

    /**
     * 选中文件：在终端中预览
     */
    async selectFile(entry) {
        // 更新选中状态
        Utils.$$('.tree-item.selected').forEach(el => el.classList.remove('selected'));
        const itemEl = Utils.$(`[data-path="${CSS.escape(entry.path)}"]`);
        if (itemEl) itemEl.classList.add('selected');
        this.selectedFile = entry.path;

        // 读取文件内容并显示
        if (!entry.is_dir) {
            try {
                const res = await fetch(`/api/files/read?path=${encodeURIComponent(entry.path)}`);
                const data = await res.json();

                if (data.error) {
                    console.error('[FileTree] 读取文件失败:', data.error);
                    return;
                }

                // 在终端中显示文件内容（可选：显示在终端中）
                if (window.terminalManager && window.terminalManager.activeSessionId) {
                    const session = window.terminalManager.sessions.get(
                        window.terminalManager.activeSessionId
                    );
                    if (session) {
                        session.term.writeln('');
                        session.term.writeln(`\x1b[36m── ${entry.name} ──\x1b[0m`);
                        const lines = data.content.split('\n');
                        lines.forEach(line => {
                            session.term.writeln(line);
                        });
                        session.term.writeln('');
                    }
                }
            } catch (e) {
                console.error('[FileTree] 读取文件失败:', e);
            }
        }
    }

    /**
     * 处理搜索
     */
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
                const item = this.createTreeItem(entry);
                this.treeEl.appendChild(item);
            });
        } catch (e) {
            console.error('[FileTree] 搜索失败:', e);
        }
    }

    /**
     * 获取父级路径
     */
    getParentPath(path) {
        const normalized = path.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf('/');
        if (lastSlash <= 0) return '/';
        return normalized.substring(0, lastSlash);
    }
}

// 全局实例
window.fileTreeManager = new FileTreeManager();
