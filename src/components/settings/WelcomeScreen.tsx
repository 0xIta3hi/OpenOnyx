/**
 * Welcome Screen
 *
 * Displayed when no vault is selected. Provides vault opening
 * and a polished first-use experience.
 */

import React, { useEffect, useRef, useState } from "react";
import { FolderOpen, Plus, Network } from "lucide-react";
import { Theme } from "../../types";
import { isDarkTheme } from "../../utils/helpers";
import type { AppSettings } from "./SettingsPage";

export type VaultEntryAction = "open" | "create";
export type VaultEntryTransitionPhase = "idle" | "transitioning" | "entered";

interface WelcomeScreenProps {
  onOpenVault: (action: VaultEntryAction) => void;
  transitionPhase?: VaultEntryTransitionPhase;
  theme?: Theme;
  settings?: AppSettings;
}

export function WelcomeScreen({
  onOpenVault,
  transitionPhase = "idle",
  theme = "dark",
  settings,
}: WelcomeScreenProps) {
  const [pressedAction, setPressedAction] = useState<VaultEntryAction | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const isDark = isDarkTheme(theme, settings);

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
    };
  }, []);

  const actionsDisabled = transitionPhase !== "idle";

  const handleAction = (action: VaultEntryAction) => {
    if (actionsDisabled) return;

    setPressedAction(action);
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }
    pressTimerRef.current = setTimeout(() => {
      setPressedAction(null);
      pressTimerRef.current = null;
    }, 140);

    onOpenVault(action);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-(--bg-primary) text-(--text-primary) select-none" ref={screenRef} data-transition-phase={transitionPhase}>
      <div className="mb-6">
        <img
          src={isDark ? "logos/logo-dark.png" : "logos/logo-light.png"}
          alt="OpenObsidian Logo"
          className="w-20 h-20 object-contain"
        />
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2 text-(--text-primary)">OpenObsidian</h1>
      <p className="text-sm text-(--text-secondary) text-center max-w-[360px] leading-relaxed mb-8">
        Your local-first knowledge base. Create, link, and visualize your
        thoughts as an interconnected graph.
      </p>
      <div className="flex items-center gap-4">
        <button
          className={`inline-flex items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg bg-(--accent-primary) text-(--text-on-accent) border border-(--accent-primary) cursor-pointer transition-all duration-150 hover:bg-(--accent-secondary) hover:border-(--accent-secondary) disabled:opacity-50 disabled:cursor-not-allowed ${pressedAction === "open" ? "scale-95" : ""}`}
          onClick={() => handleAction("open")}
          disabled={actionsDisabled}
        >
          <FolderOpen size={18} strokeWidth={2} /> Open Vault
        </button>
        <button
          className={`inline-flex items-center gap-2 px-6 py-3 text-base font-semibold rounded-lg bg-(--bg-secondary) text-(--text-primary) border border-(--border-subtle) cursor-pointer transition-all duration-150 hover:bg-(--bg-hover) hover:border-(--border-medium) disabled:opacity-50 disabled:cursor-not-allowed ${pressedAction === "create" ? "scale-95" : ""}`}
          onClick={() => handleAction("create")}
          disabled={actionsDisabled}
        >
          <Plus size={18} strokeWidth={2} /> Create Vault
        </button>
      </div>
    </div>
  );
}
