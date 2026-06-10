"""
Knowdit — AgentFlow graph implementing the paper's Section 3.3 audit loop
with structured Working Memory (3.3.1), MCP, skills, and multi-way
feedback routing.

Paper: Knowdit: Agentic Smart Contract Vulnerability Detection with
       Auditing Knowledge Summarization (arXiv:2603.26270)

Nodes:
  wm_init         — initialize structured Working Memory (JSON)
  mapper          — KnowledgeMapper (3.3.2): classify target, query KG
  spec_gen        — SpecificationGenerator (3.3.3): 3-state auditing spec
  harness_synth   — HarnessSynthesizer (3.3.4): executable Foundry harness
  executor        — TestExecutor (3.3.5): run harness, collect coverage
  reflector       — FindingReflector (3.3.6): classify violation
  wm_update       — parse classification, update WM, route feedback

Loop back-edge: wm_update.on_failure >> spec_gen
  SpecIssue  → restart from spec_gen (WM carries spec_feedback)
  HarnessIssue → restart from spec_gen (WM carries harness_feedback)
  TrueFinding / ExpectedBehavior / OutOfScope → advance pair, continue
"""

import os
from agentflow import Graph, claude, python_node

WM_REL = "working_memory.json"

with Graph(
    "knowdit",
    max_iterations=5,
    scratchboard=True,
    concurrency=1,
    description="Knowdit agentic audit loop (Section 3.3) with structured Working Memory",
    agent_defaults={
        "claude": {
            "extra_args": [
                "--bare",
                "--settings", "knowdit_settings.json",
                "--append-system-prompt-file", "knowdit_system_prompt.md",
            ],
        },
    },
) as g:

    # =========================================================================
    # Working Memory initializer (Section 3.3.1)
    # =========================================================================
    wm_init = python_node(
        task_id="wm_init",
        code=(
            'import json, os\n'
            'wm_path = os.path.join("{{ pipeline.working_dir }}", "' + WM_REL + '")\n'
            'wm = {\n'
            '    "pair_queue": [],\n'
            '    "current_pair_index": 0,\n'
            '    "findings": [],\n'
            '    "spec_feedback": None,\n'
            '    "harness_feedback": None,\n'
            '    "coverage": {},\n'
            '    "execution_history": [],\n'
            '    "iteration": 0,\n'
            '    "target": "{{ target }}"\n'
            '}\n'
            'with open(wm_path, "w") as f:\n'
            '    json.dump(wm, f, indent=2)\n'
            'print("WM_INIT_OK")\n'
            'print(json.dumps(wm, indent=2))\n'
        ),
    )

    # =========================================================================
    # 3.3.2 KnowledgeMapper
    # =========================================================================
    mapper = claude(
        task_id="mapper",
        prompt=(
            "You are the Knowledge Mapper (Section 3.3.2).\n\n"
            "Given the target project below, perform two tasks:\n"
            "1. Classify it into DeFi business types (Lending, Dexes, Yield,\n"
            "   Derivatives, Staking, etc.)\n"
            "2. For each identified business type, query the Knowdit KG to\n"
            "   retrieve relevant (DeFi semantic, vulnerability pattern) pairs.\n\n"
            "Output a JSON array of pairs. Each pair must include:\n"
            "- semantic: the DeFi semantic name and definition\n"
            "- pattern: the vulnerability pattern name and root cause\n"
            "- reasoning: why this pair is relevant to the target\n\n"
            "After producing pairs, update the Working Memory file at\n"
            '"{{ pipeline.working_dir }}/' + WM_REL + '" — write your pairs into\n'
            'the "pair_queue" field and reset "current_pair_index" to 0.\n\n'
            "Target project:\n{{ target }}"
        ),
        tools="read_only",
        skills=["defi-analysis"],
        mcps=[
            {
                "name": "knowdit-kg",
                "transport": "streamable_http",
                "url": "https://knowdit-kg.abort.rs/solidity",
                "headers": {"Accept": "application/json"},
            },
        ],
        success_criteria=[
            {"kind": "output_contains", "value": '"semantic"'},
        ],
    )

    # =========================================================================
    # 3.3.3 SpecificationGenerator
    # =========================================================================
    spec_gen = claude(
        task_id="spec_gen",
        prompt=(
            "You are the Specification Generator (Section 3.3.3).\n\n"
            "Given a (semantic, pattern) pair, produce a 3-state auditing\n"
            "specification for the target project:\n\n"
            "1. INITIAL STATE  — invariants after contract setup/deployment\n"
            "2. PRE-VULN STATE  — preconditions before the vulnerability triggers\n"
            "3. POST-VULN STATE — the violated invariant that encodes the bug\n\n"
            "Each state must include concrete variable names and conditions from\n"
            "the actual Solidity source code.\n\n"
            "BEFORE generating: read the Working Memory file at\n"
            '"{{ pipeline.working_dir }}/' + WM_REL + '".\n'
            "- Read the current pair from pair_queue[current_pair_index].\n"
            '- If "spec_feedback" is not null, use it to regenerate the\n'
            "  specification addressing the issues described.\n"
            '- If "harness_feedback" is not null but "spec_feedback" is null,\n'
            "  the specification was valid — reproduce an equivalent spec.\n\n"
            "Working Memory path: "
            '"{{ pipeline.working_dir }}/' + WM_REL + '"\n\n'
            "Semantic-pattern pair (current iteration):\n"
            "Read from pair_queue[current_pair_index] in the WM file above.\n\n"
            "{% if nodes.reflector.output %}\n"
            "Prior reflector feedback (address these issues if present):\n"
            "{{ nodes.reflector.output }}\n"
            "{% endif %}"
        ),
        tools="read_only",
        skills=["solidity-auditing", "invariant-specification"],
    )

    # =========================================================================
    # 3.3.4 HarnessSynthesizer
    # =========================================================================
    harness_synth = claude(
        task_id="harness_synth",
        prompt=(
            "You are the Harness Synthesizer (Section 3.3.4).\n\n"
            "Translate the auditing specification into an executable Foundry\n"
            "fuzz harness:\n\n"
            "- Encode INITIAL STATE as a setUp() function\n"
            "- Translate PRE-VULN and POST-VULN invariants into require() oracles\n"
            "- Wrap target contract interfaces as Foundry handler functions\n\n"
            "The harness must compile and run with `forge test`.\n\n"
            "BEFORE synthesizing: read the Working Memory file at\n"
            '"{{ pipeline.working_dir }}/' + WM_REL + '".\n'
            '- If "harness_feedback" is not null, repair the harness addressing\n'
            "  the specific issues described in the feedback. The specification\n"
            "  itself is correct — only the harness code needs fixing.\n\n"
            "Specification:\n{{ nodes.spec_gen.output }}"
        ),
        tools="read_write",
        skills=["foundry", "fuzz-harness"],
        retries=3,
        retry_backoff_seconds=2.0,
        retry_backoff_strategy="exponential",
    )

    # =========================================================================
    # 3.3.5 TestExecutor
    # =========================================================================
    executor = claude(
        task_id="executor",
        prompt=(
            "You are the Test Executor (Section 3.3.5).\n\n"
            "Run the fuzzing harness and report:\n\n"
            "1. Whether a violation was triggered (assertion/oracle failure)\n"
            "2. The full execution trace and state changes if violated\n"
            "3. Line coverage achieved\n\n"
            "Harness to execute:\n{{ nodes.harness_synth.output }}\n\n"
            "Run: forge test -vvv and report all results.\n\n"
            "After execution, update the Working Memory file at\n"
            '"{{ pipeline.working_dir }}/' + WM_REL + '" — add coverage data\n'
            'to the "coverage" field and append this run to "execution_history".'
        ),
        tools="read_write",
        skills=["foundry"],
        retries=2,
        retry_backoff_seconds=5.0,
        retry_backoff_strategy="exponential",
    )

    # =========================================================================
    # 3.3.6 FindingReflector
    # =========================================================================
    reflector = claude(
        task_id="reflector",
        prompt=(
            "You are the Finding Reflector (Section 3.3.6).\n\n"
            "Classify the execution result into exactly one of:\n\n"
            "- TrueFinding — violation matches the vulnerability pattern; a real bug\n"
            "- SpecIssue — specification was incomplete or inaccurate; needs regeneration\n"
            "- HarnessIssue — harness failed to compile or misrepresented the spec\n"
            "- ExpectedBehavior — contract reverted by design (e.g., onlyOwner check)\n"
            "- OutOfScope — finding is explicitly excluded by project README/rules\n\n"
            "Output a single JSON object with exactly these keys:\n"
            '  {"classification": "<one of the five labels>",\n'
            '   "reasoning": "<brief explanation>",\n'
            '   "severity": "high"|"medium"|"low"|null}\n\n'
            "Execution result:\n{{ nodes.executor.output }}\n\n"
            "Specification:\n{{ nodes.spec_gen.output }}"
        ),
        tools="read_only",
        skills=["vulnerability-classification"],
        success_criteria=[
            {"kind": "output_regex", "value": "classification"},
        ],
    )

    # =========================================================================
    # Working Memory update + feedback router (Section 3.3.1 loop)
    #
    # Reads reflector output, parses the 5-way classification, updates WM,
    # and signals the orchestrator whether to restart the loop.
    #
    # Exit code 0 → terminal classification (advance pair, continue)
    # Exit code 1 → retry classification (restart from spec_gen via on_failure)
    # =========================================================================
    wm_update = python_node(
        task_id="wm_update",
        code=(
            'import json, os, re, sys\n'
            '\n'
            'wm_path = os.path.join("{{ pipeline.working_dir }}", "' + WM_REL + '")\n'
            'output_path = "{{ nodes.reflector.artifacts.output_txt }}"\n'
            '\n'
            '# --- read current WM ------------------------------------------------\n'
            'with open(wm_path) as f:\n'
            '    wm = json.load(f)\n'
            '\n'
            '# --- read reflector output from artifact file -----------------------\n'
            'with open(output_path) as f:\n'
            '    raw = f.read()\n'
            '\n'
            '# --- parse classification JSON from reflector output ----------------\n'
            'classification = None\n'
            'reasoning = ""\n'
            'severity = None\n'
            '\n'
            '# Try direct JSON parse first\n'
            'try:\n'
            '    result = json.loads(raw.strip())\n'
            '    classification = (result.get("classification") or "").strip()\n'
            '    reasoning = result.get("reasoning", "")\n'
            '    severity = result.get("severity")\n'
            'except (json.JSONDecodeError, AttributeError):\n'
            '    # Try to extract JSON from markdown code blocks\n'
            '    m = re.search(r"```(?:json)?\\s*(\\{.*?\\})\\s*```", raw, re.DOTALL)\n'
            '    if m:\n'
            '        try:\n'
            '            result = json.loads(m.group(1))\n'
            '            classification = (result.get("classification") or "").strip()\n'
            '            reasoning = result.get("reasoning", "")\n'
            '            severity = result.get("severity")\n'
            '        except (json.JSONDecodeError, AttributeError):\n'
            '            pass\n'
            '\n'
            '# Fallback: scan for known labels in raw text\n'
            'if classification is None:\n'
            '    for label in ["TrueFinding", "SpecIssue", "HarnessIssue",\n'
            '                  "ExpectedBehavior", "OutOfScope"]:\n'
            '        if label in raw:\n'
            '            classification = label\n'
            '            break\n'
            '\n'
            'if classification is None:\n'
            '    print("ERROR: could not parse classification from reflector")\n'
            '    print(raw[:800])\n'
            '    sys.exit(1)\n'
            '\n'
            '# --- update WM based on classification ------------------------------\n'
            'wm["iteration"] = wm.get("iteration", 0) + 1\n'
            'entry = {\n'
            '    "iteration": wm["iteration"],\n'
            '    "classification": classification,\n'
            '    "reasoning": reasoning,\n'
            '    "severity": severity,\n'
            '}\n'
            'wm["execution_history"].append(entry)\n'
            '\n'
            'VALID = {"TrueFinding", "SpecIssue", "HarnessIssue",\n'
            '         "ExpectedBehavior", "OutOfScope"}\n'
            'if classification not in VALID:\n'
            '    print(f"Unknown classification: {classification}")\n'
            '    sys.exit(1)\n'
            '\n'
            'if classification == "TrueFinding":\n'
            '    wm["findings"].append({\n'
            '        "iteration": wm["iteration"],\n'
            '        "severity": severity,\n'
            '        "reasoning": reasoning,\n'
            '    })\n'
            '    wm["spec_feedback"] = None\n'
            '    wm["harness_feedback"] = None\n'
            '    wm["current_pair_index"] += 1\n'
            '    print(f"TrueFinding recorded (total: {len(wm[\'findings\'])})")\n'
            '    exit_code = 0\n'
            '\n'
            'elif classification == "SpecIssue":\n'
            '    wm["spec_feedback"] = {\n'
            '        "iteration": wm["iteration"],\n'
            '        "issue": reasoning,\n'
            '    }\n'
            '    wm["harness_feedback"] = None\n'
            '    print("SpecIssue: restarting from spec_gen with feedback")\n'
            '    exit_code = 1\n'
            '\n'
            'elif classification == "HarnessIssue":\n'
            '    wm["harness_feedback"] = {\n'
            '        "iteration": wm["iteration"],\n'
            '        "issue": reasoning,\n'
            '    }\n'
            '    wm["spec_feedback"] = None\n'
            '    print("HarnessIssue: restarting from spec_gen (WM has harness_feedback)")\n'
            '    exit_code = 1\n'
            '\n'
            'elif classification == "ExpectedBehavior":\n'
            '    wm["spec_feedback"] = None\n'
            '    wm["harness_feedback"] = None\n'
            '    wm["current_pair_index"] += 1\n'
            '    print("ExpectedBehavior: continuing to next pair")\n'
            '    exit_code = 0\n'
            '\n'
            'elif classification == "OutOfScope":\n'
            '    wm["spec_feedback"] = None\n'
            '    wm["harness_feedback"] = None\n'
            '    wm["current_pair_index"] += 1\n'
            '    print("OutOfScope: skipping, next pair")\n'
            '    exit_code = 0\n'
            '\n'
            '# --- persist WM ------------------------------------------------------\n'
            'with open(wm_path, "w") as f:\n'
            '    json.dump(wm, f, indent=2)\n'
            '\n'
            'print(json.dumps(entry, indent=2))\n'
            'print(f"WM: iter={wm[\'iteration\']} cls={classification} "\n'
            '      f"pair={wm[\'current_pair_index\']}/{len(wm.get(\'pair_queue\',[]))} "\n'
            '      f"exit={exit_code}")\n'
            'sys.exit(exit_code)\n'
        ),
    )

    # =========================================================================
    # Edges: linear pipeline + loop back-edges (Section 3.3.1)
    # =========================================================================
    wm_init >> mapper >> spec_gen >> harness_synth >> executor >> reflector >> wm_update

    # SpecIssue or HarnessIssue → restart loop from spec_gen.
    # Working Memory carries spec_feedback / harness_feedback so spec_gen
    # and harness_synth know whether to regenerate or repair.
    # TrueFinding / ExpectedBehavior / OutOfScope → exit 0, graph advances
    # to next iteration (picks next pair from WM).
    wm_update.on_failure >> spec_gen

print(g.to_json())
