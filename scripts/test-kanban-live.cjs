/*
 * Runs a disposable Electron smoke test against an installed Kanban plugin.
 * The board created by the command is deleted before the process exits.
 *
 * Usage:
 *   OO_KANBAN_VAULT=/path/to/vault node scripts/test-kanban-live.cjs
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const vault = process.env.OO_KANBAN_VAULT;
const vitePort = Number(process.env.OO_KANBAN_VITE_PORT || 5176);
const debugPort = Number(process.env.OO_KANBAN_DEBUG_PORT || 9227);

if (!vault) throw new Error('Set OO_KANBAN_VAULT to a vault with Kanban enabled.');

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
        reject(new Error(message.result.exceptionDetails.text));
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
], { cwd: root, stdio: 'pipe' });

let electron;

async function main() {
  console.log('Waiting for Vite...');
  await waitFor(async () => (await fetch(`http://127.0.0.1:${vitePort}`)).ok, 'Vite');
  const electronEnv = {
    ...process.env,
    NODE_ENV: 'development',
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${vitePort}`,
    OPENOBSIDIAN_DEBUG_PORT: String(debugPort),
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  electron = spawn(require('electron'), ['.'], { cwd: root, stdio: 'pipe', env: electronEnv });

  console.log('Waiting for Electron...');
  await waitFor(async () => {
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
    return targets.some((entry) => entry.type === 'page' && entry.url.startsWith(`http://127.0.0.1:${vitePort}`));
  }, 'Electron debugger');

  console.log('Loading test vault...');
  await evaluate(`electronAPI.setVaultPath(${JSON.stringify(vault)}).then(() => location.reload())`);
  console.log('Waiting for Kanban plugin...');
  await waitFor(async () => (await evaluate(`Object.keys(app?.plugins?.plugins || {})`)).includes('obsidian-kanban'), 'Kanban plugin');

  console.log('Opening disposable Kanban board...');
  const result = await evaluate(`
    (async () => {
      const errors = [];
      const describeError = (error) => error?.stack || String(error);
      const onError = (event) => errors.push(describeError(event.error || event.message));
      const onRejection = (event) => errors.push(describeError(event.reason));
      const boardPath = 'Kanban live smoke test.md';
      const source = ['---', 'kanban-plugin: board', '---', '', '## Todo', '- [ ] Render a Kanban card', '', '## Done', '- Completed card', ''].join('\\n');
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      try {
        const existing = app.vault.getFileByPath(boardPath);
        if (existing) await app.vault.delete(existing);
        const file = await app.vault.create(boardPath, source);
        const leaf = app.workspace.getLeaf('tab');
        await leaf.setViewState({ type: 'kanban', state: { file: file.path } });
        app.workspace.setActiveLeaf(leaf);
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        const view = leaf.view;
        const plugin = app.plugins.getPlugin('obsidian-kanban');
        const board = view?.getBoard?.();
        const persistedSource = source + '\\n## Later\\n- Persisted card\\n';
        view?.requestSaveToDisk?.(persistedSource);
        await new Promise((resolve) => setTimeout(resolve, 2_500));
        const persisted = await app.vault.read(file);
        const result = {
          errors,
          viewType: view?.getViewType?.(),
          viewFile: view?.file?.path,
          pluginLoaded: plugin?._loaded,
          hasBoardState: Array.isArray(board?.children) && board.children.length === 2,
          hasRenderedBoard: !!view?.contentEl?.querySelector?.('.kanban-plugin'),
          hasRenderedLanes: view?.contentEl?.querySelectorAll?.('.kanban-plugin__lane').length || 0,
          hasRenderedCards: view?.contentEl?.querySelectorAll?.('.kanban-plugin__item').length || 0,
          persisted: persisted.includes('Persisted card'),
        };
        await leaf.setViewState({ type: 'empty', state: {} });
        await app.vault.delete(file);
        return result;
      } finally {
        const file = app.vault.getFileByPath(boardPath);
        if (file) await app.vault.delete(file);
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
      }
    })()
  `);

  const failures = [
    result.viewType !== 'kanban' && `unexpected view type: ${result.viewType}`,
    result.viewFile !== 'Kanban live smoke test.md' && 'view did not receive the board file',
    !result.pluginLoaded && 'Kanban plugin did not load',
    !result.hasBoardState && 'Kanban board state did not parse its lanes',
    !result.hasRenderedBoard && 'Kanban board did not render',
    result.hasRenderedLanes < 2 && 'Kanban lanes did not render',
    result.hasRenderedCards < 2 && 'Kanban cards did not render',
    !result.persisted && 'Kanban board data was not saved to the vault',
    result.errors.length > 0 && `renderer errors: ${result.errors.join('; ')}`,
  ].filter(Boolean);
  if (failures.length) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error(failures.join('\\n'));
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
