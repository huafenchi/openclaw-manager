use crate::models::ServiceStatus;
use crate::utils::shell;
use tauri::command;
use std::process::Command;
use log::{info, debug};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows CREATE_NO_WINDOW 标志
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const SERVICE_PORT: u16 = 18789;

/// 检测端口是否有服务在监听，返回 PID
fn check_port_listening(port: u16) -> Option<u32> {
    #[cfg(unix)]
    {
        let output = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
            .ok()?;
        
        if output.status.success() {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .and_then(|line| line.trim().parse::<u32>().ok())
        } else {
            None
        }
    }
    
    #[cfg(windows)]
    {
        let mut cmd = Command::new("netstat");
        cmd.args(["-ano"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        let output = cmd.output().ok()?;
        
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains(&format!(":{}", port)) && line.contains("LISTENING") {
                    if let Some(pid_str) = line.split_whitespace().last() {
                        if let Ok(pid) = pid_str.parse::<u32>() {
                            return Some(pid);
                        }
                    }
                }
            }
        }
        None
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = port;
        None
    }
}

/// 获取服务状态
#[command]
pub async fn get_service_status() -> Result<ServiceStatus, String> {
    let pid = check_port_listening(SERVICE_PORT);
    let running = pid.is_some();
    
    Ok(ServiceStatus {
        running,
        pid,
        port: SERVICE_PORT,
        uptime_seconds: None,
        memory_mb: None,
        cpu_percent: None,
    })
}

/// 启动服务
#[command]
pub async fn start_service() -> Result<String, String> {
    info!("[服务] 启动服务...");
    
    let status = get_service_status().await?;
    if status.running {
        info!("[服务] 服务已在运行中");
        return Err("服务已在运行中".to_string());
    }
    
    let openclaw_path = shell::get_openclaw_path();
    if openclaw_path.is_none() {
        info!("[服务] 找不到 openclaw 命令");
        return Err("找不到 openclaw 命令，请先安装 OpenClaw".to_string());
    }
    info!("[服务] openclaw 路径: {:?}", openclaw_path);
    
    info!("[服务] 后台启动 gateway...");
    shell::spawn_openclaw_gateway()
        .map_err(|e| format!("启动服务失败: {}", e))?;
    
    info!("[服务] 等待端口 {} 开始监听...", SERVICE_PORT);
    for i in 1..=15 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        if let Some(pid) = check_port_listening(SERVICE_PORT) {
            info!("[服务] ✓ 启动成功 ({}秒), PID: {}", i, pid);
            return Ok(format!("服务已启动，PID: {}", pid));
        }
        if i % 3 == 0 {
            debug!("[服务] 等待中... ({}秒)", i);
        }
    }
    
    info!("[服务] 等待超时");
    Err("服务启动超时（15秒），请检查 openclaw 日志".to_string())
}

/// 获取监听指定端口的所有 PID
fn get_pids_on_port(port: u16) -> Vec<u32> {
    #[cfg(unix)]
    {
        let output = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output();
        
        match output {
            Ok(out) if out.status.success() => {
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .filter_map(|line| line.trim().parse::<u32>().ok())
                    .collect()
            }
            _ => vec![],
        }
    }
    
    #[cfg(windows)]
    {
        let mut cmd = Command::new("netstat");
        cmd.args(["-ano"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        match cmd.output() {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout.lines()
                    .filter(|line| line.contains(&format!(":{}", port)) && line.contains("LISTENING"))
                    .filter_map(|line| line.split_whitespace().last())
                    .filter_map(|pid_str| pid_str.parse::<u32>().ok())
                    .collect()
            }
            _ => vec![],
        }
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = port;
        vec![]
    }
}

/// 通过 PID 杀死进程
fn kill_process(pid: u32, force: bool) -> bool {
    info!("[服务] 杀死进程 PID: {}, force: {}", pid, force);
    
    #[cfg(unix)]
    {
        let signal = if force { "-9" } else { "-TERM" };
        Command::new("kill")
            .args([signal, &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        if force {
            cmd.args(["/F", "/PID", &pid.to_string()]);
        } else {
            cmd.args(["/PID", &pid.to_string()]);
        }
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = (pid, force);
        false
    }
}

/// 停止服务
#[command]
pub async fn stop_service() -> Result<String, String> {
    info!("[服务] 停止服务...");
    
    let pids = get_pids_on_port(SERVICE_PORT);
    if pids.is_empty() {
        info!("[服务] 端口 {} 无进程监听", SERVICE_PORT);
        return Ok("服务未在运行".to_string());
    }
    
    info!("[服务] 发现 {} 个进程: {:?}", pids.len(), pids);
    
    // SIGTERM
    for &pid in &pids {
        kill_process(pid, false);
    }
    std::thread::sleep(std::time::Duration::from_secs(2));
    
    let remaining = get_pids_on_port(SERVICE_PORT);
    if remaining.is_empty() {
        info!("[服务] ✓ 已停止");
        return Ok("服务已停止".to_string());
    }
    
    // SIGKILL
    info!("[服务] 强制终止 {} 个进程...", remaining.len());
    for &pid in &remaining {
        kill_process(pid, true);
    }
    std::thread::sleep(std::time::Duration::from_secs(1));
    
    let still_running = get_pids_on_port(SERVICE_PORT);
    if still_running.is_empty() {
        info!("[服务] ✓ 已强制停止");
        Ok("服务已停止".to_string())
    } else {
        Err(format!("无法停止服务，仍有进程: {:?}", still_running))
    }
}

/// 重启服务
#[command]
pub async fn restart_service() -> Result<String, String> {
    info!("[服务] 重启服务...");
    let _ = stop_service().await;
    std::thread::sleep(std::time::Duration::from_secs(1));
    start_service().await
}

/// 获取日志 — 跨平台实现（不依赖 tail 命令）
#[command]
pub async fn get_logs(lines: Option<u32>) -> Result<Vec<String>, String> {
    let n = lines.unwrap_or(100) as usize;
    
    let config_dir = crate::utils::platform::get_config_dir();
    
    let log_files = vec![
        format!("{}/logs/gateway.log", config_dir),
        format!("{}/logs/gateway.err.log", config_dir),
        format!("{}/stderr.log", config_dir),
        format!("{}/stdout.log", config_dir),
    ];
    
    let mut all_lines: Vec<String> = Vec::new();
    
    for log_file in &log_files {
        let path = std::path::Path::new(log_file);
        if !path.exists() {
            continue;
        }
        
        // 跨平台：直接用 Rust 读文件尾部
        match std::fs::read_to_string(path) {
            Ok(content) => {
                let file_lines: Vec<&str> = content.lines().collect();
                let start = if file_lines.len() > n { file_lines.len() - n } else { 0 };
                for line in &file_lines[start..] {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        all_lines.push(trimmed.to_string());
                    }
                }
            }
            Err(_) => continue,
        }
    }
    
    // 按时间戳排序、去重
    all_lines.sort();
    all_lines.dedup();
    let total = all_lines.len();
    if total > n {
        all_lines = all_lines.split_off(total - n);
    }
    
    Ok(all_lines)
}
