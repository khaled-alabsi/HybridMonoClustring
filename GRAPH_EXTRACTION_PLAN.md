# Static Graph Extraction Plan

## Summary

This plan defines a static-only graph extraction pipeline for the five vendored monolithic benchmark applications under `benchmarks/`:

- `benchmarks/jpetstore-6`
- `benchmarks/acmeair`
- `benchmarks/sample.plantsbywebsphere`
- `benchmarks/sample.daytrader7`
- `benchmarks/cargotracker`

The monolith applications will **not be run**. Extraction must use only source code, build metadata, annotations, framework conventions, and configuration files.

The goal is to produce action-point-to-downstream dependency chains suitable for the decomposition method described in the private research notes, while preserving benchmark source trees unchanged.

## Extraction Stack

Use a Node.js orchestration layer with Java-aware static analysis tools.

Primary tools:

- `CodeQL CLI`
  - Primary source of Java call graph edges.
  - Use Java/Kotlin `--build-mode=none` where possible.
  - Treat CodeQL as the authority for `call` and `polymorphic_call` edges.
- `tree-sitter` + `tree-sitter-java`
  - Optional AST layer for framework-specific extraction when CodeQL queries are awkward.
  - Use for action-point discovery, annotation reading, class/member scanning, and fallback syntactic call hints.
- `graphology`
  - In-memory graph representation.
  - Used for graph normalization, traversal, connected components, and chain extraction.
- `fast-xml-parser`
  - Static XML config parsing.
  - Use for `web.xml`, Spring XML, JSF config, MyBatis mapper XML, persistence XML, server XML, and batch XML.
- `yaml`
  - Static YAML config parsing.
- `globby`
  - Benchmark/project discovery and cross-platform file matching.

Suggested Node packages:

```bash
npm install graphology graphology-traversal graphology-components fast-xml-parser yaml globby tree-sitter tree-sitter-java
```

Setup notes:

- Node.js is available locally.
- CodeQL is not currently installed and must be installed before implementation.
- The extraction implementation should not require launching any benchmark server, database, queue, browser, or workload driver.

Reference docs for tool choice:

- GitHub CodeQL CLI `database create`: https://docs.github.com/en/code-security/codeql-cli/codeql-cli-manual/database-create
- GitHub CodeQL Java build-mode guidance: https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-build-options-and-steps-for-compiled-languages
- Tree-sitter official docs: https://tree-sitter.github.io/

## Canonical Outputs

Write generated artifacts outside `benchmarks/` so benchmark source code remains unchanged.

For each benchmark, produce:

```text
analysis/graphs/<benchmark>/action-points.json
analysis/graphs/<benchmark>/method-graph.json
analysis/graphs/<benchmark>/class-graph.json
analysis/graphs/<benchmark>/data-sources.json
analysis/graphs/<benchmark>/chains.json
analysis/graphs/<benchmark>/extraction-report.md
```

Use the benchmark directory name as `<benchmark>`:

- `jpetstore-6`
- `acmeair`
- `sample.plantsbywebsphere`
- `sample.daytrader7`
- `cargotracker`

### Output Intent

- `action-points.json`
  - Static entry points that can trigger execution from outside the system or from framework infrastructure.
- `method-graph.json`
  - Method-level nodes and edges.
- `class-graph.json`
  - Class-level aggregation of the method graph plus framework/config edges.
- `data-sources.json`
  - Tables, entities, mapper methods, repositories, queues, external endpoints, and other persistence/exchange endpoints detected statically.
- `chains.json`
  - Per-action-point downstream closures through business logic and data-source nodes.
- `extraction-report.md`
  - Coverage notes, unsupported patterns, warnings, and per-app extractor tweaks applied.

## Graph Model

### Node Kinds

Use these node kinds:

- `action_point`
- `method`
- `class`
- `config`
- `data_source`
- `table`
- `entity`
- `queue`
- `external_endpoint`
- `unknown_framework_target`

### Edge Types

Use these edge types:

- `call`
- `polymorphic_call`
- `config_route`
- `injection`
- `framework_entry`
- `data_access`
- `entity_table`
- `scheduled_trigger`
- `message_trigger`
- `batch_trigger`

### Edge Authority

- CodeQL is authoritative for `call` and `polymorphic_call`.
- Tree-sitter enriches action-point detection and framework-pattern metadata.
- XML/YAML/config parsing enriches `config_route`, `injection`, `framework_entry`, `data_access`, `entity_table`, `scheduled_trigger`, `message_trigger`, and `batch_trigger`.
- When tools disagree, keep both edges and mark the non-CodeQL edge with `source: "tree-sitter"` or `source: "config"` in the edge metadata.

## Per-App Static Action-Point Rules

### `jpetstore-6`

Framework shape:

- Stripes web actions.
- Spring injection via `@SpringBean`.
- MyBatis mapper interfaces/XML and SQL resources.

Action-point rules:

- Treat classes implementing or extending Stripes action types, especially `*ActionBean`, as action classes.
- Treat public action methods on `ActionBean` classes as action points.
- Include methods annotated with `@DefaultHandler`.
- Use `web.xml` Stripes dispatcher/filter mappings as `config_route` and `framework_entry` edges.

First milestone:

- Start implementation with `jpetstore-6`.
- Produce one complete static chain extraction run before generalizing to the other four benchmarks.

### `acmeair`

Framework shape:

- JAX-RS REST resources.
- Gradle multi-module Java application.
- Spring/XML-style service wiring and data service variants.

Action-point rules:

- Detect classes with `@ApplicationPath`.
- Detect classes and methods with `@Path`.
- Detect HTTP method annotations such as `@GET`, `@POST`, `@PUT`, and `@DELETE`.
- Use `WEB-INF/web.xml` and JAX-RS application classes to form `framework_entry` and `config_route` edges.

### `sample.plantsbywebsphere`

Framework shape:

- JSF/CDI managed beans.
- Servlet entry points.
- EJB-style beans.
- JPA entities and named queries.

Action-point rules:

- Detect `@WebServlet` classes and servlet methods such as `doGet`, `doPost`, `service`, and helper dispatch methods.
- Detect JSF/CDI beans annotated with `@Named`, especially web-facing beans referenced from XHTML pages.
- Parse Faces and web config for route/config edges.
- Detect EJB-style beans as mid-tier/business components unless they are externally triggered.

### `sample.daytrader7`

Framework shape:

- Java EE web application.
- Servlets.
- JSF/CDI beans.
- EJBs.
- Scheduled singleton methods.
- Message-driven beans.
- JPA entities and named/native queries.

Action-point rules:

- Detect `@WebServlet` classes and servlet request methods.
- Detect JSF/CDI `@Named` beans that are referenced by views.
- Detect `@Schedule` methods as scheduled action points.
- Detect `@MessageDriven` beans as message-triggered action points.
- Treat EJB session beans as business-layer components unless exposed through a trigger.

### `cargotracker`

Framework shape:

- Jakarta/JAX-RS REST resources.
- JSF/CDI web beans.
- Scheduled jobs.
- Batch XML jobs.
- JMS-style consumers.
- JPA repositories/entities.

Action-point rules:

- Detect `@ApplicationPath`, `@Path`, and HTTP method annotations.
- Detect JSF/CDI `@Named` beans referenced by views.
- Detect `@Schedule` methods as scheduled action points.
- Parse `META-INF/batch-jobs/*.xml` and create `batch_trigger` edges to referenced readers, processors, writers, and listeners.
- Detect JMS/message consumer classes and mark them as message-triggered action points when statically evident.

## Data-Source Extraction

Apply these static data-source rules across all benchmarks:

- MyBatis:
  - Parse mapper interfaces and mapper XML files.
  - Extract SQL statement IDs and referenced table names where possible.
  - Connect action chains to mapper methods and table/data-source nodes.
- JPA:
  - Detect `@Entity`, `@Table`, `@NamedQuery`, and `@NamedNativeQuery`.
  - Create `entity_table` edges from entity classes to table names.
  - Connect repository/DAO methods to entities and tables when visible.
- JDBC/SQL:
  - Extract direct SQL strings when statically visible.
  - Mark dynamic SQL or unresolved table access in `extraction-report.md`.
- Queues/external endpoints:
  - Extract configured queue names, REST client URLs, SOAP endpoints, and other external resources from annotations and config where statically visible.

## Chain Extraction Algorithm

For each benchmark:

1. Discover action points using per-app static rules.
2. Build a CodeQL database with Java/Kotlin `--build-mode=none` where possible.
3. Run CodeQL queries to extract method-level calls and polymorphic calls.
4. Parse Java source with tree-sitter for supplemental framework/action metadata.
5. Parse XML/YAML/properties configuration for framework, injection, route, mapper, batch, and persistence edges.
6. Merge all edges into a normalized graphology graph.
7. Aggregate method-level graph into class-level graph.
8. Traverse from each action point to compute downstream closures.
9. Stop traversal at data-source nodes, external endpoints, queues, or terminal domain/entity nodes.
10. Emit canonical outputs and an extraction report.

Traversal rules:

- Preserve edge types in every chain.
- Keep cycles but report them once per action point with a stable cycle ID.
- Do not drop cross-cutting components during extraction; only tag candidates for later filtering.
- Mark unresolved calls, reflection, dynamic dispatch, dynamic SQL, and framework magic in `extraction-report.md`.

## Validation Checklist

Before considering graph extraction complete for a benchmark:

- The benchmark directory name matches one of the five vendored folders exactly.
- No benchmark application was run.
- All outputs were written under `analysis/graphs/<benchmark>/`.
- `action-points.json` contains at least one detected action point.
- `method-graph.json` contains CodeQL-derived call edges.
- `class-graph.json` contains class-level aggregation.
- `data-sources.json` contains detected data-source or persistence nodes, or the report explains why none were found.
- `chains.json` contains at least one chain rooted at an action point.
- `extraction-report.md` lists unsupported patterns and per-app tweaks.

## Implementation Order

1. Implement the shared Node.js project scaffolding and output schema.
2. Install and verify CodeQL CLI.
3. Implement JPetStore extraction first.
4. Validate JPetStore outputs manually against `ActionBean`, service, mapper, and SQL resources.
5. Generalize shared extractors.
6. Add AcmeAir JAX-RS extraction.
7. Add PlantsByWebSphere servlet/JSF/CDI extraction.
8. Add DayTrader servlet/JSF/EJB/schedule/message extraction.
9. Add Cargo Tracker JAX-RS/JSF/schedule/batch/message extraction.
10. Produce a final cross-benchmark extraction summary.

## Assumptions

- Benchmark source code remains vendored in `benchmarks/`.
- Generated graph artifacts belong under `analysis/graphs/`, not under benchmark source trees.
- Extraction implementation will be added later; this file defines the extraction plan only.
- CodeQL build-free Java extraction is acceptable as the default static strategy, with per-app fallback notes recorded in reports if CodeQL cannot process a module.
- Some app-specific tweaking is expected and should be captured in `extraction-report.md`.
