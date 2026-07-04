import { runShell } from '../lib/runner.js';

const CHECKS = [
  ['Git', 'git --version'],
  ['Node', 'node --version'],
  ['Docker', 'docker --version'],
  ['Docker daemon', 'docker info --format "{{.ServerVersion}}"'],
  ['Docker Swarm', 'docker info --format "{{.Swarm.LocalNodeState}}"'],
  ['GitHub CLI', 'gh --version'],
  ['k3s', 'k3s --version'],
  ['kubectl', 'kubectl version --client'],
  ['Helm', 'helm version'],
  ['Cloudflared', 'cloudflared --version'],
  ['Stacks', 'docker stack ls'],
  ['Services', 'docker service ls'],
  ['Secrets', 'docker secret ls'],
  ['Kubernetes nodes', 'kubectl get nodes'],
  ['Kubernetes namespaces', 'kubectl get namespaces']
];

export async function showStatus() {
  for (const [label, command] of CHECKS) {
    console.log('');
    console.log(`==> ${label}`);

    try {
      await runShell(command);
    } catch (error) {
      console.log(`Unavailable: ${error.message}`);
    }
  }
}
