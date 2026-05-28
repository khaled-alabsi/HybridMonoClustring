# Graph Extraction Requirements

## Purpose

The graph extraction output must support monolith-to-microservice decomposition by showing, for each externally triggered action point, the full static dependency chain from the trigger to business logic and data sources.

The monolith applications must **not be run**. All graph data must be extracted statically from source code, annotations, build metadata, and configuration files.

## Required Output Layout

For every benchmark application, write outputs under:

```text
analysis/graphs/<benchmark>/
```

Required files and folders:

```text
analysis/graphs/<benchmark>/action-points.json
analysis/graphs/<benchmark>/method-graph.json
analysis/graphs/<benchmark>/class-graph.json
analysis/graphs/<benchmark>/data-sources.json
analysis/graphs/<benchmark>/chains/
analysis/graphs/<benchmark>/chains/index.json
analysis/graphs/<benchmark>/chains/<one-file-per-action-point>.json
analysis/graphs/<benchmark>/extraction-report.md
```

There must not be a single flat `chains.json` as the primary chain artifact. Chains must be a folder.

## Action Points

`action-points.json` must list every statically detected execution trigger.

Each action point must include:

- stable `id`
- benchmark name
- framework/profile
- class name and fully qualified class name
- method name
- method id
- source file
- line number when available
- annotations when available
- detection source
- route or trigger hint when statically available

Examples of action-point sources:

- Stripes `ActionBean` public action methods
- JAX-RS `@Path` plus HTTP method annotations
- `@WebServlet` servlet methods
- JSF/CDI `@Named` web-facing beans
- scheduled methods such as `@Schedule`
- message consumers such as `@MessageDriven` or `onMessage`
- batch job XML entry points

## Chain Files

Each action point must have exactly one chain file under:

```text
analysis/graphs/<benchmark>/chains/
```

The file name should be stable, readable, and prefixed with a sequence number, for example:

```text
004-acme-air-configuration-count-bookings.json
```

Each chain file must include:

- chain id
- file name
- action point id
- root method id
- full action point metadata
- reached node count
- reached data sources
- all reached nodes
- all reached edges
- one or more expanded paths from the action point outward

Each path must include:

- ordered edge ids
- expanded edge objects
- ordered node ids

The chain must preserve edge types so later scoring can distinguish calls, framework edges, injection, and data access.

## Chain Index

`chains/index.json` must summarize all per-action chain files.

It must include:

- benchmark name
- total chain count
- data-source count
- one index entry per action point
- file name for each chain
- action point id
- root method id
- reached node count
- reached data sources
- path count

The index is only for navigation. The full chain must live in the per-action chain file.

## Graph Files

`method-graph.json` must contain method-level nodes and edges.

`class-graph.json` must aggregate method-level graph information to class-level nodes and edges.

Both graph files must preserve edge metadata:

- edge id
- edge type
- source extractor
- from node
- to node
- call site or operation when available
- unresolved marker when applicable

## Data Sources

`data-sources.json` must include statically detected persistence and external resource nodes.

Supported data-source types:

- relational tables
- JPA entities and entity-table mappings
- MyBatis mapper statements
- MongoDB or Morphia datastore endpoints
- WebSphere eXtreme Scale/ObjectGrid endpoints
- queues and message destinations
- external REST/SOAP/service endpoints when statically visible

Data-source nodes should use stable ids such as:

```text
table:orders
external_endpoint:mongodb
external_endpoint:websphere-extreme-scale
queue:order-events
```

## Edge Types

The extractor must use these edge types:

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

CodeQL should be treated as the authority for `call` and `polymorphic_call` edges when available. Static fallback edges are allowed, but they must be marked with their source.

## Completeness Expectations

For each benchmark:

- every detected action point must have a chain file
- each chain must start at the action point
- each chain should traverse through business/service components where statically resolvable
- each chain should continue to data sources where statically resolvable
- unresolved calls must remain visible instead of being silently dropped
- dynamic dispatch, reflection, framework magic, and missing CodeQL support must be reported in `extraction-report.md`

## Benchmark Source Safety

Generated outputs must never be written inside benchmark source folders.

Allowed generated output root:

```text
analysis/graphs/
```

Benchmark source root to avoid modifying:

```text
benchmarks/
```
