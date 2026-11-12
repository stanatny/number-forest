const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { enumerateCorpus, normalizeText } = require('../scripts/voice-corpus.cjs');
const root = path.resolve(__dirname, '..');

test('every original lesson prompt and recorded guide resolves to a local audio file', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/voice/manifest.js'), 'utf8'), context);
  const clips = context.window.NumberForestVoiceClips;
  const corpus = enumerateCorpus();
  const required = [...corpus.prompts, ...corpus.common, ...corpus.guidance];
  const missing = required.filter(text => !clips[normalizeText(text)]);
  assert.deepEqual(missing, [], 'New or changed questions need complete spoken recordings');
  for (const filename of Object.values(clips)) {
    assert.match(filename, /^assets\/voice\/serena-[a-f0-9]{20}\.mp3$/);
    const audio = fs.readFileSync(path.join(root, filename));
    assert(audio.length > 1000, filename + ' is empty or truncated');
    assert.equal(audio.subarray(0, 3).toString(), 'ID3', filename + ' must be an MP3');
  }
});

test('all award faces and the reverse are embedded without stale artwork', () => {
  class Image { decode() { return Promise.resolve(); } }
  const context = { Image };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/badge-art.js'), 'utf8'), context);
  const svgIds = ['bonds', 'arithmetic', 'groups', 'sharing', 'clock', 'reverse'];
  const pngIds = ['decimal', 'negative', 'parity', 'negative-operations'];
  for (const id of [...svgIds, ...pngIds]) {
    const source = context.NumberForestBadgeArt.sources[id];
    const svg = svgIds.includes(id);
    assert.ok(source.startsWith(svg ? 'data:image/svg+xml;base64,' : 'data:image/png;base64,'));
    const decoded = Buffer.from(source.split(',')[1], 'base64');
    assert.deepEqual(decoded, fs.readFileSync(path.join(root, 'assets/badges', id + (svg ? '.svg' : '.png'))), 'Regenerate embedded badge art after editing ' + id);
  }
});
