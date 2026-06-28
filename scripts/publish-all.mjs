// publish every public workspace package whose current version is not yet on npm.
//
// uses `pnpm publish` (not `npm publish`) so each `workspace:*` dependency is rewritten
// to its real published version on the way out — that's the whole reason a monorepo can
// publish at all. a package whose version already exists on the registry is skipped, so
// running this on every push to the default branch is a no-op until a version is bumped.
//
// set DRY_RUN=1 to print the plan without publishing. in CI it also passes --provenance
// (set NO_PROVENANCE=1 to opt out, e.g. if a package's `repository` field doesn't match).

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PKGS_DIR = 'packages'
const DRY_RUN = process.env.DRY_RUN === '1'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

// every non-private package under packages/* (name + version come from its manifest, so
// the directory name is irrelevant — `yaebal` and `create-yaebal` are picked up too).
function workspacePackages () {
  const out = []

  for (const entry of readdirSync(PKGS_DIR)) {
    const manifestPath = join(PKGS_DIR, entry, 'package.json')

    if (!existsSync(manifestPath)) {
      continue
    }

    const manifest = readJson(manifestPath)

    if (manifest.private || !manifest.name || !manifest.version) {
      continue
    }

    out.push({ dir: join(PKGS_DIR, entry), name: manifest.name, version: manifest.version })
  }

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// is <name>@<version> already on the registry? a non-zero `npm view` (404 for a brand-new
// package or an unpublished version) is treated as "not published".
function isPublished (name, version) {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()

    return out === version
  } catch {
    return false
  }
}

function publish (pkg) {
  const args = ['--filter', pkg.name, 'publish', '--access', 'public', '--no-git-checks']

  if (process.env.CI && process.env.NO_PROVENANCE !== '1') {
    args.push('--provenance')
  }

  execFileSync('pnpm', args, { stdio: 'inherit' })
}

const published = []
const skipped = []

for (const pkg of workspacePackages()) {
  const id = `${pkg.name}@${pkg.version}`

  if (isPublished(pkg.name, pkg.version)) {
    skipped.push(id)

    continue
  }

  if (DRY_RUN) {
    console.log(`would publish ${id}`)
    published.push(id)

    continue
  }

  console.log(`publishing ${id}`)
  publish(pkg)
  published.push(id)
}

console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}published ${published.length}, skipped ${skipped.length} (already on npm)`)

if (published.length > 0) {
  console.log(published.map((id) => `  + ${id}`).join('\n'))
}
