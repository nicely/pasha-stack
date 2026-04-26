import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { toolkitRoot } from './files.js';

export function progressPaths(config) {
  const dir = path.join(toolkitRoot(), 'progress', config.projectSlug || config.projectName);

  return {
    dir,
    json: path.join(dir, 'progress.json'),
    logs: path.join(dir, 'logs.txt')
  };
}

export async function recordProgress(config, event) {
  const paths = progressPaths(config);
  await mkdir(paths.dir, { recursive: true });

  const now = new Date().toISOString();
  const current = await readProgress(paths.json);
  const nextEvent = {
    time: now,
    ...event
  };

  const next = {
    projectName: config.projectName,
    projectSlug: config.projectSlug,
    projectDir: config.projectDir,
    updatedAt: now,
    steps: {
      ...(current.steps || {})
    },
    events: [
      ...(current.events || []),
      nextEvent
    ].slice(-100)
  };

  if (event.step && event.status) {
    next.steps[event.step] = {
      status: event.status,
      updatedAt: now,
      message: event.message || ''
    };
  }

  await writeFile(paths.json, `${JSON.stringify(next, null, 2)}\n`);
  await appendFile(paths.logs, `[${now}] ${formatEvent(event)}\n`);
}

async function readProgress(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return JSON.parse(await readFile(filePath, 'utf8'));
}

function formatEvent(event) {
  const parts = [];

  if (event.step) {
    parts.push(event.step);
  }

  if (event.status) {
    parts.push(event.status);
  }

  if (event.message) {
    parts.push(event.message);
  }

  return parts.join(' - ') || 'updated';
}
