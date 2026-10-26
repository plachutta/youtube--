# COMPREHENSIVE, EVIDENCE-FIRST ENGINEERING REPORTING STANDARD

**Status:** Canonical Standard  
**Version:** 1.0.0  
**Effective:** 2026-10-15  
**Scope:** All engineering execution in this repository

---

## 1. Purpose

This standard governs engineering reporting for all substantive work. Every substantive engineering task must produce a comprehensive, evidence-backed final report. A short status summary alone is insufficient.

---

## 2. Mandatory Report Structure

Substantive engineering work requires a final report containing:

1. **Report Identity** — Milestone, date, Git HEAD (initial/final), paths
2. **Executive Summary** — Objective, principal outcome, key results, blockers, completion status
3. **Scope and Acceptance Criteria** — Authorized scope, exclusions, deliverables, criteria and outcomes
4. **Initial State and Baseline** — Repository state, prior findings, artifacts preserved
5. **Work Performed** — Investigation, root cause, design, implementation, integration, deviations
6. **File and Contract Change Register** — Changed files, interfaces, behavior, governance/config changes, artifacts preserved
7. **Validation and Test Results** — Test name, exact command, exit status, counts, output, failures, scope of proof
8. **Evidence Register** — Claim, evidence source, path, hash if useful, observed result, limitations
9. **Failure and Negative-Path Analysis** — Failures, expected vs observed, diagnosis, mitigation, verification, remaining impact
10. **Quality, Security, and Operational Review** — Correctness, security, performance, provenance/rights, regression, release implications
11. **Unverified Items and Limitations** — Not implemented/tested/qualified, blocked, human review pending, not attempted
12. **Final Repository and Preservation Check** — Final HEAD, working tree, preservation verification
13. **Acceptance Matrix** — Evidence-supported status per criterion (PASS/PARTIAL/FAIL/BLOCKED/NOT TESTED/NOT APPLICABLE)
14. **Final Engineering Decision** — What proved/implemented, completeness, blockers/risks, next bounded action
15. **Reproduction and Review Guide** — Commands, paths, dependencies, caveats

---

## 3. Evidence Requirements

- All material claims must be supported by direct evidence (paths, functions, commands, exit codes, hashes, logs, manifests)
- Distinguish: proposed, implemented, executed, observed, tested, accepted
- Never fabricate commands, outputs, artifacts, or results
- Report negative results explicitly
- Record hashes for key artifacts
- If evidence unavailable, state it explicitly

---

## 4. Testing Requirements

- Report exact commands and actual exit statuses
- Distinguish execution states (Not implemented, Implemented but not tested, Tested, Integration-tested, Qualification executed, etc.)
- Failures must block gates when required
- Preview-only validation never substitutes complete validation

---

## 5. Integration

This standard is referenced by CONTEXT-GOVERNANCE.md. Future engineering work must follow this standard.

Engineering-agent work must also follow the provider-agnostic requirement in [Context Governance §20](CONTEXT-GOVERNANCE.md#20-provider-agnostic-engineering-orchestration) and the execution sequence in the [Engineering Agent Operating Model](ENGINEERING-AGENT-OPERATING-MODEL.md). Reports must identify the actual provider/adapter and separate agent-reported completion from independently derived verification.

For video-platform work, report the active gate against the single authoritative [video_platform_roadmap.md](../video_platform_roadmap.md); do not create or update a competing roadmap in a milestone report. The former [data/roadmap/ROADMAP.md](../data/roadmap/ROADMAP.md) is a compatibility pointer only.

## 6. Final Response Requirement

For every substantive task, the assistant must produce a comprehensive final report following this standard. The inline user-facing response must summarize the substantive findings, link to the persistent report and evidence package, list verification performed with actual results, and disclose limitations. A brief confirmation or short status summary alone is insufficient.
