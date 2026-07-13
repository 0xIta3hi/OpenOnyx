const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

env.NODE_ENV = env.NODE_ENV || 'development';

env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

const electronMainPath = path.join(process.cwd(), 'dist-electron', 'main.js');
if (!fs.existsSync(electronMainPath)) {
  console.error(`Electron entry file not found: ${electronMainPath}`);
  console.error('Run "npm run build:electron" and try again.');
  process.exit(1);
}

function findElectronInstallScript() {
  try {
    return require.resolve('electron/install.js');
  } catch {
    return null;
  }
}

function isBrokenElectronInstall(error) {
  return error instanceof Error && /Electron failed to install correctly/i.test(error.message);
}

function runElectronInstaller(reason) {
  const installScript = findElectronInstallScript();
  if (!installScript) {
    console.error('Electron is not installed. Run "npm install" and try again.');
    process.exit(1);
  }

  console.warn(`[dev] Electron binary is missing or incomplete (${reason}).`);
  console.warn('[dev] Running Electron installer once before launching...');

  const installEnv = { ...process.env };
  delete installEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;

  const result = spawnSync(process.execPath, [installScript], {
    stdio: 'inherit',
    env: installEnv,
  });

  if (result.error) {
    console.error('[dev] Failed to run Electron installer:', result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error('[dev] Electron installer failed.');
    console.error('[dev] Check your network/proxy settings, then run "npm install" again.');
    process.exit(result.status ?? 1);
  }
}

function loadElectronBinary() {
  try {
    return require('electron');
  } catch (error) {
    if (!isBrokenElectronInstall(error)) {
      throw error;
    }

    runElectronInstaller(error.message);
    return require('electron');
  }
}

function resolveElectronBinary() {
  let electronBinary = loadElectronBinary();
  if (!fs.existsSync(electronBinary)) {
    runElectronInstaller(`expected binary not found at ${electronBinary}`);
    electronBinary = loadElectronBinary();
  }

  if (!fs.existsSync(electronBinary)) {
    console.error(`Electron binary still not found at: ${electronBinary}`);
    console.error('Run "npm install" again, or remove node_modules/electron and reinstall dependencies.');
    process.exit(1);
  }

  return electronBinary;
}

const electronBinary = resolveElectronBinary();
const electronProcess = spawn(electronBinary, ['.'], {
  stdio: 'inherit',
  env,
});

electronProcess.on('error', (error) => {
  console.error('Failed to launch Electron:', error);
  process.exit(1);
});

electronProcess.on('exit', (code) => {
  process.exit(code ?? 0);
});
