import React from "react";
import type { AppSettings } from "../SettingsPage";
import { PreferenceCard, SliderControl, CustomToggle, SegmentedControl } from "./PreferenceCard";

interface LiveThemeStudioProps {
  settings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const THEME_PRESETS = [
  { id: "dark", label: "Dark", bg: "#121212", text: "#f3f4f6" },
  { id: "light", label: "Light", bg: "#ffffff", text: "#111827" },
  { id: "system", label: "System", bg: "#1e1e2e", text: "#93c5fd" },
  { id: "dark-plus", label: "Dark+", bg: "#1e1e1e", text: "#60a5fa" },
  { id: "blue-night", label: "Blue Night", bg: "#0f172a", text: "#38bdf8" },
  { id: "oceanic", label: "Oceanic", bg: "#0f2027", text: "#2dd4bf" },
  { id: "ember-night", label: "Ember Night", bg: "#1c1917", text: "#fb923c" },
  { id: "aurora-grove", label: "Aurora Grove", bg: "#064e3b", text: "#34d399" },
  { id: "paper-sage", label: "Paper Sage", bg: "#f4f7f4", text: "#059669" },
  { id: "rose-quartz", label: "Rose Quartz", bg: "#fdf2f8", text: "#f472b6" },
  { id: "custom", label: "Custom", bg: "#18181b", text: "#ffffff" },
];

export function LiveThemeStudio({ settings, onUpdateSetting }: LiveThemeStudioProps) {
  const activePreset = THEME_PRESETS.find((p) => p.id === settings.theme) || THEME_PRESETS[0];

  const currentBg = settings.theme === "custom" ? settings.customBgPrimary : activePreset.bg;
  const currentText = settings.theme === "custom" ? settings.customTextPrimary : activePreset.text;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Appearance & Theme
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Tailor the color palette, zoom scale, ribbon layout, and workspace interface styling.
        </p>
      </div>

      {/* Interactive Workspace Miniature Preview */}
      <div className="rounded-2xl border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-6 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Workspace Preview Stage
          </span>
          <span className="rounded-md bg-[var(--bg-tertiary)] px-2.5 py-1 text-xs font-mono font-semibold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            Preset: {activePreset.label}
          </span>
        </div>

        {/* Workspace Mockup Card */}
        <div
          className="relative flex h-48 w-full overflow-hidden rounded-xl border border-black/10 transition-all duration-150"
          style={{ backgroundColor: currentBg, color: currentText }}
        >
          {/* Mock Ribbon */}
          {settings.showRibbon && (
            <div
              className="flex w-10 flex-col items-center gap-3 border-r py-3 transition-colors"
              style={{
                borderColor: `${currentText}15`,
                backgroundColor: `${currentText}08`,
              }}
            >
              <div
                className="h-4 w-4 rounded"
                style={{ backgroundColor: currentText }}
              />
              <div
                className="h-4 w-4 rounded opacity-40"
                style={{ backgroundColor: currentText }}
              />
            </div>
          )}

          {/* Mock File Explorer */}
          <div
            className="w-44 border-r p-3 text-xs transition-colors"
            style={{
              borderColor: `${currentText}15`,
              backgroundColor: `${currentText}04`,
            }}
          >
            <div className="mb-2 font-bold opacity-60 uppercase text-[9px] tracking-wider">Vault Notes</div>
            <div
              className="mb-1.5 rounded px-2 py-1 font-semibold"
              style={{ backgroundColor: `${currentText}15`, color: currentText }}
            >
              Quantum Physics.md
            </div>
            <div className="mb-1 px-2 py-1 opacity-70">
              Project Roadmap.md
            </div>
            <div className="px-2 py-1 opacity-70">
              AI Architecture.md
            </div>
          </div>

          {/* Mock Main Workspace Editor */}
          <div className="flex flex-1 flex-col">
            {/* Tab Bar */}
            <div
              className="flex items-center border-b px-3 pt-2 text-xs font-medium"
              style={{ borderColor: `${currentText}15` }}
            >
              <div
                className="flex items-center rounded-t-md border-t-2 px-3 py-1.5 font-bold"
                style={{
                  borderTopColor: currentText,
                  backgroundColor: currentBg,
                  color: currentText,
                }}
              >
                Quantum Physics.md
              </div>
            </div>

            {/* Note Content */}
            <div className="flex-1 p-5 text-xs">
              <h3 className="mb-2 text-sm font-bold" style={{ color: currentText }}>
                Quantum Physics & Knowledge Networks
              </h3>
              <p className="leading-relaxed opacity-80 text-[11px]">
                Local-first systems retain maximum privacy while enabling instant neural mapping...
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Theme Presets Grid */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Color Presets
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {THEME_PRESETS.map((preset) => {
            const isSelected = settings.theme === preset.id;
            const dotBg = preset.id === "custom" ? settings.customBgPrimary : preset.bg;
            const dotText = preset.id === "custom" ? settings.customTextPrimary : preset.text;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onUpdateSetting("theme", preset.id as AppSettings["theme"])}
                className={`relative flex items-center justify-between rounded-xl border p-3.5 text-left transition-all duration-150 ${
                  isSelected
                    ? "border-[var(--text-primary)] bg-[var(--bg-elevated)] font-bold shadow-xs"
                    : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                <span className="text-xs text-[var(--text-primary)]">{preset.label}</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-[var(--border-medium)] shadow-xs"
                    style={{ backgroundColor: dotBg }}
                    title="Background Color"
                  />
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-[var(--border-medium)] shadow-xs"
                    style={{ backgroundColor: dotText }}
                    title="Text / Accent Color"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Theme Colors Panel */}
      {settings.theme === "custom" && (
        <div className="rounded-xl border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-5">
          <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Custom Colors
          </h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Workspace Background Color
              </label>
              <input
                type="color"
                value={settings.customBgPrimary}
                onChange={(e) => onUpdateSetting("customBgPrimary", e.target.value)}
                className="h-9 w-full cursor-pointer rounded-lg border border-[var(--border-medium)] bg-transparent p-1"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Primary Text Color
              </label>
              <input
                type="color"
                value={settings.customTextPrimary}
                onChange={(e) => onUpdateSetting("customTextPrimary", e.target.value)}
                className="h-9 w-full cursor-pointer rounded-lg border border-[var(--border-medium)] bg-transparent p-1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Interface Layout Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PreferenceCard
          title="Display Vertical Ribbon"
          description="Renders the vertical activity launcher on the left workspace edge."
        >
          <CustomToggle
            checked={settings.showRibbon}
            onChange={(v) => onUpdateSetting("showRibbon", v)}
          />
        </PreferenceCard>

        <PreferenceCard
          title="Application Zoom Scale"
          description="Adjusts total desktop window viewport rendering percentage."
        >
          <SliderControl
            value={settings.zoomLevel}
            min={80}
            max={140}
            step={5}
            unit="%"
            onChange={(val) => onUpdateSetting("zoomLevel", val)}
          />
        </PreferenceCard>

        <PreferenceCard
          title="Quick Scroll Font Adjust"
          description="Hold Ctrl + Scroll wheel or pinch trackpad to adjust font size."
        >
          <CustomToggle
            checked={settings.quickFontSizeAdjustment}
            onChange={(v) => onUpdateSetting("quickFontSizeAdjustment", v)}
          />
        </PreferenceCard>

        <PreferenceCard
          title="Window Frame Style"
          description="Toggle native OS window border controls versus frameless title bar."
        >
          <SegmentedControl
            value={settings.windowFrameStyle}
            onChange={(v) => onUpdateSetting("windowFrameStyle", v as AppSettings["windowFrameStyle"])}
            options={[
              { value: "hidden", label: "Frameless" },
              { value: "native", label: "Native Window" },
            ]}
          />
        </PreferenceCard>
      </div>
    </div>
  );
}
