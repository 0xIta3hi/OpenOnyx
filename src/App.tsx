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
  type EmbeddingStore,
} from "./utils/embeddings";
import { getAnnotation, getCachedAnnotation, generateFirstThoughtExpansion } from "./utils/ai-core";
import { initializeVault, setQueueStatusCallback, type QueueStatus } from "./utils/background-queue";
import { type LinkType } from "./components/SuggestionBanner";
import { enrichSuggestions, type EnrichedSuggestion } from "./utils/suggestion-enrichment";
import { generateSynthesis } from "./utils/synthesis";
import { FileText, Layout } from "lucide-react";
import { Tab, ViewMode, Theme, Command, FileEntry } from "./types";
import type { PluginCommand, PluginRibbonAction, PluginStatusBarItem, PluginRegistration, PluginSettingTabRegistration } from "./types/plugin";
import { getNoteName, generateId, debounce } from "./utils/helpers";
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

const api = getAPI();
const MIN_EDITOR_FONT_SIZE = 12;
const MAX_EDITOR_FONT_SIZE = 24;
type FontZoomScope = "both" | "editor" | "preview";
type GraphMode = "manual" | "ai";

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

export default function App() {
  // ── Global State ────────────────────────────────────
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
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
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showUnlinkedMentions, setShowUnlinkedMentions] = useState(false);
  const [showThoughtModel, setShowThoughtModel] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [canvasFilePath, setCanvasFilePath] = useState<string | null>(null);
  const [canvasFullScreen, setCanvasFullScreen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Load settings from localStorage on initial render
    try {
      const saved = localStorage.getItem("notework-settings");
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
  const [pluginViews, setPluginViews] = useState<Array<{ viewType: string; displayText: string; icon: string; containerEl: HTMLElement }>>([]);
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

  // Sidebar drag resizer
  const [sidebarWidth, setSidebarWidth] = useState(260);

  const handleSidebarDrag = useCallback((e: MouseEvent) => {
    const newWidth = e.clientX - 48; // minus ribbon width
    if (newWidth > 150 && newWidth < 600) setSidebarWidth(newWidth);
  }, []);

  const stopSidebarDrag = useCallback(() => {
    document.removeEventListener("mousemove", handleSidebarDrag);
    document.removeEventListener("mouseup", stopSidebarDrag);
    document.body.style.cursor = "default";
  }, [handleSidebarDrag]);

  const startSidebarDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      document.addEventListener("mousemove", handleSidebarDrag);
      document.addEventListener("mouseup", stopSidebarDrag);
      document.body.style.cursor = "ew-resize";
    },
    [handleSidebarDrag, stopSidebarDrag],
  );

  // Thought Model panel drag resizer
  const [thoughtModelWidth, setThoughtModelWidth] = useState(400);

  const handleThoughtModelDrag = useCallback((e: MouseEvent) => {
    const appWidth = window.innerWidth - 48; // minus ribbon
    const newWidth = appWidth - e.clientX;
    if (newWidth > 300 && newWidth < 800) setThoughtModelWidth(newWidth);
  }, []);

  const stopThoughtModelDrag = useCallback(() => {
    document.removeEventListener("mousemove", handleThoughtModelDrag);
    document.removeEventListener("mouseup", stopThoughtModelDrag);
    document.body.style.cursor = "default";
  }, [handleThoughtModelDrag]);

  const startThoughtModelDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      document.addEventListener("mousemove", handleThoughtModelDrag);
      document.addEventListener("mouseup", stopThoughtModelDrag);
      document.body.style.cursor = "ew-resize";
    },
    [handleThoughtModelDrag, stopThoughtModelDrag],
  );

  // ── File & Editor State ─────────────────────────────
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [backlinks, setBacklinks] = useState<string[]>([]);

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
    localStorage.setItem("notework-settings", JSON.stringify(settings));
  }, [settings, theme]);

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
      scroller.querySelectorAll<HTMLElement>(".editor-tab"),
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

  // Helper: collect all .md paths from file tree
  const collectAllMdPaths = useCallback((entries: FileEntry[]): string[] => {
    const result: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory && entry.children) {
        result.push(...collectAllMdPaths(entry.children));
      } else if (!entry.isDirectory && entry.name.endsWith(".md")) {
        result.push(entry.path);
      }
    }
    return result;
  }, []);

  // Helper: run vault initialization (scan + enqueue missing embeddings)
  const runVaultInit = useCallback(async (tree: FileEntry[]) => {
    const mdPaths = collectAllMdPaths(tree);
    if (mdPaths.length === 0) return;

    // Read all note contents in parallel (batched)
    const allNotes: { path: string; content: string }[] = [];
    const BATCH = 10;
    for (let i = 0; i < mdPaths.length; i += BATCH) {
      const batch = mdPaths.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (p) => ({ path: p, content: await api.readFile(p) })),
      );
      for (const r of results) {
        if (r.status === "fulfilled") allNotes.push(r.value);
      }
    }

    // Get current active note and recent files for priority
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const activePath = activeTab?.path || null;

    initializeVault(allNotes, activePath, recentFiles, api);
  }, [collectAllMdPaths, tabs, activeTabId, recentFiles]);

  const initializeRef = useRef(false);

  // ── Sync global window property for plugin compatibility ─────
  useEffect(() => {
    (window as any).__oo_vault_path = vaultPath;
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
            })));
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
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, tabs, currentContent]);

  // ── Vault Operations ────────────────────────────────
  const handleOpenVault = async (): Promise<boolean> => {
    try {
      const path = await api.openVaultDialog();
      if (path) {
        await api.setVaultPath(path);
        setVaultPath(path);
        (window as any).__oo_vault_path = path;
        setShowSidebar(true);
        setTabs([]);
        setActiveTabId(null);
        setCurrentContent("");
        const tree = await api.getFileTree();
        setFileTree(tree);
        // Trigger background vault initialization for new vault
        runVaultInit(tree);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Failed to open vault:", e);
      alert("Failed to open vault. It may be too large or inaccessible.");
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
      const existingCanvasTab = tabs.find((t) => t.path === filePath);
      if (existingCanvasTab) {
        setActiveTabId(existingCanvasTab.id);
      } else {
        const canvasTab: Tab = {
          id: generateId(),
          path: filePath,
          name: getNoteName(filePath),
          isModified: false,
        };
        setTabs((prev) => [...prev, canvasTab]);
        setActiveTabId(canvasTab.id);
      }
      setCurrentContent("");
      setBacklinks([]);
      return;
    }

    // Check if tab already exists
    const existingTab = tabs.find((t) => t.path === filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
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

    setTabs((prev) => [...prev, newTab]);
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
          setInlineAnnotation(annotation);
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

  // ── Inline suggestions (appear inside editor) ──────────────────────────
  const [inlineSuggestions, setInlineSuggestions] = useState<EnrichedSuggestion[]>([]);
  const [nextStepSuggestions, setNextStepSuggestions] = useState<EnrichedSuggestion[]>([]);
  const [inlineAnnotation, setInlineAnnotation] = useState<string | null>(null);
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
    } catch { /* silent */ }
  }, []);

  const refreshInlineAnnotation = useCallback((notePath: string) => {
    const cached = getCachedAnnotation(notePath);
    setInlineAnnotation(cached);
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
      setInlineAnnotation(null);
    }
  }, [activeTabId, tabs, refreshInlineSuggestions, refreshInlineAnnotation]);

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
      // Auto-annotate (background, non-blocking)
      getAnnotation(path, content).then((ann) => {
        if (ann) setInlineAnnotation(ann);
      }).catch(() => { /* silent */ });
    } catch (err) {
      console.warn("[Auto-embed] Failed:", err);
    }
  }, [refreshInlineSuggestions]);

  const handleSave = async () => {
    if (!activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    if (isCanvasFile(tab.path) || tab.path === GRAPH_TAB_PATH || tab.path === SPACES_TAB_PATH) return;

    await api.writeFile(tab.path, currentContent);
    if (tab.path.toLowerCase().endsWith(".md")) {
      window.dispatchEvent(
        new CustomEvent("notework:note-content-changed", {
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
          new CustomEvent("notework:note-content-changed", {
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
              new CustomEvent("notework:note-content-changed", {
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
  const handleTabSelect = async (id: string) => {
    setActiveTabId(id);
    const tab = tabs.find((t) => t.id === id);
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
        if (isCanvasFile(lastTab.path) || lastTab.path === GRAPH_TAB_PATH) {
          setCurrentContent("");
          setBacklinks([]);
        } else {
          const content = await api.readFile(lastTab.path);
          setCurrentContent(content);
          loadBacklinks(lastTab.path);
        }
      } else {
        setActiveTabId(null);
        setCurrentContent("");
        setBacklinks([]);
      }
    }
  };

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
  const activeTabIsCanvas = !!activeTab && isCanvasFile(activeTab.path);
  const activeTabIsGraph = !!activeTab && activeTab.path === GRAPH_TAB_PATH;
  const activeTabIsSpaces = !!activeTab && activeTab.path === SPACES_TAB_PATH;

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

  return (
    <div className="app">
      <TitleBar
        theme={theme}
        onToggleSidebar={() => setShowSidebar((s) => !s)}
        showSidebar={showSidebar}
        leftWidth={44 + (showSidebar ? sidebarWidth : 0)}
        onNewNote={handleNewNote}
        onSearch={() => {
          document.dispatchEvent(new CustomEvent("editor:open-search"));
        }}
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabClose={closeTab}
        onNewTab={handleNewNote}
        onToggleExplorer={() => setShowSidebar((s) => !s)}
        tabScrollRef={tabScrollRef as React.RefObject<HTMLDivElement>}
      />

      <div
        className="app-body"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as any}
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
          className="main-content"
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
              {/* Editor pane - hidden when graph/canvas is fullscreen, or when no note is open and an auxiliary pane is visible */}
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
                  {activeTab ? (
                    <div
                      className={`ftux-editor-host ${ftuxConnectionPulse ? "ftux-connection-highlight-pulse" : ""}`}
                    >
                      <EditorHeader
                        filePath={activeTab.path}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        onThoughtModel={() => {
                          setShowGraph(false);
                          setShowCanvas(false);
                          setShowThoughtModel((t) => !t);
                        }}
                      />
                      <Editor
                        tabs={tabs}
                        activeTabId={activeTabId!}
                        content={currentContent}
                        viewMode={viewMode}
                        specialContent={
                          activeTabIsCanvas ? (
                            <CanvasView
                              onClose={() => closeTab(activeTab.id)}
                              isFullScreen={false}
                              onToggleFullScreen={() =>
                                setCanvasFullScreen((f) => !f)
                              }
                              theme={theme}
                              vaultPath={vaultPath}
                              fileTree={fileTree}
                              canvasFilePath={activeTab.path}
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
                          ) : activeTabIsGraph ? (
                            <AIKnowledgeGraphFTUX
                              onNodeClick={async (
                                linkName: string,
                                heading?: string,
                                notePath?: string,
                              ) => {
                                setViewMode("preview");
                                if (notePath) {
                                  await openFile(notePath, "preview");
                                  return;
                                }
                                await handleLinkClick(linkName, heading);
                              }}
                              onClose={() => closeTab(activeTab.id)}
                              isFullScreen={false}
                              onToggleFullScreen={() =>
                                setGraphFullScreen((f) => !f)
                              }
                              theme={theme}
                              vaultPath={vaultPath}
                              localNodePath={undefined}
                              initialAIView={graphMode === "ai"}
                              onAIViewChange={(enabled: boolean) =>
                                setGraphMode(enabled ? "ai" : "manual")
                              }
                            />
                          ) : activeTabIsSpaces ? (
                            <SpacesPage
                              onClose={() => closeTab(activeTab.id)}
                              fileTree={fileTree}
                              onOpenNote={(path) => {
                                openFile(path);
                              }}
                            />
                          ) : undefined
                        }
                        availableNotes={allNoteNames}
                        onAdjustFontSize={adjustEditorFontSize}
                        onTabSelect={async (id) => {
                          setActiveTabId(id);
                          const tab = tabs.find((t) => t.id === id);
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
                            const content = await api.readFile(tab.path);
                            setCurrentContent(content);
                            loadBacklinks(tab.path);
                          }
                        }}
                        onTabClose={closeTab}
                        onContentChange={handleContentChange}
                        onViewModeChange={setViewMode}
                        onLinkClick={handleLinkClick}
                        onImagePaste={handleImagePaste}
                        onGetNoteContent={getNoteContent}
                        suggestions={editorSuggestions}
                        nextStepSuggestions={editorNextStepSuggestions}
                        onAcceptSuggestion={handleInlineAccept}
                        onRejectSuggestion={handleInlineReject}
                        onOpenNote={(path) => openFile(path)}
                        annotation={inlineAnnotation}
                      />

                      {showFTUXConnectionPrompt && ftuxConnectionSuggestion && (
                        <div className="ftux-inline-card ftux-suggestion-fade-in">
                          <div className="ftux-inline-card-text">
                            This might connect to your previous idea
                          </div>
                          <div className="ftux-inline-card-actions">
                            <button
                              type="button"
                              className="ftux-action-btn ftux-action-btn-primary"
                              onClick={() =>
                                void handleInlineAccept(ftuxConnectionSuggestion.path, "related")
                              }
                            >
                              Link
                            </button>
                            <button
                              type="button"
                              className="ftux-action-btn"
                              onClick={() => handleInlineReject(ftuxConnectionSuggestion.path)}
                            >
                              Not now
                            </button>
                          </div>
                        </div>
                      )}

                      {showFTUXInsightPrompt && ftuxInsightText && (
                        <div className="ftux-insight-card ftux-insight-fade-in">
                          <div className="ftux-insight-title">
                            Something interesting is emerging...
                          </div>
                          <div className="ftux-insight-text">{ftuxInsightText}</div>
                          <div className="ftux-inline-card-actions">
                            <button
                              type="button"
                              className="ftux-action-btn ftux-action-btn-primary"
                              onClick={() => {
                                void handleSaveInsight();
                              }}
                            >
                              Save insight
                            </button>
                            <button
                              type="button"
                              className="ftux-action-btn"
                              onClick={handleIgnoreInsight}
                            >
                              Ignore
                            </button>
                          </div>
                        </div>
                      )}

                      {showFTUXGraphPrompt && (
                        <div className="ftux-graph-prompt ftux-suggestion-fade-in">
                          <span>See how your ideas connect</span>
                          <button
                            type="button"
                            className="ftux-action-btn ftux-action-btn-primary"
                            onClick={handleOpenGraphFromPrompt}
                          >
                            Open graph
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <FileText
                          size={48}
                          strokeWidth={1}
                          color="var(--text-muted)"
                        />
                      </div>
                      <div className="empty-text">
                        Select a note or create a new one
                      </div>
                    </div>
                  )}
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
        {pluginViews.length > 0 && !isFTUXZeroState && (
          <PluginViewPanel
            views={pluginViews}
            onClose={(viewType) => {
              const app = ooAppRef.current;
              if (app) {
                app.workspace.detachLeavesOfType(viewType);
              }
            }}
          />
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
    </div>
  );
}
