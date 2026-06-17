// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  ConfirmationModal,
  Editor,
  ItemView,
  MarkdownRenderer,
  Plugin,
  SettingGroup,
  WorkspaceLeaf,
} from '../src/lib/obsidian-api';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Component } from '../src/lib/obsidian-api/components';
import { OOApp } from '../src/lib/obsidian-api/app';
import { getMarkdownProcessorCounts, runMarkdownPostProcessors } from '../src/lib/obsidian-api/markdown';
import { TFile } from '../src/lib/obsidian-api/files';
import { extractPluginBundleFromZip } from '../src/lib/pluginManager';
import { PluginManager } from '../src/lib/pluginManager';

const manifest = {
  id: 'compat-fixture',
  name: 'Compatibility Fixture',
  version: '1.0.0',
  minAppVersion: '1.0.0',
  description: '',
  author: 'test',
};

beforeEach(() => {
  document.body.innerHTML = '';
  (window as any).__oo_active_file = 'fixture.md';
  (window as any).electronAPI = {
    getVaultPath: vi.fn(async () => '/vault'),
    getFileTree: vi.fn(async () => []),
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => {}),
    readBinary: vi.fn(async () => new Uint8Array()),
    writeBinary: vi.fn(async () => {}),
    createFile: vi.fn(async () => {}),
    createDirectory: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
    deleteDirectory: vi.fn(async () => {}),
    renameFile: vi.fn(async () => {}),
    dataRead: vi.fn(async () => null),
    dataWrite: vi.fn(async () => {}),
    dataDelete: vi.fn(async () => {}),
    dataList: vi.fn(async () => []),
  };
});

describe('plugin runtime compatibility', () => {
  it('exposes the native plugin-manager contract to cross-plugin integrations', () => {
    const app = new OOApp();
    new PluginManager(app, {
      onCommandsChanged: vi.fn(),
      onRibbonChanged: vi.fn(),
      onStatusBarChanged: vi.fn(),
      onSettingTabsChanged: vi.fn(),
      onPluginsChanged: vi.fn(),
    });

    expect(app.plugins.getPlugin).toBeTypeOf('function');
    expect(app.plugins.getPluginFolder({ id: 'fixture' })).toContain('fixture');
    expect(app.plugins.enablePluginAndSave).toBeTypeOf('function');
    expect(app.plugins.disablePluginAndSave).toBeTypeOf('function');
    expect(app.customCss.snippets).toEqual([]);
    expect(app.customCss.enabledSnippets).toBeInstanceOf(Set);
    expect(app.customCss.requestLoadSnippets).toBeTypeOf('function');
  });

  it('provides collision-safe vault paths and file-manager creation methods', async () => {
    const app = new OOApp();
    await app.vault.create('Note.md', 'first');

    expect(app.vault.getAbstractFileByPathInsensitive('note.md')?.path).toBe('Note.md');
    expect(app.vault.getAvailablePath('note.md')).toBe('note 1.md');

    const created = await app.fileManager.createNewMarkdownFile(app.vault.getRoot(), 'Note', 'second');
    expect(created.path).toBe('Note 1.md');
    expect(app.fileManager.createNewFile).toBeTypeOf('function');
    expect(app.fileManager.promptForFileRename).toBeTypeOf('function');
  });

  it('updates metadata and exposes workspace integration helpers', async () => {
    const app = new OOApp();
    const file = await app.vault.create('Source.md', '# Heading\n[[Target]]');
    (window as any).electronAPI.readFile = vi.fn(async () => '# Heading\n[[Target]]');
    await app.metadataCache.updateFileCache(file);

    expect(app.metadataCache.getFileCache(file)?.headings?.[0].heading).toBe('Heading');
    expect(app.metadataCache.getBacklinksForFile(file).data).toBeInstanceOf(Map);

    const suggestion = {};
    app.workspace.editorSuggest.add(suggestion);
    expect(app.workspace.editorSuggest.suggests).toContain(suggestion);
    app.workspace.editorSuggest.remove(suggestion);
    expect(app.workspace.editorSuggest.suggests).not.toContain(suggestion);
    expect(app.workspace.getLayout().main.type).toBe('split');
  });

  it('extracts nested release ZIP bundles used by marketplace plugins', async () => {
    const zip = new JSZip();
    zip.file('plugin-release/manifest.json', JSON.stringify({
      id: 'zip-plugin',
      name: 'ZIP Plugin',
      version: '1.0.0',
    }));
    zip.file('plugin-release/main.js', 'module.exports = class ZipPlugin {};');
    zip.file('plugin-release/styles.css', '.zip-plugin { display: block; }');

    const bundle = await extractPluginBundleFromZip(
      await zip.generateAsync({ type: 'arraybuffer' }),
    );

    expect(JSON.parse(bundle.manifestText).id).toBe('zip-plugin');
    expect(bundle.mainText).toContain('ZipPlugin');
    expect(bundle.stylesText).toContain('.zip-plugin');
  });

  it('runs registered cleanup callbacks when a component unloads', () => {
    const component = new (Component as any)();
    const cleanup = vi.fn();
    component.register(cleanup);
    component.load();
    component.unload();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('renders and cleans up Markdown code block processors', async () => {
    const app = new OOApp();
    const plugin = new (Plugin as any)(app, manifest);
    plugin.registerMarkdownCodeBlockProcessor('fixture', (source: string, el: HTMLElement, ctx: any) => {
      el.textContent = `${ctx.sourcePath}:${source.trim()}`;
      ctx.addChild({ load: vi.fn(), unload: vi.fn() });
    });
    plugin.load();

    const container = document.createElement('div');
    container.innerHTML = '<pre><code class="language-fixture">hello</code></pre>';
    const cleanup = await runMarkdownPostProcessors(container, 'fixture.md');

    expect(container.querySelector('.block-language-fixture')?.textContent).toBe('fixture.md:hello');
    expect(getMarkdownProcessorCounts().codeBlockProcessors).toBe(1);
    cleanup();
    plugin.unload();
    expect(getMarkdownProcessorCounts().codeBlockProcessors).toBe(0);
  });

  it('supports export-plugin Markdown capture and post-process children', async () => {
    const captured: { children?: HTMLCollection } = {};
    await MarkdownRenderer.render(
      new OOApp(),
      '# Export\n\nRendered content',
      {
        appendChild(element: HTMLElement) {
          captured.children = element.children;
        },
      },
      'fixture.md',
      null,
    );

    expect(Array.from(captured.children ?? [])).toHaveLength(2);
    expect(captured.children?.[0].tagName).toBe('H1');

    let child: any;
    await MarkdownRenderer.postProcess(new OOApp(), {
      containerEl: document.createElement('div'),
      addChild(value: any) {
        child = value;
        value.load();
      },
    });
    expect(child.load).toBeTypeOf('function');
    expect(child.unload).toBeTypeOf('function');
  });

  it('creates modern confirmation controls', () => {
    const app = new OOApp();
    const modal = new ConfirmationModal(app);
    const clicked = vi.fn();
    modal
      .setTitle('Dangerous action')
      .addCheckbox('I understand', clicked)
      .addButton((button) => button.setButtonText('Continue').setInitialFocus())
      .addCancelButton();
    modal.open();

    expect(modal.titleEl.textContent).toBe('Dangerous action');
    expect(modal.buttonContainerEl.querySelectorAll('button')).toHaveLength(2);
    const checkbox = modal.contentEl.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.click();
    expect(clicked).toHaveBeenCalledWith(true);
    modal.close();
  });

  it('builds setting groups and custom workspace views', async () => {
    const app = new OOApp();
    const group = new SettingGroup(document.body)
      .setHeading('Group')
      .addSetting((setting) => setting.setName('Entry'));
    expect(group.listEl.textContent).toContain('Entry');

    class FixtureView extends (ItemView as any) {
      getViewType() { return 'fixture-view'; }
      getDisplayText() { return 'Fixture View'; }
      async onOpen() { this.contentEl.setText('ready'); }
    }

    app.workspace.registerViewCreator('fixture-view', (leaf: WorkspaceLeaf) => new FixtureView(leaf));
    const leaf = app.workspace.getRightLeaf(false)!;
    await leaf.setViewState({ type: 'fixture-view', active: true });
    expect(app.workspace.getLeavesOfType('fixture-view')).toHaveLength(1);
    expect(leaf.view.containerEl.textContent).toContain('ready');
    leaf.detach();
    expect(app.workspace.getLeavesOfType('fixture-view')).toHaveLength(0);
  });

  it('preserves binary vault data without base64 text conversion', async () => {
    const app = new OOApp();
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    const file = await app.vault.createBinary('asset.bin', bytes.buffer);
    expect((window as any).electronAPI.writeBinary).toHaveBeenCalledWith(
      'asset.bin',
      expect.objectContaining({ 0: 0, 4: 255 }),
    );
    (window as any).electronAPI.readBinary.mockResolvedValue(bytes);
    expect(Array.from(new Uint8Array(await app.vault.readBinary(file)))).toEqual(Array.from(bytes));

    await app.vault.adapter.writeBinary('plugin-resource.bin', bytes);
    expect((window as any).electronAPI.writeBinary).toHaveBeenCalledWith(
      'plugin-resource.bin',
      expect.objectContaining({ 0: 0, 4: 255 }),
    );
  });

  it('enumerates metadata cache files and exposes the active file view', async () => {
    const app = new OOApp();
    (app.metadataCache as any)._cache.set('drawing.excalidraw.md', { frontmatter: { 'excalidraw-plugin': 'parsed' } });
    expect(app.metadataCache.getCachedFiles()).toEqual(['drawing.excalidraw.md']);
    expect(app.workspace.getActiveFileView()).toBe(app.workspace.activeLeaf.view);
  });

  it('executes registered commands through the app command registry', () => {
    const app = new OOApp();
    const callback = vi.fn();
    (app as any).commands.addCommand({ id: 'fixture:run', callback });

    expect((app as any).commands.executeCommandById('fixture:run')).toBe(true);
    expect(callback).toHaveBeenCalledOnce();
    expect((app as any).commands.listCommands()).toHaveLength(1);

    (app as any).commands.removeCommand('fixture:run');
    expect((app as any).commands.executeCommandById('fixture:run')).toBe(false);
  });

  it('provides aggregate links, tags, suggestions, and parsed block cache', async () => {
    const app = new OOApp();
    const file = new TFile('fixture.md');
    file.vault = app.vault;
    (app.vault as any)._files.set(file.path, file);
    (window as any).electronAPI.readFile.mockResolvedValue(
      '---\ntags: alpha, beta\n---\n# Heading\nParagraph ^block-id\n[[Other]] #inline',
    );

    await app.metadataCache.buildCache(app.vault);

    expect(app.metadataCache.getLinks()['fixture.md']?.[0].link).toBe('Other');
    expect(app.metadataCache.getTags()).toMatchObject({ '#alpha': 1, '#beta': 1, '#inline': 1 });
    expect(app.metadataCache.getLinkSuggestions()[0]).toMatchObject({ path: 'fixture.md', file });
    expect(app.metadataCache.blockCache.getForFile(null, file).blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ display: 'Heading', node: expect.objectContaining({ type: 'heading', level: 1 }) }),
        expect.objectContaining({ display: 'Paragraph', node: expect.objectContaining({ id: 'block-id' }) }),
      ]),
    );
  });

  it('adapts CodeMirror 6 to the Obsidian Editor contract', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({ doc: 'alpha\nbeta' }),
    });
    const editor = new Editor(view);

    editor.setSelection({ line: 0, ch: 1 }, { line: 0, ch: 5 });
    expect(editor.getSelection()).toBe('lpha');
    editor.replaceSelection('ONE');
    editor.replaceRange('two', { line: 1, ch: 0 }, { line: 1, ch: 4 });
    editor.transaction({
      changes: [
        { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 }, text: 'A' },
        { from: { line: 1, ch: 0 }, to: { line: 1, ch: 3 }, text: 'TWO' },
      ],
      selection: { from: { line: 1, ch: 3 } },
    });

    expect(editor.getValue()).toBe('AONE\nTWO');
    expect(editor.getCursor()).toEqual({ line: 1, ch: 3 });
    expect(editor.posToOffset({ line: 1, ch: 2 })).toBe(7);
    expect(editor.offsetToPos(7)).toEqual({ line: 1, ch: 2 });

    view.destroy();
  });
});
