# Phase 2 — Graph Hardening & Semantic Enrichment Skill

## Purpose

Use this skill to execute Phase 2 of the decomposition pipeline for **any** benchmark monolith.

Phase 2 covers method §§5–8 and §10: chain revalidation, noise filtering, cross-cutting component
detection, service summarization and tagging, data-source tagging, and controlled vocabulary
construction. The output feeds Phase 3 (Skeleton Construction) directly.

## Parameters

Throughout this skill, `<benchmark>` is a placeholder for the benchmark name.
Substitute it with the actual name before running (e.g. `jpetstore-6`, `acmeair`, `cargotracker`).

Canonical path conventions:
- Context file:        `SKILL/contexts/<benchmark>.md`
- Graph artifacts:     `analysis/graphs/<benchmark>/`
- Source code:         `benchmarks/<benchmark>/`
- Decomposition plan:  `SKILL/decomposing/<benchmark>-decomposition-plan.md`

---

## Pre-flight: Read These Files First (Orchestrating Agent)

Before spawning any sub-agent, read all of the following. Do not skip any.

```
SKILL/contexts/<benchmark>.md                             ← app orientation, domain vocabulary, noise catalog
analysis/graphs/<benchmark>/extraction-report.md          ← what was extracted, tool limitations, known gaps
analysis/graphs/<benchmark>/action-points.json            ← all action points with IDs, classes, methods
analysis/graphs/<benchmark>/class-graph.json              ← class-level dependency graph
analysis/graphs/<benchmark>/data-sources.json             ← data sources identified by the extractor
private-docs/method-idea-consolidated.md                  ← read §§5, 6, 7, 8, 10 only
SKILL/decomposing/decomposition-plan.md       ← read the Phase 2 section for concrete guidance
```

If no decomposition plan exists yet for this benchmark, create one using
`SKILL/decomposing/decomposition-plan.md` as a template before continuing.

---

## Critical Context: Understand Extractor Limitations

Read `analysis/graphs/<benchmark>/extraction-report.md` and answer these questions before batching:

1. Were CodeQL and tree-sitter available at extraction time?
2. Are any chains empty or near-empty (`reachedNodeCount` ≤ 1, `edges: []`)?
3. Are any nodes classified `unknown_framework_target`? These have no outgoing edges and are the
   primary source of false negatives.
4. Which DI / framework patterns (Spring `@Autowired`, CDI `@Inject`, EJB injection, etc.) were
   used in this benchmark? If those were unresolved by the extractor, all chains from entry-point
   classes that only call services via injection will be empty.

Read the **Noise Catalog** section in `SKILL/contexts/<benchmark>.md` to identify classes and
tables to exclude from downstream analysis.

> **jpetstore-6 example**: CodeQL and tree-sitter were both unavailable. Spring `@Autowired` field
> injection was not resolved. CartActionBean chains (008–012) are completely empty
> (`reachedNodeCount=1`, `edges=[]`). All five need Mode B reconstruction from source code. Account
> and Order chains were extracted well via fallback field-type inference.

---

## Execution Order

Run the steps in this order. Steps marked **(parallel)** may be dispatched as concurrent sub-agents.

```
Step 1a–1N — Chain Revalidation batches                  (all batches parallel with each other)
  ↓ wait for all chain batches
Step 1e — Orchestrator: merge hardening findings → hardening-report.md
Step 1f — Orchestrator: apply noise filter → noise-filter.json
  ↓
Step 2  — Cross-Cutting Component Detection               (single sub-agent)
  ↓ wait for Step 2
Step 3  — Service Summarization + Tagging                 (parallel sub-agents, one per service or batch)
Step 4  — Data-Source Tagging                             (single sub-agent, parallel with Step 3)
  ↓ wait for Steps 3 and 4
Step 5  — Vocabulary Consolidation                        (orchestrator)
```

---

## Step 1: Chain Revalidation (§5 Steps 2–4)

### 1a. Batch Definitions

Group chains by entry-point class (ActionBean, REST controller, EJB, servlet, etc.). This is the
natural domain boundary — all chains from the same entry-point class share the same set of
injected services and can be reviewed with one source-code load.

**Batch size**: 4–8 chains per sub-agent. Fewer chains per batch when Mode B reconstruction is
expected (empty chains require more source reading).

**How to build the batch table**:
1. Read `analysis/graphs/<benchmark>/action-points.json`.
2. Group action points by `classFqn`.
3. Each group = one batch. If a group has more than 8 action points, split it in two.
4. For each batch, list the source files to read from the benchmark's Package/Module Map
   (§3 of `SKILL/contexts/<benchmark>.md`).

> **jpetstore-6 example**:
>
> | Batch | Chains | Entry-point class | Source files |
> |-------|--------|-------------------|--------------|
> | A | 001–007 | AccountActionBean | `AccountActionBean.java`, `AccountService.java`, `AccountMapper.java`, `Account.java` |
> | B | 008–012 | CartActionBean ⚠ empty | `CartActionBean.java`, `CatalogService.java`, `OrderService.java`, `Cart.java`, `CartItem.java`, `Item.java`, `ItemMapper.java` |
> | C | 013–017 | CatalogActionBean | `CatalogActionBean.java`, `CatalogService.java`, `CategoryMapper.java`, `ProductMapper.java`, `ItemMapper.java`, `Category.java`, `Product.java`, `Item.java` |
> | D | 018–021 | OrderActionBean | `OrderActionBean.java`, `OrderService.java`, `OrderMapper.java`, `LineItemMapper.java`, `SequenceMapper.java`, `Order.java`, `LineItem.java`, `Cart.java` |
>
> Source root: `benchmarks/jpetstore-6/src/main/java/org/mybatis/jpetstore/`
> XML maps:    `benchmarks/jpetstore-6/src/main/resources/org/mybatis/jpetstore/mapper/`

### 1b. Sub-agent Prompt Template

Use this prompt for each batch sub-agent. Fill in `<BENCHMARK>`, `<CHAIN_FILES>`,
`<ENTRY_POINT_CLASS>`, `<SOURCE_FILES>`, and `<SOURCE_ROOT>` before dispatching.

---
**Sub-agent prompt:**

```
You are reviewing <BENCHMARK> dependency chains for correctness as part of a monolith decomposition pipeline.

## Read First

1. SKILL/contexts/<BENCHMARK>.md — orientation, noise catalog, architecture layers
2. analysis/graphs/<BENCHMARK>/extraction-report.md — extraction limitations and known gaps
3. analysis/graphs/<BENCHMARK>/class-graph.json — class dependencies (reference only)

## Source Files to Read

Read all of these source files before reviewing chains:

<SOURCE_FILES — expand to absolute paths using root: <SOURCE_ROOT>>

Also read the relevant data-access config files (MyBatis XML maps, JPA persistence.xml, etc.)
for the mappers or repositories referenced by the classes in your batch.
Derive which config files to read from the benchmark's Package/Module Map in SKILL/contexts/<BENCHMARK>.md.

## Chain Files to Review

Review each of these chain files one by one:
<CHAIN_FILES — list each full path: analysis/graphs/<BENCHMARK>/chains/NNN-name.json>

## Revalidation Rules

For each chain, first check its `reachedNodeCount` and `edges` array.

**Mode A — Non-empty chain (reachedNodeCount > 1 and edges is non-empty):**
- Verify every edge in `edges` has direct source-code evidence (a method call, injected field call,
  or data-access framework invocation)
- Identify false positives (FP): edges present in chain but not supported by source code
- Identify false negatives (FN): method calls or data accesses visible in source that are missing
- Check each data-source edge: confirm the mapper/repository config actually queries/updates the flagged table or collection

**Mode B — Empty or near-empty chain (edges is [] OR reachedNodeCount ≤ 1):**
- Read the action point method body in source code
- Trace the full call path: entry-point method → service calls → data-access calls → tables/collections
- Document every call edge that should exist but is missing
- Mark ALL missing edges as FN severity=HIGH and action_type=hardcode_patch
- Note the probable cause (e.g. Spring @Autowired injection not resolved, EJB injection not resolved)

## Output Format

Return a JSON array, one object per chain:

[
  {
    "chain_file": "NNN-...",
    "verdict": "valid | partially_valid | invalid | empty_reconstructed",
    "mode": "A | B",
    "reachedNodeCount": <from chain JSON>,
    "fp_edges": [
      { "from": "method:...", "to": "method:...", "reason": "..." }
    ],
    "fn_edges": [
      {
        "from": "method:...",
        "to": "method:...",
        "edge_type": "call | data_access | config",
        "severity": "HIGH | MEDIUM | LOW",
        "source_evidence": "<file>:<line> — <quoted snippet>",
        "action_type": "fix_extractor | hardcode_patch",
        "fix_description": "..."
      }
    ],
    "data_source_gaps": [
      { "table": "table:<name>", "reason": "service X queries it via mapper Y, missing from reachedDataSources" }
    ],
    "notes": "..."
  }
]

Use verdict "empty_reconstructed" when the chain was Mode B and you have manually traced the full path.

Verdict guide:
- valid: no material FP or FN. Chain is trustworthy for downstream use.
- partially_valid: minor FNs or unresolvable polymorphic targets. Usable but note gaps.
- invalid: major structural errors, wrong root, or chain does not represent the source.
- empty_reconstructed: chain was empty; full path reconstructed from source code.

Do not guess. For every FN you report, cite the exact source file and line number.
```

---

### 1c. Sub-agent Output Schema

Each sub-agent returns a JSON array as specified above. The orchestrator collects all arrays
(one per batch).

### 1d. Orchestrator Merge: Produce hardening-report.md

After all batch sub-agents complete:

1. Flatten all JSON arrays into a single list (one entry per chain).
2. Categorize into three tiers:
   - **Tier 1 — Auto-approved**: verdict=`valid`, no FP, no FN severity=HIGH. No action needed.
   - **Tier 2 — Needs extractor fix**: any FN with action_type=`fix_extractor`. Group by common
     root cause. Each unique root cause = one `fix_extractor` recommendation.
   - **Tier 3 — Needs hardcode patch**: FN with action_type=`hardcode_patch`. Each becomes an
     explicit edge addition entry.
3. Write `analysis/graphs/<benchmark>/hardening-report.md`:

```markdown
# Hardening Report: <benchmark>

Generated: <date>

## Summary

- Chains reviewed: <N>
- Auto-approved: <N>
- Needs extractor fix: <N chains affected>, <N> unique fix_extractor recommendations
- Needs hardcode patch: <N edges>
- Empty chains reconstructed: <N>

## Tier 1 — Auto-approved Chains

<list chain file names>

## Tier 2 — Extractor Fix Recommendations

### fix_extractor: <root cause title>
- Affects chains: <list>
- Root cause: <description>
- Recommended fix: <what to change in tools/graph-extractor/extract.mjs or CodeQL config>

## Tier 3 — Hardcode Patches

### <chain_file>
- FN: `<from>` → `<to>` [<edge_type>]
  - Severity: <HIGH|MEDIUM|LOW>
  - Source evidence: <file>:<line>
  - Justification: <why this edge must exist>

## Per-Chain Verdict Table

| Chain | Verdict | Mode | FP | FN HIGH | FN MED | Data Source Gaps |
|-------|---------|------|----|---------|--------|------------------|
| ...   | ...     | ...  | .. | ...     | ...    | ...              |
```

### 1e. Noise Filter (§5 Step 4)

After the hardening report is written, apply the noise filter. This is a **deterministic step** — no
sub-agent needed.

**How to derive noise content**: read the **Noise Catalog** section of
`SKILL/contexts/<benchmark>.md`. Every entry there maps to a `noise_classes` or `noise_tables`
entry below. Use the noise_reason field to record why each class or table is excluded.

Also add these universal noise patterns regardless of benchmark:
- `src/main/webapp/**` (or equivalent view layer directory)
- `src/test/**`

Write `analysis/graphs/<benchmark>/noise-filter.json`:

```json
{
  "benchmark": "<benchmark>",
  "noise_reason": {
    "<fully.qualified.ClassName>": "<why it is noise>",
    "table:<tablename>": "<why it is noise>"
  },
  "noise_classes": [
    "<fully.qualified.ClassName>"
  ],
  "noise_tables": [
    "table:<tablename>"
  ],
  "noise_patterns": [
    "src/main/webapp/**",
    "src/test/**"
  ]
}
```

> **jpetstore-6 example**:
> ```json
> {
>   "benchmark": "jpetstore-6",
>   "noise_reason": {
>     "org.mybatis.jpetstore.domain.Sequence": "infrastructure-id-generator — pure DB sequence, no domain logic",
>     "org.mybatis.jpetstore.mapper.SequenceMapper": "infrastructure-mapper — supports Sequence only",
>     "org.mybatis.jpetstore.domain.CartItem": "thin-wrapper — no independent logic, quantity field only",
>     "table:bannerdata": "ui-personalization — ad banner display, irrelevant to decomposition",
>     "table:supplier": "display-field-only — no service logic accesses supplier as a domain concept"
>   },
>   "noise_classes": [
>     "org.mybatis.jpetstore.domain.Sequence",
>     "org.mybatis.jpetstore.mapper.SequenceMapper",
>     "org.mybatis.jpetstore.domain.CartItem"
>   ],
>   "noise_tables": ["table:bannerdata", "table:supplier"],
>   "noise_patterns": ["src/main/webapp/**", "src/test/**"]
> }
> ```

**Rule for downstream steps**: any class or table in `noise_classes` or `noise_tables` must be
excluded from cross-cutting classification, service responsibility records, data-source tagging,
and all scoring signal computation.

---

## Step 2: Cross-Cutting Component Detection (§6)

### 2a. Sub-agent Task

Spawn one sub-agent. For large benchmarks (> 30 mid-tier classes), split into two sub-agents
batched by package and merge results.

**How to build the class list**: read `analysis/graphs/<benchmark>/class-graph.json` and identify
nodes in the mid-tier layer (service, process, orchestration). Cross-reference with the benchmark's
Package/Module Map (§3 of `SKILL/contexts/<benchmark>.md`). Exclude all classes in
`noise-filter.json`. Do NOT include web/action-layer classes or plain domain entities.

---
**Sub-agent prompt:**

```
You are classifying mid-tier Java classes from <BENCHMARK> as cross-cutting or business components,
as part of a monolith decomposition pipeline.

## Read First

1. SKILL/contexts/<BENCHMARK>.md — orientation and noise catalog
2. analysis/graphs/<BENCHMARK>/noise-filter.json — classes to exclude entirely (do not classify these)
3. analysis/graphs/<BENCHMARK>/class-graph.json — who depends on whom
4. private-docs/method-idea-consolidated.md — read §6 only (Cross-Cutting Component Detection)

## Scope

Classify only the mid-tier classes listed below (derived from class-graph.json and context file §3).
Exclude classes in noise-filter.json.
Do NOT classify web/action-layer classes (ActionBeans, REST controllers, servlets) or domain entities.

<MID_TIER_CLASS_LIST — derive from class-graph.json + context file §3 Package/Module Map>

For each class, read its source file under benchmarks/<BENCHMARK>/src/
Derive the exact source paths from the context file's Package/Module Map (§3).

## Classification Rules

A class is `cross_cutting` if:
- It provides generic technical infrastructure (logging, error handling, auth enforcement,
  ID generation, auditing, metrics) with no domain-specific data or logic.
- It is called by nearly every other business component.
- Removing it from a microservice would not affect that microservice's domain identity.

A class is `candidate_cross_cutting` if it could be cross-cutting but you are not certain.
A class is `business` if it contains domain-specific logic or operates on domain-specific data.

Data-access interfaces (mappers, repositories) are almost always `business` because each is tied
to a specific domain table. Classify them as `business` unless the mapper is clearly generic
infrastructure (e.g. an ID-sequence generator used by all other services).

## Output Format

Return a JSON array:

[
  {
    "class_fqn": "...",
    "classification": "business | cross_cutting | candidate_cross_cutting",
    "reasoning": "1-2 sentence justification citing source evidence",
    "source_evidence": "<file>:<line> — <quoted key line>"
  }
]
```

---

### 2b. Orchestrator Action After Step 2

Write `analysis/graphs/<benchmark>/cross-cutting-report.json` with the sub-agent's output verbatim.

If any class is `candidate_cross_cutting`, add a section to `hardening-report.md`:
`## Candidate Cross-Cutting — Human Review Needed`

Do not block pipeline progress. Proceed treating `candidate_cross_cutting` as `business` until
a human confirms.

---

## Step 3: Service Summarization, Responsibility Records, and Tagging (§7)

### 3a. Scope

Summarize all mid-tier **service classes** classified as `business` in Step 2. Data-access
interfaces (mappers, repositories) are tagged but do NOT receive full responsibility records —
they are data-access components, not business orchestration. They receive abbreviated tags only.

### 3b. Batch Definition

**Service sub-agents**: one sub-agent per service class, or batch up to 3 services per sub-agent
if the benchmark has many services. All service sub-agents run in parallel.

**Mapper sub-agent**: one sub-agent handles all data-access interfaces for the benchmark.
Batch at up to 10 mappers/repositories per sub-agent for large benchmarks.

**How to build the service list**: read `analysis/graphs/<benchmark>/cross-cutting-report.json`
(from Step 2). Collect all entries with `classification: "business"` whose class is in the
service layer (not the mapper/repository layer). Derive the exact source file paths from the
context file's Package/Module Map (§3).

> **jpetstore-6 example**:
>
> | Sub-agent | Target | Source file |
> |-----------|--------|-------------|
> | S1 | AccountService | `service/AccountService.java` |
> | S2 | CatalogService | `service/CatalogService.java` |
> | S3 | OrderService | `service/OrderService.java` |
> | S4 (mappers) | AccountMapper, CategoryMapper, ItemMapper, LineItemMapper, OrderMapper, ProductMapper | `mapper/*.java` |
>
> Source root: `benchmarks/jpetstore-6/src/main/java/org/mybatis/jpetstore/`
> XML maps:    `benchmarks/jpetstore-6/src/main/resources/org/mybatis/jpetstore/mapper/`

### 3c. Sub-agent Prompt Template (Service sub-agents)

---
**Sub-agent prompt:**

```
You are producing a service responsibility record and hierarchical tags for a mid-tier service class
from <BENCHMARK>, as part of a monolith decomposition pipeline.

## Read First

1. SKILL/contexts/<BENCHMARK>.md — domain vocabulary (§7 Domain Vocabulary especially)
2. private-docs/method-idea-consolidated.md — read §7 only (Service-Level Summarization)
3. analysis/graphs/<BENCHMARK>/noise-filter.json — classes to ignore
4. The service source file: <SOURCE_FILE_PATH>
5. The data-access config files (MyBatis XML maps, JPA mappings, etc.) for any mapper/repository
   this service calls. Derive their paths from the context file's Package/Module Map (§3).

## Your Task

Produce one responsibility record for <SERVICE_CLASS>.

## Responsibility Record Schema

{
  "class_fqn": "...",
  "class_short": "...",
  "summary": "<3-4 sentence prose: start generic (what kind of component), drill to specifics, responsibilities, role>",
  "action_verb": "<single verb from: manage, retrieve, orchestrate, validate, compute, transform, convert, fetch, record, enforce>",
  "object": "<domain noun, lowercase-hyphenated, e.g. user-account, catalog-item, order>",
  "description": "<1-2 sentences: '<verb> <object> by doing X and Y'>",
  "inputs": ["<typed descriptor, e.g. 'String username', 'Cart cart'>"],
  "outputs": ["<typed descriptor, e.g. 'Account', 'List<Product>', 'void'>"],
  "data_sources_touched": ["table:<name>", ...],
  "tags": {
    "L1": "<top-level domain>",
    "L2": "<sub-domain>",
    "L3": "<specific role>"
  }
}

## Tag Rules

- L1: single noun matching the service's primary domain.
- L2: narrows L1 to the specific sub-concern of this service.
- L3: narrows L2 to the precise operation type.
- Use lowercase-hyphenated phrases. No spaces. No CamelCase.
- Do NOT invent L1 values that don't match the app's domain vocabulary.
  Consult the Domain Vocabulary section of SKILL/contexts/<BENCHMARK>.md.
- Do NOT consult the existing vocabularies.json — it does not exist yet. Tag freely; deduplication happens in Step 5.

## Action Verb and Object Rules

- Pick the most specific verb that describes what this service primarily does.
- The object must be a domain concept, not a technical term.
  BAD: "process entity", "handle record"
  GOOD: "manage user-account", "orchestrate order"

Return exactly one JSON object (not an array).
```

---

### 3d. Sub-agent Prompt Template (Data-access sub-agent)

---
**Sub-agent prompt:**

```
You are producing abbreviated domain tags for data-access interfaces (mappers, repositories)
from <BENCHMARK>. These components do not receive full responsibility records.
Produce only L1 and L2 tags for each.

## Read First

1. SKILL/contexts/<BENCHMARK>.md — Package/Module Map (§3) and Domain Vocabulary (§7)
2. analysis/graphs/<BENCHMARK>/noise-filter.json — skip any mapper/repository listed as noise

## Interfaces to Tag

<DATA_ACCESS_LIST — derive from cross-cutting-report.json business-classified mapper/repository classes>

For each interface, read its source file and the associated data-access config (XML map, JPA entity, etc.).
Derive exact paths from the context file's Package/Module Map (§3).

## Output Format

Return a JSON array, one entry per interface:

[
  {
    "class_fqn": "...",
    "class_short": "...",
    "component_type": "mapper | repository | dao",
    "tables_accessed": ["table:<name>", ...],
    "tags": {
      "L1": "<domain>",
      "L2": "<sub-domain>"
    }
  }
]

Use the same L1/L2 vocabulary scheme as the service sub-agents.
L1 must match the primary table's domain. Do not add L3 for mappers/repositories.
```

---

### 3e. Orchestrator Action After Step 3

Combine all service and data-access sub-agent outputs into:

`analysis/graphs/<benchmark>/service-responsibility-records.json`

```json
{
  "benchmark": "<benchmark>",
  "services": [ /* full responsibility records */ ],
  "data_access": [ /* abbreviated tag entries for mappers/repositories */ ]
}
```

Do not attempt vocabulary deduplication yet — that happens in Step 5.

---

## Step 4: Data-Source-Level Tagging (§8)

### 4a. Sub-agent Task

Spawn one sub-agent. For large schemas (> 20 tables), split into batches of 15 per sub-agent
grouped by domain area (e.g. all account-related tables in one batch). Run in parallel with Step 3.

---
**Sub-agent prompt:**

```
You are assigning domain tags to data sources (SQL tables, NoSQL collections, queues, etc.)
from <BENCHMARK>, as part of a monolith decomposition pipeline.

## Read First

1. SKILL/contexts/<BENCHMARK>.md — §5 External Boundaries, §7 Domain Vocabulary
2. analysis/graphs/<BENCHMARK>/data-sources.json — all data sources identified by the extractor
3. analysis/graphs/<BENCHMARK>/noise-filter.json — noise tables: tag them but mark noise: true
4. private-docs/method-idea-consolidated.md — read §8 only (Data-Source-Level Hierarchical Tagging)

## Data Sources to Tag

All entries from data-sources.json.

Also read the data-access config files (MyBatis XML maps, JPA mappings, Hibernate configs, etc.)
to confirm which mapper/repository accesses which table. Derive config paths from
SKILL/contexts/<BENCHMARK>.md Package/Module Map (§3).

## Tagging Rules

- L1: business-domain area (e.g. account | catalog | order | inventory | infrastructure)
- L2: sub-domain within L1 (e.g. account-master, catalog-taxonomy, order-lifecycle)
- L3: specific role of this table (e.g. user-credentials, stock-levels, order-header)
- Use lowercase-hyphenated phrases.
- Noise tables (from noise-filter.json): tag fully but set "noise": true.
- Infrastructure-only tables (ID sequences, schema version trackers): set L1="infrastructure", noise: true.

## Output Format

[
  {
    "source_id": "table:<name>",
    "source_name": "<name>",
    "source_type": "table | collection | queue | topic | ...",
    "accessed_by": ["<DataAccessClass>"],
    "tags": {
      "L1": "...",
      "L2": "...",
      "L3": "..."
    },
    "noise": false,
    "noise_reason": null
  }
]
```

---

### 4b. Orchestrator Action After Step 4

Write `analysis/graphs/<benchmark>/data-source-tags.json` with the sub-agent output verbatim.

---

## Step 5: Vocabulary Consolidation (§10)

Performed directly by the orchestrating agent after Steps 3 and 4 are both complete.
No sub-agent needed.

### 5a. Procedure

1. Read `analysis/graphs/<benchmark>/service-responsibility-records.json`.
2. Read `analysis/graphs/<benchmark>/data-source-tags.json`.
3. Collect all unique values:
   - `action_verb` → `action_verbs`
   - `object` → `objects`
   - `tags.L1`, `tags.L2`, `tags.L3` from services+data_access → `service_tags.L1/L2/L3`
   - `tags.L1`, `tags.L2`, `tags.L3` from data sources → `datasource_tags.L1/L2/L3`
4. Deduplicate each list alphabetically.
5. Record any L1 term that appears in both `service_tags.L1` and `datasource_tags.L1` under
   `shared_L1_terms` — this is expected and desirable; it signals domain alignment.

### 5b. Output Schema

Write `analysis/graphs/<benchmark>/vocabularies.json`:

```json
{
  "benchmark": "<benchmark>",
  "generated": "<ISO date>",
  "note": "All values are lowercase-hyphenated. Lists are sorted alphabetically.",
  "action_verbs": [],
  "objects": [],
  "service_tags": {
    "L1": [],
    "L2": [],
    "L3": []
  },
  "datasource_tags": {
    "L1": [],
    "L2": [],
    "L3": []
  },
  "shared_L1_terms": [],
  "extension_rule": "Before adding a new term in Phase 3+, check this file first. Reuse an existing term if its meaning fits. Add a new term only if no existing term adequately covers the concept. Update this file immediately after adding."
}
```

---

## Output Files Checklist

Phase 2 is complete when all six files exist under `analysis/graphs/<benchmark>/`:

```
hardening-report.md                  ← Step 1d: per-chain verdicts, fix_extractor recs, hardcode patches
noise-filter.json                    ← Step 1f: noise classes/tables to exclude from downstream steps
cross-cutting-report.json            ← Step 2: business vs cross-cutting classification of all mid-tier classes
service-responsibility-records.json  ← Step 3: responsibility records for services + tags for data-access classes
data-source-tags.json                ← Step 4: L1/L2/L3 tags for all data sources
vocabularies.json                    ← Step 5: controlled vocabulary inventories
```

Do not proceed to Phase 3 (Skeleton Construction) until all six files exist and the hardening
report has no Tier 3 hardcode patches with severity=HIGH that are still unresolved.

---

## Completion Criteria

Phase 2 is complete when:

1. Every chain has a verdict in `hardening-report.md` (valid, partially_valid, invalid, or empty_reconstructed).
2. Every empty chain has been manually reconstructed from source code with explicit source evidence for every proposed edge.
3. Every mid-tier class in `cross-cutting-report.json` has classification `business` or `cross_cutting`. Any `candidate_cross_cutting` entries are logged for human review but do not block progress.
4. All service classes have full responsibility records (action_verb, object, description, inputs, outputs, data_sources_touched, L1/L2/L3 tags).
5. All data-access classes (excluding those in noise-filter.json) have L1/L2 tags.
6. All data sources have L1/L2/L3 tags; noise sources are tagged and marked noise: true.
7. `vocabularies.json` is consistent with the values in service-responsibility-records.json and data-source-tags.json.
