#!/usr/bin/env node
/**
 * Deterministic unit tests for AgentTube narration contracts.
 *
 * Validates the narration input contract and the importer provenance resolver.
 * These tests are offline, pure, and self-contained; they do not invoke TTS,
 * remote workloads, or modify the database.
 *
 * Run: node scripts/validate-narration-contracts.js
 */

const path = require('path');

// Ensure the module root is on the require path.
const narrationInputValidatorPath = path.join(__dirname, '../utils/narration-input-validator');
const narrationImportProvenancePath = path.join(__dirname, '../utils/narration-import-provenance');

const {
  validateNarrationInput,
  assertValidNarrationInput,
  narrationTextSha256,
  parseNarrationInput
} = require(narrationInputValidatorPath);

const {
  buildNarrationWavFilename,
  readNarrationManifest,
  resolveNarrationProvenance
} = require(narrationImportProvenancePath);

class TestRunner {
  constructor() {
    this.results = [];
  }

  async runAll() {
    await this.runTest('Narration input validator: malformed JSON', this.testMalformedJSON.bind(this));
    await this.runTest('Narration input validator: minimal valid input', this.testMinimalValidInput.bind(this));
    await this.runTest('Narration input validator: duplicate scene IDs', this.testDuplicateSceneId.bind(this));
    await this.runTest('Narration input validator: sampleRate validation', this.testSampleRate.bind(this));

    await this.runTest('Narration import provenance: explicit CLI metadata', this.testProvenanceCli.bind(this));
    await this.runTest('Narration import provenance: manifest metadata', this.testProvenanceManifest.bind(this));
    await this.runTest('Narration import provenance: CLI vs manifest conflict', this.testProvenanceConflict.bind(this));
    await this.runTest('Narration import provenance: legacy default', this.testProvenanceLegacy.bind(this));
    await this.runTest('Narration import provenance: WAV filename building', this.testNarrationFilename.bind(this));
    await this.runTest('Narration import provenance: manifest reading', this.testManifestRead.bind(this));

    this.printResults();
  }

  async runTest(name, fn) {
    try {
      await fn();
      this.results.push({ name, status: 'PASS' });
      console.log(`✅ ${name}`);
    } catch (error) {
      this.results.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ ${name}\n   ${error.message}`);
    }
  }

  printResults() {
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.length - passed;
    console.log('\n===== Summary =====');
    console.log(`Total: ${this.results.length}  Passed: ${passed}  Failed: ${failed}`);
    if (failed > 0) {
      console.log('\nFailures:');
      for (const r of this.results.filter(r => r.status === 'FAIL')) {
        console.log(`  ${r.name}: ${r.error}`);
      }
      process.exitCode = 1;
    }
  }

  // ----- Narration input validator tests -----
  testMalformedJSON() {
    const invalid = '{ not json }';
    const parsed = parseNarrationInput(invalid);
    if (parsed.parsed !== null) throw new Error('parseNarrationInput should have returned null for invalid JSON');
    if (parsed.parseError === null) throw new Error('parseNarrationInput should have set parseError');
  }

  testMinimalValidInput() {
    const minimal = {
      jobKind: 'agenttube-narration',
      productionId: 'test-prod',
      createdAt: new Date().toISOString(),
      sampleRate: 24000,
      segments: [{
        sceneId: 'scene_a', position: 0, label: 'Label',
        estimatedDurationSec: 5, text: 'Hello world'
      }]
    };
    const { valid, errors, warnings, value } = validateNarrationInput(minimal);
    if (!valid) throw new Error(`validation should have succeeded but errors: ${errors.join(', ')}`);
    if (!value) throw new Error('value should be present');
    if (value.productionId !== 'test-prod') throw new Error('productionId mismatch');
  }

  testDuplicateSceneId() {
    const duplicate = {
      jobKind: 'agenttube-narration',
      productionId: 'prod_dup',
      createdAt: new Date().toISOString(),
      sampleRate: 24000,
      segments: [
        { sceneId: 'scene_a', position: 0, label: 'L1', estimatedDurationSec: 2, text: 'Text1' },
        { sceneId: 'scene_a', position: 1, label: 'L2', estimatedDurationSec: 2, text: 'Text2' }
      ]
    };
    const { valid, errors } = validateNarrationInput(duplicate);
    if (valid) throw new Error('duplicate sceneId should be caught');
    const found = errors.find(e => e.includes('sceneId') && e.includes('duplicated'));
    if (!found) throw new Error('expected duplicate sceneId error');
  }

  testSampleRate() {
    const invalid = {
      jobKind: 'agenttube-narration',
      productionId: 'prod_sr',
      createdAt: new Date().toISOString(),
      sampleRate: 22050,
      segments: [{ sceneId: 's', position: 0, label: 'L', estimatedDurationSec: 1, text: 't' }]
    };
    const { valid, warnings } = validateNarrationInput(invalid);
    if (!valid) throw new Error('sampleRate field should be accepted but validation failed');
    const warningFound = warnings.some(w => w.includes('sampleRate is') && w.includes('expects 24000'));
    if (!warningFound) throw new Error('expected warning about sampleRate mismatch');
  }

  // ----- Narration import provenance tests -----
  testProvenanceCli() {
    const resolved = resolveNarrationProvenance({
      cli: { provider: 'myprovider', model: 'mymodel', voice: 'myvoice', evidence: 'evidence note' },
      manifest: {}, jobId: null, allowLegacyDefault: false
    });
    if (!resolved.ok) throw new Error('provider resolution should succeed');
    if (resolved.provider !== 'myprovider') throw new Error(`provider expected 'myprovider', got '${resolved.provider}'`);
    if (resolved.model !== 'mymodel') throw new Error(`model expected 'mymodel', got '${resolved.model}'`);
    if (resolved.voice !== 'myvoice') throw new Error(`voice expected 'myvoice', got '${resolved.voice}'`);
    if (resolved.evidence !== 'evidence note') throw new Error(`evidence mismatch`);
    if (resolved.source !== 'cli') throw new Error(`source expected 'cli', got '${resolved.source}'`);
  }

  testProvenanceManifest() {
    const manifest = { provider: 'manifest-provider', model: 'manifest-model', evidence: 'manifest-evidence' };
    const resolved = resolveNarrationProvenance({
      cli: {}, manifest, jobId: 'job-123', allowLegacyDefault: false
    });
    if (!resolved.ok) throw new Error('provider resolution should succeed');
    if (resolved.provider !== 'manifest-provider') throw new Error('provider mismatch');
    if (resolved.model !== 'manifest-model') throw new Error('model mismatch');
    if (resolved.evidence !== 'manifest-evidence') throw new Error('evidence mismatch');
    if (resolved.source !== 'manifest') throw new Error(`source expected 'manifest', got '${resolved.source}'`);
  }

  testProvenanceConflict() {
    const manifest = { provider: 'manifest-provider' };
    const resolved = resolveNarrationProvenance({
      cli: { provider: 'cli-provider' }, manifest, jobId: null, allowLegacyDefault: false
    });
    if (resolved.ok) throw new Error('expected conflict error');
    if (!resolved.errors.some(e => e.includes('conflicting provider'))) throw new Error('expected conflicting provider error');
  }

  testProvenanceLegacy() {
    const resolved = resolveNarrationProvenance({
      cli: {}, manifest: {}, jobId: null, allowLegacyDefault: true
    });
    if (!resolved.ok) throw new Error('legacy default should succeed');
    if (resolved.provider !== 'kokoro-82m') throw new Error(`expected provider 'kokoro-82m', got '${resolved.provider}'`);
    if (resolved.model !== 'hexgrad/Kokoro-82M') throw new Error(`expected model 'hexgrad/Kokoro-82M', got '${resolved.model}'`);
    if (resolved.source !== 'legacy-default') throw new Error(`expected source 'legacy-default', got '${resolved.source}'`);
  }

  testNarrationFilename() {
    const scene = { id: 'scene_abcdef123456', position: 7 };
    const filename = buildNarrationWavFilename(scene);
    if (filename !== '007_scene_ab.wav') throw new Error(`filename expected '007_scene_ab.wav', got '${filename}'`);
  }

  testManifestRead() {
    const tmpDir = path.join(__dirname, '../tmp');
    const manifestPath = path.join(tmpDir, 'test-manifest.json');
    const manifest = { provider: 'test-provider', evidence: 'test-evidence' };
    const fs = require('fs');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    try {
      const read = readNarrationManifest(manifestPath);
      if (read.error) throw new Error(`manifest read failed: ${read.error}`);
      if (!read.manifest) throw new Error('manifest missing');
      if (read.manifest.provider !== 'test-provider') throw new Error('manifest content mismatch');
    } finally {
      fs.unlinkSync(manifestPath);
      const remaining = fs.readdirSync(tmpDir);
      if (remaining.length === 0) fs.rmdirSync(tmpDir);
    }
  }
}

(async () => {
  const runner = new TestRunner();
  await runner.runAll();
})();
