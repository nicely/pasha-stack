import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
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
  const files = await listFiles(root);

  for (const filePath of files) {
    let content = await readFile(filePath, 'utf8');
    const original = content;

    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(`{{${key}}}`, value ?? '');
    }

    if (content === original) {
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] render ${filePath}`);
    } else {
      await writeFile(filePath, content);
    }
  }
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(filePath));
    } else if (entry.isFile() && await isTextFile(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

async function isTextFile(filePath) {
  const info = await stat(filePath);

  if (info.size > 1024 * 1024) {
    return false;
  }

  const content = await readFile(filePath);
  return !content.includes(0);
}

export async function writeJson(filePath, data, { dryRun = false } = {}) {
  const content = `${JSON.stringify(data, null, 2)}\n`;

  if (dryRun) {
    console.log(`[dry-run] write ${filePath}`);
    return;
  }

  await writeFile(filePath, content);
}
