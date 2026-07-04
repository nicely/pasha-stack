import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promptForConfig } from './prompts.js';

export const CONFIG_FILE = '.pasha-stack.json';

export async function loadProjectConfig(projectDir = process.cwd()) {
  const filePath = path.join(projectDir, CONFIG_FILE);

  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function getConfig() {
  const existing = await loadProjectConfig();
  if (existing) {
    return normalizeConfig({
      ...existing,
      projectDir: process.cwd()
    });
  }

  return promptForConfig();
}

export function publicConfig(config) {
  const { mongoPassword, mongoUri, ...safeConfig } = config;

  return {
    ...safeConfig,
    mongoSecretNames: {
      rootUser: config.mongoRootUserSecret,
      rootPassword: config.mongoRootPassSecret,
      uri: config.mongoUriSecret
    },
    swarm: {
      apiStackName: config.apiStackName,
      mongoStackName: config.mongoStackName,
      apiServiceName: config.apiServiceName,
      mongoServiceName: config.mongoServiceName,
      networkName: config.networkName,
      mongoHost: config.mongoHost,
      apiPort: config.apiPort,
      pagesProjectName: config.pagesProjectName,
      appPagesProjectName: config.appPagesProjectName,
      wwwDomain: config.wwwDomain
    },
    kubernetes: {
      namespace: config.kubeNamespace,
      helmReleaseName: config.helmReleaseName,
      apiDeploymentName: 'api',
      apiServiceName: 'api',
      mongoStatefulSetName: 'mongo',
      mongoServiceName: 'mongo'
    }
  };
}

export function replacements(config) {
  return {
    PROJECT_NAME: config.projectName,
    GITHUB_OWNER: config.githubOwner,
    GITHUB_REPO: config.githubRepo,
    GHCR_IMAGE: config.ghcrImage,
    API_DOMAIN: config.apiDomain,
    API_PORT: config.apiPort,
    MAIN_DOMAIN: config.mainDomain,
    WWW_DOMAIN: config.wwwDomain,
    APP_DOMAIN: config.appDomain,
    PAGES_PROJECT_NAME: config.pagesProjectName,
    APP_PAGES_PROJECT_NAME: config.appPagesProjectName,
    DEPLOY_USER: config.deployUser,
    SSH_HOST: config.sshHost,
    SSH_PORT: config.sshPort,
    MONGO_USER: config.mongoUser,
    MONGO_HOST: config.mongoHost,
    PROJECT_SLUG: config.projectSlug,
    KUBE_NAMESPACE: config.kubeNamespace,
    HELM_RELEASE_NAME: config.helmReleaseName,
    API_STACK_NAME: config.apiStackName,
    MONGO_STACK_NAME: config.mongoStackName,
    API_SERVICE_NAME: config.apiServiceName,
    MONGO_SERVICE_NAME: config.mongoServiceName,
    NETWORK_NAME: config.networkName,
    MONGO_ROOT_USER_SECRET: config.mongoRootUserSecret,
    MONGO_ROOT_PASS_SECRET: config.mongoRootPassSecret,
    MONGODB_URI_SECRET: config.mongoUriSecret
  };
}

export function normalizeConfig(config) {
  const projectSlug = config.projectSlug || slugify(config.projectName);
  const kubeName = kubernetesName(config.projectName || projectSlug);
  const apiStackName = config.apiStackName || `${projectSlug}_api`;
  const mongoStackName = config.mongoStackName || `${projectSlug}_mongo`;
  const mainDomain = config.mainDomain || 'example.com';
  const deploymentTarget = config.deploymentTarget === 'k3s' ? 'k3s' : 'swarm';
  const mongoHost = config.mongoHost || (deploymentTarget === 'k3s' ? 'mongo' : `${mongoStackName}_mongo`);

  return {
    ...config,
    mainDomain,
    deploymentTarget,
    projectSlug,
    apiPort: config.apiPort || '3000',
    pagesProjectName: config.pagesProjectName || `${kubeName}-pages`,
    appPagesProjectName: config.appPagesProjectName || `${kubeName}-app`,
    wwwDomain: config.wwwDomain || (mainDomain.startsWith('www.') ? mainDomain : `www.${mainDomain}`),
    apiStackName,
    mongoStackName,
    apiServiceName: config.apiServiceName || `${apiStackName}_api`,
    mongoServiceName: config.mongoServiceName || `${mongoStackName}_mongo`,
    networkName: config.networkName || `${projectSlug}_app_network`,
    mongoRootUserSecret: config.mongoRootUserSecret || `${projectSlug}_mongo_root_user`,
    mongoRootPassSecret: config.mongoRootPassSecret || `${projectSlug}_mongo_root_pass`,
    mongoUriSecret: config.mongoUriSecret || `${projectSlug}_mongodb_uri`,
    kubeNamespace: config.kubeNamespace || kubeName,
    helmReleaseName: config.helmReleaseName || kubeName,
    mongoHost
  };
}

function kubernetesName(value) {
  const name = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');

  return name || 'project';
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug || 'project';
}
