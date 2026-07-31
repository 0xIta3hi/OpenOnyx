/**
 * FormattingToolbar — Trilium-style rich-text formatting strip
 * Dispatches markdown formatting commands to the active CodeMirror editor.
 */

import React from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  Image,
  Table,
  Highlighter,
  RemoveFormatting,
  ChevronDown,
  Type,
  AlignLeft,
  MoreHorizontal,
} from "lucide-react";

const toolbarClass =
  "trilium-toolbar flex h-9 min-h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--divider-color)] bg-[var(--bg-toolbar,var(--bg-secondary))] px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const groupClass = "flex items-center gap-0.5";
const sepClass = "mx-1 h-4 w-px shrink-0 bg-[var(--border-subtle)]";
const btnClass =
  "flex h-7 min-w-7 cursor-pointer items-center justify-center gap-0.5 rounded-[4px] border-0 bg-transparent px-1.5 text-[var(--text-secondary)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";
const btnWideClass = `${btnClass} px-2 text-[12px] font-medium`;

function dispatchFormat(command: string) {
  document.dispatchEvent(
    new CustomEvent("editor:format", { detail: { command } }),
  );
}

interface ToolBtnProps {
  title: string;
  command?: string;
  onClick?: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

function ToolBtn({ title, command, onClick, children, wide }: ToolBtnProps) {
  return (
    <button
      type="button"
      className={wide ? btnWideClass : btnClass}
      title={title}
      onClick={() => {
        if (onClick) onClick();
        else if (command) dispatchFormat(command);
      }}
    >
      {children}
    </button>
  );
}

export function FormattingToolbar() {
  return (
    <div className={toolbarClass} role="toolbar" aria-label="Formatting">
      <div className={groupClass}>
        <ToolBtn title="Heading" command="heading" wide>
          <Heading2 size={14} strokeWidth={1.75} />
          <span>Heading</span>
          <ChevronDown size={12} strokeWidth={2} className="opacity-60" />
        </ToolBtn>
        <ToolBtn title="Font size" command="font-size" wide>
          <Type size={14} strokeWidth={1.75} />
          <ChevronDown size={12} strokeWidth={2} className="opacity-60" />
        </ToolBtn>
      </div>

      <div className={sepClass} />

      <div className={groupClass}>
        <ToolBtn title="Bold (Ctrl+B)" command="bold">
          <Bold size={15} strokeWidth={2.25} />
        </ToolBtn>
        <ToolBtn title="Italic (Ctrl+I)" command="italic">
          <Italic size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Underline" command="underline">
          <Underline size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Strikethrough" command="strikethrough">
          <Strikethrough size={15} strokeWidth={1.75} />
        </ToolBtn>
      </div>

      <div className={sepClass} />

      <div className={groupClass}>
        <ToolBtn title="Highlight" command="highlight">
          <Highlighter size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Text color" command="text-color">
          <span className="relative flex h-4 w-4 items-center justify-center">
            <span className="text-[13px] font-semibold leading-none">A</span>
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#ef4444]" />
          </span>
        </ToolBtn>
        <ToolBtn title="Clear formatting" command="clear-format">
          <RemoveFormatting size={15} strokeWidth={1.75} />
        </ToolBtn>
      </div>

      <div className={sepClass} />

      <div className={groupClass}>
        <ToolBtn title="Bullet list" command="bullet-list">
          <List size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Numbered list" command="numbered-list">
          <ListOrdered size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Blockquote" command="blockquote">
          <Quote size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Inline code" command="code">
          <Code size={15} strokeWidth={1.75} />
        </ToolBtn>
      </div>

      <div className={sepClass} />

      <div className={groupClass}>
        <ToolBtn title="Link" command="link">
          <Link2 size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Image" command="image">
          <Image size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Table" command="table">
          <Table size={15} strokeWidth={1.75} />
        </ToolBtn>
        <ToolBtn title="Align" command="align">
          <AlignLeft size={15} strokeWidth={1.75} />
        </ToolBtn>
      </div>

      <div className="flex-1" />

      <div className={groupClass}>
        <ToolBtn title="More" command="more">
          <MoreHorizontal size={15} strokeWidth={1.75} />
        </ToolBtn>
      </div>
    </div>
  );
}
