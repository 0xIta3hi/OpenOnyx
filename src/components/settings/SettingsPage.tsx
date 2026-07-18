import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Brain,
  CalendarDays,
  Check,
  Command,
  Copy,
  Database,
  Eye,
  ExternalLink,
  FileText,
  Grid2X2,
  Info,
  Keyboard,
  KeyRound,
  Link2,
  Palette,
  Puzzle,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Terminal,
  Type,
  Users,
  Wand2,
  WifiOff,
  X,
} from "lucide-react";
import { PluginSettingsPanel } from "../plugins/PluginSettingsPanel";
import { PluginMarketplace } from "../plugins/PluginMarketplace";
import type { PluginRegistration, PluginSettingTabRegistration } from "../../types/plugin";
import type { Command as AppCommand } from "../../types";
import { isDarkTheme } from "../../utils/helpers";
import type { LocalVaultCollaborator, LocalVaultInvite } from "../../lib/localdb";
import { CollaborationPanel } from "../spaces/CollaborationPanel";
import { authManager } from "../../lib/auth";
import { AuthModal } from "../modals/AuthModal";
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_MODEL_ID,
  getModelsForProvider,
  loadSettings,
  saveSettings,
  type AISettings,
} from "../../utils/ai-settings";
import { isModelLoaded, loadStore } from "../../utils/embeddings";
import {
  clearSavedUserDatabaseConfig,
  connectUserDatabase,
  disconnectUserDatabase,
  getUserDatabaseConfig,
  loadSavedUserDatabaseConfig,
  saveUserDatabaseConfig,
  testConnection,
  type UserDatabaseConfig,
} from "../../lib/userDatabase";
import { configureSupabaseClient } from "../../lib/supabase";
import { parseSupabaseEnv } from "../../lib/supabaseConfig";
import databaseSchemaSql from "../../../supabase/schema.sql?raw";
import { getAPI } from "../../utils/api";

type ThemeSetting =
  | "dark"
  | "light"
  | "oceanic"
  | "dark-plus"
  | "blue-night"
  | "ember-night"
  | "aurora-grove"
  | "paper-sage"
  | "rose-quartz"
  | "system"
  | "custom";

export interface AppSettings {
  theme: ThemeSetting;
  customThemeType: "dark" | "light";
  accentColor: string;
  fontFamily: string;
  customBgPrimary: string;
  customTextPrimary: string;

  fontSize: number;
  editorFontSize: number;
  previewFontSize: number;
  readingViewWidth: number;
  lineHeight: number;
  tabSize: number;
  showLineNumbers: boolean;
  wordWrap: boolean;
  spellcheck: boolean;
  vimMode: boolean;
  useWikiLinks: boolean;

  autoUpdates: boolean;
  language: "English";
  alwaysFocusNewTabs: boolean;
  defaultView: "editor" | "preview" | "split";
  defaultEditingMode: "live-preview" | "source";
  showEditingModeStatusBar: boolean;
  readableLineLength: boolean;
  strictLineBreaks: boolean;
  propertiesInDocument: "visible" | "hidden" | "source";
  foldHeading: boolean;
  foldIndent: boolean;
  indentationGuides: boolean;
  rightToLeft: boolean;
  autoPairBrackets: boolean;
  autoPairMarkdown: boolean;
  smartLists: boolean;
  indentUsingTabs: boolean;
  convertPastedHtml: boolean;

  defaultFileToOpen: "last-opened" | "new-tab";
  defaultNoteLocation: "vault" | "same-folder";
  defaultAttachmentLocation: "vault" | "same-folder";
  newLinkFormat: "shortest" | "relative" | "absolute";
  autoUpdateInternalLinks: boolean;
  showAllFileTypes: boolean;
  confirmBeforeDelete: boolean;
  deleteAttachmentsMode: "ask" | "always" | "never";
  deletedFilesMode: "system-trash" | "app-trash" | "permanent";
  excludedFiles: string;
  overrideConfigFolder: string;
  allowUrlCallbacks: boolean;

  inlineTitle: boolean;
  showTabTitleBar: boolean;
  showRibbon: boolean;
  quickFontSizeAdjustment: boolean;
  zoomLevel: number;
  nativeMenus: boolean;
  windowFrameStyle: "hidden" | "native";
  hardwareAcceleration: boolean;

  coreBacklinks: boolean;
  coreCanvas: boolean;
  coreCommandPalette: boolean;
  coreDailyNotes: boolean;
  corePagePreview: boolean;
  coreQuickSwitcher: boolean;
  coreTemplates: boolean;
  backlinksOpenByDefault: boolean;
  backlinksShowUnlinked: boolean;
  canvasDefaultLocation: "vault" | "same-folder";
  canvasMouseWheelBehavior: "pan" | "zoom";
  canvasCtrlDragBehavior: "menu" | "pan";
  canvasShowCardNames: "always" | "hover" | "never";
  canvasSnapToGrid: boolean;
  canvasSnapToObjects: boolean;
  canvasZoomThreshold: number;
  dailyNoteDateFormat: string;
  dailyNoteLocation: string;
  dailyNoteTemplate: string;
  pagePreviewRequireCtrl: boolean;
  pagePreviewSearchLinks: boolean;
  pagePreviewReading: boolean;
  pagePreviewEditing: boolean;
  pagePreviewTabHeader: boolean;
  pagePreviewFiles: boolean;
  pagePreviewProperties: boolean;
  pagePreviewBookmarks: boolean;
  pagePreviewOutline: boolean;
  pagePreviewGraph: boolean;
  templatesFolder: string;
  templateDateFormat: string;
  templateTimeFormat: string;
  pluginAutoUpdates: boolean;
}

type CustomThemeColorKey = "accentColor" | "customBgPrimary" | "customTextPrimary";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  accentColor: "#3b82f6",
  fontFamily: "Inter, system-ui, sans-serif",
  customBgPrimary: "#151515",
  customTextPrimary: "#e6e6e6",
  customThemeType: "dark",

  fontSize: 17,
  editorFontSize: 17,
  previewFontSize: 17,
  readingViewWidth: 800,
  lineHeight: 1.5,
  tabSize: 2,
  showLineNumbers: false,
  wordWrap: true,
  spellcheck: false,
  vimMode: false,
  useWikiLinks: true,

  autoUpdates: true,
  language: "English",
  alwaysFocusNewTabs: true,
  defaultView: "editor",
  defaultEditingMode: "live-preview",
  showEditingModeStatusBar: true,
  readableLineLength: true,
  strictLineBreaks: false,
  propertiesInDocument: "visible",
  foldHeading: true,
  foldIndent: true,
  indentationGuides: true,
  rightToLeft: false,
  autoPairBrackets: true,
  autoPairMarkdown: true,
  smartLists: true,
  indentUsingTabs: true,
  convertPastedHtml: true,

  defaultFileToOpen: "last-opened",
  defaultNoteLocation: "vault",
  defaultAttachmentLocation: "vault",
  newLinkFormat: "shortest",
  autoUpdateInternalLinks: false,
  showAllFileTypes: false,
  confirmBeforeDelete: true,
  deleteAttachmentsMode: "ask",
  deletedFilesMode: "system-trash",
  excludedFiles: "",
  overrideConfigFolder: ".obsidian",
  allowUrlCallbacks: false,

  inlineTitle: true,
  showTabTitleBar: true,
  showRibbon: true,
  quickFontSizeAdjustment: false,
  zoomLevel: 100,
  nativeMenus: false,
  windowFrameStyle: "hidden",
  hardwareAcceleration: true,

  coreBacklinks: true,
  coreCanvas: true,
  coreCommandPalette: true,
  coreDailyNotes: true,
  corePagePreview: true,
  coreQuickSwitcher: true,
  coreTemplates: true,
  backlinksOpenByDefault: false,
  backlinksShowUnlinked: true,
  canvasDefaultLocation: "vault",
  canvasMouseWheelBehavior: "pan",
  canvasCtrlDragBehavior: "menu",
  canvasShowCardNames: "always",
  canvasSnapToGrid: true,
  canvasSnapToObjects: true,
  canvasZoomThreshold: 60,
  dailyNoteDateFormat: "YYYY-MM-DD",
  dailyNoteLocation: "",
  dailyNoteTemplate: "",
  pagePreviewRequireCtrl: false,
  pagePreviewSearchLinks: true,
  pagePreviewReading: false,
  pagePreviewEditing: true,
  pagePreviewTabHeader: true,
  pagePreviewFiles: true,
  pagePreviewProperties: true,
  pagePreviewBookmarks: true,
  pagePreviewOutline: true,
  pagePreviewGraph: true,
  templatesFolder: "templates",
  templateDateFormat: "YYYY-MM-DD",
  templateTimeFormat: "HH:mm",
  pluginAutoUpdates: false,
};

type SettingsSection =
  | "general"
  | "editor"
  | "files"
  | "appearance"
  | "hotkeys"
  | "keychain"
  | "core-plugins"
  | "plugins"
  | "ai"
  | "database"
  | "backlinks"
  | "canvas"
  | "command-palette"
  | "daily-notes"
  | "page-preview"
  | "quick-switcher"
  | "templates"
  | "collaboration"
  | "about";

interface SettingsPageProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClose: () => void;
  commands?: AppCommand[];
  plugins?: PluginRegistration[];
  pluginSettingTabs?: PluginSettingTabRegistration[];
  onEnablePlugin?: (pluginId: string) => Promise<void>;
  onDisablePlugin?: (pluginId: string) => Promise<void>;
  onRefreshPlugins?: () => Promise<void>;
  onReloadPlugin?: (pluginId: string) => Promise<void>;
  onUninstallPlugin?: (pluginId: string) => Promise<boolean>;
  onInstallPlugin?: (repo: string, pluginId: string, version?: string) => Promise<boolean>;
  collaborators?: LocalVaultCollaborator[];
  invitesSent?: LocalVaultInvite[];
  invitesReceived?: LocalVaultInvite[];
  onInviteUser?: (email: string) => void;
  onRemoveCollaborator?: (id: string) => void;
  onAcceptInvite?: (id: string) => void;
  onRejectInvite?: (id: string) => void;
  currentUserEmail?: string;
  vaultPath?: string;
  onVaultReconstructed?: (path: string) => void;
  initialSection?: SettingsSection;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const overlayClass = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm";
const pageClass = "relative flex h-[min(92vh,920px)] w-[min(96vw,1100px)] overflow-hidden rounded-lg border border-[var(--border-medium)] bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-2xl";
const sidebarClass = "w-[250px] shrink-0 overflow-y-auto border-r border-[var(--divider-color)] bg-[var(--bg-secondary)] px-5 py-7";
const contentClass = "min-w-0 flex-1 overflow-y-auto bg-[var(--bg-primary)] px-10 pb-12 pt-8";
const closeClass = "absolute right-4 top-4 z-10 rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const navHeaderClass = "mb-2 mt-6 px-1 text-[11px] font-semibold text-[var(--text-muted)] first:mt-0";
const navItemClass = "flex h-28px w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[15px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const navItemActiveClass = "bg-[var(--bg-active)] text-[var(--text-primary)]";
const sectionClass = "mx-auto max-w-[740px]";
const groupTitleClass = "mb-4 mt-7 text-[15px] font-semibold text-[var(--text-primary)] first:mt-0";
const cardClass = "overflow-hidden rounded-xl bg-[var(--bg-elevated)] px-5";
const rowClass = "flex min-h-[72px] items-center justify-between gap-6 border-b border-[var(--divider-color)] py-4 last:border-b-0";
const rowInfoClass = "min-w-0 flex-1";
const rowTitleClass = "text-[16px] font-normal leading-snug text-[var(--text-primary)]";
const rowDescClass = "mt-1 text-[12.5px] leading-[1.35] text-[var(--text-muted)]";
const controlClass = "flex shrink-0 items-center gap-2";
const buttonClass = "rounded-md border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]";
const primaryButtonClass = "rounded-md border border-transparent bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-on-accent)] hover:bg-[var(--color-accent-1)]";
const selectClass = "settings-select h-8 min-w-[130px] rounded-md border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-3 pr-8 text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--border-strong)]";
const inputClass = "h-8 min-w-[220px] rounded-md border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--color-accent)]";
const textareaClass = "min-h-24 w-full rounded-md border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] outline-none";
const toggleClass = "relative inline-flex h-[22px] w-10 cursor-pointer items-center rounded-full border transition-colors";
const toggleThumbClass = "absolute left-[2px] h-[18px] w-[18px] rounded-full shadow transition-transform data-[checked=true]:translate-x-[18px]";
const rangeClass = "settings-range w-28";
const kbdClass = "rounded bg-[var(--bg-tertiary)] px-2 py-1 font-mono text-[12px] text-[var(--text-secondary)]";
const settingsPageStyle = `
  .settings-select {
    appearance: none;
    background-image:
      linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
      linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
    background-position:
      calc(100% - 15px) 50%,
      calc(100% - 10px) 50%;
    background-size: 5px 5px, 5px 5px;
    background-repeat: no-repeat;
  }
  .theme-dark .settings-select {
    color-scheme: dark;
  }
  .theme-light .settings-select {
    color-scheme: light;
  }
  .settings-select option {
    background-color: var(--bg-elevated);
    color: var(--text-primary);
  }
  .settings-select option:checked {
    background-color: var(--bg-active);
    color: var(--text-primary);
  }
  .settings-range {
    height: 18px;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
    outline: none;
    touch-action: none;
  }
  .settings-range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-accent) 72%, var(--text-primary)) 0%,
      color-mix(in srgb, var(--color-accent) 72%, var(--text-primary)) var(--range-progress, 0%),
      var(--border-medium) var(--range-progress, 0%),
      var(--border-medium) 100%
    );
    transition: background-color 120ms ease;
  }
  .settings-range::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border: 1px solid color-mix(in srgb, var(--text-primary) 32%, transparent);
    border-radius: 999px;
    background: var(--text-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
    cursor: grab;
    transition: transform 80ms ease, border-color 120ms ease, background-color 120ms ease;
  }
  .settings-range:hover::-webkit-slider-thumb,
  .settings-range:focus-visible::-webkit-slider-thumb {
    transform: scale(1.08);
    border-color: color-mix(in srgb, var(--color-accent) 70%, var(--text-primary));
  }
  .settings-range:active::-webkit-slider-thumb {
    cursor: grabbing;
    transform: scale(1.14);
  }
  .settings-range::-moz-range-track {
    height: 4px;
    border-radius: 999px;
    background: var(--border-medium);
  }
  .settings-range::-moz-range-progress {
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-accent) 72%, var(--text-primary));
  }
  .settings-range::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 1px solid color-mix(in srgb, var(--text-primary) 32%, transparent);
    border-radius: 999px;
    background: var(--text-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
    cursor: grab;
    transition: transform 80ms ease, border-color 120ms ease, background-color 120ms ease;
  }
  .settings-range:active::-moz-range-thumb {
    cursor: grabbing;
    transform: scale(1.14);
  }
`;

function SettingGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && <h3 className={groupTitleClass}>{title}</h3>}
      <div className={cardClass}>{children}</div>
    </section>
  );
}

function SettingRow({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={rowClass}>
      <div className={rowInfoClass}>
        <div className={rowTitleClass}>{title}</div>
        {description && <div className={rowDescClass}>{description}</div>}
      </div>
      {children && <div className={controlClass}>{children}</div>}
    </div>
  );
}

function rangeProgressStyle(value: number, min: number, max: number): React.CSSProperties {
  const progress = max <= min ? 0 : ((value - min) / (max - min)) * 100;
  return {
    "--range-progress": `${Math.max(0, Math.min(100, progress))}%`,
  } as React.CSSProperties;
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={cx(toggleClass, disabled && "cursor-not-allowed opacity-50")}
      data-checked={checked}
      style={{
        backgroundColor: checked ? "var(--accent-primary, var(--color-accent, #3b82f6))" : "var(--bg-tertiary)",
        borderColor: checked ? "var(--border-strong)" : "var(--border-medium)",
        boxShadow: checked ? "inset 0 0 0 1px color-mix(in srgb, var(--text-primary) 14%, transparent)" : "none",
      }}
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      disabled={disabled}
    >
      <span
        className={toggleThumbClass}
        data-checked={checked}
        style={{
          backgroundColor: checked ? "var(--text-on-accent, #ffffff)" : "var(--text-primary)",
        }}
      />
    </button>
  );
}

function StatusLine({ type, message }: { type: "success" | "error" | "info" | "idle"; message: React.ReactNode }) {
  if (!message) return null;
  const color = type === "success" ? "text-[var(--success)]" : type === "error" ? "text-[var(--danger)]" : "text-[var(--text-muted)]";
  return (
    <div className={cx("mt-2 flex items-center gap-1.5 text-[12.5px]", color)}>
      {type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
      <span>{message}</span>
    </div>
  );
}

export function SettingsPage({
  settings,
  onSettingsChange,
  onClose,
  commands = [],
  plugins = [],
  pluginSettingTabs = [],
  onEnablePlugin,
  onDisablePlugin,
  onRefreshPlugins,
  onReloadPlugin,
  onUninstallPlugin,
  onInstallPlugin,
  vaultPath,
  onVaultReconstructed,
  initialSection,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection || "general");
  const [localSettings, setLocalSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS, ...settings });
  const [customThemeDraft, setCustomThemeDraft] = useState(() => ({
    accentColor: settings.accentColor,
    customBgPrimary: settings.customBgPrimary,
    customTextPrimary: settings.customTextPrimary,
  }));
  const [isBrowsingPlugins, setIsBrowsingPlugins] = useState(false);
  const [searchHotkey, setSearchHotkey] = useState("");
  const [currentUser, setCurrentUser] = useState(authManager.getUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "signup">("login");
  const [updateStatus, setUpdateStatus] = useState<React.ReactNode>("");
  const [updateType, setUpdateType] = useState<"success" | "error" | "info" | "idle">("info");
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  const [aiSettings, setAiSettings] = useState<AISettings>(() => loadSettings());
  const [store, setStore] = useState(() => loadStore());
  const indexedCount = store.entries.size;

  const [databaseConfig, setDatabaseConfig] = useState<UserDatabaseConfig>(() => (
    loadSavedUserDatabaseConfig() ||
    getUserDatabaseConfig() || {
      supabaseUrl: "",
      anonKey: "",
    }
  ));
  const [databaseEnvText, setDatabaseEnvText] = useState("");
  const [databaseStatus, setDatabaseStatus] = useState<{ type: "idle" | "success" | "error" | "info"; message: string }>(() => (
    loadSavedUserDatabaseConfig()
      ? { type: "success", message: "Saved local Supabase credentials are active." }
      : { type: "idle", message: "" }
  ));
  const [databaseSchemaCopyStatus, setDatabaseSchemaCopyStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({ type: "idle", message: "" });
  const [isTestingDatabase, setIsTestingDatabase] = useState(false);

  const isDark = isDarkTheme(localSettings.theme, localSettings);
  const models = getModelsForProvider(aiSettings.provider);
  const matchedModel = models.find((m) => m.id === aiSettings.modelId);
  const isCustomModel = !matchedModel && aiSettings.provider === "openrouter";
  const customModelInputValue = aiSettings.provider === "openrouter"
    ? (isCustomModel ? aiSettings.modelId : aiSettings.customModelId || "")
    : "";
  const trimmedCustomModelInput = customModelInputValue.trim();
  const isCustomModelSelected = isCustomModel && !!trimmedCustomModelInput && aiSettings.modelId === trimmedCustomModelInput;
  const customModelDescription = isCustomModelSelected
    ? "Active custom OpenRouter model."
    : trimmedCustomModelInput
      ? "Saved custom model. Select it to make it active."
      : "Use any other OpenRouter model by entering its ID.";
  const currentModel = matchedModel || (isCustomModel ? {
    id: aiSettings.modelId,
    label: aiSettings.modelId,
    shortLabel: aiSettings.modelId.split("/").pop() || aiSettings.modelId,
    description: "Custom OpenRouter Model",
    supportsGrounding: false,
  } : models[0]);

  useEffect(() => {
    const unsub = authManager.subscribe((state) => setCurrentUser(state.user));
    return unsub;
  }, []);

  useEffect(() => {
    setLocalSettings({ ...DEFAULT_SETTINGS, ...settings });
  }, [settings]);

  useEffect(() => {
    setCustomThemeDraft({
      accentColor: localSettings.accentColor,
      customBgPrimary: localSettings.customBgPrimary,
      customTextPrimary: localSettings.customTextPrimary,
    });
  }, [localSettings.accentColor, localSettings.customBgPrimary, localSettings.customTextPrimary]);

  useEffect(() => {
    if (activeSection !== "ai") return;
    const interval = setInterval(() => setStore(loadStore()), 3000);
    return () => clearInterval(interval);
  }, [activeSection]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onSettingsChange(updated);
  };

  const updateCustomThemeDraft = (key: CustomThemeColorKey, value: string) => {
    setCustomThemeDraft((current) => ({ ...current, [key]: value }));
    if (!value) return;
    setLocalSettings((current) => {
      if (current[key] === value) return current;
      const updated = { ...current, [key]: value };
      onSettingsChange(updated);
      return updated;
    });
  };

  const commitCustomThemeColor = (key: CustomThemeColorKey, value: string) => {
    if (!value || localSettings[key] === value) return;
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onSettingsChange(updated);
  };

  const updateAISettings = (patch: Partial<AISettings>) => {
    setAiSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
    window.dispatchEvent(new Event("ai-settings-changed"));
  };

  const normalizedDatabaseConfig = (): UserDatabaseConfig => ({
    supabaseUrl: databaseConfig.supabaseUrl.trim(),
    anonKey: databaseConfig.anonKey.trim(),
  });

  const handleImportDatabaseEnv = () => {
    const parsed = parseSupabaseEnv(databaseEnvText);
    if (!parsed.supabaseUrl && !parsed.anonKey) {
      setDatabaseStatus({ type: "error", message: "Could not find VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in that text." });
      return;
    }
    setDatabaseConfig((current) => ({
      supabaseUrl: parsed.supabaseUrl || current.supabaseUrl,
      anonKey: parsed.anonKey || current.anonKey,
    }));
    setDatabaseStatus({ type: "info", message: "Imported credentials. Save to activate them." });
  };

  const handleTestDatabaseConnection = async () => {
    const config = normalizedDatabaseConfig();
    if (!config.supabaseUrl || !config.anonKey) {
      setDatabaseStatus({ type: "error", message: "Supabase URL and anon key are required." });
      return;
    }
    setIsTestingDatabase(true);
    setDatabaseStatus({ type: "info", message: "Testing Supabase connection..." });
    try {
      const result = await testConnection(config);
      setDatabaseStatus(result.ok ? { type: "success", message: "Connection verified." } : { type: "error", message: result.error || "Connection failed." });
    } finally {
      setIsTestingDatabase(false);
    }
  };

  const handleSaveDatabaseConfig = async () => {
    const config = normalizedDatabaseConfig();
    if (!config.supabaseUrl || !config.anonKey) {
      setDatabaseStatus({ type: "error", message: "Supabase URL and anon key are required." });
      return;
    }
    try {
      // Configure the Supabase client FIRST so it is already pointing at the
      // new credentials when saveUserDatabaseConfig fires the config-changed
      // event (which triggers authManager.refreshConfiguration internally).
      configureSupabaseClient(config);
      const saved = saveUserDatabaseConfig(config);
      connectUserDatabase(saved);
      await authManager.refreshConfiguration();
      setDatabaseConfig(saved);
      setDatabaseStatus({ type: "success", message: "Saved locally. Cloud features now use these credentials." });
    } catch (err: any) {
      setDatabaseStatus({ type: "error", message: err.message || "Failed to save database credentials." });
    }
  };

  const handleClearDatabaseConfig = async () => {
    clearSavedUserDatabaseConfig();
    disconnectUserDatabase();
    configureSupabaseClient();
    await authManager.refreshConfiguration();
    setDatabaseConfig({ supabaseUrl: "", anonKey: "" });
    setDatabaseEnvText("");
    setDatabaseStatus({ type: "info", message: "Local Supabase credentials cleared." });
  };

  const handleCopyDatabaseSchema = async () => {
    try {
      await getAPI().writeClipboardText(databaseSchemaSql);
      setDatabaseSchemaCopyStatus({ type: "success", message: "Copied schema.sql migration to clipboard." });
    } catch {
      setDatabaseSchemaCopyStatus({ type: "error", message: "Failed to copy migration SQL." });
    }
  };

  const handleCheckForUpdates = async () => {
    if (isCheckingUpdates) return;
    setIsCheckingUpdates(true);
    setUpdateType("info");
    setUpdateStatus("Checking for updates...");

    try {
      const response = await fetch("https://api.github.com/repos/OpenObsidian/OpenObsidian/releases/latest");
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Repository not found (HTTP 404). If the GitHub repository is private, the update checker cannot access it.");
        }
        throw new Error(`Failed to fetch release info (HTTP ${response.status}).`);
      }
      const data = await response.json();
      const latestVersion = data.tag_name ? data.tag_name.replace(/^v/, "") : "";
      
      if (!latestVersion) {
        setUpdateType("error");
        setUpdateStatus("Could not determine the latest version from GitHub.");
        return;
      }

      // Semantic version comparison
      const currentVersion = "1.0.1";
      const currentParts = currentVersion.split(".").map(Number);
      const latestParts = latestVersion.split(".").map(Number);
      
      let isNewer = false;
      for (let i = 0; i < 3; i++) {
        const latestPart = latestParts[i] || 0;
        const currentPart = currentParts[i] || 0;
        if (latestPart > currentPart) {
          isNewer = true;
          break;
        } else if (latestPart < currentPart) {
          break;
        }
      }

      if (isNewer) {
        // Detect OS platform to recommend the right asset
        const userAgent = navigator.userAgent.toLowerCase();
        let targetExt = "";
        let targetName = "";

        if (userAgent.includes("win")) {
          targetExt = ".exe";
          targetName = "Windows Installer (.exe)";
        } else if (userAgent.includes("mac")) {
          targetExt = ".dmg";
          targetName = "macOS Disk Image (.dmg)";
        } else if (userAgent.includes("linux")) {
          // On Linux, prefer .pkg.tar.zst for Arch, or .AppImage / .deb
          if (userAgent.includes("arch") || userAgent.includes("manjaro")) {
            targetExt = ".pkg.tar.zst";
            targetName = "Arch Linux Package (.pkg.tar.zst)";
          } else if (userAgent.includes("ubuntu") || userAgent.includes("debian")) {
            targetExt = ".deb";
            targetName = "Debian Package (.deb)";
          } else {
            targetExt = ".AppImage";
            targetName = "Linux AppImage (.AppImage)";
          }
        }

        // Search for a matching asset
        let matchedAsset = null;
        if (data.assets && Array.isArray(data.assets)) {
          if (targetExt) {
            matchedAsset = data.assets.find((asset: any) => asset.name.toLowerCase().endsWith(targetExt));
          }
          if (!matchedAsset && userAgent.includes("linux")) {
            matchedAsset = data.assets.find((asset: any) => asset.name.toLowerCase().endsWith(".appimage")) ||
                           data.assets.find((asset: any) => asset.name.toLowerCase().endsWith(".deb")) ||
                           data.assets.find((asset: any) => asset.name.toLowerCase().endsWith(".pkg.tar.zst"));
          }
        }

        const downloadUrl = matchedAsset ? matchedAsset.browser_download_url : data.html_url;
        const assetLabel = matchedAsset ? `Download ${targetName || matchedAsset.name}` : "Open Releases Page";

        setUpdateType("success");
        setUpdateStatus(
          <span className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span>New version v{latestVersion} is available!</span>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-link)] font-semibold underline hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1"
            >
              {assetLabel}
            </a>
          </span>
        );
      } else {
        setUpdateType("success");
        setUpdateStatus(`You are up to date! Version ${currentVersion} is the latest version.`);
      }
    } catch (err: any) {
      setUpdateType("error");
      setUpdateStatus(err.message || "Failed to check for updates. Rate limit or connection issue.");
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const optionSections = [
    { id: "general" as const, label: "General", icon: Settings },
    { id: "editor" as const, label: "Editor", icon: Type },
    { id: "files" as const, label: "Files and links", icon: FileText },
    { id: "appearance" as const, label: "Appearance", icon: Palette },
    { id: "hotkeys" as const, label: "Hotkeys", icon: Keyboard },
    { id: "keychain" as const, label: "Keychain", icon: KeyRound },
    { id: "core-plugins" as const, label: "Core plugins", icon: Puzzle },
    { id: "plugins" as const, label: "Community plugins", icon: Puzzle },
  ];

  const appSections = [
    { id: "ai" as const, label: "Configure AI", icon: Brain },
    { id: "database" as const, label: "Database", icon: Database },
  ];

  const coreSections = [
    { id: "backlinks" as const, label: "Backlinks", icon: Link2 },
    { id: "canvas" as const, label: "Canvas", icon: Grid2X2 },
    { id: "command-palette" as const, label: "Command palette", icon: Terminal },
    { id: "daily-notes" as const, label: "Daily notes", icon: CalendarDays },
    { id: "page-preview" as const, label: "Page preview", icon: Eye },
    { id: "quick-switcher" as const, label: "Quick switcher", icon: Search },
    { id: "templates" as const, label: "Templates", icon: Copy },
    { id: "collaboration" as const, label: "Collaboration", icon: Users },
    { id: "about" as const, label: "About", icon: Info },
  ];

  const commandRows = useMemo(() => {
    const baseCommands = commands.length > 0 ? commands : [
      { id: "new-note", label: "Create new note", shortcut: "Ctrl+N", action: () => {}, category: "Notes" },
      { id: "save", label: "Save current note", shortcut: "Ctrl+S", action: () => {}, category: "Notes" },
      { id: "search-file", label: "Find inside current note", shortcut: "Ctrl+F", action: () => {}, category: "Search" },
      { id: "search-vault", label: "Search all notes in vault", shortcut: "Ctrl+Shift+F", action: () => {}, category: "Search" },
      { id: "command-palette", label: "Open command palette", shortcut: "Ctrl+P", action: () => {}, category: "Command palette" },
    ];
    return baseCommands
      .map((cmd) => ({
        ...cmd,
        searchable: `${cmd.label} ${cmd.shortcut || "Blank"} ${cmd.category || ""}`.toLowerCase(),
      }))
      .filter((cmd) => cmd.searchable.includes(searchHotkey.toLowerCase()))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [commands, searchHotkey]);

  const renderNavSection = (items: Array<{ id: SettingsSection; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }>) => (
    items.map((item) => (
      <button
        key={item.id}
        className={cx(navItemClass, activeSection === item.id && navItemActiveClass)}
        onClick={() => setActiveSection(item.id)}
      >
        <item.icon size={16} />
        <span>{item.label}</span>
      </button>
    ))
  );

  return (
    <div className={overlayClass}>
      <style>{settingsPageStyle}</style>
      <div className={pageClass}>
        {isBrowsingPlugins ? (
          <PluginMarketplace
            onClose={() => setIsBrowsingPlugins(false)}
            onInstall={onInstallPlugin || (async () => false)}
            installedPluginIds={plugins.map((p) => p.manifest.id)}
          />
        ) : (
          <>
            <button className={closeClass} onClick={onClose} aria-label="Close settings">
              <X size={20} />
            </button>
            <aside className={sidebarClass}>
              <div className={navHeaderClass}>Options</div>
              {renderNavSection(optionSections)}
              <div className={navHeaderClass}>OpenObsidian</div>
              {renderNavSection(appSections)}
              <div className={navHeaderClass}>Core plugins</div>
              {renderNavSection(coreSections)}
            </aside>

            <main className={contentClass}>
              {activeSection === "general" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow
                      title="Version 1.0.1"
                      description={(
                        <>
                          Installer version: 1.0.1{" "}
                          <button className="text-[var(--text-link)] underline" onClick={() => setActiveSection("about")}>
                            Read the changelog.
                          </button>
                          <StatusLine type={updateType} message={updateStatus} />
                        </>
                      )}
                    >
                      <button className={buttonClass} onClick={handleCheckForUpdates} disabled={isCheckingUpdates}>
                        {isCheckingUpdates ? "Checking..." : "Check for updates"}
                      </button>
                    </SettingRow>
                    <SettingRow title="Language" description="Change the display language.">
                      <select className={selectClass} value={localSettings.language} onChange={(e) => updateSetting("language", e.target.value as AppSettings["language"])}>
                        <option>English</option>
                      </select>
                    </SettingRow>
                    <SettingRow title="Help" description="Learn how to use OpenObsidian and get help from the community.">
                      <button className={buttonClass} onClick={() => window.open("https://github.com", "_blank", "noopener,noreferrer")}>Open</button>
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Account</h3>
                  <SettingGroup>
                    <SettingRow
                      title="Your account"
                      description={currentUser ? <>Logged in as <strong>{currentUser.email}</strong>.</> : "You're not logged in right now. Log in or sign up to enable cloud spaces and collaboration."}
                    >
                      {currentUser ? (
                        <button className={buttonClass} onClick={() => void authManager.signOut()}>Log out</button>
                      ) : (
                        <>
                          <button className={buttonClass} onClick={() => { setAuthModalMode("login"); setShowAuthModal(true); }}>Log in</button>
                          <button className={buttonClass} onClick={() => { setAuthModalMode("signup"); setShowAuthModal(true); }}>Sign up</button>
                        </>
                      )}
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "editor" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Always focus new tabs" description="When you open a link in a new tab, switch to it immediately.">
                      <Toggle checked={localSettings.alwaysFocusNewTabs} onChange={(v) => updateSetting("alwaysFocusNewTabs", v)} />
                    </SettingRow>
                    <SettingRow title="Default view for new tabs" description="The default view that a new Markdown tab gets opened in.">
                      <select className={selectClass} value={localSettings.defaultView} onChange={(e) => updateSetting("defaultView", e.target.value as AppSettings["defaultView"])}>
                        <option value="editor">Editing view</option>
                        <option value="preview">Reading view</option>
                        <option value="split">Split view</option>
                      </select>
                    </SettingRow>
                    <SettingRow title="Default editing mode" description="The default editing mode a new tab will start with.">
                      <select className={selectClass} value={localSettings.defaultEditingMode} onChange={(e) => updateSetting("defaultEditingMode", e.target.value as AppSettings["defaultEditingMode"])}>
                        <option value="live-preview">Live Preview</option>
                        <option value="source">Source mode</option>
                      </select>
                    </SettingRow>
                    <SettingRow title="Show editing mode in status bar" description="Show the editing mode toggle in the status bar.">
                      <Toggle checked={localSettings.showEditingModeStatusBar} onChange={(v) => updateSetting("showEditingModeStatusBar", v)} />
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Display</h3>
                  <SettingGroup>
                    <SettingRow title="Readable line length" description="Limit maximum line length. Less content fits onscreen, but long blocks of text are more readable.">
                      <Toggle checked={localSettings.readableLineLength} onChange={(v) => updateSetting("readableLineLength", v)} />
                    </SettingRow>
                    <SettingRow title="Line width" description="Width used when readable line length is enabled.">
                      <input className={rangeClass} type="range" min={640} max={1180} step={1} value={localSettings.readingViewWidth} style={rangeProgressStyle(localSettings.readingViewWidth, 640, 1180)} onChange={(e) => updateSetting("readingViewWidth", Number(e.target.value))} />
                      <span className="w-14 text-right text-xs text-[var(--text-muted)]">{localSettings.readingViewWidth}px</span>
                    </SettingRow>
                    <SettingRow title="Strict line breaks" description="Markdown specs ignore single line breaks in reading view.">
                      <Toggle checked={localSettings.strictLineBreaks} onChange={(v) => updateSetting("strictLineBreaks", v)} />
                    </SettingRow>
                    <SettingRow title="Properties in document" description="Choose how properties are displayed at the top of notes.">
                      <select className={selectClass} value={localSettings.propertiesInDocument} onChange={(e) => updateSetting("propertiesInDocument", e.target.value as AppSettings["propertiesInDocument"])}>
                        <option value="visible">Visible</option>
                        <option value="hidden">Hidden</option>
                        <option value="source">Source</option>
                      </select>
                    </SettingRow>
                    <SettingRow title="Fold heading" description="Lets you fold all content under a heading.">
                      <Toggle checked={localSettings.foldHeading} onChange={(v) => updateSetting("foldHeading", v)} />
                    </SettingRow>
                    <SettingRow title="Line numbers" description="Show line numbers in the gutter.">
                      <Toggle checked={localSettings.showLineNumbers} onChange={(v) => updateSetting("showLineNumbers", v)} />
                    </SettingRow>
                    <SettingRow title="Indentation guides" description="Show vertical relationship lines between list items.">
                      <Toggle checked={localSettings.indentationGuides} onChange={(v) => updateSetting("indentationGuides", v)} />
                    </SettingRow>
                    <SettingRow title="Right-to-left (RTL)" description="Sets the default text direction of notes to right-to-left.">
                      <Toggle checked={localSettings.rightToLeft} onChange={(v) => updateSetting("rightToLeft", v)} />
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Behavior</h3>
                  <SettingGroup>
                    <SettingRow title="Spellcheck" description="Turn on the spellchecker.">
                      <Toggle checked={localSettings.spellcheck} onChange={(v) => updateSetting("spellcheck", v)} />
                    </SettingRow>
                    <SettingRow title="Auto-pair brackets" description="Pair brackets and quotes automatically.">
                      <Toggle checked={localSettings.autoPairBrackets} onChange={(v) => updateSetting("autoPairBrackets", v)} />
                    </SettingRow>
                    <SettingRow title="Auto-pair Markdown syntax" description="Pair symbols automatically for bold, italic, code, and more.">
                      <Toggle checked={localSettings.autoPairMarkdown} onChange={(v) => updateSetting("autoPairMarkdown", v)} />
                    </SettingRow>
                    <SettingRow title="Indent using tabs" description="Use tabs to indent by pressing the Tab key.">
                      <Toggle checked={localSettings.indentUsingTabs} onChange={(v) => updateSetting("indentUsingTabs", v)} />
                    </SettingRow>
                    <SettingRow title="Indent visual width" description="Number of spaces a tab character will render as.">
                      <input className={rangeClass} type="range" min={2} max={8} step={1} value={localSettings.tabSize} style={rangeProgressStyle(localSettings.tabSize, 2, 8)} onChange={(e) => updateSetting("tabSize", Number(e.target.value))} />
                      <span className="w-8 text-right text-xs text-[var(--text-muted)]">{localSettings.tabSize}</span>
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Advanced</h3>
                  <SettingGroup>
                    <SettingRow title="Vim key bindings" description="Use Vim key bindings when editing.">
                      <Toggle checked={localSettings.vimMode} onChange={(v) => updateSetting("vimMode", v)} />
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "files" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Default file to open" description="Choose which file to open when the app starts.">
                      <select className={selectClass} value={localSettings.defaultFileToOpen} onChange={(e) => updateSetting("defaultFileToOpen", e.target.value as AppSettings["defaultFileToOpen"])}>
                        <option value="last-opened">Last opened</option>
                        <option value="new-tab">New tab</option>
                      </select>
                    </SettingRow>
                    <SettingRow title="Default location for new notes" description="Where newly created notes are placed.">
                      <select className={selectClass} value={localSettings.defaultNoteLocation} onChange={(e) => updateSetting("defaultNoteLocation", e.target.value as AppSettings["defaultNoteLocation"])}>
                        <option value="vault">Vault folder</option>
                        <option value="same-folder">Same folder as active file</option>
                      </select>
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Links</h3>
                  <SettingGroup>
                    <SettingRow title="Automatically update internal links" description="Prompt to update links after renaming a file.">
                      <Toggle checked={localSettings.autoUpdateInternalLinks} onChange={(v) => updateSetting("autoUpdateInternalLinks", v)} />
                    </SettingRow>
                    <SettingRow title="Use [[Wikilinks]]" description="Auto-generate Wikilinks instead of Markdown links and images.">
                      <Toggle checked={localSettings.useWikiLinks} onChange={(v) => updateSetting("useWikiLinks", v)} />
                    </SettingRow>
                    <SettingRow title="Show all file types" description="Show files with any extension in File Explorer and Quick Switcher.">
                      <Toggle checked={localSettings.showAllFileTypes} onChange={(v) => updateSetting("showAllFileTypes", v)} />
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Trash</h3>
                  <SettingGroup>
                    <SettingRow title="Confirm before deleting files" description="Avoid accidentally deleting files.">
                      <Toggle checked={localSettings.confirmBeforeDelete} onChange={(v) => updateSetting("confirmBeforeDelete", v)} />
                    </SettingRow>
                    <SettingRow title="Deleted files" description="What happens to a file after you delete it.">
                      <select className={selectClass} value={localSettings.deletedFilesMode} onChange={(e) => updateSetting("deletedFilesMode", e.target.value as AppSettings["deletedFilesMode"])}>
                        <option value="system-trash">Move to system trash</option>
                        <option value="app-trash">Move to app trash</option>
                        <option value="permanent">Delete permanently</option>
                      </select>
                    </SettingRow>
                  </SettingGroup>

                </div>
              )}

              {activeSection === "appearance" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Base color scheme" description="Choose OpenObsidian's default color scheme.">
                      <select className={selectClass} value={localSettings.theme} onChange={(e) => updateSetting("theme", e.target.value as AppSettings["theme"])}>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                        <option value="system">Adapt to system</option>
                        <option value="dark-plus">Dark+</option>
                        <option value="blue-night">Blue Night</option>
                        <option value="oceanic">Oceanic</option>
                        <option value="ember-night">Ember Night</option>
                        <option value="aurora-grove">Aurora Grove</option>
                        <option value="paper-sage">Paper Sage</option>
                        <option value="rose-quartz">Rose Quartz</option>
                        <option value="custom">Custom</option>
                      </select>
                    </SettingRow>
                    {localSettings.theme === "custom" && (
                      <>
                        <SettingRow title="Custom theme type" description="Choose whether the custom theme is treated as dark or light for image assets.">
                          <select className={selectClass} value={localSettings.customThemeType || "dark"} onChange={(e) => updateSetting("customThemeType", e.target.value as "dark" | "light")}>
                            <option value="dark">Dark</option>
                            <option value="light">Light</option>
                          </select>
                        </SettingRow>
                        <SettingRow title="Accent color" description="Choose the accent color used throughout the app.">
                          <input
                            type="color"
                            className="h-8 w-10 rounded border border-[var(--border-medium)] bg-transparent"
                            value={customThemeDraft.accentColor}
                            onInput={(e) => updateCustomThemeDraft("accentColor", e.currentTarget.value)}
                            onBlur={(e) => commitCustomThemeColor("accentColor", e.currentTarget.value)}
                            onPointerUp={(e) => commitCustomThemeColor("accentColor", e.currentTarget.value)}
                            onKeyUp={(e) => {
                              if (e.key === "Enter") commitCustomThemeColor("accentColor", e.currentTarget.value);
                            }}
                          />
                        </SettingRow>
                        <SettingRow title="Custom background color">
                          <input
                            type="color"
                            className="h-8 w-10 rounded border border-[var(--border-medium)] bg-transparent"
                            value={customThemeDraft.customBgPrimary}
                            onInput={(e) => updateCustomThemeDraft("customBgPrimary", e.currentTarget.value)}
                            onBlur={(e) => commitCustomThemeColor("customBgPrimary", e.currentTarget.value)}
                            onPointerUp={(e) => commitCustomThemeColor("customBgPrimary", e.currentTarget.value)}
                            onKeyUp={(e) => {
                              if (e.key === "Enter") commitCustomThemeColor("customBgPrimary", e.currentTarget.value);
                            }}
                          />
                        </SettingRow>
                        <SettingRow title="Custom text color">
                          <input
                            type="color"
                            className="h-8 w-10 rounded border border-[var(--border-medium)] bg-transparent"
                            value={customThemeDraft.customTextPrimary}
                            onInput={(e) => updateCustomThemeDraft("customTextPrimary", e.currentTarget.value)}
                            onBlur={(e) => commitCustomThemeColor("customTextPrimary", e.currentTarget.value)}
                            onPointerUp={(e) => commitCustomThemeColor("customTextPrimary", e.currentTarget.value)}
                            onKeyUp={(e) => {
                              if (e.key === "Enter") commitCustomThemeColor("customTextPrimary", e.currentTarget.value);
                            }}
                          />
                        </SettingRow>
                      </>
                    )}
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Interface</h3>
                  <SettingGroup>
                    <SettingRow title="Show ribbon" description="Display vertical toolbar on the side of the window.">
                      <Toggle checked={localSettings.showRibbon} onChange={(v) => updateSetting("showRibbon", v)} />
                    </SettingRow>
                    <SettingRow title="Ribbon menu configuration" description="Configure what commands appear in the ribbon menu.">
                      <button className={buttonClass} onClick={() => setActiveSection("core-plugins")}>Manage</button>
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Font</h3>
                  <SettingGroup>
                    <SettingRow title="Interface font" description="Set base font for all of OpenObsidian.">
                      <select className={selectClass} value={localSettings.fontFamily} onChange={(e) => updateSetting("fontFamily", e.target.value)}>
                        <option value="Inter, system-ui, sans-serif">Inter</option>
                        <option value="'SF Pro Display', system-ui, sans-serif">SF Pro</option>
                        <option value="'Segoe UI', system-ui, sans-serif">Segoe UI</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                      </select>
                    </SettingRow>
                    <SettingRow title="Font size" description="Font size in pixels that affects editing and reading views.">
                      <input className={rangeClass} type="range" min={12} max={24} value={localSettings.fontSize} style={rangeProgressStyle(localSettings.fontSize, 12, 24)} onChange={(e) => {
                        const value = Number(e.target.value);
                        const updated = { ...localSettings, fontSize: value, editorFontSize: value, previewFontSize: value };
                        setLocalSettings(updated);
                        onSettingsChange(updated);
                      }} />
                      <span className="w-10 text-right text-xs text-[var(--text-muted)]">{localSettings.fontSize}px</span>
                    </SettingRow>
                    <SettingRow title="Quick font size adjustment" description="Adjust font size using Ctrl + Scroll or trackpad pinch-zoom.">
                      <Toggle checked={localSettings.quickFontSizeAdjustment} onChange={(v) => updateSetting("quickFontSizeAdjustment", v)} />
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Advanced</h3>
                  <SettingGroup>
                    <SettingRow title="Zoom level" description="Controls the overall zoom level of the app.">
                      <input className={rangeClass} type="range" min={80} max={140} value={localSettings.zoomLevel} style={rangeProgressStyle(localSettings.zoomLevel, 80, 140)} onChange={(e) => updateSetting("zoomLevel", Number(e.target.value))} />
                      <span className="w-10 text-right text-xs text-[var(--text-muted)]">{localSettings.zoomLevel}%</span>
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "hotkeys" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Search hotkeys" description={`Showing ${commandRows.length} commands.`}>
                      <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-3">
                        <Search size={16} className="text-[var(--text-muted)]" />
                        <input className="w-52 bg-transparent text-sm outline-none placeholder:text-[var(--text-faint)]" value={searchHotkey} onChange={(e) => setSearchHotkey(e.target.value)} placeholder="Filter..." />
                      </div>
                    </SettingRow>
                    {commandRows.map((cmd) => (
                      <SettingRow key={cmd.id} title={cmd.category ? `${cmd.category}: ${cmd.label}` : cmd.label}>
                        <span className={kbdClass}>{cmd.shortcut || "Blank"}</span>
                      </SettingRow>
                    ))}
                  </SettingGroup>
                </div>
              )}

              {activeSection === "keychain" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Stored AI credentials" description="Provider API keys are saved locally in this app profile.">
                      <button className={buttonClass} onClick={() => setActiveSection("ai")}>Manage</button>
                    </SettingRow>
                    <SettingRow title="Stored database credentials" description="Supabase URL and anon key are saved locally when configured.">
                      <button className={buttonClass} onClick={() => setActiveSection("database")}>Manage</button>
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "core-plugins" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Backlinks" description="Show backlinks and mentions for the active note.">
                      <Toggle checked={localSettings.coreBacklinks} onChange={(v) => updateSetting("coreBacklinks", v)} />
                    </SettingRow>
                    <SettingRow title="Canvas" description="Create visual boards with notes and media.">
                      <Toggle checked={localSettings.coreCanvas} onChange={(v) => updateSetting("coreCanvas", v)} />
                    </SettingRow>
                    <SettingRow title="Command palette" description="Quick access to commands.">
                      <Toggle checked={localSettings.coreCommandPalette} onChange={(v) => updateSetting("coreCommandPalette", v)} />
                    </SettingRow>
                    <SettingRow title="Daily notes" description="Create notes for today's date.">
                      <Toggle checked={localSettings.coreDailyNotes} onChange={(v) => updateSetting("coreDailyNotes", v)} />
                    </SettingRow>
                    <SettingRow title="Page preview" description="Preview internal links and files.">
                      <Toggle checked={localSettings.corePagePreview} onChange={(v) => updateSetting("corePagePreview", v)} />
                    </SettingRow>
                    <SettingRow title="Quick switcher" description="Jump to notes quickly.">
                      <Toggle checked={localSettings.coreQuickSwitcher} onChange={(v) => updateSetting("coreQuickSwitcher", v)} />
                    </SettingRow>
                    <SettingRow title="Templates" description="Insert reusable note templates.">
                      <Toggle checked={localSettings.coreTemplates} onChange={(v) => updateSetting("coreTemplates", v)} />
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "backlinks" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Show backlinks pane by default" description="Open the Backlinks panel when loading a note.">
                      <Toggle checked={localSettings.backlinksOpenByDefault} onChange={(v) => updateSetting("backlinksOpenByDefault", v)} />
                    </SettingRow>
                    <SettingRow title="Include unlinked mentions" description="Search notes that mention the current file name without a link.">
                      <Toggle checked={localSettings.backlinksShowUnlinked} onChange={(v) => updateSetting("backlinksShowUnlinked", v)} />
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "canvas" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Default location for new canvas files">
                      <select className={selectClass} value={localSettings.canvasDefaultLocation} onChange={(e) => updateSetting("canvasDefaultLocation", e.target.value as AppSettings["canvasDefaultLocation"])}>
                        <option value="vault">Vault folder</option>
                        <option value="same-folder">Same folder as active file</option>
                      </select>
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "command-palette" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Command palette" description="Open the command palette with Ctrl+P and search all app/plugin commands.">
                      <Toggle checked={localSettings.coreCommandPalette} onChange={(v) => updateSetting("coreCommandPalette", v)} />
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "daily-notes" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Date format" description="Choose how daily notes are named in your vault.">
                      <input className={inputClass} value={localSettings.dailyNoteDateFormat} onChange={(e) => updateSetting("dailyNoteDateFormat", e.target.value)} />
                    </SettingRow>
                    <SettingRow title="New file location" description="New daily notes will be placed here.">
                      <input className={inputClass} value={localSettings.dailyNoteLocation} onChange={(e) => updateSetting("dailyNoteLocation", e.target.value)} placeholder="Example: folder 1/folder 2" />
                    </SettingRow>
                    <SettingRow title="Template file location" description="Choose the file to use as a template.">
                      <input className={inputClass} value={localSettings.dailyNoteTemplate} onChange={(e) => updateSetting("dailyNoteTemplate", e.target.value)} placeholder="Example: folder/note" />
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "page-preview" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Require Ctrl to trigger page preview on hover">
                      <Toggle checked={localSettings.pagePreviewRequireCtrl} onChange={(v) => updateSetting("pagePreviewRequireCtrl", v)} />
                    </SettingRow>
                    <SettingRow title="Reading view">
                      <Toggle checked={localSettings.pagePreviewReading} onChange={(v) => updateSetting("pagePreviewReading", v)} />
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "quick-switcher" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Quick switcher" description="Use Ctrl+O to search and open notes quickly.">
                      <Toggle checked={localSettings.coreQuickSwitcher} onChange={(v) => updateSetting("coreQuickSwitcher", v)} />
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "templates" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Template folder location" description="Folder containing reusable Markdown templates.">
                      <input className={inputClass} value={localSettings.templatesFolder} onChange={(e) => updateSetting("templatesFolder", e.target.value)} />
                    </SettingRow>
                    <SettingRow title="Date format" description="Format used for {{date}} replacement.">
                      <input className={inputClass} value={localSettings.templateDateFormat} onChange={(e) => updateSetting("templateDateFormat", e.target.value)} />
                    </SettingRow>
                    <SettingRow title="Time format" description="Format used for {{time}} replacement.">
                      <input className={inputClass} value={localSettings.templateTimeFormat} onChange={(e) => updateSetting("templateTimeFormat", e.target.value)} />
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "plugins" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Community plugins" description="Browse and install community plugins.">
                      <button className={primaryButtonClass} onClick={() => setIsBrowsingPlugins(true)}>Browse</button>
                    </SettingRow>
                    <SettingRow title="Current plugins" description={`You currently have ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} installed.`} />
                  </SettingGroup>
                  <h3 className={groupTitleClass}>Installed plugins</h3>
                  <PluginSettingsPanel
                    plugins={plugins}
                    settingTabs={pluginSettingTabs}
                    onEnablePlugin={onEnablePlugin || (async () => {})}
                    onDisablePlugin={onDisablePlugin || (async () => {})}
                    onRefresh={onRefreshPlugins || (async () => {})}
                    onReloadPlugin={onReloadPlugin}
                    onUninstallPlugin={onUninstallPlugin}
                    onInstallPlugin={onInstallPlugin}
                    onBrowse={() => setIsBrowsingPlugins(true)}
                  />
                </div>
              )}

              {activeSection === "ai" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Provider" description="Choose which AI provider you want to use for advanced reasoning.">
                      {AI_PROVIDER_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          className={cx(buttonClass, aiSettings.provider === preset.id && "border-[var(--color-accent)]")}
                          onClick={() => {
                            const nextKey = aiSettings.providerKeys?.[preset.id] || "";
                            const nextModels = getModelsForProvider(preset.id);
                            updateAISettings({
                              provider: preset.id,
                              apiKey: nextKey,
                              modelId: nextModels[0]?.id || DEFAULT_MODEL_ID,
                              providerKeys: { ...aiSettings.providerKeys, [aiSettings.provider]: aiSettings.apiKey },
                            });
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </SettingRow>
                    <SettingRow
                      title="API Key"
                      description={(
                        <>
                          Enter credentials for your provider.{" "}
                          <a className="inline-flex items-center gap-1 text-[var(--text-link)] underline" href={AI_PROVIDER_PRESETS.find((p) => p.id === aiSettings.provider)?.keyUrl} target="_blank" rel="noopener noreferrer">
                            Get key <ExternalLink size={12} />
                          </a>
                        </>
                      )}
                    >
                      <input className={inputClass} type="password" value={aiSettings.apiKey} onChange={(e) => updateAISettings({ apiKey: e.target.value })} placeholder={AI_PROVIDER_PRESETS.find((p) => p.id === aiSettings.provider)?.keyPlaceholder} />
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Available Models</h3>
                  <SettingGroup>
                    {models.map((model) => (
                      <SettingRow key={model.id} title={model.label} description={model.description}>
                        <button className={cx(buttonClass, aiSettings.modelId === model.id && "border-[var(--color-accent)]")} onClick={() => updateAISettings({ modelId: model.id })}>
                          {aiSettings.modelId === model.id ? "Selected" : "Select"}
                        </button>
                      </SettingRow>
                    ))}
                    {aiSettings.provider === "openrouter" && (
                      <SettingRow title="Custom Model" description={customModelDescription}>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <input
                            className={inputClass}
                            value={customModelInputValue}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              updateAISettings(isCustomModel ? { modelId: nextValue, customModelId: nextValue } : { customModelId: nextValue });
                            }}
                            placeholder="e.g. deepseek/deepseek-v4-flash:free"
                          />
                          <button
                            className={cx(buttonClass, isCustomModelSelected && "border-[var(--color-accent)]")}
                            disabled={!trimmedCustomModelInput}
                            onClick={() => updateAISettings({ modelId: trimmedCustomModelInput, customModelId: trimmedCustomModelInput })}
                          >
                            {isCustomModelSelected ? "Selected" : "Select"}
                          </button>
                        </div>
                      </SettingRow>
                    )}
                  </SettingGroup>

                  <h3 className={groupTitleClass}>System Status</h3>
                  <SettingGroup>
                    <SettingRow title="Analysis Engine" description="State of the background note indexer and vector embeddings store.">
                      <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", isModelLoaded() ? "text-[var(--success)]" : "text-[var(--text-muted)]")}>
                        {isModelLoaded() ? <Check size={14} /> : <AlertCircle size={14} />}
                        {isModelLoaded() ? `Running - ${indexedCount} notes indexed` : "Loads automatically on first note save"}
                      </span>
                    </SettingRow>
                    <SettingRow title="LLM Service Connection" description="Verification of the active remote large language model connection.">
                      <span className={cx("inline-flex items-center gap-1.5 text-[12.5px]", aiSettings.apiKey ? "text-[var(--success)]" : "text-[var(--text-muted)]")}>
                        {aiSettings.apiKey ? <Check size={14} /> : <AlertCircle size={14} />}
                        {aiSettings.apiKey ? `Connected: ${currentModel?.shortLabel || currentModel?.label}` : "No API key - local analysis still works"}
                      </span>
                    </SettingRow>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "database" && (
                <div className={sectionClass}>
                  <SettingGroup>
                    <SettingRow title="Supabase URL" description="Project URL from your Supabase API settings.">
                      <input className={inputClass} value={databaseConfig.supabaseUrl} onChange={(e) => setDatabaseConfig((current) => ({ ...current, supabaseUrl: e.target.value }))} placeholder="https://project.supabase.co" />
                    </SettingRow>
                    <SettingRow title="Anon public key" description="Use the anon public key. Do not paste a service role key into the app.">
                      <input className={inputClass} type="password" value={databaseConfig.anonKey} onChange={(e) => setDatabaseConfig((current) => ({ ...current, anonKey: e.target.value }))} placeholder="eyJhbGciOi..." />
                    </SettingRow>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Import from .env</h3>
                  <textarea className={textareaClass} value={databaseEnvText} onChange={(e) => setDatabaseEnvText(e.target.value)} placeholder={"VITE_SUPABASE_URL=https://project.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGciOi..."} />
                  <div className="mt-3 flex justify-end">
                    <button className={buttonClass} onClick={handleImportDatabaseEnv}>Import values</button>
                  </div>

                  <h3 className={groupTitleClass}>Schema migration</h3>
                  <SettingGroup>
                    <SettingRow title="Database creation SQL" description="Copy the bundled schema.sql migration and run it in the Supabase SQL Editor for a personal database.">
                      <button className={cx(buttonClass, "inline-flex items-center gap-2")} onClick={handleCopyDatabaseSchema}>
                        <Copy size={14} /> Copy SQL
                      </button>
                    </SettingRow>
                    <div className="px-0 pb-3">
                      <StatusLine type={databaseSchemaCopyStatus.type === "idle" ? "info" : databaseSchemaCopyStatus.type} message={databaseSchemaCopyStatus.message} />
                    </div>
                  </SettingGroup>

                  <h3 className={groupTitleClass}>Local Storage</h3>
                  <SettingGroup>
                    <SettingRow title="Saved credentials" description="Credentials are saved in this app's local browser storage and restored automatically on startup.">
                      <button className={buttonClass} onClick={handleTestDatabaseConnection} disabled={isTestingDatabase}>{isTestingDatabase ? "Testing..." : "Test"}</button>
                      <button className={primaryButtonClass} onClick={handleSaveDatabaseConfig}>Save</button>
                      <button className={buttonClass} onClick={handleClearDatabaseConfig}>Clear</button>
                    </SettingRow>
                    <div className="px-0 pb-3">
                      <StatusLine type={databaseStatus.type} message={databaseStatus.message} />
                    </div>
                  </SettingGroup>
                </div>
              )}

              {activeSection === "collaboration" && (
                <div className={sectionClass}>
                  <CollaborationPanel
                    vaultPath={vaultPath || null}
                    isSettingsMode={true}
                    onVaultReconstructed={onVaultReconstructed}
                    onGoToAccount={() => setActiveSection("general")}
                  />
                </div>
              )}

              {activeSection === "about" && (
                <div className={sectionClass}>
                  <div className="flex flex-col items-center py-8">
                    {/* Logo container with static contrast background (no hover scale animation) */}
                    <div className={`mb-6 flex items-center justify-center p-4 rounded-2xl shadow-sm border ${isDark ? "bg-[#18181b] border-neutral-800/80" : "bg-white border-neutral-200/60"} h-24 w-24`}>
                      <img src={isDark ? "logos/logo-dark.png" : "logos/logo-light.png"} alt="OpenObsidian logo" className="h-full w-full object-contain" />
                    </div>

                    <h2 className="mb-1 text-2xl font-bold tracking-tight text-[var(--text-primary)]">OpenObsidian</h2>
                    <div className="mb-6 flex items-center gap-2">
                      <span className="rounded-full bg-[var(--bg-tertiary)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                        v1.0.1
                      </span>
                      <span className="rounded-full bg-[rgba(52,211,153,0.12)] px-2.5 py-0.5 text-[11px] font-semibold text-[#34d399] border border-[rgba(52,211,153,0.2)]">
                        Local-First
                      </span>
                    </div>

                    <p className="max-w-lg text-center text-sm leading-relaxed text-[var(--text-secondary)] mb-10">
                      A local-first, offline-ready knowledge management tool for creating, linking, and mapping Markdown note networks.
                    </p>

                    {/* Features Grid */}
                    <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3 mb-10">
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-center sm:text-left">
                        <h4 className="mb-1 text-[13px] font-semibold text-[var(--text-primary)]">Private & Secure</h4>
                        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">Notes are stored locally on your device in plain text Markdown files.</p>
                      </div>
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-center sm:text-left">
                        <h4 className="mb-1 text-[13px] font-semibold text-[var(--text-primary)]">Linked Graph</h4>
                        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">Explore connections and visualize your thoughts as an interconnected network.</p>
                      </div>
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-center sm:text-left">
                        <h4 className="mb-1 text-[13px] font-semibold text-[var(--text-primary)]">Offline First</h4>
                        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">Work anywhere, anytime. Synced selectively when you choose.</p>
                      </div>
                    </div>

                    {/* Community / Help Section */}
                    <div className="w-full max-w-2xl rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 mb-8">
                      <h4 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                        Useful Links & Resources
                      </h4>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs">
                        <a href="https://github.com/OpenObsidian/OpenObsidian" target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                          GitHub Repository
                        </a>
                        <span className="hidden sm:inline text-[var(--border-subtle)]">|</span>
                        <a href="https://github.com/OpenObsidian/OpenObsidian/wiki" target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                          User Documentation
                        </a>
                        <span className="hidden sm:inline text-[var(--border-subtle)]">|</span>
                        <a href="https://github.com/OpenObsidian/OpenObsidian/issues" target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                          Report an Issue
                        </a>
                      </div>
                    </div>

                    {/* Factory reset button */}
                    <div className="w-full max-w-2xl border-t border-[var(--border-subtle)] pt-6 flex flex-col items-center gap-3">
                      <button className={cx(buttonClass, "inline-flex items-center border-dashed border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50")} onClick={() => onSettingsChange(DEFAULT_SETTINGS)}>
                        Reset all settings to factory default
                      </button>
                      <p className="text-[11px] text-[var(--text-muted)]">This will reset all user preferences back to their original values.</p>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </>
        )}
      </div>
      {showAuthModal && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}
