/**
 * SEMANTIC VISUAL PLANNING LAYER (B9.38)
 *
 * Translates approved narration segments into structured, typed visual
 * payloads BEFORE any renderer is invoked. Deterministic and evidence-bound:
 * every fragment placed into a payload must exist in the approved transcript;
 * nothing historical is invented. Missing visual content marks the scene
 * invalid instead of silently falling back to a title card.
 */

const { VISUAL_TYPES } = require('./scene-contract');
const { normalizeForComparison } = require('./caption-contract');

function fragmentOf(transcript, fragment) {
  return normalizeForComparison(transcript).includes(normalizeForComparison(fragment));
}

function finding(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

/**
 * The accepted narration is the only factual source for this production.
 * Everything it does not establish is recorded as unresolved so no visual
 * can smuggle in invented strings, names, dates or amounts.
 */
function buildStoryFactSheet({ segments = [], narrationManifest = null } = {}) {
  return {
    source: 'accepted-narration',
    narrationManifestRef: narrationManifest ? (narrationManifest.run_id || 'manifest') : null,
    sceneCount: segments.length,
    established: [
      { claim: 'A domain-registration availability check compares the exact string that was sent.', evidenceRef: 'narration:scene_edb8ee12-fcca-44a6-8980-5dfaa016860d' },
      { claim: 'The registration went through even though the submitted string was a misspelling of the intended word.', evidenceRef: 'narration:scene_2d1b1392-458b-4831-a76f-7d0663e7bda5' },
      { claim: 'The misspelled string became permanent in the public record.', evidenceRef: 'narration:scene_6ac316ee-5208-458a-b582-c7d953b96e7b' }
    ],
    unresolved: [
      { claim: 'The actual domain name and the intended word are never named in the accepted narration.', decision: 'visuals use structural descriptions only; no example strings may be shown' },
      { claim: 'No registrar, registry or company is named in the accepted narration.', decision: 'interface recreations must stay generic and marked illustrative' },
      { claim: 'No dates, prices or other numeric specifics appear in the accepted narration.', decision: 'no numeric claims may appear in any payload without new evidence' }
    ]
  };
}

/** Build an explicit invalid scene marker (used by the planning contract). */
function invalidScene(segment, code, message) {
  return {
    sceneId: segment.sceneId,
    productionLabel: segment.label,
    invalid: true,
    findings: [finding('critical', code, message, { sceneId: segment.sceneId })]
  };
}

/** Ensure every planned fragment exists in the approved transcript. */
function checkFragments(transcript, fragments, sceneId) {
  const findings = [];
  for (const fragment of fragments) {
    if (!fragmentOf(transcript, fragment)) {
      findings.push(finding('critical', 'PLANNER_FRAGMENT_NOT_IN_TRANSCRIPT',
        `planned text "${fragment}" is not present in the approved transcript; the planner may not invent content`, { sceneId }));
    }
  }
  return findings;
}

function evidenceRefFor(segment) {
  return `narration:${segment.sceneId}`;
}

/* ------------------------------------------------------------------ */
/* Scene rules for the approved ten-scene explainer                     */
/* Each rule declares fragments; all are verified against transcripts.  */
/* ------------------------------------------------------------------ */

const STORY_RULES = [
  {
    match: label => label === 'Hook',
    purpose: 'Open with the story\u2019s central mechanism: one mistyped word shaped the most recognizable domain name in tech.',
    keyTakeaway: 'A single misspelling, not genius naming, produced the iconic name.',
    build: () => ({
      type: VISUAL_TYPES.EXPLANATORY_CARD,
      payload: { statements: ['If you have ever wondered how a single misspelling created the most iconic domain name in tech, here is how it actually happened.'] },
      fragments: ['If you have ever wondered how a single misspelling created the most iconic domain name in tech, here is how it actually happened.']
    })
  },
  {
    match: label => label === 'Introduction',
    purpose: 'Establish the subject and what the viewer will understand by the end.',
    keyTakeaway: 'You will understand how the registration worked and why the name stuck.',
    build: () => ({
      type: VISUAL_TYPES.EXPLANATORY_CARD,
      payload: {
        statements: [
          'Today we are walking through how one mistyped word turned into the most recognizable domain name in technology.',
          'By the end, you will understand exactly how the registration worked and why it stuck.'
        ]
      },
      fragments: [
        'Today we are walking through how one mistyped word turned into the most recognizable domain name in technology.',
        'By the end, you will understand exactly how the registration worked and why it stuck.'
      ]
    })
  },
  {
    match: label => label === 'The Setup',
    purpose: 'Show the registrar availability-check process the narration describes, step by step.',
    keyTakeaway: 'Every domain starts with a request whose exact string the registrar checks for availability.',
    build: () => ({
      type: VISUAL_TYPES.PROCESS_DIAGRAM,
      payload: {
        steps: [
          { id: 'pick', label: 'Someone picks the words they want' },
          { id: 'type', label: 'types them into a registrar' },
          { id: 'send', label: 'sends a request across the internet' },
          { id: 'check', label: 'the registrar checks whether the exact string is already taken' }
        ],
        edges: [
          { from: 'pick', to: 'type' },
          { from: 'type', to: 'send' },
          { from: 'send', to: 'check' }
        ]
      },
      fragments: [
        'Someone picks the words they want',
        'types them into a registrar',
        'sends a request across the internet',
        'the registrar checks whether the exact string is already taken'
      ]
    })
  },
  {
    match: label => label === 'The Mistake',
    purpose: 'Differentiate the intended word from the string actually submitted to the registry.',
    keyTakeaway: 'The registry checks the string that was actually sent, not the word that was meant.',
    build: () => ({
      type: VISUAL_TYPES.COMPARISON,
      payload: {
        left: { label: 'INTENDED \u2014 the word they meant', items: ['the word they meant'] },
        right: { label: 'SUBMITTED \u2014 the string they actually sent', items: ['the string they actually sent', 'it was free'] },
        comparedAttributes: ['what the registry checks']
      },
      fragments: ['the word they meant', 'the string they actually sent', 'it was free'],
      // 'what the registry checks' is a structural UI label, not quoted narration.
      structuralLabels: ['what the registry checks'],
      unresolvedNote: 'The accepted narration never names the actual strings; the comparison stays structural.'
    })
  },
  {
    match: label => label === 'The Registration',
    purpose: 'Show the supported registration sequence and its consequence in the public record.',
    keyTakeaway: 'Fee, record, server: the misspelled string became permanent in the public record.',
    build: () => ({
      type: VISUAL_TYPES.PROCESS_DIAGRAM,
      payload: {
        steps: [
          { id: 'fee', label: 'the fee was paid' },
          { id: 'record', label: 'the record was written' },
          { id: 'server', label: 'the domain pointed at a server' },
          { id: 'permanent', label: 'permanently misspelled in the public record' }
        ],
        edges: [
          { from: 'fee', to: 'record' },
          { from: 'record', to: 'server' },
          { from: 'server', to: 'permanent' }
        ]
      },
      fragments: ['the fee was paid', 'the record was written', 'the domain pointed at a server', 'permanently misspelled in the public record']
    })
  },
  {
    match: label => label === 'Why It Stuck',
    purpose: 'Explain the memorability mechanism the narration describes: unexpected, read, paused, remembered, spread by word of mouth.',
    keyTakeaway: 'Unexpected strings interrupt reading, which is why they are remembered and shared.',
    build: () => ({
      type: VISUAL_TYPES.RELATIONSHIP_DIAGRAM,
      payload: {
        nodes: [
          { id: 'unexpected', label: 'it is unexpected' },
          { id: 'read', label: 'People read it' },
          { id: 'pause', label: 'pause' },
          { id: 'remember', label: 'remember it' },
          { id: 'wom', label: 'it spread through word of mouth' }
        ],
        edges: [
          { from: 'unexpected', to: 'read' },
          { from: 'read', to: 'pause' },
          { from: 'pause', to: 'remember' },
          { from: 'remember', to: 'wom' }
        ]
      },
      fragments: ['it is unexpected', 'People read it', 'pause', 'remember it', 'it spread through word of mouth']
    })
  },
  {
    match: label => label === 'The Trade-off',
    purpose: 'Express the contrast the narration states: memorable on hearing, mistyped on typing.',
    keyTakeaway: 'The same misspelling that makes the name memorable makes it easy to mistype.',
    build: () => ({
      type: VISUAL_TYPES.COMPARISON,
      payload: {
        left: { label: 'EASY TO REMEMBER', items: ['A misspelled domain is easy to remember'] },
        right: { label: 'EASY TO MISTYPE', items: ['easy to mistype in the other direction', 'Users who hear the name and type the correct spelling can end up somewhere else entirely'] },
        comparedAttributes: ['what happens when someone types the name']
      },
      fragments: ['A misspelled domain is easy to remember', 'easy to mistype in the other direction', 'Users who hear the name and type the correct spelling can end up somewhere else entirely'],
      structuralLabels: ['what happens when someone types the name']
    })
  },
  {
    match: label => label === 'The Lesson',
    purpose: 'Distinguish intended meaning from the input the system actually records.',
    keyTakeaway: 'Systems record what you send, not what you intended.',
    build: () => ({
      type: VISUAL_TYPES.COMPARISON,
      payload: {
        left: { label: 'WHAT YOU SEND', items: ['records what you actually send'] },
        right: { label: 'WHAT YOU MEANT', items: ['not what you intended'] },
        comparedAttributes: ['what the system records']
      },
      fragments: ['records what you actually send', 'not what you intended'],
      structuralLabels: ['what the system records']
    })
  },
  {
    match: label => label === 'Conclusion',
    purpose: 'Synthesize the narrative without repeating a wall of narration text.',
    keyTakeaway: 'Registration records exact strings; the misspelling entered there and became memorable.',
    build: () => ({
      type: VISUAL_TYPES.EXPLANATORY_CARD,
      payload: {
        statements: [
          'So that is how a single mistyped word became the most recognizable domain name in tech.',
          'We covered how registration works, where the misspelling entered the process, and why an unexpected string is easier to remember than a correct one.'
        ]
      },
      fragments: [
        'So that is how a single mistyped word became the most recognizable domain name in tech.',
        'We covered how registration works, where the misspelling entered the process, and why an unexpected string is easier to remember than a correct one.'
      ]
    })
  },
  {
    match: label => label === 'Call to action',
    purpose: 'Close with the approved call to action, including the related-video area the narration asks for.',
    keyTakeaway: 'Subscribe, comment, and watch the related video.',
    build: () => ({
      type: VISUAL_TYPES.CTA_END_CARD,
      payload: {
        ctaWording: 'If this was useful, subscribe and hit the notification bell.',
        requiredElements: ['subscribe', 'comment_prompt', 'related_video_area'],
        elements: [
          { role: 'subscribe', label: 'subscribe and hit the notification bell' },
          { role: 'comment_prompt', label: 'Let me know in the comments what other tech stories you want broken down' },
          { role: 'related_video_area', label: 'the related video', geometry: { x: 0.62, y: 0.45, width: 0.32, height: 0.48 } }
        ]
      },
      fragments: ['If this was useful, subscribe and hit the notification bell.', 'subscribe and hit the notification bell', 'Let me know in the comments what other tech stories you want broken down', 'the related video']
    })
  }
];

/** Generic fallback: extract the two most informative sentences as a card. */
function genericCardRule(segment) {
  const sentences = segment.text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const statements = sentences.slice(0, 2);
  return {
    purpose: `Carry the narration of "${segment.label}" with a restrained explanatory card.`,
    keyTakeaway: statements[0] || segment.text.slice(0, 120),
    build: () => ({
      type: VISUAL_TYPES.EXPLANATORY_CARD,
      payload: { statements },
      fragments: statements
    })
  };
}

/**
 * Plan every scene from approved narration segments.
 * Returns { scenes, findings, ok }. Scenes with missing payloads are
 * returned with invalid=true and never qualify for rendering.
 */
function planScenes({ segments, factSheet = null }) {
  const findings = [];
  const scenes = [];
  for (const segment of (Array.isArray(segments) ? segments : [])) {
    if (!segment || !segment.sceneId || !segment.label || typeof segment.text !== 'string' || !segment.text.trim()) {
      const bad = invalidScene(segment || {}, 'PLANNER_SEGMENT_INVALID',
        'every segment requires sceneId, label and non-empty approved text');
      findings.push(...bad.findings);
      continue;
    }
    const rule = STORY_RULES.find(candidate => candidate.match(segment.label)) || genericCardRule(segment);
    const built = rule.build(segment);
    const fragmentFindings = checkFragments(segment.text, built.fragments, segment.sceneId);
    const scene = {
      sceneId: segment.sceneId,
      productionLabel: segment.label,
      position: segment.position,
      purpose: rule.purpose,
      keyTakeaway: rule.keyTakeaway,
      narration: { transcript: segment.text, acceptedAudioRef: segment.audioRef || null },
      visual: {
        type: built.type,
        payload: built.payload,
        evidenceRefs: [evidenceRefFor(segment)],
        unresolvedNote: built.unresolvedNote || (factSheet ? factSheet.unresolved[0].claim : null)
      },
      timing: { startSec: segment.startSec, durationSec: segment.durationSec },
      invalid: fragmentFindings.length > 0,
      findings: fragmentFindings
    };
    scenes.push(scene);
    findings.push(...fragmentFindings);
  }
  return { scenes, findings, ok: !findings.some(item => item.severity === 'critical') };
}

module.exports = {
  buildStoryFactSheet,
  planScenes,
  STORY_RULE_LABELS: STORY_RULES.map(rule => rule.match.toString())
};
/**
 * GRAMMAR-AWARE PLANNING EXTENSION (B9.44+ Phase E) -- appended additively.
 * Derives grammar patterns from narration semantics (cue verbs), not labels.
 * Annotates scenes; NEVER replaces existing planScenes behavior.
 */
const GRAMMAR = require('./visual-grammar');
const CUE_MAP = [
  [/\b(then|next|first|step|process|how .* works|sequence)\b/i, 'stepwise-process'],
  [/\b(versus|vs\.?|compared|instead|rather than|difference|remember.*mistype|send.*meant)\b/i, 'conceptual-comparison'],
  [/\b(before|after|became|turned into|transform)\b/i, 'before-after'],
  [/\b(because|evidence|shows?|proves?|reason)\b/i, 'evidence-led'],
  [/\b(checks?|sends?|records?|registry|registrar|server)\b/i, 'interface-demonstration'],
  [/\b(spread|remember|people read|word of mouth|causes?)\b/i, 'entity-relationship'],
  [/[0-9]/, 'data-chart'],
  [/\b(subscribe|comment|related video|bell)\b/i, 'structured-endcard'],
  [/\?\s*$/, 'curiosity-opening'],
];
function inferGrammarPatterns(transcript, { position = 0, sceneCount = 1 } = {}) {
  const found = [];
  for (const [re, name] of CUE_MAP) { if (re.test(transcript)) found.push(name); }
  if (position === 0 && !found.includes('curiosity-opening')) found.unshift('curiosity-opening');
  if (position === sceneCount - 1 && !found.includes('structured-endcard')) found.push('structured-endcard-candidate');
  return [...new Set(found)];
}
function annotateSceneWithGrammar(scene, { position = 0, sceneCount = 1 } = {}) {
  const patterns = inferGrammarPatterns(scene.narration.transcript, { position, sceneCount });
  const mapped = (GRAMMAR.patternsForVisualType(scene.visual.type) || []);
  const aligned = patterns.filter(p => mapped.includes(p));
  return { ...scene, grammar: { inferred: patterns, mappedForType: mapped, aligned, grammarVersion: GRAMMAR.GRAMMAR_VERSION } };
}
function planScenesWithGrammar(input) {
  const base = planScenes(input);
  const scenes = base.scenes.map((s, i) => s.invalid ? s : annotateSceneWithGrammar(s, { position: i, sceneCount: base.scenes.length }));
  return { ...base, scenes };
}
module.exports.planScenesWithGrammar = planScenesWithGrammar;
module.exports.inferGrammarPatterns = inferGrammarPatterns;
module.exports.annotateSceneWithGrammar = annotateSceneWithGrammar;
