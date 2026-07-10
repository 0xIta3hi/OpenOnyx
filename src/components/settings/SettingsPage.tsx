/**
 * Settings Page - Application Configuration
 *
 * Comprehensive settings interface styled like official Obsidian:
 * - Left-side grouped sidebar (Options / Core plugins)
 * - Right-side options panel with high-contrast inputs, selects, and pill toggles
 * - Rich features (General tab, Hotkey search, detailed Core Plugin options)
 */

import React, { useState, useEffect } from "react";
import {
  X,
  Palette,
  Type,
  FileText,
  Keyboard,
  Info,
  FolderOpen,
  RotateCcw,
  Puzzle,
  Users,
  Calendar,
  Layers,
  Search,
  Terminal,
  HelpCircle,
  Clock,
  Settings,
  ArrowLeftRight,
  Shield,
  FileCode,
  Brain,
  Database,
  Check,
  AlertCircle,
  ExternalLink,
  Copy,
} from "lucide-react";
import { PluginSettingsPanel } from '../plugins/PluginSettingsPanel';
import { PluginMarketplace } from '../plugins/PluginMarketplace';
import type { PluginRegistration, PluginSettingTabRegistration } from '../../types/plugin';
import { isDarkTheme } from "../../utils/helpers";
import type { LocalVaultCollaborator, LocalVaultInvite } from "../../lib/localdb";
import { CollaborationPanel } from '../spaces/CollaborationPanel';
import { authManager } from "../../lib/auth";
import { AuthModal } from "../modals/AuthModal";
import {
  loadSettings,
  saveSettings,
  getModelsForProvider,
  AI_PROVIDER_PRESETS,
  DEFAULT_MODEL_ID,
  type AISettings
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


export interface AppSettings {
  // Appearance
  theme: "dark" | "light" | "oceanic" | "dark-plus" | "blue-night" | "night-light" | "parchment" | "system" | "custom";
  customThemeType: "dark" | "light";
  accentColor: string;
  fontFamily: string;

  // Custom Colors (used when theme === 'custom')
  customBgPrimary: string;
  customTextPrimary: string;

  // Editor
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

  // Files & Links
  defaultNoteLocation: string;
  attachmentLocation: string;
  linkFormat: "shortest" | "relative" | "absolute";
  useWikiLinks: boolean;
  autoCreateNotes: boolean;

  // Daily Notes
  dailyNoteFolder: string;
  dailyNoteFormat: string;
  dailyNoteTemplate: string;

  // Graph
  nodeSize: number;
  nodeSpacing: number;
  showOrphans: boolean;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const settingsOverlayClass =
  "settings-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur";
const settingsPageClass =
  "settings-page relative flex h-[840px] max-h-[92vh] w-[1180px] max-w-[95vw] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-medium)] bg-[var(--bg-primary)] shadow-none";
const settingsHeaderClass =
  "settings-header absolute right-0 top-0 z-[999] h-0 w-0 overflow-visible !border-b-0 !p-0";
const settingsTitleClass = "hidden";
const settingsCloseClass =
  "settings-close absolute right-5 top-4 flex cursor-pointer items-center justify-center rounded border-0 bg-transparent p-1.5 text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const settingsBodyClass = "settings-body flex h-full flex-1 overflow-hidden";
const settingsNavClass =
  "settings-nav flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-4";
const settingsNavSubheaderClass =
  "settings-nav-subheader mt-3 select-none px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] first:mt-0 first:pt-1";
const settingsNavItemClass =
  "settings-nav-item flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-3 py-1.5 text-left font-[inherit] text-[13px] font-normal text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const settingsNavItemActiveClass =
  "active bg-[var(--bg-active)] font-medium text-[var(--text-primary)]";
const settingsNavIconClass =
  "nav-icon shrink-0 text-[var(--text-muted)] opacity-70";
const settingsNavIconActiveClass =
  "text-[var(--color-accent)] opacity-100";
const settingsContentClass =
  "settings-content relative flex-1 overflow-y-auto bg-[var(--bg-primary)] px-10 pb-10 pt-[30px]";
const settingsSectionClass =
  "settings-section animate-fade-in mx-auto max-w-[800px]";
const settingCardClass =
  "setting-card flex items-center justify-between gap-6 border-b border-[var(--divider-color)] py-4 last:border-b-0";
const settingSubCardClass = `${settingCardClass} sub-card border-[var(--border-subtle)] py-3 pl-4`;
const settingInfoClass = "setting-info flex min-w-0 flex-1 flex-col gap-1 pr-6";
const settingTitleClass =
  "setting-title text-sm font-medium text-[var(--text-primary)]";
const settingTitleWithIconClass =
  "setting-title-with-icon flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]";
const settingTitleIconClass = "setting-title-icon shrink-0 text-[var(--text-muted)]";
const settingDescriptionClass =
  "setting-description mt-1 text-[12px] leading-[1.45] text-[var(--text-muted)]";
const settingLinkClass =
  "setting-link font-medium text-[var(--text-link)] no-underline hover:underline";
const settingControlClass = "setting-control flex shrink-0 items-center gap-2";
const buttonRowClass = `${settingControlClass} button-row`;
const settingBtnPrimaryClass =
  "setting-btn-primary cursor-pointer rounded border-0 bg-[var(--color-accent)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-on-accent)] transition-[background-color,transform] duration-150 hover:bg-[var(--color-accent-1)] active:scale-[0.98] active:bg-[var(--color-accent-2)]";
const settingBtnSecondaryClass =
  "setting-btn-secondary cursor-pointer rounded border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-[background-color,border-color,transform] duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] active:scale-[0.98] active:bg-[var(--bg-active)]";
const settingIconBtnSecondaryClass =
  `${settingBtnSecondaryClass} icon-btn flex shrink-0 items-center justify-center p-1.5`;
const settingSelectClass =
  "setting-select min-w-40 cursor-pointer rounded border border-[var(--border-medium)] bg-[var(--bg-input)] px-3 py-1.5 font-[inherit] text-[13px] text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[var(--color-accent)]";
const settingInputClass =
  "setting-input w-full max-w-60 rounded border border-[var(--border-medium)] bg-[var(--bg-input)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none transition-colors duration-150 placeholder:text-[var(--text-faint)] focus:border-[var(--color-accent)]";
const settingTextareaClass =
  "setting-textarea min-h-24 w-full rounded border border-[var(--border-medium)] bg-[var(--bg-input)] px-3 py-2 font-mono text-[12px] leading-[1.45] text-[var(--text-primary)] outline-none transition-colors duration-150 placeholder:text-[var(--text-faint)] focus:border-[var(--color-accent)]";
const browseControlClass =
  "setting-control browse-control flex w-full max-w-60 items-center gap-1.5 [&_.setting-input]:max-w-none [&_.setting-input]:flex-1";
const settingGroupHeaderClass =
  "setting-group-header mb-3 mt-8 select-none border-b border-[var(--border-subtle)] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]";
const rangeControlClass =
  "setting-control range-control flex w-full max-w-60 items-center gap-3";
const settingRangeSliderClass =
  "setting-range-slider h-1 flex-1 cursor-pointer appearance-none rounded-sm bg-[var(--bg-tertiary)] outline-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-accent)] [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.2)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-100 [&::-webkit-slider-thumb:hover]:scale-120";
const rangeIndicatorClass =
  "range-indicator min-w-8 text-right font-mono text-xs text-[var(--text-secondary)]";
const customThemeSubpanelClass =
  "custom-theme-subpanel my-2 mb-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-1";
const toggleRowClass =
  "setting-control toggle-row flex gap-1 rounded-md border border-[var(--border-medium)] bg-[var(--bg-tertiary)] p-[3px]";
const settingBtnTabClass =
  "setting-btn-tab flex-1 cursor-pointer rounded border-0 bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--text-primary)]";
const settingBtnTabActiveClass =
  "active bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-none";
const settingColorPickerClass =
  "setting-color-picker h-7 w-12 cursor-pointer appearance-none overflow-hidden rounded border border-[var(--border-medium)] bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0";
const hotkeySearchBoxClass =
  "hotkey-search-box mt-2.5 flex items-center gap-2 rounded-md border border-[var(--border-medium)] bg-[var(--bg-input)] px-3 py-1.5 transition-colors duration-150 focus-within:border-[var(--color-accent)]";
const hotkeysHeaderRowClass = "hotkeys-header-row mb-5";
const hotkeySearchIconClass = "search-icon text-[var(--text-muted)]";
const hotkeySearchInputClass =
  "hotkey-search-input w-full border-0 bg-transparent text-[13px] text-[var(--text-primary)] outline-none";
const hotkeyListClass =
  "hotkey-list grid max-h-[480px] grid-cols-1 gap-2 overflow-y-auto pr-1";
const hotkeyCardClass =
  "hotkey-card flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 transition-colors duration-150 hover:border-[var(--border-medium)] hover:bg-[var(--bg-hover)]";
const hotkeyDescClass = "hotkey-desc text-[13px] text-[var(--text-primary)]";
const hotkeyKbdClass =
  "hotkey-kbd rounded border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-1.5 py-[3px] font-mono text-[11px] text-[var(--text-secondary)] shadow-none";
const hotkeysEmptyClass =
  "hotkeys-empty p-[30px] text-center text-[13px] text-[var(--text-muted)]";
const aboutInfoClass =
  "about-info flex flex-col items-center py-5 text-center";
const aboutLogoWrapperClass = "about-logo-wrapper mb-5";
const aboutLogoImgClass = "about-logo-img h-16 w-auto object-contain";
const aboutVersionClass = "about-version mb-4 text-xs text-[var(--text-muted)]";
const aboutDescriptionClass =
  "about-description mb-6 max-w-[440px] text-[13px] leading-normal text-[var(--text-secondary)]";
const aboutHeadingClass =
  "m-0 mb-1.5 border-0 p-0 text-lg font-semibold text-[var(--text-primary)]";
const aboutLinksClass = "about-links flex items-center gap-2 text-[13px]";
const aboutLinkClass = "about-link text-[var(--text-link)] no-underline hover:underline";
const linkDividerClass = "link-divider text-[var(--text-faint)]";
const resetContainerClass =
  "reset-container mt-10 flex justify-center border-t border-[var(--border-subtle)] pt-6";
const settingResetBtnClass =
  "setting-reset-btn flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--border-medium)] bg-transparent px-4 py-2.5 text-[13px] text-[var(--text-muted)] transition-colors duration-150 hover:border-[rgba(239,68,68,0.3)] hover:bg-[rgba(239,68,68,0.05)] hover:text-[var(--danger)]";
const resetIconClass = "reset-icon shrink-0";
const settingToggleClass = "relative inline-block h-5 w-[38px] shrink-0 cursor-pointer";
const settingToggleInputClass = "peer absolute h-0 w-0 opacity-0";
const toggleSliderClass =
  "absolute inset-0 rounded-full border border-[var(--border-medium)] bg-[var(--bg-tertiary)] transition-colors duration-[250ms] before:absolute before:bottom-0.5 before:left-0.5 before:h-3.5 before:w-3.5 before:rounded-full before:bg-white before:shadow-[0_1px_3px_rgba(0,0,0,0.15)] before:transition-transform before:duration-[250ms] peer-checked:border-[var(--color-accent-1)] peer-checked:bg-[var(--color-accent)] peer-checked:before:translate-x-[18px] peer-checked:before:bg-[var(--text-on-accent)]";

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

  defaultNoteLocation: "",
  attachmentLocation: "attachments",
  linkFormat: "shortest",
  useWikiLinks: true,
  autoCreateNotes: true,

  dailyNoteFolder: "Daily Notes",
  dailyNoteFormat: "YYYY-MM-DD",
  dailyNoteTemplate: "",

  nodeSize: 5,
  nodeSpacing: 100,
  showOrphans: true,
};

interface SettingsPageProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClose: () => void;
  plugins?: PluginRegistration[];
  pluginSettingTabs?: PluginSettingTabRegistration[];
  onEnablePlugin?: (pluginId: string) => Promise<void>;
  onDisablePlugin?: (pluginId: string) => Promise<void>;
  onRefreshPlugins?: () => Promise<void>;
  onReloadPlugin?: (pluginId: string) => Promise<void>;
  onUninstallPlugin?: (pluginId: string) => Promise<boolean>;
  onInstallPlugin?: (repo: string, pluginId: string, version?: string) => Promise<boolean>;

  // Collaboration props
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

type SettingsSection = 
  | "general" 
  | "editor" 
  | "files" 
  | "appearance" 
  | "hotkeys" 
  | "ai"
  | "database"
  | "plugins"
  // Core Plugins sub-items
  | "backlinks"
  | "canvas"
  | "daily-notes"
  | "collaboration"
  | "templates"
  | "about";

export function SettingsPage({
  settings,
  onSettingsChange,
  onClose,
  plugins = [],
  pluginSettingTabs = [],
  onEnablePlugin,
  onDisablePlugin,
  onRefreshPlugins,
  onReloadPlugin,
  onUninstallPlugin,
  onInstallPlugin,
  collaborators = [],
  invitesSent = [],
  invitesReceived = [],
  onInviteUser,
  onRemoveCollaborator,
  onAcceptInvite,
  onRejectInvite,
  currentUserEmail,
  vaultPath,
  onVaultReconstructed,
  initialSection,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection || "general");
  const [isBrowsingPlugins, setIsBrowsingPlugins] = useState(false);
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [searchHotkey, setSearchHotkey] = useState("");
  const pageRef = React.useRef<HTMLDivElement>(null);
  const isDark = isDarkTheme(localSettings.theme);

  const [currentUser, setCurrentUser] = useState(authManager.getUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    const unsub = authManager.subscribe((state) => {
      setCurrentUser(state.user);
    });
    return unsub;
  }, []);


  // General tab local states to mock official settings interaction beautifully
  const [autoUpdates, setAutoUpdates] = useState(true);
  const [notifyStartup, setNotifyStartup] = useState(true);
  const [cliEnabled, setCliEnabled] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("English");

  // AI Settings local states
  const [aiSettings, setAiSettings] = useState<AISettings>(() => loadSettings());
  const [store, setStore] = useState(() => loadStore());
  const indexedCount = store.entries.size;

  const updateAISettings = (patch: Partial<AISettings>) => {
    setAiSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
    // Notify AIPage or other components immediately
    window.dispatchEvent(new Event("ai-settings-changed"));
  };

  useEffect(() => {
    if (activeSection !== "ai") return;
    const interval = setInterval(() => {
      setStore(loadStore());
    }, 3000);
    return () => clearInterval(interval);
  }, [activeSection]);

  const models = getModelsForProvider(aiSettings.provider);
  const matchedModel = models.find((m) => m.id === aiSettings.modelId);
  const isCustomModel = !matchedModel && aiSettings.provider === "openrouter";
  const currentModel = matchedModel || (isCustomModel ? {
    id: aiSettings.modelId,
    label: aiSettings.modelId,
    shortLabel: aiSettings.modelId.split("/").pop() || aiSettings.modelId,
    description: "Custom OpenRouter Model",
    supportsGrounding: false
  } : models[0]);

  const hasApiKey = !!aiSettings.apiKey;

  const [databaseConfig, setDatabaseConfig] = useState<UserDatabaseConfig>(() => (
    loadSavedUserDatabaseConfig() ||
    getUserDatabaseConfig() || {
      supabaseUrl: "",
      anonKey: "",
    }
  ));
  const [databaseEnvText, setDatabaseEnvText] = useState("");
  const [databaseStatus, setDatabaseStatus] = useState<{
    type: "idle" | "success" | "error" | "info";
    message: string;
  }>(() => (
    loadSavedUserDatabaseConfig()
      ? { type: "success", message: "Saved local Supabase credentials are active." }
      : { type: "idle", message: "" }
  ));
  const [databaseSchemaCopyStatus, setDatabaseSchemaCopyStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [isTestingDatabase, setIsTestingDatabase] = useState(false);

  const normalizedDatabaseConfig = (): UserDatabaseConfig => ({
    supabaseUrl: databaseConfig.supabaseUrl.trim(),
    anonKey: databaseConfig.anonKey.trim(),
  });

  const handleImportDatabaseEnv = () => {
    const parsed = parseSupabaseEnv(databaseEnvText);
    if (!parsed.supabaseUrl && !parsed.anonKey) {
      setDatabaseStatus({
        type: "error",
        message: "Could not find VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in that text.",
      });
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
      setDatabaseStatus(
        result.ok
          ? { type: "success", message: "Connection verified." }
          : { type: "error", message: result.error || "Connection failed." },
      );
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
      const saved = saveUserDatabaseConfig(config);
      connectUserDatabase(saved);
      configureSupabaseClient(saved);
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
      setDatabaseSchemaCopyStatus({
        type: "success",
        message: "Copied schema.sql migration to clipboard.",
      });
    } catch (err) {
      console.error("Failed to copy database schema:", err);
      setDatabaseSchemaCopyStatus({
        type: "error",
        message: "Failed to copy migration SQL.",
      });
    }
  };

  // Keep localSettings in sync if props change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onSettingsChange(updated);
  };

  const resetSettings = () => {
    setLocalSettings(DEFAULT_SETTINGS);
    onSettingsChange(DEFAULT_SETTINGS);
  };

  const resetEditorSettings = () => {
    const updated = {
      ...localSettings,
      fontSize: DEFAULT_SETTINGS.fontSize,
      editorFontSize: DEFAULT_SETTINGS.editorFontSize,
      previewFontSize: DEFAULT_SETTINGS.previewFontSize,
      readingViewWidth: DEFAULT_SETTINGS.readingViewWidth,
      lineHeight: DEFAULT_SETTINGS.lineHeight,
      tabSize: DEFAULT_SETTINGS.tabSize,
      showLineNumbers: DEFAULT_SETTINGS.showLineNumbers,
      wordWrap: DEFAULT_SETTINGS.wordWrap,
      spellcheck: DEFAULT_SETTINGS.spellcheck,
      vimMode: DEFAULT_SETTINGS.vimMode,
    };
    setLocalSettings(updated);
    onSettingsChange(updated);
  };

  // Sections definitions for grouped sidebar navigation
  const optionSectionsList = [
    { id: "general" as const, label: "General", icon: Settings },
    { id: "editor" as const, label: "Editor", icon: Type },
    { id: "files" as const, label: "Files and links", icon: FileText },
    { id: "appearance" as const, label: "Appearance", icon: Palette },
    { id: "hotkeys" as const, label: "Hotkeys", icon: Keyboard },
    { id: "ai" as const, label: "Configure AI", icon: Brain },
    { id: "database" as const, label: "Database", icon: Database },
    { id: "plugins" as const, label: "Community plugins", icon: Puzzle },
  ];

  const corePluginsList = [
    { id: "backlinks" as const, label: "Backlinks", icon: ArrowLeftRight },
    { id: "canvas" as const, label: "Canvas", icon: Layers },
    { id: "daily-notes" as const, label: "Daily notes", icon: Calendar },
    { id: "collaboration" as const, label: "Collaboration", icon: Users },
    { id: "templates" as const, label: "Templates", icon: FolderOpen },
    { id: "about" as const, label: "About", icon: Info },
  ];

  // Hotkeys data with description and shortcut keys
  const hotkeysList = [
    { description: "Create new note", keys: "Ctrl+N" },
    { description: "Save current note", keys: "Ctrl+S" },
    { description: "Find inside current note", keys: "Ctrl+F" },
    { description: "Fuzzy search vault (Quick Switcher)", keys: "Ctrl+O" },
    { description: "Search all notes in vault", keys: "Ctrl+Shift+F" },
    { description: "Toggle Command Palette", keys: "Ctrl+P" },
    { description: "Toggle graph view", keys: "Ctrl+G" },
    { description: "Toggle sidebar panel layout", keys: "Ctrl+B" },
    { description: "Close active editor tab", keys: "Ctrl+W" },
    { description: "Zoom editor text size", keys: "Ctrl+Scroll" },
    { description: "Split active editor pane", keys: "Ctrl+\\" },
    { description: "Show local backlinks panel", keys: "Ctrl+Shift+B" },
    { description: "Create daily journal note", keys: "Ctrl+Shift+D" },
    { description: "Format text as bold", keys: "Ctrl+B (Selection)" },
    { description: "Format text as italic", keys: "Ctrl+I (Selection)" },
  ];

  const filteredHotkeys = hotkeysList.filter((item) =>
    item.description.toLowerCase().includes(searchHotkey.toLowerCase()) ||
    item.keys.toLowerCase().includes(searchHotkey.toLowerCase())
  );

  return (
    <div className={settingsOverlayClass}>
      <div className={settingsPageClass} ref={pageRef}>
        {isBrowsingPlugins ? (
          <PluginMarketplace
            onClose={() => setIsBrowsingPlugins(false)}
            onInstall={onInstallPlugin || (async () => false)}
            installedPluginIds={plugins.map((p) => p.manifest.id)}
          />
        ) : (
          <>
            <div className={settingsHeaderClass}>
              <h2 className={settingsTitleClass}>Settings</h2>
              <button className={settingsCloseClass} onClick={onClose} aria-label="Close settings">
                <X size={20} />
              </button>
            </div>

            <div className={settingsBodyClass}>
          <nav className={settingsNavClass}>
            <div className={settingsNavSubheaderClass}>Options</div>
            {optionSectionsList.map((section) => (
              <button
                key={section.id}
                className={cx(settingsNavItemClass, activeSection === section.id && settingsNavItemActiveClass)}
                onClick={() => setActiveSection(section.id)}
              >
                <section.icon size={16} className={cx(settingsNavIconClass, activeSection === section.id && settingsNavIconActiveClass)} />
                <span>{section.label}</span>
              </button>
            ))}

            <div className={settingsNavSubheaderClass}>Core plugins</div>
            {corePluginsList.map((section) => (
              <button
                key={section.id}
                className={cx(settingsNavItemClass, activeSection === section.id && settingsNavItemActiveClass)}
                onClick={() => setActiveSection(section.id)}
              >
                <section.icon size={16} className={cx(settingsNavIconClass, activeSection === section.id && settingsNavIconActiveClass)} />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className={settingsContentClass}>
            {/* ── GENERAL SECTION ─────────────────────────────────── */}
            {activeSection === "general" && (
              <div className={settingsSectionClass}>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Version 1.0.0</div>
                    <div className={settingDescriptionClass}>
                      Installer version: 1.0.0. <a href="#" className={settingLinkClass}>Read the changelog</a>.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <button className={settingBtnPrimaryClass}>Check for updates</button>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Automatic updates</div>
                    <div className={settingDescriptionClass}>
                      Turn this off to prevent the app from checking for updates.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={autoUpdates}
                        onChange={(e) => setAutoUpdates(e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Language</div>
                    <div className={settingDescriptionClass}>
                      Change the display language. <a href="#" className={settingLinkClass}>Learn how to add languages</a>.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className={settingSelectClass}
                    >
                      <option value="English">English</option>
                      <option value="Deutsch">Deutsch</option>
                      <option value="Español">Español</option>
                      <option value="Français">Français</option>
                      <option value="日本語">日本語</option>
                      <option value="简体中文">简体中文</option>
                    </select>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Help</div>
                    <div className={settingDescriptionClass}>
                      Learn how to use OpenObsidian and get help from the community.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <button className={settingBtnSecondaryClass}>Open</button>
                  </div>
                </div>

                <h3 className={settingGroupHeaderClass}>Account</h3>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Your account</div>
                    <div className={settingDescriptionClass}>
                      {currentUser ? (
                        <span>Logged in as <strong>{currentUser.email}</strong>. Your account is connected and ready for cloud sync and collaboration.</span>
                      ) : (
                        <span>You're not logged in right now. Log in or sign up to enable cloud spaces, secure sync, and collaboration.</span>
                      )}
                    </div>
                  </div>
                  <div className={buttonRowClass}>
                    {currentUser ? (
                      <button
                        className={settingBtnSecondaryClass}
                        onClick={async () => {
                          try {
                            await authManager.signOut();
                          } catch (err) {
                            console.error("Sign out failed", err);
                          }
                        }}
                      >
                        Log out
                      </button>
                    ) : (
                      <>
                        <button
                          className={settingBtnSecondaryClass}
                          onClick={() => {
                            setAuthModalMode('login');
                            setShowAuthModal(true);
                          }}
                        >
                          Log in
                        </button>
                        <button
                          className={settingBtnSecondaryClass}
                          onClick={() => {
                            setAuthModalMode('signup');
                            setShowAuthModal(true);
                          }}
                        >
                          Sign up
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Commercial license</div>
                    <div className={settingDescriptionClass}>
                      Help keep OpenObsidian 100% user-supported and independent. <a href="#" className={settingLinkClass}>Learn more</a>.
                    </div>
                  </div>
                  <div className={buttonRowClass}>
                    <button className={settingBtnPrimaryClass}>Activate</button>
                    <button className={settingBtnSecondaryClass}>Purchase</button>
                  </div>
                </div>

                <h3 className={settingGroupHeaderClass}>Advanced</h3>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleWithIconClass}>
                      <Clock size={16} className={settingTitleIconClass} />
                      <span>Notify if startup takes longer than expected</span>
                    </div>
                    <div className={settingDescriptionClass}>
                      Diagnose performance bugs with your vault by seeing what is causing notes and graph indexers to load slowly.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={notifyStartup}
                        onChange={(e) => setNotifyStartup(e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Command line interface</div>
                    <div className={settingDescriptionClass}>
                      Allow advanced system interactions and shell execution with OpenObsidian vaults from your terminal.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={cliEnabled}
                        onChange={(e) => setCliEnabled(e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── EDITOR SECTION ──────────────────────────────────── */}
            {activeSection === "editor" && (
              <div className={settingsSectionClass}>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Font size</div>
                    <div className={settingDescriptionClass}>
                      Adjust the general font size across notes, sidebar, and panels.
                    </div>
                  </div>
                  <div className={rangeControlClass}>
                    <input
                      type="range"
                      min="12"
                      max="24"
                      value={localSettings.fontSize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        const updated = {
                          ...localSettings,
                          fontSize: val,
                          editorFontSize: val,
                          previewFontSize: val,
                        };
                        setLocalSettings(updated);
                        onSettingsChange(updated);
                      }}
                      className={settingRangeSliderClass}
                    />
                    <span className={rangeIndicatorClass}>{localSettings.fontSize}px</span>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Line height</div>
                    <div className={settingDescriptionClass}>
                      Define the vertical spacing between text lines in the editor view.
                    </div>
                  </div>
                  <div className={rangeControlClass}>
                    <input
                      type="range"
                      min="1.2"
                      max="2.0"
                      step="0.1"
                      value={localSettings.lineHeight}
                      onChange={(e) => updateSetting("lineHeight", parseFloat(e.target.value))}
                      className={settingRangeSliderClass}
                    />
                    <span className={rangeIndicatorClass}>{localSettings.lineHeight}</span>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Note content width</div>
                    <div className={settingDescriptionClass}>
                      Set the maximum note width used in both editing and reading views.
                    </div>
                  </div>
                  <div className={rangeControlClass}>
                    <input
                      type="range"
                      min="720"
                      max="1280"
                      step="20"
                      value={localSettings.readingViewWidth}
                      onChange={(e) => updateSetting("readingViewWidth", parseInt(e.target.value))}
                      className={settingRangeSliderClass}
                    />
                    <span className={rangeIndicatorClass}>{localSettings.readingViewWidth}px</span>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Tab size</div>
                    <div className={settingDescriptionClass}>
                      Number of spaces that a tab represents when writing indentation inside notes.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <select
                      value={localSettings.tabSize}
                      onChange={(e) => updateSetting("tabSize", parseInt(e.target.value))}
                      className={settingSelectClass}
                    >
                      <option value="2">2 spaces</option>
                      <option value="4">4 spaces</option>
                      <option value="8">8 spaces</option>
                    </select>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Word wrap</div>
                    <div className={settingDescriptionClass}>
                      Force long lines of text to wrap to the width of the editor screen automatically.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={localSettings.wordWrap}
                        onChange={(e) => updateSetting("wordWrap", e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Spell check</div>
                    <div className={settingDescriptionClass}>
                      Enable system spell checking to highlight typos and grammatical errors inside note files.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={localSettings.spellcheck}
                        onChange={(e) => updateSetting("spellcheck", e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Show line numbers</div>
                    <div className={settingDescriptionClass}>
                      Display line numbers along the left margin of the editor pane.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={localSettings.showLineNumbers}
                        onChange={(e) => updateSetting("showLineNumbers", e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Vim Mode</div>
                    <div className={settingDescriptionClass}>
                      Neovim-style modal editing and : commands
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={localSettings.vimMode}
                        onChange={(e) => updateSetting("vimMode", e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={resetContainerClass}>
                  <button className={settingResetBtnClass} onClick={resetEditorSettings}>
                    <RotateCcw size={14} className={resetIconClass} />
                    Reset editor settings
                  </button>
                </div>
              </div>
            )}

            {/* ── FILES & LINKS SECTION ───────────────────────────── */}
            {activeSection === "files" && (
              <div className={settingsSectionClass}>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Default location for new notes</div>
                    <div className={settingDescriptionClass}>
                      Specifies where newly created note files will be stored in your vault folder hierarchy.
                    </div>
                  </div>
                  <div className={browseControlClass}>
                    <input
                      type="text"
                      value={localSettings.defaultNoteLocation}
                      onChange={(e) => updateSetting("defaultNoteLocation", e.target.value)}
                      placeholder="Vault root"
                      className={settingInputClass}
                    />
                    <button className={settingIconBtnSecondaryClass} aria-label="Browse notes directory">
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Attachment folder</div>
                    <div className={settingDescriptionClass}>
                      Target subdirectory name for all pasted or dropped images, files, and media.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <input
                      type="text"
                      value={localSettings.attachmentLocation}
                      onChange={(e) => updateSetting("attachmentLocation", e.target.value)}
                      placeholder="attachments"
                      className={settingInputClass}
                    />
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Use [[Wiki Links]]</div>
                    <div className={settingDescriptionClass}>
                      Create connections using [[WikiLink]] brackets. When off, regular markdown link syntax `[text](path)` is used.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={localSettings.useWikiLinks}
                        onChange={(e) => updateSetting("useWikiLinks", e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Auto-Create Notes</div>
                    <div className={settingDescriptionClass}>
                      Automatically initialize a blank Markdown note when clicking on unresolved Wiki links.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={localSettings.autoCreateNotes}
                        onChange={(e) => updateSetting("autoCreateNotes", e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>New link format</div>
                    <div className={settingDescriptionClass}>
                      Specify the format of note links constructed inside references (Relative paths, shortest names, or absolute).
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <select
                      value={localSettings.linkFormat}
                      onChange={(e) => updateSetting("linkFormat", e.target.value as AppSettings["linkFormat"])}
                      className={settingSelectClass}
                    >
                      <option value="shortest">Shortest path when possible</option>
                      <option value="relative">Relative path to file</option>
                      <option value="absolute">Absolute path from vault root</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── APPEARANCE SECTION ──────────────────────────────── */}
            {activeSection === "appearance" && (
              <div className={settingsSectionClass}>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Theme</div>
                    <div className={settingDescriptionClass}>
                      Select the application color theme. Custom settings will unlock advanced color tuning options.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <select
                      value={localSettings.theme}
                      onChange={(e) => updateSetting("theme", e.target.value as AppSettings["theme"])}
                      className={settingSelectClass}
                    >
                      <option value="dark">Dark</option>
                      <option value="dark-plus">Dark+</option>
                      <option value="blue-night">Blue Night</option>
                      <option value="oceanic">Oceanic</option>
                      <option value="light">Calm White</option>
                      <option value="night-light">Sunset Glow</option>
                      <option value="parchment">Parchment</option>
                      <option value="system">System match</option>
                      <option value="custom">Custom properties</option>
                    </select>
                  </div>
                </div>

                {localSettings.theme === "custom" && (
                  <div className={customThemeSubpanelClass}>
                    <div className={settingSubCardClass}>
                      <div className={settingInfoClass}>
                        <div className={settingTitleClass}>Base Theme Type</div>
                        <div className={settingDescriptionClass}>
                          Sets the foundation defaults (light background base or dark background base) for text colors.
                        </div>
                      </div>
                      <div className={toggleRowClass}>
                        <button
                          className={cx(settingBtnTabClass, localSettings.customThemeType === "light" && settingBtnTabActiveClass)}
                          onClick={() => updateSetting("customThemeType", "light")}
                        >
                          Light base
                        </button>
                        <button
                          className={cx(settingBtnTabClass, localSettings.customThemeType === "dark" && settingBtnTabActiveClass)}
                          onClick={() => updateSetting("customThemeType", "dark")}
                        >
                          Dark base
                        </button>
                      </div>
                    </div>

                    <div className={settingSubCardClass}>
                      <div className={settingInfoClass}>
                        <div className={settingTitleClass}>Custom Background Color</div>
                        <div className={settingDescriptionClass}>Pick a background color for the general workspace.</div>
                      </div>
                      <div className={settingControlClass}>
                        <input
                          type="color"
                          value={localSettings.customBgPrimary}
                          onChange={(e) => updateSetting("customBgPrimary", e.target.value)}
                          className={settingColorPickerClass}
                        />
                      </div>
                    </div>

                    <div className={settingSubCardClass}>
                      <div className={settingInfoClass}>
                        <div className={settingTitleClass}>Custom Text Color</div>
                        <div className={settingDescriptionClass}>Pick the primary typography color.</div>
                      </div>
                      <div className={settingControlClass}>
                        <input
                          type="color"
                          value={localSettings.customTextPrimary}
                          onChange={(e) => updateSetting("customTextPrimary", e.target.value)}
                          className={settingColorPickerClass}
                        />
                      </div>
                    </div>

                    <div className={settingSubCardClass}>
                      <div className={settingInfoClass}>
                        <div className={settingTitleClass}>Accent Color</div>
                        <div className={settingDescriptionClass}>Pick a color for highlights, selected buttons, active toggles.</div>
                      </div>
                      <div className={settingControlClass}>
                        <input
                          type="color"
                          value={localSettings.accentColor}
                          onChange={(e) => updateSetting("accentColor", e.target.value)}
                          className={settingColorPickerClass}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Font family</div>
                    <div className={settingDescriptionClass}>
                      Choose a typeface for notes rendering, markdown headers, and the UI elements.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <select
                      value={localSettings.fontFamily}
                      onChange={(e) => updateSetting("fontFamily", e.target.value)}
                      className={settingSelectClass}
                    >
                      <option value="Inter, system-ui, sans-serif">Inter (Default)</option>
                      <option value="'SF Pro Display', system-ui, sans-serif">SF Pro (Apple System)</option>
                      <option value="'Segoe UI', system-ui, sans-serif">Segoe UI (Windows)</option>
                      <option value="Georgia, serif">Georgia (Serif)</option>
                      <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── HOTKEYS SECTION ─────────────────────────────────── */}
            {activeSection === "hotkeys" && (
              <div className={settingsSectionClass}>
                <div className={hotkeysHeaderRowClass}>
                  <p className={settingDescriptionClass}>
                    Review and search global keyboard shortcuts programmed for common vault editing triggers.
                  </p>
                  <div className={hotkeySearchBoxClass}>
                    <Search size={14} className={hotkeySearchIconClass} />
                    <input
                      type="text"
                      placeholder="Search hotkeys..."
                      value={searchHotkey}
                      onChange={(e) => setSearchHotkey(e.target.value)}
                      className={hotkeySearchInputClass}
                    />
                  </div>
                </div>

                <div className={hotkeyListClass}>
                  {filteredHotkeys.length > 0 ? (
                    filteredHotkeys.map((hotkey, idx) => (
                      <div className={hotkeyCardClass} key={idx}>
                        <span className={hotkeyDescClass}>{hotkey.description}</span>
                        <kbd className={hotkeyKbdClass}>{hotkey.keys}</kbd>
                      </div>
                    ))
                  ) : (
                    <div className={hotkeysEmptyClass}>No hotkeys match your search query</div>
                  )}
                </div>
              </div>
            )}

            {/* ── AI SECTION ──────────────────────────────────────── */}
            {activeSection === "ai" && (
              <div className={settingsSectionClass}>
                <div className="setting-description-box" style={{ marginBottom: "20px" }}>
                  <p className={settingDescriptionClass} style={{ fontSize: "13px", lineHeight: "1.5" }}>
                    Analysis and suggestions work locally. LLM is used for annotations, synthesis, and queries.
                  </p>
                </div>

                {/* Provider Selector */}
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Provider</div>
                    <div className={settingDescriptionClass}>
                      Choose which AI provider you want to use for advanced reasoning.
                    </div>
                  </div>
                  <div className={buttonRowClass}>
                    {AI_PROVIDER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        className={cx(settingBtnTabClass, aiSettings.provider === preset.id && settingBtnTabActiveClass)}
                        onClick={() => {
                          const nextKey = aiSettings.providerKeys?.[preset.id] || "";
                          const nextModels = getModelsForProvider(preset.id);
                          const nextModelId = nextModels[0]?.id || DEFAULT_MODEL_ID;
                          updateAISettings({
                            provider: preset.id,
                            apiKey: nextKey,
                            modelId: nextModelId,
                            providerKeys: { ...aiSettings.providerKeys, [aiSettings.provider]: aiSettings.apiKey },
                          });
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* API Key */}
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>
                      API Key
                    </div>
                    <div className={settingDescriptionClass}>
                      Enter credentials for your provider.{" "}
                      <a
                        className={`${settingLinkClass} inline-flex items-center gap-1`}
                        href={AI_PROVIDER_PRESETS.find((p) => p.id === aiSettings.provider)?.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}
                      >
                        Get key <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <input
                      type="password"
                      className={settingInputClass}
                      style={{ width: "240px" }}
                      value={aiSettings.apiKey}
                      onChange={(e) => updateAISettings({ apiKey: e.target.value })}
                      placeholder={AI_PROVIDER_PRESETS.find((p) => p.id === aiSettings.provider)?.keyPlaceholder}
                    />
                  </div>
                </div>

                {/* Model list */}
                <h3 className={settingGroupHeaderClass}>Available Models</h3>
                <div className="flex flex-col gap-1" style={{ width: "100%", marginTop: "12px", border: "1px solid var(--border-medium)", borderRadius: "6px", overflow: "hidden" }}>
                  {models.map((model) => (
                    <button
                      key={model.id}
                      className={`transition-colors duration-150 hover:bg-(--bg-hover) ${aiSettings.modelId === model.id ? "bg-(--bg-active) border-(--border-subtle) text-(--text-primary)" : "text-(--text-secondary)"}`}
                      onClick={() => updateAISettings({ modelId: model.id })}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border-subtle)",
                        background: aiSettings.modelId === model.id ? "var(--bg-active)" : "transparent",
                        cursor: "pointer",
                        borderLeft: "none",
                        borderRight: "none",
                        borderTop: "none",
                        textAlign: "left",
                        color: "inherit"
                      }}
                    >
                      <div className={settingInfoClass}>
                        <div className={settingTitleClass} style={{ fontWeight: 500, fontSize: "13.5px", color: "var(--text-primary)" }}>{model.label}</div>
                        <div className={settingDescriptionClass} style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{model.description}</div>
                      </div>
                      {aiSettings.modelId === model.id && <Check size={16} style={{ color: "var(--color-accent)", marginRight: "8px" }} />}
                    </button>
                  ))}

                  {aiSettings.provider === "openrouter" && (
                    <button
                      className={`transition-colors duration-150 hover:bg-(--bg-hover) ${isCustomModel ? "bg-(--bg-active) border-(--border-subtle) text-(--text-primary)" : "text-(--text-secondary)"}`}
                      onClick={() => {
                        const isPreset = models.some((m) => m.id === aiSettings.customModelId);
                        const nextModelId = (!aiSettings.customModelId || isPreset)
                          ? "deepseek/deepseek-v4-flash:free"
                          : aiSettings.customModelId;
                        updateAISettings({
                          modelId: nextModelId,
                          customModelId: nextModelId
                        });
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        background: isCustomModel ? "var(--bg-active)" : "transparent",
                        cursor: "pointer",
                        border: "none",
                        textAlign: "left",
                        color: "inherit"
                      }}
                    >
                      <div className={settingInfoClass}>
                        <div className={settingTitleClass} style={{ fontWeight: 500, fontSize: "13.5px", color: "var(--text-primary)" }}>Custom Model</div>
                        <div className={settingDescriptionClass} style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Use any other OpenRouter model by entering its ID</div>
                      </div>
                      {isCustomModel && <Check size={16} style={{ color: "var(--color-accent)", marginRight: "8px" }} />}
                    </button>
                  )}
                </div>

                {/* Custom Model Input */}
                {aiSettings.provider === "openrouter" && isCustomModel && (
                  <div className={`${settingCardClass} animate-fade-in`} style={{ marginTop: "16px" }}>
                    <div className={settingInfoClass}>
                      <div className={settingTitleClass}>Custom Model ID</div>
                      <div className={settingDescriptionClass}>
                        Enter the exact model identifier from OpenRouter (e.g. poolside/laguna-m.1:free).
                      </div>
                    </div>
                    <div className={settingControlClass}>
                      <input
                        type="text"
                        className={settingInputClass}
                        style={{ width: "240px" }}
                        value={aiSettings.modelId}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateAISettings({
                            modelId: val,
                            customModelId: val
                          });
                        }}
                        placeholder="e.g. deepseek/deepseek-v4-flash:free"
                      />
                    </div>
                  </div>
                )}

                {/* Status indicators */}
                <h3 className={settingGroupHeaderClass}>System Status</h3>
                
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Analysis Engine</div>
                    <div className={settingDescriptionClass}>
                      State of the background note indexer and vector embeddings store.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <div className={`flex items-center gap-1.5 text-[12.5px] ${isModelLoaded() ? "text-(--text-secondary) [&_svg]:text-(--success)" : "text-(--text-muted) [&_svg]:text-(--warning)"}`} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                      {isModelLoaded() ? <Check size={14} style={{ color: "#22c55e" }} /> : <AlertCircle size={14} style={{ color: "#eab308" }} />}
                      <span style={{ color: isModelLoaded() ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {isModelLoaded()
                          ? `Running · ${indexedCount} notes indexed`
                          : "Loads automatically on first note save"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>LLM Service Connection</div>
                    <div className={settingDescriptionClass}>
                      Verification of the active remote large language model connection.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <div className={`flex items-center gap-1.5 text-[12.5px] ${hasApiKey ? "text-(--text-secondary) [&_svg]:text-(--success)" : "text-(--text-muted) [&_svg]:text-(--warning)"}`} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                      {hasApiKey ? <Check size={14} style={{ color: "#22c55e" }} /> : <AlertCircle size={14} style={{ color: "#eab308" }} />}
                      <span style={{ color: hasApiKey ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {hasApiKey ? `Connected: ${currentModel?.shortLabel || currentModel?.label}` : "No API key — local analysis still works"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── DATABASE SECTION ────────────────────────────────── */}
            {activeSection === "database" && (
              <div className={settingsSectionClass}>
                <div className="setting-description-box" style={{ marginBottom: "20px" }}>
                  <p className={settingDescriptionClass} style={{ fontSize: "13px", lineHeight: "1.5" }}>
                    Store Supabase credentials locally for this app. These values replace the usual VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables at runtime.
                  </p>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Supabase URL</div>
                    <div className={settingDescriptionClass}>
                      Project URL from your Supabase API settings.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <input
                      type="text"
                      className={settingInputClass}
                      style={{ width: "280px", maxWidth: "280px" }}
                      value={databaseConfig.supabaseUrl}
                      onChange={(e) => setDatabaseConfig((current) => ({ ...current, supabaseUrl: e.target.value }))}
                      placeholder="https://project.supabase.co"
                    />
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Anon public key</div>
                    <div className={settingDescriptionClass}>
                      Use the anon public key. Do not paste a service role key into the app.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <input
                      type="password"
                      className={settingInputClass}
                      style={{ width: "280px", maxWidth: "280px" }}
                      value={databaseConfig.anonKey}
                      onChange={(e) => setDatabaseConfig((current) => ({ ...current, anonKey: e.target.value }))}
                      placeholder="eyJhbGciOi..."
                    />
                  </div>
                </div>

                <h3 className={settingGroupHeaderClass}>Import from .env</h3>
                <div className="mb-4">
                  <textarea
                    className={settingTextareaClass}
                    value={databaseEnvText}
                    onChange={(e) => setDatabaseEnvText(e.target.value)}
                    placeholder={"VITE_SUPABASE_URL=https://project.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGciOi..."}
                  />
                  <div className={buttonRowClass} style={{ marginTop: "10px", justifyContent: "flex-end" }}>
                    <button className={settingBtnSecondaryClass} onClick={handleImportDatabaseEnv}>
                      Import values
                    </button>
                  </div>
                </div>

                <h3 className={settingGroupHeaderClass}>Schema migration</h3>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Database creation SQL</div>
                    <div className={settingDescriptionClass}>
                      Copy the bundled schema.sql migration and run it in the Supabase SQL Editor for a personal database.
                    </div>
                    {databaseSchemaCopyStatus.message && (
                      <div
                        className={cx(
                          "mt-2 flex items-center gap-1.5 text-[12.5px]",
                          databaseSchemaCopyStatus.type === "success" && "text-(--success)",
                          databaseSchemaCopyStatus.type === "error" && "text-(--danger)",
                        )}
                      >
                        {databaseSchemaCopyStatus.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
                        <span>{databaseSchemaCopyStatus.message}</span>
                      </div>
                    )}
                  </div>
                  <div className={buttonRowClass}>
                    <button className={`${settingBtnSecondaryClass} flex items-center gap-2`} onClick={handleCopyDatabaseSchema}>
                      <Copy size={14} />
                      Copy SQL
                    </button>
                  </div>
                </div>

                <h3 className={settingGroupHeaderClass}>Local Storage</h3>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Saved credentials</div>
                    <div className={settingDescriptionClass}>
                      Credentials are saved in this app's local browser storage and restored automatically on startup.
                    </div>
                    {databaseStatus.message && (
                      <div
                        className={cx(
                          "mt-2 flex items-center gap-1.5 text-[12.5px]",
                          databaseStatus.type === "success" && "text-(--success)",
                          databaseStatus.type === "error" && "text-(--danger)",
                          (databaseStatus.type === "info" || databaseStatus.type === "idle") && "text-(--text-muted)",
                        )}
                      >
                        {databaseStatus.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
                        <span>{databaseStatus.message}</span>
                      </div>
                    )}
                  </div>
                  <div className={buttonRowClass}>
                    <button
                      className={settingBtnSecondaryClass}
                      onClick={handleTestDatabaseConnection}
                      disabled={isTestingDatabase}
                    >
                      {isTestingDatabase ? "Testing..." : "Test"}
                    </button>
                    <button className={settingBtnPrimaryClass} onClick={handleSaveDatabaseConfig}>
                      Save
                    </button>
                    <button className={settingBtnSecondaryClass} onClick={handleClearDatabaseConfig}>
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── BACKLINKS SECTION ────────────────────────────────── */}
            {activeSection === "backlinks" && (
              <div className={settingsSectionClass}>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Show Backlinks pane by default</div>
                    <div className={settingDescriptionClass}>
                      Always open the Backlinks panel on the right sidebar when loading a note file.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass} type="checkbox" defaultChecked={true} />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Integrate backlinks at the end of notes</div>
                    <div className={settingDescriptionClass}>
                      Inject a collapsible list of all referencing notes directly beneath your note contents.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass} type="checkbox" defaultChecked={false} />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Include unlinked mentions</div>
                    <div className={settingDescriptionClass}>
                      Search and surface notes that write this note's name but do not wrap it inside brackets.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass} type="checkbox" defaultChecked={true} />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── CANVAS SECTION ──────────────────────────────────── */}
            {activeSection === "canvas" && (
              <div className={settingsSectionClass}>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Graph node scale</div>
                    <div className={settingDescriptionClass}>
                      Specify the visual circumference diameter of note nodes on the d3 graph view.
                    </div>
                  </div>
                  <div className={rangeControlClass}>
                    <input
                      type="range"
                      min="2"
                      max="12"
                      value={localSettings.nodeSize}
                      onChange={(e) => updateSetting("nodeSize", parseInt(e.target.value))}
                      className={settingRangeSliderClass}
                    />
                    <span className={rangeIndicatorClass}>{localSettings.nodeSize}px</span>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Node separation constraint</div>
                    <div className={settingDescriptionClass}>
                      Force spacing distance threshold between d3 coordinates on the active layout.
                    </div>
                  </div>
                  <div className={rangeControlClass}>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      value={localSettings.nodeSpacing}
                      onChange={(e) => updateSetting("nodeSpacing", parseInt(e.target.value))}
                      className={settingRangeSliderClass}
                    />
                    <span className={rangeIndicatorClass}>{localSettings.nodeSpacing}px</span>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Show orphans</div>
                    <div className={settingDescriptionClass}>
                      Render isolated note files on the knowledge graph that have no links connected to other notes.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <label className={settingToggleClass}>
                      <input
                        className={settingToggleInputClass}
                        type="checkbox"
                        checked={localSettings.showOrphans}
                        onChange={(e) => updateSetting("showOrphans", e.target.checked)}
                      />
                      <span className={toggleSliderClass} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── DAILY NOTES SECTION ─────────────────────────────── */}
            {activeSection === "daily-notes" && (
              <div className={settingsSectionClass}>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Daily notes folder</div>
                    <div className={settingDescriptionClass}>
                      Subdirectory folder name where daily journal notes are created (defaults to root if empty).
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <input
                      type="text"
                      value={localSettings.dailyNoteFolder}
                      onChange={(e) => updateSetting("dailyNoteFolder", e.target.value)}
                      placeholder="Daily Notes"
                      className={settingInputClass}
                    />
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Date format template</div>
                    <div className={settingDescriptionClass}>
                      Specify the filename date convention. Example: `YYYY-MM-DD` or `YYYY-MM-DD-dddd`.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <input
                      type="text"
                      value={localSettings.dailyNoteFormat}
                      onChange={(e) => updateSetting("dailyNoteFormat", e.target.value)}
                      placeholder="YYYY-MM-DD"
                      className={settingInputClass}
                    />
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Daily note template</div>
                    <div className={settingDescriptionClass}>
                      Optionally specify a Markdown file path to pre-fill content when daily logs are auto-created.
                    </div>
                  </div>
                  <div className={browseControlClass}>
                    <input
                      type="text"
                      value={localSettings.dailyNoteTemplate}
                      onChange={(e) => updateSetting("dailyNoteTemplate", e.target.value)}
                      placeholder="No template selected"
                      className={settingInputClass}
                    />
                    <button className={settingIconBtnSecondaryClass} aria-label="Browse daily template path">
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── COLLABORATION SECTION ───────────────────────────── */}
            {activeSection === "collaboration" && (
              <div className={settingsSectionClass}>
                <div className="setting-description-box">
                  <p className={settingDescriptionClass}>
                    Manage secure, local-first real-time vault sharing and collaborator panels for the currently loaded vault path.
                  </p>
                  {currentUser?.email && (
                    <div className="signed-in-badge">
                      Signed in as: <strong>{currentUser.email}</strong>
                    </div>
                  )}
                </div>
                <CollaborationPanel
                  vaultPath={vaultPath || null}
                  isSettingsMode={true}
                  onVaultReconstructed={onVaultReconstructed}
                  onGoToAccount={() => setActiveSection("general")}
                />
              </div>
            )}

            {/* ── TEMPLATES SECTION ───────────────────────────────── */}
            {activeSection === "templates" && (
              <div className={settingsSectionClass}>
                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Templates folder</div>
                    <div className={settingDescriptionClass}>
                      The vault directory location where layout and boilerplate pre-fill markdown files reside.
                    </div>
                  </div>
                  <div className={browseControlClass}>
                    <input
                      type="text"
                      placeholder="templates"
                      defaultValue="templates"
                      className={settingInputClass}
                    />
                    <button className={settingIconBtnSecondaryClass} aria-label="Browse templates path">
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Template date format</div>
                    <div className={settingDescriptionClass}>
                      Date structure format applied when replacing {"{{date}}"} tags.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <input
                      type="text"
                      defaultValue="YYYY-MM-DD"
                      className={settingInputClass}
                    />
                  </div>
                </div>

                <div className={settingCardClass}>
                  <div className={settingInfoClass}>
                    <div className={settingTitleClass}>Template time format</div>
                    <div className={settingDescriptionClass}>
                      Time structure format applied when replacing {"{{time}}"} tags.
                    </div>
                  </div>
                  <div className={settingControlClass}>
                    <input
                      type="text"
                      defaultValue="HH:mm"
                      className={settingInputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── COMMUNITY PLUGINS SECTION ───────────────────────── */}
            {activeSection === "plugins" && (
              <div className={settingsSectionClass}>
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

            {/* ── ABOUT SECTION ───────────────────────────────────── */}
            {activeSection === "about" && (
              <div className={settingsSectionClass}>
                <div className={aboutInfoClass}>
                  <div className={aboutLogoWrapperClass}>
                    <img
                      src={isDark ? "/logos/logo-dark.png" : "/logos/logo-light.png"}
                      alt="OpenObsidian logo"
                      className={aboutLogoImgClass}
                    />
                  </div>
                  <h4 className={aboutHeadingClass}>OpenObsidian</h4>
                  <p className={aboutVersionClass}>Version 1.0.0 (Core Engine)</p>
                  <p className={aboutDescriptionClass}>
                    A local-first, offline-ready knowledge management tool for creating,
                    linking, and mapping Markdown note networks. Powered by Electron, React, and TypeScript.
                  </p>

                  <div className={aboutLinksClass}>
                    <a href="#" className={aboutLinkClass}>Documentation</a>
                    <span className={linkDividerClass}>•</span>
                    <a href="#" className={aboutLinkClass}>Release notes</a>
                    <span className={linkDividerClass}>•</span>
                    <a href="#" className={aboutLinkClass}>Report issues</a>
                  </div>
                </div>

                <div className={resetContainerClass}>
                  <button className={settingResetBtnClass} onClick={resetSettings}>
                    <RotateCcw size={14} className={resetIconClass} />
                    Reset all settings to factory default
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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
