import { intro, isCancel, outro, select } from '@clack/prompts';
import { createProject } from '../steps/project.js';
import { STEP_DESCRIPTIONS, STEP_ORDER, runSetup } from '../steps/setup.js';
import { showStatus } from '../steps/status.js';
import { runPreflight } from './preflight.js';

export async function runTui({ dryRun = false } = {}) {
  intro('pasha-stack');

  const action = await select({
    message: 'What do you want to do?',
    options: [
      { value: 'preflight', label: 'Run preflight checks' },
      { value: 'create-project', label: 'Create a new project' },
      { value: 'setup-full', label: 'Run full setup for current project' },
      { value: 'setup-step', label: 'Run one setup step' },
      { value: 'status', label: 'Show server status' },
      { value: 'help', label: 'Show command help' }
    ]
  });

  if (isCancel(action)) {
    outro('Cancelled.');
    return;
  }

  if (action === 'preflight') {
    await runPreflight({ scope: 'setup', dryRun });
  } else if (action === 'create-project') {
    await createProject({ dryRun });
  } else if (action === 'setup-full') {
    await runSetup({ mode: 'full', dryRun });
  } else if (action === 'setup-step') {
    await runSetupStep({ dryRun });
  } else if (action === 'status') {
    await showStatus();
  } else {
    printHelp();
  }

  outro('Done.');
}

async function runSetupStep({ dryRun }) {
  const step = await select({
    message: 'Which setup step?',
    options: STEP_ORDER.map(value => ({
      value,
      label: `${value} - ${STEP_DESCRIPTIONS[value]}`
    }))
  });

  if (isCancel(step)) {
    outro('Cancelled.');
    return;
  }

  await runSetup({ mode: 'step', step, dryRun });
}

function printHelp() {
  console.log(`
Usage:
  ./setup.sh
  ./setup.sh create-project [--dry-run]
  ./setup.sh preflight [--dry-run]
  ./setup.sh setup full [--dry-run]
  ./setup.sh setup step <name> [--dry-run]
  ./setup.sh status
`.trim());
}
