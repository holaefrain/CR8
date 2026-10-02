// Starts the desktop app for development. Clears ELECTRON_RUN_AS_NODE, which
// editors like VS Code set for their child processes and which would make
// Electron run as plain Node.
import { spawn } from 'child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', code => process.exit(code ?? 0));
