# CPGQL Query Cheatsheet

## Node-Type Starters

| Starter | Nodes Selected |
|---------|---------------|
| `cpg.all` | Every node in the graph |
| `cpg.method` | All METHOD nodes |
| `cpg.methodReturn` | All METHOD_RETURN nodes |
| `cpg.call` | All CALL nodes |
| `cpg.parameter` | All PARAMETER nodes |
| `cpg.local` | All LOCAL variable nodes |
| `cpg.literal` | All LITERAL nodes |
| `cpg.identifier` | All IDENTIFIER nodes |
| `cpg.types` | All TYPE nodes |
| `cpg.typeDecl` | All TYPE_DECL nodes |
| `cpg.file` | All FILE nodes |
| `cpg.namespace` | All NAMESPACE nodes |
| `cpg.namespaceBlock` | All NAMESPACE_BLOCK nodes |
| `cpg.member` | All MEMBER nodes |
| `cpg.controlStructure` | All CONTROL_STRUCTURE nodes (if/for/while/switch) |
| `cpg.return` | All RETURN nodes |
| `cpg.jumpTarget` | All JUMP_TARGET nodes |
| `cpg.tag` | All TAG nodes |
| `cpg.annotation` | All ANNOTATION nodes |
| `cpg.comment` | All COMMENT nodes |

## Property Filters

Every node type has specific property filters. Common ones:

| Filter | Example |
|--------|---------|
| `.name("regex")` | `cpg.method.name("main")` |
| `.fullName("regex")` | `cpg.method.fullName(".*Foo.*")` |
| `.code("regex")` | `cpg.call.code("exit.*")` |
| `.lineNumber(n)` | `cpg.call.lineNumber(42)` |
| `.lineNumber(Some(n))` | Optional line number variant |
| `.columnNumber(n)` | `cpg.call.columnNumber(10)` |
| `.filename("regex")` | `cpg.file.name(".*main.c")` |
| `.isPublic` | `cpg.method.isPublic` |
| `.isPrivate` | `cpg.method.isPrivate` |
| `.signature("regex")` | `cpg.method.signature(".*int.*")` |
| `.evalType("regex")` | `cpg.parameter.evalType(".*char.*")` |
| `.order(n)` | Child ordering |
| `.argumentIndex(n)` | Argument position in call |

## Traversal Steps

### Basic Graph Navigation

| Step | Direction | Example |
|------|-----------|---------|
| `.method` | Call → Method | `cpg.call.name("foo").method` |
| `.caller` | Method → Call | `cpg.method.name("foo").caller` |
| `.callee` | Call → Called method | `cpg.call.name("bar").callee` |
| `.parameter` | Method/TypeDecl → Params | `cpg.method.name("foo").parameter` |
| `.argument` | Call → Arguments | `cpg.call.name("foo").argument` |
| `.argument(n)` | Call → Nth argument | `cpg.call.name("foo").argument(1)` |
| `.definingTypeDecl` | Method → Defining class/type | `cpg.method.name("foo").definingTypeDecl` |
| `.astParent` | Node → AST parent | `cpg.literal.code("42").astParent` |
| `.astChildren` | Node → AST children | `cpg.method.name("foo").astChildren` |
| `.astSiblings` | Node → AST siblings | |
| `.cfgNext` | Node → CFG successor | `cpg.call.name("foo").cfgNext` |
| `.cfgPrev` | Node → CFG predecessor | |
| `.ddgIn` | Node → DDG inputs | |
| `.ddgOut` | Node → DDG outputs | |
| `.cdgIn` | Node → CDG inputs | |
| `.cdgOut` | Node → CDG outputs | |
| `.pdgIn` | Node → PDG inputs | |
| `.pdgOut` | Node → PDG outputs | |
| `.reachableBy` | Node → reachable predecessors | |
| `.reachableTo` | Node → reachable successors | |
| `.dominators` | Node → dominator tree | |
| `.postDominators` | Node → post-dominator tree | |

### Data Flow

| Step | Behavior |
|------|----------|
| `.source` | Alias for reaching source/definitions |
| `.reachableByFlows(source)` | Find flows from source nodes to current |
| `.reachableToFlows(sink)` | Find flows from current to sink nodes |
| `.dedup` | Remove duplicate elements |
| `.headOption` | Optional first result |

## Generic Filters

```scala
.filter(condition)      // Keep elements matching predicate
.filterNot(condition)   // Remove elements matching predicate
.where(subTraversal)    // Filter by sub-traversal match
.whereNot(subTraversal) // Filter by sub-traversal non-match
.map(transform)         // Transform elements
.flatMap(transform)     // Transform and flatten
.collect { case ... }   // Pattern-match and transform
```

### Examples

```scala
// Find public methods with more than 3 parameters
cpg.method.isPublic.filter(_.parameter.size > 3).name.l

// Find calls where any argument is a literal "0"
cpg.call.where(_.argument.isLiteral.code("0")).code.l

// Find methods NOT named "test.*"
cpg.call.whereNot(_.name("test.*")).name.l

// Map to JSON-like output
cpg.method.isPublic.map(m => s"""{"name": "${m.name}", "line": ${m.lineNumber.getOrElse(-1)}}""").l
```

## Common Analysis Patterns

### Sensitive Sink Discovery

```scala
val SINK_PATTERNS = List("exec", "system", "popen", "eval", "include", "require",
  "Runtime.exec", "ProcessBuilder", "os.system", "subprocess",
  "strcpy", "strcat", "sprintf", "gets", "scanf", "memcpy")

cpg.call.name(SINK_PATTERNS.mkString("(", "|", ")")).l.foreach { call =>
  println(s"[SINK] ${call.code} @ ${call.location.filename}:${call.location.lineNumber.getOrElse("?")}")
}
```

### Taint Tracking (Source → Sink)

```scala
// Define sources (user-controllable input)
def source = cpg.call.name("gets").argument(1) ++
             cpg.call.name("scanf").argument(2) ++
             cpg.call.name("recv").argument(1) ++
             cpg.parameter.evalType(".*char.*")

// Define sinks (dangerous operations)
def sink = cpg.call.name("system").argument(1) ++
           cpg.call.name("exec.*").argument(1) ++
           cpg.call.name("strcpy").argument(2)

// Find flows
sink.reachableByFlows(source).p
```

### Control Flow Analysis

```scala
// Find all if-conditions that check a specific variable
cpg.controlStructure.condition.code(".*password.*").l

// Find switch statements with fall-through cases
cpg.controlStructure.controlStructureType("SWITCH").l
```

### Call Graph Exploration

```scala
// Upward: who calls this function?
cpg.method.name("dangerousFunc").caller.name.l

// Downward: what does this function call?
cpg.method.name("handleRequest").callee.name.l

// Full call chain depth-2
cpg.method.name("main").callee.callee.name.l
```

### Cross-File Analysis

```scala
// Find all source files using a specific include
cpg.call.name("include.*").code(".*vulnerable\\.h.*").location.filename.l

// Find cross-file function calls
cpg.call.name("importModule").argument.code.l
```

## Script Execution

```bash
# Run a query script against a CPG
~/bin/joern/joern-cli/joern --script query.sc --params cpgFile=cpg.bin

# With increased memory
~/bin/joern/joern-cli/joern -J-Xmx8G --script query.sc --params cpgFile=cpg.bin

# Export CPG to other formats
~/bin/joern/joern-cli/joern-export cpg.bin --format dot --out output-dir
~/bin/joern/joern-cli/joern-export cpg.bin --format neo4j --out output-dir
```

## IDE Helper (Interactive REPL)

```bash
~/bin/joern/joern-cli/joern --import cpg.bin
```

At the `joern>` prompt, use TAB for auto-completion on all node types and steps. The REPL supports full Scala expressions.
