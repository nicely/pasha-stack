# Pasha Stack

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker Swarm](https://img.shields.io/badge/docker-swarm-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/engine/swarm/)
[![MongoDB](https://img.shields.io/badge/mongodb-ready-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Cloudflare](https://img.shields.io/badge/cloudflare-pages%20%2B%20tunnel-F38020?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/)
[![TUI](https://img.shields.io/badge/tui-clack-8B5CF6)](https://github.com/bombshell-dev/clack)
[![Preflight](https://img.shields.io/badge/preflight-automated-brightgreen)](#automated-preflight)

Pasha Stack is a small VPS bootstrap toolkit for shipping a new project fast, with a little Ottoman-flavored terminal ceremony.

- 🧭 Automated preflight checks before setup
- 🏗️ Project scaffolding with backend, frontend, Docker, and workflows
- 🐳 Namespaced Docker Swarm services for safe multi-project hosting
- 🍃 MongoDB with Docker secrets
- 🚢 Rolling API deploys from `main` via GitHub Actions + GHCR
- ☁️ Cloudflare Pages for the frontend, Tunnel for the backend

## The Caravan Route

```text
Pasha Stack TUI
  -> automated preflight
  -> project boilerplate
  -> Docker Swarm API + MongoDB
  -> GitHub Actions image deploy
  -> Cloudflare Pages + Tunnel
```

Generated projects look like this:

```text
backend/
  api/
frontend/
  blog/
  app/
docker/
.github/workflows/
```

## Quick Start

Clone and open the TUI:

```bash
git clone https://github.com/nicely/pasha-stack.git
cd pasha-stack
./setup.sh
```

The TUI can:

- Run automated preflight checks.
- Create a new project.
- Run full setup for the current project.
- Run one setup step.
- Show server status.

Direct commands still work for automation and copy/paste usage:

```bash
./setup.sh preflight
./setup.sh create-project
./setup.sh setup full --dry-run
./setup.sh status
```

From inside a generated project:

```bash
/root/projects/pasha-stack/setup.sh setup full
/root/projects/pasha-stack/setup.sh setup step swarm
/root/projects/pasha-stack/setup.sh setup step secrets
/root/projects/pasha-stack/setup.sh setup step stacks
```

## What It Creates

- A Node/Express API with `GET /health` and `GET /`.
- A `backend/` folder with `backend/api`, leaving room for future services like `backend/cronjob`.
- A static `frontend/` with a cozy coffee-colored Neo Evliya Celebi homepage, blog, and app placeholder.
- MongoDB in Docker Swarm.
- Docker Swarm stack files for API and Mongo.
- GitHub Actions workflows for API deploys and Cloudflare Pages deploys.
- A Cloudflare Tunnel config example for the API hostname.

## Automated Preflight

The CLI runs automated checks only. It prints green `[OK]`, red `[FAIL]`, and yellow `[WARN]` results.

Checks include:

- Node.js 20+
- Git
- Docker and Docker daemon access
- GitHub CLI auth
- GitHub scopes: `repo`, `workflow`, `read:packages`
- GitHub repository reachability when a generated project config exists
- GitHub secret presence for deploy and Cloudflare secrets
- `cloudflared`
- Cloudflare tunnel login certificate
- Cloudflare token verification when `CLOUDFLARE_API_TOKEN` is exported temporarily
- Cloudflare account/zone ID availability when exported temporarily

GitHub secret values cannot be read back, so Pasha Stack can verify that secrets exist, but not the permissions of a Cloudflare token stored only in GitHub. Keeping secrets locally is not safe; prefer `gh secret set` for storage. Only export `CLOUDFLARE_API_TOKEN` temporarily if you want local token verification, then remove it from the shell.

## Secret Rules

- Docker Swarm secrets live on the VPS and are mounted into containers under `/run/secrets`.
- GitHub secrets live in the GitHub repository and are used by Actions.
- The generated `.pasha-stack.json` keeps non-secret project settings only.
- `progress/` and `node_modules/` are ignored by Git.

## Multi-Project Safety

Generated projects use names derived from the project folder name, so a new project does not reuse another project's Swarm names.

For a project named `my-project`, names look like:

```text
API stack:     my_project_api
Mongo stack:   my_project_mongo
API service:   my_project_api_api
Mongo service: my_project_mongo_mongo
Network:       my_project_app_network
Secrets:       my_project_mongo_root_user
               my_project_mongo_root_pass
               my_project_mongodb_uri
```

The API published port is configurable during `create-project`, so multiple projects can share one VPS without fighting over port `3000`.

## Progress Tracking

Pasha Stack writes setup progress under:

```text
/root/projects/pasha-stack/progress/<project-slug>/
  progress.json
  logs.txt
```

`progress.json` stores the latest status for each step. `logs.txt` keeps an append-only timeline.

## Commands

```bash
./setup.sh                 # open the TUI
./setup.sh preflight       # run automated checks
./setup.sh create-project  # scaffold a project
./setup.sh setup full      # run all setup steps
./setup.sh setup step ghcr # run one setup step
./setup.sh status          # show server status
```

## Name

"Pasha" gives the toolkit its command-post feel: a small terminal divan for organizing infrastructure, routes, and deployments without making the project heavy.
