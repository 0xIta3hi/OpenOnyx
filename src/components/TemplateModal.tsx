/**
 * Template System
 *
 * Handles template insertion and variable substitution.
 * Supports template variables like {{date}}, {{title}}, {{time}}.
 */

import React, { useState, useEffect } from "react";
import { FileText, Clock, Calendar, User, Hash } from "lucide-react";
import { getAPI } from "../utils/api";

interface TemplateModalProps {
  onClose: () => void;
  onInsert: (content: string) => void;
  currentNoteName?: string;
}

interface Template {
  name: string;
  path: string;
  content: string;
}

// Template variable substitutions
function processTemplateVariables(content: string, noteName?: string): string {
  const now = new Date();

  const variables: Record<string, string> = {
    // Date variables
    "{{date}}": now.toISOString().split("T")[0], // YYYY-MM-DD
    "{{date:YYYY-MM-DD}}": now.toISOString().split("T")[0],
    "{{date:DD-MM-YYYY}}": `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`,
    "{{date:MMMM D, YYYY}}": now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),

    // Time variables
    "{{time}}": now.toTimeString().split(" ")[0].slice(0, 5), // HH:MM
    "{{time:HH:mm}}": now.toTimeString().split(" ")[0].slice(0, 5),
    "{{time:HH:mm:ss}}": now.toTimeString().split(" ")[0],

    // Title/name
    "{{title}}": noteName || "Untitled",
    "{{name}}": noteName || "Untitled",

    // Day of week
    "{{day}}": now.toLocaleDateString("en-US", { weekday: "long" }),
    "{{weekday}}": now.toLocaleDateString("en-US", { weekday: "long" }),

    // ISO timestamp
    "{{timestamp}}": now.toISOString(),

    // Random ID
    "{{uuid}}": crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  };

  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(
      new RegExp(key.replace(/[{}]/g, "\\$&"), "g"),
      value,
    );
  }

  // Handle custom date formats: {{date:format}}
  result = result.replace(/\{\{date:([^}]+)\}\}/g, (match, format) => {
    return formatDate(now, format);
  });

  return result;
}

// Simple date formatter
function formatDate(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MMMM: date.toLocaleDateString("en-US", { month: "long" }),
    MMM: date.toLocaleDateString("en-US", { month: "short" }),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    M: String(date.getMonth() + 1),
    DD: String(date.getDate()).padStart(2, "0"),
    D: String(date.getDate()),
    dddd: date.toLocaleDateString("en-US", { weekday: "long" }),
    ddd: date.toLocaleDateString("en-US", { weekday: "short" }),
    HH: String(date.getHours()).padStart(2, "0"),
    H: String(date.getHours()),
    mm: String(date.getMinutes()).padStart(2, "0"),
    m: String(date.getMinutes()),
    ss: String(date.getSeconds()).padStart(2, "0"),
    s: String(date.getSeconds()),
  };

  let result = format;
  // Sort by length descending to replace longer tokens first
  const sortedTokens = Object.keys(tokens).sort((a, b) => b.length - a.length);
  for (const token of sortedTokens) {
    result = result.replace(new RegExp(token, "g"), tokens[token]);
  }
  return result;
}

export function TemplateModal({
  onClose,
  onInsert,
  currentNoteName,
}: TemplateModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );
  const [preview, setPreview] = useState("");

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const api = getAPI();
        const tree = await api.getFileTree();

        // Look for templates folder
        const findTemplates = (entries: any[], path = ""): Template[] => {
          const results: Template[] = [];
          for (const entry of entries) {
            if (entry.isDirectory) {
              if (entry.name.toLowerCase() === "templates") {
                // Found templates folder, load all .md files
                if (entry.children) {
                  for (const child of entry.children) {
                    if (!child.isDirectory && child.extension === ".md") {
                      results.push({
                        name: child.name.replace(".md", ""),
                        path: child.path,
                        content: "", // Will load on selection
                      });
                    }
                  }
                }
              } else if (entry.children) {
                results.push(...findTemplates(entry.children, entry.path));
              }
            }
          }
          return results;
        };

        const found = findTemplates(tree);
        setTemplates(found);
      } catch (err) {
        console.error("Failed to load templates:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const handleSelectTemplate = async (template: Template) => {
    try {
      const api = getAPI();
      const content = await api.readFile(template.path);
      const processed = processTemplateVariables(content, currentNoteName);
      setSelectedTemplate({ ...template, content });
      setPreview(processed);
    } catch (err) {
      console.error("Failed to load template:", err);
    }
  };

  const handleInsert = () => {
    if (preview) {
      onInsert(preview);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="template-modal-header">
          <h3>Insert Template</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="template-modal-body">
          <div className="template-list">
            {loading ? (
              <div className="template-loading">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="template-empty">
                <FileText size={32} />
                <p>No templates found.</p>
                <small>
                  Create a "Templates" folder in your vault and add .md files.
                </small>
              </div>
            ) : (
              templates.map((template) => (
                <button
                  key={template.path}
                  className={`template-item ${selectedTemplate?.path === template.path ? "selected" : ""}`}
                  onClick={() => handleSelectTemplate(template)}
                >
                  <FileText size={16} />
                  <span>{template.name}</span>
                </button>
              ))
            )}
          </div>

          <div className="template-preview">
            {selectedTemplate ? (
              <>
                <div className="template-preview-header">
                  <span>Preview</span>
                </div>
                <div className="template-preview-content">
                  <pre>{preview}</pre>
                </div>
              </>
            ) : (
              <div className="template-preview-empty">
                Select a template to preview
              </div>
            )}
          </div>
        </div>

        <div className="template-modal-footer">
          <div className="template-variables-hint">
            <strong>Variables:</strong> {"{{date}}"}, {"{{time}}"},{" "}
            {"{{title}}"}, {"{{day}}"}, {"{{timestamp}}"}
          </div>
          <div className="template-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleInsert}
              disabled={!preview}
            >
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export the variable processor for use elsewhere
export { processTemplateVariables };
