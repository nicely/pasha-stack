import path from 'node:path';
import { CONFIG_FILE, publicConfig, replacements } from '../lib/config.js';
import { copyTemplate, renderTemplateFiles, writeJson } from '../lib/files.js';
import { runPreflight } from '../lib/preflight.js';
import { progressPaths, recordProgress } from '../lib/progress.js';
import { promptForConfig } from '../lib/prompts.js';
import { run } from '../lib/runner.js';

export async function createProject({ dryRun = false } = {}) {
  await runPreflight({ scope: 'create-project', dryRun });

  const config = await promptForConfig();

  console.log(`Creating project at ${config.projectDir}`);
  await recordProgress(config, {
    step: 'create-project',
    status: dryRun ? 'dry-run' : 'started',
    message: `Project directory: ${config.projectDir}`
  });

  await copyTemplate('node-api-swarm', config.projectDir, { dryRun });

  if (dryRun) {
    console.log(`[dry-run] render template variables in ${config.projectDir}`);
    console.log(`[dry-run] write ${path.join(config.projectDir, CONFIG_FILE)}`);
    console.log(`[dry-run] git init -b main in ${config.projectDir}`);
    console.log(`[dry-run] progress folder: ${progressPaths(config).dir}`);
    return;
  }

  await renderTemplateFiles(config.projectDir, replacements(config), { dryRun });
  await writeJson(path.join(config.projectDir, CONFIG_FILE), publicConfig(config), { dryRun });
  await run('git', ['init', '-b', 'main'], { cwd: config.projectDir });
  await recordProgress(config, {
    step: 'create-project',
    status: 'completed',
    message: 'Project scaffold generated'
  });

  console.log('');
  console.log('Project created.');
  console.log(`Next: cd ${config.projectDir}`);
  console.log('Then: /root/projects/pasha-stack/setup.sh setup full');
  console.log(`Progress: ${progressPaths(config).json}`);
}
