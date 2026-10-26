/**
 * REUSABLE VISUAL COMPONENTS (B9.44+ Phase F)
 * Inventory + structured builders for the 9 priority component families.
 * Every builder: accepts structured input, validates required fields,
 * returns a typed scene-contract visual payload, fails clearly on missing
 * inputs. Geometry stays with layout-engine; facts stay transcript-exact.
 */
const { VISUAL_TYPES } = require('./scene-contract');
const COMPONENT_VERSION = 1;
function fail(code, message, extra) { const e = new Error(message); e.code = code; Object.assign(e, extra || {}); return e; }
function needStr(v, name, code) { if (typeof v !== 'string' || !v.trim()) throw fail(code, `${name} is required (non-empty string)`); return v.trim(); }
function needArr(v, name, code, min) { if (!Array.isArray(v) || v.length < (min || 1)) throw fail(code, `${name} requires at least ${min || 1} entries`); return v; }
const INVENTORY = Object.freeze([
  { component: 'process-diagram', visualType: VISUAL_TYPES.PROCESS_DIAGRAM, grammar: ['stepwise-process', 'escalating-sequence'], status: 'implemented', layoutsIn: 'layout-engine.layoutPayload/process_diagram', rendersVia: 'motion-canvas-adapter/nodes' },
  { component: 'timeline', visualType: VISUAL_TYPES.TIMELINE, grammar: ['chronological-timeline'], status: 'implemented', layoutsIn: 'layout-engine.layoutPayload/timeline', rendersVia: 'motion-canvas-adapter/nodes' },
  { component: 'comparison', visualType: VISUAL_TYPES.COMPARISON, grammar: ['conceptual-comparison', 'before-after'], status: 'implemented', layoutsIn: 'layout-engine.layoutPayload/comparison', rendersVia: 'motion-canvas-adapter/nodes' },
  { component: 'relationship-diagram', visualType: VISUAL_TYPES.RELATIONSHIP_DIAGRAM, grammar: ['entity-relationship'], status: 'implemented', layoutsIn: 'layout-engine.layoutPayload/relationship_diagram', rendersVia: 'motion-canvas-adapter/nodes' },
  { component: 'data-visualization', visualType: VISUAL_TYPES.DATA_VISUALIZATION, grammar: ['data-chart', 'map-based'], status: 'implemented', layoutsIn: 'layout-engine.layoutPayload/data_visualization', rendersVia: 'motion-canvas-adapter/nodes' },
  { component: 'interface-recreation', visualType: VISUAL_TYPES.INTERFACE_RECREATION, grammar: ['interface-demonstration'], status: 'implemented', layoutsIn: 'layout-engine.layoutPayload/interface_recreation', rendersVia: 'motion-canvas-adapter/nodes' },
  { component: 'text-plus-illustration', visualType: VISUAL_TYPES.EXPLANATORY_CARD, grammar: ['curiosity-opening', 'evidence-led', 'synthesis-summary'], status: 'implemented', layoutsIn: 'layout-engine.layoutPayload/explanatory_card', rendersVia: 'motion-canvas-adapter/nodes' },
  { component: 'evidence-display', visualType: VISUAL_TYPES.EXPLANATORY_CARD, grammar: ['evidence-led'], status: 'implemented', layoutsIn: 'layout-engine.layoutPayload/explanatory_card', rendersVia: 'motion-canvas-adapter/nodes' },
  { component: 'end-card', visualType: VISUAL_TYPES.CTA_END_CARD, grammar: ['structured-endcard'], status: 'implemented', layoutsIn: 'layout-engine/cta branch', rendersVia: 'motion-canvas-adapter/cta-check' },
]);
function buildProcessDiagram({ steps, edges, note }) {
  needArr(steps, 'steps', 'COMP_STEPS_MISSING', 2);
  const ids = new Set();
  for (const s of steps) { needStr(s.id, 'step.id', 'COMP_STEP_INVALID'); needStr(s.label, 'step.label', 'COMP_STEP_INVALID'); if (ids.has(s.id)) throw fail('COMP_STEP_DUP', `duplicate step id ${s.id}`); ids.add(s.id); }
  needArr(edges, 'edges', 'COMP_EDGES_MISSING', 1);
  for (const e of edges) { if (!ids.has(e.from) || !ids.has(e.to)) throw fail('COMP_EDGE_INVALID', `edge ${e.from}->${e.to} must reference declared steps`); }
  return { type: VISUAL_TYPES.PROCESS_DIAGRAM, payload: { steps: steps.map(s => ({ id: s.id, label: s.label })), edges: edges.map(e => ({ from: e.from, to: e.to })) }, note: note || null };
}
function buildTimeline({ events }) {
  needArr(events, 'events', 'COMP_EVENTS_MISSING', 2);
  events.forEach((ev, i) => { needStr(ev.label, `event[${i}].label`, 'COMP_EVENT_INVALID'); if (ev.order !== undefined && (!Number.isInteger(ev.order) || ev.order < 0)) throw fail('COMP_EVENT_ORDER', `event[${i}].order must be non-negative int`); });
  return { type: VISUAL_TYPES.TIMELINE, payload: { events: events.map((ev, i) => ({ label: ev.label, order: ev.order !== undefined ? ev.order : i, whenLabel: ev.whenLabel || null })) } };
}
function buildComparison({ left, right, comparedAttributes }) {
  for (const side of [left, right]) { if (!side || typeof side.label !== 'string' || !side.label.trim()) throw fail('COMP_OPERAND_INVALID', 'comparison needs left+right labels'); needArr(side.items, 'items', 'COMP_ITEMS_MISSING', 1); }
  if (left.label.trim() === right.label.trim()) throw fail('COMP_LABELS_IDENTICAL', 'comparison labels must differ');
  needArr(comparedAttributes, 'comparedAttributes', 'COMP_ATTRS_MISSING', 1);
  return { type: VISUAL_TYPES.COMPARISON, payload: { left, right, comparedAttributes } };
}
function buildRelationship({ nodes, edges }) {
  needArr(nodes, 'nodes', 'COMP_NODES_MISSING', 2);
  const ids = new Set();
  for (const n of nodes) { needStr(n.id, 'node.id', 'COMP_NODE_INVALID'); needStr(n.label, 'node.label', 'COMP_NODE_INVALID'); ids.add(n.id); }
  needArr(edges, 'edges', 'COMP_REL_EDGES_MISSING', 1);
  for (const e of edges) { if (!ids.has(e.from) || !ids.has(e.to)) throw fail('COMP_REL_EDGE_INVALID', 'edge must reference declared nodes'); }
  return { type: VISUAL_TYPES.RELATIONSHIP_DIAGRAM, payload: { nodes: nodes.map(n => ({ id: n.id, label: n.label })), edges: edges.map(e => ({ from: e.from, to: e.to })) } };
}
function buildDataViz({ statLabel, value, source }) {
  needStr(statLabel, 'statLabel', 'COMP_STAT_INVALID');
  if (value === undefined || String(value).trim() === '') throw fail('COMP_STAT_INVALID', 'data_visualization requires a value');
  if (!source || typeof source.ref !== 'string' || !source.ref.trim()) throw fail('COMP_SOURCE_MISSING', 'data_visualization requires source.ref');
  return { type: VISUAL_TYPES.DATA_VISUALIZATION, payload: { statLabel, value: String(value), source } };
}
function buildInterface({ action, elements, illustrative }) {
  needStr(action, 'action', 'COMP_ACTION_MISSING');
  needArr(elements, 'elements', 'COMP_IF_EL_MISSING', 1);
  elements.forEach((el, i) => { needStr(el.role, `elements[${i}].role`, 'COMP_IF_EL_INVALID'); needStr(el.label, `elements[${i}].label`, 'COMP_IF_EL_INVALID'); });
  if (illustrative !== true) throw fail('COMP_NOT_ILLUSTRATIVE', 'interface_recreation must set illustrative=true');
  return { type: VISUAL_TYPES.INTERFACE_RECREATION, payload: { action, elements, illustrative: true } };
}
function buildCard({ statements }) {
  needArr(statements, 'statements', 'COMP_STATEMENTS_MISSING', 1);
  if (statements.length > 3) throw fail('COMP_TOO_MANY_STATEMENTS', 'explanatory_card allows max 3 statements');
  statements.forEach(s => needStr(s, 'statement', 'COMP_STATEMENT_INVALID'));
  return { type: VISUAL_TYPES.EXPLANATORY_CARD, payload: { statements } };
}
function buildEndCard({ ctaWording, requiredElements, elements }) {
  needStr(ctaWording, 'ctaWording', 'COMP_CTA_MISSING');
  needArr(requiredElements, 'requiredElements', 'COMP_CTA_REQ_MISSING', 1);
  const present = new Set((elements || []).map(e => e.role || e));
  for (const r of requiredElements) if (!present.has(r)) throw fail('COMP_CTA_ABSENT', `missing required element ${r}`);
  const slot = (elements || []).find(e => e && e.role === 'related_video_area');
  if (requiredElements.includes('related_video_area') && (!slot || !slot.geometry)) throw fail('COMP_CTA_GEOM', 'related_video_area needs geometry');
  return { type: VISUAL_TYPES.CTA_END_CARD, payload: { ctaWording, requiredElements, elements: elements || [] } };
}
module.exports = { COMPONENT_VERSION, INVENTORY, buildProcessDiagram, buildTimeline, buildComparison, buildRelationship, buildDataViz, buildInterface, buildCard, buildEndCard };
