# Engineering Agent Operating Model

**Status:** Operational reference; governed by [Context Governance §20](CONTEXT-GOVERNANCE.md#20-provider-agnostic-engineering-orchestration).

This document defines the minimal execution path for future engineering-agent work. It does not create a second roadmap, task database, approval policy, or verifier.

## Source of truth

- The repository-root [video_platform_roadmap.md](../video_platform_roadmap.md) is the project planning authority. [data/roadmap/ROADMAP.md](../data/roadmap/ROADMAP.md) is a compatibility pointer, not a second plan.
- A task's canonical scope, exclusions, dependencies, deliverables, acceptance criteria, permitted capabilities, prohibited actions, evidence requirements, and resource/time limits are represented by the versioned contract implemented in `utils/engineering-agent-runtime.js`.
- Provider selection is explicit per execution request. The optional example in [engineering-agents.example.json](../config/engineering-agents.example.json) is non-secret configuration guidance, not an enabled production provider configuration.
- Model selection and execution backend are separate task fields. Never infer one from another or silently substitute a provider, model, account, or backend.

## Execution sequence

1. Derive one bounded task from the approved roadmap and canonical requirements. Preserve the roadmap as the single planning hierarchy.
2. Validate the task contract and require a provider ID; reject missing, disabled, unknown, or unavailable providers without implicit fallback.
3. Resolve the provider adapter from the registry and compare task-required capabilities with the adapter manifest. Fail before dispatch if a mandatory capability is missing.
4. Dispatch only into an explicitly identified workspace/backend with a bounded timeout. Do not treat a provider's private session transcript as durable project state.
5. Record the normalized execution result, actual provider/adapter, logs and artifacts, changed-file references, failures, warnings, and unfinished steps.
6. Independently inspect changed files and execute authorized acceptance checks through `tools/claim-verifier/engineering-task-verifier.js`. Only verifier-produced observations may determine acceptance; an agent's completion message is not evidence of acceptance.
7. Write a provider-neutral checkpoint containing canonical task state, completed and remaining criteria, workspace and evidence references, failures, and the next authorized action. A provider switch receives this checkpoint and verified artifacts; it does not claim conversation transfer.
8. Produce the persistent report and evidence package required by the [Engineering Reporting Standard](ENGINEERING-REPORTING-STANDARD.md).

## Current provider boundary

[KiloCliAdapter](../utils/engineering-agent-providers/kilo-cli.js) is optional and uses the documented headless CLI behind one adapter. It does not use `--auto`; it does not provide workspace isolation and is disabled by default. It must not be used for production or broad filesystem access without an independently approved sandbox and required capability support. An installed VS Code extension is not itself an ACP server. Kilo ACP compatibility requires exact-version protocol execution evidence; documentation or extension presence alone is insufficient.

Deterministic fixture adapters in tests demonstrate registration, routing, removal, capability rejection, checkpoint portability, and independent verification. They do not qualify a live external provider.
