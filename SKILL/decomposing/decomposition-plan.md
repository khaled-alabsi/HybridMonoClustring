# Decomposition Plan

> **How to use**: This is a generic decomposition plan template. When starting a new benchmark,
> read `SKILL/contexts/<benchmark>.md` first, then work through each phase using the structure
> below. Substitute `<benchmark>` with the actual benchmark name throughout.
> jpetstore-6 specifics appear in `> example (jpetstore-6):` blocks for reference.

---

## Pre-flight

Before starting any phase, read:

```
SKILL/contexts/<benchmark>.md                       ← orientation: layers, packages, action points, noise
analysis/graphs/<benchmark>/extraction-report.md    ← what was extracted and what tool gaps exist
private-docs/method-idea-consolidated.md            ← method reference (read the relevant §§ per phase)
```

---

## Phase 1 — Component & Chain Extraction (§§2–4)

Execute using `SKILL/decomposing/PHASE1-EXTRACTION-SKILL.md`.
That skill starts by asking for the benchmark name, checks tool availability, runs the extractor,
validates all chains via sub-agent batches, and writes `phase1-validation-summary.json` as the
handoff to Phase 2.

Expected artifacts in `analysis/graphs/<benchmark>/`:
- `action-points.json` — all action points with IDs, class FQNs, method names
- `method-graph.json` — method-level dependency edges
- `class-graph.json` — class-level dependency edges
- `data-sources.json` — external data sources (tables, queues, etc.)
- `chains/` — one chain JSON file per action point

Check extraction-report.md for tool limitations (missing CodeQL, fallback edges, empty chains).
These shape the effort required in Phase 2.

> **example (jpetstore-6)**: 21 action points across 4 ActionBeans, 95 class edges, 205 method
> edges, 13 SQL tables. CodeQL and tree-sitter were unavailable — static fallback only. CartActionBean
> chains (008–012) are completely empty due to unresolved Spring `@Autowired` injection.

---

## Phase 2 — Graph Hardening & Semantic Enrichment (§§5–8 + §10)

Execute using `SKILL/decomposing/PHASE2-HARDENING-SKILL.md`.
That skill contains the full sub-agent batch instructions. Read it entirely before starting.

**Expected output artifacts** in `analysis/graphs/<benchmark>/`:
- `hardening-report.md`
- `noise-filter.json`
- `cross-cutting-report.json`
- `service-responsibility-records.json`
- `data-source-tags.json`
- `vocabularies.json`

**Key decisions to make during Phase 2**:

1. Which chains are empty / need Mode B reconstruction from source? (check extraction-report.md)
2. Which classes belong in the noise filter? (read Noise Catalog in context file)
3. Are there any true cross-cutting components? (most small monoliths have none)

> **example (jpetstore-6)**: 3 business services (AccountService, CatalogService, OrderService),
> 6 business mappers. Noise: Sequence, SequenceMapper, CartItem, bannerdata table, supplier table.
> No true cross-cutting components — all services are domain-specific.

---

## Phase 3 — Skeleton Construction (§9)

Define the **microservice-level domain hierarchy** (the clustering skeleton).

**Input**: `vocabularies.json` and `service-responsibility-records.json` from Phase 2.

**How to build the skeleton**:
1. Collect all unique `tags.L1` values from service-responsibility-records.json.
   Each distinct L1 value becomes an L1 node in the skeleton.
2. Collect all `tags.L2` values grouped by L1. Each L2 value becomes a child node.
3. Review with domain knowledge from `SKILL/contexts/<benchmark>.md` §7 Domain Vocabulary.
   Add L3 nodes only if the L2 level is too coarse for meaningful separation.
4. Ask: does the user supply an enterprise domain catalog? If yes, use it. If no, use the inferred
   skeleton from steps 1–3.

**Target microservice count**: ask the user or derive from the benchmark's size.
Small apps (< 5 services): 3–5 microservices.
Medium apps (5–15 services): 5–10 microservices.
Large apps (> 15 services): 10–20+ microservices.

**Write** `analysis/graphs/<benchmark>/domain-skeleton.json`:
```json
{
  "benchmark": "<benchmark>",
  "target_microservice_count": { "min": N, "max": M },
  "hierarchy": {
    "<L1-domain>": {
      "<L2-subdomain>": {}
    }
  }
}
```

> **example (jpetstore-6)**:
> L1 values from vocabularies: `account`, `catalog`, `order` → 3 top-level nodes.
> L2 values: `account-management`, `catalog-browsing`, `order-management`.
> Target count: 3–4 (small app; a 4th Cart microservice is optional).
> ```
> root → account → account-management
>      → catalog → catalog-browsing
>      → order   → order-management
> ```

---

## Phase 4 — Initial Decomposition (§§11–12)

Produce one complete initial clustering using the cascading assignment mechanism.

**Read**: §§11–12 of `private-docs/method-idea-consolidated.md` before starting.

### Cascade Step 1 — Group by action-point package

Read `analysis/graphs/<benchmark>/action-points.json`.
Group action points by their `classFqn` package.
If groups naturally align with different L1 domains → done, proceed to placement.
If all action points are in the same package → proceed to Step 2.

> **example (jpetstore-6)**: All 4 ActionBeans are in `org.mybatis.jpetstore.web.actions`.
> Same package → no split from Step 1. Proceed to Step 2.

### Cascade Step 2 — Split by service-level L1+L2 tags

For each action point, read its chain JSON. Identify which services the chain touches.
Look up those services in `service-responsibility-records.json` for their L1/L2 tags.
Group action points by the L1 tag of the services they call.

If an action point's chain touches services from **multiple L1 domains** → flag it.
It is a contamination candidate (see Phase 5). Place it in the L1 domain of its primary purpose
for now and mark for Phase 6 refinement.

> **example (jpetstore-6)**:
> - AccountActionBean chains → AccountService (L1=account) → **MS-Account**
> - CatalogActionBean chains → CatalogService (L1=catalog) → **MS-Catalog**
> - CartActionBean chains → CatalogService (L1=catalog) AND OrderService (L1=order) → **⚠ flagged**
>   Place in MS-Order (primary purpose = checkout); mark for refinement.
> - OrderActionBean chains → OrderService (L1=order) → **MS-Order**

### Cascade Step 3 — Split oversized groups by data-source L1+L2 tags

If any group from Step 2 is still too large (tag-diversity threshold exceeded — more than 2
distinct L1 tags among its data sources), split by the L1 tag of data sources touched.

### Placement into skeleton

For each group, find the skeleton node whose path best matches the group's dominant L1+L2 tag.
Place the microservice at that node.

**Write** `analysis/graphs/<benchmark>/initial-clustering.json`:
```json
{
  "benchmark": "<benchmark>",
  "microservices": [
    {
      "id": "ms-<name>",
      "domain_path": "<L1>/<L2>",
      "action_points": ["action:..."],
      "services": ["<ServiceClass>"],
      "data_access": ["<MapperClass>"],
      "data_sources": ["table:<name>"],
      "contamination_flags": ["<description of flagged cross-domain components>"]
    }
  ],
  "cross_cutting_bucket": {
    "classes": [],
    "tables": []
  }
}
```

> **example (jpetstore-6) initial clustering**:
> - **MS-Account** (account/account-management): AccountActionBean, AccountService, AccountMapper
>   → tables: account, signin, profile
> - **MS-Catalog** (catalog/catalog-browsing): CatalogActionBean, CatalogService, CategoryMapper,
>   ProductMapper, ItemMapper → tables: category, product, item, inventory
> - **MS-Order** (order/order-management): CartActionBean⚠, OrderActionBean, OrderService,
>   OrderMapper, LineItemMapper → tables: orders, lineitem, orderstatus
> - **Cross-cutting**: SequenceMapper, sequence table, bannerdata table

---

## Phase 5 — Scoring (§§13–15 + §17)

**Read**: §§13–15 and §17 of `private-docs/method-idea-consolidated.md` before starting.

Compute three scores for the initial clustering. Use `initial-clustering.json` and
`service-responsibility-records.json` and `data-source-tags.json` as inputs.

### Contamination (minimize)

For every component in every microservice, compute tag tree-edit-distance:

```
d(T_c, P_m) =
  0                              if component tag path T matches microservice domain path P
  Σ w^(max_depth - i)            for each depth i where T_i ≠ P_i
```

Default: `w = 3`, `max_depth = 3`.

L1 mismatch cost: `w^2 = 9`. L2 mismatch cost: `w^1 = 3`. L3 mismatch cost: `w^0 = 1`.

**Identify high-contamination candidates** by reading the `contamination_flags` in
`initial-clustering.json` — these are the action points or services you already flagged in Phase 4.

> **example (jpetstore-6)**:
> - CartActionBean (tagged catalog) in MS-Order (domain=order) → L1 mismatch → cost 9. Primary issue.
> - OrderService reading `item`/`inventory` tables (tagged catalog) → data-source contamination.

### Coherence (maximize)

Signals to compute for each microservice (from §13.2):
- Same L1 tag across all services → +coherence
- Same L2 tag across all services → +more coherence
- Data source exclusivity (used by only one MS) → +coherence
- Chain-crossing penalty: count action-point chains that span > 1 microservice

### Redundancy (minimize toward justified floor)

Check for the same class or `(action_verb, object)` pair appearing in multiple microservices.
Refer to §14 of the method for resolution paths (eliminate / promote to shared / accept with justification).

**Write** `analysis/graphs/<benchmark>/scoring-report.md` with:
- Contamination table: one row per component, showing d(T_c, P_m) and contribution
- Coherence summary per microservice
- Redundancy candidates and proposed resolution

---

## Phase 6 — Iterative Refinement (§§16, 18–19)

**Read**: §§16, 18–19 of `private-docs/method-idea-consolidated.md` before starting.

### Iteration cycle (repeat until convergence)

**Detect**: rank microservices by contamination (descending). Pick top-K (1–3) most contaminated.

**Identify**: within each, rank components by individual contamination contribution. Top contributors
are candidates to move/split/lift.

**Search**: for each candidate component, find destination microservices via trie-lookup on the
domain skeleton. Closest nodes by LCA depth = candidate destinations.

**Propose**: compute hypothetical contamination at each destination. Propose the operation
(move / split / merge / lift-to-shared) that most reduces total contamination.

**Judge**: run LLM rubric on the proposed microservice:
- "Does this microservice have a coherent business domain?"
- "Can you name it in 2–3 words?"
- "Is its data ownership clear?"
- "Does it respect DDD aggregate boundaries?"
- "Are its action points consistent with its domain?"

**Apply**: if rubric passes (Yes/Partial, not No), apply the change. Update `initial-clustering.json`
(or write to `final-clustering.json` after all iterations).

**Human review checkpoints**: add a checkpoint after iteration 1 for the highest-contamination
microservice. The human reviews the proposed split/move before it is applied.

### Convergence condition

Stop when:
- Total contamination = 0 or justified floor (no unjustified L1 mismatches remain)
- LLM rubric gives Yes/Partial on all five questions for all microservices
- No redundancy above threshold remains unless whitelisted

> **example (jpetstore-6) iteration 1** — CartActionBean contamination:
> Evaluate three options:
> - **Option A** — Split CartActionBean into CartBrowse (→ MS-Catalog) and CartCheckout (→ MS-Order).
>   Eliminates L1 mismatch. Cart session state (`domain.Cart`) must be shared or passed.
> - **Option B** — Keep CartActionBean in MS-Order; CatalogService calls become cross-service calls.
>   Simpler. MS-Order retains residual contamination.
> - **Option C** — Create standalone MS-Cart (session-only, no DB). Calls MS-Catalog for items,
>   MS-Order for checkout. Cleanest separation; adds a 4th microservice.
>
> **example (jpetstore-6) iteration 2** — OrderService × ItemMapper cross-domain read:
> OrderService reads `item`/`inventory` tables (L1=catalog) to decrement stock.
> Option: expose inventory-decrement as a cross-service call from MS-Order → MS-Catalog.
> Or: lift the inventory update logic to a shared InventoryService.

**Write** `analysis/graphs/<benchmark>/final-clustering.json` (same schema as initial-clustering.json).

---

## Phase 7 — Evaluation

Compare final clustering against:
- Published decompositions of the same benchmark (if any exist in literature)
- The method's own scoring floor (contamination = 0 or justified)

Record:
- Final contamination, coherence, and redundancy scores
- Which contamination issues were fixed, which were accepted and why
- Lessons learned: patterns or edge cases that should feed back into the method or the skill files

Update `SKILL/contexts/<benchmark>.md` with any architectural discoveries made during phases 2–6
that were not obvious from the static graph alone.

**Write** `analysis/graphs/<benchmark>/evaluation-report.md`.

---

## Output Artifacts Summary

```
analysis/graphs/<benchmark>/
  hardening-report.md               ← Phase 2
  noise-filter.json                 ← Phase 2
  cross-cutting-report.json         ← Phase 2
  service-responsibility-records.json ← Phase 2
  data-source-tags.json             ← Phase 2
  vocabularies.json                 ← Phase 2
  domain-skeleton.json              ← Phase 3
  initial-clustering.json           ← Phase 4
  scoring-report.md                 ← Phase 5
  final-clustering.json             ← Phase 6
  evaluation-report.md              ← Phase 7
```
