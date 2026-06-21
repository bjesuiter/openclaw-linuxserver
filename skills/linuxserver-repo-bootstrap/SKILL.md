---
name: linuxserver-repo-bootstrap
description: Scaffold a reusable LinuxServer.io-style Docker repository with dual base images (Alpine + Ubuntu). Supports minimal mode (local dev + manual registry push) and full mode (adds GitHub Actions CI/CD).
---

# LinuxServer.io Repo Bootstrap

Use this skill when the user asks to:
- create a new LinuxServer.io-style repo
- scaffold Dockerfiles for Alpine + Ubuntu bases
- set up s6-overlay service structure
- add minimal local-dev-only setup
- add full CI/CD workflows for container builds and registry publishing

## Modes

### `minimal`
Creates only what is needed for:
- local development
- local image builds
- manual pushes to registries

### `full`
Creates everything from `minimal`, plus:
- GitHub Actions workflow to build/test/publish multi-arch images
- GitHub Actions smoke tests

## How to run

From the target repository root:

```bash
node skills/linuxserver-repo-bootstrap/references/scaffold_linuxserver_repo.mjs \
  --mode minimal \
  --app-slug myapp \
  --app-name "My App" \
  --port 3000 \
  --registry ghcr.io/my-org
```

Full mode:

```bash
node skills/linuxserver-repo-bootstrap/references/scaffold_linuxserver_repo.mjs \
  --mode full \
  --app-slug myapp \
  --app-name "My App" \
  --port 3000 \
  --registry ghcr.io/my-org
```

(There is also a small shell wrapper at `references/scaffold_linuxserver_repo.sh` for compatibility on Unix-like systems.)

## Install this skill for reuse

Copy or symlink this folder into your global skills directory:

```bash
mkdir -p ~/.agents/skills
cp -R skills/linuxserver-repo-bootstrap ~/.agents/skills/
# or: ln -s "$(pwd)/skills/linuxserver-repo-bootstrap" ~/.agents/skills/linuxserver-repo-bootstrap
```

## Notes

- The scaffold uses a generic `APP_START_CMD` env var so different apps can reuse the same baseline.
- Generated files are safe-by-default: existing files are not overwritten unless `--force` is used.
- `minimal` writes local dev/build scaffolding; `full` additionally writes GitHub Actions publish + smoke-test workflows.
