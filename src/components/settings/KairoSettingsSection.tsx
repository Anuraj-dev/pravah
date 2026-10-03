// Kairo provider settings — web port of the mobile KairoSettingsSection:
// provider rows with brand marks, a keyed API-key input with reveal toggle,
// and per-provider credential editors.
import { useMemo, useState } from "react";
import { useToast } from "../useToast";
import { cn } from "../../lib/utils";
import {
  SettingsCard,
  SettingRow,
  StatusBadge,
  SettingsButton,
  TextField,
  inputStyle,
  inputFocusHandlers,
} from "./primitives";
import { ChevronRightIcon, CheckIcon } from "../ui/icons";
import {
  kairoKeyIcon,
  kairoEyeOpenIcon,
  kairoEyeClosedIcon,
  providerAnthropicIcon,
  providerOpenaiIcon,
  providerGeminiIcon,
} from "../ui/traced-icons";

// JSX needs capitalized identifiers for components.
const KairoKeyIcon = kairoKeyIcon;
const KairoEyeOpenIcon = kairoEyeOpenIcon;
const KairoEyeClosedIcon = kairoEyeClosedIcon;
const OpenaiProviderIcon = providerOpenaiIcon;
const AnthropicProviderIcon = providerAnthropicIcon;
const GeminiProviderIcon = providerGeminiIcon;
import {
  clearKairoConfig,
  getKairoProviderLabel,
  getKairoSettings,
  saveKairoSettings,
  type KairoProviderFormat,
  type KairoSettings,
} from "../../lib/kairoConfig";

const KAIRO_PROVIDERS: KairoProviderFormat[] = ["openai", "anthropic", "gemini"];

const PROVIDER_ICONS: Record<KairoProviderFormat, typeof OpenaiProviderIcon> = {
  openai: OpenaiProviderIcon,
  anthropic: AnthropicProviderIcon,
  gemini: GeminiProviderIcon,
};

function getKairoSettingsSignature(settings: KairoSettings) {
  return [
    settings.defaultProvider,
    ...KAIRO_PROVIDERS.flatMap((provider) => {
      const profile = settings.profiles[provider];
      return [provider, profile.apiKey.trim(), profile.baseUrl.trim(), profile.model.trim()];
    }),
  ].join("\n");
}

function providerReadiness(settings: KairoSettings, provider: KairoProviderFormat) {
  const profile = settings.profiles[provider];
  const configured = Boolean(
    profile.apiKey.trim() && profile.baseUrl.trim() && profile.model.trim()
  );
  const isDefault = settings.defaultProvider === provider;
  if (isDefault && configured) return { configured, meta: "Current default" };
  if (isDefault) return { configured, meta: "Current default, needs setup." };
  return { configured, meta: configured ? "Ready to use" : "Set up this provider first." };
}

export function KairoSettingsSection() {
  const [kairoSettings, setKairoSettings] = useState<KairoSettings>(() => getKairoSettings());
  const [activeProvider, setActiveProvider] = useState<KairoProviderFormat>(
    () => getKairoSettings().defaultProvider
  );
  const [savedKairoSignature, setSavedKairoSignature] = useState(() =>
    getKairoSettingsSignature(getKairoSettings())
  );
  const [savedKairoAt, setSavedKairoAt] = useState<Date | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const { showError, showSuccess } = useToast();

  const profile = kairoSettings.profiles[activeProvider];
  const kairoConfig = {
    providerFormat: activeProvider,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    model: profile.model,
  };
  const isKairoDirty =
    useMemo(() => getKairoSettingsSignature(kairoSettings), [kairoSettings]) !== savedKairoSignature;
  const hasSavedKairoConfig = useMemo(
    () =>
      KAIRO_PROVIDERS.some((provider) => {
        const p = kairoSettings.profiles[provider];
        return Boolean(p.apiKey.trim() && p.baseUrl.trim() && p.model.trim());
      }),
    [kairoSettings]
  );

  const patchProfile = (patch: Partial<{ apiKey: string; baseUrl: string; model: string }>) =>
    setKairoSettings((prev) => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [activeProvider]: { ...prev.profiles[activeProvider], ...patch },
      },
    }));

  const handleSaveKairoConfig = () => {
    if (!kairoConfig.apiKey.trim() || !kairoConfig.baseUrl.trim() || !kairoConfig.model.trim()) {
      showError("Fill in the provider format, API key, endpoint URL, and model for Kairo.");
      return;
    }
    saveKairoSettings({
      ...kairoSettings,
      profiles: {
        ...kairoSettings.profiles,
        [activeProvider]: {
          apiKey: kairoConfig.apiKey.trim(),
          baseUrl: kairoConfig.baseUrl.trim(),
          model: kairoConfig.model.trim(),
        },
      },
    });
    setSavedKairoSignature(getKairoSettingsSignature(getKairoSettings()));
    setSavedKairoAt(new Date());
    showSuccess("Kairo settings saved.");
  };

  const handleSetDefault = () => {
    saveKairoSettings({ ...kairoSettings, defaultProvider: activeProvider });
    setKairoSettings((prev) => ({ ...prev, defaultProvider: activeProvider }));
    setSavedKairoSignature(getKairoSettingsSignature(getKairoSettings()));
    setSavedKairoAt(new Date());
    showSuccess(`${getKairoProviderLabel(activeProvider)} is now the default provider.`);
  };

  const handleClearKairoConfig = () => {
    clearKairoConfig();
    const cleared = getKairoSettings();
    setKairoSettings(cleared);
    setActiveProvider(cleared.defaultProvider);
    setSavedKairoSignature(getKairoSettingsSignature(getKairoSettings()));
    setSavedKairoAt(new Date());
    showSuccess("Kairo settings cleared.");
  };

  return (
    <SettingsCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SettingRow
          title="Kairo providers"
          help="Kairo uses your default provider profile from this browser. Nothing is prefilled or rewritten."
        />
        <StatusBadge
          tone={isKairoDirty ? "warning" : hasSavedKairoConfig ? "success" : "idle"}
          label={
            isKairoDirty ? "Unsaved" : hasSavedKairoConfig ? (savedKairoAt ? "Saved now" : "Saved") : "Not saved"
          }
        />
      </div>

      <div
        className="overflow-hidden"
        style={{ border: "1px solid var(--color-border-subtle)", borderRadius: 10 }}
      >
        {KAIRO_PROVIDERS.map((provider, index) => {
          const Icon = PROVIDER_ICONS[provider];
          const readiness = providerReadiness(kairoSettings, provider);
          const expanded = activeProvider === provider;
          return (
            <div
              key={provider}
              style={{
                background: expanded ? "var(--color-bg-elevated)" : "var(--color-bg-surface)",
                borderTop: index > 0 ? "1px solid var(--color-border-subtle)" : "none",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveProvider(provider)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 text-left cursor-pointer"
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  transition: "background-color var(--dur-instant) var(--ease-out-expo)",
                }}
                onMouseEnter={(e) => {
                  if (!expanded) e.currentTarget.style.background = "var(--color-fill-faint)";
                }}
                onMouseLeave={(e) => {
                  if (!expanded) e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  className="grid place-items-center shrink-0"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border-subtle)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">
                    {getKairoProviderLabel(provider)}
                  </span>
                  <span className="block text-[12px] text-ink-mute truncate">{readiness.meta}</span>
                </span>
                {kairoSettings.defaultProvider === provider && (
                  <StatusBadge tone="success" label="Default" />
                )}
                <StatusBadge tone={readiness.configured ? "success" : "idle"} label={readiness.configured ? "Configured" : "Not configured"} />
                <ChevronRightIcon
                  size={16}
                  className="shrink-0 text-ink-dim"
                  style={{
                    transform: expanded ? "rotate(90deg)" : undefined,
                    transition: "transform var(--dur-fast) var(--ease-out-expo)",
                  }}
                />
              </button>

              {expanded && (
                <div className="space-y-3.5" style={{ padding: "4px 14px 16px" }}>
                  <TextField label="API key">
                    <div className="relative">
                      <span
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim pointer-events-none"
                        style={{ display: "inline-flex" }}
                      >
                        <KairoKeyIcon size={15} />
                      </span>
                      <input
                        type={revealKey ? "text" : "password"}
                        name="pravah-kairo-provider-token"
                        value={kairoConfig.apiKey}
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="none"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-form-type="other"
                        spellCheck={false}
                        onChange={(e) => patchProfile({ apiKey: e.target.value })}
                        placeholder="Paste your provider key"
                        className="w-full py-2.5 pl-9 pr-10 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim"
                        style={{ ...inputStyle, ...inputFocusHandlers }}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealKey((v) => !v)}
                        aria-label={revealKey ? "Hide API key" : "Show API key"}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center cursor-pointer text-ink-mute hover:text-ink-soft"
                        style={{ width: 32, height: 32, background: "transparent", border: "none" }}
                      >
                        {revealKey ? <KairoEyeClosedIcon size={17} /> : <KairoEyeOpenIcon size={17} />}
                      </button>
                    </div>
                  </TextField>

                  <div className="grid gap-3 md:grid-cols-2">
                    <TextField label="Endpoint URL">
                      <input
                        type="url"
                        name="pravah-kairo-endpoint-url"
                        value={kairoConfig.baseUrl}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-form-type="other"
                        spellCheck={false}
                        onChange={(e) => patchProfile({ baseUrl: e.target.value })}
                        placeholder={
                          activeProvider === "anthropic"
                            ? "http://localhost:42424/v1/messages"
                            : activeProvider === "gemini"
                              ? "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                              : "https://your-server/v1/chat/completions"
                        }
                        className="w-full px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim"
                        style={{ ...inputStyle, ...inputFocusHandlers }}
                      />
                    </TextField>

                    <TextField label="Model">
                      <input
                        type="text"
                        name="pravah-kairo-model-id"
                        value={kairoConfig.model}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-form-type="other"
                        spellCheck={false}
                        onChange={(e) => patchProfile({ model: e.target.value })}
                        placeholder="Enter the exact model id"
                        className="w-full px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim"
                        style={{ ...inputStyle, ...inputFocusHandlers }}
                      />
                    </TextField>
                  </div>

                  <p className="text-[12px] leading-[18px] text-ink-mute">
                    {activeProvider === "anthropic"
                      ? "Anthropic mode sends /v1/messages-style JSON with a top-level system prompt."
                      : activeProvider === "gemini"
                        ? "Gemini mode sends generateContent-style JSON with a top-level system instruction."
                        : "OpenAI mode sends /v1/chat/completions-style JSON with a system message."}{" "}
                    The endpoint URL is always used exactly as entered.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <SettingsButton variant="accent" onClick={handleSaveKairoConfig}>
                      {isKairoDirty || !hasSavedKairoConfig ? "Save credentials" : "Credentials current"}
                    </SettingsButton>
                    <SettingsButton
                      variant="soft"
                      onClick={handleSetDefault}
                      disabled={kairoSettings.defaultProvider === activeProvider}
                      className={cn(kairoSettings.defaultProvider === activeProvider && "opacity-60")}
                    >
                      {kairoSettings.defaultProvider === activeProvider ? (
                        <>
                          <CheckIcon size={13} /> Default provider
                        </>
                      ) : (
                        "Set as default"
                      )}
                    </SettingsButton>
                    <SettingsButton variant="ghost" onClick={handleClearKairoConfig}>
                      Clear all
                    </SettingsButton>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SettingsCard>
  );
}
