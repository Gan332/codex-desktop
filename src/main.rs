mod config;
mod files;
mod server;
mod terminal;

use std::net::SocketAddr;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    let cfg = config::load();
    let addr = SocketAddr::from(([127, 0, 0, 1], cfg.port));
    let listener = TcpListener::bind(addr).await.unwrap_or_else(|e| {
        eprintln!("[Main] 端口 {} 绑定失败: {}", cfg.port, e);
        std::process::exit(1);
    });

    println!("╔══════════════════════════════════════╗");
    println!("║     Codex Desktop 已启动             ║");
    println!("║                                      ║");
    println!("║  地址: http://localhost:{:<5}        ║", cfg.port);
    println!("║  按 Ctrl+C 退出                      ║");
    println!("╚══════════════════════════════════════╝");

    // 自动打开浏览器
    let url = format!("http://localhost:{}", cfg.port);
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let _ = open::that(&url);
    });

    let app = server::build_router(cfg);

    // 优雅关闭：接收 Ctrl+C 信号后释放所有资源
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap_or_else(|e| {
            eprintln!("[Main] 服务器异常退出: {}", e);
        });
}

/// 等待 SIGINT (Ctrl+C) 或 SIGTERM 信号，触发优雅关闭
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("注册 Ctrl+C 信号处理失败");
        println!("\n[Main] 收到关闭信号，正在释放资源...");
    };

    #[cfg(unix)]
    let term = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("注册 SIGTERM 信号处理失败")
            .recv()
            .await;
        println!("\n[Main] 收到 SIGTERM 信号，正在释放资源...");
    };

    #[cfg(unix)]
    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }

    #[cfg(not(unix))]
    ctrl_c.await;
}
