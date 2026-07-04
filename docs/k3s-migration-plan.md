# Pasha Stack k3s + Helm Migration Plan

## Goal

Add a Kubernetes deployment path for Pasha Stack using **k3s as the runtime** and **Helm as the only Kubernetes packaging/deployment format**.

Recommended direction:

- Keep Docker Swarm working during the transition.
- Add k3s + Helm as a new deployment target.
- Use Helm charts instead of plain `k8s/*.yml` or Kustomize.
- Later, optionally make k3s + Helm the default after smoke tests and docs are complete.

## Current Swarm Model

Current generated projects use:

```text
docker/swarm-api.yml
docker/swarm-mongo.yml
Docker Swarm secrets
Docker overlay network
GitHub Actions -> GHCR -> SSH -> docker service update
Cloudflare Tunnel -> http://127.0.0.1:<api_port>
```

The API service is currently managed by Swarm with:

- `replicas: 2`
- rolling update config
- rollback config
- healthcheck
- published host port
- Docker secret mounted at `/run/secrets/mongodb_uri`

## Target k3s + Helm Model

Generated projects should gain a Helm chart:

```text
charts/
  pasha-app/
    Chart.yaml
    values.yaml
    templates/
      namespace.yaml
      api-deployment.yaml
      api-service.yaml
      api-ingress.yaml
      mongo-statefulset.yaml
      mongo-service.yaml
      mongo-pvc.yaml
      secret.yaml
      _helpers.tpl
```

Runtime model:

```text
VPS
└── k3s node
    └── namespace: <project_slug>
        ├── Deployment/api, replicas: 2
        ├── Service/api
        ├── StatefulSet/mongo, replicas: 1
        ├── Service/mongo
        ├── Secret/mongodb
        ├── PersistentVolumeClaim/mongo-data
        └── Ingress or Cloudflare Tunnel target
```

## Why Helm Only

For team consistency, use one Kubernetes packaging style. Helm gives the team:

- one standard folder structure
- one standard deploy command
- centralized config in `values.yaml`
- release history
- `helm upgrade --install`
- `helm rollback`
- easy future reuse across generated projects

Plain YAML and Kustomize should not be generated in the first k3s version unless needed for debugging examples.

## Swarm-to-k3s/Helm Mapping

| Swarm | k3s + Helm/Kubernetes |
|---|---|
| `docker stack deploy` | `helm upgrade --install ...` |
| Stack name | Helm release name |
| Stack namespace via names | Kubernetes namespace |
| Service | Deployment + Service templates |
| Task/container | Pod/container |
| `replicas: 2` | `values.yaml -> api.replicaCount: 2` |
| Docker secret | Kubernetes Secret template or CLI-created Secret |
| Overlay network | Kubernetes cluster DNS/networking |
| Published port | Service + Ingress/NodePort/Cloudflare Tunnel |
| `docker service update --image` | `helm upgrade --set api.image.tag=...` |
| Swarm rolling update | Kubernetes Deployment rolling update strategy |
| Swarm rollback | `helm rollback <release>` or `kubectl rollout undo` |

## Proposed CLI Changes

Add deployment target support to project config:

```json
{
  "deploymentTarget": "swarm" | "k3s"
}
```

Add new setup steps:

```text
k3s              Install/check k3s, kubectl, and helm
helm-namespace   Create project namespace
helm-secrets     Create Kubernetes secrets
helm-deploy      Install/upgrade the Helm release
helm-deploy-user Configure deploy user/kubeconfig access
helm-verify      Verify Helm release, pods, services, rollout, and health
observability    Optional Prometheus, Loki, and Grafana add-on
observability-verify Verify dashboards/data sources and basic alerts
```

Possible command examples:

```bash
./setup.sh create-project
./setup.sh setup k3s full
./setup.sh setup k3s step helm-deploy
./setup.sh status
```

Alternative lower-risk first implementation:

```bash
./setup.sh setup step k3s
./setup.sh setup step helm-secrets
./setup.sh setup step helm-deploy
./setup.sh setup step helm-verify
```

This avoids changing the existing `setup full` behavior immediately.

## Template Changes

Add a new template directory:

```text
templates/node-api-k3s/
```

This avoids mixing Swarm and Kubernetes files too early.

Generated k3s project layout:

```text
backend/api/
frontend/
charts/pasha-app/
.github/workflows/
cloudflared-config.yml.example
.pasha-stack.json
```

Later, templates can be unified with conditional rendering.

## Helm Chart Design

### Chart.yaml

```yaml
apiVersion: v2
name: pasha-app
description: Pasha Stack application chart
type: application
version: 0.1.0
appVersion: "1.0.0"
```

### values.yaml

Values are team-owned config keys. They do not have to exactly match Kubernetes keys, but they should be clear and consistent.

```yaml
namespace:
  create: true
  name: {{PROJECT_SLUG}}

api:
  name: api
  replicaCount: 2
  image:
    repository: {{GHCR_IMAGE}}
    tag: latest
    pullPolicy: IfNotPresent
  containerPort: 3000
  service:
    type: ClusterIP
    port: 80
  ingress:
    enabled: false
    host: {{API_DOMAIN}}
  env:
    nodeEnv: production
  probes:
    path: /health

mongo:
  enabled: true
  name: mongo
  image: mongo:7
  service:
    port: 27017
  persistence:
    enabled: true
    size: 5Gi
  auth:
    existingSecret: mongodb
    usernameKey: root-user
    passwordKey: root-password
    uriKey: uri
```

### API Deployment Template

Kubernetes keys must remain valid Kubernetes. Helm values are only placeholders inside those files.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.api.name }}
  namespace: {{ .Values.namespace.name }}
spec:
  replicas: {{ .Values.api.replicaCount }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .Values.api.name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .Values.api.name }}
    spec:
      containers:
        - name: {{ .Values.api.name }}
          image: "{{ .Values.api.image.repository }}:{{ .Values.api.image.tag }}"
          imagePullPolicy: {{ .Values.api.image.pullPolicy }}
          ports:
            - containerPort: {{ .Values.api.containerPort }}
          env:
            - name: PORT
              value: "{{ .Values.api.containerPort }}"
            - name: NODE_ENV
              value: {{ .Values.api.env.nodeEnv | quote }}
            - name: MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.mongo.auth.existingSecret }}
                  key: {{ .Values.mongo.auth.uriKey }}
          readinessProbe:
            httpGet:
              path: {{ .Values.api.probes.path }}
              port: {{ .Values.api.containerPort }}
          livenessProbe:
            httpGet:
              path: {{ .Values.api.probes.path }}
              port: {{ .Values.api.containerPort }}
```

### MongoDB

Use Helm templates for:

```text
StatefulSet/mongo
Service/mongo
PersistentVolumeClaim/mongo-data
Secret/mongodb, optional only for non-sensitive placeholders
```

Mongo connection string inside the namespace:

```text
mongodb://<user>:<password>@mongo:27017/app?authSource=admin
```

Do not commit real secret values to `values.yaml`.

## Secret Handling

Recommended first pass: create real secrets outside Helm, then reference them from the chart.

CLI command shape:

```bash
kubectl -n {{PROJECT_SLUG}} create secret generic mongodb \
  --from-literal=root-user='...' \
  --from-literal=root-password='...' \
  --from-literal=uri='...' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Then Helm references:

```yaml
mongo:
  auth:
    existingSecret: mongodb
```

This avoids storing secret values in Git.

Later optional additions:

- External Secrets Operator
- Sealed Secrets
- SOPS
- cloud/provider secret managers

## Cloudflare Tunnel Options

For single-node VPS k3s, there are two practical options.

### Option A: Keep host-port tunnel target first

Expose API with NodePort or local ingress port, then keep:

```text
Cloudflare Tunnel -> http://127.0.0.1:<api_port>
```

This is closest to the current Swarm model.

### Option B: Tunnel into Kubernetes service

Run `cloudflared` outside or inside the cluster and route to:

```text
http://api.<namespace>.svc.cluster.local
```

This is more Kubernetes-native but adds complexity.

Recommendation: start with Option A, then add Option B later.

## GitHub Actions Changes

Current Swarm deploy:

```bash
docker service update --with-registry-auth --image "$IMAGE_TAG" "$SERVICE_NAME"
```

k3s + Helm deploy should become:

```bash
helm upgrade --install {{PROJECT_SLUG}} ./charts/pasha-app \
  --namespace {{PROJECT_SLUG}} \
  --create-namespace \
  --set api.image.tag="$IMAGE_TAG"

kubectl -n {{PROJECT_SLUG}} rollout status deployment/api --timeout=120s
```

Recommended first pass:

- Continue building and pushing images to GHCR.
- SSH to VPS.
- Use server-side `helm` and `kubectl` against local k3s.
- Run `helm upgrade --install` with the new image tag.
- Wait for rollout status.

Rollback commands to document:

```bash
helm -n {{PROJECT_SLUG}} history {{PROJECT_SLUG}}
helm -n {{PROJECT_SLUG}} rollback {{PROJECT_SLUG}} <revision>
```

## Implementation Phases

### Phase 1: Planning and Helm chart skeleton

- Create `templates/node-api-k3s/`.
- Copy current API/frontend files from `node-api-swarm`.
- Add `charts/pasha-app/` Helm chart.
- Add k3s + Helm README instructions.
- Keep Swarm template untouched.

### Phase 2: CLI target selection

- Add deployment target prompt: `swarm` or `k3s`.
- Save `deploymentTarget` in `.pasha-stack.json`.
- Add config replacements for `PROJECT_SLUG`, Helm release name, namespace, and chart values.
- Make `create-project` copy the selected template.

### Phase 3: k3s + Helm setup steps

- Add setup step for k3s install/check.
- Add setup step for Helm install/check.
- Add namespace creation.
- Add Kubernetes secret creation.
- Add Helm release install/upgrade.
- Add verification.

### Phase 4: k3s + Helm GitHub Actions deploy

- Add Helm-based deploy workflow.
- Build/push to GHCR as before.
- SSH into VPS and run `helm upgrade --install`.
- Wait for Kubernetes rollout status.
- Document Helm rollback.

### Phase 5: Cloudflare integration

- Initially route Cloudflare Tunnel to local API port or ingress endpoint.
- Add docs for k3s Traefik ingress.
- Later consider in-cluster `cloudflared`.

### Phase 6: Observability add-on

Add observability as an optional Helm-managed add-on after the core k3s + Helm app flow works.

Recommended stack:

```text
Prometheus = metrics storage/query
Loki       = logs storage/query
Grafana    = dashboards, exploration, and alerting UI
```

Recommended install approach:

- Use upstream Helm charts instead of writing custom charts.
- Keep observability in a separate namespace, for example `observability`.
- Keep it optional so the first k3s migration does not become too heavy.

Possible charts:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace observability \
  --create-namespace

helm upgrade --install loki grafana/loki \
  --namespace observability \
  --create-namespace
```

What to observe first:

- API pod CPU/memory/restarts
- API rollout status and unavailable replicas
- API `/health` uptime checks
- API error logs
- Mongo pod CPU/memory/restarts
- Mongo storage usage
- k3s node CPU/memory/disk
- image pull failures and crash loops

Optional later additions:

- Blackbox Exporter for external `/health` checks
- Alertmanager or Grafana Alerting notification routes
- Grafana Alloy or Promtail for log shipping, depending on chosen Loki chart mode
- Sentry or OpenTelemetry/Tempo for app errors and traces

### Phase 7: Smoke tests

Add dry-run and syntax checks:

```bash
npm run check
helm lint charts/pasha-app
helm template test-release charts/pasha-app
./setup.sh create-project --dry-run
./setup.sh setup step k3s --dry-run
./setup.sh setup step helm-deploy --dry-run
./setup.sh setup step observability --dry-run
```

If k3s is available in test environment:

```bash
helm upgrade --install <project_slug> charts/pasha-app --namespace <project_slug> --create-namespace --dry-run
helm upgrade --install <project_slug> charts/pasha-app --namespace <project_slug> --create-namespace
kubectl -n <project_slug> rollout status deployment/api
curl -s http://127.0.0.1:<api_port>/health
helm -n observability list
kubectl -n observability get pods
```

## Risks and Decisions

### Mongo on Kubernetes

MongoDB inside Kubernetes is more sensitive than stateless API pods. For production, users may prefer managed MongoDB or an external database.

Decision needed later:

- Keep bundled Mongo StatefulSet for self-hosted simplicity.
- Also support external Mongo URI for production.

### Ingress choice

k3s ships with Traefik by default. We can use it, but Cloudflare Tunnel may avoid public ingress complexity.

Decision needed later:

- Keep Cloudflare Tunnel as primary public routing.
- Use Ingress mainly as internal routing to the API service.

### Observability scope

Prometheus, Loki, and Grafana are valuable, but they add CPU, memory, storage, and operational complexity.

Decision for first implementation:

- Do not block the core k3s + Helm migration on observability.
- Add observability as an optional setup step after the app deploy works.
- Use existing community Helm charts.
- Provide conservative default retention/storage settings for small VPS machines.

### Secret management

Do not put real secrets in Helm values files.

Decision needed later:

- CLI-created Kubernetes Secrets for first version.
- External Secrets/SOPS/Sealed Secrets for advanced version.

### Swarm compatibility

Do not remove Swarm until k3s + Helm flow has tests and docs.

## Recommended Branch Scope

This branch should first deliver:

1. Migration plan document.
2. k3s template skeleton with `charts/pasha-app/`.
3. CLI support for selecting `swarm` vs `k3s`.
4. New k3s + Helm setup steps in dry-run-safe form.
5. Optional observability plan using Prometheus, Loki, and Grafana.

Avoid removing Swarm in the first PR.
