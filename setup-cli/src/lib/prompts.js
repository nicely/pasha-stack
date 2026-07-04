import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { confirm as clackConfirm, isCancel, password, text } from '@clack/prompts';

export async function promptForConfig() {
  if (!input.isTTY) {
    const lines = await readPipedLines();
    const next = defaultValue => {
      const value = lines.shift()?.trim();
      return value || defaultValue;
    };

    return buildConfig({
      projectName: next('my-project'),
      projectRoot: next('/root/projects'),
      githubOwner: next(''),
      githubRepo: next('my-project'),
      apiDomain: next('api.example.com'),
      apiPort: next('3000'),
      mainDomain: next('example.com'),
      appDomain: next('app.example.com'),
      deployUser: next('deploy'),
      sshHost: next(''),
      sshPort: next('22'),
      mongoUser: next('admin'),
      mongoPassword: next(''),
      deploymentTarget: next('swarm')
    });
  }

  const rl = createInterface({ input, output });

  try {
    const projectName = await askTui('Project folder name', 'my-project', rl);
    const projectRoot = await askTui('Projects root', '/root/projects', rl);
    const githubOwner = await askTui('GitHub owner/org', '', rl);
    const githubRepo = await askTui('GitHub repo name', projectName, rl);
    const apiDomain = await askTui('API domain', 'api.example.com', rl);
    const apiPort = await askTui('API published port on VPS', '3000', rl);
    const mainDomain = await askTui('Main domain', 'example.com', rl);
    const appDomain = await askTui('App domain', 'app.example.com', rl);
    const deployUser = await askTui('Deploy SSH user', 'deploy', rl);
    const sshHost = await askTui('VPS SSH host/IP', '', rl);
    const sshPort = await askTui('SSH port', '22', rl);
    const mongoUser = await askTui('MongoDB root username', 'admin', rl);
    const mongoPassword = await askSecretTui('MongoDB root password', rl);
    const deploymentTarget = await askTui('Deployment target (swarm/k3s)', 'swarm', rl);

    return buildConfig({
      projectName,
      projectRoot,
      githubOwner,
      githubRepo,
      apiDomain,
      apiPort,
      mainDomain,
      appDomain,
      deployUser,
      sshHost,
      sshPort,
      mongoUser,
      mongoPassword,
      deploymentTarget
    });
  } finally {
    rl.close();
  }
}

export async function confirm(message, defaultYes = false) {
  if (input.isTTY) {
    const result = await clackConfirm({
      message,
      initialValue: defaultYes
    });

    if (isCancel(result)) {
      return false;
    }

    return result;
  }

  const rl = createInterface({ input, output });
  const suffix = defaultYes ? 'Y/n' : 'y/N';

  try {
    const answer = (await rl.question(`${message} [${suffix}] `)).trim().toLowerCase();
    if (!answer) {
      return defaultYes;
    }
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

export async function askMongoPassword() {
  if (input.isTTY) {
    const result = await password({
      message: 'MongoDB root password'
    });

    if (isCancel(result)) {
      throw new Error('Cancelled.');
    }

    return result;
  }

  const rl = createInterface({ input, output });

  try {
    return askSecret(rl, 'MongoDB root password');
  } finally {
    rl.close();
  }
}

async function ask(rl, label, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const value = (await rl.question(`${label}${suffix}: `)).trim();
  return value || defaultValue;
}

async function askSecret(rl, label) {
  const value = (await rl.question(`${label} (hidden input is not available here): `)).trim();
  return value;
}

async function askTui(label, defaultValue, fallbackRl) {
  if (!input.isTTY) {
    return ask(fallbackRl, label, defaultValue);
  }

  const result = await text({
    message: label,
    placeholder: defaultValue,
    defaultValue
  });

  if (isCancel(result)) {
    throw new Error('Cancelled.');
  }

  return result || defaultValue;
}

async function askSecretTui(label, fallbackRl) {
  if (!input.isTTY) {
    return askSecret(fallbackRl, label);
  }

  const result = await password({
    message: label
  });

  if (isCancel(result)) {
    throw new Error('Cancelled.');
  }

  return result;
}

function buildConfig(config) {
  const projectSlug = slugify(config.projectName);
  const apiStackName = `${projectSlug}_api`;
  const mongoStackName = `${projectSlug}_mongo`;
  const mainDomain = config.mainDomain || 'example.com';
  const deploymentTarget = config.deploymentTarget === 'k3s' ? 'k3s' : 'swarm';
  const mongoHost = deploymentTarget === 'k3s' ? 'mongo' : `${mongoStackName}_mongo`;

  return {
    ...config,
    mainDomain,
    deploymentTarget,
    projectSlug,
    projectDir: `${config.projectRoot.replace(/\/$/, '')}/${config.projectName}`,
    ghcrImage: config.githubOwner && config.githubRepo ? `ghcr.io/${config.githubOwner}/${config.githubRepo}/api` : '',
    pagesProjectName: `${projectSlug}-pages`,
    appPagesProjectName: `${projectSlug}-app`,
    wwwDomain: mainDomain.startsWith('www.') ? mainDomain : `www.${mainDomain}`,
    apiStackName,
    mongoStackName,
    apiServiceName: `${apiStackName}_api`,
    mongoServiceName: `${mongoStackName}_mongo`,
    networkName: `${projectSlug}_app_network`,
    mongoRootUserSecret: `${projectSlug}_mongo_root_user`,
    mongoRootPassSecret: `${projectSlug}_mongo_root_pass`,
    mongoUriSecret: `${projectSlug}_mongodb_uri`,
    kubeNamespace: projectSlug,
    helmReleaseName: projectSlug,
    mongoHost,
    mongoUri: config.mongoUser && config.mongoPassword
      ? `mongodb://${config.mongoUser}:${config.mongoPassword}@${mongoHost}:27017/app?authSource=admin`
      : ''
  };
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug || 'project';
}

async function readPipedLines() {
  let content = '';

  for await (const chunk of input) {
    content += chunk;
  }

  return content.split(/\r?\n/);
}
