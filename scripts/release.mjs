// run the full release pipeline end-to-end.
//
// styled after puregram's regenerate-all.ts step runner (yarn → pnpm). gates the release on
// the same checks CI runs, then publishes and cuts github releases — so a release is
// self-contained and never ships code that didn't typecheck/test/lint. `pnpm test` builds
// `lib/` as a side effect, which is exactly what `pnpm publish` needs to pack.
//
// run locally with DRY_RUN=1 to rehearse: the gate runs for real, publish/release only print.

import { spawn } from 'node:child_process'

const STEPS = [
  { label: 'typecheck', command: 'pnpm', args: ['typecheck'] },
  { label: 'tests (also builds lib/)', command: 'pnpm', args: ['test'] },
  { label: 'lint', command: 'pnpm', args: ['lint'] },
  { label: 'publish to npm', command: 'node', args: ['scripts/publish-all.mjs'] },
  { label: 'github releases', command: 'node', args: ['scripts/auto-release.mjs'] }
]

const ESC = '\x1b['
const CYAN = `${ESC}36m`
const DIM = `${ESC}2m`
const GREEN = `${ESC}32m`
const RED = `${ESC}31m`
const RESET = `${ESC}0m`

async function run (step) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, { stdio: 'inherit' })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()

        return
      }

      reject(new Error(`${step.label} exited with code ${code ?? 'null'}`))
    })
  })
}

async function main () {
  const startedAt = Date.now()

  for (const [i, step] of STEPS.entries()) {
    console.log(`\n${CYAN}[${i + 1}/${STEPS.length}] ${step.label}${RESET}`)
    console.log(`${DIM}$ ${step.command} ${step.args.join(' ')}${RESET}`)

    await run(step)
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)

  console.log(`\n${GREEN}✓ release complete in ${seconds}s${RESET}`)
}

main().catch((error) => {
  console.error(`\n${RED}✗ release failed${RESET}`)
  console.error(error)
  process.exit(1)
})
