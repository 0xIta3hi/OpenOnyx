import React from "react";
import { BacklinksPanel } from "./BacklinksPanel";
import { OutgoingLinksPanel } from "./OutgoingLinksPanel";
import { OutlinePane } from "./OutlinePane";
import { UnlinkedMentionsPanel } from "./UnlinkedMentionsPanel";
import { X } from "lucide-react";
import { getPluginScopeClass } from "../lib/pluginStyles";

export type RightSidebarTabType = "backlinks" | "outgoing" | "outline" | string;

interface PluginViewHostProps {
  view: { containerEl: HTMLElement; pluginId?: string };
}

function PluginViewHost({ view }: PluginViewHostProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !view) return;

    // Clear previous content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Apply plugin CSS scope class
    if (view.pluginId) {
      const scopeClass = getPluginScopeClass(view.pluginId);
      view.containerEl.classList.add(scopeClass);
    }

    // Mount the plugin's DOM element
    container.appendChild(view.containerEl);

    return () => {
      // Don't destroy the element on unmount — just detach it
      if (view.containerEl.parentNode === container) {
        container.removeChild(view.containerEl);
      }
    };
  }, [view]);

  return <div ref={containerRef} className="h-full w-full overflow-auto" />;
}

interface RightSidebarProps {
  activeTab: RightSidebarTabType;
  currentContent: string;
  allNoteNames: { name: string; path: string }[];
  handleLinkClick: (name: string, heading?: string) => void;
  backlinks: string[];
  openFile: (path: string, mode?: any) => void | Promise<void>;
  activeFilePath: string | null;
  activeFileName: string;
  width: number;
  rightPluginViews?: Array<{
    viewType: string;
    displayText: string;
    icon: string;
    containerEl: HTMLElement;
    side: "left" | "right" | "main";
    pluginId?: string;
  }>;
  onClosePluginView?: (viewType: string) => void;
}

export function RightSidebar({
  activeTab,
  currentContent,
  allNoteNames,
  handleLinkClick,
  backlinks,
  openFile,
  activeFilePath,
  activeFileName,
  width,
  rightPluginViews = [],
  onClosePluginView,
}: RightSidebarProps) {
  const activePluginView = rightPluginViews.find((v) => v.viewType === activeTab);

  return (
    <div
      className="flex flex-col h-full bg-(--bg-secondary) border-l border-(--border-subtle) select-none overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {/* Active Tab Panel Body */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "outline" && (
          <OutlinePane
            content={currentContent}
            onHeadingClick={(line) => {
              document.dispatchEvent(
                new CustomEvent("editor:goto-line", { detail: line })
              );
            }}
            visible={true}
          />
        )}

        {activeTab === "outgoing" && (
          <OutgoingLinksPanel
            content={currentContent}
            allNoteNames={allNoteNames}
            activeFileName={activeFileName}
            onLinkClick={handleLinkClick}
            visible={true}
          />
        )}

        {activeTab === "backlinks" && (
          <div className="flex flex-col h-full overflow-y-auto">
            {/* Linked Mentions */}
            <div className="shrink-0">
              <BacklinksPanel
                backlinks={backlinks}
                currentNoteName={activeFileName}
                onBacklinkClick={async (path, line) => {
                  await openFile(path);
                  if (line) {
                    setTimeout(() => {
                      document.dispatchEvent(
                        new CustomEvent("editor:goto-line", { detail: line })
                      );
                    }, 150);
                  }
                }}
              />
            </div>
            {/* Unlinked Mentions */}
            <div className="flex-1 border-t border-(--border-subtle)">
              <UnlinkedMentionsPanel
                currentNotePath={activeFilePath}
                currentNoteName={activeFileName}
                visible={true}
                onNavigate={async (path, line) => {
                  await openFile(path);
                  if (line) {
                    setTimeout(() => {
                      document.dispatchEvent(
                        new CustomEvent("editor:goto-line", { detail: line })
                      );
                    }, 150);
                  }
                }}
              />
            </div>
          </div>
        )}

        {activePluginView && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-(--border-subtle) bg-(--bg-secondary) px-3 text-[11px] font-medium text-(--text-muted)">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{activePluginView.displayText}</span>
              {onClosePluginView && (
                <button
                  className="hover:text-(--danger) opacity-60 hover:opacity-100 transition-opacity border-0 bg-transparent cursor-pointer p-0 flex items-center justify-center text-(--text-muted)"
                  onClick={() => onClosePluginView(activePluginView.viewType)}
                  title="Close panel"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <PluginViewHost view={activePluginView} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
