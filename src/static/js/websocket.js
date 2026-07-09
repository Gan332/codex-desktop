// ═══════════════════════════════════════════
// websocket.js — WebSocket 连接管理
// ═══════════════════════════════════════════

window.codex = window.codex || {};

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.listeners = new Map();
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.isConnected = false;
    }

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws/terminal`;

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            console.error('WebSocket 创建失败:', e);
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log('[WS] 已连接');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected', {});
            this.updateStatusUI(true);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.emit(msg.type, msg);
            } catch (e) {
                console.error('[WS] 消息解析失败:', e);
            }
        };

        this.ws.onclose = (event) => {
            console.log('[WS] 连接关闭:', event.code, event.reason);
            this.isConnected = false;
            this.updateStatusUI(false);
            this.emit('disconnected', {});
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('[WS] 错误:', error);
        };
    }

    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    on(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push(callback);
        return () => {
            const cbs = this.listeners.get(type);
            const idx = cbs.indexOf(callback);
            if (idx !== -1) cbs.splice(idx, 1);
        };
    }

    emit(type, data) {
        const cbs = this.listeners.get(type) || [];
        cbs.forEach(cb => {
            try { cb(data); } catch (e) { console.error('[WS] 监听器错误:', e); }
        });
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[WS] 重连次数超限');
            return;
        }
        if (this.reconnectTimer) return;

        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts), 30000);
        console.log(`[WS] ${delay}ms 后重连 (第 ${this.reconnectAttempts + 1} 次)`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    updateStatusUI(connected) {
        const el = window.codex.utils.$('#status-ws');
        if (!el) return;
        if (connected) {
            el.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span>已连接';
        } else {
            el.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span>未连接';
        }
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.maxReconnectAttempts = 0;
        if (this.ws) {
            this.ws.close();
        }
    }
}

window.codex.ws = new WebSocketManager();
const wsManager = window.codex.ws; // 兼容旧引用