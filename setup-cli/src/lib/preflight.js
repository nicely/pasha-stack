import { existsSync } from 'node:fs';
import { cpus, homedir, totalmem } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const MIN_PRODUCTION_CPU_CORES = 2;
const MIN_PRODUCTION_MEMORY_GIB = 2;
const MIN_PRODUCTION_DISK_GIB = 20;

export async function runPreflight({ scope = 'setup', dryRun = false, config } = {}) {
  console.log('');
  console.log('Automated Preflight Checks');
  console.log('==========================');

  const automaticResults = runAutomaticChecks({ scope, config });

  printAutomaticResults(automaticResults);

  const failed = automaticResults.filter(result => result.required && !result.ok);
  if (failed.length > 0) {
    console.log('');
    console.log(`${RED}[FAIL]${RESET} Preflight did not pass.`);
    console.log('Fix the failed items above, then rerun the command.');
    throw new Error('Preflight failed');
  }

  console.log('');
  console.log(`${GREEN}[OK]${RESET} Preflight passed. Continuing...`);
}

function runAutomaticChecks({ scope, config }) {
  const setupScope = scope === 'setup';
  const k3sTarget = config?.deploymentTarget === 'k3s';
  const dockerRequired = setupScope && !k3sTarget;
  const repo = config?.githubOwner && config?.githubRepo
    ? `${config.githubOwner}/${config.githubRepo}`
    : '';

  return [
    checkCommand('node', ['--version'], {
      label: 'Node.js installed',
      required: true,
      validate: output => parseMajorVersion(output) >= 20,
      fix: 'Install Node.js 20+.'
    }),
    checkCommand('git', ['--version'], {
      label: 'Git installed',
      required: true,
      fix: 'Install git.'
    }),
    checkCpuCores({ required: setupScope }),
    checkMemory({ required: setupScope }),
    checkDiskSpace({ required: setupScope }),
    checkCommand('docker', ['--version'], {
      label: 'Docker installed',
      required: dockerRequired,
      fix: k3sTarget ? 'Docker is optional for the k3s target.' : 'Run setup step system or install docker.io.'
    }),
    checkCommand('docker', ['info'], {
      label: 'Docker daemon accessible',
      required: dockerRequired,
      fix: k3sTarget ? 'Docker daemon is optional for the k3s target.' : 'Start Docker and make sure this user can access it.'
    }),
    checkCommand('gh', ['--version'], {
      label: 'GitHub CLI installed',
      required: setupScope,
      fix: 'Install GitHub CLI.'
    }),
    checkCommand('gh', ['auth', 'status'], {
      label: 'GitHub CLI authenticated',
      required: setupScope,
      fix: 'Run gh auth login.'
    }),
    checkGitHubScopes({ required: setupScope }),
    checkGitHubRepo({ repo, required: false }),
    checkGitHubSecrets({
      repo,
      required: false,
      names: [
        'SSH_HOST',
        'SSH_USER',
        'SSH_PRIVATE_KEY',
        'SSH_KNOWN_HOSTS',
        'SSH_PORT',
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_ZONE_ID'
      ]
    }),
    checkCommand('cloudflared', ['--version'], {
      label: 'cloudflared installed',
      required: setupScope,
      fix: 'Install cloudflared.'
    }),
    checkCloudflaredAuth({ required: setupScope }),
    checkCloudflareToken({ required: false }),
    checkCloudflareAccount({ required: false }),
    checkCloudflareZone({ required: false, config })
  ];
}

function checkCpuCores({ required }) {
  const count = cpus().length;

  return {
    label: 'Minimum CPU for small production VPS',
    required,
    ok: count >= MIN_PRODUCTION_CPU_CORES,
    details: `${count} vCPU detected; minimum ${MIN_PRODUCTION_CPU_CORES} vCPU recommended`,
    fix: 'Use a VPS with at least 2 vCPU for k3s/Swarm, MongoDB, ingress, and deploy tooling.'
  };
}

function checkMemory({ required }) {
  const gib = totalmem() / 1024 / 1024 / 1024;

  return {
    label: 'Minimum RAM for small production VPS',
    required,
    ok: gib >= MIN_PRODUCTION_MEMORY_GIB,
    details: `${formatGib(gib)} GiB detected; minimum ${MIN_PRODUCTION_MEMORY_GIB} GiB recommended`,
    fix: 'Use a VPS with at least 2 GiB RAM; 4 GiB is more comfortable for k3s + Traefik + API replicas + MongoDB.'
  };
}

function checkDiskSpace({ required }) {
  const result = spawnSync('df', ['-Pk', '/'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });

  if (result.status !== 0) {
    return {
      label: 'Minimum disk for small production VPS',
      required,
      ok: false,
      details: firstLine(result.stderr) || 'Could not check disk space',
      fix: 'Ensure df is available and / is readable.'
    };
  }

  const lines = result.stdout.trim().split(/\r?\n/);
  const columns = lines[1]?.trim().split(/\s+/) || [];
  const availableKib = Number(columns[3] || 0);
  const availableGib = availableKib / 1024 / 1024;

  return {
    label: 'Minimum free disk for small production VPS',
    required,
    ok: availableGib >= MIN_PRODUCTION_DISK_GIB,
    details: `${formatGib(availableGib)} GiB free on /; minimum ${MIN_PRODUCTION_DISK_GIB} GiB recommended`,
    fix: 'Use a VPS with at least 20 GiB free disk for OS packages, images, k3s data, logs, MongoDB data, and backups.'
  };
}

function checkCommand(command, args, { label, required, validate, fix }) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const ok = result.status === 0 && (!validate || validate(output));

  return {
    label,
    required,
    ok,
    details: ok ? firstLine(output) : firstLine(output) || `${command} failed`,
    fix
  };
}

function checkGitHubScopes({ required }) {
  const result = spawnSync('gh', ['auth', 'status'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const requiredScopes = ['repo', 'workflow', 'read:packages'];
  const missing = requiredScopes.filter(scope => !output.includes(scope));

  return {
    label: 'GitHub required scopes',
    required,
    ok: result.status === 0 && missing.length === 0,
    details: missing.length === 0 ? requiredScopes.join(', ') : `Missing: ${missing.join(', ')}`,
    fix: 'Run gh auth refresh -h github.com -s repo -s workflow -s read:packages'
  };
}

function checkGitHubRepo({ repo, required }) {
  if (!repo) {
    return {
      label: 'GitHub repository reachable',
      required,
      ok: false,
      details: 'No GitHub owner/repo configured yet',
      fix: 'Create a project first or run from a generated project directory.'
    };
  }

  return checkCommand('gh', ['repo', 'view', repo, '--json', 'nameWithOwner'], {
    label: `GitHub repository reachable (${repo})`,
    required,
    fix: `Create ${repo} or authenticate gh with access to it.`
  });
}

function checkGitHubSecrets({ repo, required, names }) {
  if (!repo) {
    return {
      label: 'GitHub repository secrets',
      required,
      ok: false,
      details: 'No GitHub owner/repo configured yet',
      fix: 'Create a project first or run from a generated project directory.'
    };
  }

  const result = spawnSync('gh', ['secret', 'list', '--repo', repo], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const existing = new Set(output.split(/\r?\n/).map(line => line.split(/\s+/)[0]).filter(Boolean));
  const missing = names.filter(name => !existing.has(name));

  return {
    label: `GitHub repository secrets (${repo})`,
    required,
    ok: result.status === 0 && missing.length === 0,
    details: result.status !== 0
      ? firstLine(output) || 'Could not list GitHub secrets'
      : missing.length === 0
        ? `Found: ${names.join(', ')}`
        : `Missing: ${missing.join(', ')}`,
    fix: 'Set missing secrets with gh secret set. Secret values cannot be read back for permission verification.'
  };
}

function checkCloudflaredAuth({ required }) {
  const certPath = path.join(homedir(), '.cloudflared', 'cert.pem');

  return {
    label: 'Cloudflare tunnel login',
    required,
    ok: existsSync(certPath),
    details: existsSync(certPath) ? certPath : 'No ~/.cloudflared/cert.pem found',
    fix: 'Run cloudflared tunnel login.'
  };
}

function checkCloudflareToken({ required }) {
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!token) {
    return {
      label: 'Cloudflare API token verification',
      required,
      ok: false,
      details: 'CLOUDFLARE_API_TOKEN is not set in this shell',
      fix: 'Prefer gh secret set for storage. Only export CLOUDFLARE_API_TOKEN temporarily for verification; do not save it in shell profiles, history, or files.'
    };
  }

  const result = spawnSync('curl', [
    '-fsS',
    'https://api.cloudflare.com/client/v4/user/tokens/verify',
    '-H',
    `Authorization: Bearer ${token}`,
    '-H',
    'Content-Type: application/json'
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });

  return {
    label: 'Cloudflare API token verification',
    required,
    ok: result.status === 0 && result.stdout.includes('"success":true'),
    details: result.status === 0 ? 'Token accepted by Cloudflare' : firstLine(result.stderr) || 'Token verification failed',
    fix: 'Create a Cloudflare API token with the needed account/zone/pages permissions.'
  };
}

function checkCloudflareAccount({ required }) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  return {
    label: 'Cloudflare account ID available',
    required,
    ok: Boolean(accountId),
    details: accountId ? mask(accountId) : 'CLOUDFLARE_ACCOUNT_ID is not set in this shell',
    fix: 'Prefer gh secret set for storage. Only export CLOUDFLARE_ACCOUNT_ID temporarily if local verification needs it.'
  };
}

function checkCloudflareZone({ required, config }) {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!zoneId) {
    return {
      label: 'Cloudflare zone ID available',
      required,
      ok: false,
      details: 'CLOUDFLARE_ZONE_ID is not set in this shell',
      fix: 'Prefer gh secret set for storage. Only export CLOUDFLARE_ZONE_ID temporarily if local verification needs it.'
    };
  }

  if (!token) {
    return {
      label: 'Cloudflare zone readable',
      required: false,
      ok: false,
      details: `Zone ID configured (${mask(zoneId)}), but token is not available locally to verify access`,
      fix: 'Only export CLOUDFLARE_API_TOKEN temporarily to verify zone access; do not keep it locally.'
    };
  }

  const result = spawnSync('curl', [
    '-fsS',
    `https://api.cloudflare.com/client/v4/zones/${zoneId}`,
    '-H',
    `Authorization: Bearer ${token}`,
    '-H',
    'Content-Type: application/json'
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });

  return {
    label: config?.apiDomain ? `Cloudflare zone readable for ${config.apiDomain}` : 'Cloudflare zone readable',
    required,
    ok: result.status === 0 && result.stdout.includes('"success":true'),
    details: result.status === 0 ? `Zone readable (${mask(zoneId)})` : firstLine(result.stderr) || 'Zone access failed',
    fix: 'Give the Cloudflare token Zone Read access for this zone.'
  };
}

function printAutomaticResults(results) {
  console.log('');
  console.log('Checks');

  for (const result of results) {
    const label = result.ok
      ? `${GREEN}[OK]${RESET}`
      : result.required
        ? `${RED}[FAIL]${RESET}`
        : `${YELLOW}[WARN]${RESET}`;

    console.log(`  ${label} ${result.label}: ${result.details}`);

    if (!result.ok && result.fix) {
      console.log(`       Fix: ${result.fix}`);
    }
  }
}

function parseMajorVersion(output) {
  const match = output.match(/v?(\d+)/);
  return match ? Number(match[1]) : 0;
}

function firstLine(output) {
  return output.split(/\r?\n/).find(Boolean) || '';
}

function formatGib(value) {
  return value.toFixed(value >= 10 ? 0 : 1);
}

function mask(value) {
  if (!value || value.length < 8) {
    return 'set';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
