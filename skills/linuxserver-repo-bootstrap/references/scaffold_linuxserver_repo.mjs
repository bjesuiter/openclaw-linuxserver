#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const options = {
  mode: 'minimal',
  appSlug: 'myapp',
  appName: 'My App',
  port: '3000',
  registry: 'ghcr.io/your-org',
  force: false,
};

function usage() {
  console.log(`Scaffold a LinuxServer.io-style repository.

Usage:
  node scaffold_linuxserver_repo.mjs [options]

Options:
  --mode <minimal|full>   Scaffold mode (default: minimal)
  --app-slug <slug>       Image/app slug, e.g. openclaw
  --app-name <name>       Display name, e.g. OpenClaw
  --port <port>           Container port to expose (default: 3000)
  --registry <registry>   Registry namespace (default: ghcr.io/your-org)
  --force                 Overwrite existing files
  -h, --help              Show this help

Examples:
  node scaffold_linuxserver_repo.mjs --mode minimal --app-slug openclaw --app-name "OpenClaw" --port 3000 --registry ghcr.io/acme
  node scaffold_linuxserver_repo.mjs --mode full --app-slug myapp --app-name "My App" --registry ghcr.io/acme`);
}

function parseArgs(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--mode':
        options.mode = argv[++i] ?? '';
        break;
      case '--app-slug':
        options.appSlug = argv[++i] ?? '';
        break;
      case '--app-name':
        options.appName = argv[++i] ?? '';
        break;
      case '--port':
        options.port = argv[++i] ?? '';
        break;
      case '--registry':
        options.registry = argv[++i] ?? '';
        break;
      case '--force':
        options.force = true;
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        usage();
        process.exit(1);
    }
  }
}

function validateOptions() {
  if (!['minimal', 'full'].includes(options.mode)) {
    throw new Error("--mode must be 'minimal' or 'full'");
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.appSlug)) {
    throw new Error('--app-slug must match ^[a-z0-9][a-z0-9-]*$');
  }

  if (!/^[0-9]+$/.test(options.port)) {
    throw new Error('--port must be numeric');
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createFile(relativePath, content, { executable = false } = {}) {
  const targetPath = path.resolve(process.cwd(), relativePath);
  const exists = await pathExists(targetPath);

  if (exists && !options.force) {
    console.log(`skip: ${relativePath} (exists, use --force to overwrite)`);
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content.replace(/\r\n/g, '\n'), 'utf8');

  if (executable) {
    await fs.chmod(targetPath, 0o755);
  }

  console.log(`${exists ? 'overwrite' : 'write'}: ${relativePath}`);
}

function templates() {
  const { appSlug, appName, port, registry } = options;

  const readme = `# ${appSlug}-linuxserver

LinuxServer.io-style container scaffold for **${appName}**.

This repository contains:
- \`Dockerfile.alpine\` (Alpine base)
- \`Dockerfile.ubuntu\` (Ubuntu base)
- shared s6-overlay service structure under \`root/\`
- Docker Bake targets for Alpine + Ubuntu + multi-arch
${options.mode === 'full' ? '- GitHub Actions workflows for build/publish/smoke testing\n' : ''}
## Quick start (local)

1. Copy env file:

   \`\`\`bash
   cp .env.example .env
   # then set APP_START_CMD to your real startup command
   \`\`\`

2. Build and run:

   \`\`\`bash
   docker compose up --build
   \`\`\`

## Build targets

- Alpine image: \`${registry}/${appSlug}:alpine\`
- Ubuntu image: \`${registry}/${appSlug}:ubuntu\`

\`\`\`bash
# local docker output
DOCKER_BUILDKIT=1 docker buildx bake alpine-local
DOCKER_BUILDKIT=1 docker buildx bake ubuntu-local

# multi-arch push
DOCKER_BUILDKIT=1 docker buildx bake alpine ubuntu --push
\`\`\`

## Runtime contract

The service is started from env var \`APP_START_CMD\`.

Example:
\`\`\`env
APP_START_CMD=node /app/server.js
\`\`\`

If \`APP_START_CMD\` is not set, the container will start and sleep for debugging.
`;

  const compose = `services:
  ${appSlug}:
    image: ${appSlug}:dev-alpine
    build:
      context: .
      dockerfile: Dockerfile.alpine
      args:
        BUILD_DATE: local
        VERSION: local
        APP_VERSION: local
    environment:
      PUID: \${PUID:-1000}
      PGID: \${PGID:-1000}
      TZ: \${TZ:-UTC}
      APP_START_CMD: \${APP_START_CMD:-sleep infinity}
    ports:
      - "${port}:${port}"
    volumes:
      - ./config:/config
    restart: unless-stopped
`;

  const dockerfileAlpine = `FROM lscr.io/linuxserver/baseimage-alpine:3.22

ARG BUILD_DATE
ARG VERSION
ARG APP_VERSION

LABEL org.opencontainers.image.title="${appName}"
LABEL org.opencontainers.image.description="LinuxServer.io-style image for ${appName}"
LABEL org.opencontainers.image.version="${appName}-$APP_VERSION"
LABEL org.opencontainers.image.created="$BUILD_DATE"

ENV APP_NAME="${appName}" \\
    APP_SLUG="${appSlug}" \\
    APP_PORT="${port}" \\
    APP_START_CMD="sleep infinity"

COPY root/ /

EXPOSE ${port}
`;

  const dockerfileUbuntu = `FROM lscr.io/linuxserver/baseimage-ubuntu:jammy

ARG BUILD_DATE
ARG VERSION
ARG APP_VERSION

LABEL org.opencontainers.image.title="${appName}"
LABEL org.opencontainers.image.description="LinuxServer.io-style image for ${appName}"
LABEL org.opencontainers.image.version="${appName}-$APP_VERSION"
LABEL org.opencontainers.image.created="$BUILD_DATE"

ENV APP_NAME="${appName}" \\
    APP_SLUG="${appSlug}" \\
    APP_PORT="${port}" \\
    APP_START_CMD="sleep infinity"

COPY root/ /

EXPOSE ${port}
`;

  const bake = `variable "REGISTRY" {
  default = "${registry}"
}

variable "IMAGE_NAME" {
  default = "${appSlug}"
}

group "default" {
  targets = ["alpine-local", "ubuntu-local"]
}

target "_common" {
  context = "."
  platforms = ["linux/amd64", "linux/arm64"]
  args = {
    BUILD_DATE = "{{.DATE}}"
    VERSION    = "{{.DATE}}"
    APP_VERSION = "local"
  }
}

target "alpine" {
  inherits = ["_common"]
  dockerfile = "Dockerfile.alpine"
  tags = ["\${REGISTRY}/\${IMAGE_NAME}:alpine"]
}

target "ubuntu" {
  inherits = ["_common"]
  dockerfile = "Dockerfile.ubuntu"
  tags = ["\${REGISTRY}/\${IMAGE_NAME}:ubuntu"]
}

target "alpine-local" {
  inherits = ["alpine"]
  platforms = ["linux/amd64"]
  output = ["type=docker"]
  tags = ["\${IMAGE_NAME}:dev-alpine"]
}

target "ubuntu-local" {
  inherits = ["ubuntu"]
  platforms = ["linux/amd64"]
  output = ["type=docker"]
  tags = ["\${IMAGE_NAME}:dev-ubuntu"]
}
`;

  const serviceRun = `#!/usr/bin/with-contenv bash
set -euo pipefail

if [[ -z "\${APP_START_CMD:-}" ]]; then
  echo "APP_START_CMD is empty; sleeping for debug session"
  exec sleep infinity
fi

echo "Starting: \${APP_START_CMD}"
exec /usr/bin/env bash -lc "\${APP_START_CMD}"
`;

  const workflowPublish = `name: docker-publish

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      fail-fast: false
      matrix:
        flavor: [alpine, ubuntu]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push \${{ matrix.flavor }}
        env:
          REGISTRY: ghcr.io/\${{ github.repository_owner }}
          IMAGE_NAME: ${appSlug}
        run: |
          docker buildx bake \${{ matrix.flavor }} \\
            --push \\
            --set *.tags="$REGISTRY/$IMAGE_NAME:\${{ matrix.flavor }}"
`;

  const workflowSmoke = `name: smoke-test

on:
  pull_request:
  workflow_dispatch:

jobs:
  smoke:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        flavor: [alpine, ubuntu]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build local image
        run: docker buildx bake \${{ matrix.flavor }}-local

      - name: Boot container and verify HTTP response
        run: |
          docker run -d --name app \\
            -e APP_START_CMD="python3 -m http.server ${port} --bind 0.0.0.0" \\
            -p ${port}:${port} \\
            ${appSlug}:dev-\${{ matrix.flavor }}
          sleep 5
          curl -fsS "http://127.0.0.1:${port}" >/dev/null
`;

  return {
    readme,
    compose,
    dockerfileAlpine,
    dockerfileUbuntu,
    bake,
    serviceRun,
    workflowPublish,
    workflowSmoke,
  };
}

async function scaffold() {
  const t = templates();

  await createFile('.gitignore', '.env\n.local\n*.log\n.DS_Store\n');
  await createFile('README.md', t.readme);
  await createFile('.env.example', 'PUID=1000\nPGID=1000\nTZ=UTC\nAPP_START_CMD=sleep infinity\n');
  await createFile('docker-compose.yml', t.compose);
  await createFile('docker-bake.hcl', t.bake);
  await createFile('Dockerfile.alpine', t.dockerfileAlpine);
  await createFile('Dockerfile.ubuntu', t.dockerfileUbuntu);

  const svcName = `svc-${options.appSlug}`;
  await createFile(`root/etc/s6-overlay/s6-rc.d/${svcName}/type`, 'longrun\n');
  await createFile(`root/etc/s6-overlay/s6-rc.d/${svcName}/run`, t.serviceRun, { executable: true });
  await createFile(`root/etc/s6-overlay/s6-rc.d/user/contents.d/${svcName}`, '\n');

  if (options.mode === 'full') {
    await createFile('.github/workflows/docker-publish.yml', t.workflowPublish);
    await createFile('.github/workflows/smoke-test.yml', t.workflowSmoke);
  }

  console.log(`\nDone. Mode: ${options.mode}`);
}

async function main() {
  parseArgs(process.argv.slice(2));

  try {
    validateOptions();
    await scaffold();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

await main();
