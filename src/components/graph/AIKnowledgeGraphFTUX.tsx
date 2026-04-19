import React, { useEffect, useRef, useState } from "react";
import { GraphView } from "./GraphView";
import { AIKnowledgeGraph } from "./AIKnowledgeGraph";
import { Theme } from "../../types";
import { getAPI } from "../../utils/api";

const api = getAPI();

interface AIKnowledgeGraphFTUXProps {
  onNodeClick: (noteName: string, heading?: string, notePath?: string) => void;
  onClose: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  theme?: Theme;
  vaultPath?: string | null;
  localNodePath?: string;
  initialAIView?: boolean;
  onAIViewChange?: (enabled: boolean) => void;
}

export function AIKnowledgeGraphFTUX({
  onNodeClick,
  onClose,
  isFullScreen = false,
  onToggleFullScreen,
  theme = "dark",
  vaultPath,
  localNodePath,
  initialAIView = false,
  onAIViewChange,
}: AIKnowledgeGraphFTUXProps) {
  const [aiViewEnabled, setAiViewEnabled] = useState(initialAIView);
  const [cooldownMessage, setCooldownMessage] = useState<string | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAiViewEnabled(initialAIView);
  }, [initialAIView]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  const flashMessage = (message: string) => {
    setCooldownMessage(message);
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = setTimeout(() => {
      setCooldownMessage(null);
      messageTimerRef.current = null;
    }, 2600);
  };

  const tryEnableAIView = async () => {
    try {
      const data = await api.getGraphData();
      const hasEnoughContext =
        !!data &&
        (data.nodes?.length || 0) >= 5 &&
        (data.edges?.length || 0) >= 1;

      if (!hasEnoughContext) {
        flashMessage("The pattern engine is warming up. Add a few more thoughts to unlock AI View.");
        setAiViewEnabled(false);
        onAIViewChange?.(false);
        return;
      }

      setCooldownMessage(null);
      setAiViewEnabled(true);
      onAIViewChange?.(true);
    } catch {
      flashMessage("The pattern engine is warming up. Add a few more thoughts to unlock AI View.");
      setAiViewEnabled(false);
      onAIViewChange?.(false);
    }
  };

  const handleModeChange = (nextMode: "manual" | "ai") => {
    if (nextMode === "manual") {
      setCooldownMessage(null);
      setAiViewEnabled(false);
      onAIViewChange?.(false);
      return;
    }
    void tryEnableAIView();
  };

  return (
    <div className="graph-mode-shell">
      <div className="graph-mode-switch" role="tablist" aria-label="Graph mode">
        <button
          type="button"
          className={`graph-mode-btn ${!aiViewEnabled ? "active" : ""}`}
          onClick={() => handleModeChange("manual")}
        >
          Manual
        </button>
        <button
          type="button"
          className={`graph-mode-btn ${aiViewEnabled ? "active" : ""}`}
          onClick={() => handleModeChange("ai")}
        >
          AI View
        </button>
      </div>

      {!aiViewEnabled && cooldownMessage && (
        <div className="graph-ai-center-message" role="status" aria-live="polite">
          {cooldownMessage}
        </div>
      )}

      {aiViewEnabled ? (
        <AIKnowledgeGraph
          onNodeClick={onNodeClick}
          onClose={onClose}
          isFullScreen={isFullScreen}
          onToggleFullScreen={onToggleFullScreen}
          theme={theme}
          vaultPath={vaultPath}
          localNodePath={localNodePath}
        />
      ) : (
        <GraphView
          onNodeClick={onNodeClick}
          onClose={onClose}
          isFullScreen={isFullScreen}
          onToggleFullScreen={onToggleFullScreen}
          theme={theme}
          vaultPath={vaultPath}
          localNodePath={localNodePath}
        />
      )}
    </div>
  );
}
