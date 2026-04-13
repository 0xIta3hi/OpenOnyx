/**
 * Command Palette
 *
 * VS Code-style command launcher with fuzzy filtering.
 * Provides quick access to all application commands.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Command } from "../types";

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        (cmd.category && cmd.category.toLowerCase().includes(q)),
    );
  }, [query, commands]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-wrapper">
          <span className="search-icon">⌘</span>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="search-results">
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.id}
              className={`command-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => {
                cmd.action();
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="command-label">
                {cmd.category && (
                  <span
                    style={{ color: "var(--text-muted)", marginRight: "8px" }}
                  >
                    {cmd.category} ›
                  </span>
                )}
                {cmd.label}
              </span>
              {cmd.shortcut && (
                <span className="command-shortcut">{cmd.shortcut}</span>
              )}
            </button>
          ))}

          {filteredCommands.length === 0 && (
            <div className="empty-state" style={{ padding: "2rem" }}>
              <div className="empty-text">No commands found</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
