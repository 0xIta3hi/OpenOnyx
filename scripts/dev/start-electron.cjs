const { spawn } = require('node:child_process');
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

const electronBinary = require('electron');
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
