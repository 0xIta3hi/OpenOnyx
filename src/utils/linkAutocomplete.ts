/**
 * Link Autocomplete Extension for CodeMirror 6
 *
 * Provides autocomplete suggestions when typing [[ for wiki links.
 * Shows matching note names from the vault.
 */

import {
  CompletionContext,
  CompletionResult,
  autocompletion,
  Completion,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";

interface NoteInfo {
  name: string;
  path: string;
}

// Store for available notes - updated by the component
let availableNotes: NoteInfo[] = [];

export function setAvailableNotes(notes: NoteInfo[]) {
  availableNotes = notes;
}

// Completion function for wiki links
function wikiLinkCompletion(
  context: CompletionContext,
): CompletionResult | null {
  // Look for [[ pattern before cursor
  const before = context.matchBefore(/\[\[([^\]]*)/);

  if (!before) return null;

  // Don't trigger if we're inside a completed link
  const afterCursor = context.state.doc.sliceString(
    context.pos,
    context.pos + 2,
  );
  if (afterCursor.startsWith("]]")) return null;

  const query = before.text.slice(2).toLowerCase(); // Remove [[
  const from = before.from + 2; // Position after [[

  // Filter and sort notes by relevance
  let matches = availableNotes
    .filter((note) => note.name.toLowerCase().includes(query))
    .map((note) => ({
      note,
      // Score: exact match > starts with > contains
      score:
        note.name.toLowerCase() === query
          ? 0
          : note.name.toLowerCase().startsWith(query)
            ? 1
            : 2,
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.note.name.localeCompare(b.note.name);
    })
    .slice(0, 20); // Limit results

  if (matches.length === 0 && query.length > 0) {
    // Offer to create a new note
    return {
      from,
      options: [
        {
          label: query,
          detail: "(create new note)",
          type: "text",
          apply: query,
          boost: -1,
        },
      ],
    };
  }

  const options: Completion[] = matches.map(({ note }) => ({
    label: note.name,
    detail: note.path !== note.name + ".md" ? note.path : undefined,
    type: "text",
    apply: (
      view: EditorView,
      completion: Completion,
      from: number,
      to: number,
    ) => {
      // Insert the note name and close the link
      const insert = note.name + "]]";
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      });
    },
  }));

  return {
    from,
    options,
    validFor: /^[^\]]*$/,
  };
}

// Header completion for [[note#heading]] syntax
function headerCompletion(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(/\[\[([^\]#]+)#([^\]]*)/);

  if (!before) return null;

  // Extract note name and partial heading
  const match = before.text.match(/\[\[([^\]#]+)#([^\]]*)/);
  if (!match) return null;

  const noteName = match[1];
  const headingQuery = match[2].toLowerCase();
  const from = before.from + 2 + noteName.length + 1; // After [[notename#

  // Find the note and extract its headings
  const note = availableNotes.find(
    (n) => n.name.toLowerCase() === noteName.toLowerCase(),
  );
  if (!note) return null;

  // For now, return a placeholder - actual heading extraction would need async file reading
  return {
    from,
    options: [
      {
        label: "Loading headings...",
        type: "text",
        apply: "",
      },
    ],
  };
}

// Tag autocomplete for #tags
function tagCompletion(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(/#[a-zA-Z0-9_/-]*/);

  if (!before || before.text.length < 2) return null;

  const query = before.text.slice(1).toLowerCase();
  const from = before.from + 1;

  // Get unique tags from all notes (would need to be populated separately)
  // For now, just return empty - this would be populated from vault scan
  return null;
}

// Create the autocomplete extension
export function linkAutocomplete() {
  return autocompletion({
    override: [wikiLinkCompletion],
    activateOnTyping: true,
    maxRenderedOptions: 20,
    defaultKeymap: true,
    icons: false,
  });
}

// CSS styles for the autocomplete dropdown
export const linkAutocompleteTheme = EditorView.theme({
  ".cm-tooltip-autocomplete": {
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border-medium)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-lg)",
    maxHeight: "300px",
    overflow: "auto",
  },
  ".cm-tooltip-autocomplete ul": {
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
  },
  ".cm-tooltip-autocomplete li": {
    padding: "6px 12px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  ".cm-tooltip-autocomplete li:last-child": {
    borderBottom: "none",
  },
  ".cm-tooltip-autocomplete li[aria-selected]": {
    backgroundColor: "var(--bg-active)",
  },
  ".cm-completionLabel": {
    color: "var(--text-primary)",
  },
  ".cm-completionDetail": {
    color: "var(--text-muted)",
    fontSize: "var(--text-xs)",
    marginLeft: "8px",
  },
});
