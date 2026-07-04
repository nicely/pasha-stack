import { getConfig } from '../lib/config.js';
import { runPreflight } from '../lib/preflight.js';
import { progressPaths, recordProgress } from '../lib/progress.js';
import { askMongoPassword, confirm } from '../lib/prompts.js';
import { run, runShell } from '../lib/runner.js';

export const SWARM_STEP_ORDER = [
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

export const K3S_STEP_ORDER = [
  'system',
  'github',
  'k3s',
  'helm-namespace',
  'helm-secrets',
  'helm-deploy',
  'helm-deploy-user',
  'cloudflare',
  'helm-verify'
];

export const OPTIONAL_STEP_ORDER = [
  'observability',
  'observability-verify'
];

export const STEP_ORDER = [...new Set([...SWARM_STEP_ORDER, ...K3S_STEP_ORDER, ...OPTIONAL_STEP_ORDER])];

export const STEP_DESCRIPTIONS = {
  system: 'Install/check base packages',
  github: 'Check GitHub CLI auth',
  swarm: 'Initialize Docker Swarm and overlay network',
  secrets: 'Create Docker Swarm secrets for MongoDB',
  stacks: 'Deploy MongoDB and API stacks',
  'deploy-user': 'Create deploy user and GitHub SSH secrets',
  ghcr: 'Log deploy user into GHCR',
  cloudflare: 'Print Cloudflare tunnel/Pages checklist',
  verify: 'Show Docker Swarm verification commands',
  k3s: 'Install/check k3s, kubectl, and Helm',
  'helm-namespace': 'Create Kubernetes namespace',
  'helm-secrets': 'Create Kubernetes secrets for MongoDB and GHCR',
  'helm-deploy': 'Install/upgrade the Helm release',
  'helm-deploy-user': 'Configure deploy user kubeconfig access',
  'helm-verify': 'Verify Helm release, pods, services, rollout, and health',
  observability: 'Install optional Prometheus, Loki, and Grafana add-on',
  'observability-verify': 'Verify observability namespace and Helm releases'
};

const STEPS = {
  async system({ dryRun }) {
    await runShell('apt update && apt install -y git docker.io ca-certificates gnupg curl', { dryRun });
    await runShell('command -v node >/dev/null 2>&1 || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs)', { dryRun });
    await runShell('corepack enable || true', { dryRun });
    await runShell('systemctl enable --now docker || true', { dryRun });
  },

  async github({ dryRun }) {
    await run('gh', ['auth', 'status'], { dryRun });
    console.log('Required scopes: repo, workflow, read:packages');
    console.log('If needed: gh auth refresh -h github.com -s repo -s workflow -s read:packages');
  },

  async swarm({ config, dryRun }) {
    await runShell('[ "$(docker info --format \'{{.Swarm.LocalNodeState}}\')" = "active" ] || docker swarm init --advertise-addr "$(hostname -I | awk \'{print $1}\')"', { dryRun });
    await runShell(`docker network inspect ${config.networkName} >/dev/null 2>&1 || docker network create --driver overlay --attachable ${config.networkName}`, { dryRun });
  },

  async secrets({ config, dryRun }) {
    await ensureMongoSecretConfig(config, dryRun);
    await createDockerSecret(config.mongoRootUserSecret, config.mongoUser, dryRun);
    await createDockerSecret(config.mongoRootPassSecret, config.mongoPassword, dryRun);
    await createDockerSecret(config.mongoUriSecret, config.mongoUri, dryRun);
  },

  async stacks({ config, dryRun }) {
    await run('docker', ['stack', 'deploy', '-c', 'docker/swarm-mongo.yml', config.mongoStackName], { dryRun, cwd: config.projectDir });
    await run('docker', ['stack', 'deploy', '-c', 'docker/swarm-api.yml', config.apiStackName], { dryRun, cwd: config.projectDir });
  },

  async 'deploy-user'({ config, dryRun }) {
    await createDeployUser(config, dryRun);
  },

  async ghcr({ config, dryRun }) {
    await runShell(`gh auth token | runuser -u ${config.deployUser} -- docker login ghcr.io -u ${config.githubOwner} --password-stdin`, { dryRun });
  },

  async k3s({ dryRun }) {
    await runShell('command -v k3s >/dev/null 2>&1 || curl -sfL https://get.k3s.io | sh -', { dryRun });
    await runShell('command -v kubectl >/dev/null 2>&1 || ln -sf /usr/local/bin/k3s /usr/local/bin/kubectl', { dryRun });
    await runShell('command -v helm >/dev/null 2>&1 || (curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash)', { dryRun });
    await runShell('kubectl get nodes', { dryRun });
    await runShell('helm version', { dryRun });
  },

  async 'helm-namespace'({ config, dryRun }) {
    await runShell(`kubectl create namespace ${config.kubeNamespace} --dry-run=client -o yaml | kubectl apply -f -`, { dryRun });
  },

  async 'helm-secrets'({ config, dryRun }) {
    await ensureMongoSecretConfig(config, dryRun);
    await runShell(`kubectl create namespace ${config.kubeNamespace} --dry-run=client -o yaml | kubectl apply -f -`, { dryRun });
    await createKubernetesMongoSecret(config, dryRun);
    await createKubernetesGhcrSecret(config, dryRun);
  },

  async 'helm-deploy'({ config, dryRun }) {
    await runShell(`helm upgrade --install ${config.helmReleaseName} ./charts/pasha-app --namespace ${config.kubeNamespace} --create-namespace`, {
      dryRun,
      cwd: config.projectDir
    });
  },

  async 'helm-deploy-user'({ config, dryRun }) {
    await createDeployUser(config, dryRun);
    await runShell(`install -d -m 700 -o ${config.deployUser} -g ${config.deployUser} /home/${config.deployUser}/.kube`, { dryRun });
    await runShell(`cp /etc/rancher/k3s/k3s.yaml /home/${config.deployUser}/.kube/config`, { dryRun });
    await runShell(`chown ${config.deployUser}:${config.deployUser} /home/${config.deployUser}/.kube/config && chmod 600 /home/${config.deployUser}/.kube/config`, { dryRun });
  },

  async cloudflare({ config }) {
    console.log('Cloudflare checklist:');
    console.log('  1. cloudflared tunnel login');
    console.log(`  2. cloudflared tunnel create ${config.projectName}-api`);
    console.log('  3. Copy cloudflared-config.yml.example to /etc/cloudflared/config.yml');
    if (config.deploymentTarget === 'k3s') {
      console.log(`  4. Route ${config.apiDomain} to k3s Traefik at http://127.0.0.1:80`);
    } else {
      console.log(`  4. Route ${config.apiDomain} to http://127.0.0.1:${config.apiPort}`);
    }
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
  },

  async 'helm-verify'({ config, dryRun }) {
    await runShell(`helm -n ${config.kubeNamespace} list`, { dryRun });
    await runShell(`kubectl -n ${config.kubeNamespace} get pods`, { dryRun });
    await runShell(`kubectl -n ${config.kubeNamespace} get services`, { dryRun });
    await runShell(`kubectl -n ${config.kubeNamespace} rollout status deployment/api --timeout=120s`, { dryRun });
    console.log(`curl -s https://${config.apiDomain}/health`);
  },

  async observability({ dryRun }) {
    await runShell('helm repo add prometheus-community https://prometheus-community.github.io/helm-charts || true', { dryRun });
    await runShell('helm repo add grafana https://grafana.github.io/helm-charts || true', { dryRun });
    await runShell('helm repo update', { dryRun });
    await runShell('helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack --namespace observability --create-namespace', { dryRun });
    await runShell('helm upgrade --install loki grafana/loki --namespace observability --create-namespace', { dryRun });
  },

  async 'observability-verify'({ dryRun }) {
    await runShell('helm -n observability list', { dryRun });
    await runShell('kubectl -n observability get pods', { dryRun });
  }
};

export async function runSetup({ mode, step, dryRun = false } = {}) {
  const config = await getConfig();
  const selectedSteps = selectSteps(mode, step, config);

  await runPreflight({ scope: 'setup', dryRun, config });

  console.log(`Running setup: ${selectedSteps.join(', ')}`);
  console.log(`Deployment target: ${config.deploymentTarget}`);
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

function selectSteps(mode, step, config) {
  if (mode === 'full') {
    return config.deploymentTarget === 'k3s' ? K3S_STEP_ORDER : SWARM_STEP_ORDER;
  }

  if (mode === 'step' && step && STEPS[step]) {
    return [step];
  }

  throw new Error(`Usage: pasha-stack setup full | setup step <${STEP_ORDER.join('|')}>`);
}

async function ensureMongoSecretConfig(config, dryRun) {
  if (!config.mongoPassword && !dryRun) {
    config.mongoPassword = await askMongoPassword();
  }

  if (!config.mongoUri && config.mongoUser && config.mongoPassword) {
    config.mongoUri = `mongodb://${config.mongoUser}:${config.mongoPassword}@${config.mongoHost}:27017/app?authSource=admin`;
  }

  if (!config.mongoPassword && dryRun) {
    config.mongoPassword = 'DRY_RUN_MONGO_PASSWORD';
  }

  if (!config.mongoUri && config.mongoUser && config.mongoPassword) {
    config.mongoUri = `mongodb://${config.mongoUser}:${config.mongoPassword}@${config.mongoHost}:27017/app?authSource=admin`;
  }

  if (!config.mongoPassword) {
    throw new Error('Mongo password is required to create secrets. Run from a generated project or rerun create-project.');
  }
}

async function createDockerSecret(name, value, dryRun) {
  await runShell(`docker secret inspect ${name} >/dev/null 2>&1 || printf '%s' '${escapeSingleQuotes(value)}' | docker secret create ${name} -`, { dryRun });
}

async function createKubernetesMongoSecret(config, dryRun) {
  await runShell(`kubectl -n ${config.kubeNamespace} create secret generic mongodb --from-literal=root-user='${escapeSingleQuotes(config.mongoUser)}' --from-literal=root-password='${escapeSingleQuotes(config.mongoPassword)}' --from-literal=uri='${escapeSingleQuotes(config.mongoUri)}' --dry-run=client -o yaml | kubectl apply -f -`, { dryRun });
}

async function createKubernetesGhcrSecret(config, dryRun) {
  await runShell(`TOKEN="$(gh auth token)" && kubectl -n ${config.kubeNamespace} create secret docker-registry ghcr --docker-server=ghcr.io --docker-username='${escapeSingleQuotes(config.githubOwner)}' --docker-password="$TOKEN" --dry-run=client -o yaml | kubectl apply -f -`, { dryRun });
}

async function createDeployUser(config, dryRun) {
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
}

function escapeSingleQuotes(value) {
  return String(value).replaceAll("'", "'\\''");
}
