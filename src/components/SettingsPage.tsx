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
  FileCode
} from "lucide-react";
import { PluginSettingsPanel } from './PluginSettingsPanel';
import { PluginMarketplace } from './PluginMarketplace';
import type { PluginRegistration, PluginSettingTabRegistration } from '../types/plugin';
import { isDarkTheme } from "../utils/helpers";
import type { LocalVaultCollaborator, LocalVaultInvite } from "../lib/localdb";
import { CollaborationPanel } from './CollaborationPanel';

export interface AppSettings {
  // Appearance
  theme: "dark" | "light" | "oceanic" | "dark-plus" | "blue-night" | "night-light" | "peach-white" | "system" | "custom";
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
  lineHeight: number;
  tabSize: number;
  showLineNumbers: boolean;
  wordWrap: boolean;
  spellcheck: boolean;

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

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  accentColor: "#3b82f6",
  fontFamily: "Inter, system-ui, sans-serif",

  customBgPrimary: "#151515",
  customTextPrimary: "#e6e6e6",
  customThemeType: "dark",

  fontSize: 15,
  editorFontSize: 15,
  previewFontSize: 15,
  lineHeight: 1.6,
  tabSize: 2,
  showLineNumbers: false,
  wordWrap: true,
  spellcheck: false,

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
  onInstallPlugin?: (repo: string, pluginId: string) => Promise<boolean>;

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
}

type SettingsSection = 
  | "general" 
  | "editor" 
  | "files" 
  | "appearance" 
  | "hotkeys" 
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
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [isBrowsingPlugins, setIsBrowsingPlugins] = useState(false);
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [searchHotkey, setSearchHotkey] = useState("");
  const pageRef = React.useRef<HTMLDivElement>(null);
  const isDark = isDarkTheme(localSettings.theme);

  // General tab local states to mock official settings interaction beautifully
  const [autoUpdates, setAutoUpdates] = useState(true);
  const [notifyStartup, setNotifyStartup] = useState(true);
  const [cliEnabled, setCliEnabled] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("English");

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

  // Sections definitions for grouped sidebar navigation
  const optionSectionsList = [
    { id: "general" as const, label: "General", icon: Settings },
    { id: "editor" as const, label: "Editor", icon: Type },
    { id: "files" as const, label: "Files and links", icon: FileText },
    { id: "appearance" as const, label: "Appearance", icon: Palette },
    { id: "hotkeys" as const, label: "Hotkeys", icon: Keyboard },
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
    { description: "Toggle Knowledge Graph view", keys: "Ctrl+G" },
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
    <div className="settings-overlay">
      <div className="settings-page" ref={pageRef}>
        {isBrowsingPlugins ? (
          <PluginMarketplace
            onClose={() => setIsBrowsingPlugins(false)}
            onInstall={onInstallPlugin || (async () => false)}
            installedPluginIds={plugins.map((p) => p.manifest.id)}
          />
        ) : (
          <>
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="settings-close" onClick={onClose} aria-label="Close settings">
                <X size={20} />
              </button>
            </div>

            <div className="settings-body">
          <nav className="settings-nav">
            <div className="settings-nav-subheader">Options</div>
            {optionSectionsList.map((section) => (
              <button
                key={section.id}
                className={`settings-nav-item ${activeSection === section.id ? "active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                <section.icon size={16} className="nav-icon" />
                <span>{section.label}</span>
              </button>
            ))}

            <div className="settings-nav-subheader">Core plugins</div>
            {corePluginsList.map((section) => (
              <button
                key={section.id}
                className={`settings-nav-item ${activeSection === section.id ? "active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                <section.icon size={16} className="nav-icon" />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {/* ── GENERAL SECTION ─────────────────────────────────── */}
            {activeSection === "general" && (
              <div className="settings-section animate-fade-in">
                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Version 1.0.0</div>
                    <div className="setting-description">
                      Installer version: 1.0.0. <a href="#" className="setting-link">Read the changelog</a>.
                    </div>
                  </div>
                  <div className="setting-control">
                    <button className="setting-btn-primary">Check for updates</button>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Automatic updates</div>
                    <div className="setting-description">
                      Turn this off to prevent the app from checking for updates.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={autoUpdates}
                        onChange={(e) => setAutoUpdates(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Language</div>
                    <div className="setting-description">
                      Change the display language. <a href="#" className="setting-link">Learn how to add languages</a>.
                    </div>
                  </div>
                  <div className="setting-control">
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="setting-select"
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

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Help</div>
                    <div className="setting-description">
                      Learn how to use OpenObsidian and get help from the community.
                    </div>
                  </div>
                  <div className="setting-control">
                    <button className="setting-btn-secondary">Open</button>
                  </div>
                </div>

                <h3 className="setting-group-header">Account</h3>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Your account</div>
                    <div className="setting-description">
                      You're not logged in right now. An account is only needed for secure cloud sync and early access builds.
                    </div>
                  </div>
                  <div className="setting-control button-row">
                    <button className="setting-btn-secondary">Log in</button>
                    <button className="setting-btn-secondary">Sign up</button>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Commercial license</div>
                    <div className="setting-description">
                      Help keep OpenObsidian 100% user-supported and independent. <a href="#" className="setting-link">Learn more</a>.
                    </div>
                  </div>
                  <div className="setting-control button-row">
                    <button className="setting-btn-primary">Activate</button>
                    <button className="setting-btn-secondary">Purchase</button>
                  </div>
                </div>

                <h3 className="setting-group-header">Advanced</h3>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title-with-icon">
                      <Clock size={16} className="setting-title-icon" />
                      <span>Notify if startup takes longer than expected</span>
                    </div>
                    <div className="setting-description">
                      Diagnose performance bugs with your vault by seeing what is causing notes and graph indexers to load slowly.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={notifyStartup}
                        onChange={(e) => setNotifyStartup(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Command line interface</div>
                    <div className="setting-description">
                      Allow advanced system interactions and shell execution with OpenObsidian vaults from your terminal.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={cliEnabled}
                        onChange={(e) => setCliEnabled(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── EDITOR SECTION ──────────────────────────────────── */}
            {activeSection === "editor" && (
              <div className="settings-section animate-fade-in">
                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Font size</div>
                    <div className="setting-description">
                      Adjust the general font size across notes, sidebar, and panels.
                    </div>
                  </div>
                  <div className="setting-control range-control">
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
                      className="setting-range-slider"
                    />
                    <span className="range-indicator">{localSettings.fontSize}px</span>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Line height</div>
                    <div className="setting-description">
                      Define the vertical spacing between text lines in the editor view.
                    </div>
                  </div>
                  <div className="setting-control range-control">
                    <input
                      type="range"
                      min="1.2"
                      max="2.0"
                      step="0.1"
                      value={localSettings.lineHeight}
                      onChange={(e) => updateSetting("lineHeight", parseFloat(e.target.value))}
                      className="setting-range-slider"
                    />
                    <span className="range-indicator">{localSettings.lineHeight}</span>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Tab size</div>
                    <div className="setting-description">
                      Number of spaces that a tab represents when writing indentation inside notes.
                    </div>
                  </div>
                  <div className="setting-control">
                    <select
                      value={localSettings.tabSize}
                      onChange={(e) => updateSetting("tabSize", parseInt(e.target.value))}
                      className="setting-select"
                    >
                      <option value="2">2 spaces</option>
                      <option value="4">4 spaces</option>
                      <option value="8">8 spaces</option>
                    </select>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Word wrap</div>
                    <div className="setting-description">
                      Force long lines of text to wrap to the width of the editor screen automatically.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={localSettings.wordWrap}
                        onChange={(e) => updateSetting("wordWrap", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Spell check</div>
                    <div className="setting-description">
                      Enable system spell checking to highlight typos and grammatical errors inside note files.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={localSettings.spellcheck}
                        onChange={(e) => updateSetting("spellcheck", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Show line numbers</div>
                    <div className="setting-description">
                      Display line numbers along the left margin of the editor pane.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={localSettings.showLineNumbers}
                        onChange={(e) => updateSetting("showLineNumbers", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── FILES & LINKS SECTION ───────────────────────────── */}
            {activeSection === "files" && (
              <div className="settings-section animate-fade-in">
                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Default location for new notes</div>
                    <div className="setting-description">
                      Specifies where newly created note files will be stored in your vault folder hierarchy.
                    </div>
                  </div>
                  <div className="setting-control browse-control">
                    <input
                      type="text"
                      value={localSettings.defaultNoteLocation}
                      onChange={(e) => updateSetting("defaultNoteLocation", e.target.value)}
                      placeholder="Vault root"
                      className="setting-input"
                    />
                    <button className="setting-btn-secondary icon-btn" aria-label="Browse notes directory">
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Attachment folder</div>
                    <div className="setting-description">
                      Target subdirectory name for all pasted or dropped images, files, and media.
                    </div>
                  </div>
                  <div className="setting-control">
                    <input
                      type="text"
                      value={localSettings.attachmentLocation}
                      onChange={(e) => updateSetting("attachmentLocation", e.target.value)}
                      placeholder="attachments"
                      className="setting-input"
                    />
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Use [[Wiki Links]]</div>
                    <div className="setting-description">
                      Create connections using [[WikiLink]] brackets. When off, regular markdown link syntax `[text](path)` is used.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={localSettings.useWikiLinks}
                        onChange={(e) => updateSetting("useWikiLinks", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Auto-Create Notes</div>
                    <div className="setting-description">
                      Automatically initialize a blank Markdown note when clicking on unresolved Wiki links.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={localSettings.autoCreateNotes}
                        onChange={(e) => updateSetting("autoCreateNotes", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">New link format</div>
                    <div className="setting-description">
                      Specify the format of note links constructed inside references (Relative paths, shortest names, or absolute).
                    </div>
                  </div>
                  <div className="setting-control">
                    <select
                      value={localSettings.linkFormat}
                      onChange={(e) => updateSetting("linkFormat", e.target.value as AppSettings["linkFormat"])}
                      className="setting-select"
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
              <div className="settings-section animate-fade-in">
                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Theme</div>
                    <div className="setting-description">
                      Select the application color theme. Custom settings will unlock advanced color tuning options.
                    </div>
                  </div>
                  <div className="setting-control">
                    <select
                      value={localSettings.theme}
                      onChange={(e) => updateSetting("theme", e.target.value as AppSettings["theme"])}
                      className="setting-select"
                    >
                      <option value="dark">Dark</option>
                      <option value="dark-plus">Dark+</option>
                      <option value="blue-night">Blue Night</option>
                      <option value="oceanic">Oceanic</option>
                      <option value="light">Classic Light</option>
                      <option value="night-light">Sunset Glow</option>
                      <option value="peach-white">Peach White</option>
                      <option value="system">System match</option>
                      <option value="custom">Custom properties</option>
                    </select>
                  </div>
                </div>

                {localSettings.theme === "custom" && (
                  <div className="custom-theme-subpanel">
                    <div className="setting-card sub-card">
                      <div className="setting-info">
                        <div className="setting-title">Base Theme Type</div>
                        <div className="setting-description">
                          Sets the foundation defaults (light background base or dark background base) for text colors.
                        </div>
                      </div>
                      <div className="setting-control toggle-row">
                        <button
                          className={`setting-btn-tab ${localSettings.customThemeType === "light" ? "active" : ""}`}
                          onClick={() => updateSetting("customThemeType", "light")}
                        >
                          Light base
                        </button>
                        <button
                          className={`setting-btn-tab ${localSettings.customThemeType === "dark" ? "active" : ""}`}
                          onClick={() => updateSetting("customThemeType", "dark")}
                        >
                          Dark base
                        </button>
                      </div>
                    </div>

                    <div className="setting-card sub-card">
                      <div className="setting-info">
                        <div className="setting-title">Custom Background Color</div>
                        <div className="setting-description">Pick a background color for the general workspace.</div>
                      </div>
                      <div className="setting-control">
                        <input
                          type="color"
                          value={localSettings.customBgPrimary}
                          onChange={(e) => updateSetting("customBgPrimary", e.target.value)}
                          className="setting-color-picker"
                        />
                      </div>
                    </div>

                    <div className="setting-card sub-card">
                      <div className="setting-info">
                        <div className="setting-title">Custom Text Color</div>
                        <div className="setting-description">Pick the primary typography color.</div>
                      </div>
                      <div className="setting-control">
                        <input
                          type="color"
                          value={localSettings.customTextPrimary}
                          onChange={(e) => updateSetting("customTextPrimary", e.target.value)}
                          className="setting-color-picker"
                        />
                      </div>
                    </div>

                    <div className="setting-card sub-card">
                      <div className="setting-info">
                        <div className="setting-title">Accent Color</div>
                        <div className="setting-description">Pick a color for highlights, selected buttons, active toggles.</div>
                      </div>
                      <div className="setting-control">
                        <input
                          type="color"
                          value={localSettings.accentColor}
                          onChange={(e) => updateSetting("accentColor", e.target.value)}
                          className="setting-color-picker"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Font family</div>
                    <div className="setting-description">
                      Choose a typeface for notes rendering, markdown headers, and the UI elements.
                    </div>
                  </div>
                  <div className="setting-control">
                    <select
                      value={localSettings.fontFamily}
                      onChange={(e) => updateSetting("fontFamily", e.target.value)}
                      className="setting-select"
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
              <div className="settings-section animate-fade-in">
                <div className="hotkeys-header-row">
                  <p className="setting-description">
                    Review and search global keyboard shortcuts programmed for common vault editing triggers.
                  </p>
                  <div className="hotkey-search-box">
                    <Search size={14} className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search hotkeys..."
                      value={searchHotkey}
                      onChange={(e) => setSearchHotkey(e.target.value)}
                      className="hotkey-search-input"
                    />
                  </div>
                </div>

                <div className="hotkey-list">
                  {filteredHotkeys.length > 0 ? (
                    filteredHotkeys.map((hotkey, idx) => (
                      <div className="hotkey-card" key={idx}>
                        <span className="hotkey-desc">{hotkey.description}</span>
                        <kbd className="hotkey-kbd">{hotkey.keys}</kbd>
                      </div>
                    ))
                  ) : (
                    <div className="hotkeys-empty">No hotkeys match your search query</div>
                  )}
                </div>
              </div>
            )}

            {/* ── BACKLINKS SECTION ────────────────────────────────── */}
            {activeSection === "backlinks" && (
              <div className="settings-section animate-fade-in">
                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Show Backlinks pane by default</div>
                    <div className="setting-description">
                      Always open the Backlinks panel on the right sidebar when loading a note file.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input type="checkbox" defaultChecked={true} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Integrate backlinks at the end of notes</div>
                    <div className="setting-description">
                      Inject a collapsible list of all referencing notes directly beneath your note contents.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input type="checkbox" defaultChecked={false} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Include unlinked mentions</div>
                    <div className="setting-description">
                      Search and surface notes that write this note's name but do not wrap it inside brackets.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input type="checkbox" defaultChecked={true} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── CANVAS SECTION ──────────────────────────────────── */}
            {activeSection === "canvas" && (
              <div className="settings-section animate-fade-in">
                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Graph node scale</div>
                    <div className="setting-description">
                      Specify the visual circumference diameter of note nodes on the d3 graph view.
                    </div>
                  </div>
                  <div className="setting-control range-control">
                    <input
                      type="range"
                      min="2"
                      max="12"
                      value={localSettings.nodeSize}
                      onChange={(e) => updateSetting("nodeSize", parseInt(e.target.value))}
                      className="setting-range-slider"
                    />
                    <span className="range-indicator">{localSettings.nodeSize}px</span>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Node separation constraint</div>
                    <div className="setting-description">
                      Force spacing distance threshold between d3 coordinates on the active layout.
                    </div>
                  </div>
                  <div className="setting-control range-control">
                    <input
                      type="range"
                      min="50"
                      max="200"
                      value={localSettings.nodeSpacing}
                      onChange={(e) => updateSetting("nodeSpacing", parseInt(e.target.value))}
                      className="setting-range-slider"
                    />
                    <span className="range-indicator">{localSettings.nodeSpacing}px</span>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Show orphans</div>
                    <div className="setting-description">
                      Render isolated note files on the knowledge graph that have no links connected to other notes.
                    </div>
                  </div>
                  <div className="setting-control">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={localSettings.showOrphans}
                        onChange={(e) => updateSetting("showOrphans", e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── DAILY NOTES SECTION ─────────────────────────────── */}
            {activeSection === "daily-notes" && (
              <div className="settings-section animate-fade-in">
                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Daily notes folder</div>
                    <div className="setting-description">
                      Subdirectory folder name where daily journal notes are created (defaults to root if empty).
                    </div>
                  </div>
                  <div className="setting-control">
                    <input
                      type="text"
                      value={localSettings.dailyNoteFolder}
                      onChange={(e) => updateSetting("dailyNoteFolder", e.target.value)}
                      placeholder="Daily Notes"
                      className="setting-input"
                    />
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Date format template</div>
                    <div className="setting-description">
                      Specify the filename date convention. Example: `YYYY-MM-DD` or `YYYY-MM-DD-dddd`.
                    </div>
                  </div>
                  <div className="setting-control">
                    <input
                      type="text"
                      value={localSettings.dailyNoteFormat}
                      onChange={(e) => updateSetting("dailyNoteFormat", e.target.value)}
                      placeholder="YYYY-MM-DD"
                      className="setting-input"
                    />
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Daily note template</div>
                    <div className="setting-description">
                      Optionally specify a Markdown file path to pre-fill content when daily logs are auto-created.
                    </div>
                  </div>
                  <div className="setting-control browse-control">
                    <input
                      type="text"
                      value={localSettings.dailyNoteTemplate}
                      onChange={(e) => updateSetting("dailyNoteTemplate", e.target.value)}
                      placeholder="No template selected"
                      className="setting-input"
                    />
                    <button className="setting-btn-secondary icon-btn" aria-label="Browse daily template path">
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── COLLABORATION SECTION ───────────────────────────── */}
            {activeSection === "collaboration" && (
              <div className="settings-section animate-fade-in">
                <div className="setting-description-box">
                  <p className="setting-description">
                    Manage secure, local-first real-time vault sharing and collaborator panels for the currently loaded vault path.
                  </p>
                  {currentUserEmail && (
                    <div className="signed-in-badge">
                      Signed in as: <strong>{currentUserEmail}</strong>
                    </div>
                  )}
                </div>
                <CollaborationPanel
                  vaultPath={vaultPath || null}
                  isSettingsMode={true}
                  onVaultReconstructed={onVaultReconstructed}
                />
              </div>
            )}

            {/* ── TEMPLATES SECTION ───────────────────────────────── */}
            {activeSection === "templates" && (
              <div className="settings-section animate-fade-in">
                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Templates folder</div>
                    <div className="setting-description">
                      The vault directory location where layout and boilerplate pre-fill markdown files reside.
                    </div>
                  </div>
                  <div className="setting-control browse-control">
                    <input
                      type="text"
                      placeholder="templates"
                      defaultValue="templates"
                      className="setting-input"
                    />
                    <button className="setting-btn-secondary icon-btn" aria-label="Browse templates path">
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Template date format</div>
                    <div className="setting-description">
                      Date structure format applied when replacing {"{{date}}"} tags.
                    </div>
                  </div>
                  <div className="setting-control">
                    <input
                      type="text"
                      defaultValue="YYYY-MM-DD"
                      className="setting-input"
                    />
                  </div>
                </div>

                <div className="setting-card">
                  <div className="setting-info">
                    <div className="setting-title">Template time format</div>
                    <div className="setting-description">
                      Time structure format applied when replacing {"{{time}}"} tags.
                    </div>
                  </div>
                  <div className="setting-control">
                    <input
                      type="text"
                      defaultValue="HH:mm"
                      className="setting-input"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── COMMUNITY PLUGINS SECTION ───────────────────────── */}
            {activeSection === "plugins" && (
              <div className="settings-section animate-fade-in">
                <PluginSettingsPanel
                  plugins={plugins}
                  settingTabs={pluginSettingTabs}
                  onEnablePlugin={onEnablePlugin || (async () => {})}
                  onDisablePlugin={onDisablePlugin || (async () => {})}
                  onRefresh={onRefreshPlugins || (async () => {})}
                  onReloadPlugin={onReloadPlugin}
                  onInstallPlugin={onInstallPlugin}
                  onBrowse={() => setIsBrowsingPlugins(true)}
                />
              </div>
            )}

            {/* ── ABOUT SECTION ───────────────────────────────────── */}
            {activeSection === "about" && (
              <div className="settings-section animate-fade-in">
                <div className="about-info">
                  <div className="about-logo-wrapper">
                    <img
                      src={isDark ? "/logos/logo-dark.png" : "/logos/logo-light.png"}
                      alt="OpenObsidian logo"
                      className="about-logo-img"
                    />
                  </div>
                  <h4>OpenObsidian</h4>
                  <p className="about-version">Version 1.0.0 (Core Engine)</p>
                  <p className="about-description">
                    A local-first, offline-ready knowledge management tool for creating,
                    linking, and mapping Markdown note networks. Powered by Electron, React, and TypeScript.
                  </p>

                  <div className="about-links">
                    <a href="#" className="about-link">Documentation</a>
                    <span className="link-divider">•</span>
                    <a href="#" className="about-link">Release notes</a>
                    <span className="link-divider">•</span>
                    <a href="#" className="about-link">Report issues</a>
                  </div>
                </div>

                <div className="reset-container">
                  <button className="setting-reset-btn" onClick={resetSettings}>
                    <RotateCcw size={14} className="reset-icon" />
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
    </div>
  );
}
