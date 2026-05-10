/**
 * Welcome Screen
 *
 * Displayed when no vault is selected. Provides vault opening
 * and a polished first-use experience.
 */

import React, { useEffect, useRef, useState } from "react";
import { FolderOpen, Plus, Network } from "lucide-react";
import { Theme } from "../types";
import { isDarkTheme } from "../utils/helpers";

export type VaultEntryAction = "open" | "create";
export type VaultEntryTransitionPhase = "idle" | "transitioning" | "entered";

interface WelcomeScreenProps {
  onOpenVault: (action: VaultEntryAction) => void;
  transitionPhase?: VaultEntryTransitionPhase;
  theme?: Theme;
}

export function WelcomeScreen({
  onOpenVault,
  transitionPhase = "idle",
  theme = "dark",
}: WelcomeScreenProps) {
  const [pressedAction, setPressedAction] = useState<VaultEntryAction | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const isDark = isDarkTheme(theme);

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
    <div className="welcome-screen" ref={screenRef} data-transition-phase={transitionPhase}>
      <div className="welcome-logo">
        <img
          src={isDark ? "/logos/logo-dark.png" : "/logos/logo-light.png"}
          alt="OpenObsidian Logo"
          style={{ width: "80px", height: "80px", objectFit: "contain" }}
        />
      </div>
      <h1 className="welcome-title">OpenObsidian</h1>
      <p className="welcome-subtitle">
        Your local-first knowledge base. Create, link, and visualize your
        thoughts as an interconnected graph.
      </p>
      <div className="welcome-actions">
        <button
          className={`btn btn-primary welcome-action-btn ${pressedAction === "open" ? "is-pressing" : ""}`}
          onClick={() => handleAction("open")}
          disabled={actionsDisabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            fontSize: "16px",
          }}
        >
          <FolderOpen size={18} strokeWidth={2} /> Open Vault
        </button>
        <button
          className={`btn btn-secondary welcome-action-btn ${pressedAction === "create" ? "is-pressing" : ""}`}
          onClick={() => handleAction("create")}
          disabled={actionsDisabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            fontSize: "16px",
          }}
        >
          <Plus size={18} strokeWidth={2} /> Create Vault
        </button>
      </div>
    </div>
  );
}
