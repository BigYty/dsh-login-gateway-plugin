import { stdin, stdout } from 'node:process';
import { hashPassword } from './server.mjs';

function hiddenPrompt(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) return reject(new Error('Run this command from an interactive terminal.'));
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const onData = (data) => {
      for (const byte of data) {
        if (byte === 3) {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (byte === 13 || byte === 10) {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (byte === 127 || byte === 8) value = value.slice(0, -1);
        else if (byte >= 32 && byte <= 126) value += String.fromCharCode(byte);
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

const password = await hiddenPrompt('New DSH gate password: ');
if (password.length < 14) throw new Error('Use a password with at least 14 characters.');
stdout.write(`${hashPassword(password)}\n`);
