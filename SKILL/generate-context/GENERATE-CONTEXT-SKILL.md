# Generate Monolith Context Skill

## Purpose

Use this skill to produce a new context file under `SKILL/contexts/<benchmark-name>.md` for a benchmark that does not yet have one.

Context files are the primary orientation layer for every agent working on a benchmark. They must exist before any graph analysis, chain validation, or decomposition work starts. Reading source code without a context file wastes time and risks misinterpreting noise as domain logic.

## Template

The output must conform to the template at:

```
SKILL/generate-context/MONOLITH-CONTEXT-TEMPLATE.md
```

Fill every `{{placeholder}}` with discovered values. Do not leave any placeholder unexpanded in the output. Omit optional subsections only when they genuinely do not apply (e.g. no messaging layer → omit Messaging bullet).

---

## Inputs

Required:

- The benchmark name, e.g. `acmeair`

Files to read before starting:

```
benchmarks/<benchmark-name>/          ← scan build descriptor (pom.xml or build.gradle) and top-level layout first
analysis/graphs/<benchmark-name>/action-points.json        ← action-point enumeration
analysis/graphs/<benchmark-name>/class-graph.json          ← class-level dependency graph (fanout → key classes)
analysis/graphs/<benchmark-name>/method-graph.json         ← method-level graph (entry points, hub methods)
analysis/graphs/<benchmark-name>/data-sources.json         ← data stores and messaging identified by extractor
analysis/graphs/<benchmark-name>/extraction-report.md      ← what was extracted, known gaps, tool limitations
```

Do NOT read every source file. Use the graphs to find high-fanout nodes (key classes) and then read only those source files needed to confirm a classification or fill a gap.

---

## Section-by-Section Instructions

### 1. App Identity

Read `pom.xml` or `build.gradle` for:
- groupId / artifactId → confirms app name
- Java version (look for `maven.compiler.source` or `java.version` property)
- Framework (Spring, Jakarta EE, etc.) — confirm by scanning dependencies, not just file names

Count Maven modules or Gradle subprojects. List them by their artifactId or subproject name.

### 2. Architecture Layers

Infer layers from the top-level package structure and graph edges. Typical Java monolith layers:

- **Web / Presentation** — Servlets, JSPs, REST controllers, action beans
- **Service / Business** — `*Service`, `*Manager`, `*Facade` classes
- **Repository / Persistence** — `*DAO`, `*Mapper`, `*Repository` classes
- **Domain / Model** — POJOs/entities with no infrastructure imports
- **Infrastructure / Util** — cross-cutting concerns (see Noise Catalog)

Map each layer to the concrete package path where it lives in this benchmark.

### 3. Package / Module Map

List every top-level package (or Gradle/Maven submodule) with a single-phrase role description.  
Derive this from `class-graph.json` node IDs — they contain fully qualified class names.

### 4. Action Points by Module

Read `action-points.json`. Group action points by the module or sub-app they belong to.  
Cap output at 10 modules and 10 action points per module per the template truncation rule.

Format each line:
```
[TYPE] METHOD /path → ClassName.methodName()
```

Types: `HTTP`, `MQ`, `SCHEDULER`, `CLI`, `EVENT`

### 5. External Boundaries

Read `data-sources.json` and `extraction-report.md`.  
List only the *category* of each integration (e.g. `relational-sql`, `mongodb`, `jms`). Never include connection strings, table names, or URL details in this section.

### 6. Key Classes

Sort nodes in `class-graph.json` by outgoing-edge count (or in-degree, whichever is higher). Take the top 5–10 that are not in the noise catalog. For each, read enough source to write a one-phrase role description that is more useful than just the class name.

### 7. Domain Vocabulary

Scan class names, method names, and action-point paths in the graph artifacts. Cluster related terms into named domain concepts (e.g. "Order": `Order`, `LineItem`, `OrderService`, `placeOrder`).  
Do not include infrastructure or framework terms.

### 8. Navigation Guide

Write one bullet per structural convention that an agent needs to navigate the codebase quickly.  
Examples:
- "All DAO interfaces → `com.example.dao`"
- "HTTP entry points → `com.example.web.action`"
- "MyBatis mapper XMLs → `src/main/resources/.../mapper/`"

### 9. Noise Catalog

Identify cross-cutting classes and packages that must be excluded from decomposition reasoning. Sources:
- `extraction-report.md` often lists framework scaffolding
- Common Java noise: logging (`*Logger`, `*LoggingFilter`), exception mappers, security filters, serialization helpers, config/properties loaders, generic utilities

For each noise entry, write a one-phrase rationale so no future agent second-guesses the exclusion.

---

## Output

Write the completed context file to:

```
SKILL/contexts/<benchmark-name>.md
```

After writing, also update `AGENTS.md` if the benchmark was not previously listed there.

---

## Quality Checklist

Before finishing, verify every point:

- [ ] No `{{placeholder}}` left unexpanded
- [ ] Section 4 respects the 10-module / 10-action-point cap and includes the truncation notice if applicable
- [ ] Section 5 contains no URLs, connection strings, or table names
- [ ] Section 6 key classes are confirmed by source reading, not inferred from names alone
- [ ] Section 9 noise entries each have a rationale phrase
- [ ] Output file is at `SKILL/contexts/<benchmark-name>.md`
- [ ] AGENTS.md updated if this is a new benchmark
