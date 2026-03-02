import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Star,
  Sparkles,
  Zap,
  CheckCircle,
  XCircle,
  Cpu,
  Server,
  ChevronDown,
  Key,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';
import { aiLogger } from '../../lib/logger';
import type {
  OfficialProvider,
  ConfiguredProvider,
  AIConfigOverview,
  ModelConfig,
  AITestResult,
} from '../../lib/tauri';

// ============ Provider 模型卡片 ============

interface ProviderSectionProps {
  provider: ConfiguredProvider;
  officialInfo: OfficialProvider | undefined;
  onSetPrimary: (modelId: string) => void;
}

function ProviderSection({ provider, officialInfo, onSetPrimary }: ProviderSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-dark-700 rounded-xl border border-dark-500 overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-dark-600/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xl">{officialInfo?.icon || '🔌'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white">{provider.name}</h3>
            {provider.has_api_key && (
              <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                已配置
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{provider.base_url}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{provider.models.length} 模型</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
            <ChevronDown size={18} className="text-gray-500" />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-dark-600"
          >
            <div className="p-4 space-y-2">
              {provider.models.map(model => (
                <div
                  key={model.full_id}
                  className={clsx(
                    'flex items-center justify-between p-3 rounded-lg border transition-all',
                    model.is_primary
                      ? 'bg-claw-500/10 border-claw-500/50'
                      : 'bg-dark-600 border-dark-500'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Cpu size={16} className={model.is_primary ? 'text-claw-400' : 'text-gray-500'} />
                    <div>
                      <p className={clsx(
                        'text-sm font-medium',
                        model.is_primary ? 'text-white' : 'text-gray-300'
                      )}>
                        {model.name}
                        {model.is_primary && (
                          <span className="ml-2 text-xs text-claw-400">
                            <Star size={12} className="inline -mt-0.5" /> 主模型
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{model.full_id}</p>
                    </div>
                  </div>
                  {!model.is_primary && (
                    <button
                      onClick={() => onSetPrimary(model.full_id)}
                      className="text-xs text-gray-500 hover:text-claw-400 transition-colors"
                    >
                      设为主模型
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============ 主组件 ============

export function AIConfig() {
  const [loading, setLoading] = useState(true);
  const [officialProviders, setOfficialProviders] = useState<OfficialProvider[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfigOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AITestResult | null>(null);

  // ClawGate Key 输入
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 是否已配置（至少有一个 provider 有 key）
  const isConfigured = aiConfig?.configured_providers.some(p => p.has_api_key) ?? false;
  const currentKeyMasked = aiConfig?.configured_providers.find(p => p.has_api_key)?.api_key_masked;

  const runAITest = async () => {
    aiLogger.action('测试 AI 连接');
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<AITestResult>('test_ai_connection');
      setTestResult(result);
      if (result.success) {
        aiLogger.info(`✅ AI 连接测试成功，延迟: ${result.latency_ms}ms`);
      } else {
        aiLogger.warn(`❌ AI 连接测试失败: ${result.error}`);
      }
    } catch (e) {
      aiLogger.error('AI 测试失败', e);
      setTestResult({
        success: false,
        provider: 'unknown',
        model: 'unknown',
        response: null,
        error: String(e),
        latency_ms: null,
      });
    } finally {
      setTesting(false);
    }
  };

  const loadData = useCallback(async () => {
    aiLogger.info('AIConfig 组件加载数据...');
    setError(null);

    try {
      const [officials, config] = await Promise.all([
        invoke<OfficialProvider[]>('get_official_providers'),
        invoke<AIConfigOverview>('get_ai_config'),
      ]);
      setOfficialProviders(officials);
      setAiConfig(config);
      aiLogger.info(`加载完成: ${officials.length} 个 Provider 预设, ${config.configured_providers.length} 个已配置`);
    } catch (e) {
      aiLogger.error('加载 AI 配置失败', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSetPrimary = async (modelId: string) => {
    try {
      await invoke('set_primary_model', { modelId });
      aiLogger.info(`主模型已设置为: ${modelId}`);
      loadData();
    } catch (e) {
      aiLogger.error('设置主模型失败', e);
      alert('设置失败: ' + e);
    }
  };

  // 一键保存 ClawGate API Key → 自动配置所有 Provider
  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // 遍历所有预设 Provider，逐个保存
      for (const provider of officialProviders) {
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

      // 设置默认主模型（Claude Opus 4.6）
      if (!aiConfig?.primary_model) {
        try {
          await invoke('set_primary_model', { modelId: 'clawgate-claude/claude-opus-4-6' });
        } catch {
          // 忽略，可能已经设置过
        }
      }

      aiLogger.info('✅ ClawGate API Key 已保存，所有 Provider 已配置');
      setSaveSuccess(true);
      setApiKey('');

      // 重新加载
      await loadData();

      // 3 秒后清除成功提示
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      aiLogger.error('保存 API Key 失败', e);
      setSaveError('保存失败: ' + String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-claw-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-4xl space-y-6">
        {/* 错误提示 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-300">
            <p className="font-medium mb-1">加载配置失败</p>
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={loadData}
              className="mt-2 text-sm text-red-300 hover:text-white underline"
            >
              重试
            </button>
          </div>
        )}

        {/* ClawGate API Key 配置卡片 */}
        <div className="bg-gradient-to-br from-dark-700 to-dark-800 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Sparkles size={22} className="text-claw-400" />
                ClawGate AI 配置
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                输入 API Key 即可使用 Claude、GPT、Gemini 全部模型
              </p>
            </div>
            <a
              href="https://xiaoclaw.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-claw-400 hover:text-claw-300 flex items-center gap-1"
            >
              获取 Key
              <ExternalLink size={14} />
            </a>
          </div>

          {/* API Key 输入区 */}
          <div className="bg-dark-600/50 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-claw-500/20 flex items-center justify-center flex-shrink-0">
                <Key size={20} className="text-claw-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-400">ClawGate API Key</p>
                {isConfigured && currentKeyMasked ? (
                  <p className="text-sm text-green-400 flex items-center gap-1">
                    <CheckCircle size={14} />
                    已配置: <code className="text-gray-300">{currentKeyMasked}</code>
                  </p>
                ) : (
                  <p className="text-sm text-yellow-400">未配置</p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setSaveError(null); }}
                  placeholder={isConfigured ? '输入新 Key 替换现有配置' : 'sk-acw-...'}
                  className="input-base pr-10 w-full"
                  onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                onClick={handleSaveKey}
                disabled={saving || !apiKey.trim()}
                className="btn-primary flex items-center gap-2 px-5"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                {isConfigured ? '更新' : '保存'}
              </button>
            </div>

            {/* 保存成功 */}
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-green-400 text-sm"
              >
                <CheckCircle size={16} />
                API Key 已保存，所有 Provider 已自动配置
              </motion.div>
            )}

            {/* 保存失败 */}
            {saveError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
              >
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <XCircle size={16} />
                  {saveError}
                </p>
              </motion.div>
            )}
          </div>

          {/* 主模型 + 测试 */}
          <div className="mt-5 bg-dark-600/50 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-claw-500/20 flex items-center justify-center">
              <Star size={24} className="text-claw-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-400">当前主模型</p>
              {aiConfig?.primary_model ? (
                <p className="text-lg font-medium text-white">{aiConfig.primary_model}</p>
              ) : (
                <p className="text-lg text-gray-500">未设置</p>
              )}
            </div>
            <div className="text-right mr-4">
              <p className="text-sm text-gray-500">
                {aiConfig?.available_models.length || 0} 个可用模型
              </p>
            </div>
            <button
              onClick={runAITest}
              disabled={testing || !aiConfig?.primary_model}
              className="btn-secondary flex items-center gap-2"
            >
              {testing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              测试连接
            </button>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx(
                'mt-4 p-4 rounded-xl',
                testResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                {testResult.success ? (
                  <CheckCircle size={20} className="text-green-400" />
                ) : (
                  <XCircle size={20} className="text-red-400" />
                )}
                <div className="flex-1">
                  <p className={clsx('font-medium', testResult.success ? 'text-green-400' : 'text-red-400')}>
                    {testResult.success ? '连接成功' : '连接失败'}
                  </p>
                  {testResult.latency_ms && (
                    <p className="text-xs text-gray-400">响应时间: {testResult.latency_ms}ms</p>
                  )}
                </div>
                <button
                  onClick={() => setTestResult(null)}
                  className="text-gray-500 hover:text-white text-sm"
                >
                  关闭
                </button>
              </div>

              {testResult.response && (
                <div className="mt-2 p-3 bg-dark-700 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">AI 响应:</p>
                  <p className="text-sm text-white whitespace-pre-wrap">{testResult.response}</p>
                </div>
              )}

              {testResult.error && (
                <div className="mt-2 p-3 bg-red-500/10 rounded-lg">
                  <p className="text-xs text-red-400 mb-1">错误信息:</p>
                  <p className="text-sm text-red-300 whitespace-pre-wrap">{testResult.error}</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* 已配置的 Provider 列表 */}
        {aiConfig && aiConfig.configured_providers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Server size={18} className="text-gray-500" />
                模型列表
              </h3>
              <button
                onClick={loadData}
                className="text-sm text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={14} />
                刷新
              </button>
            </div>

            <div className="space-y-3">
              {aiConfig.configured_providers.map(provider => {
                const officialInfo = officialProviders.find(p =>
                  provider.name.includes(p.id) || p.id === provider.name
                );
                return (
                  <ProviderSection
                    key={provider.name}
                    provider={provider}
                    officialInfo={officialInfo}
                    onSetPrimary={handleSetPrimary}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 未配置时的引导 */}
        {aiConfig && aiConfig.configured_providers.length === 0 && (
          <div className="bg-dark-700 rounded-xl border border-dark-500 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-600 flex items-center justify-center">
              <Key size={24} className="text-gray-500" />
            </div>
            <p className="text-gray-400 mb-2">输入 ClawGate API Key 后自动配置所有模型</p>
            <p className="text-sm text-gray-500">
              支持 Claude (Opus/Sonnet/Haiku)、GPT-5、Gemini 2.5 等 16+ 模型
            </p>
          </div>
        )}

        {/* 配置说明 */}
        <div className="bg-dark-700/50 rounded-xl p-4 border border-dark-500">
          <h4 className="text-sm font-medium text-gray-400 mb-2">说明</h4>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>• 一个 ClawGate Key 即可使用所有 AI 模型（Claude、GPT、Gemini）</li>
            <li>• 主模型用于 Agent 的默认推理，可随时在模型列表中切换</li>
            <li>• 修改配置后需要重启服务生效</li>
            <li>• 获取 API Key: <a href="https://xiaoclaw.com" target="_blank" rel="noopener noreferrer" className="text-claw-400 hover:text-claw-300">xiaoclaw.com</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
