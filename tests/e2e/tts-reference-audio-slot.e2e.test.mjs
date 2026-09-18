import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modelsPath = join(here, '../../plugins/omnimux/src/catalog/specs/audio-models.yaml');
const modelsYaml = readFileSync(modelsPath, 'utf8');

const profilesPath = join(here, '../../plugins/omnimux/src/catalog/contract/adapter-profiles.json');
const profilesJson = readFileSync(profilesPath, 'utf8');

test('e2e: seed-audio-1.0 declares optional reference_audio slot and adapter-profiles allows references', () => {
  // 1. 验证 audio-models.yaml 中 seed-audio-1.0 包含可选的 reference_audio 槽位
  assert.match(modelsYaml, /slot:\s*"reference_audio"/, 'audio-models.yaml must declare reference_audio slot');
  assert.match(modelsYaml, /role:\s*"reference"/, 'reference_audio must have role reference');
  assert.match(modelsYaml, /min:\s*0/, 'reference_audio must be optional (min: 0)');

  // 2. 验证 adapter-profiles.json 中 text_to_speech 包含 references 允许列表
  const profiles = JSON.parse(profilesJson);
  const audioProfile = profiles.profiles.find((p) => p.id === 'audioGenerate');
  assert.ok(audioProfile, 'audioGenerate profile must exist');
  const ttsShape = audioProfile.operationVendorShapes.text_to_speech;
  assert.ok(ttsShape.allow.includes('references'), 'text_to_speech vendor shape must allow references');
});
