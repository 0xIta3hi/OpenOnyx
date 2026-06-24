/*
 * Runs a disposable Electron smoke test against an installed Excalidraw plugin.
 * The drawing created by the command is deleted before the process exits.
 *
 * Usage:
 *   OO_EXCALIDRAW_VAULT=/path/to/vault node scripts/test-excalidraw-live.cjs
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const vault = process.env.OO_EXCALIDRAW_VAULT;
const vitePort = Number(process.env.OO_EXCALIDRAW_VITE_PORT || 5174);
const debugPort = Number(process.env.OO_EXCALIDRAW_DEBUG_PORT || 9225);

if (!vault) {
  throw new Error('Set OO_EXCALIDRAW_VAULT to a vault with Excalidraw enabled.');
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, label, timeoutMs = 30_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`${label} did not become ready${lastError ? `: ${lastError.message}` : ''}`);
}

async function evaluate(expression) {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const target = targets.find((entry) => entry.type === 'page' && entry.url.startsWith(`http://127.0.0.1:${vitePort}`));
  if (!target) throw new Error('OpenObsidian renderer target was not found.');

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out evaluating renderer expression.'));
    }, 30_000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }));
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.result.exceptionDetails) {
        reject(new Error(
          message.result.exceptionDetails.exception?.description
          || message.result.exceptionDetails.text,
        ));
        return;
      }
      resolve(message.result.result.value);
    });
    socket.addEventListener('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

const vite = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1',
  '--port', String(vitePort),
  '--strictPort',
], {
  cwd: root,
  stdio: 'pipe',
});

let electron;

async function main() {
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${vitePort}`);
    return response.ok;
  }, 'Vite');

  const electronEnv = {
    ...process.env,
    NODE_ENV: 'development',
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${vitePort}`,
    OPENOBSIDIAN_DEBUG_PORT: String(debugPort),
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  electron = spawn(require('electron'), ['.'], {
    cwd: root,
    stdio: 'pipe',
    env: electronEnv,
  });

  await waitFor(async () => {
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
    return targets.some((entry) => entry.type === 'page' && entry.url.startsWith(`http://127.0.0.1:${vitePort}`));
  }, 'Electron debugger');

  await evaluate(`electronAPI.setVaultPath(${JSON.stringify(vault)}).then(() => location.reload())`);
  await waitFor(async () => {
    const plugins = await evaluate(`Object.keys(app?.plugins?.plugins || {})`);
    return plugins.includes('obsidian-excalidraw-plugin');
  }, 'Excalidraw plugin');
  await waitFor(
    async () => await evaluate(`Boolean(app?.commands?.commands?.['obsidian-excalidraw-plugin:excalidraw-autocreate-newtab'])`),
    'Excalidraw create command',
  );

  const result = await evaluate(`
    (async () => {
      const errors = [];
      const describeError = (error) => error?.stack || String(error);
      const onError = (event) => {
        errors.push(describeError(event.error || event.message));
        event.preventDefault();
      };
      const onRejection = (event) => {
        errors.push(describeError(event.reason));
        event.preventDefault();
      };
      const themeProbe = document.createElement('div');
      themeProbe.className = 'theme-light';
      document.body.appendChild(themeProbe);
      const computedTheme = getComputedStyle(themeProbe);
      const themeVariables = {
        backgroundPrimary: computedTheme.getPropertyValue('--background-primary').trim(),
        textNormal: computedTheme.getPropertyValue('--text-normal').trim(),
      };
      themeProbe.remove();
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      let createdPath = null;
      try {
        const before = new Set(app.vault.getFiles().map((file) => file.path));
        const commandId = 'obsidian-excalidraw-plugin:excalidraw-autocreate-newtab';
        if (!app.commands.executeCommandById(commandId)) throw new Error('Excalidraw create command did not execute.');

        await new Promise((resolve) => setTimeout(resolve, 9_000));
        const created = app.vault.getFiles().find((file) => !before.has(file.path) && file.path.endsWith('.excalidraw.md'));
        createdPath = created?.path || null;
        await window.__oo_open_file?.(createdPath);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const view = app.workspace.activeLeaf?.view;
        const plugin = app.plugins.getPlugin('obsidian-excalidraw-plugin');
        const insertFileCommandExecuted = app.commands.executeCommandById('obsidian-excalidraw-plugin:universal-add-file');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const insertFileInput = document.querySelector('.excalidraw-modal input');
        if (insertFileInput) {
          insertFileInput.focus();
          insertFileInput.dispatchEvent(new Event('focus'));
          insertFileInput.value = 'Natural';
          insertFileInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        const insertFileSuggestions = document.querySelectorAll('.suggestion-item').length;
        const insertFileSuggestionText = Array.from(document.querySelectorAll('.suggestion-container'))
          .map((element) => element.textContent || '')
          .join('\\n');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        const result = {
          createdPath,
          errors,
          viewType: view?.getViewType?.(),
          routedViewType: app.workspace.activeLeaf?.view?.getViewType?.(),
          viewFile: view?.file?.path,
          hasContentEl: view?.contentEl instanceof HTMLElement,
          hasCanvasApi: typeof view?.excalidrawAPI?.getSceneElements === 'function',
          activeViewMatches: plugin?.activeExcalidrawView === view,
          pluginReady: plugin?.isReady,
          pluginLoaded: plugin?._loaded,
          insertFileCommandExecuted,
          insertFileSuggestions,
          insertFileSuggestionText,
          hasInsertFileInput: !!insertFileInput,
          themeVariables,
          registeredExtensions: app.workspace?._extensionViews
            ? Array.from(app.workspace._extensionViews.entries())
            : [],
          cachedFile: created ? app.metadataCache.getFileCache(created) : null,
          knownExcalidrawFiles: plugin?.fileManager?.getExcalidrawFiles
            ? Array.from(plugin.fileManager.getExcalidrawFiles()).map((file) => file.path)
            : [],
        };
        if (created) await app.vault.delete(created);
        return result;
      } finally {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        if (createdPath) {
          const file = app.vault.getFileByPath(createdPath);
          if (file) await app.vault.delete(file);
        }
      }
    })()
  `);

  const failures = [
    !result.createdPath && 'drawing file was not created',
    result.viewType !== 'excalidraw' && `unexpected view type: ${result.viewType}`,
    result.routedViewType !== 'excalidraw' && `file-tree route opened ${result.routedViewType} instead of Excalidraw`,
    result.viewFile !== result.createdPath && 'view did not receive the drawing file',
    !result.hasContentEl && 'view has no content element',
    !result.hasCanvasApi && 'Excalidraw canvas API did not initialize',
    !result.themeVariables.backgroundPrimary && 'Tailwind theme did not expose --background-primary',
    !result.themeVariables.textNormal && 'Tailwind theme did not expose --text-normal',
    !result.activeViewMatches && 'plugin did not mark the drawing as active',
    !result.insertFileCommandExecuted && 'Excalidraw add-file command did not execute',
    !result.hasInsertFileInput && 'Excalidraw add-file dialog did not open',
    result.errors.length > 0 && `renderer errors: ${result.errors.join('; ')}`,
  ].filter(Boolean);
  if (failures.length > 0) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error(failures.join('\n'));
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .finally(() => {
    electron?.kill('SIGTERM');
    vite.kill('SIGTERM');
  })
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
