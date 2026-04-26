#!/usr/bin/env bash
set -euo pipefail

TOOLKIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="${TOOLKIT_DIR}/setup-cli"

if ! command -v node > /dev/null 2>&1; then
  if command -v apt > /dev/null 2>&1; then
    echo "Node.js is missing; installing Node.js 20..."
    apt update
    apt install -y ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
  else
    echo "Node.js is required. Install Node.js 20, then rerun this command."
    exit 1
  fi
fi

node "${CLI_DIR}/src/index.js" "$@"
