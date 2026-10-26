# B9.28 — Explainer readiness reconciliation, human decision packet, and import-path testability repair

**Repository:** `/home/gachiemeshackson/Videos/youtube`
**HEAD before and after:** `e26792a` — unchanged; nothing staged or committed.
**Remote compute:** none used this tranche; no session created. `colab
sessions` reports none active.
**No local model inference.** No `phase5-inject.js` execution, no production
import, no database mutation, no publishing.

---

## 1. Verified roadmap frontier

Authoritative sources inspected: `docs/AGENTTUBE-PHASE0-6-REPORT.md`
(§11 gates, §12 requirements, §13 defects), `docs/AGENTTUBE-TTS-TRANCHE-B6-IMPORT-READINESS-REPORT.md`,
`docs/AGENTTUBE-TTS-RECOVERY-FOLLOWUP.md` §6.1, `CHANGELOG.md`, the
B9.27 report, and the actual database read-only.

All B9.27 claims re-verified from the repository, not from the prior report:

| Claim | Re-verified | Evidence |
|---|---|---|
| Head `e26792a`, nothing staged | **YES** | `git rev-parse`, `git status` |
| Import contract tests 8/8 → now 10/10 | **YES** | `node tests/narration-import-contract.test.js` |
| Provider contract tests 34/34 | **YES** | `node tests/narration-provider-contract.test.js` |
| Qualification 5/5, `npm test` 47/47 | **YES** | both re-run, exit 0 |
| All 13 `tests/` files pass | **YES** | 14 files now, all pass |
| ESLint 0 errors | **YES** | `npx eslint .` |

**Verified frontier:** the four upstream gates in Phase0-6 §15 — TECHNICAL
is PASS; QUALITY, RIGHTS, ORIGINALITY and PRODUCTION FORMAT remain open, and
OAuth (§12 item 1) is unconfigured.

## 2. D2 disposition — with an honesty correction to B9.27

**D2 is now genuinely closed, but B9.27's closure was incomplete.**

B9.27's tests reproduced the preflight predicate inside the test file
("reproduced here so the test fails (or passes) on the real rule"). That is
*not* the real import automation, and Phase 1 of this mission explicitly asks
whether the tests exercise the actual automation.

**Root cause of why D2 stayed open for so long:** `phase5-inject.js` invoked
`main()` at module top level (`main().catch(...)` at line 194). Requiring the
module therefore initialised the Database and started the import immediately,
so no automated test could load the importer. The defect the B9.27 tests found
(the doubled `.wav`) was real, but the test could not be pointed at the real
code.

**Fix applied (3 changes to `phase5-inject.js`):**

1. Extracted the preflight into a named, exported `assertNarrationFilesPresent(wavDir, scenes)`
   that throws a structured error (`code: 'NARRATION_FILE_MISSING'`, plus the
   exact `missing[]` list with filename and position).
2. `main()` now calls that exported function instead of inlining the loop.
3. Guarded execution with `if (require.main === module)` and added
   `module.exports`, so requiring the module performs **no** database
   initialisation and no import.

The CLI behaviour is unchanged: `node phase5-inject.js` still runs exactly as
before (verified: usage error, then the real code path reaching
`Content not found`).

The test suite now imports and calls the **real production function**
(`require('../phase5-inject.js').assertNarrationFilesPresent`) rather than a
copy, and asserts importer testability directly.

## 3. Human decision packet

Technical facts are separated from decisions. Nothing below is inferred or
invented; each row cites repository evidence.

### A. RIGHTS

| Item | Evidence | Status | Human attestation required |
|---|---|---|---|
| All 10 scenes | `production_scenes`: `asset_origin = generated` ×10, `rights_confirmed = 1` ×10 | Gates satisfied in data | Confirm the *gradient fallback slides* are acceptable as "generated, no third-party rights" |
| Asset replacement path | `scene-repair-service.js:482` throws `RIGHTS_CONFIRMATION_REQUIRED` unless `rightsConfirmed === true` | Gate enforced by code, tested | None for the current asset set |
| Openverse / licensed media | Phase0-6 §5 adopted as media source; not exercised in the current pipeline | Not used | None unless licensed media is introduced |

**Decision:** confirm that generated-only visuals are acceptable, or supply a
licensed-asset plan. No third-party assets are currently in the production.

### B. ORIGINALITY

| Item | Evidence | Status | Decision required |
|---|---|---|---|
| `content_provenance` for `prod_1791…` | `status = not_required`, `sources = []`, `claims = []` | Template script declares no external claims | **YES** — either accept "no external claims, nothing to verify", or supply a research-backed script with claims and sources |
| Provenance publish gate | `PROVENANCE_BLOCKED` blocks publication on unresolved claims (verified in `npm test`) | Enforced | None (no claims to resolve) |
| `contains_synthetic_media` | `0` | Currently false | **YES** — the final video contains AI-generated narration and visuals; this must be set to true and disclosed on upload |

**Decision:** the second row is the substantive one — synthetic-media
disclosure is a real, required product decision, not a formality.

### C. EDITORIAL

| Item | Evidence | Status | Decision required |
|---|---|---|---|
| Script | `data/phase5/generation-result.json` — template mode, quality 82/100, `reviewStatus: needs_attention` | Written, not approved | **YES** — approve or revise the script |
| Scenes | 10 scenes, positions 0–9, all `status: ready`, revision 1 | Structurally complete | Approve scene ordering/labels |
| Narration voice | Kokoro `53e0ec4e…` and Qwen `e074073f…`/B9.26 trio — **all six human-accepted** | Accepted | **YES** — choose the production voice (both are accepted; the choice is still unmade) |
| Narration batch | 10-segment batch NOT generated | Not started | Requires the voice choice above, then hosted generation |

**Decision:** two genuine choices remain — the production voice, and script
approval. Neither can be safely inferred.

### D. YOUTUBE OAUTH

| Item | Evidence | Status |
|---|---|---|
| `config/credentials.json` | **ABSENT** | Not configured |
| Client ID/secret | placeholders only in `credentials.example.json` | Not configured |
| Implementation | `oauth-server.js`, `modern-auth.js`, `utils/credential-manager.js` | Implemented and tested by `npm test` |
| Redirect URI | `http://127.0.0.1` (loopback), configured in code | Ready |
| Scopes | `youtube.upload`, `youtube`, `youtube.readonly`, `yt-analytics.readonly`, `youtube.force-ssl` | Defined |
| Setup entry point | `npm run credentials:setup` | Available |

**Remaining setup (user-side, cannot be automated):**
1. Create a Google Cloud OAuth 2.0 Client ID (type: TV/limited-input or Web,
   redirect `http://127.0.0.1`).
2. Enable YouTube Data API v3 and YouTube Analytics API.
3. Put client ID/secret into `config/credentials.json`.
4. Run `npm run credentials:setup` and complete the browser consent.

**Safe validation without publishing:** the Production Readiness Gate
(`npm test` covers it) already probes YouTube access and reports it as an
explicit, non-publishing check. OAuth is **not** required for the explainer
*production* itself — only for publication. It can be deferred.

## 4. Engineering changes actually made

| File | Change | Why |
|---|---|---|
| `phase5-inject.js` | Extracted `assertNarrationFilesPresent()`; exported it; guarded `main()` with `require.main === module` | D2: make the real import preflight automatable without running an import or touching the DB |
| `tests/narration-import-contract.test.js` | Now calls the real production function (was a local copy); 2 new tests (structured failure contract; require-does-not-import) | Close D2 honestly; Phase 1 explicitly asked whether the tests exercised the real automation |

No other subsystem was modified. No abstraction was introduced beyond the
single guard function, and no existing behaviour changed.

## 5. Tests executed — real results, exit codes

| Command | Result | Exit |
|---|---|---|
| `node tests/narration-import-contract.test.js` | 10/10 passed | 0 |
| `node tests/narration-provider-contract.test.js` | 34/34 passed | 0 |
| `node qualification-tests.js` | 5 passed, 0 failed | 0 |
| `npm test` | 47 passed, 0 failed | 0 |
| all files in `tests/` | 14 passing, 0 failing | — |
| `npx eslint .` | 0 errors | 0 |
| `node phase5-inject.js` (no args) | usage error, no DB write | 0 |
| `node phase5-inject.js prod_x /tmp/narr job1` | reaches real code path, fails `Content not found`, no mutation | 0 |

## 6. End-to-end stages: genuinely executed vs pending

**Genuinely executed and evidenced:**
1. Narration generation (Kokoro + Qwen, hosted) — 6 accepted WAVs
2. Technical validation of every produced WAV
3. Human editorial acceptance of all 6
4. Import filename preflight against the **real** production function
5. Fail-closed rejection of the Kitten batch
6. Component suites: provider contract, import contract, qualification, 47-test app suite

**Still pending (each blocked on a specific, named cause):**
1. **Ten-segment narration batch** — blocked on the production-voice decision
2. **Script approval** — human editorial decision
3. **Synthetic-media disclosure decision** — required for publication
4. **Real `phase5-inject.js` execution against the DB** — requires explicit
   import authorization; the path is now contract-tested but has never been
   run end-to-end
5. **Video assembly + SRT/caption timing QA (D4)** — needs the imported narration
6. **YouTube OAuth** — user setup; not required for production, only publication

## 7. Git and remote state

* HEAD `e26792a` before and after; `git status` shows the same pre-existing
  `M package-lock.json` plus untracked B9.x artefacts; nothing staged.
* No Colab or Kaggle session created this tranche; none active.

## 8. Exact next action needed from the user

1. **Choose the production narration voice** — Kokoro-82M or Qwen3-TTS
   CustomVoice (both fully accepted). This unblocks the ten-segment batch.
2. **Approve the script** (`How a single misspelling created the most iconic
   domain name in tech…`, template mode, quality 82/100) or supply revisions.
3. **Confirm synthetic-media disclosure** and that generated-only visuals are
   acceptable for rights purposes.
4. **Authorize the production narration import** so the batch can be staged
   under the verified `${position3}_${sceneId8}.wav` contract and imported.

Once (1) and (2) are answered, the batch can be generated on hosted compute
through the integrated provider contract, contract-tested at import, and the
explainer assembled. YouTube OAuth can be deferred until publication.
