import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { StatusCard } from './StatusCard';
import { QuickActions } from './QuickActions';
import { SystemInfo } from './SystemInfo';
import { Setup } from '../Setup';
import { api, ServiceStatus, isTauri } from '../../lib/tauri';
import {
  Terminal,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';
import { EnvironmentStatus } from '../../App';

interface InstallResult {
  success: boolean;
  message: string;
  error?: string | null;
}

interface DashboardProps {
  envStatus: EnvironmentStatus | null;
  onSetupComplete: () => void;
}

export function Dashboard({ envStatus, onSetupComplete }: DashboardProps) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // 安装/卸载状态
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);

  const fetchStatus = async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const result = await api.getServiceStatus();
      setStatus(result);
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    if (!isTauri()) return;
    try {
      const result = await invoke<string[]>('get_logs', { lines: 50 });
      setLogs(result);
    } catch {
      // 静默处理
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    if (!isTauri()) return;

    const statusInterval = setInterval(fetchStatus, 3000);
    const logsInterval = autoRefreshLogs ? setInterval(fetchLogs, 2000) : null;

    return () => {
      clearInterval(statusInterval);
      if (logsInterval) clearInterval(logsInterval);
    };
  }, [autoRefreshLogs]);

  useEffect(() => {
    if (logsExpanded && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, logsExpanded]);

  const handleStart = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    try {
      await api.startService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('启动失败:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    try {
      await api.stopService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('停止失败:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!isTauri()) return;
    setActionLoading(true);
    try {
      await api.restartService();
      await fetchStatus();
      await fetchLogs();
    } catch (e) {
      console.error('重启失败:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleInstallOpenClaw = async () => {
    setInstalling(true);
    setInstallResult(null);
    try {
      const result = await invoke<InstallResult>('install_openclaw');
      if (result.success) {
        await invoke<InstallResult>('init_openclaw_config');
        setInstallResult({ success: true, message: 'OpenClaw 安装成功！' });
        onSetupComplete();
      } else {
        setInstallResult(result);
      }
    } catch (e) {
      setInstallResult({ success: false, message: '安装失败', error: String(e) });
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstallOpenClaw = async () => {
    if (!confirm('确定要卸载 OpenClaw 吗？配置文件将保留。')) return;
    setUninstalling(true);
    setInstallResult(null);
    try {
      const result = await invoke<InstallResult>('uninstall_openclaw');
      setInstallResult(result);
      if (result.success) {
        onSetupComplete(); // 触发环境重新检测
      }
    } catch (e) {
      setInstallResult({ success: false, message: '卸载失败', error: String(e) });
    } finally {
      setUninstalling(false);
    }
  };

  const getLogLineClass = (line: string) => {
    if (line.includes('error') || line.includes('Error') || line.includes('ERROR')) return 'text-red-400';
    if (line.includes('warn') || line.includes('Warn') || line.includes('WARN')) return 'text-yellow-400';
    if (line.includes('info') || line.includes('Info') || line.includes('INFO')) return 'text-green-400';
    return 'text-gray-400';
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  const needsSetup = envStatus && !envStatus.ready;
  const openclawInstalled = envStatus?.openclaw_installed ?? false;

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {/* 环境安装向导（仅在缺少 Node.js 时显示完整向导） */}
        {needsSetup && (!envStatus?.node_version_ok) && (
          <motion.div variants={itemVariants}>
            <Setup onComplete={onSetupComplete} embedded />
          </motion.div>
        )}

        {/* OpenClaw 安装/管理卡片 — 始终显示 */}
        <motion.div variants={itemVariants}>
          <div className="bg-gradient-to-br from-dark-700 to-dark-800 rounded-2xl p-6 border border-dark-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-claw-500/20 flex items-center justify-center">
                  <span className="text-xl">🦞</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">OpenClaw</h2>
                  <p className="text-xs text-gray-500">
                    {openclawInstalled
                      ? `已安装 · ${envStatus?.openclaw_version || ''}`
                      : '未安装'}
                  </p>
                </div>
              </div>

              {/* 状态标签 */}
              <div className={clsx(
                'px-3 py-1 rounded-full text-xs font-medium',
                openclawInstalled
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              )}>
                {openclawInstalled ? '✓ 已安装' : '未安装'}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              {!openclawInstalled ? (
                <button
                  onClick={handleInstallOpenClaw}
                  disabled={installing || !envStatus?.node_version_ok}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 text-sm"
                >
                  {installing ? (
                    <><Loader2 size={16} className="animate-spin" /> 安装中...</>
                  ) : (
                    <><Download size={16} /> 一键安装 OpenClaw</>
                  )}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleInstallOpenClaw}
                    disabled={installing}
                    className="flex-1 btn-secondary py-2.5 flex items-center justify-center gap-2 text-sm"
                  >
                    {installing ? (
                      <><Loader2 size={16} className="animate-spin" /> 重装中...</>
                    ) : (
                      <><RefreshCw size={16} /> 重新安装</>
                    )}
                  </button>
                  <button
                    onClick={handleUninstallOpenClaw}
                    disabled={uninstalling}
                    className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg flex items-center gap-2 text-sm transition-colors"
                  >
                    {uninstalling ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    卸载
                  </button>
                </>
              )}
            </div>

            {/* Node.js 缺失提示 */}
            {!envStatus?.node_version_ok && !openclawInstalled && (
              <p className="text-xs text-yellow-400 mt-3">
                ⚠ 需要先安装 Node.js v22+ 才能安装 OpenClaw
              </p>
            )}

            {/* 安装/卸载结果 */}
            {installResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  'mt-3 p-3 rounded-lg flex items-start gap-2',
                  installResult.success
                    ? 'bg-green-500/10 border border-green-500/30'
                    : 'bg-red-500/10 border border-red-500/30'
                )}
              >
                {installResult.success ? (
                  <CheckCircle size={16} className="text-green-400 mt-0.5" />
                ) : (
                  <XCircle size={16} className="text-red-400 mt-0.5" />
                )}
                <div>
                  <p className={clsx('text-sm', installResult.success ? 'text-green-400' : 'text-red-400')}>
                    {installResult.message}
                  </p>
                  {installResult.error && (
                    <p className="text-xs text-red-400/70 mt-1">{installResult.error}</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* 官网链接 */}
            <div className="mt-4 pt-3 border-t border-dark-600">
              <a
                href="https://xiaoclaw.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-claw-400 flex items-center gap-1 transition-colors"
              >
                Powered by ClawGate
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </motion.div>

        {/* 服务状态 + 快捷操作（仅 OpenClaw 已安装时显示） */}
        {openclawInstalled && (
          <>
            <motion.div variants={itemVariants}>
              <StatusCard status={status} loading={loading} />
            </motion.div>

            <motion.div variants={itemVariants}>
              <QuickActions
                status={status}
                loading={actionLoading}
                onStart={handleStart}
                onStop={handleStop}
                onRestart={handleRestart}
              />
            </motion.div>
          </>
        )}

        {/* 实时日志（可折叠，默认收起） */}
        {openclawInstalled && (
          <motion.div variants={itemVariants}>
            <div className="bg-dark-700 rounded-2xl border border-dark-500 overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 bg-dark-600/50 cursor-pointer"
                onClick={() => setLogsExpanded(!logsExpanded)}
              >
                <div className="flex items-center gap-2">
                  <Terminal size={16} className="text-gray-500" />
                  <span className="text-sm font-medium text-white">实时日志</span>
                  <span className="text-xs text-gray-500">({logs.length} 行)</span>
                </div>
                <div className="flex items-center gap-3">
                  {logsExpanded && (
                    <>
                      <label
                        className="flex items-center gap-2 text-xs text-gray-400"
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={autoRefreshLogs}
                          onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                          className="w-3 h-3 rounded border-dark-500 bg-dark-600 text-claw-500"
                        />
                        自动刷新
                      </label>
                      <button
                        onClick={(e) => { e.stopPropagation(); fetchLogs(); }}
                        className="text-gray-500 hover:text-white"
                        title="刷新日志"
                      >
                        <RefreshCw size={14} />
                      </button>
                    </>
                  )}
                  {logsExpanded ? (
                    <ChevronUp size={16} className="text-gray-500" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-500" />
                  )}
                </div>
              </div>

              {logsExpanded && (
                <div ref={logsContainerRef} className="h-64 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-dark-800">
                  {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-500">
                      <p>暂无日志，请先启动服务</p>
                    </div>
                  ) : (
                    logs.map((line, index) => (
                      <div
                        key={index}
                        className={clsx('py-0.5 whitespace-pre-wrap break-all', getLogLineClass(line))}
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* 系统信息 */}
        <motion.div variants={itemVariants}>
          <SystemInfo />
        </motion.div>
      </motion.div>
    </div>
  );
}
