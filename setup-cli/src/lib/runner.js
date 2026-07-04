import { spawn } from 'node:child_process';

export function run(command, args = [], { dryRun = false, input, cwd } = {}) {
  const printable = [command, ...args].map(quoteArg).join(' ');

  if (dryRun) {
    console.log(`[dry-run] ${printable}`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit'
    });

    if (input) {
      child.stdin.end(input);
    }

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed (${code}): ${printable}`));
      }
    });
  });
}

export async function runShell(command, { dryRun = false, cwd } = {}) {
  await run('sh', ['-c', command], { dryRun, cwd });
}

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\\''")}'`;
}
