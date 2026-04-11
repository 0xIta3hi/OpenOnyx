const { spawn } = require('node:child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

env.NODE_ENV = env.NODE_ENV || 'development';

env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

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
