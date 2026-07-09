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
    let listener = TcpListener::bind(addr).await.unwrap();

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

    let app = server::build_router();
    axum::serve(listener, app).await.unwrap();
}
