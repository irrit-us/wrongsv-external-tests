# Knowdit Auditing Framework — Domain Context

This is a shared system prompt appendix loaded by all Knowdit agents via
`--append-system-prompt-file`. It provides the domain scaffolding that every
component in the Section 3.3 audit loop needs.

## DeFi Business Categories

The target project falls into one or more of these DeFi business types:
Lending, Dexes, Yield, Derivatives, Staking, Cross-chain Bridge, Oracles,
NFT Lending, RWA, Stablecoins, Liquid Staking, Insurance, MEV, Payments.

## Knowledge Graph

The Knowdit KG is a bipartite graph:
- **DeFi Space**: projects → business types → DeFi semantics
- **Vulnerability Space**: audit findings → vulnerability patterns → attack types
- **Edges**: `may_introduce` causal links from semantics to patterns

Query via MCP server `knowdit-kg` or directly at `https://knowdit-kg.abort.rs/solidity/v1/query`.

## Three-State Auditing Specification

Every (semantic, pattern) pair must produce a 3-state specification:
1. **INITIAL STATE** — invariants after contract setup/deployment
2. **PRE-VULN STATE** — preconditions before the vulnerability triggers
3. **POST-VULN STATE** — the violated invariant encoding the bug

## Reflection Classification

Every execution result must be classified into exactly one of:
- **TrueFinding** — real bug matching the pattern
- **SpecIssue** — specification was wrong or incomplete
- **HarnessIssue** — harness failed to compile or misrepresented spec
- **ExpectedBehavior** — revert by design (e.g., access control)
- **OutOfScope** — excluded by project rules

## Working Memory

All agents share a Working Memory JSON file at `working_memory.json` in the
pipeline working directory. Read it before acting. Update it after acting.
Fields: pair_queue, current_pair_index, findings, spec_feedback,
harness_feedback, coverage, execution_history.
