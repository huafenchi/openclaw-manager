import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  Loader2,
  Download,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Cpu,
  Package,
  Key,
  Eye,
  EyeOff,
  Check,
  XCircle,
} from 'lucide-react';
import { setupLogger } from '../../lib/logger';
import type { OfficialProvider, ModelConfig } from '../../lib/tauri';

interface EnvironmentStatus {
  node_installed: boolean;
  node_version: string | null;
  node_version_ok: boolean;
  openclaw_installed: boolean;
  openclaw_version: string | null;
  config_dir_exists: boolean;
  ready: boolean;
  os: string;
}

interface InstallResult {
  success: boolean;
  message: string;
  error: string | null;
}

interface SetupProps {
  onComplete: () => void;
  /** 是否嵌入模式（嵌入到 Dashboard 中显示） */
  embedded?: boolean;
}

export function Setup({ onComplete, embedded = false }: SetupProps) {
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState<'nodejs' | 'openclaw' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'check' | 'install' | 'apikey' | 'complete'>('check');

  // API Key 相关
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const checkEnvironment = async () => {
    setupLogger.info('检查系统环境...');
    setChecking(true);
    setError(null);
    try {
      const status = await invoke<EnvironmentStatus>('check_environment');
      setupLogger.state('环境状态', status);
      setEnvStatus(status);

      if (status.ready) {
        setupLogger.info('✅ 环境就绪，进入 API Key 配置');
        setStep('apikey');
      } else {
        setupLogger.warn('环境未就绪，需要安装依赖');
        setStep('install');
      }
    } catch (e) {
      setupLogger.error('检查环境失败', e);
      setError(`检查环境失败: ${e}`);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    setupLogger.info('Setup 组件初始化');
    checkEnvironment();
  }, []);

  const handleInstallNodejs = async () => {
    setupLogger.action('安装 Node.js');
    setInstalling('nodejs');
    setError(null);

    try {
      const result = await invoke<InstallResult>('install_nodejs');

      if (result.success) {
        setupLogger.info('✅ Node.js 安装成功');
        await checkEnvironment();
      } else if (result.message.includes('重启')) {
        setError('Node.js 安装完成，请重启应用以使环境变量生效');
      } else {
        await invoke<string>('open_install_terminal', { installType: 'nodejs' });
        setError('已打开安装终端，请在终端中完成安装后点击"重新检查"');
      }
    } catch (e) {
      try {
        await invoke<string>('open_install_terminal', { installType: 'nodejs' });
        setError('已打开安装终端，请在终端中完成安装后点击"重新检查"');
      } catch (termErr) {
        setError(`安装失败: ${e}。${termErr}`);
      }
    } finally {
      setInstalling(null);
    }
  };

  const handleInstallOpenclaw = async () => {
    setupLogger.action('安装 OpenClaw');
    setInstalling('openclaw');
    setError(null);

    try {
      const result = await invoke<InstallResult>('install_openclaw');

      if (result.success) {
        setupLogger.info('✅ OpenClaw 安装成功，初始化配置...');
        await invoke<InstallResult>('init_openclaw_config');
        setupLogger.info('✅ 配置初始化完成');
        await checkEnvironment();
      } else {
        await invoke<string>('open_install_terminal', { installType: 'openclaw' });
        setError('已打开安装终端，请在终端中完成安装后点击"重新检查"');
      }
    } catch (e) {
      try {
        await invoke<string>('open_install_terminal', { installType: 'openclaw' });
        setError('已打开安装终端，请在终端中完成安装后点击"重新检查"');
      } catch (termErr) {
        setError(`安装失败: ${e}。${termErr}`);
      }
    } finally {
      setInstalling(null);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;

    setSavingKey(true);
    setKeyError(null);

    try {
      // 获取预设 Provider 列表
      const providers = await invoke<OfficialProvider[]>('get_official_providers');

      // 自动配置所有 Provider
      for (const provider of providers) {
        const models: ModelConfig[] = provider.suggested_models.map(m => ({
          id: m.id,
          name: m.name,
          api: provider.api_type,
          input: ['text', 'image'],
          context_window: m.context_window || 200000,
          max_tokens: m.max_tokens || 8192,
          reasoning: false,
          cost: null,
        }));

        await invoke('save_provider', {
          providerName: provider.id,
          baseUrl: provider.default_base_url,
          apiKey: apiKey.trim(),
          apiType: provider.api_type,
          models,
        });
      }

      // 设置默认主模型
      try {
        await invoke('set_primary_model', { modelId: 'clawgate-claude/claude-opus-4-6' });
      } catch {
        // 忽略
      }

      setupLogger.info('✅ ClawGate API Key 已配置');
      setStep('complete');
      setTimeout(() => onComplete(), 1500);
    } catch (e) {
      setupLogger.error('保存 API Key 失败', e);
      setKeyError('配置失败: ' + String(e));
    } finally {
      setSavingKey(false);
    }
  };

  const getOsName = (os: string) => {
    switch (os) {
      case 'windows': return 'Windows';
      case 'macos': return 'macOS';
      case 'linux': return 'Linux';
      default: return os;
    }
  };

  // 渲染内容
  const renderContent = () => {
    return (
      <AnimatePresence mode="wait">
        {/* 检查中 */}
        {checking && (
          <motion.div
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-6"
          >
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-3" />
            <p className="text-dark-300">正在检测系统环境...</p>
          </motion.div>
        )}

        {/* 安装步骤 */}
        {!checking && step === 'install' && envStatus && (
          <motion.div
            key="install"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* 步骤指示器 */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 pb-2">
              <span className="px-2 py-1 rounded bg-claw-500/20 text-claw-400">1. 环境安装</span>
              <ArrowRight size={12} />
              <span className="px-2 py-1 rounded bg-dark-600 text-gray-500">2. API Key</span>
              <ArrowRight size={12} />
              <span className="px-2 py-1 rounded bg-dark-600 text-gray-500">3. 完成</span>
            </div>

            {/* 系统信息 */}
            {!embedded && (
              <div className="flex items-center justify-between text-sm text-dark-400 pb-4 border-b border-dark-700">
                <span>操作系统</span>
                <span className="text-dark-200">{getOsName(envStatus.os)}</span>
              </div>
            )}

            {/* Node.js */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${envStatus.node_installed && envStatus.node_version_ok
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                  }`}>
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white font-medium">Node.js</p>
                  <p className="text-sm text-dark-400">
                    {envStatus.node_version
                      ? `${envStatus.node_version} ${envStatus.node_version_ok ? '✓' : '(需要 v22+)'}`
                      : '未安装'}
                  </p>
                </div>
              </div>
              {envStatus.node_installed && envStatus.node_version_ok ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <button
                  onClick={handleInstallNodejs}
                  disabled={installing !== null}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
                >
                  {installing === 'nodejs' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> 安装中...</>
                  ) : (
                    <><Download className="w-4 h-4" /> 安装</>
                  )}
                </button>
              )}
            </div>

            {/* OpenClaw */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${envStatus.openclaw_installed
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                  }`}>
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white font-medium">OpenClaw</p>
                  <p className="text-sm text-dark-400">
                    {envStatus.openclaw_version || '未安装'}
                  </p>
                </div>
              </div>
              {envStatus.openclaw_installed ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <button
                  onClick={handleInstallOpenclaw}
                  disabled={installing !== null || !envStatus.node_version_ok}
                  className={`btn-primary text-sm px-4 py-2 flex items-center gap-2 ${!envStatus.node_version_ok ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={!envStatus.node_version_ok ? '请先安装 Node.js' : ''}
                >
                  {installing === 'openclaw' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> 安装中...</>
                  ) : (
                    <><Download className="w-4 h-4" /> 安装</>
                  )}
                </button>
              )}
            </div>

            {/* 错误信息 */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"
              >
                <p className="text-yellow-400 text-sm">{error}</p>
              </motion.div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-4 border-t border-dark-700/50">
              <button
                onClick={checkEnvironment}
                disabled={checking || installing !== null}
                className="flex-1 btn-secondary py-2.5 flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                重新检查
              </button>
            </div>

            <div className="text-center pt-1">
              <a
                href="https://nodejs.org/en/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-dark-400 hover:text-brand-400 transition-colors inline-flex items-center gap-1"
              >
                手动下载 Node.js
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>
        )}

        {/* API Key 配置步骤 */}
        {!checking && step === 'apikey' && (
          <motion.div
            key="apikey"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* 步骤指示器 */}
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 pb-2">
              <span className="px-2 py-1 rounded bg-green-500/20 text-green-400">1. 环境安装 ✓</span>
              <ArrowRight size={12} />
              <span className="px-2 py-1 rounded bg-claw-500/20 text-claw-400">2. API Key</span>
              <ArrowRight size={12} />
              <span className="px-2 py-1 rounded bg-dark-600 text-gray-500">3. 完成</span>
            </div>

            <div className="text-center pb-2">
              <div className="w-14 h-14 rounded-xl bg-claw-500/20 flex items-center justify-center mx-auto mb-3">
                <Key size={28} className="text-claw-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">配置 ClawGate API Key</h3>
              <p className="text-sm text-gray-400">
                一个 Key 即可使用 Claude、GPT、Gemini 全部模型
              </p>
            </div>

            {/* Key 输入 */}
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setKeyError(null); }}
                  placeholder="sk-acw-..."
                  className="input-base pr-10 w-full text-center"
                  onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {keyError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                >
                  <p className="text-red-400 text-sm flex items-center gap-2">
                    <XCircle size={16} />
                    {keyError}
                  </p>
                </motion.div>
              )}

              <button
                onClick={handleSaveApiKey}
                disabled={savingKey || !apiKey.trim()}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-base"
              >
                {savingKey ? (
                  <><Loader2 size={18} className="animate-spin" /> 配置中...</>
                ) : (
                  <><Check size={18} /> 开始使用</>
                )}
              </button>
            </div>

            {/* 底部链接 */}
            <div className="flex items-center justify-between pt-2 border-t border-dark-700/50">
              <button
                onClick={() => {
                  setStep('complete');
                  setTimeout(() => onComplete(), 500);
                }}
                className="text-sm text-gray-500 hover:text-white transition-colors"
              >
                跳过，稍后配置
              </button>
              <a
                href="https://xiaoclaw.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-claw-400 hover:text-claw-300 inline-flex items-center gap-1"
              >
                获取 API Key
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>
        )}

        {/* 完成 */}
        {!checking && step === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10, delay: 0.1 }}
            >
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            </motion.div>
            <h3 className="text-lg font-bold text-white mb-1">配置完成！</h3>
            <p className="text-dark-400 text-sm">
              OpenClaw 已就绪，开始享受 AI 助手吧
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  // 嵌入模式
  if (embedded) {
    return (
      <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">环境配置</h2>
            <p className="text-dark-400 text-sm">检测到缺少必要的依赖，请完成以下安装</p>
          </div>
        </div>
        {renderContent()}
      </div>
    );
  }

  // 全屏模式
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-8">
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 mb-4 shadow-lg shadow-brand-500/25"
          >
            <span className="text-4xl">🦞</span>
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-2">ClawGate Manager</h1>
          <p className="text-dark-400">安装向导</p>
        </div>

        <motion.div
          layout
          className="glass-card rounded-2xl p-6 shadow-xl"
        >
          {renderContent()}
        </motion.div>

        <p className="text-center text-dark-500 text-xs mt-6">
          ClawGate Manager v0.1.0
        </p>
      </motion.div>
    </div>
  );
}
