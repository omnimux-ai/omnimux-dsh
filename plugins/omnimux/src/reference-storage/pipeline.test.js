import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeOmnimuxVideo } from '../media/video.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4o6EBAAMQAS0ujiXaAAAAAElFTkSuQmCC', 'base64')
test('enabled user storage failure prevents injected runtime submission despite disabled legacy hosting', async () => {
  const home = mkdtempSync(join(tmpdir(), 'reference-pipeline-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const image = join(home, 'ref.png')
  writeFileSync(image, png)
  let submissions = 0
  const runtime = { async execute() { submissions++; return { status: 'submitted', taskId: 'must-not-submit', outputs: [] } } }
  try {
    await assert.rejects(executeOmnimuxVideo({ prompt: 'a running cat', dest: join(home, 'out.mp4'), model: 'minimax-h3', operation: 'first_frame', image, env: { OMNIMUX_API_KEY: 'sk-test-reference' }, runtime, uploadLocalAssets: false, wait: false,
      runtimeSettings: { referenceStorage: { enabled: true, endpoint: 'https://storage.example.test', bucket: 'reference-media', region: 'auto', publicBaseUrl: 'https://media.example.test', credentialId: '0123456789abcdef0123456789abcdef' } },
      credentials: { async resolve() { return undefined } },
    }))
    assert.equal(submissions, 0)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
})
