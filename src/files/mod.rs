pub mod watcher;

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: String,
}

/// 列出目录内容
pub fn list_dir(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(path);
    if !dir.exists() {
        return Err(format!("目录不存在: {}", path));
    }
    if !dir.is_dir() {
        return Err(format!("不是目录: {}", path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    match fs::read_dir(dir) {
        Ok(read_dir) => {
            for entry in read_dir.flatten() {
                let metadata = entry.metadata().unwrap_or_default();
                let path_buf = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                // 跳过隐藏文件（可选）
                // if name.starts_with('.') { continue; }

                let ext = path_buf
                    .extension()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                entries.push(FileEntry {
                    name,
                    path: path_buf.to_string_lossy().to_string(),
                    is_dir: metadata.is_dir(),
                    size: metadata.len(),
                    extension: ext,
                });
            }
        }
        Err(e) => return Err(e.to_string()),
    }

    // 排序：目录在前，然后按名称
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return b.is_dir.cmp(&a.is_dir);
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });

    Ok(entries)
}

/// 读取文件内容
pub fn read_file(path: &str) -> Result<String, String> {
    let file = Path::new(path);
    if !file.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    if !file.is_file() {
        return Err(format!("不是文件: {}", path));
    }

    // 限制文件大小（最大 1MB）
    let metadata = fs::metadata(file).map_err(|e| e.to_string())?;
    if metadata.len() > 1_048_576 {
        return Err("文件过大（超过 1MB），无法预览".into());
    }

    fs::read_to_string(file).map_err(|e| e.to_string())
}

/// 搜索文件（简单的文件名匹配）
pub fn search(base_path: &str, keyword: &str) -> Result<Vec<FileEntry>, String> {
    let base = Path::new(base_path);
    if !base.exists() {
        return Err(format!("搜索路径不存在: {}", base_path));
    }

    let mut results = Vec::new();
    let keyword_lower = keyword.to_lowercase();

    fn walk(dir: &Path, keyword: &str, results: &mut Vec<FileEntry>, depth: usize) {
        if depth > 5 {
            return; // 限制搜索深度
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                if name.to_lowercase().contains(keyword) {
                    let metadata = entry.metadata().unwrap_or_default();
                    let ext = path
                        .extension()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();

                    results.push(FileEntry {
                        name,
                        path: path.to_string_lossy().to_string(),
                        is_dir: metadata.is_dir(),
                        size: metadata.len(),
                        extension: ext,
                    });
                }

                if path.is_dir() && !name.starts_with('.') && name != "node_modules" && name != "target" {
                    walk(&path, keyword, results, depth + 1);
                }

                if results.len() >= 100 {
                    return;
                }
            }
        }
    }

    walk(base, &keyword_lower, &mut results, 0);
    Ok(results)
}
