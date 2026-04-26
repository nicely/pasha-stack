# Pasha Stack

Reusable starter kit for launching a Node API project on a VPS with Docker Swarm, MongoDB, GHCR deploys, and Cloudflare routing.

## Quick Start

Open the interactive TUI:

```bash
cd /root/projects/pasha-stack
./setup.sh
```

The TUI lets you run preflight, create a project, run full setup, run one setup step, or show status.

Run the readiness checklist first:

```bash
cd /root/projects/pasha-stack
./setup.sh preflight
```

The same preflight checklist runs automatically before `create-project` and `setup`.

```bash
cd /root/projects/pasha-stack
./setup.sh create-project
```

Then enter the generated project and run setup steps:

```bash
cd /root/projects/my-project
/root/projects/pasha-stack/setup.sh setup full
```

Run one step only:

```bash
/root/projects/pasha-stack/setup.sh setup step swarm
/root/projects/pasha-stack/setup.sh setup step secrets
/root/projects/pasha-stack/setup.sh setup step stacks
```

Dry-run a command:

```bash
/root/projects/pasha-stack/setup.sh setup full --dry-run
```

Check server state:

```bash
/root/projects/pasha-stack/setup.sh status
```

Direct commands still work for automation and copy/paste usage.

## What It Creates

- A Node/Express API with `/health` and `/`.
- A `backend/` folder with `backend/api`, leaving room for future folders like `backend/cronjob`.
- A static `frontend/` with a cozy coffee-colored Neo Evliya Celebi homepage, blog, and app placeholder.
- MongoDB in Docker Swarm.
- Docker Swarm stack files for API and Mongo.
- GitHub Actions workflows for API deploys and Cloudflare Pages deploys.
- A Cloudflare tunnel config example for the API hostname.

## Preflight Checklist

The CLI runs automated checks only. It prints green `[OK]` items, red `[FAIL]` items, and yellow `[WARN]` items.

- Node.js 20+
- Git
- Docker and Docker daemon access
- GitHub CLI auth
- GitHub scopes: `repo`, `workflow`, `read:packages`
- GitHub repository reachability when a generated project config exists
- GitHub secret presence for deploy and Cloudflare secrets when a generated project config exists
- `cloudflared`
- Cloudflare tunnel login certificate
- Cloudflare token verification when `CLOUDFLARE_API_TOKEN` is exported locally
- Cloudflare account/zone ID availability when exported locally

GitHub secret values cannot be read back, so the toolkit can verify that secrets exist, but not the permissions of a Cloudflare token stored only in GitHub. Keeping secrets locally is not safe; prefer `gh secret set` for storage. Only export `CLOUDFLARE_API_TOKEN` temporarily if you want local token verification, then remove it from the shell.

## Secret Rules

- Docker Swarm secrets live on the VPS and are mounted into containers under `/run/secrets`.
- GitHub secrets live in the GitHub repository and are used by Actions.
- The generated `.pasha-stack.json` keeps non-secret project settings only.

## Multi-Project Safety

Generated projects use names derived from the project folder name, so a new project does not reuse another project's Swarm names.

For a project named `my-project`, names look like:

- API stack: `my_project_api`
- Mongo stack: `my_project_mongo`
- API service: `my_project_api_api`
- Mongo service: `my_project_mongo_mongo`
- Network: `my_project_app_network`
- Secrets: `my_project_mongo_root_user`, `my_project_mongo_root_pass`, `my_project_mongodb_uri`

The API published port is also configurable during `create-project`. Use a different port when multiple projects live on the same VPS.

## Progress Tracking

The toolkit writes setup progress under:

```text
/root/projects/pasha-stack/progress/<project-slug>/
  progress.json
  logs.txt
```

`progress.json` stores the latest status for each step. `logs.txt` keeps an append-only timeline.
