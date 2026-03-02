use std::env;

/// 获取操作系统类型
pub fn get_os() -> String {
    env::consts::OS.to_string()
}

/// 获取系统架构
pub fn get_arch() -> String {
    env::consts::ARCH.to_string()
}

/// 获取配置目录路径
pub fn get_config_dir() -> String {
    if let Some(home) = dirs::home_dir() {
        if is_windows() {
            format!("{}\\.openclaw", home.display())
        } else {
            format!("{}/.openclaw", home.display())
        }
    } else {
        // 兜底：使用系统配置目录而非 /tmp（/tmp 全世界可写，不安全）
        if let Some(config) = dirs::config_dir() {
            if is_windows() {
                format!("{}\\openclaw", config.display())
            } else {
                format!("{}/openclaw", config.display())
            }
        } else if is_windows() {
            String::from("C:\\ProgramData\\openclaw")
        } else {
            // 最后兜底：仍比 /tmp 安全
            String::from("/var/lib/openclaw")
        }
    }
}

/// 获取环境变量文件路径
pub fn get_env_file_path() -> String {
    if is_windows() {
        format!("{}\\env", get_config_dir())
    } else {
        format!("{}/env", get_config_dir())
    }
}

/// 获取 openclaw.json 配置文件路径
pub fn get_config_file_path() -> String {
    if is_windows() {
        format!("{}\\openclaw.json", get_config_dir())
    } else {
        format!("{}/openclaw.json", get_config_dir())
    }
}

/// 获取日志文件路径
pub fn get_log_file_path() -> String {
    if is_windows() {
        format!("{}\\logs\\gateway.err.log", get_config_dir())
    } else {
        format!("{}/logs/gateway.err.log", get_config_dir())
    }
}

/// 检测当前平台是否为 macOS
pub fn is_macos() -> bool {
    env::consts::OS == "macos"
}

/// 检测当前平台是否为 Windows
pub fn is_windows() -> bool {
    env::consts::OS == "windows"
}

/// 检测当前平台是否为 Linux
pub fn is_linux() -> bool {
    env::consts::OS == "linux"
}
