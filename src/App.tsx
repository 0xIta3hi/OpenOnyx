/**
 * App - Root Application Component
 *
 * Manages the global application state including vault selection,
 * theme, active notes, and layout. Coordinates between all major
 * components via prop drilling (simple and predictable for this scale).
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
// Patch HTMLElement.prototype with Obsidian DOM helpers (must be before any plugin code)
import './lib/obsidian-api/dom-extensions';
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/editor/Editor";
import { EditorHeader } from "./components/editor/EditorHeader";
import { LeafPaneEditor } from "./components/LeafPaneEditor";
import { AIKnowledgeGraphFTUX } from "./components/graph/AIKnowledgeGraphFTUX";
import { CanvasView } from "./components/canvas/CanvasView";
import { SearchModal } from "./components/SearchModal";
import { CommandPalette } from "./components/CommandPalette";
import { BacklinksPanel } from "./components/BacklinksPanel";
import { StatusBar } from "./components/StatusBar";
import {
  WelcomeScreen,
  type VaultEntryAction,
  type VaultEntryTransitionPhase,
} from "./components/WelcomeScreen";
import { Modal } from "./components/Modal";
import { Ribbon } from "./components/Ribbon";
import { OutlinePane } from "./components/OutlinePane";
import { TagPane } from "./components/TagPane";
import { OutgoingLinksPanel } from "./components/OutgoingLinksPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import {
  SettingsPage,
  AppSettings,
  DEFAULT_SETTINGS,
} from "./components/SettingsPage";
import { TemplateModal } from "./components/TemplateModal";
import { UnlinkedMentionsPanel } from "./components/UnlinkedMentionsPanel";
import { AIPage } from "./components/AIPage";
import { SpacesPage } from "./components/SpacesPage";
import { DatabaseView } from "./components/DatabaseView";
import {
  embedNote,
  loadStore,
  removeEmbedding,
  renameEmbeddingPath,
  renameEmbeddingsByPrefix,
  removeEmbeddingsByPrefix,
  findSimilar,
  applyHistoryWeighting,
  loadSuggestionHistory,
  loadTransitionMap,
  recordSuggestion,
  recordIgnoredSuggestions,
  getTransitionBoost,
  recordTransition,
  resetEmbeddingsStore,
  type EmbeddingStore,
} from "./utils/embeddings";
import { getAnnotation, getCachedAnnotation, generateFirstThoughtExpansion } from "./utils/ai-core";
import { initializeVault, setQueueStatusCallback, resetQueueState, type QueueStatus } from "./utils/background-queue";
import { type LinkType } from "./components/SuggestionBanner";
import { enrichSuggestions, type EnrichedSuggestion } from "./utils/suggestion-enrichment";
import { generateSynthesis, resetSynthesisCache } from "./utils/synthesis";
import { clearCache as clearSpacesCache } from "./utils/spaces-store";
import { FileText, Layout } from "lucide-react";
import { Tab, ViewMode, Theme, Command, FileEntry, PaneNode, PaneLeaf } from "./types";
import {
  SplitPaneContainer,
  createLeaf,
  findLeafWithTab,
  findFirstLeaf,
  findLeafById,
  collectAllTabs,
  insertTabIntoLeaf,
  removeTabFromTree,
  setActiveTabInLeaf,
  moveTabInTree,
} from "./components/SplitPaneContainer";
import type { PluginCommand, PluginRibbonAction, PluginStatusBarItem, PluginRegistration, PluginSettingTabRegistration } from "./types/plugin";
import { getNoteName, generateId, debounce, isDarkTheme } from "./utils/helpers";
import { getAPI } from "./utils/api";
import { PluginManager } from "./lib/pluginManager";
import { OOApp } from "./lib/obsidian-api/app";
import { PluginPermissionModal } from "./components/PluginPermissionModal";
import { PluginViewPanel } from "./components/PluginViewPanel";
import type { PluginPermission, PluginManifest } from "./types/plugin";
import {
  FTUXState,
  FTUXStage,
  getFTUXStage,
  loadFTUXNotNowSuppression,
  loadFTUXState,
  saveFTUXNotNowSuppression,
  saveFTUXState,
} from "./utils/ftux";
import { readData, writeData } from "./utils/disk-store";
import { DragCtx, DragContextData } from "./context/DragContext";
import {
  initGlobalKeybindings,
  setGlobalKeybindingsEnabled,
} from "./keybindings/globalKeys";
import { GroupModal } from "./components/GroupModal";
const api = getAPI();
const MIN_EDITOR_FONT_SIZE = 12;
const MAX_EDITOR_FONT_SIZE = 24;
type FontZoomScope = "both" | "editor" | "preview";
type GraphMode = "manual" | "ai";

function collectAllActiveTabPaths(node: PaneNode): string[] {
  if ('children' in node && Array.isArray(node.children)) {
    return [
      ...collectAllActiveTabPaths(node.children[0]),
      ...collectAllActiveTabPaths(node.children[1]),
    ];
  } else if ('tabs' in node && Array.isArray(node.tabs)) {
    const activeTab = node.tabs.find((t) => t.id === node.activeTabId);
    return activeTab && activeTab.path.endsWith('.md') ? [activeTab.path] : [];
  }
  return [];
}

type RGB = { r: number; g: number; b: number };

const clampByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

const hexToRgb = (hex: string): RGB | null => {
  const raw = hex.trim().replace("#", "");
  if (raw.length === 3) {
    const [r, g, b] = raw.split("").map((c) => parseInt(c + c, 16));
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b };
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b };
  }
  return null;
};

const rgbToHex = ({ r, g, b }: RGB): string => {
  const toHex = (v: number) => clampByte(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const mixRgb = (from: RGB, to: RGB, ratio: number): RGB => {
  const t = Math.max(0, Math.min(1, ratio));
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
};

const rgbToRgba = ({ r, g, b }: RGB, alpha: number): string =>
  `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${Math.max(
    0,
    Math.min(1, alpha),
  ).toFixed(3)})`;

const relativeLuminance = ({ r, g, b }: RGB): number => {
  const toLinear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
};

const getReadableTextOn = (bg: RGB): string =>
  relativeLuminance(bg) > 0.5 ? "#0a0a0a" : "#f5f5f5";

const CUSTOM_THEME_VARIABLES = [
  "--accent-color",
  "--color-base-00",
  "--color-base-05",
  "--color-base-10",
  "--color-base-20",
  "--color-base-25",
  "--color-base-30",
  "--color-base-35",
  "--color-base-40",
  "--color-base-50",
  "--color-base-60",
  "--color-base-70",
  "--color-base-100",
  "--bg-primary",
  "--bg-secondary",
  "--bg-tertiary",
  "--bg-elevated",
  "--bg-hover",
  "--bg-active",
  "--bg-glass",
  "--bg-input",
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--text-muted",
  "--text-faint",
  "--text-link",
  "--color-accent",
  "--color-accent-1",
  "--color-accent-2",
  "--accent-primary",
  "--accent-secondary",
  "--text-on-accent",
  "--accent-glow",
  "--scrollbar-thumb",
  "--scrollbar-thumb-hover",
  "--border-subtle",
  "--border-medium",
  "--border-strong",
  "--divider-color",
  "--titlebar-background",
  "--titlebar-background-focused",
  "--titlebar-text-color",
  "--titlebar-text-color-focused",
  "--status-bar-background",
  "--status-bar-text-color",
  "--tab-container-background",
  "--tab-background-active",
  "--tab-text-color",
  "--tab-text-color-active",
  "--tab-text-color-focused",
  "--tab-text-color-focused-active",
  "--tab-text-color-focused-active-current",
  "--nav-item-color",
  "--nav-item-color-hover",
  "--nav-item-color-active",
  "--nav-item-color-selected",
  "--nav-item-background-hover",
  "--nav-item-background-active",
  "--nav-item-background-selected",
  "--editor-caret",
  "--editor-selection",
  "--editor-selection-focused",
  "--editor-active-line",
  "--editor-active-line-border",
  "--editor-heading",
  "--editor-heading-marker",
  "--editor-link",
  "--editor-link-hover",
  "--editor-tag",
  "--editor-tag-bg",
  "--editor-code",
  "--editor-muted-token",
  "--editor-emphasis",
  "--editor-search-match",
  "--editor-search-match-border",
  "--editor-search-active",
  "--editor-search-active-border",
  "--graph-edge-color",
  "--graph-node-color",
] as const;

const isCanvasFile = (path: string) => path.toLowerCase().endsWith(".canvas");
const GRAPH_TAB_PATH = "__graph__.view";
const SPACES_TAB_PATH = "__spaces__.view";

const TRANSITION_STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "while", "where",
  "when", "then", "have", "has", "was", "were", "your", "about", "note", "notes",
  "list", "task", "item", "section", "idea", "project", "daily",
]);

const FIRST_THOUGHT_PROMPTS = [
  "A random thought...",
  "Something you're trying to figure out...",
  "An idea you had today...",
  "A problem you're stuck on...",
  "Something you've been thinking about...",
];

const FIRST_THOUGHT_GHOST_EXAMPLES = [
  "I want to build something but don't know where to start",
  "Why do I procrastinate even when I care?",
  "Learning feels scattered lately",
];

type FirstThoughtExpandableIntent =
  | "goal"
  | "problem"
  | "idea"
  | "confusion"
  | "reflection";

type FirstThoughtNonExpandableIntent =
  | "identity"
  | "factual"
  | "greeting"
  | "too_short"
  | "unknown";

type FirstThoughtIntentClassification =
  | {
      kind: "expandable";
      intent: FirstThoughtExpandableIntent;
      semantic: FirstThoughtSemanticIntent;
    }
  | {
      kind: "non_expandable";
      intent: FirstThoughtNonExpandableIntent;
    };

type FirstThoughtIntentType =
  | "learn"
  | "build"
  | "social"
  | "reflect"
  | "plan"
  | "problem";

type FirstThoughtContext = {
  knownSkills: string[];
  constraints: string[];
  timeframe: string | null;
  audience: string | null;
};

type FirstThoughtSemanticIntent = {
  intentType: FirstThoughtIntentType;
  topic: string | null;
  context: FirstThoughtContext;
  clarityScore: number;
  signals: {
    hasVagueSignal: boolean;
    hasSpecificTopicSignal: boolean;
  };
};

type FirstThoughtTemplate = {
  label: string;
  template: string;
};

type FirstThoughtExpansionPlan = {
  intent: FirstThoughtExpandableIntent;
  suggestions: [FirstThoughtTemplate, FirstThoughtTemplate, FirstThoughtTemplate];
};

const FIRST_THOUGHT_EXPANSION_IDLE_MS = 700;
const FIRST_THOUGHT_MIN_MEANINGFUL_WORDS = 4;

const FIRST_THOUGHT_MEANINGLESS_TOKENS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "and",
  "or",
  "but",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "it",
  "as",
  "with",
  "by",
]);

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

function normalizeFirstThoughtDraft(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getMeaningfulWordCount(value: string): number {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) => token.length > 0 && !FIRST_THOUGHT_MEANINGLESS_TOKENS.has(token),
    ).length;
}

const FIRST_THOUGHT_VAGUE_TOKENS = new Set([
  "something",
  "anything",
  "stuff",
  "things",
  "idk",
  "maybe",
  "whatever",
]);

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function extractKnownSkills(source: string): string[] {
  const skills: string[] = [];
  const candidates: Array<[RegExp, string]> = [
    [/\bpython\b/, "Python"],
    [/\bjavascript\b/, "JavaScript"],
    [/\btypescript\b/, "TypeScript"],
    [/\breact\b/, "React"],
    [/\bnode(?:\.js)?\b/, "Node.js"],
    [/\bsql\b/, "SQL"],
  ];

  candidates.forEach(([pattern, label]) => {
    if (pattern.test(source)) skills.push(label);
  });

  return Array.from(new Set(skills));
}

function extractAudience(source: string): string | null {
  const match = source.match(
    /\bfor\s+(students|developers|beginners|founders|creators|teams|freelancers)\b/,
  );
  return match ? match[1] : null;
}

function extractTimeframe(source: string): string | null {
  if (/\btoday\b/.test(source)) return "today";
  if (/\bthis\s+week\b/.test(source)) return "this week";
  if (/\bthis\s+month\b/.test(source)) return "this month";
  const match = source.match(/\bin\s+\d+\s+(day|days|week|weeks|month|months)\b/);
  return match ? match[0].replace(/^in\s+/, "in ") : null;
}

function extractConstraints(source: string): string[] {
  const constraints: string[] = [];
  if (/\b(no\s+time|limited\s+time|busy|full\s*time\s*job)\b/.test(source)) {
    constraints.push("limited time");
  }
  if (/\b(low\s+budget|no\s+budget|cheap)\b/.test(source)) {
    constraints.push("low budget");
  }
  return constraints;
}

const TOPIC_STOP_WORDS = new Set([
  "i", "me", "my", "mine", "myself", "yourself", "himself", "herself", "itself",
  "want", "to", "a", "an", "the", "is", "am", "are",
  "was", "were", "be", "been", "being", "do", "does", "did", "have",
  "has", "had", "will", "would", "could", "should", "can", "may",
  "might", "shall", "need", "just", "really", "very", "so", "too",
  "also", "but", "and", "or", "if", "then", "that", "this", "it",
  "its", "of", "in", "on", "at", "for", "with", "from", "by",
  "about", "into", "like", "some", "something", "anything",
  "feel", "think", "know", "get", "make", "go", "keep", "try",
  "start", "stop", "lot", "lots", "more", "much", "many",
  // Intent verbs — these describe the action, NOT the topic
  "learn", "study", "build", "create", "launch", "ship", "improve",
  "fix", "solve", "plan", "explore", "master", "practice", "develop",
  "design", "write", "read", "understand", "figure", "work",
  "become", "achieve", "find", "change", "grow", "manage",
  // Common fillers
  "how", "why", "what", "when", "where", "who", "which",
  "better", "good", "bad", "new", "old", "big", "small",
  "out", "up", "down", "way", "thing", "things", "stuff",
]);

function inferTopic(source: string): string | null {
  // Known topics first (high-confidence matches)
  if (/\b(swim|swimming|swimmer|pool|freestyle|backstroke)\b/.test(source)) return "swimming";
  if (/\b(machine\s+learning|deep\s+learning|nlp|computer\s+vision)\b/.test(source)) return "machine learning";
  if (/\bai|artificial\s+intelligence|llm\b/.test(source)) return "AI";
  if (/\bsaas|startup\b/.test(source)) return "SaaS";
  if (/\b(business|venture|company)\b/.test(source)) return "business";
  if (/\b(propose|ask\s+out|date|dating|relationship|crush|girl|boy|partner)\b/.test(source)) return "relationship";
  if (/\bfitness|workout|exercise|health\b/.test(source)) return "fitness";
  if (/\bfocus|concentration|distract\w*\b/.test(source)) return "focus";
  if (/\bproductivity|procrastinat\w*\b/.test(source)) return "productivity";
  if (/\b(python|javascript|typescript|react|node|coding|code|programming|web\s*dev|app\s*dev|software)\b/.test(source)) return "coding";
  if (/\b(learning|study\w*|exam)\b/.test(source)) return "learning";

  // Dynamic extraction: strip the full intent phrase, then extract meaningful nouns
  const stripped = source
    .replace(/^(?:i\s+(?:want|need|plan|aim|love|like|enjoy|feel|think|keep)\s+(?:to\s+)?)/i, "")
    .replace(/^(?:i\s+(?:am|was)\s+(?:trying\s+to\s+)?)/i, "")
    .replace(/^(?:how\s+(?:do|can|should)\s+i\s+)/i, "")
    .replace(/^(?:why\s+(?:do|can't|don't|am)\s+i\s+)/i, "")
    .trim();

  const tokens = stripped
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 2 && !TOPIC_STOP_WORDS.has(t));

  if (tokens.length === 0) return null;

  // Take up to 3 meaningful tokens as the topic phrase
  const topicTokens = tokens.slice(0, Math.min(3, tokens.length));
  return topicTokens.join(" ");
}

function inferFirstThoughtSemanticIntent(
  rawText: string,
  intentType: FirstThoughtIntentType,
): FirstThoughtSemanticIntent {
  const source = normalizeFirstThoughtDraft(rawText);
  const topic = inferTopic(source);
  const context: FirstThoughtContext = {
    knownSkills: extractKnownSkills(source),
    constraints: extractConstraints(source),
    timeframe: extractTimeframe(source),
    audience: extractAudience(source),
  };

  const meaningfulWords = getMeaningfulWordCount(source);
  const hasVagueSignal = Array.from(FIRST_THOUGHT_VAGUE_TOKENS).some((token) =>
    new RegExp(`\\b${token}\\b`).test(source),
  );
  const hasExplicitDifficultySignal = /\b(stuck|struggle|can'?t|cannot|overwhelmed|confused|blocked)\b/.test(source);
  const hasSpecificTopicSignal =
    topic !== null && !["learning", "programming", "productivity"].includes(topic);
  const hasIntentVerbSignal =
    /(learn|study|build|create|launch|plan|improve|fix|solve|propose|ask\s+out|reflect|think|feel)/.test(
      source,
    );

  let clarityScore = 0.24;
  if (hasIntentVerbSignal) clarityScore += 0.16;
  if (topic) clarityScore += 0.25;
  if (hasSpecificTopicSignal) clarityScore += 0.12;
  if (hasExplicitDifficultySignal) clarityScore += 0.15;
  if (meaningfulWords >= 6) clarityScore += 0.15;
  if (meaningfulWords >= 9) clarityScore += 0.1;
  if (context.knownSkills.length > 0) clarityScore += 0.12;
  if (context.audience) clarityScore += 0.1;
  if (context.timeframe) clarityScore += 0.08;
  if (context.constraints.length > 0) clarityScore += 0.08;
  if (hasVagueSignal) clarityScore -= 0.22;
  if (!topic) clarityScore -= 0.1;

  if (hasIntentVerbSignal && hasVagueSignal && !topic && meaningfulWords >= 4) {
    clarityScore = Math.max(0.35, clarityScore);
  }

  return {
    intentType,
    topic,
    context,
    clarityScore: clampScore(clarityScore),
    signals: {
      hasVagueSignal,
      hasSpecificTopicSignal,
    },
  };
}

function extractExpansionAnchors(semantic: FirstThoughtSemanticIntent): string[] {
  const anchors = new Set<string>();

  const intentCueMap: Record<FirstThoughtIntentType, string[]> = {
    learn: ["learn", "learning", "study", "project", "skill", "explore", "goal"],
    build: ["build", "product", "launch", "prototype", "users", "problem"],
    social: ["approach", "interaction", "conversation", "relationship"],
    reflect: ["feeling", "pattern", "clarity", "support"],
    plan: ["plan", "priority", "action", "goal", "routine", "progress"],
    problem: ["problem", "stuck", "unblock", "test", "difficult", "challenge"],
  };

  if (semantic.topic) {
    semantic.topic
      .toLowerCase()
      .split(/\s+/)
      .forEach((token) => {
        if (token.length >= 3) anchors.add(token);
      });
  }

  semantic.context.knownSkills.forEach((skill) => anchors.add(skill.toLowerCase()));
  semantic.context.constraints.forEach((constraint) => {
    constraint
      .toLowerCase()
      .split(/\s+/)
      .forEach((token) => {
        if (token.length >= 3) anchors.add(token);
      });
  });

  if (semantic.context.audience) anchors.add(semantic.context.audience.toLowerCase());
  if (semantic.context.timeframe) {
    semantic.context.timeframe
      .toLowerCase()
      .split(/\s+/)
      .forEach((token) => {
        if (token.length >= 3) anchors.add(token);
      });
  }

  intentCueMap[semantic.intentType].forEach((cue) => anchors.add(cue));

  return Array.from(anchors);
}

function isExpansionPlanRelevant(
  _semantic: FirstThoughtSemanticIntent,
  _plan: FirstThoughtExpansionPlan,
): boolean {
  // Always relevant — we generate dynamic topic-aware templates now
  return true;
}

function classifyFirstThoughtIntent(
  value: string,
): FirstThoughtIntentClassification {
  const normalized = normalizeFirstThoughtDraft(value);

  if (!normalized) {
    return { kind: "non_expandable", intent: "too_short" };
  }

  // Already expanded content should not trigger suggestions again.
  if (/\n\s*##\s+/.test(value)) {
    return { kind: "non_expandable", intent: "unknown" };
  }

  if (/^(hi|hello|hey|yo|good\s+(morning|afternoon|evening))\b/.test(normalized)) {
    return { kind: "non_expandable", intent: "greeting" };
  }

  if (/^my\s+name\s+is\b/.test(normalized)) {
    return { kind: "non_expandable", intent: "identity" };
  }

  if (/^(?:i\s+am|i'?m)\s+(?!feeling\b|thinking\b|struggling\b|confused\b|stuck\b|overwhelmed\b).+/.test(normalized)) {
    return { kind: "non_expandable", intent: "identity" };
  }

  if (/^(today\s+is|this\s+is|it\s+is|there\s+is|there\s+are)\b/.test(normalized)) {
    return { kind: "non_expandable", intent: "factual" };
  }

  if (/^i\s+(?:use|know|have|work\s+with)\s+[a-z0-9+#\s]+$/.test(normalized)) {
    return { kind: "non_expandable", intent: "factual" };
  }

  if (/^(?:idk|i\s+don'?t\s+know|maybe|something|anything|whatever)$/.test(normalized)) {
    return { kind: "non_expandable", intent: "unknown" };
  }

  const hasSocialIntent = /\b(propose|ask\s+out|date|dating|relationship|crush|girl|boy|partner)\b/.test(
    normalized,
  );

  let match = normalized.match(
    /^(?:i\s+want\s+to|i\s+need\s+to)\s+(.+)$/,
  );
  if (match) {
    const semanticIntentType: FirstThoughtIntentType = hasSocialIntent
      ? "social"
      : /(learn|study|master|practice)\b/.test(normalized)
        ? "learn"
        : /(build|create|launch|ship|prototype)\b/.test(normalized)
          ? "build"
          : "plan";
    return {
      kind: "expandable",
      intent: "goal",
      semantic: inferFirstThoughtSemanticIntent(normalized, semanticIntentType),
    };
  }

  match = normalized.match(/^(?:i\s+plan\s+to|i\s+aim\s+to|i\s+am\s+going\s+to)\s+(.+)$/);
  if (match) {
    const semanticIntentType: FirstThoughtIntentType = hasSocialIntent
      ? "social"
      : "plan";
    return {
      kind: "expandable",
      intent: "goal",
      semantic: inferFirstThoughtSemanticIntent(normalized, semanticIntentType),
    };
  }

  match = normalized.match(
    /^(?:i\s+can'?t|i\s+cannot|i\s+struggle\s+with|i\s+struggle\s+to|i\s+am\s+stuck\s+with)\s+(.+)$/,
  );
  if (match) {
    return {
      kind: "expandable",
      intent: "problem",
      semantic: inferFirstThoughtSemanticIntent(normalized, "problem"),
    };
  }

  if (/\b(stuck|blocked|overwhelmed|confused)\b/.test(normalized)) {
    return {
      kind: "expandable",
      intent: "problem",
      semantic: inferFirstThoughtSemanticIntent(normalized, "problem"),
    };
  }

  if (/^what\s+if\b/.test(normalized) || /\b(build|create|launch|ship|prototype)\b/.test(normalized)) {
    return {
      kind: "expandable",
      intent: "idea",
      semantic: inferFirstThoughtSemanticIntent(normalized, "build"),
    };
  }

  if (hasSocialIntent) {
    return {
      kind: "expandable",
      intent: "goal",
      semantic: inferFirstThoughtSemanticIntent(normalized, "social"),
    };
  }

  match = normalized.match(
    /^(?:why|how\s+do\s+i|how\s+can\s+i|what\s+am\s+i\s+missing)\b(?:\s+(.+))?$/,
  );
  if (match) {
    return {
      kind: "expandable",
      intent: "confusion",
      semantic: inferFirstThoughtSemanticIntent(normalized, "problem"),
    };
  }

  match = normalized.match(/^(?:i\s+feel|i\s+think)\s+(.+)$/);
  if (match) {
    const semanticIntentType: FirstThoughtIntentType = /\bstuck\b/.test(normalized)
      ? "problem"
      : "reflect";
    return {
      kind: "expandable",
      intent: "reflection",
      semantic: inferFirstThoughtSemanticIntent(normalized, semanticIntentType),
    };
  }

  match = normalized.match(/^(?:i\s+love|i\s+like|i\s+enjoy)\s+(.+)$/);
  if (match) {
    return {
      kind: "expandable",
      intent: "reflection",
      semantic: inferFirstThoughtSemanticIntent(normalized, "reflect"),
    };
  }

  if (/\b(confused|unclear|lost|dont\s+understand|don't\s+understand)\b/.test(normalized)) {
    return {
      kind: "expandable",
      intent: "confusion",
      semantic: inferFirstThoughtSemanticIntent(normalized, "problem"),
    };
  }

  if (getMeaningfulWordCount(normalized) < FIRST_THOUGHT_MIN_MEANINGFUL_WORDS) {
    return { kind: "non_expandable", intent: "too_short" };
  }

  return { kind: "non_expandable", intent: "unknown" };
}

function getFirstThoughtExpansionPlan(value: string): FirstThoughtExpansionPlan | null {
  const classification = classifyFirstThoughtIntent(value);
  if (classification.kind !== "expandable") {
    // Even non-expandable intents with enough words should get a generic plan
    const words = getMeaningfulWordCount(value);
    if (words < 3) return null;
    // Extract a topic from raw text for generic expansion
    const fallbackTopic = inferTopic(normalizeFirstThoughtDraft(value)) || "this";
    const cap = fallbackTopic.charAt(0).toUpperCase() + fallbackTopic.slice(1);
    return {
      intent: "goal",
      suggestions: [
        { label: `What matters about ${fallbackTopic}`, template: `## Why ${cap} Matters\n- \n- \n` },
        { label: `Explore ${fallbackTopic} deeper`, template: `## Exploring ${cap}\n- \n- \n` },
        { label: `What to do with ${fallbackTopic}`, template: `## Next Steps for ${cap}\n- [ ] \n- [ ] \n` },
      ],
    };
  }

  const semantic = classification.semantic;
  // Extract topic — use inferred topic, or pull it from the raw input
  const topic = semantic.topic || inferTopic(normalizeFirstThoughtDraft(value)) || "this";
  const cap = topic.charAt(0).toUpperCase() + topic.slice(1);

  let plan: FirstThoughtExpansionPlan | null = null;

  if (semantic.intentType === "learn") {
    plan = {
      intent: "goal",
      suggestions: [
        { label: `Map out learning ${topic}`, template: `## Learning ${cap} — Roadmap\n- Start with fundamentals of ${topic}\n- Build a small ${topic} project\n- Review and iterate\n` },
        { label: `Find ${topic} resources`, template: `## ${cap} Resources\n- [ ] Find a beginner course for ${topic}\n- [ ] Look for ${topic} communities\n- [ ] Set aside weekly time for ${topic}\n` },
        { label: `Why ${topic} matters to me`, template: `## Why ${cap}?\n- What drew me to ${topic}\n- What I hope to do with ${topic}\n- How I'll know I'm making progress\n` },
      ],
    };
  } else if (semantic.intentType === "build") {
    plan = {
      intent: "idea",
      suggestions: [
        { label: `Define what ${topic} solves`, template: `## What ${cap} Solves\n- The core problem\n- Who feels this pain\n- Why existing solutions fail\n` },
        { label: `Sketch ${topic} v1`, template: `## ${cap} — First Version\n- Core feature #1\n- Core feature #2\n- What to skip for now\n` },
        { label: `Who needs ${topic}`, template: `## ${cap} — Target Users\n- Primary user type\n- Their biggest frustration\n- How they'd find ${topic}\n` },
      ],
    };
  } else if (semantic.intentType === "social") {
    plan = {
      intent: "goal",
      suggestions: [
        { label: `Plan the first move`, template: `## First Interaction\n- Setting/context for ${topic}\n- What to say or do\n- How to read the response\n` },
        { label: `Why ${topic} matters`, template: `## Why This Matters\n- What I'm hoping for\n- What I'm afraid of\n- What I'd regret not doing\n` },
        { label: `Best & worst outcomes`, template: `## Possible Outcomes\n- Best case\n- Realistic case\n- Worst case (and why it's fine)\n` },
      ],
    };
  } else if (semantic.intentType === "problem") {
    plan = {
      intent: "problem",
      suggestions: [
        { label: `Root cause of ${topic}`, template: `## Why ${cap} Happens\n- When it started\n- What makes it worse\n- What I've tried so far\n` },
        { label: `One action for ${topic}`, template: `## One Thing I Can Do\n- [ ] Smallest step to address ${topic}\n- When I'll do it\n- How I'll know it worked\n` },
        { label: `Patterns around ${topic}`, template: `## ${cap} — Patterns\n- Times when ${topic} gets worse\n- Times when it gets better\n- What's different in those moments\n` },
      ],
    };
  } else if (semantic.intentType === "reflect") {
    plan = {
      intent: "reflection",
      suggestions: [
        { label: `Unpack this feeling`, template: `## What I'm Feeling About ${cap}\n- The core emotion\n- What triggered it\n- What I need right now\n` },
        { label: `What triggered ${topic}`, template: `## ${cap} — The Trigger\n- What happened recently\n- Why it hit differently this time\n- What I wish had happened\n` },
        { label: `Moving forward from ${topic}`, template: `## Moving Forward\n- One thing that would help\n- Who I could talk to about ${topic}\n- What "better" looks like this week\n` },
      ],
    };
  } else if (semantic.intentType === "plan") {
    plan = {
      intent: "goal",
      suggestions: [
        { label: `${cap} milestones`, template: `## ${cap} — Milestones\n- First milestone for ${topic}\n- Mid-point checkpoint\n- End goal\n` },
        { label: `${cap} priorities`, template: `## ${cap} — What Comes First\n- Most important thing for ${topic}\n- What can wait\n- What to drop entirely\n` },
        { label: `${cap} constraints`, template: `## ${cap} — Reality Check\n- Time available for ${topic}\n- Skills or resources I need\n- Biggest risk\n` },
      ],
    };
  }

  if (!plan) {
    // Generic fallback — still topic-aware
    plan = {
      intent: "goal",
      suggestions: [
        { label: `Explore ${topic} further`, template: `## Exploring ${cap}\n- What I know so far\n- What I want to figure out\n- First thing to try\n` },
        { label: `Why ${topic} matters`, template: `## Why ${cap} Matters\n- What draws me to ${topic}\n- What changes if I pursue this\n- What I'd regret skipping\n` },
        { label: `Next step for ${topic}`, template: `## ${cap} — Next Step\n- [ ] The one thing I can do today\n- [ ] Who or what can help\n- [ ] How I'll track progress\n` },
      ],
    };
  }

  return plan;
}

function expandFirstThoughtDraft(
  value: string,
  templateString: string,
): { value: string; cursor: number } {
  const trimmed = value.trim();
  const expandedValue = `${trimmed}\n\n${templateString}`;
  return {
    value: expandedValue,
    cursor: expandedValue.length,
  };
}

function extractConceptTokens(value: string, maxTokens = 8): string[] {
  return value
    .toLowerCase()
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !TRANSITION_STOP_WORDS.has(token))
    .slice(0, maxTokens);
}

function deriveCurrentConcept(content: string): string | null {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const recent = lines.slice(-6).reverse();
  for (const line of recent) {
    const tokens = extractConceptTokens(line, 1);
    if (tokens.length > 0) return tokens[0];
  }

  const fallback = extractConceptTokens(content, 1);
  return fallback[0] || null;
}

function getTransitionLikelihood(
  transitionMap: Record<string, Record<string, number>>,
  fromConcept: string,
  candidateTokens: string[],
): number {
  const transitions = transitionMap[fromConcept];
  if (!transitions || candidateTokens.length === 0) return 0;

  const total = Object.values(transitions).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;

  let best = 0;
  for (const token of candidateTokens) {
    const probability = (transitions[token] || 0) / total;
    if (probability > best) best = probability;
  }
  return best;
}

import { syncEngine } from "./lib/syncEngine";
import { collaborationEngine, type CollabStatus } from "./lib/collaborationEngine";
import { localDB, LocalGroup } from "./lib/localdb";
import { authManager } from "./lib/auth";
import { v4 as uuidv4 } from "uuid";

export default function App() {
  // ── Global State ────────────────────────────────────
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [previouslyOpenedVaults, setPreviouslyOpenedVaults] = useState<string[]>([]);
  const [collabStatus, setCollabStatus] = useState<CollabStatus>({ state: 'idle' });
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [showGraph, setShowGraph] = useState(false);
  const [graphMode, setGraphMode] = useState<GraphMode>("manual");
  const [graphFullScreen, setGraphFullScreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showOutgoingLinks, setShowOutgoingLinks] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<string>("general");

  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      const customEvent = e as CustomEvent<{ section?: string }>;
      if (customEvent.detail?.section) {
        setSettingsSection(customEvent.detail.section);
      } else {
        setSettingsSection("general");
      }
      setShowSettings(true);
    };
    window.addEventListener("open-settings", handleOpenSettings);
    return () => window.removeEventListener("open-settings", handleOpenSettings);
  }, []);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showUnlinkedMentions, setShowUnlinkedMentions] = useState(false);
  const [showThoughtModel, setShowThoughtModel] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [canvasFilePath, setCanvasFilePath] = useState<string | null>(null);
  const [canvasFullScreen, setCanvasFullScreen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Load settings from localStorage on initial render
    try {
      const saved = localStorage.getItem("openobsidian-settings");
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    return DEFAULT_SETTINGS;
  });
  const [starredNotes, setStarredNotes] = useState<string[]>([]);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [recentCanvasFiles, setRecentCanvasFiles] = useState<string[]>([]);
  const [noteContentCache, setNoteContentCache] = useState<Map<string, string>>(
    new Map(),
  );
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  // ── Plugin System State ───────────────────────────
  const [pluginCommands, setPluginCommands] = useState<PluginCommand[]>([]);
  const [pluginRibbonActions, setPluginRibbonActions] = useState<PluginRibbonAction[]>([]);
  const [pluginStatusBarItems, setPluginStatusBarItems] = useState<PluginStatusBarItem[]>([]);
  const [pluginList, setPluginList] = useState<PluginRegistration[]>([]);
  const [pluginSettingTabs, setPluginSettingTabs] = useState<PluginSettingTabRegistration[]>([]);
  const pluginManagerRef = useRef<PluginManager | null>(null);
  const ooAppRef = useRef<OOApp | null>(null);
  const collabSubRef = useRef<{
    vaultPath: string | null;
    userId: string | null;
    spaceId: string | null;
  }>({ vaultPath: null, userId: null, spaceId: null });
  const [pluginViews, setPluginViews] = useState<Array<{ viewType: string; displayText: string; icon: string; containerEl: HTMLElement; side: 'left' | 'right' | 'main' }>>([]);
  // Permission modal state
  const [permissionModalData, setPermissionModalData] = useState<{
    manifest: PluginManifest;
    permissions: PluginPermission[];
    resolve: (approved: boolean) => void;
  } | null>(null);
  const [ftuxState, setFtuxState] = useState<FTUXState>(() => loadFTUXState());
  const [firstThoughtDraft, setFirstThoughtDraft] = useState("");
  const [firstThoughtPromptIndex, setFirstThoughtPromptIndex] = useState(0);
  const [firstThoughtPromptNextIndex, setFirstThoughtPromptNextIndex] = useState<number | null>(null);
  const [firstThoughtPromptCrossfading, setFirstThoughtPromptCrossfading] = useState(false);
  const [firstThoughtPromptFadeMs, setFirstThoughtPromptFadeMs] = useState(220);
  const [firstThoughtPromptOverlapDelayMs, setFirstThoughtPromptOverlapDelayMs] = useState(70);
  const [showFirstThoughtPromptEntry, setShowFirstThoughtPromptEntry] = useState(false);
  const [showFirstThoughtGhostEntry, setShowFirstThoughtGhostEntry] = useState(false);
  const [showFirstThoughtHintEntry, setShowFirstThoughtHintEntry] = useState(false);
  const [isFirstThoughtFocused, setIsFirstThoughtFocused] = useState(false);
  const [hasFirstThoughtKeystroke, setHasFirstThoughtKeystroke] = useState(false);
  const [firstThoughtExpansionPlan, setFirstThoughtExpansionPlan] = useState<FirstThoughtExpansionPlan | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);
  const [showFirstThoughtExpansionHint, setShowFirstThoughtExpansionHint] = useState(false);
  const [shownFirstThoughtExpansionDraftKey, setShownFirstThoughtExpansionDraftKey] = useState<string | null>(null);
  const [dismissedFirstThoughtExpansionDraftKey, setDismissedFirstThoughtExpansionDraftKey] = useState<string | null>(null);
  const [ftuxInsightText, setFtuxInsightText] = useState<string | null>(null);
  const [ftuxSuggestionIdle, setFtuxSuggestionIdle] = useState(false);
  const [ftuxConnectionPulse, setFtuxConnectionPulse] = useState(false);
  const [vaultEntryTransitionPhase, setVaultEntryTransitionPhase] =
    useState<VaultEntryTransitionPhase>("idle");
  const [isVaultEntryCalmReady, setIsVaultEntryCalmReady] = useState(true);
  const [notNowSuppressedUntilNotes, setNotNowSuppressedUntilNotes] = useState<number>(() =>
    loadFTUXNotNowSuppression(),
  );
  const firstThoughtInputRef = useRef<HTMLTextAreaElement | null>(null);
  const firstThoughtPromptIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstThoughtPromptFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstThoughtEntryPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstThoughtEntryGhostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstThoughtEntryHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstThoughtExpansionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstThoughtAutoFocusSkipRef = useRef(false);
  const ftuxIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ftuxPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vaultEntryTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vaultEntryCalmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Split pane references and dragging
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [editorPaneWidth, setEditorPaneWidth] = useState(50);

  const handlePaneDrag = useCallback((e: MouseEvent) => {
    if (!mainContentRef.current) return;
    const rect = mainContentRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
    if (newWidth > 20 && newWidth < 80) setEditorPaneWidth(newWidth);
  }, []);

  const stopPaneDrag = useCallback(() => {
    document.removeEventListener("mousemove", handlePaneDrag);
    document.removeEventListener("mouseup", stopPaneDrag);
    document.body.style.cursor = "default";
  }, [handlePaneDrag]);

  const startPaneDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      document.addEventListener("mousemove", handlePaneDrag);
      document.addEventListener("mouseup", stopPaneDrag);
      document.body.style.cursor = "ew-resize";
    },
    [handlePaneDrag, stopPaneDrag],
  );

  // ── Sidebar drag resizer (Obsidian-style: CSS-only during drag, no React re-renders) ──
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [dragCtx, setDragCtx] = useState<DragContextData | null>(null);
  const sidebarWidthRef = useRef(260);
  const appBodyRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with state (for non-drag updates)
  useEffect(() => { sidebarWidthRef.current = sidebarWidth; }, [sidebarWidth]);

  const startSidebarDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = "ew-resize";
    // Disable pointer events on iframes/embeds during drag to prevent stealing mouse
    document.body.classList.add("is-dragging");

    const onMove = (ev: MouseEvent) => {
      const newWidth = ev.clientX - 48;
      if (newWidth > 150 && newWidth < 600) {
        sidebarWidthRef.current = newWidth;
        // Direct DOM mutation -- zero React re-renders
        const root = appBodyRef.current || document.querySelector('.app-body');
        if (root) (root as HTMLElement).style.setProperty('--sidebar-width', `${newWidth}px`);
        // Also update titlebar-left width directly
        const tbLeft = document.querySelector('.titlebar-left') as HTMLElement;
        if (tbLeft) {
          const w = 44 + newWidth;
          tbLeft.style.width = `${w}px`;
          tbLeft.style.minWidth = `${w}px`;
        }
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "default";
      document.body.classList.remove("is-dragging");
      // Commit final value to React state (single re-render)
      setSidebarWidth(sidebarWidthRef.current);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // ── Right Sidebar drag resizer ──
  const [rightSidebarWidth, setRightSidebarWidth] = useState(300);
  const rightSidebarWidthRef = useRef(300);

  useEffect(() => { rightSidebarWidthRef.current = rightSidebarWidth; }, [rightSidebarWidth]);

  const startRightSidebarDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = "ew-resize";
    document.body.classList.add("is-dragging");

    const onMove = (ev: MouseEvent) => {
      const ribbonWidth = 48;
      const curLeftWidth = sidebarWidthRef.current;
      const leftUsed = document.querySelector('.sidebar.collapsed') ? 0 : curLeftWidth;
      const minCenterWidth = 40;
      const maxRightWidth = window.innerWidth - ribbonWidth - leftUsed - minCenterWidth;

      let newWidth = window.innerWidth - ev.clientX;
      if (newWidth < 200) newWidth = 200;
      if (newWidth > maxRightWidth) newWidth = maxRightWidth;

      rightSidebarWidthRef.current = newWidth;
      // Direct DOM mutation
      const root = appBodyRef.current || document.querySelector('.app-body');
      if (root) (root as HTMLElement).style.setProperty('--right-sidebar-width', `${newWidth}px`);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "default";
      document.body.classList.remove("is-dragging");
      setRightSidebarWidth(rightSidebarWidthRef.current);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // ── Thought Model panel drag resizer ──
  const [thoughtModelWidth, setThoughtModelWidth] = useState(400);
  const thoughtModelWidthRef = useRef(400);

  useEffect(() => { thoughtModelWidthRef.current = thoughtModelWidth; }, [thoughtModelWidth]);

  const startThoughtModelDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = "ew-resize";
    document.body.classList.add("is-dragging");

    const onMove = (ev: MouseEvent) => {
      const appWidth = window.innerWidth - 48;
      const newWidth = appWidth - ev.clientX;
      if (newWidth > 300 && newWidth < 800) {
        thoughtModelWidthRef.current = newWidth;
        const panel = document.querySelector('.thought-model-panel') as HTMLElement;
        if (panel) panel.style.width = `${newWidth}px`;
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "default";
      document.body.classList.remove("is-dragging");
      setThoughtModelWidth(thoughtModelWidthRef.current);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // ── File & Editor State ─────────────────────────────
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);

  const [showInlineInsightByTab, setShowInlineInsightByTab] = useState<Record<string, boolean>>({});
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [backlinks, setBacklinks] = useState<string[]>([]);
  
  // Toast notifications state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, []);

  // ── Split Pane Tree ──
  const [initialLeaf] = useState(() => createLeaf([]));
  const [paneTree, setPaneTree] = useState<PaneNode>(initialLeaf);
  const [focusedLeafId, setFocusedLeafId] = useState<string>(initialLeaf.id);

  // ── Layout Groups State & Refs ──
  const [groups, setGroups] = useState<LocalGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set<string>());

  const handleToggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set<string>(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);
  const [groupModalData, setGroupModalData] = useState<{
    type: "create" | "rename" | "color";
    groupId?: string;
    title: string;
    initialName?: string;
    initialColor?: string;
    tabId?: string;
  } | null>(null);

  const handleOpenNewTab = useCallback((groupId?: any) => {
    const targetGroupId = typeof groupId === "string" ? groupId : null;

    if (activeGroupId && !targetGroupId) {
      // Auto-save the current layout state to the database before exiting the group
      const activeGroup = groups.find((g) => g.id === activeGroupId);
      if (activeGroup) {
        const currentScrolls: Record<string, number> = {};
        const currentCursors: Record<string, number> = {};
        const currentViewModes: Record<string, string> = {};

        const allOpenTabs = collectAllTabs(paneTree);
        for (const tab of allOpenTabs) {
          const cached = scrollCursorCacheRef.current[tab.path];
          if (cached) {
            if (cached.scroll !== undefined) currentScrolls[tab.path] = cached.scroll;
            if (cached.cursor !== undefined) currentCursors[tab.path] = cached.cursor;
            if (cached.viewMode !== undefined) currentViewModes[tab.path] = cached.viewMode;
          }
        }

        const updatedGroup: LocalGroup = {
          ...activeGroup,
          updated_at: new Date().toISOString(),
          layout_state: {
            paneTree,
            activeTabId,
            focusedLeafId,
            scrollPositions: currentScrolls,
            cursorPositions: currentCursors,
            viewModes: currentViewModes,
          },
        };

        // Save layout to local database
        localDB.putGroup(updatedGroup)
          .then(() => {
            setGroups((prev) =>
              prev.map((g) => (g.id === activeGroupId ? updatedGroup : g))
            );
          })
          .catch((err) => console.error("Auto-save group failed before opening blank tab:", err));
      }

      setActiveGroupId(null);

      const ungroupedTabs = tabs.filter(t => !t.groupId || !groups.some(g => g.id === t.groupId));

      const newTab: Tab = {
        id: generateId(),
        path: "__new_tab__",
        name: "New tab",
        isModified: false,
        groupId: null,
      };

      ungroupedTabs.push(newTab);

      const newTree: PaneLeaf = {
        type: 'leaf',
        id: generateId(),
        tabs: ungroupedTabs,
        activeTabId: newTab.id,
      };

      skipTabSyncRef.current = true;
      setPaneTree(newTree);
      setTabs(ungroupedTabs);
      setActiveTabId(newTab.id);
      setFocusedLeafId(newTree.id);
      setCurrentContent("");
      setBacklinks([]);
      return;
    }

    const newTab: Tab = {
      id: generateId(),
      path: "__new_tab__",
      name: "New tab",
      isModified: false,
      groupId: targetGroupId,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setCurrentContent("");
    setBacklinks([]);
  }, [generateId, activeGroupId, groups, paneTree, activeTabId, focusedLeafId]);

  // Position and mode cache per file path
  const scrollCursorCacheRef = useRef<Record<string, { scroll?: number, cursor?: number, viewMode?: ViewMode }>>({});

  const handleScrollAndCursorChange = useCallback((path: string, stateUpdate: { scroll?: number, cursor?: number, viewMode?: ViewMode }) => {
    if (!path || path === "__new_tab__") return;
    const current = scrollCursorCacheRef.current[path] || {};
    scrollCursorCacheRef.current[path] = {
      ...current,
      ...stateUpdate,
    };
  }, []);

  const getViewState = useCallback((path: string) => {
    return scrollCursorCacheRef.current[path];
  }, []);

  // Load layout groups for current vault
  useEffect(() => {
    if (!vaultPath) {
      setGroups([]);
      setActiveGroupId(null);
      setHasUnsavedChanges(false);
      return;
    }
    
    localDB.getGroups(vaultPath)
      .then((g) => {
        setGroups(g);
        setActiveGroupId(null);
        setHasUnsavedChanges(false);
      })
      .catch((err) => console.error("Failed to load layout groups:", err));
  }, [vaultPath]);

  // Layout change detection & Auto-save
  useEffect(() => {
    if (!activeGroupId) {
      setHasUnsavedChanges(false);
      return;
    }

    const activeGroup = groups.find((g) => g.id === activeGroupId);
    if (!activeGroup) {
      setHasUnsavedChanges(false);
      return;
    }

    // Normalizing tree helper
    function normalizePaneTree(node: any): any {
      if (!node) return null;
      if (node.type === 'leaf') {
        return {
          type: 'leaf',
          id: node.id,
          activeTabId: node.activeTabId,
          tabs: node.tabs.map((t: any) => ({
            id: t.id,
            path: t.path,
            name: t.name
          }))
        };
      } else if (node.type === 'split') {
        return {
          type: 'split',
          id: node.id,
          direction: node.direction,
          ratio: Math.round(node.ratio * 100) / 100,
          children: [
            normalizePaneTree(node.children[0]),
            normalizePaneTree(node.children[1])
          ]
        };
      }
      return null;
    }

    const currentNorm = JSON.stringify(normalizePaneTree(paneTree));
    const savedNorm = JSON.stringify(normalizePaneTree(activeGroup.layout_state?.paneTree));

    const structChanged =
      currentNorm !== savedNorm ||
      activeTabId !== activeGroup.layout_state?.activeTabId ||
      focusedLeafId !== activeGroup.layout_state?.focusedLeafId;

    if (activeGroup.auto_save_enabled) {
      if (structChanged) {
        // Auto-save: debounce saving to prevent DB spam
        const saveTimer = setTimeout(() => {
          const currentScrolls: Record<string, number> = {};
          const currentCursors: Record<string, number> = {};
          const currentViewModes: Record<string, string> = {};

          const allOpenTabs = collectAllTabs(paneTree);
          for (const tab of allOpenTabs) {
            const cached = scrollCursorCacheRef.current[tab.path];
            if (cached) {
              if (cached.scroll !== undefined) currentScrolls[tab.path] = cached.scroll;
              if (cached.cursor !== undefined) currentCursors[tab.path] = cached.cursor;
              if (cached.viewMode !== undefined) currentViewModes[tab.path] = cached.viewMode;
            }
          }

          const updatedGroup: LocalGroup = {
            ...activeGroup,
            updated_at: new Date().toISOString(),
            layout_state: {
              paneTree,
              activeTabId,
              focusedLeafId,
              scrollPositions: currentScrolls,
              cursorPositions: currentCursors,
              viewModes: currentViewModes,
            },
          };

          localDB.putGroup(updatedGroup)
            .then(() => {
              setGroups((prev) =>
                prev.map((g) => (g.id === activeGroupId ? updatedGroup : g))
              );
              setHasUnsavedChanges(false);
            })
            .catch((err) => console.error("Auto-save group failed:", err));
        }, 1500);

        return () => clearTimeout(saveTimer);
      }
    } else {
      setHasUnsavedChanges(structChanged);
    }
  }, [paneTree, activeTabId, focusedLeafId, activeGroupId, groups]);

  // Sync flat tabs -> pane tree (bridge legacy state to new split system)
  const skipTabSyncRef = useRef<boolean>(false);
  const prevTabsRef = useRef<Tab[]>([]);
  useEffect(() => {
    if (skipTabSyncRef.current) {
      skipTabSyncRef.current = false;
      prevTabsRef.current = tabs;
      return;
    }
    const prevTabs = prevTabsRef.current;
    prevTabsRef.current = tabs;

    // Find tabs that were added
    const prevIds = new Set(prevTabs.map((t) => t.id));
    let addedTabs = tabs.filter((t) => !prevIds.has(t.id));

    if (activeGroupId) {
      addedTabs = addedTabs.filter((t) => t.groupId === activeGroupId);
    } else {
      addedTabs = addedTabs.filter((t) => !t.groupId || !groups.some(g => g.id === t.groupId));
    }

    // Find tabs that were removed
    const currentIds = new Set(tabs.map((t) => t.id));
    const removedIds = prevTabs.filter((t) => !currentIds.has(t.id)).map((t) => t.id);

    if (addedTabs.length === 0 && removedIds.length === 0) return;

    setPaneTree((prev) => {
      let tree = prev;

      // Remove tabs that were closed
      for (const id of removedIds) {
        const result = removeTabFromTree(tree, id);
        if (!result) {
          tree = createLeaf([]);
          setFocusedLeafId(tree.id);
          return tree;
        }
        tree = result;
      }

      // Add new tabs to the focused leaf
      for (const tab of addedTabs) {
        if (!findLeafWithTab(tree, tab.id)) {
          const targetLeaf = findLeafById(tree, focusedLeafId) || findFirstLeaf(tree);
          tree = insertTabIntoLeaf(tree, targetLeaf.id, tab);
        }
      }

      return tree;
    });
  }, [tabs, focusedLeafId, activeGroupId, groups]);

  // Sync activeTabId -> focused leaf's activeTabId
  useEffect(() => {
    if (!activeTabId) return;
    setPaneTree((prev) => {
      // Find which leaf has this tab and make it active there
      const leaf = findLeafWithTab(prev, activeTabId);
      if (!leaf) return prev;
      if (leaf.activeTabId === activeTabId) return prev;
      return setActiveTabInLeaf(prev, leaf.id, activeTabId);
    });
  }, [activeTabId]);

  // Pane tree change handler (when user drags tabs between panes)
  const handlePaneTreeChange = useCallback((newTree: PaneNode) => {
    setPaneTree(newTree);
    // Sync the flat tabs list from the pane tree
    const allTabs = collectAllTabs(newTree);
    setTabs(allTabs);

    // Sync plugin sides — if a plugin is now in the main pane tree, set its side to 'main'
    const app = ooAppRef.current;
    if (app) {
      let changed = false;
      allTabs.forEach(t => {
        if (t.path.startsWith('__plugin__.')) {
          const viewType = t.path.replace('__plugin__.', '');
          const leaves = app.workspace.getLeavesOfType(viewType);
          leaves.forEach(l => {
            if (l.side !== 'main') {
              l.side = 'main';
              changed = true;
            }
          });
        }
      });
      if (changed) app.workspace.trigger('plugin-views-changed');
    }
  }, []);

  // Handle tab selection within a specific leaf pane
  const handlePaneTabSelect = useCallback(async (leafId: string, tabId: string) => {
    setFocusedLeafId(leafId);
    setActiveTabId(tabId);
    // Load content for the selected tab
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      if (tab.path === "__new_tab__" || tab.path === GRAPH_TAB_PATH || tab.path === SPACES_TAB_PATH || tab.path.startsWith('__plugin__.')) {
        setCurrentContent("");
        setBacklinks([]);
        return;
      }
      if (isCanvasFile(tab.path)) {
        setCanvasFilePath(tab.path);
        setCurrentContent("");
        setBacklinks([]);
        return;
      }
      try {
        const content = await api.readFile(tab.path);
        setCurrentContent(content);
        loadBacklinks(tab.path);
      } catch {
        // File may not exist
      }
    }
  }, [tabs, api]);

  // Handle focus change to a leaf pane
  const handleFocusLeaf = useCallback((leafId: string) => {
    setFocusedLeafId(leafId);
    // Set the active tab to the focused leaf's active tab
    setPaneTree((prev) => {
      const leaf = findLeafById(prev, leafId);
      if (leaf && leaf.activeTabId) {
        setActiveTabId(leaf.activeTabId);
      }
      return prev;
    });
  }, []);

  const adjustEditorFontSize = useCallback(
    (delta: number, scope: FontZoomScope = "both") => {
      if (delta === 0) return;

      setSettings((prev) => {
        const clampFontSize = (value: number) =>
          Math.max(MIN_EDITOR_FONT_SIZE, Math.min(MAX_EDITOR_FONT_SIZE, value));

        const currentEditorSize = prev.editorFontSize ?? prev.fontSize;
        const currentPreviewSize = prev.previewFontSize ?? prev.fontSize;

        const nextEditorSize =
          scope === "both" || scope === "editor"
            ? clampFontSize(currentEditorSize + delta)
            : currentEditorSize;
        const nextPreviewSize =
          scope === "both" || scope === "preview"
            ? clampFontSize(currentPreviewSize + delta)
            : currentPreviewSize;
        const nextFontSize =
          scope === "both"
            ? clampFontSize(prev.fontSize + delta)
            : prev.fontSize;

        if (
          nextEditorSize === currentEditorSize &&
          nextPreviewSize === currentPreviewSize &&
          nextFontSize === prev.fontSize
        ) {
          return prev;
        }

        return {
          ...prev,
          fontSize: nextFontSize,
          editorFontSize: nextEditorSize,
          previewFontSize: nextPreviewSize,
        };
      });
    },
    [],
  );

  // ── Modal State ─────────────────────────────────────
  const [modal, setModal] = useState<{
    type: "prompt" | "confirm";
    title: string;
    message: string;
    defaultValue?: string;
    onConfirm?: (result: string | boolean) => void;
  } | null>(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
  }, []);

  // Track system color scheme for 'system' theme option
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // ── Initial Vault Load ──────────────────────────────
  useEffect(() => {
    const checkInitialVault = async () => {
      try {
        const path = await api.getVaultPath();
        if (path) {
          setVaultPath(path);
          (window as any).__oo_vault_path = path;
          setShowSidebar(true);
          const tree = await api.getFileTree();
          setFileTree(tree);
          // Initializing background services for the auto-loaded vault
          runVaultInit(tree);
          
          try {
            const workspaceData = await readData<{ paneTree: PaneNode; activeTabId: string | null; focusedLeafId: string }>("workspace.json");
            if (workspaceData && workspaceData.paneTree) {
              setPaneTree(workspaceData.paneTree);
              setTabs(collectAllTabs(workspaceData.paneTree));
              if (workspaceData.activeTabId) setActiveTabId(workspaceData.activeTabId);
              if (workspaceData.focusedLeafId) setFocusedLeafId(workspaceData.focusedLeafId);
            } else {
              handleOpenNewTab();
            }
          } catch (err) {
            handleOpenNewTab();
          }
        }

        try {
          const previous = await api.getPreviouslyOpenedVaults();
          setPreviouslyOpenedVaults(previous || []);
        } catch (prevErr) {
          console.warn("Failed to load previously opened vaults:", prevErr);
        }
      } catch (err) {
        console.error("Failed to auto-load vault:", err);
      }
    };
    void checkInitialVault();
  }, []);

  // ── Workspace State Persistence ─────────────────────
  useEffect(() => {
    if (!vaultPath) return;

    const saveTimer = setTimeout(() => {
      writeData("workspace.json", {
        paneTree,
        activeTabId,
        focusedLeafId,
      }).catch((err) => console.error("Failed to save workspace:", err));
    }, 1000);

    return () => clearTimeout(saveTimer);
  }, [paneTree, activeTabId, focusedLeafId, vaultPath]);

  // Derive theme from settings (handles 'system' preference)
  const theme: Theme =
    settings.theme === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : settings.theme;

  // Apply settings (theme, colors, fonts, etc.)
  useEffect(() => {
    // Apply theme
    document.documentElement.setAttribute("data-theme", theme);
    
    // Determine and apply base theme mode (dark/light) for embeds and components
    const isDark = isDarkTheme(theme, settings);
    document.documentElement.setAttribute("data-theme-mode", isDark ? "dark" : "light");

    // Apply CSS custom properties from settings
    const root = document.documentElement;
    root.style.setProperty("--font-family", settings.fontFamily);
    root.style.setProperty("--editor-font-size", `${settings.fontSize}px`);
    root.style.setProperty(
      "--editor-pane-font-size",
      `${settings.editorFontSize ?? settings.fontSize}px`,
    );
    root.style.setProperty(
      "--preview-font-size",
      `${settings.previewFontSize ?? settings.fontSize}px`,
    );
    root.style.setProperty("--editor-line-height", `${settings.lineHeight}`);

    if (theme === "custom") {
      const bg = hexToRgb(settings.customBgPrimary) ?? { r: 21, g: 21, b: 21 };
      const text = hexToRgb(settings.customTextPrimary) ?? { r: 230, g: 230, b: 230 };
      const accent = hexToRgb(settings.accentColor) ?? text;
      const tone = (ratio: number) => rgbToHex(mixRgb(bg, text, ratio));
      const baseBg = rgbToHex(bg);

      root.style.setProperty("--accent-color", settings.accentColor);

      root.style.setProperty("--color-base-00", baseBg);
      root.style.setProperty("--color-base-05", baseBg);
      root.style.setProperty("--color-base-10", baseBg);
      root.style.setProperty("--color-base-20", baseBg);
      root.style.setProperty("--color-base-25", baseBg);
      root.style.setProperty("--color-base-30", baseBg);
      root.style.setProperty("--color-base-35", baseBg);
      root.style.setProperty("--color-base-40", tone(0.16));
      root.style.setProperty("--color-base-50", tone(0.34));
      root.style.setProperty("--color-base-60", tone(0.5));
      root.style.setProperty("--color-base-70", tone(0.68));
      root.style.setProperty("--color-base-100", tone(1));

      root.style.setProperty("--bg-primary", baseBg);
      root.style.setProperty("--bg-secondary", baseBg);
      root.style.setProperty("--bg-tertiary", baseBg);
      root.style.setProperty("--bg-elevated", baseBg);
      root.style.setProperty("--bg-input", baseBg);
      root.style.setProperty("--bg-hover", rgbToRgba(text, 0.08));
      root.style.setProperty("--bg-active", rgbToRgba(text, 0.14));
      root.style.setProperty("--bg-glass", rgbToRgba(bg, 0.98));

      root.style.setProperty("--text-primary", tone(1));
      root.style.setProperty("--text-secondary", tone(0.72));
      root.style.setProperty("--text-tertiary", tone(0.6));
      root.style.setProperty("--text-muted", tone(0.48));
      root.style.setProperty("--text-faint", tone(0.34));
      root.style.setProperty("--text-link", settings.accentColor);

      root.style.setProperty("--color-accent", settings.accentColor);
      root.style.setProperty("--color-accent-1", rgbToHex(mixRgb(accent, text, 0.22)));
      root.style.setProperty("--color-accent-2", rgbToHex(mixRgb(accent, text, 0.42)));
      root.style.setProperty("--accent-primary", settings.accentColor);
      root.style.setProperty("--accent-secondary", rgbToHex(mixRgb(accent, text, 0.22)));
      root.style.setProperty("--text-on-accent", getReadableTextOn(accent));
      root.style.setProperty("--accent-glow", rgbToRgba(accent, 0.16));

      root.style.setProperty("--scrollbar-thumb", rgbToRgba(text, 0.26));
      root.style.setProperty("--scrollbar-thumb-hover", rgbToRgba(text, 0.42));
      root.style.setProperty("--border-subtle", rgbToRgba(text, 0.1));
      root.style.setProperty("--border-medium", rgbToRgba(text, 0.16));
      root.style.setProperty("--border-strong", rgbToRgba(text, 0.24));
      root.style.setProperty("--divider-color", rgbToRgba(text, 0.1));

      root.style.setProperty("--titlebar-background", baseBg);
      root.style.setProperty("--titlebar-background-focused", baseBg);
      root.style.setProperty("--titlebar-text-color", tone(0.72));
      root.style.setProperty("--titlebar-text-color-focused", tone(1));
      root.style.setProperty("--status-bar-background", baseBg);
      root.style.setProperty("--status-bar-text-color", tone(0.48));

      root.style.setProperty("--tab-container-background", baseBg);
      root.style.setProperty("--tab-background-active", baseBg);
      root.style.setProperty("--tab-text-color", tone(0.48));
      root.style.setProperty("--tab-text-color-active", tone(0.72));
      root.style.setProperty("--tab-text-color-focused", tone(0.72));
      root.style.setProperty("--tab-text-color-focused-active", tone(0.72));
      root.style.setProperty("--tab-text-color-focused-active-current", tone(1));

      root.style.setProperty("--nav-item-color", tone(0.72));
      root.style.setProperty("--nav-item-color-hover", tone(1));
      root.style.setProperty("--nav-item-color-active", tone(1));
      root.style.setProperty("--nav-item-color-selected", tone(1));
      root.style.setProperty("--nav-item-background-hover", rgbToRgba(text, 0.08));
      root.style.setProperty("--nav-item-background-active", rgbToRgba(text, 0.1));
      root.style.setProperty("--nav-item-background-selected", rgbToRgba(text, 0.12));

      root.style.setProperty("--editor-caret", tone(1));
      root.style.setProperty("--editor-selection", rgbToRgba(accent, 0.2));
      root.style.setProperty("--editor-selection-focused", rgbToRgba(accent, 0.3));
      root.style.setProperty("--editor-active-line", rgbToRgba(text, 0.04));
      root.style.setProperty("--editor-active-line-border", rgbToRgba(text, 0.1));
      root.style.setProperty("--editor-heading", tone(1));
      root.style.setProperty("--editor-heading-marker", tone(0.6));
      root.style.setProperty("--editor-link", settings.accentColor);
      root.style.setProperty("--editor-link-hover", rgbToHex(mixRgb(accent, text, 0.2)));
      root.style.setProperty("--editor-tag", settings.accentColor);
      root.style.setProperty("--editor-tag-bg", rgbToRgba(accent, 0.18));
      root.style.setProperty("--editor-code", tone(0.66));
      root.style.setProperty("--editor-muted-token", tone(0.5));
      root.style.setProperty("--editor-emphasis", tone(1));
      root.style.setProperty("--editor-search-match", rgbToRgba(accent, 0.24));
      root.style.setProperty("--editor-search-match-border", rgbToRgba(accent, 0.45));
      root.style.setProperty("--editor-search-active", rgbToRgba(accent, 0.34));
      root.style.setProperty("--editor-search-active-border", rgbToRgba(accent, 0.72));

      root.style.setProperty("--graph-edge-color", rgbToRgba(text, 0.35));
      root.style.setProperty("--graph-node-color", settings.accentColor);
    } else {
      for (const variableName of CUSTOM_THEME_VARIABLES) {
        root.style.removeProperty(variableName);
      }
    }

    // Save settings to localStorage
    localStorage.setItem("openobsidian-settings", JSON.stringify(settings));
  }, [settings, theme]);

  useEffect(() => {
    if (settings.vimMode) {
      initGlobalKeybindings();
      setGlobalKeybindingsEnabled(true);
    } else {
      setGlobalKeybindingsEnabled(false);
    }

    window.dispatchEvent(
      new CustomEvent("oo:vim-setting-change", {
        detail: { enabled: settings.vimMode },
      }),
    );
  }, [settings.vimMode]);

  // ── Queue status listener ───────────────────────────
  useEffect(() => {
    setQueueStatusCallback((status) => setQueueStatus(status));
    return () => setQueueStatusCallback(null);
  }, []);

  useEffect(() => {
    saveFTUXState(ftuxState);
  }, [ftuxState]);

  useEffect(() => {
    saveFTUXNotNowSuppression(notNowSuppressedUntilNotes);
  }, [notNowSuppressedUntilNotes]);

  useEffect(() => {
    return () => {
      if (firstThoughtPromptIntervalRef.current) {
        clearTimeout(firstThoughtPromptIntervalRef.current);
      }
      if (firstThoughtPromptFadeTimerRef.current) {
        clearTimeout(firstThoughtPromptFadeTimerRef.current);
      }
      if (firstThoughtEntryPromptTimerRef.current) {
        clearTimeout(firstThoughtEntryPromptTimerRef.current);
      }
      if (firstThoughtEntryGhostTimerRef.current) {
        clearTimeout(firstThoughtEntryGhostTimerRef.current);
      }
      if (firstThoughtEntryHintTimerRef.current) {
        clearTimeout(firstThoughtEntryHintTimerRef.current);
      }
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
      }
      if (ftuxIdleTimerRef.current) {
        clearTimeout(ftuxIdleTimerRef.current);
      }
      if (ftuxPulseTimerRef.current) {
        clearTimeout(ftuxPulseTimerRef.current);
      }
      if (vaultEntryTransitionTimerRef.current) {
        clearTimeout(vaultEntryTransitionTimerRef.current);
      }
      if (vaultEntryCalmTimerRef.current) {
        clearTimeout(vaultEntryCalmTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (vaultEntryTransitionPhase !== "transitioning") {
      return;
    }

    if (vaultPath && ftuxState.notesCount === 0) {
      setVaultEntryTransitionPhase("entered");
      return;
    }

    if (vaultPath && ftuxState.notesCount > 0) {
      setVaultEntryTransitionPhase("idle");
    }
  }, [ftuxState.notesCount, vaultEntryTransitionPhase, vaultPath]);

  useEffect(() => {
    if (vaultEntryTransitionPhase === "idle") {
      setIsVaultEntryCalmReady(true);
      if (vaultEntryTransitionTimerRef.current) {
        clearTimeout(vaultEntryTransitionTimerRef.current);
        vaultEntryTransitionTimerRef.current = null;
      }
      if (vaultEntryCalmTimerRef.current) {
        clearTimeout(vaultEntryCalmTimerRef.current);
        vaultEntryCalmTimerRef.current = null;
      }
      return;
    }

    setIsVaultEntryCalmReady(false);

    if (vaultEntryTransitionPhase === "entered") {
      if (vaultEntryTransitionTimerRef.current) {
        clearTimeout(vaultEntryTransitionTimerRef.current);
      }
      vaultEntryTransitionTimerRef.current = setTimeout(() => {
        setVaultEntryTransitionPhase("idle");
        vaultEntryTransitionTimerRef.current = null;
      }, 420);

      if (vaultEntryCalmTimerRef.current) {
        clearTimeout(vaultEntryCalmTimerRef.current);
      }
      vaultEntryCalmTimerRef.current = setTimeout(() => {
        setIsVaultEntryCalmReady(true);
        vaultEntryCalmTimerRef.current = null;
      }, 150);
    }

    return () => {
      if (vaultEntryTransitionTimerRef.current) {
        clearTimeout(vaultEntryTransitionTimerRef.current);
        vaultEntryTransitionTimerRef.current = null;
      }
      if (vaultEntryCalmTimerRef.current) {
        clearTimeout(vaultEntryCalmTimerRef.current);
        vaultEntryCalmTimerRef.current = null;
      }
    };
  }, [vaultEntryTransitionPhase]);

  useEffect(() => {
    if (vaultEntryTransitionPhase !== "entered") {
      return;
    }
    if (!(vaultPath !== null && ftuxState.notesCount === 0)) {
      return;
    }

    const focusTimer = setTimeout(() => {
      firstThoughtInputRef.current?.focus();
    }, 80);

    return () => clearTimeout(focusTimer);
  }, [ftuxState.notesCount, vaultPath, vaultEntryTransitionPhase]);

  // Keep the active tab visible when tabs overflow horizontally.
  useEffect(() => {
    const scroller = tabScrollRef.current;
    if (!scroller || !activeTabId) return;

    const activeEl = Array.from(
      scroller.querySelectorAll<HTMLElement>(".titlebar-tab, .editor-tab"),
    ).find((el) => el.dataset.tabId === activeTabId);

    if (!activeEl) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();
    const isOutOfView =
      tabRect.left < scrollerRect.left || tabRect.right > scrollerRect.right;

    if (isOutOfView) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTabId, tabs]);



  useEffect(() => {
    const isZeroState = vaultPath !== null && ftuxState.notesCount === 0;
    const shouldPausePromptRotation =
      isFirstThoughtFocused || hasFirstThoughtKeystroke;

    const clearPromptTimers = () => {
      if (firstThoughtPromptIntervalRef.current) {
        clearTimeout(firstThoughtPromptIntervalRef.current);
        firstThoughtPromptIntervalRef.current = null;
      }
      if (firstThoughtPromptFadeTimerRef.current) {
        clearTimeout(firstThoughtPromptFadeTimerRef.current);
        firstThoughtPromptFadeTimerRef.current = null;
      }
    };

    if (!isZeroState || shouldPausePromptRotation || !isVaultEntryCalmReady) {
      clearPromptTimers();
      setFirstThoughtPromptCrossfading(false);
      setFirstThoughtPromptNextIndex(null);
      return;
    }

    const cycleDelayMs = randomInt(2200, 2800);
    firstThoughtPromptIntervalRef.current = setTimeout(() => {
      const fadeMs = randomInt(180, 260);
      const overlapRatio = randomInt(62, 72) / 100;
      const overlapDelayMs = Math.max(40, Math.round(fadeMs * overlapRatio));
      const nextIndex =
        (firstThoughtPromptIndex + 1) % FIRST_THOUGHT_PROMPTS.length;

      setFirstThoughtPromptFadeMs(fadeMs);
      setFirstThoughtPromptOverlapDelayMs(overlapDelayMs);
      setFirstThoughtPromptNextIndex(nextIndex);
      setFirstThoughtPromptCrossfading(true);

      if (firstThoughtPromptFadeTimerRef.current) {
        clearTimeout(firstThoughtPromptFadeTimerRef.current);
      }
      firstThoughtPromptFadeTimerRef.current = setTimeout(() => {
        setFirstThoughtPromptIndex(nextIndex);
        setFirstThoughtPromptNextIndex(null);
        setFirstThoughtPromptCrossfading(false);
        firstThoughtPromptFadeTimerRef.current = null;
      }, fadeMs + overlapDelayMs);
    }, cycleDelayMs);

    return () => {
      clearPromptTimers();
    };
  }, [
    firstThoughtPromptIndex,
    ftuxState.notesCount,
    hasFirstThoughtKeystroke,
    isVaultEntryCalmReady,
    isFirstThoughtFocused,
    vaultPath,
  ]);

  useEffect(() => {
    const isZeroState = vaultPath !== null && ftuxState.notesCount === 0;

    if (!isZeroState || !isVaultEntryCalmReady) {
      setShowFirstThoughtPromptEntry(false);
      setShowFirstThoughtGhostEntry(false);
      setShowFirstThoughtHintEntry(false);
      setFirstThoughtExpansionPlan(null);
      setShowFirstThoughtExpansionHint(false);
      setShownFirstThoughtExpansionDraftKey(null);
      setDismissedFirstThoughtExpansionDraftKey(null);
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
        firstThoughtExpansionTimerRef.current = null;
      }
      return;
    }

    setShowFirstThoughtPromptEntry(false);
    setShowFirstThoughtGhostEntry(false);
    setShowFirstThoughtHintEntry(false);
    setFirstThoughtExpansionPlan(null);
    setShowFirstThoughtExpansionHint(false);
    setShownFirstThoughtExpansionDraftKey(null);
    setDismissedFirstThoughtExpansionDraftKey(null);

    const promptDelayMs = vaultEntryTransitionPhase === "entered" ? 0 : 120;
    const ghostDelayMs = vaultEntryTransitionPhase === "entered" ? 180 : 250;
    const hintDelayMs = vaultEntryTransitionPhase === "entered" ? 260 : 350;

    firstThoughtEntryPromptTimerRef.current = setTimeout(() => {
      setShowFirstThoughtPromptEntry(true);
    }, promptDelayMs);
    firstThoughtEntryGhostTimerRef.current = setTimeout(() => {
      setShowFirstThoughtGhostEntry(true);
    }, ghostDelayMs);
    firstThoughtEntryHintTimerRef.current = setTimeout(() => {
      setShowFirstThoughtHintEntry(true);
    }, hintDelayMs);

    return () => {
      if (firstThoughtEntryPromptTimerRef.current) {
        clearTimeout(firstThoughtEntryPromptTimerRef.current);
        firstThoughtEntryPromptTimerRef.current = null;
      }
      if (firstThoughtEntryGhostTimerRef.current) {
        clearTimeout(firstThoughtEntryGhostTimerRef.current);
        firstThoughtEntryGhostTimerRef.current = null;
      }
      if (firstThoughtEntryHintTimerRef.current) {
        clearTimeout(firstThoughtEntryHintTimerRef.current);
        firstThoughtEntryHintTimerRef.current = null;
      }
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
        firstThoughtExpansionTimerRef.current = null;
      }
    };
  }, [
    ftuxState.notesCount,
    isVaultEntryCalmReady,
    vaultEntryTransitionPhase,
    vaultPath,
  ]);

  useEffect(() => {
    const element = firstThoughtInputRef.current;
    if (!element) return;

    element.style.height = "auto";
    element.style.height = `${Math.max(96, element.scrollHeight)}px`;
  }, [firstThoughtDraft]);

  useEffect(() => {
    const isZeroState = vaultPath !== null && ftuxState.notesCount === 0;

    if (!isZeroState || !isVaultEntryCalmReady) {
      setFirstThoughtExpansionPlan(null);
      setShowFirstThoughtExpansionHint(false);
      setShownFirstThoughtExpansionDraftKey(null);
      setDismissedFirstThoughtExpansionDraftKey(null);
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
        firstThoughtExpansionTimerRef.current = null;
      }
      return;
    }

    const trimmedDraft = firstThoughtDraft.trim();
    const draftKey = normalizeFirstThoughtDraft(firstThoughtDraft);

    if (!trimmedDraft) {
      setFirstThoughtExpansionPlan(null);
      setShowFirstThoughtExpansionHint(false);
      setShownFirstThoughtExpansionDraftKey(null);
      setDismissedFirstThoughtExpansionDraftKey(null);
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
        firstThoughtExpansionTimerRef.current = null;
      }
      return;
    }

    const immediatePlan = getFirstThoughtExpansionPlan(firstThoughtDraft);
    if (!immediatePlan) {
      setFirstThoughtExpansionPlan(null);
      setShowFirstThoughtExpansionHint(false);
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
        firstThoughtExpansionTimerRef.current = null;
      }
      return;
    }

    if (dismissedFirstThoughtExpansionDraftKey === draftKey) {
      setShowFirstThoughtExpansionHint(false);
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
        firstThoughtExpansionTimerRef.current = null;
      }
      return;
    }

    if (shownFirstThoughtExpansionDraftKey === draftKey) {
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
        firstThoughtExpansionTimerRef.current = null;
      }
      return;
    }

    if (firstThoughtExpansionTimerRef.current) {
      clearTimeout(firstThoughtExpansionTimerRef.current);
    }

    firstThoughtExpansionTimerRef.current = setTimeout(async () => {
      const draft = firstThoughtDraft;
      if (dismissedFirstThoughtExpansionDraftKey === normalizeFirstThoughtDraft(draft)) {
        setShowFirstThoughtExpansionHint(false);
        return;
      }
      
      const llmPlan = await generateFirstThoughtExpansion(draft);
      let mappedPlan: FirstThoughtExpansionPlan | null = null;

      if (llmPlan && llmPlan.continuations && llmPlan.continuations.length === 3) {
        mappedPlan = {
          intent: "goal",
          suggestions: llmPlan.continuations.map((c) => ({
            label: c.text,
            template: c.structure,
          })) as [FirstThoughtTemplate, FirstThoughtTemplate, FirstThoughtTemplate],
        };
      } else {
        mappedPlan = getFirstThoughtExpansionPlan(draft);
      }

      const validPlan = mappedPlan;

      if (validPlan && validPlan.suggestions && validPlan.suggestions.length > 0) {
        setFirstThoughtExpansionPlan(validPlan);
        setSelectedSuggestionIndex(0);
        setShowFirstThoughtExpansionHint(true);
        setShownFirstThoughtExpansionDraftKey(
          normalizeFirstThoughtDraft(draft),
        );
      } else {
        setShowFirstThoughtExpansionHint(false);
      }
      firstThoughtExpansionTimerRef.current = null;
    }, FIRST_THOUGHT_EXPANSION_IDLE_MS);

    return () => {
      if (firstThoughtExpansionTimerRef.current) {
        clearTimeout(firstThoughtExpansionTimerRef.current);
        firstThoughtExpansionTimerRef.current = null;
      }
    };
  }, [
    firstThoughtDraft,
    shownFirstThoughtExpansionDraftKey,
    dismissedFirstThoughtExpansionDraftKey,
    ftuxState.notesCount,
    isVaultEntryCalmReady,
    vaultPath,
  ]);

  // Helper: collect all .md metadata from file tree without reading content
  const collectAllMdMetadata = useCallback((entries: FileEntry[]): Array<{ path: string; modifiedAt: number; size: number }> => {
    const result: Array<{ path: string; modifiedAt: number; size: number }> = [];
    for (const entry of entries) {
      if (entry.isDirectory && entry.children) {
        result.push(...collectAllMdMetadata(entry.children));
      } else if (!entry.isDirectory && entry.name.endsWith(".md")) {
        result.push({
          path: entry.path,
          modifiedAt: entry.modifiedAt,
          size: entry.size,
        });
      }
    }
    return result;
  }, []);

  // Helper: run vault initialization (scan + enqueue missing embeddings)
  const runVaultInit = useCallback(async (tree: FileEntry[]) => {
    const mdNotes = collectAllMdMetadata(tree);
    if (mdNotes.length === 0) return;

    // Get current active note and recent files for priority
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const activePath = activeTab?.path || null;

    initializeVault(mdNotes, activePath, recentFiles, api);
  }, [collectAllMdMetadata, tabs, activeTabId, recentFiles]);

  const initializeRef = useRef(false);

  // ── Sync global window property for plugin compatibility ─────
  useEffect(() => {
    (window as any).__oo_vault_path = vaultPath;
  }, [vaultPath]);

  // ── Reset Caches and Queue on Vault Path Change ─────
  useEffect(() => {
    if (!vaultPath) return;

    resetQueueState();
    resetEmbeddingsStore();
    clearSpacesCache();
    resetSynthesisCache();
  }, [vaultPath]);

  // ── Initialize Core Systems ────────────────────────
  useEffect(() => {
    const init = async () => {
      // Always initialize plugin system (needed for marketplace even without vault)
      if (!pluginManagerRef.current && !initializeRef.current) {
        initializeRef.current = true;
        try {
          const ooApp = new OOApp();
          ooAppRef.current = ooApp;
          
          const pm = new PluginManager(ooApp, {
            onCommandsChanged: setPluginCommands,
            onRibbonChanged: setPluginRibbonActions,
            onStatusBarChanged: setPluginStatusBarItems,
            onSettingTabsChanged: setPluginSettingTabs,
            onPluginsChanged: setPluginList,
            onPermissionRequired: (manifest, permissions) => {
              return new Promise<boolean>((resolve) => {
                setPermissionModalData({ manifest, permissions, resolve });
              });
            },
          });
          pluginManagerRef.current = pm;

          // Wire up file navigation from plugins
          (window as any).__oo_open_file = (path: string) => {
            openFile(path);
          };

          // Listen for plugin view changes from workspace
          ooApp.workspace.on('plugin-views-changed', () => {
            const views = ooApp.workspace.getActivePluginViews();
            setPluginViews(views.map(v => ({
              viewType: v.viewType,
              displayText: v.displayText,
              icon: v.icon,
              containerEl: v.containerEl,
              side: v.side,
              pluginId: v.pluginId,
            })));

            // Sync main plugin views to tabs
            const mainViews = views.filter(v => v.side === 'main');
            setTabs((prev) => {
              let updated = [...prev];
              let changed = false;
              mainViews.forEach(v => {
                const path = `__plugin__.${v.viewType}`;
                if (!updated.find(t => t.path === path)) {
                  const id = Math.random().toString(36).substr(2, 9);
                  updated.push({
                    id,
                    path,
                    name: v.displayText || v.viewType,
                    isModified: false,
                  });
                  changed = true;
                  setTimeout(() => setActiveTabId(id), 0);
                }
              });
              const currentMainPaths = mainViews.map(v => `__plugin__.${v.viewType}`);
              updated = updated.filter(t => !t.path.startsWith('__plugin__.') || currentMainPaths.includes(t.path));
              if (updated.length !== prev.length) changed = true;
              return changed ? updated : prev;
            });
          });

          console.log('[PluginSystem] Plugin manager initialized');
        } catch (pluginErr) {
          console.warn('[PluginSystem] Initialization failed:', pluginErr);
        }
      }

      // Check for saved vault path on startup
      try {
        const savedPath = await api.getVaultPath();
        if (savedPath) {
          // Re-affirm vault path to main process to ensure CWD is set correctly on startup
          await api.setVaultPath(savedPath);
          setVaultPath(savedPath);
          (window as any).__oo_vault_path = savedPath;
          setShowSidebar(true);
        }
      } catch (e) {
        console.log("No saved vault path on startup");
      }
    };
    init();
  }, []);

  // ── Load Plugins when Vault is Active ────────────────
  useEffect(() => {
    if (!vaultPath) return;

    const loadPlugins = async () => {
      const pm = pluginManagerRef.current;
      const ooApp = ooAppRef.current;
      
      if (pm && ooApp) {
        try {
          // Initialize ooApp (now that we have a path)
          try {
            await ooApp.initialize();
          } catch (err) {
            console.error('[OOApp] Initialization failed:', err);
          }

          const tree = await api.getFileTree();
          setFileTree(tree);
          // Trigger background vault initialization
          runVaultInit(tree);

          // Discover and load enabled plugins (requires vault)
          try {
            await pm.discoverPlugins();
            await pm.loadEnabledPlugins();
            // Trigger view initialization after all plugins are loaded
            await ooApp.workspace.initializeViews();
            console.log('[PluginSystem] Plugins loaded successfully for vault:', vaultPath);
          } catch (pluginErr) {
            console.warn('[PluginSystem] Plugin loading failed:', pluginErr);
          }
        } catch (err) {
          console.error('[PluginSystem] Error during vault activation:', err);
        }
      }
    };

    loadPlugins();
  }, [vaultPath]);

  // ── Menu Event Handlers ─────────────────────────────
  useEffect(() => {
    const openGraphFromMenu = () => {
      setGraphMode("manual");
      setShowThoughtModel(false);
      setShowCanvas(false);
      setShowGraph(false);
      const existingGraphTab = tabs.find((t) => t.path === GRAPH_TAB_PATH);
      if (existingGraphTab) {
        setActiveTabId(existingGraphTab.id);
        const leaf = findLeafWithTab(paneTree, existingGraphTab.id);
        if (leaf) {
          setFocusedLeafId(leaf.id);
        }
      } else {
        const graphTab: Tab = {
          id: generateId(),
          path: GRAPH_TAB_PATH,
          name: "Graph",
          isModified: false,
        };
        setTabs((prev) => [...prev, graphTab]);
        setActiveTabId(graphTab.id);
      }
      setCurrentContent("");
      setBacklinks([]);
    };

    api.onMenuEvent("menu:open-vault", handleOpenVault);
    api.onMenuEvent("menu:new-note", handleNewNote);
    api.onMenuEvent("menu:save", handleSave);
    api.onMenuEvent("menu:toggle-graph", openGraphFromMenu);
    api.onMenuEvent("menu:command-palette", () => setShowCommandPalette(true));
    api.onMenuEvent("menu:toggle-sidebar", () => setShowSidebar((s) => !s));

    return () => {
      [
        "menu:open-vault",
        "menu:new-note",
        "menu:save",
        "menu:toggle-graph",
        "menu:command-palette",
        "menu:toggle-sidebar",
      ].forEach((ch) => api.removeMenuListener(ch));
    };
  }, [tabs, activeTabId, currentContent]);

  // ── Keyboard Shortcuts ──────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (ctrl && e.key === "p") {
        e.preventDefault();
        setShowCommandPalette(true);
      } else if (ctrl && !shift && e.key.toLowerCase() === "f") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("editor:open-search"));
      } else if (ctrl && shift && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowSearch(true);
      } else if (ctrl && e.key === "n") {
        e.preventDefault();
        handleNewNote();
      } else if (ctrl && e.key.toLowerCase() === "o") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("editor:open-search"));
      } else if (ctrl && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if (ctrl && e.key === "g") {
        e.preventDefault();
        openGraphAsTab();
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void handleToggleCanvas();
      } else if (ctrl && e.key === "b") {
        e.preventDefault();
        setShowSidebar((s) => !s);
      } else if (ctrl && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length <= 1) return;
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex === -1) return;
        
        let nextIndex;
        if (shift) {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else {
          nextIndex = (currentIndex + 1) % tabs.length;
        }
        
        const nextTab = tabs[nextIndex];
        if (nextTab) {
          handleTabSelect(nextTab.id);
        }
      } else if (ctrl && e.key === "w") {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      } else if (e.key === "Escape") {
        setShowSearch(false);
        setShowCommandPalette(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    
    // Listen for custom events
    const handleOpenDatabase = (e: CustomEvent<{path: string}>) => {
      const tabId = `__database__.${e.detail.path}`;
      const existingLeaf = findLeafWithTab(paneTree, tabId);
      if (existingLeaf) {
        setFocusedLeafId(existingLeaf.id);
        setActiveTabId(tabId);
        setPaneTree((prev) => setActiveTabInLeaf(prev, existingLeaf.id, tabId));
        return;
      }

      const newTab: Tab = {
        id: tabId,
        name: `DB: ${getNoteName(e.detail.path)}`,
        path: tabId,
        isModified: false,
      };

      setPaneTree(prev => {
        // Find leaf to insert into
        const leaf = findLeafWithTab(prev, activeTabId || "") || findFirstLeaf(prev);
        if (leaf) {
          const newTree = insertTabIntoLeaf(prev, leaf.id, newTab);
          return setActiveTabInLeaf(newTree, leaf.id, tabId);
        }
        return prev;
      });
      setActiveTabId(tabId);
    };
    
    window.addEventListener('oo:open-database', handleOpenDatabase as EventListener);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener('oo:open-database', handleOpenDatabase as EventListener);
    };
  }, [activeTabId, tabs, currentContent, paneTree]);

  const loadVaultData = async (path: string) => {
    await api.setVaultPath(path);
    setVaultPath(path);
    (window as any).__oo_vault_path = path;
    setShowSidebar(true);
    const tree = await api.getFileTree();
    setFileTree(tree);
    // Trigger background vault initialization for new vault
    runVaultInit(tree);
    
    try {
      const workspaceData = await readData<{ paneTree: PaneNode; activeTabId: string | null; focusedLeafId: string }>("workspace.json");
      if (workspaceData && workspaceData.paneTree) {
        setPaneTree(workspaceData.paneTree);
        setTabs(collectAllTabs(workspaceData.paneTree));
        if (workspaceData.activeTabId) setActiveTabId(workspaceData.activeTabId);
        if (workspaceData.focusedLeafId) setFocusedLeafId(workspaceData.focusedLeafId);
      } else {
        handleOpenNewTab();
      }
    } catch (err) {
      handleOpenNewTab();
    }

    try {
      const previous = await api.getPreviouslyOpenedVaults();
      setPreviouslyOpenedVaults(previous || []);
    } catch (prevErr) {
      console.warn("Failed to load previously opened vaults:", prevErr);
    }
  };

  const handleOpenVault = async (): Promise<boolean> => {
    try {
      const path = await api.openVaultDialog();
      if (path) {
        await loadVaultData(path);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Failed to open vault:", e);
      alert("Failed to open vault. It may be too large or inaccessible.");
      return false;
    }
  };

  const handleSwitchVault = async (path: string): Promise<boolean> => {
    try {
      await loadVaultData(path);
      return true;
    } catch (e) {
      console.error("Failed to switch vault:", e);
      alert("Failed to switch vault. It may be too large or inaccessible.");
      return false;
    }
  };

  const handleWelcomeVaultAction = useCallback(
    async (_action: VaultEntryAction) => {
      if (vaultEntryTransitionPhase !== "idle") return;

      setVaultEntryTransitionPhase("transitioning");
      const opened = await handleOpenVault();
      if (!opened) {
        setVaultEntryTransitionPhase("idle");
      }
    },
    [vaultEntryTransitionPhase, handleOpenVault],
  );

  const refreshFileTree = async () => {
    try {
      const tree = await api.getFileTree();
      setFileTree(tree);
    } catch (e) {
      console.error("Failed to refresh file tree:", e);
    }
  };

  const promptForInput = useCallback(
    (
      title: string,
      message: string,
      defaultValue = "",
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        setModal({
          type: "prompt",
          title,
          message,
          defaultValue,
          onConfirm: (result) => {
            if (typeof result !== "string") {
              resolve(null);
              return;
            }
            const trimmed = result.trim();
            resolve(trimmed ? trimmed : null);
          },
        });
      });
    },
    [],
  );

  const getUniqueCanvasPath = useCallback(
    async (requestedName: string): Promise<string> => {
      const safeBase =
        requestedName.replace(/[\\/:*?"<>|]/g, "-").trim() || "Untitled canvas";
      const canonical = isCanvasFile(safeBase)
        ? safeBase
        : `${safeBase}.canvas`;
      const stem = canonical.replace(/\.canvas$/i, "");

      let candidate = canonical;
      let suffix = 2;
      while (await api.fileExists(candidate)) {
        candidate = `${stem} ${suffix}.canvas`;
        suffix += 1;
      }
      return candidate;
    },
    [],
  );

  const createCanvasDocumentWithPrompt = useCallback(
    async (defaultName = "Untitled canvas"): Promise<string | null> => {
      if (!vaultPath) return null;

      const input = await promptForInput(
        "New Canvas",
        "Enter canvas name:",
        defaultName,
      );
      if (!input) return null;

      const filePath = await getUniqueCanvasPath(input);
      const initialCanvas = JSON.stringify({ nodes: [], edges: [] }, null, 2);

      try {
        await api.createFile(filePath, initialCanvas);
        await refreshFileTree();
        return filePath;
      } catch {
        return null;
      }
    },
    [vaultPath, refreshFileTree, promptForInput, getUniqueCanvasPath],
  );

  // ── Layout Groups Operations ─────────────────────────
  const handleOpenCreateGroupModal = () => {
    setGroupModalData({
      type: "create",
      title: "Save Current Layout as Group",
      initialName: "",
      initialColor: "#3b82f6",
    });
  };

  const handleSaveGroupConfirm = async (name: string, color: string, tabId?: string) => {
    if (!vaultPath) return;

    const newGroupId = "group-" + generateId();
    const currentScrolls: Record<string, number> = {};
    const currentCursors: Record<string, number> = {};
    const currentViewModes: Record<string, string> = {};

    const allOpenTabs = collectAllTabs(paneTree);
    for (const tab of allOpenTabs) {
      const cached = scrollCursorCacheRef.current[tab.path];
      if (cached) {
        if (cached.scroll !== undefined) currentScrolls[tab.path] = cached.scroll;
        if (cached.cursor !== undefined) currentCursors[tab.path] = cached.cursor;
        if (cached.viewMode !== undefined) currentViewModes[tab.path] = cached.viewMode;
      }
    }

    const newGroup: LocalGroup = {
      id: newGroupId,
      vault_path: vaultPath,
      name,
      color,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      auto_save_enabled: true,
      layout_state: {
        paneTree,
        activeTabId,
        focusedLeafId,
        scrollPositions: currentScrolls,
        cursorPositions: currentCursors,
        viewModes: currentViewModes,
      },
    };

    try {
      await localDB.putGroup(newGroup);
      setGroups((prev) => [...prev, newGroup]);
      setActiveGroupId(newGroupId);
      setHasUnsavedChanges(false);
      if (tabId) {
        handleAddTabToGroup(tabId, newGroupId);
      }
      showToast(`Created group ${name}`, "success");
    } catch (err) {
      console.error("Failed to save layout group:", err);
    }
  };

  const handleRestoreGroup = useCallback(async (groupId: string, groupOverride?: LocalGroup) => {
    const group = groupOverride || groups.find((g) => g.id === groupId);
    if (!group) return;

    const { layout_state } = group;
    if (!layout_state) return;

    const scrolls = layout_state.scrollPositions || {};
    const cursors = layout_state.cursorPositions || {};
    const viewModes = layout_state.viewModes || {};

    const allPaths = Object.keys({ ...scrolls, ...cursors, ...viewModes });
    for (const path of allPaths) {
      scrollCursorCacheRef.current[path] = {
        scroll: scrolls[path],
        cursor: cursors[path],
        viewMode: viewModes[path] as any,
      };
    }

    // Capture any currently open ungrouped tabs in the active workspace before restoring
    const ungroupedTabsToPreserve = tabs.filter(t => !t.groupId || !groups.some(g => g.id === t.groupId));

    // Clone restored paneTree
    let tree = JSON.parse(JSON.stringify(layout_state.paneTree)) as PaneNode;

    // Prune any legacy ungrouped tabs that might have been saved inside this group's splits tree
    const allTabsInTree = collectAllTabs(tree);
    for (const t of allTabsInTree) {
      if (t.groupId !== groupId) {
        const pruned = removeTabFromTree(tree, t.id);
        if (pruned) {
          tree = pruned;
        }
      }
    }

    skipTabSyncRef.current = true;
    setPaneTree(tree);
    const allRestoredTabs = collectAllTabs(tree);
    const restoredIds = new Set(allRestoredTabs.map(t => t.id));
    const filteredUngroupedTabs = ungroupedTabsToPreserve.filter(t => !restoredIds.has(t.id));
    setTabs([...allRestoredTabs, ...filteredUngroupedTabs]);

    // Focus on the first tab of the restored group
    let targetTabId = layout_state.activeTabId;
    const groupTabs = allRestoredTabs.filter((t) => t.groupId === groupId);
    if (groupTabs.length > 0) {
      targetTabId = groupTabs[0].id;
    }

    if (targetTabId) {
      setActiveTabId(targetTabId);
      const tabObj = allRestoredTabs.find((t) => t.id === targetTabId);
      if (tabObj) {
        if (tabObj.path !== "__new_tab__" && tabObj.path !== GRAPH_TAB_PATH && tabObj.path !== SPACES_TAB_PATH && !tabObj.path.startsWith('__plugin__.')) {
          if (isCanvasFile(tabObj.path)) {
            setCanvasFilePath(tabObj.path);
            setCurrentContent("");
            setBacklinks([]);
          } else {
            try {
              const content = await api.readFile(tabObj.path);
              setCurrentContent(content);
              loadBacklinks(tabObj.path);
            } catch (err) {
              console.error("Failed to load active tab content on restore:", err);
            }
          }
        } else {
          setCurrentContent("");
          setBacklinks([]);
        }
      }
    }

    // Set the focused leaf containing the active tab if possible
    if (targetTabId) {
      const leaf = findLeafWithTab(tree, targetTabId);
      if (leaf) {
        setFocusedLeafId(leaf.id);
      } else if (layout_state.focusedLeafId) {
        setFocusedLeafId(layout_state.focusedLeafId);
      }
    } else if (layout_state.focusedLeafId) {
      setFocusedLeafId(layout_state.focusedLeafId);
    }

    // Expand/uncollapse the group automatically on restore
    setCollapsedGroupIds((prev) => {
      const next = new Set<string>(prev);
      next.delete(groupId);
      return next;
    });

    setActiveGroupId(groupId);
    setHasUnsavedChanges(false);
  }, [groups, tabs, showToast, api]);

  const handleCreateGroupFromPaths = useCallback(async (name: string, color: string, paths: string[]) => {
    if (!vaultPath) return null;

    const newGroupId = "group-" + generateId();
    
    // Construct tabs list
    const groupTabs: Tab[] = paths.map((path) => ({
      id: "tab-" + generateId(),
      path,
      name: getNoteName(path),
      isModified: false,
      groupId: newGroupId,
    }));

    const leafId = "leaf-" + generateId();
    const groupPaneTree: PaneLeaf = {
      type: "leaf",
      id: leafId,
      tabs: groupTabs,
      activeTabId: groupTabs[0]?.id || null,
    };

    const newGroup: LocalGroup = {
      id: newGroupId,
      vault_path: vaultPath,
      name,
      color,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      auto_save_enabled: true,
      layout_state: {
        paneTree: groupPaneTree,
        activeTabId: groupTabs[0]?.id || null,
        focusedLeafId: leafId,
        scrollPositions: {},
        cursorPositions: {},
        viewModes: {},
      },
    };

    try {
      await localDB.putGroup(newGroup);
      setGroups((prev) => [...prev, newGroup]);
      showToast(`Created group ${name} from cluster`, "success");
      return newGroupId;
    } catch (err) {
      console.error("Failed to create group from paths:", err);
      return null;
    }
  }, [vaultPath, generateId, showToast]);

  const handleOpenPathsAsGroup = useCallback(async (paths: string[]) => {
    const name = `Group (${paths.length} notes)`;
    const color = "#3b82f6";
    const newGroupId = await handleCreateGroupFromPaths(name, color, paths);
    if (newGroupId) {
      await handleRestoreGroup(newGroupId);
    }
  }, [handleCreateGroupFromPaths, handleRestoreGroup]);


  const handleUpdateActiveGroup = async (groupId?: string) => {
    const targetGroupId = groupId || activeGroupId;
    if (!targetGroupId) return;
    const group = groups.find((g) => g.id === targetGroupId);
    if (!group) return;

    const currentScrolls: Record<string, number> = {};
    const currentCursors: Record<string, number> = {};
    const currentViewModes: Record<string, string> = {};

    const allOpenTabs = collectAllTabs(paneTree);
    for (const tab of allOpenTabs) {
      const cached = scrollCursorCacheRef.current[tab.path];
      if (cached) {
        if (cached.scroll !== undefined) currentScrolls[tab.path] = cached.scroll;
        if (cached.cursor !== undefined) currentCursors[tab.path] = cached.cursor;
        if (cached.viewMode !== undefined) currentViewModes[tab.path] = cached.viewMode;
      }
    }

    const updatedGroup: LocalGroup = {
      ...group,
      updated_at: new Date().toISOString(),
      layout_state: {
        paneTree,
        activeTabId,
        focusedLeafId,
        scrollPositions: currentScrolls,
        cursorPositions: currentCursors,
        viewModes: currentViewModes,
      },
    };

    try {
      await localDB.putGroup(updatedGroup);
      setGroups((prev) =>
        prev.map((g) => (g.id === targetGroupId ? updatedGroup : g))
      );
      if (targetGroupId === activeGroupId) {
        setHasUnsavedChanges(false);
      }
      showToast(`Saved layout to ${group.name}`, "success");
    } catch (err) {
      console.error("Failed to update active group:", err);
    }
  };

  const handleDiscardChanges = () => {
    if (!activeGroupId) return;
    handleRestoreGroup(activeGroupId);
  };

  const handleRenameGroup = (id: string, name: string) => {
    const group = groups.find((g) => g.id === id);
    if (!group) return;
    setGroupModalData({
      type: "rename",
      groupId: id,
      title: "Rename Layout Group",
      initialName: name,
      initialColor: group.color,
    });
  };

  const handleChangeGroupColor = (id: string, color: string) => {
    const group = groups.find((g) => g.id === id);
    if (!group) return;
    setGroupModalData({
      type: "color",
      groupId: id,
      title: "Change Group Color",
      initialName: group.name,
      initialColor: color,
    });
  };

  const handleDuplicateGroup = async (id: string) => {
    const group = groups.find((g) => g.id === id);
    if (!group) return;

    const dupGroup: LocalGroup = {
      ...group,
      id: "group-" + generateId(),
      name: group.name + " Copy",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await localDB.putGroup(dupGroup);
      setGroups((prev) => [...prev, dupGroup]);
      showToast(`Duplicated group ${group.name}`, "success");
    } catch (err) {
      console.error("Failed to duplicate group:", err);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    setModal({
      type: "confirm",
      title: "Delete Layout Group",
      message: "Are you sure you want to delete this group layout snapshot? This will not delete any note files.",
      onConfirm: async (confirmed) => {
        if (confirmed) {
          try {
            await localDB.deleteGroup(id);
            setGroups((prev) => prev.filter((g) => g.id !== id));
            if (activeGroupId === id) {
              setActiveGroupId(null);
              setHasUnsavedChanges(false);
            }
            showToast("Deleted group", "success");
          } catch (err) {
            console.error("Failed to delete group:", err);
          }
        }
      },
    });
  };

  const handleToggleGroupAutoSave = async (id: string) => {
    const group = groups.find((g) => g.id === id);
    if (!group) return;

    const updatedGroup: LocalGroup = {
      ...group,
      auto_save_enabled: !group.auto_save_enabled,
      updated_at: new Date().toISOString(),
    };

    try {
      await localDB.putGroup(updatedGroup);
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? updatedGroup : g))
      );
      showToast(
        updatedGroup.auto_save_enabled
          ? `Enabled auto-save for ${group.name}`
          : `Disabled auto-save for ${group.name}`,
        "info"
      );
    } catch (err) {
      console.error("Failed to toggle auto save:", err);
    }
  };

  const handleAddTabToGroup = useCallback(async (tabId: string, groupId: string | null) => {
    if (groupId) {
      setCollapsedGroupIds((prev) => {
        if (!prev.has(groupId)) return prev;
        const next = new Set<string>(prev);
        next.delete(groupId);
        return next;
      });
    }

    if (!groupId) {
      const isPartOfLayout = findLeafWithTab(paneTree, tabId);
      if (isPartOfLayout) {
        let updatedTree = removeTabFromTree(paneTree, tabId);
        const hasRemainingTabs = updatedTree && collectAllTabs(updatedTree).length > 0;

        if (!updatedTree) {
          updatedTree = createLeaf([]);
        }

        setPaneTree(updatedTree);
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, groupId: null } : t));

        if (activeTabId === tabId) {
          if (hasRemainingTabs) {
            const remainingGroupTabs = collectAllTabs(updatedTree);
            const focusedLeaf = findLeafById(updatedTree, focusedLeafId) || findFirstLeaf(updatedTree);
            const nextActiveTabId = (focusedLeaf && focusedLeaf.tabs.length > 0)
              ? focusedLeaf.activeTabId || focusedLeaf.tabs[0].id
              : remainingGroupTabs[0].id;

            setActiveTabId(nextActiveTabId);

            const tabObj = remainingGroupTabs.find((t) => t.id === nextActiveTabId);
            if (tabObj) {
              if (tabObj.path !== "__new_tab__" && tabObj.path !== GRAPH_TAB_PATH && tabObj.path !== SPACES_TAB_PATH && !tabObj.path.startsWith('__plugin__.')) {
                try {
                  const content = await api.readFile(tabObj.path);
                  setCurrentContent(content);
                  loadBacklinks(tabObj.path);
                } catch (err) {
                  console.error("Failed to load active tab content on ungroup:", err);
                }
              } else {
                setCurrentContent("");
                setBacklinks([]);
              }
            }
            if (focusedLeaf) {
              setFocusedLeafId(focusedLeaf.id);
            }
          } else {
            setActiveGroupId(null);
            const ungroupedTabs = tabs.map(t => t.id === tabId ? { ...t, groupId: null } : t)
              .filter(t => !t.groupId || !groups.some(g => g.id === t.groupId));

            const newTree: PaneLeaf = {
              type: 'leaf',
              id: generateId(),
              tabs: ungroupedTabs,
              activeTabId: tabId,
            };

            skipTabSyncRef.current = true;
            setPaneTree(newTree);
            setTabs(ungroupedTabs);
            setActiveTabId(tabId);
            setFocusedLeafId(newTree.id);
          }
        }
        return;
      }
    }

    if (groupId && groupId !== activeGroupId) {
      // Shifting a tab into an inactive/collapsed group splits tree
      const group = groups.find((g) => g.id === groupId);
      const tabObj = tabs.find((t) => t.id === tabId);
      
      if (group && tabObj && group.layout_state) {
        const updatedTab: Tab = { ...tabObj, groupId };

        // Clone the group's saved paneTree
        let tree = JSON.parse(JSON.stringify(group.layout_state.paneTree)) as PaneNode;

        // Find the leaf pane inside the group splits
        const restoredFocusedLeafId = group.layout_state.focusedLeafId;
        let targetLeaf = restoredFocusedLeafId ? findLeafById(tree, restoredFocusedLeafId) : null;
        if (!targetLeaf) {
          targetLeaf = findFirstLeaf(tree);
        }

        if (targetLeaf) {
          // Insert the tab into the group splits tree
          tree = insertTabIntoLeaf(tree, targetLeaf.id, updatedTab);
        }

        // Update the group's layout state in IndexedDB and state
        const updatedGroup: LocalGroup = {
          ...group,
          updated_at: new Date().toISOString(),
          layout_state: {
            ...group.layout_state,
            paneTree: tree,
            activeTabId: tabId, // Focus on the newly added tab inside the group
            focusedLeafId: targetLeaf ? targetLeaf.id : group.layout_state.focusedLeafId,
          },
        };

        try {
          await localDB.putGroup(updatedGroup);
          
          // Update the groups state
          setGroups((prev) =>
            prev.map((g) => (g.id === groupId ? updatedGroup : g))
          );

          // Auto-save the current ungrouped/other group layout before switching
          if (activeGroupId) {
            const activeGroup = groups.find((g) => g.id === activeGroupId);
            if (activeGroup) {
              const currentScrolls: Record<string, number> = {};
              const currentCursors: Record<string, number> = {};
              const currentViewModes: Record<string, string> = {};

              const allOpenTabs = collectAllTabs(paneTree);
              for (const t of allOpenTabs) {
                const cached = scrollCursorCacheRef.current[t.path];
                if (cached) {
                  if (cached.scroll !== undefined) currentScrolls[t.path] = cached.scroll;
                  if (cached.cursor !== undefined) currentCursors[t.path] = cached.cursor;
                  if (cached.viewMode !== undefined) currentViewModes[t.path] = cached.viewMode;
                }
              }

              const updatedActiveGroup: LocalGroup = {
                ...activeGroup,
                updated_at: new Date().toISOString(),
                layout_state: {
                  paneTree,
                  activeTabId,
                  focusedLeafId,
                  scrollPositions: currentScrolls,
                  cursorPositions: currentCursors,
                  viewModes: currentViewModes,
                },
              };

              await localDB.putGroup(updatedActiveGroup);
              setGroups((prev) =>
                prev.map((g) => (g.id === activeGroupId ? updatedActiveGroup : g))
              );
            }
          }

          // Expand/uncollapse the group automatically
          setCollapsedGroupIds((prev) => {
            const next = new Set<string>(prev);
            next.delete(groupId);
            return next;
          });

          // Instantly restore and switch to the target group splits!
          await handleRestoreGroup(groupId, updatedGroup);
          return;
        } catch (err) {
          console.error("Failed to add tab to group splits:", err);
        }
      }
    }

    // Default inline grouping state update (when group is active, or removing tab from group)
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, groupId } : t));
    setPaneTree(prev => {
      const updateTabGroup = (node: PaneNode): PaneNode => {
        if (node.type === 'leaf') {
          return {
            ...node,
            tabs: node.tabs.map(t => t.id === tabId ? { ...t, groupId } : t)
          };
        }
        return {
          ...node,
          children: [
            updateTabGroup(node.children[0]),
            updateTabGroup(node.children[1])
          ] as [PaneNode, PaneNode]
        };
      };
      return updateTabGroup(prev);
    });
  }, [activeGroupId, groups, tabs, paneTree, activeTabId, focusedLeafId, handleRestoreGroup]);

  const handleCreateGroupFromTab = useCallback((tabId: string) => {
    setGroupModalData({
      type: "create",
      title: "Create Group from Tab",
      tabId,
    });
  }, []);

  const handleGroupModalClose = (result: { name: string; color: string } | null) => {
    const data = groupModalData;
    setGroupModalData(null);
    if (!result || !data) return;

    if (data.type === "create") {
      void handleSaveGroupConfirm(result.name, result.color, data.tabId);
    } else if (data.type === "rename" || data.type === "color") {
      if (!data.groupId) return;
      const group = groups.find((g) => g.id === data.groupId);
      if (!group) return;

      const updatedGroup: LocalGroup = {
        ...group,
        name: result.name,
        color: result.color,
        updated_at: new Date().toISOString(),
      };

      localDB.putGroup(updatedGroup)
        .then(() => {
          setGroups((prev) =>
            prev.map((g) => (g.id === data.groupId ? updatedGroup : g))
          );
          showToast(`Updated group ${result.name}`, "success");
        })
        .catch((err) => console.error("Failed to update group metadata:", err));
    }
  };

  // ── File Operations ─────────────────────────────────
  const openFile = async (filePath: string, mode?: ViewMode) => {
    const readOrCreateMissingMarkdown = async (path: string): Promise<string> => {
      try {
        return await api.readFile(path);
      } catch (err: any) {
        if (err?.code === "ENOENT" && path.toLowerCase().endsWith(".md")) {
          const noteTitle = getNoteName(path);
          const fallback = `# ${noteTitle}\n\n`;
          await api.createFile(path, fallback);
          await refreshFileTree();
          return fallback;
        }
        throw err;
      }
    };

    // Track recent files (keep last 20)
    setRecentFiles((prev) => {
      const filtered = prev.filter((p) => p !== filePath);
      return [filePath, ...filtered].slice(0, 20);
    });

    // Determine starting tabs for this operation (filter out active "New tab" if we're replacing it)
    let baseTabs = tabs;
    let replacingNewTabId: string | null = null;
    if (activeTab?.path === "__new_tab__") {
      replacingNewTabId = activeTabId;
      baseTabs = tabs.filter(t => t.id !== activeTabId);
    }

    const existingBaseTab = baseTabs.find((t) => t.path === filePath);
    const isGroupTab = existingBaseTab && existingBaseTab.groupId === activeGroupId;

    if (activeGroupId && !isGroupTab) {
      setActiveGroupId(null);

      const ungroupedTabs = baseTabs.filter(t => !t.groupId || !groups.some(g => g.id === t.groupId));

      const newTabId = generateId();
      const newTab: Tab = {
        id: newTabId,
        path: filePath,
        name: getNoteName(filePath),
        isModified: false,
      };

      ungroupedTabs.push(newTab);

      const newTree: PaneLeaf = {
        type: 'leaf',
        id: generateId(),
        tabs: ungroupedTabs,
        activeTabId: newTabId,
      };

      skipTabSyncRef.current = true;
      setPaneTree(newTree);
      setTabs(ungroupedTabs);
      setActiveTabId(newTabId);
      setFocusedLeafId(newTree.id);

      if (isCanvasFile(filePath)) {
        setRecentCanvasFiles((prev) => {
          const filtered = prev.filter((p) => p !== filePath);
          return [filePath, ...filtered].slice(0, 12);
        });
        setShowThoughtModel(false);
        setShowGraph(false);
        setShowCanvas(false);
        setCanvasFullScreen(false);
        setCanvasFilePath(filePath);
        setCurrentContent("");
        setBacklinks([]);
      } else {
        const content = await readOrCreateMissingMarkdown(filePath);
        setCurrentContent(content);
        if (mode) {
          setViewMode(mode);
        }
        loadBacklinks(filePath);
      }
      return;
    }

    if (isCanvasFile(filePath)) {
      setRecentCanvasFiles((prev) => {
        const filtered = prev.filter((p) => p !== filePath);
        return [filePath, ...filtered].slice(0, 12);
      });
      setShowThoughtModel(false);
      setShowGraph(false);
      setShowCanvas(false);
      setCanvasFullScreen(false);
      setCanvasFilePath(filePath);
      
      const existingCanvasTab = baseTabs.find((t) => t.path === filePath);
      if (existingCanvasTab) {
        setTabs(baseTabs); // Apply the removal of New Tab if it happened
        setActiveTabId(existingCanvasTab.id);
        const leaf = findLeafWithTab(paneTree, existingCanvasTab.id);
        if (leaf) {
          setFocusedLeafId(leaf.id);
        }
      } else {
        const canvasTab: Tab = {
          id: generateId(),
          path: filePath,
          name: getNoteName(filePath),
          isModified: false,
        };
        setTabs([...baseTabs, canvasTab]);
        setActiveTabId(canvasTab.id);
      }
      setCurrentContent("");
      setBacklinks([]);
      return;
    }

    // Check if tab already exists in our base set
    const existingTab = baseTabs.find((t) => t.path === filePath);
    if (existingTab) {
      setTabs(baseTabs); // Apply removal of New Tab if it happened
      setActiveTabId(existingTab.id);
      const leaf = findLeafWithTab(paneTree, existingTab.id);
      if (leaf) {
        setFocusedLeafId(leaf.id);
      }
      const content = await readOrCreateMissingMarkdown(filePath);
      setCurrentContent(content);
      if (mode) {
        setViewMode(mode);
      }
      loadBacklinks(filePath);
      return;
    }

    // Open new tab
    const content = await readOrCreateMissingMarkdown(filePath);
    const newTab: Tab = {
      id: generateId(),
      path: filePath,
      name: getNoteName(filePath),
      isModified: false,
    };

    setTabs([...baseTabs, newTab]);
    setActiveTabId(newTab.id);
    setCurrentContent(content);
    if (mode) {
      setViewMode(mode);
    }
    loadBacklinks(filePath);
  };


  const openGraphAsTab = (mode: GraphMode = "manual") => {
    setGraphMode(mode);
    setShowThoughtModel(false);
    setShowCanvas(false);
    setShowGraph(false);

    const existingGraphTab = tabs.find((t) => t.path === GRAPH_TAB_PATH);
    if (existingGraphTab) {
      setActiveTabId(existingGraphTab.id);
      const leaf = findLeafWithTab(paneTree, existingGraphTab.id);
      if (leaf) {
        setFocusedLeafId(leaf.id);
      }
    } else {
      const graphTab: Tab = {
        id: generateId(),
        path: GRAPH_TAB_PATH,
        name: "Graph",
        isModified: false,
      };
      setTabs((prev) => [...prev, graphTab]);
      setActiveTabId(graphTab.id);
    }

    setCurrentContent("");
    setBacklinks([]);
    setFtuxState((prev: FTUXState) =>
      prev.graphPromptShown ? prev : { ...prev, graphPromptShown: true },
    );
  };

  const openSpacesAsTab = () => {
    setShowThoughtModel(false);
    setShowCanvas(false);
    setShowGraph(false);

    const existingSpacesTab = tabs.find((t) => t.path === SPACES_TAB_PATH);
    if (existingSpacesTab) {
      setActiveTabId(existingSpacesTab.id);
      const leaf = findLeafWithTab(paneTree, existingSpacesTab.id);
      if (leaf) {
        setFocusedLeafId(leaf.id);
      }
    } else {
      const spacesTab: Tab = {
        id: generateId(),
        path: SPACES_TAB_PATH,
        name: "Spaces",
        isModified: false,
      };
      setTabs((prev) => [...prev, spacesTab]);
      setActiveTabId(spacesTab.id);
    }

    setCurrentContent("");
    setBacklinks([]);
  };

  const handleExpandFirstThought = useCallback(() => {
    if (!firstThoughtExpansionPlan) return;
    if (!firstThoughtDraft.trim()) return;

    const suggestion = firstThoughtExpansionPlan.suggestions[selectedSuggestionIndex];
    if (!suggestion) return;

    const expandedDraft = expandFirstThoughtDraft(
      firstThoughtDraft,
      suggestion.template,
    );

    setFirstThoughtDraft(expandedDraft.value);
    setShowFirstThoughtExpansionHint(false);
    setDismissedFirstThoughtExpansionDraftKey(
      normalizeFirstThoughtDraft(expandedDraft.value),
    );

    window.requestAnimationFrame(() => {
      const element = firstThoughtInputRef.current;
      if (!element) return;
      element.focus();
      const cursor = Math.min(expandedDraft.cursor, expandedDraft.value.length);
      element.setSelectionRange(cursor, cursor);
    });
  }, [firstThoughtDraft, firstThoughtExpansionPlan, selectedSuggestionIndex]);

  const handleIgnoreFirstThoughtExpansion = useCallback(() => {
    setShowFirstThoughtExpansionHint(false);
    setDismissedFirstThoughtExpansionDraftKey(
      normalizeFirstThoughtDraft(firstThoughtDraft),
    );
  }, [firstThoughtDraft]);

  const handleCreateFirstThought = useCallback(async () => {
    if (!vaultPath) return;

    const thought = firstThoughtDraft.trim();
    if (!thought) return;

    const slugBase = thought
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join("-") || `first-thought-${Date.now()}`;

    let candidatePath = `${slugBase}.md`;
    let suffix = 2;
    while (await api.fileExists(candidatePath)) {
      candidatePath = `${slugBase}-${suffix}.md`;
      suffix += 1;
    }

    const heading = thought
      .split(/\n+/)
      .find((line) => line.trim().length > 0)
      ?.trim()
      .slice(0, 80) || "First thought";

    const content = `# ${heading}\n\n${thought}\n`;
    await api.createFile(candidatePath, content);
    await refreshFileTree();
    await openFile(candidatePath, "editor");
    setFirstThoughtDraft("");
    setFirstThoughtExpansionPlan(null);
    setShowFirstThoughtExpansionHint(false);
    setShownFirstThoughtExpansionDraftKey(null);
    setDismissedFirstThoughtExpansionDraftKey(null);

    const store = loadStore();
    void embedNote(store, candidatePath, content);
    void getAnnotation(candidatePath, content)
      .then((annotation) => {
        if (annotation) {
          setInlineAnnotationByPath(prev => ({ ...prev, [candidatePath]: annotation }));
        }
      })
      .catch(() => {
        // ignore annotation failures in FTUX entry
      });
  }, [firstThoughtDraft, refreshFileTree, vaultPath, openFile]);

  const handleToggleCanvas = async () => {
    const path = await createCanvasDocumentWithPrompt("Untitled canvas");
    if (!path) return;
    await openFile(path, "preview");
  };

  const getActiveCanvasPath = useCallback((): string | null => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab && isCanvasFile(tab.path)) return tab.path;
    if (showCanvas && canvasFilePath) return canvasFilePath;
    return null;
  }, [tabs, activeTabId, showCanvas, canvasFilePath]);

  const readCanvasDocument = useCallback(async (): Promise<{
    path: string;
    content: string;
  } | null> => {
    const path = getActiveCanvasPath();
    if (!path) return null;
    try {
      const content = await api.readFile(path);
      return {
        path,
        content: content?.trim()
          ? content
          : JSON.stringify({ nodes: [], edges: [] }, null, 2),
      };
    } catch {
      return {
        path,
        content: JSON.stringify({ nodes: [], edges: [] }, null, 2),
      };
    }
  }, [getActiveCanvasPath]);

  const handleDuplicateCanvas = useCallback(async () => {
    const source = await readCanvasDocument();
    if (!source) return;
    const baseName =
      source.path
        .replace(/\.canvas$/i, "")
        .split("/")
        .pop() || "Canvas copy";
    const targetName = await promptForInput(
      "Duplicate Canvas",
      "Enter duplicate canvas name:",
      `${baseName} copy`,
    );
    if (!targetName) return;

    const targetPath = await getUniqueCanvasPath(targetName);
    await api.createFile(targetPath, source.content);
    await refreshFileTree();
    await openFile(targetPath, "preview");
  }, [
    readCanvasDocument,
    promptForInput,
    getUniqueCanvasPath,
    refreshFileTree,
    openFile,
  ]);

  const handleSaveCanvasAs = useCallback(async () => {
    const source = await readCanvasDocument();
    if (!source) return;
    const baseName =
      source.path
        .replace(/\.canvas$/i, "")
        .split("/")
        .pop() || "Canvas";
    const targetName = await promptForInput(
      "Save Canvas As",
      "Enter new canvas name:",
      `${baseName} copy`,
    );
    if (!targetName) return;

    const targetPath = await getUniqueCanvasPath(targetName);
    await api.createFile(targetPath, source.content);
    await refreshFileTree();
    await openFile(targetPath, "preview");
  }, [
    readCanvasDocument,
    promptForInput,
    getUniqueCanvasPath,
    refreshFileTree,
    openFile,
  ]);

  const handleNewNote = async () => {
    if (!vaultPath) return;

    setModal({
      type: "prompt",
      title: "New Note",
      message: "Enter note name:",
      onConfirm: async (name) => {
        if (typeof name !== "string" || !name.trim()) return;

        const trimmed = name.trim();
        const fileName = /\.(md|canvas)$/i.test(trimmed)
          ? trimmed
          : `${trimmed}.md`;
        const content = isCanvasFile(fileName)
          ? JSON.stringify({ nodes: [], edges: [] }, null, 2)
          : `# ${trimmed.replace(".md", "")}\n\n`;

        await api.createFile(fileName, content);
        await refreshFileTree();
        await openFile(fileName);
      },
    });
  };

  const handleCreateNamedNote = useCallback(
    async (rawName?: string) => {
      if (!vaultPath) return;

      const trimmed = (rawName || "").trim();
      if (!trimmed) {
        await handleNewNote();
        return;
      }

      const fileName = /\.(md|canvas)$/i.test(trimmed)
        ? trimmed
        : `${trimmed}.md`;
      const content = isCanvasFile(fileName)
        ? JSON.stringify({ nodes: [], edges: [] }, null, 2)
        : `# ${trimmed.replace(/\.md$/i, "")}` + "\n\n";

      await api.createFile(fileName, content);
      await refreshFileTree();
      await openFile(fileName);
    },
    [vaultPath, handleNewNote, refreshFileTree, openFile],
  );

  // ── Inline suggestions (appear inside editor) ──────────────────────────
  const [inlineSuggestions, setInlineSuggestions] = useState<EnrichedSuggestion[]>([]);
  const [nextStepSuggestions, setNextStepSuggestions] = useState<EnrichedSuggestion[]>([]);
  const [inlineSuggestionsByPath, setInlineSuggestionsByPath] = useState<Record<string, EnrichedSuggestion[]>>({});
  const [nextStepSuggestionsByPath, setNextStepSuggestionsByPath] = useState<Record<string, EnrichedSuggestion[]>>({});
  const [inlineAnnotationByPath, setInlineAnnotationByPath] = useState<Record<string, string | null>>({});
  const [generatingInsightPaths, setGeneratingInsightPaths] = useState<Set<string>>(new Set());
  const ftuxConnectionSuggestion = useMemo(
    () =>
      inlineSuggestions
        .filter((suggestion) => suggestion.similarity >= 0.7)
        .sort((a, b) => b.similarity - a.similarity)[0] || null,
    [inlineSuggestions],
  );

  const refreshInlineSuggestions = useCallback(async (notePath: string) => {
    try {
      const store = loadStore();
      if (store.entries.size === 0) {
        setInlineSuggestions([]);
        setNextStepSuggestions([]);
        return;
      }
      // Generation stage: keep this pool broad so display layers can rank/fallback.
      const raw = findSimilar(store, notePath, 0.15, 30);
      const weighted = applyHistoryWeighting(notePath, raw);
      const basic = weighted.map((s) => ({
        ...s,
        title: s.path.split("/").pop()?.replace(/\.md$/, "") || s.path,
      }));

      // Load target note contents for enrichment
      let sourceContent = "";
      try { sourceContent = await api.readFile(notePath); } catch { /* empty */ }

      const noteContents = new Map<string, string>();
      for (const s of basic) {
        try {
          const content = await api.readFile(s.path);
          noteContents.set(s.path, content);
        } catch { /* skip */ }
      }

      const history = loadSuggestionHistory();
      const accepted = history
        .filter(
          (record) =>
            record.sourcePath === notePath &&
            record.action === "accepted",
        )
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 16);

      const acceptedConceptWeights = new Map<string, number>();
      if (accepted.length > 0) {
        const now = Date.now();
        for (const record of accepted) {
          const ageDays = Math.max(0, (now - record.timestamp) / (24 * 60 * 60 * 1000));
          const recencyWeight = Math.max(0.35, 1 - ageDays / 21);
          const targetName = record.targetPath
            .split("/")
            .pop()
            ?.replace(/\.md$/, "")
            .toLowerCase() || "";
          const tokens = targetName
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((token) => token.length > 2);
          for (const token of tokens) {
            acceptedConceptWeights.set(
              token,
              (acceptedConceptWeights.get(token) || 0) + recencyWeight,
            );
          }
        }
      }

      const sourceConcept = deriveCurrentConcept(sourceContent);
      const transitionMap = loadTransitionMap();

      // Candidate generation only. Display layers handle strict ranking and fallback.
      const enriched = enrichSuggestions(sourceContent, basic, noteContents)
        .map((suggestion) => {
          const candidateTokens = `${suggestion.title} ${suggestion.sharedConcepts.join(" ")}`
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((token) => token.length > 2);

          let trajectoryBoost = 0;
          if (acceptedConceptWeights.size > 0) {
            const tokenSet = new Set(candidateTokens);
            let overlapScore = 0;
            tokenSet.forEach((token) => {
              overlapScore += acceptedConceptWeights.get(token) || 0;
            });
            trajectoryBoost = Math.min(0.12, overlapScore * 0.028);
          }

          const transitionBoost = sourceConcept
            ? getTransitionBoost(sourceConcept, candidateTokens)
            : 0;
          const totalBoost = trajectoryBoost + transitionBoost;
          if (totalBoost <= 0) return suggestion;

          return {
            ...suggestion,
            similarity: Math.max(0, Math.min(1, suggestion.similarity + totalBoost)),
          };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 24);

      const sessionIntentTokens = [...acceptedConceptWeights.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([token]) => token);

      const clusterContextTokens = new Set<string>();
      enriched
        .filter((item) => item.group === "strong")
        .slice(0, 6)
        .forEach((item) => {
          item.sharedConcepts.forEach((concept) => {
            extractConceptTokens(concept, 4).forEach((token) => {
              clusterContextTokens.add(token);
            });
          });
        });

      const nextSteps = enriched
        .map((suggestion) => {
          const candidateTokens = extractConceptTokens(
            `${suggestion.title} ${suggestion.sharedConcepts.join(" ")}`,
            10,
          );
          if (candidateTokens.length === 0) return null;

          const intentOverlap = candidateTokens.reduce(
            (sum, token) => sum + (acceptedConceptWeights.get(token) || 0),
            0,
          );

          const transitionLikelihood = sourceConcept
            ? getTransitionLikelihood(transitionMap, sourceConcept, candidateTokens)
            : 0;

          const clusterOverlap =
            candidateTokens.filter((token) => clusterContextTokens.has(token)).length /
            Math.max(1, candidateTokens.length);

          const sessionIntentOverlap =
            sessionIntentTokens.length > 0
              ? candidateTokens.filter((token) => sessionIntentTokens.includes(token)).length /
                sessionIntentTokens.length
              : 0;

          const guidanceScore =
            suggestion.similarity * 0.34 +
            Math.min(0.28, intentOverlap * 0.06) +
            Math.min(0.24, transitionLikelihood * 0.8) +
            clusterOverlap * 0.12 +
            sessionIntentOverlap * 0.1;

          const passesSignalGate =
            transitionLikelihood >= 0.02 ||
            intentOverlap >= 0.45 ||
            clusterOverlap >= 0.28 ||
            sessionIntentOverlap >= 0.2;
          if (!passesSignalGate) return null;

          const primaryHint = suggestion.sharedConcepts[0] || suggestion.title;
          const guidanceReason =
            transitionLikelihood > 0.02
              ? `Likely next direction based on recent flow toward ${primaryHint}`
              : `Builds your current trajectory around ${primaryHint}`;

          return {
            ...suggestion,
            similarity: Math.min(1, Math.max(suggestion.similarity, guidanceScore)),
            reason: guidanceReason,
          };
        })
        .filter((item): item is EnrichedSuggestion => Boolean(item))
        .sort((a, b) => b.similarity - a.similarity)
        .filter((candidate, index, list) =>
          list.findIndex((item) => item.path === candidate.path) === index,
        )
        .slice(0, 4);

      setInlineSuggestions(enriched);
      setNextStepSuggestions(nextSteps);
      setInlineSuggestionsByPath((prev) => ({ ...prev, [notePath]: enriched }));
      setNextStepSuggestionsByPath((prev) => ({ ...prev, [notePath]: nextSteps }));
    } catch { /* silent */ }
  }, []);

  const refreshInlineAnnotation = useCallback((notePath: string) => {
    const cached = getCachedAnnotation(notePath);
    setInlineAnnotationByPath(prev => ({ ...prev, [notePath]: cached }));
  }, []);

  // Track previous note for decay recording
  const prevActiveTabRef = React.useRef<string | null>(null);

  // Refresh suggestions when active tab changes
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    const currentPath = tab?.path.endsWith(".md") ? tab.path : null;

    // Record ignored suggestions for the note we're leaving
    if (prevActiveTabRef.current && prevActiveTabRef.current !== currentPath) {
      const prevPath = prevActiveTabRef.current;
      if (inlineSuggestions.length > 0) {
        recordIgnoredSuggestions(prevPath, inlineSuggestions.map((s) => s.path));
      }
    }
    prevActiveTabRef.current = currentPath;

    if (currentPath) {
      refreshInlineSuggestions(currentPath);
      refreshInlineAnnotation(currentPath);
    } else {
      setInlineSuggestions([]);
      setNextStepSuggestions([]);
    }
  }, [activeTabId, tabs, refreshInlineSuggestions, refreshInlineAnnotation]);

  // Pre-load suggestions for all active tabs in all split panes
  useEffect(() => {
    const activePaths = collectAllActiveTabPaths(paneTree);
    for (const path of activePaths) {
      if (path && !inlineSuggestionsByPath[path]) {
        refreshInlineSuggestions(path);
      }
    }
  }, [paneTree, tabs, refreshInlineSuggestions, inlineSuggestionsByPath]);

  const handleInlineAccept = useCallback(
    async (targetPath: string, linkType: LinkType) => {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab) return;
      try {
        const content = await api.readFile(tab.path);
        const targetName = targetPath.split("/").pop()?.replace(/\.md$/, "") || targetPath;
        const sourceConcept = deriveCurrentConcept(content);
        const acceptedSuggestion = inlineSuggestions.find((item) => item.path === targetPath);
        const targetConcept =
          extractConceptTokens(
            acceptedSuggestion
              ? `${acceptedSuggestion.title} ${acceptedSuggestion.sharedConcepts.join(" ")}`
              : targetName,
            1,
          )[0] || null;

        if (sourceConcept && targetConcept) {
          recordTransition(sourceConcept, targetConcept);
        }

        const linkText =
          linkType === "related"
            ? `[[${targetName}]]`
            : `[[${targetName}]] %%${linkType}%%`;
        const separator = content.endsWith("\n") ? "\n" : "\n\n";
        await api.writeFile(tab.path, content + separator + linkText + "\n");
        recordSuggestion({
          sourcePath: tab.path,
          targetPath,
          action: "accepted",
          timestamp: Date.now(),
        });

        let acceptedConnection = false;
        setFtuxState((prev: FTUXState) => {
          const next: FTUXState = {
            ...prev,
            acceptedSuggestions: prev.acceptedSuggestions + 1,
          };

          const withinConnectionWindow = prev.notesCount >= 2 && prev.notesCount <= 3;
          const isConnectionTarget = targetPath === (ftuxConnectionSuggestion?.path || "");
          if (withinConnectionWindow && isConnectionTarget) {
            next.acceptedConnections = prev.acceptedConnections + 1;
            acceptedConnection = true;
          }

          if (next.acceptedSuggestions >= 2) {
            next.trajectoryActivated = true;
          }

          return next;
        });

        if (acceptedConnection) {
          setFtuxConnectionPulse(true);
          if (ftuxPulseTimerRef.current) {
            clearTimeout(ftuxPulseTimerRef.current);
          }
          ftuxPulseTimerRef.current = setTimeout(() => {
            setFtuxConnectionPulse(false);
            ftuxPulseTimerRef.current = null;
          }, 1000);
        }

        setInlineSuggestions((prev) => prev.filter((s) => s.path !== targetPath));
        // Reload editor content
        const updated = await api.readFile(tab.path);
        setCurrentContent(updated);
      } catch (err) {
        console.error("Failed to create link:", err);
      }
    },
    [activeTabId, ftuxConnectionSuggestion?.path, inlineSuggestions, tabs],
  );

  const handleInlineReject = useCallback(
    (targetPath: string) => {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab) return;
      recordSuggestion({
        sourcePath: tab.path,
        targetPath,
        action: "rejected",
        timestamp: Date.now(),
      });

      const isConnectionWindow = ftuxState.notesCount >= 2 && ftuxState.notesCount <= 3;
      const isConnectionSuggestion = targetPath === (ftuxConnectionSuggestion?.path || "");
      if (isConnectionWindow && isConnectionSuggestion) {
        setNotNowSuppressedUntilNotes(ftuxState.notesCount + 2);
      }

      setInlineSuggestions((prev) => prev.filter((s) => s.path !== targetPath));
    },
    [activeTabId, ftuxConnectionSuggestion?.path, ftuxState.notesCount, tabs],
  );

  const handleSaveInsight = useCallback(async () => {
    if (!ftuxInsightText) return;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let filePath = `insight-${stamp}.md`;
    let suffix = 2;
    while (await api.fileExists(filePath)) {
      filePath = `insight-${stamp}-${suffix}.md`;
      suffix += 1;
    }

    const content = `# Insight\n\n${ftuxInsightText}\n`;
    await api.createFile(filePath, content);
    await refreshFileTree();
    await openFile(filePath, "preview");
    setFtuxState((prev: FTUXState) => ({ ...prev, insightShown: true }));
  }, [ftuxInsightText, refreshFileTree, openFile]);

  const handleIgnoreInsight = useCallback(() => {
    setFtuxState((prev: FTUXState) => ({ ...prev, insightShown: true }));
  }, []);

  const handleOpenGraphFromPrompt = () => {
    setFtuxState((prev: FTUXState) => ({ ...prev, graphPromptShown: true }));
    openGraphAsTab("manual");
  };

  // Auto-embed a note after save (background, non-blocking)
  const autoEmbedNote = useCallback(async (path: string, content: string) => {
    if (!path.toLowerCase().endsWith(".md")) return;
    try {
      const store = loadStore();
      const changed = await embedNote(store, path, content);
      if (changed) {
        // Refresh inline suggestions after embedding updates
        refreshInlineSuggestions(path);
      }
    } catch (err) {
      console.warn("[Auto-embed] Failed:", err);
    }
  }, [refreshInlineSuggestions]);

  const handleGenerateInsight = useCallback(async (path: string, tabId: string) => {
    if (!path || isCanvasFile(path)) return;

    setGeneratingInsightPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });

    try {
      let content = "";
      if (activeTabId === tabId) {
        content = currentContent;
      } else {
        content = await api.readFile(path);
      }

      const ann = await getAnnotation(path, content);
      if (ann) {
        setInlineAnnotationByPath((prev) => ({
          ...prev,
          [path]: ann,
        }));
      }
    } catch (err) {
      console.warn("[Insight] Generation failed:", err);
    } finally {
      setGeneratingInsightPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [activeTabId, currentContent]);

  const handleSave = async () => {
    if (!activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    if (isCanvasFile(tab.path) || tab.path === GRAPH_TAB_PATH || tab.path === SPACES_TAB_PATH) return;

    await api.writeFile(tab.path, currentContent);
    if (tab.path.toLowerCase().endsWith(".md")) {
      window.dispatchEvent(
        new CustomEvent("openobsidian:note-content-changed", {
          detail: { path: tab.path, content: currentContent },
        }),
      );
    }
    // Auto-embed in background
    autoEmbedNote(tab.path, currentContent);

    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, isModified: false } : t)),
    );
    await refreshFileTree();
  };

  const handleContentChangeGlobal = useCallback(
    (path: string, content: string) => {
      // If the edited note is the globally focused one, update the global content state
      if (activeTabId && tabs.find((t) => t.id === activeTabId)?.path === path) {
        setCurrentContent(content);
      }

      if (
        !isCanvasFile(path) &&
        path !== GRAPH_TAB_PATH &&
        path.toLowerCase().endsWith(".md")
      ) {
        window.dispatchEvent(
          new CustomEvent("openobsidian:note-content-changed", {
            detail: { path, content },
          }),
        );
      }

      // Mark tab as modified
      setTabs((prev) =>
        prev.map((t) =>
          t.path === path ? { ...t, isModified: true } : t,
        ),
      );

      // Auto-embed in background when typing stops
      clearAutoSaveTimer();
      autoSaveTimer.current = setTimeout(() => {
        autoSaveTimer.current = null;
        autoEmbedNote(path, content);
      }, 2000);
    },
    [activeTabId, tabs],
  );

  // Auto-save with debounce
  const handleContentChange = useCallback(
    (content: string) => {
      setCurrentContent(content);

      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (
        activeTab &&
        !isCanvasFile(activeTab.path) &&
        activeTab.path !== GRAPH_TAB_PATH &&
        activeTab.path.toLowerCase().endsWith(".md")
      ) {
        window.dispatchEvent(
          new CustomEvent("openobsidian:note-content-changed", {
            detail: { path: activeTab.path, content },
          }),
        );
      }

      // Mark tab as modified
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, isModified: true } : t,
        ),
      );

      // Auto-save after 2 seconds of no typing
      clearAutoSaveTimer();
      autoSaveTimer.current = setTimeout(async () => {
        autoSaveTimer.current = null;
        const tab = tabs.find((t) => t.id === activeTabId);
        if (tab) {
          await api.writeFile(tab.path, content);
          if (tab.path.toLowerCase().endsWith(".md")) {
            window.dispatchEvent(
              new CustomEvent("openobsidian:note-content-changed", {
                detail: { path: tab.path, content },
              }),
            );
          }
          // Auto-embed on auto-save (background)
          autoEmbedNote(tab.path, content);

          setTabs((prev) =>
            prev.map((t) =>
              t.id === activeTabId ? { ...t, isModified: false } : t,
            ),
          );
        }
      }, 2000);
    },
    [activeTabId, tabs, clearAutoSaveTimer],
  );

  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || isCanvasFile(tab.path) || tab.path === GRAPH_TAB_PATH || tab.path === SPACES_TAB_PATH) {
      setFtuxSuggestionIdle(false);
      if (ftuxIdleTimerRef.current) {
        clearTimeout(ftuxIdleTimerRef.current);
        ftuxIdleTimerRef.current = null;
      }
      return;
    }

    setFtuxSuggestionIdle(false);
    if (ftuxIdleTimerRef.current) {
      clearTimeout(ftuxIdleTimerRef.current);
    }
    ftuxIdleTimerRef.current = setTimeout(() => {
      setFtuxSuggestionIdle(true);
      ftuxIdleTimerRef.current = null;
    }, 600);
  }, [activeTabId, currentContent, tabs]);

  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
    };
  }, [clearAutoSaveTimer]);

  const handleTabReorder = useCallback((draggedId: string, targetId: string, insertBefore: boolean) => {
    // Find target tab's groupId
    const targetTab = tabs.find(t => t.id === targetId);
    const targetGroupId = targetTab ? targetTab.groupId : null;

    setPaneTree((prev) => {
      // First update the groupId of the dragged tab in the tree
      const updateTabGroup = (node: PaneNode): PaneNode => {
        if (node.type === 'leaf') {
          return {
            ...node,
            tabs: node.tabs.map(t => t.id === draggedId ? { ...t, groupId: targetGroupId } : t)
          };
        }
        return {
          ...node,
          children: [
            updateTabGroup(node.children[0]),
            updateTabGroup(node.children[1])
          ] as [PaneNode, PaneNode]
        };
      };
      const updatedTree = updateTabGroup(prev);
      const newTree = moveTabInTree(updatedTree, draggedId, targetId, insertBefore);
      // Synchronize flat tabs state
      const allTabs = collectAllTabs(newTree);
      setTabs(allTabs);
      return newTree;
    });
  }, [tabs]);

  const handleTabSelect = async (id: string) => {
    const selectedTab = tabs.find((t) => t.id === id);
    const targetGroupId = selectedTab ? selectedTab.groupId : null;

    if (activeGroupId && targetGroupId !== activeGroupId) {
      // Auto-save the current layout state to the database before exiting the group
      const activeGroup = groups.find((g) => g.id === activeGroupId);
      if (activeGroup) {
        const currentScrolls: Record<string, number> = {};
        const currentCursors: Record<string, number> = {};
        const currentViewModes: Record<string, string> = {};

        const allOpenTabs = collectAllTabs(paneTree);
        for (const t of allOpenTabs) {
          const cached = scrollCursorCacheRef.current[t.path];
          if (cached) {
            if (cached.scroll !== undefined) currentScrolls[t.path] = cached.scroll;
            if (cached.cursor !== undefined) currentCursors[t.path] = cached.cursor;
            if (cached.viewMode !== undefined) currentViewModes[t.path] = cached.viewMode;
          }
        }

        const updatedGroup: LocalGroup = {
          ...activeGroup,
          updated_at: new Date().toISOString(),
          layout_state: {
            paneTree,
            activeTabId,
            focusedLeafId,
            scrollPositions: currentScrolls,
            cursorPositions: currentCursors,
            viewModes: currentViewModes,
          },
        };

        // Save layout to local database
        localDB.putGroup(updatedGroup)
          .then(() => {
            setGroups((prev) =>
              prev.map((g) => (g.id === activeGroupId ? updatedGroup : g))
            );
          })
          .catch((err) => console.error("Auto-save group failed before switching to ungrouped tab:", err));
      }

      setActiveGroupId(null);

      if (selectedTab) {
        const ungroupedTabs = tabs.filter(t => !t.groupId || !groups.some(g => g.id === t.groupId));
        if (!ungroupedTabs.some(t => t.id === selectedTab.id)) {
          ungroupedTabs.push(selectedTab);
        }

        const newTree: PaneLeaf = {
          type: 'leaf',
          id: generateId(),
          tabs: ungroupedTabs,
          activeTabId: selectedTab.id,
        };

        skipTabSyncRef.current = true;
        setPaneTree(newTree);
        setTabs(ungroupedTabs);
        setActiveTabId(selectedTab.id);
        setFocusedLeafId(newTree.id);

        if (isCanvasFile(selectedTab.path)) {
          setRecentCanvasFiles((prev) => {
            const filtered = prev.filter((p) => p !== selectedTab.path);
            return [selectedTab.path, ...filtered].slice(0, 12);
          });
          setShowThoughtModel(false);
          setShowGraph(false);
          setShowCanvas(false);
          setCanvasFullScreen(false);
          setCanvasFilePath(selectedTab.path);
          setCurrentContent("");
          setBacklinks([]);
        } else if (selectedTab.path !== "__new_tab__" && selectedTab.path !== GRAPH_TAB_PATH && selectedTab.path !== SPACES_TAB_PATH && !selectedTab.path.startsWith('__plugin__.')) {
          try {
            const content = await api.readFile(selectedTab.path);
            setCurrentContent(content);
            loadBacklinks(selectedTab.path);
          } catch (err) {
            console.error("Failed to load active tab content:", err);
          }
        } else {
          setCurrentContent("");
          setBacklinks([]);
        }
      }
      return;
    }

    setActiveTabId(id);
    
    // Sync with pane tree
    const targetLeaf = findLeafWithTab(paneTree, id);
    if (targetLeaf) {
      setFocusedLeafId(targetLeaf.id);
      setPaneTree((prev) => setActiveTabInLeaf(prev, targetLeaf.id, id));
    }
    const tab = selectedTab;
    if (tab) {
      if (isCanvasFile(tab.path)) {
        await openFile(tab.path, "preview");
        return;
      }
      if (tab.path === GRAPH_TAB_PATH) {
        setCurrentContent("");
        setBacklinks([]);
        return;
      }
      if (tab.path === SPACES_TAB_PATH) {
        setCurrentContent("");
        setBacklinks([]);
        return;
      }
      if (tab.path.startsWith('__plugin__.')) {
        setCurrentContent("");
        setBacklinks([]);
        return;
      }
      if (tab.path === "__new_tab__") {
        setCurrentContent("");
        setBacklinks([]);
        return;
      }
      try {
        const content = await api.readFile(tab.path);
        setCurrentContent(content);
        loadBacklinks(tab.path);
      } catch (e) {
        console.error("Failed to read file for tab:", e);
      }
    }
  };

  const closeTab = async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Auto-save before closing
    if (
      tab.isModified &&
      tab.id === activeTabId &&
      !isCanvasFile(tab.path) &&
      tab.path !== GRAPH_TAB_PATH
    ) {
      await api.writeFile(tab.path, currentContent);
    }

    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        const lastTab = newTabs[newTabs.length - 1];
        setActiveTabId(lastTab.id);
        if (
          lastTab.path === "__new_tab__" ||
          isCanvasFile(lastTab.path) || 
          lastTab.path === GRAPH_TAB_PATH || 
          lastTab.path === SPACES_TAB_PATH || 
          lastTab.path.startsWith('__plugin__.')
        ) {
          setCurrentContent("");
          setBacklinks([]);
        } else {
          try {
            const content = await api.readFile(lastTab.path);
            setCurrentContent(content);
            loadBacklinks(lastTab.path);
          } catch {
            setCurrentContent("");
          }
        }
      } else {
        // Automatically open a new tab if everything is closed
        handleOpenNewTab();
      }
    }
  };

  const selectRelativeTab = useCallback(
    (direction: 1 | -1) => {
      if (tabs.length <= 1) return;
      const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
      if (currentIndex === -1) return;

      const nextIndex =
        direction === 1
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length;

      const nextTab = tabs[nextIndex];
      if (nextTab) {
        void handleTabSelect(nextTab.id);
      }
    },
    [activeTabId, tabs, handleTabSelect],
  );

  useEffect(() => {
    const onSave = () => {
      void handleSave();
    };

    const onCloseTab = () => {
      if (activeTabId) {
        void closeTab(activeTabId);
      }
    };

    const onNewNote = (event: Event) => {
      const customEvent = event as CustomEvent<{ name?: string }>;
      void handleCreateNamedNote(customEvent.detail?.name);
    };

    const onSplitView = () => {
      setViewMode("split");
    };

    const onOpenGraph = () => {
      openGraphAsTab();
    };

    const onOpenChat = () => {
      setShowGraph(false);
      setShowCanvas(false);
      setShowThoughtModel(true);
    };

    const onDailyNote = () => {
      void handleCreateDailyNote();
    };

    const onFuzzySearch = (_event: Event) => {
      setShowSearch(true);
    };

    const onToggleBacklinks = () => {
      setShowBacklinks((prev) => !prev);
    };

    const onGlobalSearch = () => {
      setShowSearch(true);
    };

    const onCommandPalette = () => {
      setShowCommandPalette(true);
    };

    const onNextTab = () => {
      selectRelativeTab(1);
    };

    const onPrevTab = () => {
      selectRelativeTab(-1);
    };

    window.addEventListener("oo:save", onSave as EventListener);
    window.addEventListener("oo:close-tab", onCloseTab as EventListener);
    window.addEventListener("oo:new-note", onNewNote as EventListener);
    window.addEventListener("oo:split-view", onSplitView as EventListener);
    window.addEventListener("oo:open-graph", onOpenGraph as EventListener);
    window.addEventListener("oo:open-chat", onOpenChat as EventListener);
    window.addEventListener("oo:daily-note", onDailyNote as EventListener);
    window.addEventListener("oo:fuzzy-search", onFuzzySearch as EventListener);
    window.addEventListener("oo:toggle-backlinks", onToggleBacklinks as EventListener);
    window.addEventListener("oo:global-search", onGlobalSearch as EventListener);
    window.addEventListener("oo:command-palette", onCommandPalette as EventListener);
    window.addEventListener("oo:next-tab", onNextTab as EventListener);
    window.addEventListener("oo:prev-tab", onPrevTab as EventListener);

    return () => {
      window.removeEventListener("oo:save", onSave as EventListener);
      window.removeEventListener("oo:close-tab", onCloseTab as EventListener);
      window.removeEventListener("oo:new-note", onNewNote as EventListener);
      window.removeEventListener("oo:split-view", onSplitView as EventListener);
      window.removeEventListener("oo:open-graph", onOpenGraph as EventListener);
      window.removeEventListener("oo:open-chat", onOpenChat as EventListener);
      window.removeEventListener("oo:daily-note", onDailyNote as EventListener);
      window.removeEventListener("oo:fuzzy-search", onFuzzySearch as EventListener);
      window.removeEventListener("oo:toggle-backlinks", onToggleBacklinks as EventListener);
      window.removeEventListener("oo:global-search", onGlobalSearch as EventListener);
      window.removeEventListener("oo:command-palette", onCommandPalette as EventListener);
      window.removeEventListener("oo:next-tab", onNextTab as EventListener);
      window.removeEventListener("oo:prev-tab", onPrevTab as EventListener);
    };
  }, [
    activeTabId,
    closeTab,
    handleCreateNamedNote,
    handleSave,
    openGraphAsTab,
    selectRelativeTab,
  ]);

  // ── Link Navigation ─────────────────────────────────
  const handleLinkClick = async (linkName: string, heading?: string) => {
    // Find the note by name
    const findNote = (entries: FileEntry[], name: string): string | null => {
      for (const entry of entries) {
        if (!entry.isDirectory) {
          const noteName = getNoteName(entry.path);
          if (noteName.toLowerCase() === name.toLowerCase()) {
            return entry.path;
          }
        }
        if (entry.children) {
          const found = findNote(entry.children, name);
          if (found) return found;
        }
      }
      return null;
    };

    const filePath = findNote(fileTree, linkName);
    if (filePath) {
      await openFile(filePath, "preview");
      // TODO: Scroll to heading if specified
      if (heading) {
        // Dispatch event to scroll to heading in preview
        setTimeout(() => {
          const headingEl = document.querySelector(
            `.markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4, .markdown-preview h5, .markdown-preview h6`,
          );
          // Find the heading that matches
          const allHeadings = document.querySelectorAll(
            ".markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4, .markdown-preview h5, .markdown-preview h6",
          );
          for (const h of allHeadings) {
            if (h.textContent?.toLowerCase().includes(heading.toLowerCase())) {
              h.scrollIntoView({ behavior: "smooth", block: "start" });
              break;
            }
          }
        }, 100);
      }
    } else {
      // Auto-create note if it doesn't exist
      const newPath = `${linkName}.md`;
      const content = `# ${linkName}\n\n`;
      await api.createFile(newPath, content);
      await refreshFileTree();
      await openFile(newPath, "preview");
    }
  };

  // ── Backlinks ───────────────────────────────────────
  const loadBacklinks = async (filePath: string) => {
    try {
      const links = await api.getBacklinks(filePath);
      setBacklinks(links);
    } catch {
      setBacklinks([]);
    }
  };

  // ── File Management ─────────────────────────────────
  const handleDeleteFile = async (filePath: string, isDir: boolean = false) => {
    setModal({
      type: "confirm",
      title: isDir ? "Delete Folder" : "Delete File",
      message: `Delete "${getNoteName(filePath)}"${isDir ? " and all its contents" : ""}?`,
      onConfirm: async (confirmed) => {
        if (!confirmed) return;

        try {
          clearAutoSaveTimer();

          // Propagate delete to collaboration database & sync queue
          const spaceId = collaborationEngine.activeSpaceId;
          if (spaceId) {
            if (isDir) {
              const notes = await localDB.getNotes(spaceId);
              const dirPrefix = filePath.endsWith('/') ? filePath : `${filePath}/`;
              for (const note of notes) {
                if (note.path === filePath || note.path.startsWith(dirPrefix)) {
                  await localDB.deleteNote(note.id, true);
                }
              }
            } else {
              const note = await localDB.getNoteByPath(spaceId, filePath);
              if (note) {
                await localDB.deleteNote(note.id, true);
              }
            }
            syncEngine.triggerPush();
          }

          if (isDir) {
            await api.deleteDirectory(filePath);
            const store = loadStore();
            removeEmbeddingsByPrefix(store, filePath);
          } else {
            await api.deleteFile(filePath);
            if (filePath.toLowerCase().endsWith(".md")) {
              const store = loadStore();
              removeEmbedding(store, filePath);
            }
          }

          // Close tab if open (for files) or close all tabs within the folder
          if (isDir) {
            // Close all tabs that are within this directory
            tabs.forEach((tab) => {
              if (
                tab.path.startsWith(filePath + "/") ||
                tab.path === filePath
              ) {
                closeTab(tab.id);
              }
            });
          } else {
            const tab = tabs.find((t) => t.path === filePath);
            if (tab) closeTab(tab.id);
          }

          await refreshFileTree();
        } catch (error) {
          console.error("Failed to delete:", error);
        }
      },
    });
  };

  const handleRenameFile = async (oldPath: string, newName: string) => {
    clearAutoSaveTimer();

    const findEntryByPath = (entries: FileEntry[], targetPath: string): FileEntry | null => {
      for (const entry of entries) {
        if (entry.path === targetPath) return entry;
        if (entry.isDirectory && entry.children) {
          const found = findEntryByPath(entry.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    };

    const existingEntry = findEntryByPath(fileTree, oldPath);
    const isDirectory = existingEntry?.isDirectory === true;

    const dir = oldPath.includes("/")
      ? oldPath.substring(0, oldPath.lastIndexOf("/") + 1)
      : "";
    const raw = newName.trim();
    const hasExt = /\.[a-z0-9]+$/i.test(raw);
    const inferredExt = isCanvasFile(oldPath) ? ".canvas" : ".md";
    const normalized = isDirectory
      ? raw
      : hasExt
        ? raw
        : `${raw}${inferredExt}`;
    const newPath = dir + normalized;

    // Propagate rename to collaboration database & sync queue
    const spaceId = collaborationEngine.activeSpaceId;
    if (spaceId) {
      if (isDirectory) {
        const notes = await localDB.getNotes(spaceId);
        const oldPrefix = oldPath.endsWith('/') ? oldPath : `${oldPath}/`;
        const newPrefix = newPath.endsWith('/') ? newPath : `${newPath}/`;
        for (const note of notes) {
          if (note.path === oldPath) {
            note.path = newPath;
            note.title = newPath.split('/').pop()?.replace(/\.(md|canvas)$/, '') || newPath;
            note.updated_at = new Date().toISOString();
            await localDB.putNote(note, true);
          } else if (note.path.startsWith(oldPrefix)) {
            const nextPath = `${newPrefix}${note.path.slice(oldPrefix.length)}`;
            note.path = nextPath;
            note.title = nextPath.split('/').pop()?.replace(/\.(md|canvas)$/, '') || nextPath;
            note.updated_at = new Date().toISOString();
            await localDB.putNote(note, true);
          }
        }
      } else {
        const note = await localDB.getNoteByPath(spaceId, oldPath);
        if (note) {
          note.path = newPath;
          note.title = newPath.split('/').pop()?.replace(/\.(md|canvas)$/, '') || newPath;
          note.updated_at = new Date().toISOString();
          await localDB.putNote(note, true);
        }
      }
      syncEngine.triggerPush();
    }

    await api.renameFile(oldPath, newPath);

    const store = loadStore();
    if (isDirectory) {
      renameEmbeddingsByPrefix(store, oldPath, newPath);
    } else if (oldPath.toLowerCase().endsWith(".md")) {
      if (newPath.toLowerCase().endsWith(".md")) {
        renameEmbeddingPath(store, oldPath, newPath);
      } else {
        removeEmbedding(store, oldPath);
      }
    }

    // Update tab if open
    setTabs((prev) => {
      if (isDirectory) {
        const oldPrefix = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
        const newPrefix = newPath.endsWith("/") ? newPath : `${newPath}/`;
        return prev.map((t) => {
          if (t.path === oldPath) {
            return { ...t, path: newPath, name: getNoteName(newPath) };
          }
          if (t.path.startsWith(oldPrefix)) {
            const nextPath = `${newPrefix}${t.path.slice(oldPrefix.length)}`;
            return { ...t, path: nextPath, name: getNoteName(nextPath) };
          }
          return t;
        });
      }

      return prev.map((t) =>
        t.path === oldPath
          ? { ...t, path: newPath, name: getNoteName(newPath) }
          : t,
      );
    });

    await refreshFileTree();
  };

  const handleMoveFile = useCallback(async (oldPath: string, newPath: string) => {
    if (oldPath === newPath) return;

    clearAutoSaveTimer();

    try {
      // Propagate move/rename to collaboration database & sync queue
      const spaceId = collaborationEngine.activeSpaceId;
      if (spaceId) {
        const isFile = oldPath.toLowerCase().endsWith(".md") || oldPath.toLowerCase().endsWith(".canvas");
        if (isFile) {
          const note = await localDB.getNoteByPath(spaceId, oldPath);
          if (note) {
            note.path = newPath;
            note.title = newPath.split('/').pop()?.replace(/\.(md|canvas)$/, '') || newPath;
            note.updated_at = new Date().toISOString();
            await localDB.putNote(note, true);
          }
        } else {
          // Folder move
          const notes = await localDB.getNotes(spaceId);
          const oldPrefix = oldPath.endsWith('/') ? oldPath : `${oldPath}/`;
          const newPrefix = newPath.endsWith('/') ? newPath : `${newPath}/`;
          for (const note of notes) {
            if (note.path === oldPath) {
              note.path = newPath;
              note.title = newPath.split('/').pop()?.replace(/\.(md|canvas)$/, '') || newPath;
              note.updated_at = new Date().toISOString();
              await localDB.putNote(note, true);
            } else if (note.path.startsWith(oldPrefix)) {
              const nextPath = `${newPrefix}${note.path.slice(oldPrefix.length)}`;
              note.path = nextPath;
              note.title = nextPath.split('/').pop()?.replace(/\.(md|canvas)$/, '') || nextPath;
              note.updated_at = new Date().toISOString();
              await localDB.putNote(note, true);
            }
          }
        }
        syncEngine.triggerPush();
      }

      await api.renameFile(oldPath, newPath);

      // Update embeddings
      const store = loadStore();
      if (oldPath.toLowerCase().endsWith(".md")) {
        if (newPath.toLowerCase().endsWith(".md")) {
          renameEmbeddingPath(store, oldPath, newPath);
        } else {
          removeEmbedding(store, oldPath);
        }
      } else {
        // It might be a folder move, handle all nested md files
        renameEmbeddingsByPrefix(store, oldPath, newPath);
      }

      // Update Starred Notes
      setStarredNotes((prev) =>
        prev.map((p) => {
          if (p === oldPath) return newPath;
          if (p.startsWith(oldPath + "/")) {
            return newPath + p.substring(oldPath.length);
          }
          return p;
        }),
      );

      // Update Tabs
      setTabs((prev) =>
        prev.map((t) => {
          if (t.path === oldPath) {
            return { ...t, path: newPath, name: getNoteName(newPath) };
          }
          if (t.path.startsWith(oldPath + "/")) {
            const nestedPath = newPath + t.path.substring(oldPath.length);
            return { ...t, path: nestedPath, name: getNoteName(nestedPath) };
          }
          return t;
        }),
      );

      await refreshFileTree();
    } catch (err) {
      console.error("Move failed:", err);
      setModal({
        type: "confirm",
        title: "Move Failed",
        message: `Could not move ${oldPath} to ${newPath}.`,
      });
    }
  }, [refreshFileTree, clearAutoSaveTimer, setStarredNotes, setTabs]);

  const handleCreateFolder = async (parentPath: string) => {
    setModal({
      type: "prompt",
      title: "New Folder",
      message: "Enter folder name:",
      onConfirm: async (name) => {
        if (typeof name !== "string" || !name.trim()) return;

        const folderPath = parentPath ? `${parentPath}/${name}` : name;
        await api.createDirectory(folderPath);
        await refreshFileTree();
      },
    });
  };

  const handleCreateDailyNote = async () => {
    const filePath = await api.createDailyNote();
    await refreshFileTree();
    await openFile(filePath);
  };

  // Handle template insertion
  const handleTemplateInsert = (templateContent: string) => {
    if (activeTabId) {
      // Insert at cursor or append
      const newContent = currentContent + "\n" + templateContent;
      setCurrentContent(newContent);
      // Mark as modified
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, isModified: true } : t,
        ),
      );
    }
  };

  // Handle image paste/drop - embed compressed inline data URL (no attachments folder write)
  const handleImagePaste = async (file: File): Promise<string | null> => {
    const readFileAsDataUrl = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string" && result.startsWith("data:image/")) {
            resolve(result);
            return;
          }
          reject(new Error("Unsupported image data"));
        };
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(blob);
      });

    const loadImage = (imageFile: File) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const blobUrl = URL.createObjectURL(imageFile);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(blobUrl);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Failed to decode image"));
        };
        image.src = blobUrl;
      });

    const compressImageData = async (imageFile: File): Promise<string> => {
      const original = await readFileAsDataUrl(imageFile);
      const image = await loadImage(imageFile);
      const naturalWidth = image.naturalWidth || image.width || 1;
      const naturalHeight = image.naturalHeight || image.height || 1;
      const longestEdge = Math.max(naturalWidth, naturalHeight);
      const baseMaxEdge = Math.min(1600, longestEdge);
      const targetLength = 90000;
      const scaleSteps = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
      const qualitySteps = [0.84, 0.76, 0.68, 0.6, 0.52, 0.45];

      let best = original;

      for (const scale of scaleSteps) {
        const maxEdge = Math.max(320, Math.round(baseMaxEdge * scale));
        const ratio = Math.min(1, maxEdge / longestEdge);
        const width = Math.max(1, Math.round(naturalWidth * ratio));
        const height = Math.max(1, Math.round(naturalHeight * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) break;
        context.drawImage(image, 0, 0, width, height);

        for (const quality of qualitySteps) {
          const webpData = canvas.toDataURL("image/webp", quality);
          const candidate = webpData.startsWith("data:image/webp")
            ? webpData
            : canvas.toDataURL("image/jpeg", quality);

          if (candidate.length < best.length) {
            best = candidate;
          }

          if (best.length <= targetLength) {
            return best;
          }
        }
      }

      return best;
    };

    try {
      return await compressImageData(file);
    } catch (err) {
      console.error("Failed to embed image:", err);
      return null;
    }
  };

  // Get list of all note names for autocomplete
  const allNoteNames = useMemo(() => {
    const getNotes = (
      entries: FileEntry[],
    ): { name: string; path: string }[] => {
      const notes: { name: string; path: string }[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory && entry.extension === ".md") {
          // Extract name without extension
          const name =
            entry.path.replace(/\.md$/, "").split("/").pop() || entry.path;
          notes.push({ name, path: entry.path });
        }
        if (entry.children) {
          notes.push(...getNotes(entry.children));
        }
      }
      return notes;
    };
    return getNotes(fileTree);
  }, [fileTree]);

  useEffect(() => {
    const nextCount = allNoteNames.length;
    setFtuxState((prev: FTUXState) =>
      prev.notesCount === nextCount ? prev : { ...prev, notesCount: nextCount },
    );
  }, [allNoteNames.length]);

  useEffect(() => {
    if (ftuxState.acceptedSuggestions < 2 || ftuxState.trajectoryActivated) {
      return;
    }
    setFtuxState((prev: FTUXState) => ({
      ...prev,
      trajectoryActivated: true,
    }));
  }, [ftuxState.acceptedSuggestions, ftuxState.trajectoryActivated]);

  useEffect(() => {
    const isZeroStage = vaultPath !== null && ftuxState.notesCount === 0;
    if (!isZeroStage) return;

    setShowGraph(false);
    setShowCanvas(false);
    setShowThoughtModel(false);
    setShowSidebar(false);
  }, [ftuxState.notesCount, vaultPath]);

  useEffect(() => {
    if (ftuxState.notesCount < 4 || ftuxState.insightShown) {
      setFtuxInsightText(null);
      return;
    }

    let cancelled = false;

    const buildInsight = async () => {
      try {
        const candidatePaths = [...new Set([
          ...recentFiles.filter((path) => path.toLowerCase().endsWith(".md")),
          ...allNoteNames.map((note) => note.path),
        ])].slice(0, 6);

        if (candidatePaths.length < 2) {
          if (!cancelled) setFtuxInsightText(null);
          return;
        }

        const notes: { title: string; content: string }[] = [];
        for (const path of candidatePaths) {
          try {
            const content = await api.readFile(path);
            if (content.trim().length === 0) continue;
            notes.push({ title: getNoteName(path), content });
          } catch {
            // ignore unreadable notes
          }
        }

        if (notes.length < 2) {
          if (!cancelled) setFtuxInsightText(null);
          return;
        }

        const synthesis = await generateSynthesis(notes);
        const fallbackConcept = inlineSuggestions[0]?.sharedConcepts[0] || "your recent notes";
        const fallback = `You keep circling around ${fallbackConcept} from different angles.`;
        const insightLine =
          synthesis?.insight
            ?.replace(/^INSIGHT:\s*/i, "")
            .split("\n")
            .find((line) => line.trim().length > 0)
            ?.trim() || fallback;

        if (!cancelled) {
          setFtuxInsightText(insightLine);
        }
      } catch {
        if (!cancelled) {
          const fallbackConcept = inlineSuggestions[0]?.sharedConcepts[0] || "your ideas";
          setFtuxInsightText(
            `A recurring thread is forming around ${fallbackConcept}.`,
          );
        }
      }
    };

    void buildInsight();

    return () => {
      cancelled = true;
    };
  }, [
    allNoteNames,
    ftuxState.insightShown,
    ftuxState.notesCount,
    inlineSuggestions,
    recentFiles,
  ]);

  // Get note content for embeds - uses cache or fetches
  const getNoteContent = useCallback(
    (noteName: string): string | null => {
      // Check cache first
      const cached = noteContentCache.get(noteName);
      if (cached !== undefined) return cached;

      // Find the note path
      const note = allNoteNames.find(
        (n) => n.name.toLowerCase() === noteName.toLowerCase(),
      );

      if (!note) return null;

      // Async fetch and update cache (won't be immediate but will work on re-render)
      api.readFile(note.path).then((content) => {
        setNoteContentCache((prev) => new Map(prev).set(noteName, content));
      });

      return null;
    },
    [noteContentCache, allNoteNames],
  );

  // ── Commands (for Command Palette) ──────────────────
  const commands: Command[] = [
    {
      id: "new-note",
      label: "New Note",
      shortcut: "Ctrl+N",
      action: handleNewNote,
      category: "File",
    },
    {
      id: "open-vault",
      label: "Open Vault",
      shortcut: "Ctrl+O",
      action: handleOpenVault,
      category: "File",
    },
    {
      id: "save",
      label: "Save Current Note",
      shortcut: "Ctrl+S",
      action: handleSave,
      category: "File",
    },
    {
      id: "search-file",
      label: "Find/Replace in Note",
      shortcut: "Ctrl+F",
      action: () =>
        document.dispatchEvent(new CustomEvent("editor:open-search")),
      category: "Search",
    },
    {
      id: "search-vault",
      label: "Search Entire Vault",
      shortcut: "Ctrl+Shift+F",
      action: () => setShowSearch(true),
      category: "Search",
    },
    {
      id: "graph",
      label: "Open Graph Tab",
      shortcut: "Ctrl+G",
      action: () => openGraphAsTab(),
      category: "View",
    },
    {
      id: "graph-ai",
      label: "Open AI Graph Tab",
      action: () => {
        openGraphAsTab("ai");
      },
      category: "View",
    },
    {
      id: "sidebar",
      label: "Toggle Sidebar",
      shortcut: "Ctrl+B",
      action: () => setShowSidebar((s) => !s),
      category: "View",
    },
    {
      id: "backlinks",
      label: "Toggle Backlinks Panel",
      action: () => setShowBacklinks((b) => !b),
      category: "View",
    },
    {
      id: "outline",
      label: "Toggle Outline",
      action: () => setShowOutline((o) => !o),
      category: "View",
    },
    {
      id: "tags",
      label: "Toggle Tag Pane",
      action: () => setShowTags((t) => !t),
      category: "View",
    },
    {
      id: "outgoing-links",
      label: "Toggle Outgoing Links",
      action: () => setShowOutgoingLinks((o) => !o),
      category: "View",
    },
    {
      id: "properties",
      label: "Toggle Properties Panel",
      action: () => setShowProperties((p) => !p),
      category: "View",
    },
    {
      id: "daily-note",
      label: "Create Daily Note",
      action: handleCreateDailyNote,
      category: "Notes",
    },
    {
      id: "insert-template",
      label: "Insert Template",
      action: () => setShowTemplateModal(true),
      category: "Notes",
    },
    {
      id: "thought-model",
      label: "Open AI Assistant",
      action: () => setShowThoughtModel(true),
      category: "AI",
    },
    {
      id: "theme",
      label: "Toggle Theme",
      action: () =>
        setSettings((s) => ({
          ...s,
          theme: s.theme === "dark" ? "light" : "dark",
        })),
      category: "Settings",
    },
    {
      id: "settings",
      label: "Open Settings",
      action: () => setShowSettings(true),
      category: "Settings",
    },
    {
      id: "editor-mode",
      label: "Editor View",
      action: () => setViewMode("editor"),
      category: "View",
    },
    {
      id: "preview-mode",
      label: "Preview View",
      action: () => setViewMode("preview"),
      category: "View",
    },
    {
      id: "split-mode",
      label: "Split View",
      action: () => setViewMode("split"),
      category: "View",
    },
    {
      id: "canvas",
      label: "New Canvas",
      shortcut: "Ctrl+Shift+C",
      action: () => {
        void handleToggleCanvas();
      },
      category: "Canvas",
    },
    {
      id: "canvas-duplicate",
      label: "Duplicate Active Canvas",
      action: () => {
        void handleDuplicateCanvas();
      },
      category: "Canvas",
    },
    {
      id: "canvas-save-as",
      label: "Save Canvas As",
      action: () => {
        void handleSaveCanvasAs();
      },
      category: "Canvas",
    },
    ...recentCanvasFiles.slice(0, 8).map((path, index) => ({
      id: `canvas-recent-${index}`,
      label: `Open Recent Canvas: ${getNoteName(path)}`,
      action: () => {
        void openFile(path, "preview");
      },
      category: "Canvas",
    })),
    {
      id: "unlinked-mentions",
      label: "Toggle Unlinked Mentions",
      action: () => setShowUnlinkedMentions((u) => !u),
      category: "View",
    },
  ];

  // Get active tab info
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // ── Collaboration State ────────────────────────────────
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [invitesSent, setInvitesSent] = useState<any[]>([]);
  const [invitesReceived, setInvitesReceived] = useState<any[]>([]);

  const [currentUser, setCurrentUser] = useState(authManager.getUser());
  const [authLoading, setAuthLoading] = useState(authManager.getState().isLoading);

  useEffect(() => {
    const unsub = authManager.subscribe((state) => {
      setCurrentUser(state.user);
      setAuthLoading(state.isLoading);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!vaultPath) return;

    const currentUserId = currentUser?.id || null;
    const prevSub = collabSubRef.current;
    const didContextChange = prevSub.vaultPath !== vaultPath || prevSub.userId !== currentUserId;

    if (didContextChange) {
      // Context changed (e.g. vault switch or login/logout). Fully clear old space.
      collaborationEngine.clearActiveSpace();
      setCollaborators([]);
      setActiveUsers([]);
      setInvitesSent([]);

      collabSubRef.current = {
        vaultPath,
        userId: currentUserId,
        spaceId: null,
      };
    }

    // Connect sync engine to vault
    syncEngine.setActiveVault(vaultPath);

    // One-time initialization: find the space, subscribe to realtime.
    // This runs once per context change (vault switch or login).
    const initCollab = async () => {
      try {
        const space = await collaborationEngine.getSpaceForVault(vaultPath);
        if (space) {
          collabSubRef.current.spaceId = space.id;

          const collabs = await collaborationEngine.getCollaborators(space.id);
          setCollaborators(collabs);

          const sent = await collaborationEngine.getSentInvites(space.id);
          setInvitesSent(sent);

          // Subscribe to realtime changes + presence (called ONCE, not in polling)
          await collaborationEngine.subscribeToSpace(space.id);
        } else {
          setCollaborators([]);
          setActiveUsers([]);
          setInvitesSent([]);
        }
      } catch (err) {
        console.error('[App] Failed to init collab state:', err);
      }

      try {
        const incoming = await collaborationEngine.getIncomingInvites();
        setInvitesReceived(incoming);
      } catch { /* ignore */ }
    };

    // Lightweight polling: only refreshes collaborator lists and invites.
    // Does NOT call subscribeToSpace (that would tear down and recreate the channel).
    const refreshCollabData = async () => {
      const spaceId = collabSubRef.current.spaceId;
      if (!spaceId) return;

      try {
        const collabs = await collaborationEngine.getCollaborators(spaceId);
        setCollaborators(collabs);

        const sent = await collaborationEngine.getSentInvites(spaceId);
        setInvitesSent(sent);
      } catch { /* ignore */ }

      try {
        const incoming = await collaborationEngine.getIncomingInvites();
        setInvitesReceived(incoming);
      } catch { /* ignore */ }
    };

    // Listen for realtime presence updates from CollaborationEngine
    const unsubActiveUsers = collaborationEngine.onActiveUsersChange((users) => {
      setActiveUsers(users);
    });

    initCollab();
    const interval = setInterval(refreshCollabData, 15000);

    return () => {
      clearInterval(interval);
      unsubActiveUsers();
      // We DO NOT unsubscribe here to avoid tearing down the channel on every render.
      // Unsubscription is handled on context change (above) or actual component unmount (below).
    };
  }, [vaultPath, currentUser, authLoading]);

  // Unmount-only cleanup for collaboration and syncEngine
  useEffect(() => {
    return () => {
      collaborationEngine.clearActiveSpace();
      syncEngine.setActiveVault(null);
    };
  }, []);

  // Listen to collaboration bootstrapping status globally
  useEffect(() => {
    const unsub = collaborationEngine.onStatusChange((status) => {
      setCollabStatus(status);
      if (status.state === 'bootstrapping') {
        setShowSettings(false); // Close Settings modal instantly so the user can see the progress!
      }
      if (status.state === 'syncing' || status.state === 'ready') {
        if (vaultPath) {
          syncEngine.setActiveVault(vaultPath);
        }
        (async () => {
          const tree = await api.getFileTree();
          setFileTree(tree);
          runVaultInit(tree);
        })();
      }
    });
    return unsub;
  }, [vaultPath]);

  // Update presence when active note changes
  useEffect(() => {
    collaborationEngine.updatePresenceNote(activeTab?.path || null);
  }, [activeTab?.path]);

  // Combine collaborators for the SettingsPage display
  const displayCollaborators = React.useMemo(() => {
    return [...collaborators].sort((a, b) => {
      if (a.role === 'owner') return -1;
      if (b.role === 'owner') return 1;
      return 0;
    });
  }, [collaborators]);

  const handleInviteUser = async (email: string) => {
    const space = await collaborationEngine.getSpaceForVault(vaultPath || '');
    if (!space) return;
    try {
      await collaborationEngine.sendInvite(space.id, email);
      const sent = await collaborationEngine.getSentInvites(space.id);
      setInvitesSent(sent);
    } catch (err: any) {
      console.error('[App] Failed to send invite:', err);
    }
  };

  const handleRemoveCollaborator = async (id: string) => {
    setCollaborators((prev: any[]) => prev.filter((c: any) => c.id !== id));
  };

  const handleAcceptInvite = async (id: string) => {
    try {
      await collaborationEngine.acceptInvite(id);
      setInvitesReceived((prev: any[]) => prev.filter((i: any) => i.id !== id));
    } catch (err: any) {
      console.error('[App] Failed to accept invite:', err);
    }
  };

  const handleRejectInvite = async (id: string) => {
    try {
      await collaborationEngine.rejectInvite(id);
      setInvitesReceived((prev: any[]) => prev.filter((i: any) => i.id !== id));
    } catch (err: any) {
      console.error('[App] Failed to reject invite:', err);
    }
  };

  const activeTabIsCanvas = !!activeTab && isCanvasFile(activeTab.path);
  const activeTabIsGraph = !!activeTab && activeTab.path === GRAPH_TAB_PATH;
  const activeTabIsSpaces = !!activeTab && activeTab.path === SPACES_TAB_PATH;
  const activeTabIsPlugin = !!activeTab && activeTab.path.startsWith('__plugin__.');

  // Sync active file path to plugin API
  (window as any).__oo_active_file = activeTab?.path || null;
  const ftuxStage: FTUXStage = getFTUXStage(ftuxState);
  const isFTUXZeroState = Boolean(vaultPath) && ftuxStage === "zero";
  const isFTUXFirstNote = ftuxStage === "first_note";
  const isFTUXConnectionStage =
    ftuxStage === "connection" && ftuxState.notesCount >= 2 && ftuxState.notesCount <= 3;
  const notNowSuppressed = ftuxState.notesCount <= notNowSuppressedUntilNotes;

  const canShowFTUXPrompts =
    !!activeTab &&
    !activeTabIsCanvas &&
    !activeTabIsGraph &&
    !activeTabIsSpaces &&
    ftuxSuggestionIdle &&
    !showGraph &&
    !showCanvas;

  const showFTUXConnectionPrompt =
    canShowFTUXPrompts &&
    isFTUXConnectionStage &&
    !notNowSuppressed &&
    !!ftuxConnectionSuggestion;

  const showFTUXInsightPrompt =
    canShowFTUXPrompts &&
    !showFTUXConnectionPrompt &&
    ftuxStage === "insight" &&
    !!ftuxInsightText;

  const showFTUXGraphPrompt =
    canShowFTUXPrompts &&
    !showFTUXConnectionPrompt &&
    !showFTUXInsightPrompt &&
    ftuxStage === "graph" &&
    ftuxState.notesCount >= 5 &&
    ftuxState.acceptedConnections >= 1 &&
    !ftuxState.graphPromptShown;

  const showTrajectorySuggestions =
    ftuxState.trajectoryActivated &&
    ftuxState.acceptedSuggestions >= 2 &&
    !showFTUXConnectionPrompt &&
    !showFTUXInsightPrompt &&
    !showFTUXGraphPrompt;

  const editorSuggestions =
    !ftuxSuggestionIdle ||
    isFTUXFirstNote ||
    isFTUXConnectionStage ||
    showFTUXInsightPrompt ||
    showFTUXGraphPrompt
      ? []
      : inlineSuggestions;

  const editorNextStepSuggestions =
    !showTrajectorySuggestions ||
    !ftuxSuggestionIdle ||
    isFTUXFirstNote ||
    isFTUXConnectionStage ||
    showFTUXInsightPrompt ||
    showFTUXGraphPrompt
      ? []
      : nextStepSuggestions;

  const hasAuxPane = showGraph || showCanvas;
  const shouldShowEditorPane =
    (!showGraph || !graphFullScreen) &&
    (!showCanvas || !canvasFullScreen) &&
    (activeTab || !hasAuxPane);
  const shouldShowPaneResizer =
    shouldShowEditorPane && !graphFullScreen && !canvasFullScreen && hasAuxPane;

  const showVaultEntryTransitionScene =
    vaultEntryTransitionPhase !== "idle" &&
    (!vaultPath || isFTUXZeroState);

  const renderFTUXZeroState = () => (
    <div className={`ftux-zero-state ${hasFirstThoughtKeystroke ? "is-activated" : ""}`}>
      <form
        className={`ftux-first-thought-form ${hasFirstThoughtKeystroke ? "has-content" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreateFirstThought();
        }}
      >
        <div className="ftux-orientation-line">Start with a thought</div>

        <div
          className={`ftux-first-thought-shell ${isFirstThoughtFocused ? "is-focused" : ""} ${hasFirstThoughtKeystroke ? "is-typed" : ""}`}
        >
          <div
            className={`ftux-dynamic-prompt ${showFirstThoughtPromptEntry ? "is-visible" : ""} ${firstThoughtPromptCrossfading ? "is-crossfading" : ""} ${hasFirstThoughtKeystroke ? "is-hidden is-instant-hidden" : ""}`}
            style={{
              "--ftux-prompt-fade-ms": `${firstThoughtPromptFadeMs}ms`,
              "--ftux-prompt-overlap-delay-ms": `${firstThoughtPromptOverlapDelayMs}ms`,
            } as React.CSSProperties}
          >
            <span className="ftux-dynamic-prompt-text is-current">
              {FIRST_THOUGHT_PROMPTS[firstThoughtPromptIndex]}
            </span>
            {firstThoughtPromptNextIndex !== null && (
              <span className="ftux-dynamic-prompt-text is-next">
                {FIRST_THOUGHT_PROMPTS[firstThoughtPromptNextIndex]}
              </span>
            )}
          </div>

          <textarea
            ref={firstThoughtInputRef}
            className="ftux-first-thought-input"
            value={firstThoughtDraft}
            rows={3}
            onChange={(event) => {
              const next = event.target.value;
              setFirstThoughtDraft(next);
              if (showFirstThoughtExpansionHint) {
                setShowFirstThoughtExpansionHint(false);
              }
              if (!hasFirstThoughtKeystroke && next.length > 0) {
                if (firstThoughtPromptIntervalRef.current) {
                  clearTimeout(firstThoughtPromptIntervalRef.current);
                  firstThoughtPromptIntervalRef.current = null;
                }
                if (firstThoughtPromptFadeTimerRef.current) {
                  clearTimeout(firstThoughtPromptFadeTimerRef.current);
                  firstThoughtPromptFadeTimerRef.current = null;
                }
                if (firstThoughtEntryPromptTimerRef.current) {
                  clearTimeout(firstThoughtEntryPromptTimerRef.current);
                  firstThoughtEntryPromptTimerRef.current = null;
                }
                if (firstThoughtEntryGhostTimerRef.current) {
                  clearTimeout(firstThoughtEntryGhostTimerRef.current);
                  firstThoughtEntryGhostTimerRef.current = null;
                }
                if (firstThoughtEntryHintTimerRef.current) {
                  clearTimeout(firstThoughtEntryHintTimerRef.current);
                  firstThoughtEntryHintTimerRef.current = null;
                }
                setFirstThoughtPromptCrossfading(false);
                setFirstThoughtPromptNextIndex(null);
                setHasFirstThoughtKeystroke(true);
              }
            }}
            onFocus={() => {
              if (!firstThoughtAutoFocusSkipRef.current) {
                firstThoughtAutoFocusSkipRef.current = true;
                return;
              }
              setIsFirstThoughtFocused(true);
            }}
            onBlur={() => setIsFirstThoughtFocused(false)}
            onKeyDown={(event) => {
              if (!isFirstThoughtFocused) {
                setIsFirstThoughtFocused(true);
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (firstThoughtDraft.trim().length > 0) {
                  void handleCreateFirstThought();
                }
              }
            }}
            placeholder={FIRST_THOUGHT_PROMPTS[firstThoughtPromptIndex]}
            aria-label="Write your first thought"
            autoFocus
          />
        </div>

        {showFirstThoughtExpansionHint && firstThoughtExpansionPlan && (
          <div className="ftux-inline-expand-hint ftux-inline-expand-hint-fade-in">
            <div className="ftux-inline-expand-title">Continue this:</div>
            <ul className="ftux-inline-expand-list" style={{ listStyleType: "none", paddingLeft: 0, marginTop: "8px", marginBottom: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {firstThoughtExpansionPlan.suggestions.map((suggestion, index) => (
                <li
                  key={`${firstThoughtExpansionPlan.intent}-${index}`}
                  style={{
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: index === selectedSuggestionIndex ? "1px solid var(--border-strong)" : "1px solid transparent",
                    background: index === selectedSuggestionIndex ? "var(--bg-active)" : "transparent",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => setSelectedSuggestionIndex(index)}
                  onMouseEnter={(e) => {
                    if (index !== selectedSuggestionIndex) {
                      e.currentTarget.style.background = "var(--bg-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (index !== selectedSuggestionIndex) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <span style={{ marginRight: "8px", opacity: 0.5 }}>•</span>
                  {suggestion.label}
                </li>
              ))}
            </ul>
            <div className="ftux-inline-expand-actions">
              <button
                type="button"
                className="ftux-inline-expand-btn ftux-inline-expand-btn-primary"
                onClick={handleExpandFirstThought}
              >
                Continue
              </button>
              <button
                type="button"
                className="ftux-inline-expand-btn"
                onClick={handleIgnoreFirstThoughtExpansion}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className={`ftux-ghost-examples ${showFirstThoughtGhostEntry ? "is-visible" : ""} ${hasFirstThoughtKeystroke ? "is-hidden" : ""}`}>
          {FIRST_THOUGHT_GHOST_EXAMPLES.map((example) => (
            <div key={example} className="ftux-ghost-example">
              {example}
            </div>
          ))}
        </div>

        <div className={`ftux-intelligence-hint ${showFirstThoughtHintEntry ? "is-visible" : ""} ${hasFirstThoughtKeystroke ? "is-hidden" : ""}`}>
          Your thoughts will start connecting
        </div>
      </form>
    </div>
  );

  const leftPluginViews = pluginViews.filter(v => v.side === 'left');
  const rightPluginViews = pluginViews.filter(v => v.side === 'right');
  const mainPluginViews = pluginViews.filter(v => v.side === 'main');

  // Helper to render regular active tabs (canvas, database, plugin, editor)
  const renderActiveTabContent = useCallback((leafActiveTab: Tab, leaf: PaneLeaf): React.ReactNode => {
    const isThisFocused = leaf.id === focusedLeafId;
    const tabIsCanvas = isCanvasFile(leafActiveTab.path);
    const tabIsPlugin = leafActiveTab.path.startsWith('__plugin__.');

    if (tabIsCanvas) {
      return (
        <CanvasView
          onClose={() => closeTab(leafActiveTab.id)}
          isFullScreen={false}
          onToggleFullScreen={() => setCanvasFullScreen((f) => !f)}
          theme={theme}
          vaultPath={vaultPath!}
          fileTree={fileTree}
          canvasFilePath={leafActiveTab.path}
          onOpenFile={(path) => openFile(path)}
          onNewCanvas={() => { void handleToggleCanvas(); }}
          onDuplicateCanvas={() => { void handleDuplicateCanvas(); }}
          onSaveCanvasAs={() => { void handleSaveCanvasAs(); }}
          recentCanvasFiles={recentCanvasFiles}
          onOpenRecentCanvas={(path) => { void openFile(path, "preview"); }}
        />
      );
    }

    if (leafActiveTab.path.startsWith("__database__.")) {
      const folderPath = leafActiveTab.path.split("__database__.")[1];
      
      const findNodeByPath = (nodes: FileEntry[], targetPath: string): FileEntry | undefined => {
        for (const node of nodes) {
          if (node.path === targetPath) return node;
          if (node.children) {
            const found = findNodeByPath(node.children, targetPath);
            if (found) return found;
          }
        }
        return undefined;
      };

      const folderNode = findNodeByPath(fileTree, folderPath);
      if (!folderNode) {
        return <div className="p-8 text-text-muted">Folder not found: {folderPath}</div>;
      }

      return (
        <DatabaseView
          folderNode={folderNode}
          onOpenFile={openFile}
        />
      );
    }

    if (tabIsPlugin) {
      return (
        <div className="main-plugin-view-container" style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <PluginViewPanel
            views={pluginViews.filter(v => `__plugin__.${v.viewType}` === leafActiveTab.path)}
            onClose={(viewType) => {
              const app = ooAppRef.current;
              if (app) app.workspace.detachLeavesOfType(viewType);
            }}
            isMainView={true}
          />
        </div>
      );
    }

    // Regular markdown note
    const currentPath = leafActiveTab?.path || "";
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const activeTabIdPath = activeTab?.path || "";

    const leafSuggestions =
      !ftuxSuggestionIdle ||
      isFTUXFirstNote ||
      isFTUXConnectionStage ||
      showFTUXInsightPrompt ||
      showFTUXGraphPrompt
        ? []
        : (inlineSuggestionsByPath[currentPath] || (currentPath === activeTabIdPath ? inlineSuggestions : []));

    const leafNextStepSuggestions =
      !showTrajectorySuggestions ||
      !ftuxSuggestionIdle ||
      isFTUXFirstNote ||
      isFTUXConnectionStage ||
      showFTUXInsightPrompt ||
      showFTUXGraphPrompt
        ? []
        : (nextStepSuggestionsByPath[currentPath] || (currentPath === activeTabIdPath ? nextStepSuggestions : []));

    return (
      <LeafPaneEditor
        leaf={leaf}
        activeTab={leafActiveTab}
        theme={theme}
        allNoteNames={allNoteNames}
        editorSuggestions={leafSuggestions}
        editorNextStepSuggestions={leafNextStepSuggestions}
        inlineAnnotation={inlineAnnotationByPath[leafActiveTab.path] || getCachedAnnotation(leafActiveTab.path)}
        showInlineInsight={!!showInlineInsightByTab[leafActiveTab.id]}
        ftuxConnectionPulse={ftuxConnectionPulse}
        isFocused={isThisFocused}
        onTabSelect={(leafId, tabId) => handlePaneTabSelect(leafId, tabId)}
        onTabClose={closeTab}
        onLinkClick={handleLinkClick}
        onImagePaste={handleImagePaste}
        getNoteContent={getNoteContent}
        onAdjustFontSize={adjustEditorFontSize}
        onAcceptSuggestion={handleInlineAccept}
        onRejectSuggestion={handleInlineReject}
        onOpenNote={(path) => openFile(path)}
        onToggleInsight={(show) => setShowInlineInsightByTab((prev) => ({ ...prev, [leafActiveTab.id]: show }))}
        onContentChangeGlobal={handleContentChangeGlobal}
        activeUsers={activeUsers}
        getViewState={getViewState}
        onViewStateChange={handleScrollAndCursorChange}
        onGenerateInsight={() => handleGenerateInsight(leafActiveTab.path, leafActiveTab.id)}
        isGeneratingInsight={generatingInsightPaths.has(leafActiveTab.path)}
      />
    );
  }, [
    focusedLeafId, theme, vaultPath, fileTree, viewMode, currentContent,
    inlineSuggestions, nextStepSuggestions, inlineSuggestionsByPath, nextStepSuggestionsByPath,
    activeTabId, tabs, inlineAnnotationByPath, showInlineInsightByTab, ftuxConnectionPulse,
    mainPluginViews, recentCanvasFiles, allNoteNames, handlePaneTabSelect, activeUsers,
    ftuxSuggestionIdle, isFTUXFirstNote, isFTUXConnectionStage, showFTUXInsightPrompt, showFTUXGraphPrompt,
    showTrajectorySuggestions, getViewState, handleScrollAndCursorChange, handleGenerateInsight,
    generatingInsightPaths
  ]);

  // Render content for a single leaf pane in the split system
  const renderPaneContent = useCallback((leaf: PaneLeaf): React.ReactNode => {
    const leafActiveTab = leaf.tabs.find((t) => t.id === leaf.activeTabId);
    if (!leafActiveTab) {
      return (
        <div className="empty-state">
          <div className="empty-icon">
            <FileText size={48} strokeWidth={1} color="var(--text-muted)" />
          </div>
          <div className="empty-text">Select a note or create a new one</div>
        </div>
      );
    }

    const spacesTab = leaf.tabs.find((t) => t.path === SPACES_TAB_PATH);
    const graphTab = leaf.tabs.find((t) => t.path === GRAPH_TAB_PATH);

    const activePath = leafActiveTab.path;
    const activeIsSpaces = activePath === SPACES_TAB_PATH;
    const activeIsGraph = activePath === GRAPH_TAB_PATH;

    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        {/* Render active tab content (only if not special persistent tabs) */}
        {!activeIsSpaces && !activeIsGraph && (
          <div style={{ width: "100%", height: "100%" }}>
            {renderActiveTabContent(leafActiveTab, leaf)}
          </div>
        )}

        {/* Keep-Alive: Keep SpacesPage mounted in the DOM if it's open */}
        {spacesTab && (
          <div
            style={{
              display: activeIsSpaces ? "block" : "none",
              width: "100%",
              height: "100%",
            }}
          >
            <SpacesPage
              onClose={() => closeTab(spacesTab.id)}
              fileTree={fileTree}
              onOpenNote={(path) => { openFile(path); }}
            />
          </div>
        )}

        {/* Keep-Alive: Keep Graph View mounted in the DOM if it's open */}
        {graphTab && (
          <div
            style={{
              display: activeIsGraph ? "block" : "none",
              width: "100%",
              height: "100%",
            }}
          >
            <AIKnowledgeGraphFTUX
              onNodeClick={async (linkName: string, heading?: string, notePath?: string) => {
                setViewMode("preview");
                if (notePath) { await openFile(notePath, "preview"); return; }
                await handleLinkClick(linkName, heading);
              }}
              onClose={() => closeTab(graphTab.id)}
              isFullScreen={false}
              onToggleFullScreen={() => setGraphFullScreen((f) => !f)}
              theme={theme}
              vaultPath={vaultPath!}
              localNodePath={undefined}
              initialAIView={graphMode === "ai"}
              onAIViewChange={(enabled: boolean) => setGraphMode(enabled ? "ai" : "manual")}
              onCreateGroupFromPaths={handleCreateGroupFromPaths}
              onOpenPathsAsGroup={handleOpenPathsAsGroup}
            />
          </div>
        )}
      </div>
    );
  }, [
    tabs, fileTree, theme, vaultPath, graphMode, closeTab, openFile,
    renderActiveTabContent, handleLinkClick, setGraphFullScreen, setGraphMode
  ]);

  return (
    <DragCtx.Provider value={{ dragCtx, setDragCtx }}>
      <div className="app">
        <TitleBar
          theme={theme}
          onToggleSidebar={() => setShowSidebar((s) => !s)}
          showSidebar={showSidebar}
          onToggleRightSidebar={() => setShowRightSidebar((s) => !s)}
          showRightSidebar={showRightSidebar}
          leftWidth={44 + (showSidebar ? sidebarWidth : 0)}
          onNewNote={handleNewNote}
          onSearch={() => {
            document.dispatchEvent(new CustomEvent("editor:open-search"));
          }}
          onToggleExplorer={() => setShowSidebar((s) => !s)}
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={handleTabSelect}
          onTabClose={closeTab}
          onNewTab={handleOpenNewTab}
          onTabReorder={handleTabReorder}
          tabScrollRef={tabScrollRef}
          activeUsers={activeUsers}
          
          groups={groups}
          activeGroupId={activeGroupId}
          hasUnsavedChanges={hasUnsavedChanges}
          onRestoreGroup={handleRestoreGroup}
          onSaveGroup={handleUpdateActiveGroup}
          onRenameGroup={handleRenameGroup}
          onChangeGroupColor={handleChangeGroupColor}
          onToggleGroupAutoSave={handleToggleGroupAutoSave}
          onDuplicateGroup={handleDuplicateGroup}
          onDeleteGroup={handleDeleteGroup}
          onCreateGroupFromTab={handleCreateGroupFromTab}
          onAddTabToGroup={handleAddTabToGroup}
          onRemoveTabFromGroup={(tabId) => handleAddTabToGroup(tabId, null)}
          onMoveTabToGroup={handleAddTabToGroup}
          collapsedGroupIds={collapsedGroupIds}
          onToggleGroupCollapse={handleToggleGroupCollapse}
        />

      <div
        className="app-body workspace"
        ref={appBodyRef}
        style={{ 
          "--sidebar-width": `${sidebarWidth}px`,
          "--right-sidebar-width": `${rightSidebarWidth}px`
        } as any}
      >
        {vaultPath && !isFTUXZeroState && (
          <Ribbon
            onNewNote={handleNewNote}
            onSearch={() => {
              document.dispatchEvent(new CustomEvent("editor:open-search"));
            }}
            onGraph={() => {
              openGraphAsTab();
            }}
            onSettings={() => setShowSettings(true)}
            onDailyNote={handleCreateDailyNote}
            onToggleTags={() => setShowTags((t) => !t)}
            onToggleOutline={() => setShowOutline((o) => !o)}
            onThoughtModel={() => {
              setShowGraph(false);
              setShowCanvas(false);
              setShowThoughtModel((t) => !t);
            }}
            onSpaces={() => {
              openSpacesAsTab();
            }}
            onCanvas={() => {
              void handleToggleCanvas();
            }}
            pluginRibbonActions={pluginRibbonActions}
          />
        )}
        {vaultPath && !isFTUXZeroState && (
          <Sidebar
            visible={showSidebar}
            fileTree={fileTree}
            activeFilePath={activeTab?.path || null}
            starredNotes={starredNotes}
            onFileSelect={openFile}
            onNewNote={handleNewNote}
            onNewFolder={handleCreateFolder}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onMoveFile={handleMoveFile}
            onRefresh={refreshFileTree}
            onCollapse={() => setShowSidebar(false)}
            onToggleStar={(path) => {
              setStarredNotes((prev) =>
                prev.includes(path)
                  ? prev.filter((p) => p !== path)
                  : [...prev, path],
              );
            }}
            vaultPath={vaultPath}
            onOpenVault={handleOpenVault}
            previouslyOpenedVaults={previouslyOpenedVaults}
            onSwitchVault={handleSwitchVault}
            onSettings={() => setShowSettings(true)}
            pluginViews={leftPluginViews}
            onClosePluginView={(viewType) => {
              const app = ooAppRef.current;
              if (app) app.workspace.detachLeavesOfType(viewType);
            }}
            groups={groups}
            activeGroupId={activeGroupId}
            onCreateGroup={handleOpenCreateGroupModal}
            onRestoreGroup={handleRestoreGroup}
            onRenameGroup={handleRenameGroup}
            onChangeGroupColor={handleChangeGroupColor}
            onDeleteGroup={handleDeleteGroup}
            onDuplicateGroup={handleDuplicateGroup}
            onToggleGroupAutoSave={handleToggleGroupAutoSave}
          />
        )}

        {showSidebar && vaultPath && !isFTUXZeroState && (
          <div
            className="resizer"
            onMouseDown={startSidebarDrag}
            style={{ zIndex: 100 }}
          />
        )}

        <div
          className="main-content workspace-split mod-root"
          ref={mainContentRef}
          style={{
            display: "flex",
            flexDirection: "row",
            width: "100%",
            height: "100%",
          }}
        >
          {showVaultEntryTransitionScene ? (
            <div
              className={`vault-entry-transition-scene phase-${vaultEntryTransitionPhase}`}
            >
              <div className="vault-entry-layer vault-entry-layer-welcome">
                <WelcomeScreen
                  onOpenVault={handleWelcomeVaultAction}
                  transitionPhase={vaultEntryTransitionPhase}
                  theme={theme}
                />
              </div>

              {isFTUXZeroState && (
                <div className="vault-entry-layer vault-entry-layer-thought">
                  {renderFTUXZeroState()}
                </div>
              )}
            </div>
          ) : !vaultPath ? (
            <WelcomeScreen
              onOpenVault={handleWelcomeVaultAction}
              transitionPhase="idle"
              theme={theme}
            />
          ) : isFTUXZeroState ? (
            renderFTUXZeroState()
          ) : (
            <>
              {/* Split Pane System -- replaces the single editor pane */}
              {shouldShowEditorPane && (
                <div
                  style={{
                    flex: hasAuxPane ? `0 0 ${editorPaneWidth}%` : 1,
                    height: "100%",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >

                  <SplitPaneContainer
                    paneTree={paneTree}
                    onPaneTreeChange={handlePaneTreeChange}
                    renderContent={renderPaneContent}
                    onNewTab={handleNewNote}
                    onTabClose={closeTab}
                    onTabSelect={handlePaneTabSelect}
                    focusedLeafId={focusedLeafId}
                    onFocusLeaf={handleFocusLeaf}
                  />
                </div>
              )}

              {/* Resizer for Graph/Canvas */}
              {shouldShowPaneResizer && (
                <div className="resizer" onMouseDown={startPaneDrag} />
              )}

              {/* Graph View pane (legacy side pane mode) */}
              {showGraph && !activeTabIsGraph && (
                <div
                  style={{
                    flex:
                      graphFullScreen || !shouldShowEditorPane
                        ? 1
                        : `0 0 calc(${100 - editorPaneWidth}% - 4px)`,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <AIKnowledgeGraphFTUX
                    onNodeClick={async (
                      linkName: string,
                      heading?: string,
                      notePath?: string,
                    ) => {
                      setViewMode("preview");
                      if (graphFullScreen) {
                        setGraphFullScreen(false);
                      }
                      if (notePath) {
                        await openFile(notePath, "preview");
                        return;
                      }
                      await handleLinkClick(linkName, heading);
                    }}
                    onClose={() => setShowGraph(false)}
                    isFullScreen={graphFullScreen}
                    onToggleFullScreen={() => setGraphFullScreen((f) => !f)}
                    theme={theme}
                    vaultPath={vaultPath}
                    localNodePath={activeTab?.path}
                    initialAIView={graphMode === "ai"}
                    onAIViewChange={(enabled: boolean) =>
                      setGraphMode(enabled ? "ai" : "manual")
                    }
                  />
                </div>
              )}
              {/* Canvas View pane */}
              {showCanvas && (
                <div
                  style={{
                    flex:
                      canvasFullScreen || !shouldShowEditorPane
                        ? 1
                        : `0 0 calc(${100 - editorPaneWidth}% - 4px)`,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <CanvasView
                    onClose={() => setShowCanvas(false)}
                    isFullScreen={canvasFullScreen}
                    onToggleFullScreen={() => setCanvasFullScreen((f) => !f)}
                    theme={theme}
                    vaultPath={vaultPath}
                    fileTree={fileTree}
                    canvasFilePath={canvasFilePath}
                    onOpenFile={(path) => openFile(path)}
                    onNewCanvas={() => {
                      void handleToggleCanvas();
                    }}
                    onDuplicateCanvas={() => {
                      void handleDuplicateCanvas();
                    }}
                    onSaveCanvasAs={() => {
                      void handleSaveCanvasAs();
                    }}
                    recentCanvasFiles={recentCanvasFiles}
                    onOpenRecentCanvas={(path) => {
                      void openFile(path, "preview");
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Thought Model Panel - independent of graph */}
        {showThoughtModel && vaultPath && !isFTUXZeroState && (
          <>
            <div
              className="resizer"
              onMouseDown={startThoughtModelDrag}
              style={{ zIndex: 100 }}
            />
            <div
              className="thought-model-panel"
              style={{ width: `${thoughtModelWidth}px` }}
            >
              <AIPage
                vaultPath={vaultPath}
                theme={theme}
                fileTree={fileTree}
                activeNotePath={activeTab?.path.endsWith('.md') ? activeTab.path : null}
                onOpenNote={(path) => {
                  openFile(path);
                }}
                onClose={() => setShowThoughtModel(false)}
                isFullScreen={false}
                onToggleFullScreen={() => {}}
              />
            </div>
          </>
        )}

        {/* Right Panels */}
        {activeTab && !showGraph && !activeTabIsCanvas && !activeTabIsGraph && !isFTUXZeroState && (
          <>
            {showOutline && (
              <OutlinePane
                content={currentContent}
                onHeadingClick={(line) => {
                  // Scroll to line in editor
                  document.dispatchEvent(
                    new CustomEvent("editor:goto-line", { detail: line }),
                  );
                }}
                visible={showOutline}
              />
            )}

            {showOutgoingLinks && (
              <OutgoingLinksPanel
                content={currentContent}
                existingNotes={allNoteNames.map((n) => n.path)}
                onLinkClick={handleLinkClick}
                visible={showOutgoingLinks}
              />
            )}

            {showBacklinks && (
              <BacklinksPanel
                backlinks={backlinks}
                onBacklinkClick={openFile}
                onClose={() => setShowBacklinks(false)}
              />
            )}

            {showUnlinkedMentions && (
              <UnlinkedMentionsPanel
                currentNotePath={activeTab?.path || null}
                currentNoteName={activeTab?.name || ""}
                visible={showUnlinkedMentions}
                onNavigate={async (path, line) => {
                  await openFile(path);
                  if (line) {
                    setTimeout(() => {
                      document.dispatchEvent(
                        new CustomEvent("editor:goto-line", { detail: line }),
                      );
                    }, 150);
                  }
                }}
              />
            )}
          </>
        )}

        {showTags && !isFTUXZeroState && (
          <TagPane
            visible={showTags}
            onTagClick={(filePath) => openFile(filePath)}
          />
        )}

        {/* Plugin Views (right sidebar) */}
        {showRightSidebar && rightPluginViews.length > 0 && !isFTUXZeroState && (
          <>
            <div
              className="resizer right"
              onMouseDown={startRightSidebarDrag}
              style={{ zIndex: 100 }}
            />
            <PluginViewPanel
              views={rightPluginViews}
              width={rightSidebarWidth}
              onClose={(viewType) => {
                const app = ooAppRef.current;
                if (app) {
                  app.workspace.detachLeavesOfType(viewType);
                }
              }}
            />
          </>
        )}
      </div>

      {!isFTUXZeroState && (
        <StatusBar
          activeTab={activeTab || null}
          content={currentContent}
          theme={theme}
          viewMode={viewMode}
          fileTree={fileTree}
          queueStatus={queueStatus}
          pluginStatusBarItems={pluginStatusBarItems}
          vimEnabled={settings.vimMode}
        />
      )}

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSelect={(path) => {
            setShowSearch(false);
            openFile(path);
          }}
          recentFiles={recentFiles}
          starredNotes={starredNotes}
          fileTree={fileTree}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          commands={[
            ...commands,
            ...pluginCommands.map(pc => ({
              id: pc.id,
              label: pc.name,
              action: () => {
                if (pc.callback) pc.callback();
                else if (pc.checkCallback) pc.checkCallback(false);
              },
              category: pc.pluginId,
            })),
          ]}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {showSettings && (
        <SettingsPage
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setShowSettings(false)}
          initialSection={settingsSection as any}
          plugins={pluginList}
          pluginSettingTabs={pluginSettingTabs}
          onEnablePlugin={async (id) => { await pluginManagerRef.current?.enablePlugin(id); }}
          onDisablePlugin={async (id) => { await pluginManagerRef.current?.disablePlugin(id); }}
          onRefreshPlugins={async () => {
            await pluginManagerRef.current?.discoverPlugins();
          }}
          onReloadPlugin={async (id) => { await pluginManagerRef.current?.reloadPlugin(id); }}
          onInstallPlugin={async (repo, id) => {
            const pm = pluginManagerRef.current;
            if (!pm) {
              throw new Error('Plugin manager not initialized. Try restarting the app.');
            }
            try {
              const result = await pm.installFromGithubRepo(repo, id);
              return result;
            } catch (e: any) {
              console.error('[App] Plugin install error:', e);
              throw e;
            }
          }}
          collaborators={displayCollaborators}
          invitesSent={invitesSent}
          invitesReceived={invitesReceived}
          onInviteUser={handleInviteUser}
          onRemoveCollaborator={handleRemoveCollaborator}
          onAcceptInvite={handleAcceptInvite}
          onRejectInvite={handleRejectInvite}
          currentUserEmail={authManager.getUser()?.email}
          vaultPath={vaultPath || undefined}
          onVaultReconstructed={async (newPath) => {
            await api.setVaultPath(newPath);
            setVaultPath(newPath);
            (window as any).__oo_vault_path = newPath;
            setShowSidebar(true);
            const tree = await api.getFileTree();
            setFileTree(tree);
            runVaultInit(tree);

            try {
              const workspaceData = await readData<{ paneTree: PaneNode; activeTabId: string | null; focusedLeafId: string }>("workspace.json");
              if (workspaceData && workspaceData.paneTree) {
                setPaneTree(workspaceData.paneTree);
                setTabs(collectAllTabs(workspaceData.paneTree));
                if (workspaceData.activeTabId) setActiveTabId(workspaceData.activeTabId);
                if (workspaceData.focusedLeafId) setFocusedLeafId(workspaceData.focusedLeafId);
              } else {
                handleOpenNewTab();
              }
            } catch (err) {
              handleOpenNewTab();
            }

            setShowSettings(false); // Close settings
          }}

        />
      )}

      {permissionModalData && (
        <PluginPermissionModal
          manifest={permissionModalData.manifest}
          permissions={permissionModalData.permissions}
          onApprove={() => {
            permissionModalData.resolve(true);
            setPermissionModalData(null);
          }}
          onDeny={() => {
            permissionModalData.resolve(false);
            setPermissionModalData(null);
          }}
        />
      )}

      {showTemplateModal && (
        <TemplateModal
          onClose={() => setShowTemplateModal(false)}
          onInsert={handleTemplateInsert}
          currentNoteName={activeTab?.name}
        />
      )}

      {groupModalData && (
        <GroupModal
          title={groupModalData.title}
          initialName={groupModalData.initialName}
          initialColor={groupModalData.initialColor}
          onClose={handleGroupModalClose}
        />
      )}

      {modal && (
        <Modal
          type={modal.type}
          title={modal.title}
          message={modal.message}
          defaultValue={modal.defaultValue}
          onClose={(result) => {
            setModal(null);
            modal.onConfirm?.(result);
          }}
        />
      )}

      {collabStatus.state === 'bootstrapping' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 10, 12, 0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            background: 'rgba(25, 25, 30, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '40px',
            width: '450px',
            maxWidth: '90%',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: '3px solid color-mix(in srgb, var(--color-accent, var(--accent-primary, #3b82f6)) 20%, transparent)',
              borderTopColor: 'var(--color-accent, var(--accent-primary, #3b82f6))',
              animation: 'spin 1s linear infinite',
              marginBottom: '24px'
            }} />
            <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 600 }}>Reconstructing Vault</h2>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', minHeight: '20px' }}>
              {collabStatus.progress.message}
            </p>
            <div style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '12px'
            }}>
              <div style={{
                height: '100%',
                background: 'var(--color-accent, var(--accent-primary, #3b82f6))',
                width: `${collabStatus.progress.total > 0 ? Math.round((collabStatus.progress.current / collabStatus.progress.total) * 100) : 0}%`,
                transition: 'width 0.2s ease-out',
                borderRadius: '3px'
              }} />
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.4)', fontWeight: 500 }}>
              {collabStatus.progress.current} of {collabStatus.progress.total} files
            </div>
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
    </DragCtx.Provider>
  );
}
