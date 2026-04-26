#!/usr/bin/env node

import { createProject } from './steps/project.js';
import { runSetup } from './steps/setup.js';
import { showStatus } from './steps/status.js';
import { runPreflight } from './lib/preflight.js';
import { runTui } from './lib/tui.js';

const HELP = `
pasha-stack

Usage:
  pasha-stack
  pasha-stack create-project [--dry-run]
  pasha-stack preflight [--dry-run]
  pasha-stack setup full [--dry-run]
  pasha-stack setup step <name> [--dry-run]
  pasha-stack status

Setup steps:
  system        Install/check base packages
  github        Check GitHub CLI auth
  swarm         Initialize Docker Swarm and overlay network
  secrets       Create Docker Swarm secrets for MongoDB
  stacks        Deploy MongoDB and API stacks
  deploy-user   Create deploy user and GitHub SSH secrets
  ghcr          Log deploy user into GHCR
  cloudflare    Print Cloudflare tunnel/Pages checklist
  verify        Show verification commands
`;

function parseArgs(argv) {
  return {
    command: argv[2],
    subcommand: argv[3],
    step: argv[4],
    dryRun: argv.includes('--dry-run')
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.command) {
    await runTui({ dryRun: args.dryRun });
    return;
  }

  if (args.command === 'help' || args.command === '--help' || args.command === '-h') {
    console.log(HELP.trim());
    return;
  }

  if (args.command === 'create-project') {
    await createProject({ dryRun: args.dryRun });
    return;
  }

  if (args.command === 'preflight') {
    await runPreflight({ scope: 'setup', dryRun: args.dryRun });
    return;
  }

  if (args.command === 'setup') {
    await runSetup({
      mode: args.subcommand,
      step: args.step,
      dryRun: args.dryRun
    });
    return;
  }

  if (args.command === 'status') {
    await showStatus();
    return;
  }

  console.error(`Unknown command: ${args.command}`);
  console.log(HELP.trim());
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
