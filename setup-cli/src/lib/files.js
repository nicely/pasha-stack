import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function toolkitRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../../..');
}

export function templateDir(name) {
  return path.join(toolkitRoot(), 'templates', name);
}

export async function copyTemplate(name, destination, { dryRun = false } = {}) {
  if (existsSync(destination)) {
    throw new Error(`Project directory already exists: ${destination}`);
  }

  if (dryRun) {
    console.log(`[dry-run] copy ${templateDir(name)} -> ${destination}`);
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await cp(templateDir(name), destination, { recursive: true });
}

export async function renderTemplateFiles(root, replacements, { dryRun = false } = {}) {
  const files = [
    'README.md',
    'cloudflared-config.yml.example',
    'backend/api/package.json',
    'backend/api/src/index.js',
    'docker/swarm-api.yml',
    'docker/swarm-mongo.yml',
    'frontend/index.html',
    'frontend/blog/index.html',
    'frontend/blog/posts/evliya-in-istanbul.md',
    'frontend/build-blog.js',
    'frontend/app/index.html',
    '.github/workflows/deploy.yml',
    '.github/workflows/frontend-pages.yml',
    '.github/workflows/app-pages.yml'
  ];

  for (const relativePath of files) {
    const filePath = path.join(root, relativePath);
    let content = await readFile(filePath, 'utf8');

    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(`{{${key}}}`, value ?? '');
    }

    if (dryRun) {
      console.log(`[dry-run] render ${filePath}`);
    } else {
      await writeFile(filePath, content);
    }
  }
}

export async function writeJson(filePath, data, { dryRun = false } = {}) {
  const content = `${JSON.stringify(data, null, 2)}\n`;

  if (dryRun) {
    console.log(`[dry-run] write ${filePath}`);
    return;
  }

  await writeFile(filePath, content);
}
