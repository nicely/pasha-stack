import { getConfig } from '../lib/config.js';
import { runPreflight } from '../lib/preflight.js';
import { progressPaths, recordProgress } from '../lib/progress.js';
import { askMongoPassword, confirm } from '../lib/prompts.js';
import { run, runShell } from '../lib/runner.js';

export const STEP_ORDER = [
  'system',
  'github',
  'swarm',
  'secrets',
  'stacks',
  'deploy-user',
  'ghcr',
  'cloudflare',
  'verify'
];

export const STEP_DESCRIPTIONS = {
  system: 'Install/check base packages',
  github: 'Check GitHub CLI auth',
  swarm: 'Initialize Docker Swarm and overlay network',
  secrets: 'Create Docker Swarm secrets for MongoDB',
  stacks: 'Deploy MongoDB and API stacks',
  'deploy-user': 'Create deploy user and GitHub SSH secrets',
  ghcr: 'Log deploy user into GHCR',
  cloudflare: 'Print Cloudflare tunnel/Pages checklist',
  verify: 'Show verification commands'
};

const STEPS = {
  async system({ dryRun }) {
    await runShell('apt update && apt install -y git docker.io ca-certificates gnupg curl', { dryRun });
    await runShell('command -v node >/dev/null 2>&1 || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs)', { dryRun });
    await runShell('corepack enable || true', { dryRun });
    await runShell('systemctl enable --now docker', { dryRun });
  },

  async github({ dryRun }) {
    await run('gh', ['auth', 'status'], { dryRun });
    console.log('Required scopes: repo, workflow, read:packages');
    console.log('If needed: gh auth refresh -h github.com -s workflow -s read:packages');
  },

  async swarm({ config, dryRun }) {
    await runShell('[ "$(docker info --format \'{{.Swarm.LocalNodeState}}\')" = "active" ] || docker swarm init --advertise-addr "$(hostname -I | awk \'{print $1}\')"', { dryRun });
    await runShell(`docker network inspect ${config.networkName} >/dev/null 2>&1 || docker network create --driver overlay --attachable ${config.networkName}`, { dryRun });
  },

  async secrets({ config, dryRun }) {
    if (!config.mongoPassword && !dryRun) {
      config.mongoPassword = await askMongoPassword();
      config.mongoUri = `mongodb://${config.mongoUser}:${config.mongoPassword}@${config.mongoHost}:27017/app?authSource=admin`;
    }

    if (!config.mongoPassword) {
      throw new Error('Mongo password is required to create Docker secrets. Run from a generated project or rerun create-project.');
    }

    await createSecret(config.mongoRootUserSecret, config.mongoUser, dryRun);
    await createSecret(config.mongoRootPassSecret, config.mongoPassword, dryRun);
    await createSecret(config.mongoUriSecret, config.mongoUri, dryRun);
  },

  async stacks({ config, dryRun }) {
    await run('docker', ['stack', 'deploy', '-c', 'docker/swarm-mongo.yml', config.mongoStackName], { dryRun, cwd: config.projectDir });
    await run('docker', ['stack', 'deploy', '-c', 'docker/swarm-api.yml', config.apiStackName], { dryRun, cwd: config.projectDir });
  },

  async 'deploy-user'({ config, dryRun }) {
    const keyPath = `/tmp/${config.projectName}-github-actions-deploy`;

    await runShell(`id -u ${config.deployUser} >/dev/null 2>&1 || useradd --create-home --shell /bin/bash ${config.deployUser}`, { dryRun });
    await run('usermod', ['-aG', 'docker', config.deployUser], { dryRun });
    await runShell(`install -d -m 700 -o ${config.deployUser} -g ${config.deployUser} /home/${config.deployUser}/.ssh`, { dryRun });
    await runShell(`[ -f ${keyPath} ] || ssh-keygen -t ed25519 -C github-actions-deploy -f ${keyPath} -N ""`, { dryRun });
    await runShell(`cat ${keyPath}.pub >> /home/${config.deployUser}/.ssh/authorized_keys`, { dryRun });
    await runShell(`chown -R ${config.deployUser}:${config.deployUser} /home/${config.deployUser}/.ssh && chmod 600 /home/${config.deployUser}/.ssh/authorized_keys`, { dryRun });

    console.log('');
    console.log('Set these GitHub secrets from the generated deploy key:');
    console.log(`  gh secret set SSH_HOST --body "${config.sshHost}"`);
    console.log(`  gh secret set SSH_USER --body "${config.deployUser}"`);
    console.log(`  gh secret set SSH_PRIVATE_KEY < ${keyPath}`);
    console.log(`  ssh-keyscan -p ${config.sshPort} -H ${config.sshHost} | gh secret set SSH_KNOWN_HOSTS`);
    console.log(`  gh secret set SSH_PORT --body "${config.sshPort}"`);
  },

  async ghcr({ config, dryRun }) {
    await runShell(`gh auth token | runuser -u ${config.deployUser} -- docker login ghcr.io -u ${config.githubOwner} --password-stdin`, { dryRun });
  },

  async cloudflare({ config }) {
    console.log('Cloudflare checklist:');
    console.log(`  1. cloudflared tunnel login`);
    console.log(`  2. cloudflared tunnel create ${config.projectName}-api`);
    console.log(`  3. Copy cloudflared-config.yml.example to /etc/cloudflared/config.yml`);
    console.log(`  4. Route ${config.apiDomain} to http://127.0.0.1:${config.apiPort}`);
    console.log(`  5. Create Pages project ${config.pagesProjectName} for ${config.mainDomain}`);
    console.log(`  6. Create Pages project ${config.appPagesProjectName} for ${config.appDomain}`);
    console.log('  7. Set CLOUDFLARE_* GitHub secrets');
  },

  async verify({ config, dryRun }) {
    await run('docker', ['service', 'ls'], { dryRun });
    await run('docker', ['service', 'ps', config.apiServiceName], { dryRun });
    await run('docker', ['service', 'ps', config.mongoServiceName], { dryRun });
    console.log(`curl -s http://127.0.0.1:${config.apiPort}/health`);
    console.log(`curl -s https://${config.apiDomain}/health`);
  }
};

export async function runSetup({ mode, step, dryRun = false } = {}) {
  const config = await getConfig();
  const selectedSteps = selectSteps(mode, step);

  await runPreflight({ scope: 'setup', dryRun, config });

  console.log(`Running setup: ${selectedSteps.join(', ')}`);
  console.log(`Project namespace: ${config.projectSlug}`);
  console.log(`Progress: ${progressPaths(config).json}`);

  if (!dryRun && !(await confirm('Continue?', false))) {
    console.log('Cancelled.');
    return;
  }

  for (const stepName of selectedSteps) {
    console.log('');
    console.log(`==> ${stepName}`);
    await recordProgress(config, {
      step: stepName,
      status: dryRun ? 'dry-run' : 'started',
      message: `Running ${stepName}`
    });

    try {
      await STEPS[stepName]({ config, dryRun });
      await recordProgress(config, {
        step: stepName,
        status: dryRun ? 'dry-run' : 'completed',
        message: `${stepName} finished`
      });
    } catch (error) {
      await recordProgress(config, {
        step: stepName,
        status: 'failed',
        message: error.message
      });
      throw error;
    }
  }
}

function selectSteps(mode, step) {
  if (mode === 'full') {
    return STEP_ORDER;
  }

  if (mode === 'step' && step && STEPS[step]) {
    return [step];
  }

  throw new Error(`Usage: pasha-stack setup full | setup step <${STEP_ORDER.join('|')}>`);
}

async function createSecret(name, value, dryRun) {
  await runShell(`docker secret inspect ${name} >/dev/null 2>&1 || printf '%s' '${escapeSingleQuotes(value)}' | docker secret create ${name} -`, { dryRun });
}

function escapeSingleQuotes(value) {
  return String(value).replaceAll("'", "'\\''");
}
