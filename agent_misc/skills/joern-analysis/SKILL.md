---
name: joern-analysis
description: Static code analysis using Joern — generates Code Property Graphs (CPGs), runs CPGQL queries for vulnerability discovery, data-flow tracking, and code pattern search. Use when the user asks about code analysis, security audit, finding bugs, taint tracking, call graph exploration, or wants to understand code structure. Supports C/C++, Java, Python, JavaScript, Go, Rust, C#, PHP, Ruby, Swift, Kotlin, and binaries.
---

# Joern Code Analysis

## Overview

Joern is a static analysis platform that generates a Code Property Graph (CPG) from source code — a unified graph representation combining abstract syntax trees, control-flow graphs, program dependence graphs, and call graphs. Code is queried via CPGQL, a Scala-based DSL.

## Prerequisites

Joern must be installed at `~/bin/joern/joern-cli/`. If missing, install with:

```bash
curl -x http://127.0.0.1:11451 -L "https://github.com/joernio/joern/releases/latest/download/joern-install.sh" -o /tmp/joern-install.sh
chmod u+x /tmp/joern-install.sh
/tmp/joern-install.sh
```

## Workflow

### Step 1: Generate or Load the CPG

**If `cpg.bin` does not exist** in the project root, generate it:

```bash
~/bin/joern/joern-cli/joern-parse . -o cpg.bin
```

For large codebases, increase JVM heap:

```bash
~/bin/joern/joern-cli/joern-parse -J-Xmx8G . -o cpg.bin
```

For a specific language when auto-detection fails:

```bash
~/bin/joern/joern-cli/joern-parse --language python . -o cpg.bin
```

Use `--list-languages` to see supported languages.

**If `cpg.bin` already exists**, skip generation and load it directly for queries.

### Step 2: Run Queries

Write queries in `.sc` files under `.analysis/joern/` and execute them:

```bash
~/bin/joern/joern-cli/joern cpg.bin --script .analysis/joern/query.sc 2>&1
```

For interactive exploration:

```bash
~/bin/joern/joern-cli/joern --import cpg.bin
```

### Step 3: Store Results

All query scripts and their outputs MUST be placed in `.analysis/joern/`. Create this directory if it doesn't exist:

```
.analysis/joern/
├── query-01-find-sinks.sc
├── query-02-data-flow.sc
├── query-03-call-graph.sc
└── results/
    ├── query-01-output.txt
    ├── query-02-output.txt
    └── query-03-output.txt
```

Pipe output to results files:

```bash
~/bin/joern/joern-cli/joern cpg.bin --script .analysis/joern/query.sc > .analysis/joern/results/query-output.txt 2>&1
```

## Query Pattern

All CPGQL queries follow a three-phase structure:

1. **Select starting nodes** — `cpg.method`, `cpg.call`, `cpg.parameter`, `cpg.literal`, `cpg.file`, `cpg.all`
2. **Traverse the graph** — `.name("...")`, `.where(...)`, `.filter(...)`, `.argument(...)`, `.method`, `.definingTypeDecl`
3. **Output results** — `.l` (toList), `.size`, `.toJson`, `.toJsonPretty`, `.p` (pretty-print)

### Common Query Templates

**Find all calls to a function:**
```scala
cpg.call.name("gets").l.foreach { call =>
  println(s"${call.code} at ${call.location.filename}:${call.location.lineNumber.getOrElse("?")}")
}
```

**Trace data flow from source to sink:**
```scala
// Find sources (user input)
def source = cpg.call.name("gets").argument(1)
// Find sinks (dangerous functions) 
def sink = cpg.call.name("system").argument(1)
// Trace flow
sink.reachableByFlows(source).p
```

**List all methods with their parameters:**
```scala
cpg.method.l.foreach { m =>
  println(s"${m.fullName}(${m.parameter.l.map(_.code).mkString(", ")})")
}
```

**Find calls by regex pattern:**
```scala
cpg.call.name(".*exec.*").l.foreach { call =>
  println(s"CALL: ${call.code} [${call.location.filename}:${call.location.lineNumber.getOrElse("?")}]")
}
```

**Export results as JSON:**
```scala
println(cpg.call.name("strcpy").map(call => 
  s"""{"name": "${call.name}", "file": "${call.location.filename}", "line": ${call.location.lineNumber.getOrElse(-1)}}"""
).l.mkString("[\n  ", ",\n  ", "\n]"))
```

### Execution Directives

| Directive | Alias | Behavior |
|-----------|-------|----------|
| `.toList` | `.l` | Execute and return Scala List |
| `.head` | — | Return first result |
| `.size` | — | Return element count |
| `.toJson` | — | Return JSON string |
| `.toJsonPretty` | — | Pretty-printed JSON |
| `.p` | — | Pretty-print full node details |
| `.dedup` | — | Remove duplicates |
| `.take(n)` | — | Limit to n results |

## Reference

For the full CPGQL step reference and advanced traversal patterns, read [references/cpgql-cheatsheet.md](references/cpgql-cheatsheet.md).
