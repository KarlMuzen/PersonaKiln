import React, { useState } from 'react';
import type { ConnectionProfile } from '../../db';
import { sendLLMRequest, validateAndCleanBaseUrl } from '../../services/llmAdapter';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from '../../constants/models';
import { OpenRouterModelPicker } from '../OpenRouterModelPicker';
import { useDialogStore } from '../../store/useDialogStore';
import {
  Key,
  CheckCircle2,
  Sliders,
  Trash2,
  Zap,
  Activity,
  Globe,
  Eye,
  EyeOff,
  Coins,
} from 'lucide-react';

export interface ConnectionProfilesSectionProps {
  profiles: ConnectionProfile[];
  activeProfileUuid: string | null;
  setActiveProfileUuid: (uuid: string) => void;
  saveProfile: (profile: ConnectionProfile) => Promise<void>;
  deleteProfile: (uuid: string) => Promise<void>;
  isPassphraseSet?: boolean;
}

export const ConnectionProfilesSection: React.FC<ConnectionProfilesSectionProps> = ({
  profiles,
  activeProfileUuid,
  setActiveProfileUuid,
  saveProfile,
  deleteProfile,
  isPassphraseSet = false,
}) => {
  const [editingProfile, setEditingProfile] = useState<Partial<ConnectionProfile>>({
    name: '',
    provider: 'gemini',
    model: DEFAULT_GEMINI_MODEL,
    apiKey: '',
    baseUrl: '',
    temperature: 0.7,
    maxTokens: 2048,
    customPromptPricePer1K: undefined,
    customCompletionPricePer1K: undefined,
  });

  const [activeTab, setActiveTab] = useState<'basic' | 'parameters' | 'advanced'>('basic');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPricingOverride, setShowPricingOverride] = useState(false);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; message?: string; success?: boolean } | null>(null);

  const activeProfile = profiles.find((p) => p.uuid === activeProfileUuid);

  // Preset Template Quick Selectors
  const applyPreset = (preset: 'gemini' | 'openai' | 'openrouter' | 'ollama') => {
    setShowPricingOverride(false);
    switch (preset) {
      case 'gemini':
        setEditingProfile({
          name: 'Google Gemini Flash',
          provider: 'gemini',
          model: DEFAULT_GEMINI_MODEL,
          apiKey: '',
          baseUrl: '',
          temperature: 0.7,
          maxTokens: 2048,
          customPromptPricePer1K: undefined,
          customCompletionPricePer1K: undefined,
        });
        break;
      case 'openai':
        setEditingProfile({
          name: 'OpenAI GPT-4o Mini',
          provider: 'openai',
          model: DEFAULT_OPENAI_MODEL,
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          temperature: 0.7,
          maxTokens: 2048,
          customPromptPricePer1K: undefined,
          customCompletionPricePer1K: undefined,
        });
        break;
      case 'openrouter':
        setEditingProfile({
          name: 'OpenRouter DeepSeek R1',
          provider: 'openrouter',
          model: DEFAULT_OPENROUTER_MODEL,
          apiKey: '',
          baseUrl: 'https://openrouter.ai/api/v1',
          temperature: 0.7,
          maxTokens: 2048,
          customPromptPricePer1K: undefined,
          customCompletionPricePer1K: undefined,
        });
        break;
      case 'ollama':
        setEditingProfile({
          name: 'Local Ollama Llama3',
          provider: 'ollama',
          model: DEFAULT_OLLAMA_MODEL,
          apiKey: '',
          baseUrl: 'http://localhost:11434/v1',
          temperature: 0.7,
          maxTokens: 2048,
          customPromptPricePer1K: undefined,
          customCompletionPricePer1K: undefined,
        });
        break;
    }
  };

  const handleTestConnection = async (profToTest?: ConnectionProfile) => {
    const target = profToTest || (editingProfile as ConnectionProfile);
    if (!target.provider) {
      await useDialogStore.getState().showAlert('Please specify a provider first.', 'Missing Provider', 'warning');
      return;
    }

    setTestStatus({ loading: true });
    const startTime = Date.now();

    try {
      const res = await sendLLMRequest(target as ConnectionProfile, {
        messages: [{ role: 'user', content: 'Respond with exactly the single word OK.' }],
        maxTokens: 10,
        temperature: 0.1,
      });

      const elapsed = Date.now() - startTime;
      setTestStatus({
        loading: false,
        success: true,
        message: `Connected successfully in ${elapsed}ms! Response: "${res.text.trim()}"`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTestStatus({
        loading: false,
        success: false,
        message: `Connection failed: ${message}`,
      });
    }
  };

  const handleSaveProfile = async () => {
    if (!editingProfile.name) {
      await useDialogStore.getState().showAlert('Profile name is required.', 'Validation Error', 'warning');
      return;
    }

    if (!editingProfile.apiKey && editingProfile.provider !== 'ollama' && editingProfile.provider !== 'custom') {
      await useDialogStore.getState().showAlert(`API Key is required for ${editingProfile.provider || 'gemini'}. Please enter your API key.`, 'Missing API Key', 'warning');
      return;
    }

    let cleanBaseUrl = editingProfile.baseUrl?.trim() || undefined;
    if (cleanBaseUrl) {
      try {
        cleanBaseUrl = validateAndCleanBaseUrl(cleanBaseUrl);
      } catch (err) {
        await useDialogStore.getState().showAlert(
          err instanceof Error ? err.message : String(err),
          'Invalid Base URL',
          'warning'
        );
        return;
      }
    }

    const prof: ConnectionProfile = {
      uuid: editingProfile.uuid || crypto.randomUUID(),
      name: editingProfile.name,
      provider: editingProfile.provider || 'gemini',
      model: editingProfile.model || DEFAULT_GEMINI_MODEL,
      apiKey: editingProfile.apiKey,
      baseUrl: cleanBaseUrl,
      temperature: editingProfile.temperature ?? 0.7,
      maxTokens: editingProfile.maxTokens ?? 2048,
      customPromptPricePer1K: editingProfile.customPromptPricePer1K,
      customCompletionPricePer1K: editingProfile.customCompletionPricePer1K,
      isDefault: editingProfile.isDefault ?? (profiles.length === 0 || editingProfile.uuid === activeProfileUuid),
    };

    try {
      await saveProfile(prof);
    } catch (err) {
      await useDialogStore.getState().showAlert(
        err instanceof Error ? err.message : String(err),
        'Failed to Save Profile',
        'danger'
      );
      return;
    }
    setEditingProfile({
      name: '',
      provider: 'gemini',
      model: DEFAULT_GEMINI_MODEL,
      apiKey: '',
      baseUrl: '',
      temperature: 0.7,
      maxTokens: 2048,
      customPromptPricePer1K: undefined,
      customCompletionPricePer1K: undefined,
    });
    setShowPricingOverride(false);
    setTestStatus({
      loading: false,
      success: true,
      message: `Profile "${prof.name}" saved successfully to local database and activated!`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Active Profile Quick Status Bar */}
      {activeProfile && (
        <div className="bg-maroon-950/40 border border-maroon-800/60 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-maroon-500/30 text-maroon-300 border border-maroon-400/30 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-maroon-400 uppercase font-semibold block">Active Connection</span>
              <span className="font-semibold text-mist-100">{activeProfile.name}</span>
              <span className="text-knight-400 ml-2 font-mono text-[11px]">
                ({activeProfile.provider} • {activeProfile.model})
              </span>
            </div>
          </div>

          <button
            onClick={() => handleTestConnection(activeProfile)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 text-white rounded-xl text-xs font-medium shadow-sm transition-all"
          >
            <Activity className="w-3.5 h-3.5" /> Test Active Connection
          </button>
        </div>
      )}

      {/* Connection Profiles List */}
      <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-knight-700/40 pb-3">
          <h3 className="text-sm font-semibold text-mist-100 flex items-center gap-2">
            <Key className="w-4 h-4 text-maroon-400" />
            Configured Connection Profiles ({profiles.length})
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {profiles.length === 0 ? (
            <p className="text-xs text-knight-500 col-span-2">No connection profiles configured yet. Add one below!</p>
          ) : (
            profiles.map((p) => {
              const isActive = activeProfileUuid === p.uuid;

              return (
                <div
                  key={p.uuid}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isActive
                      ? 'bg-void-800/90 border-maroon-400 shadow-sm'
                      : 'bg-void-950/40 border-knight-700/40 hover:border-knight-700'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <button
                      onClick={() => setActiveProfileUuid(p.uuid)}
                      className={`p-1 rounded-full shrink-0 ${
                        isActive ? 'text-maroon-400' : 'text-knight-500 hover:text-knight-400'
                      }`}
                      title="Set as active profile"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <div className="truncate">
                      <h4 className="text-xs font-semibold text-mist-100 truncate">{p.name}</h4>
                      <p className="text-[10px] text-knight-400 font-mono truncate">
                        {p.provider} • {p.model}
                      </p>
                      <span className="text-[9px] text-knight-500">
                        Temp: {p.temperature ?? 0.7} | Max: {p.maxTokens ?? 2048}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingProfile(p);
                        if (p.customPromptPricePer1K !== undefined || p.customCompletionPricePer1K !== undefined) {
                          setShowPricingOverride(true);
                        } else {
                          setShowPricingOverride(false);
                        }
                      }}
                      aria-label={`Edit ${p.name}`}
                      className="p-2 min-w-9 min-h-9 flex items-center justify-center text-knight-400 hover:text-maroon-300 rounded-lg hover:bg-knight-700/50 touch-fast active:scale-95"
                      title="Edit details"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        const confirmed = await useDialogStore.getState().showConfirm(
                          `Delete connection profile "${p.name}"? This cannot be undone, and its saved API key will be permanently removed.`,
                          'Delete Connection Profile',
                          { confirmText: 'Delete Profile', variant: 'danger' }
                        );
                        if (confirmed) {
                          await deleteProfile(p.uuid);
                        }
                      }}
                      aria-label={`Delete profile ${p.name}`}
                      className="p-2 min-w-9 min-h-9 flex items-center justify-center text-knight-500 hover:text-red-400 rounded-lg hover:bg-knight-700/50 touch-fast active:scale-95"
                      title="Delete profile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Organized Add / Edit Profile Form */}
      <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-6 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-knight-700/40 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-mist-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-maroon-400" />
              {editingProfile.uuid ? 'Edit Connection Profile' : 'Add New Connection Profile'}
            </h3>
            <p className="text-xs text-knight-400">Organized settings for BYOK keys, endpoints, and LLM parameters</p>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-knight-500 font-medium mr-1">Presets:</span>
            <button
              onClick={() => applyPreset('gemini')}
              className="px-2 py-1 bg-void-800 hover:bg-knight-700 text-knight-300 rounded-lg text-[10px] font-medium border border-knight-700"
            >
              ⚡ Gemini
            </button>
            <button
              onClick={() => applyPreset('openai')}
              className="px-2 py-1 bg-void-800 hover:bg-knight-700 text-knight-300 rounded-lg text-[10px] font-medium border border-knight-700"
            >
              🤖 OpenAI
            </button>
            <button
              onClick={() => applyPreset('openrouter')}
              className="px-2 py-1 bg-void-800 hover:bg-knight-700 text-knight-300 rounded-lg text-[10px] font-medium border border-knight-700"
            >
              🔀 OpenRouter
            </button>
            <button
              onClick={() => applyPreset('ollama')}
              className="px-2 py-1 bg-void-800 hover:bg-knight-700 text-knight-300 rounded-lg text-[10px] font-medium border border-knight-700"
            >
              🦙 Ollama
            </button>
          </div>
        </div>

        {/* Organized Tabs / Stepper */}
        <div className="border-b border-knight-700/40">
          {/* Mobile Stepper (visible < sm) */}
          <div className="flex sm:hidden items-center justify-between px-2 py-3">
            {(
              [
                { id: 'basic', label: 'Basic', num: 1 },
                { id: 'parameters', label: 'Params', num: 2 },
                { id: 'advanced', label: 'Pricing', num: 3 },
              ] as const
            ).map((step, idx) => {
              const isActive = activeTab === step.id;
              const isPast =
                (activeTab === 'parameters' && step.id === 'basic') ||
                (activeTab === 'advanced' && (step.id === 'basic' || step.id === 'parameters'));
              return (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => setActiveTab(step.id)}
                    className="flex flex-col items-center gap-1 px-2"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-all ${
                        isActive
                          ? 'bg-maroon-500 text-white shadow-md shadow-maroon-900/50'
                          : isPast
                          ? 'bg-maroon-900/50 text-maroon-300 border border-maroon-500/30'
                          : 'bg-void-800 text-knight-400 border border-knight-700'
                      }`}
                    >
                      {step.num}
                    </div>
                    <span
                      className={`text-[10px] font-medium ${
                        isActive ? 'text-mist-100' : 'text-knight-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </button>
                  {idx < 2 && (
                    <div
                      className={`flex-1 h-px mx-2 ${
                        isPast ? 'bg-maroon-500/50' : 'bg-knight-700'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Desktop Tabs (visible >= sm) */}
          <div className="hidden sm:flex gap-2">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'basic'
                  ? 'border-maroon-400 text-maroon-400'
                  : 'border-transparent text-knight-400 hover:text-mist-100'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> 1. Basic & Credentials
            </button>
            <button
              onClick={() => setActiveTab('parameters')}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'parameters'
                  ? 'border-maroon-400 text-maroon-400'
                  : 'border-transparent text-knight-400 hover:text-mist-100'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" /> 2. Generation Parameters
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'advanced'
                  ? 'border-maroon-400 text-maroon-400'
                  : 'border-transparent text-knight-400 hover:text-mist-100'
              }`}
            >
              <Coins className="w-3.5 h-3.5" /> 3. Pricing
            </button>
          </div>
        </div>

        {/* Tab 1: Basic & Credentials */}
        {activeTab === 'basic' && (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-knight-300 mb-1">Profile Name</label>
                <input
                  type="text"
                  value={editingProfile.name || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  placeholder="e.g. Gemini 2.5 Flash Default"
                  className="w-full px-3 py-2 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs focus:outline-none focus:ring-2 focus:ring-maroon-400/60 ring-offset-2 ring-offset-void-950/50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-knight-300 mb-1">Provider</label>
                <select aria-label="Provider"
                  value={editingProfile.provider || 'gemini'}
                  onChange={(e) => {
                    const provider = e.target.value as ConnectionProfile['provider'];
                    let defaultModel = DEFAULT_GEMINI_MODEL;
                    if (provider === 'openai') defaultModel = DEFAULT_OPENAI_MODEL;
                    if (provider === 'anthropic') defaultModel = DEFAULT_ANTHROPIC_MODEL;
                    if (provider === 'openrouter') defaultModel = DEFAULT_OPENROUTER_MODEL;
                    if (provider === 'ollama') defaultModel = DEFAULT_OLLAMA_MODEL;

                    setEditingProfile({ ...editingProfile, provider, model: defaultModel });
                  }}
                  className="w-full px-3 py-2 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs focus:outline-none focus:ring-2 focus:ring-maroon-400/60 ring-offset-2 ring-offset-void-950/50"
                >
                  <option value="gemini">Google Gemini Direct</option>
                  <option value="openai">OpenAI Direct</option>
                  <option value="openrouter">OpenRouter Router</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="ollama">Ollama / Local API</option>
                  <option value="custom">Custom OpenAI-compatible Endpoint</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                {editingProfile.provider === 'openrouter' ? (
                  <OpenRouterModelPicker
                    value={editingProfile.model || ''}
                    onChange={(model) => setEditingProfile({ ...editingProfile, model })}
                  />
                ) : (
                  <>
                    <label className="block text-[11px] font-medium text-knight-300 mb-1">Model String</label>
                    <input
                      type="text"
                      value={editingProfile.model || ''}
                      onChange={(e) => setEditingProfile({ ...editingProfile, model: e.target.value })}
                      placeholder="e.g. gemini-2.5-flash, gpt-4o, etc."
                      className="w-full px-3 py-2 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-maroon-400/60 ring-offset-2 ring-offset-void-950/50"
                    />
                  </>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-knight-300 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={editingProfile.apiKey?.startsWith('enc.v1.') ? '' : (editingProfile.apiKey || '')}
                    onChange={(e) => setEditingProfile({ ...editingProfile, apiKey: e.target.value })}
                    placeholder={editingProfile.apiKey?.startsWith('enc.v1.') ? 'Encrypted (type to overwrite)' : 'Paste API Key here...'}
                    className="w-full px-3 py-2 pr-10 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs focus:outline-none focus:ring-2 focus:ring-maroon-400/60 ring-offset-2 ring-offset-void-950/50 font-mono"
                  />
                  <button
                    type="button"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-2.5 text-knight-400 hover:text-mist-100"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-knight-400">
                  {isPassphraseSet
                    ? '🔒 Encrypted with AES-GCM at rest using your Master Passphrase.'
                    : 'You’ll be asked to create a passphrase when you save this key.'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-knight-300 mb-1">Base API URL</label>
              <input
                type="text"
                value={editingProfile.baseUrl || ''}
                onChange={(e) => setEditingProfile({ ...editingProfile, baseUrl: e.target.value })}
                placeholder="e.g. https://openrouter.ai/api/v1 or http://localhost:11434/v1"
                className="w-full px-3 py-2 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs focus:outline-none focus:ring-2 focus:ring-maroon-400/60 ring-offset-2 ring-offset-void-950/50 font-mono"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Generation Parameters */}
        {activeTab === 'parameters' && (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-knight-300">
                  <span>Temperature</span>
                  <span className="font-mono text-maroon-400">{editingProfile.temperature ?? 0.7}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  value={editingProfile.temperature ?? 0.7}
                  onChange={(e) =>
                    setEditingProfile({ ...editingProfile, temperature: parseFloat(e.target.value) })
                  }
                  className="w-full accent-maroon-400 bg-void-800 rounded-lg cursor-pointer"
                />
                <p className="text-[10px] text-knight-500">
                  Lower values (0.2) produce factual, predictable text; higher values (1.2) increase creativity.
                  Used by Chat Preview and scenario runs; probes and other tools use their own fixed values.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-knight-300">
                  <span>Max Output Tokens</span>
                  <span className="font-mono text-maroon-400">{editingProfile.maxTokens ?? 2048}</span>
                </div>
                <input
                  type="number"
                  min="128"
                  max="32768"
                  step="128"
                  value={editingProfile.maxTokens ?? 2048}
                  onChange={(e) =>
                    setEditingProfile({ ...editingProfile, maxTokens: parseInt(e.target.value) || 2048 })
                  }
                  className="w-full px-3 py-1.5 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs font-mono focus:outline-none"
                />
                <p className="text-[10px] text-knight-500">Maximum reply length in Chat Preview and scenario runs; probes and other tools use their own limits.</p>
              </div>
            </div>

          </div>
        )}

        {/* Tab 3: Pricing */}
        {activeTab === 'advanced' && (
          <div className="space-y-4 pt-1">
            {/* Custom Pricing Override Collapsible Toggle */}
            <div className="border border-knight-800/80 rounded-xl p-3.5 bg-void-950/50 space-y-3">
              <button
                type="button"
                onClick={() => setShowPricingOverride(!showPricingOverride)}
                className="flex items-center justify-between w-full text-xs font-semibold text-knight-300 hover:text-mist-100 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  Override Pricing (Custom $/1K tokens)
                </span>
                <span className="text-[10px] text-maroon-400 hover:text-maroon-300 font-medium px-2 py-0.5 bg-void-800 border border-knight-700/60 rounded-md">
                  {showPricingOverride ? 'Collapse' : 'Configure Override'}
                </span>
              </button>

              {showPricingOverride && (
                <div className="pt-2 border-t border-knight-800/60 space-y-3 animate-fadeIn">
                  <p className="text-[11px] text-knight-400">
                    Set custom token pricing for this profile in USD per 1,000 tokens. Leave blank to use standard built-in model rate tables.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-knight-300 mb-1">
                        Custom input price ($/1K tokens)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={editingProfile.customPromptPricePer1K ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                          setEditingProfile({ ...editingProfile, customPromptPricePer1K: val });
                        }}
                        placeholder="e.g. 0.0015 (blank for default)"
                        className="w-full px-3 py-2 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-maroon-400/60 ring-offset-2 ring-offset-void-950/50"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-knight-300 mb-1">
                        Custom output price ($/1K tokens)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={editingProfile.customCompletionPricePer1K ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                          setEditingProfile({ ...editingProfile, customCompletionPricePer1K: val });
                        }}
                        placeholder="e.g. 0.0075 (blank for default)"
                        className="w-full px-3 py-2 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-maroon-400/60 ring-offset-2 ring-offset-void-950/50"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connection Test Status Output */}
        {testStatus && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              testStatus.loading
                ? 'bg-maroon-950/40 border-maroon-800 text-maroon-300 animate-pulse'
                : testStatus.success
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                : 'bg-red-950/40 border-red-800 text-red-300'
            }`}
          >
            <span>{testStatus.loading ? 'Pinging endpoint...' : testStatus.message}</span>
          </div>
        )}

        {/* Bottom Actions - Sticky on Mobile */}
        <div className="sticky bottom-0 sm:static bg-void-900 border-t border-knight-700/40 p-4 pb-[88px] sm:pb-0 -mx-4 -mb-4 sm:border-t-0 sm:p-0 sm:mx-0 sm:mb-0 sm:bg-transparent rounded-b-2xl z-10 flex flex-col sm:flex-row items-center gap-3 mt-4 sm:mt-2">
          <button
            onClick={handleSaveProfile}
            className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 text-white rounded-xl text-sm sm:text-xs font-semibold shadow-sm transition-all"
          >
            {editingProfile.uuid ? 'Update Profile' : 'Save Connection Profile'}
          </button>
          <button
            onClick={() => handleTestConnection()}
            disabled={testStatus?.loading}
            className="w-full sm:w-auto px-4 py-3 sm:py-2.5 bg-void-800 hover:bg-knight-700 text-mist-100 rounded-xl text-sm sm:text-xs font-medium border border-knight-700 transition-all flex items-center justify-center gap-1.5"
          >
            <Activity className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-maroon-400" />
            Test Config
          </button>
        </div>
      </div>
    </div>
  );
};
