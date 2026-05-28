# Phase 1 — Component & Chain Extraction Skill

## Purpose

Use this skill to execute Phase 1 of the decomposition pipeline for a benchmark monolith:
static extraction of action points, dependency graphs, data sources, and per-action-point chains.

Phase 1 covers method §§2–4: three-layer component extraction, action-point enumeration, and
deterministic chain extraction. Its outputs are the raw material that Phase 2 hardens and enriches.

---

## ⛔ Step 0: Identify the Benchmark — DO THIS FIRST

**You must know the benchmark name before doing anything else in this skill.**

If the benchmark name was not given to you explicitly, stop and ask the user:

> "Which benchmark should I run Phase 1 extraction on?
> Available options: jpetstore-6 | acmeair | sample.plantsbywebsphere | sample.daytrader7 | cargotracker"

Do not assume a default. Do not proceed past Step 0 until you have a confirmed benchmark name.

Store the name in `<benchmark>` and substitute it everywhere in this skill.

> **Known benchmark registry** (from `tools/graph-extractor/extract.mjs` BENCHMARKS map):
>
> | Benchmark | Framework profile | npm shortcut |
> |-----------|------------------|--------------|
> | `jpetstore-6` | stripes-spring-mybatis | `npm run graphs:extract:jpetstore` |
> | `acmeair` | jax-rs-gradle | *(none yet — use direct invocation)* |
> | `sample.plantsbywebsphere` | jsf-cdi-servlet-ejb | *(none yet — use direct invocation)* |
> | `sample.daytrader7` | java-ee-servlet-jsf-ejb | *(none yet — use direct invocation)* |
> | `cargotracker` | jakarta-jaxrs-jsf-batch-jms | *(none yet — use direct invocation)* |
>
> Direct invocation for any benchmark: `node tools/graph-extractor/extract.mjs <benchmark>`

---

## Pre-flight: Read These Files First (After Identifying Benchmark)

```
SKILL/contexts/<benchmark>.md                      ← architecture layers, entry-point patterns, noise catalog
SKILL/graph/GRAPH_EXTRACTION_PLAN.md               ← read only the per-app section for <benchmark>
SKILL/graph/GRAPH_REQUIREMENTS.md                  ← canonical output schema and completeness rules
private-docs/method-idea-consolidated.md           ← read §§2, 3, 4 only
```

---

## Step 1: Verify Context File Exists

Check whether `SKILL/contexts/<benchmark>.md` exists.

**If it does not exist**: stop. Do not run extraction without a context file. The context file tells
you what framework profile to expect, which annotation packages to check, what constitutes noise,
and what entry-point patterns to verify after extraction.

To create the context file, follow `SKILL/generate-context/GENERATE-CONTEXT-SKILL.md` using the
template at `resources/templates/monolith-context.md`. Return to this skill once the context file
is written.

**If it exists**: read it fully, then continue to Step 2.

---

## Step 2: Check Tool Availability

Before running the extractor, verify what tools are available. Run these checks from the project root:

```bash
# Check CodeQL
codeql version

# Check tree-sitter (Node.js availability)
node -e "import('tree-sitter').then(m => console.log('tree-sitter OK')).catch(e => console.log('tree-sitter MISSING:', e.message))"

# Check npm dependencies are installed
ls node_modules | grep -E "graphology|fast-xml-parser|globby"
```

**Record the tool status and its extraction implications:**

| Tool | Available | Implication if missing |
|------|-----------|------------------------|
| CodeQL | ? | `call` and `polymorphic_call` edges fall back to static field-type inference. Framework-injected service calls may produce empty chains. Chains will need Phase 2 Mode B reconstruction. |
| tree-sitter | ? | Action-point detection falls back to regex-based scanning. Annotation coverage may be incomplete for complex annotations. |
| graphology / fast-xml-parser / globby | ? | Extractor cannot run at all. Run `npm install` to fix. |

If `graphology`, `fast-xml-parser`, or `globby` are missing, run `npm install` before continuing.

CodeQL and tree-sitter are optional — proceed without them if unavailable, but document the gap.

---

## Step 3: Verify Extractor Configuration for This Benchmark

Read `tools/graph-extractor/extract.mjs` (lines 1–50 approximately) and confirm:

1. `<benchmark>` is listed as a key in the `BENCHMARKS` object with the correct:
   - `path` pointing to `benchmarks/<benchmark>`
   - `framework` profile matching what `SKILL/contexts/<benchmark>.md` describes
   - `javaGlob` that covers the benchmark's Java source root
   - `resourceGlob` that covers config, XML, and properties files

2. The per-app action-point rules in `SKILL/graph/GRAPH_EXTRACTION_PLAN.md` (section
   "Per-App Static Action-Point Rules") match the framework profile in the context file.

**If the benchmark is missing from the BENCHMARKS map**: add it by following the pattern of an
existing benchmark entry. Derive the framework profile from `SKILL/contexts/<benchmark>.md` §2
(Architecture Layers) and the per-app rules from `SKILL/graph/GRAPH_EXTRACTION_PLAN.md`.
Add an npm script to `package.json`: `"graphs:extract:<benchmark>": "node tools/graph-extractor/extract.mjs <benchmark>"`

Do not proceed until the extractor is configured for this benchmark.

---

## Step 4: Run the Extractor

Run the extractor from the project root:

```bash
node tools/graph-extractor/extract.mjs <benchmark>
```

Or if an npm shortcut exists: `npm run graphs:extract:<benchmark>`

The extractor will print a summary line like:
```
<benchmark>: <N> action points, <M> method edges
```

**If the extractor errors out**: read the error message. Common causes:
- Missing npm dependency → run `npm install`
- Wrong `javaGlob` or `resourceGlob` in BENCHMARKS map → fix and re-run
- Source folder not found → verify `benchmarks/<benchmark>/` exists

Do not manually edit files under `analysis/graphs/<benchmark>/`. If the output is wrong,
fix `tools/graph-extractor/extract.mjs` and re-run. See AGENTS.md strict generated-output rule.

---

## Step 5: Verify Required Outputs Exist

After the extractor finishes, check that all required files exist per `SKILL/graph/GRAPH_REQUIREMENTS.md`.

Run a quick structural check:

```bash
ls analysis/graphs/<benchmark>/
ls analysis/graphs/<benchmark>/chains/ | head -5
node -e "
const ap = JSON.parse(require('fs').readFileSync('analysis/graphs/<benchmark>/action-points.json','utf8'));
const idx = JSON.parse(require('fs').readFileSync('analysis/graphs/<benchmark>/chains/index.json','utf8'));
console.log('action points:', Array.isArray(ap) ? ap.length : ap.actionPoints?.length ?? '?');
console.log('chain files:', idx.chains?.length ?? idx.length ?? '?');
console.log('chain count matches AP count:', (idx.chains?.length ?? idx.length) === (Array.isArray(ap) ? ap.length : ap.actionPoints?.length));
"
```

**Required files checklist** (from GRAPH_REQUIREMENTS.md):

- `action-points.json` — exists and has ≥ 1 entry
- `method-graph.json` — exists
- `class-graph.json` — exists
- `data-sources.json` — exists (may be empty for apps with no detectable data sources)
- `chains/index.json` — exists
- `chains/<slug>.json` — one file per action point
- `extraction-report.md` — exists and documents tool availability

If chain count ≠ action-point count, re-run the extractor. This is a hard requirement.

---

## Step 6: Validate Action-Point Detection — Single Sub-agent

Before validating chains, verify that the extractor found **all** expected entry points.
A missed action point means a completely absent chain — Phase 2 cannot reconstruct what Phase 1 never discovered.

Spawn one sub-agent with this prompt:

---
**Sub-agent prompt:**

```
You are verifying that the action-point detection for <BENCHMARK> is complete.

## Read First

1. SKILL/contexts/<BENCHMARK>.md — §4 Action Points by Module (the expected action points)
2. analysis/graphs/<BENCHMARK>/action-points.json — what was actually detected
3. SKILL/graph/GRAPH_EXTRACTION_PLAN.md — per-app action-point rules for <BENCHMARK>
4. SKILL/graph/GRAPH_REQUIREMENTS.md — what action-point records must contain

## Your Task

Compare the expected action points from SKILL/contexts/<BENCHMARK>.md against the detected
action-points.json.

For each expected action point:
- Is it present in action-points.json?
- Does it have the correct classFqn, methodName, routeHint?
- Does its detectionSource indicate the right mechanism (e.g. tree-sitter, config, regex-static)?

Check the action-points.json records for quality:
- Do all entries have stable `id`, `classFqn`, `methodName`, `file`, `line`?
- Are any entries missing required fields?

Read the source files for the benchmark's entry-point classes (from context file §3 Package/Module Map).
Verify no public action methods were missed.

## Output Format

Return a JSON object:

{
  "benchmark": "<benchmark>",
  "expected_count": <N from context file>,
  "detected_count": <N from action-points.json>,
  "missing_action_points": [
    {
      "class_fqn": "...",
      "method_name": "...",
      "route_hint": "...",
      "source_evidence": "<file>:<line>"
    }
  ],
  "malformed_records": [
    { "id": "...", "issue": "..." }
  ],
  "verdict": "complete | incomplete | malformed",
  "notes": "..."
}

Use "complete" only if detected_count >= expected_count and no malformed records.
```

---

**Orchestrator action**: if `verdict` is `incomplete` or `malformed`:
- File a `fix_extractor` note in `extraction-report.md` (do not manually edit action-points.json)
- If missing action points are critical (entry points with major chains), re-configure the extractor
  to find them and re-run before proceeding to chain validation
- If only minor action points are missing (e.g. a static utility method flagged as an action point),
  document and continue

---

## Step 7: Validate Chains — Sub-agent Loop

This is the primary loop. Validate every chain file produced by the extractor.

### 7a. Batch Definition

Group chains by entry-point class (the same grouping used in `SKILL/decomposing/PHASE2-HARDENING-SKILL.md`
Step 1a). Read `analysis/graphs/<benchmark>/chains/index.json` and group by the entry-point's
`classFqn`. Each group = one sub-agent batch.

**Batch size**: 4–8 chains per sub-agent.
If a group has more than 8 action points, split it into two sequential batches.

> **jpetstore-6 example**: 4 batches → AccountActionBean (7), CartActionBean (5), CatalogActionBean (5), OrderActionBean (4)

### 7b. Sub-agent Prompt Template

Each sub-agent receives this prompt. Fill in `<BENCHMARK>`, `<ENTRY_POINT_CLASS>`, and `<CHAIN_FILES>`.

---
**Sub-agent prompt:**

```
You are validating dependency chain files for <BENCHMARK>, <ENTRY_POINT_CLASS> action points.
Follow the validation procedure in SKILL/graph/CHAIN_VALIDATION_SKILL.md exactly.

## Read First (before reading any chain file)

1. SKILL/graph/CHAIN_VALIDATION_SKILL.md — full validation procedure and output format
2. SKILL/contexts/<BENCHMARK>.md — architecture layers, package map, noise catalog
3. analysis/graphs/<BENCHMARK>/extraction-report.md — tool limitations and known gaps
4. analysis/graphs/<BENCHMARK>/action-points.json — all action points for context

Also read the source files for <ENTRY_POINT_CLASS> and the services/mappers it calls.
Derive source paths from SKILL/contexts/<BENCHMARK>.md §3 Package/Module Map.

## Chains to Validate

Validate each of these files using CHAIN_VALIDATION_SKILL.md:

<CHAIN_FILES — list each full path: analysis/graphs/<BENCHMARK>/chains/NNN-name.json>

## Special Flag: Empty Chains

Before applying CHAIN_VALIDATION_SKILL.md validation rules, check each chain's `edges` array and
`reachedNodeCount`. If `edges` is empty AND `reachedNodeCount` ≤ 1, skip the normal validation
steps and classify it directly as:

  verdict: "empty"
  probable_cause: "<why — e.g. Spring @Autowired injection not resolved by static fallback>"
  phase2_action: "Mode B reconstruction required"

Read the entry-point method source to confirm whether the chain should have had edges.

## Output Format

Return one JSON object per chain validated:

[
  {
    "chain_file": "NNN-...",
    "action_point": "<classFqn>#<methodName>",
    "verdict": "valid | partially_valid | invalid | empty",
    "reachedNodeCount": <N>,
    "reachedDataSources": <N>,
    "key_issues": ["..."],
    "probable_cause": "<if partially_valid/invalid/empty>",
    "phase2_action": "none | verify | Mode B reconstruction required | fix_extractor: <description>"
  }
]
```

---

### 7c. Orchestrator Merge

After all batch sub-agents complete, flatten the arrays into one list (one entry per chain).

Count chains by verdict:
- `valid`: chain is trustworthy
- `partially_valid`: usable but Phase 2 should re-verify
- `invalid`: extractor produced wrong output — fix extractor before Phase 2
- `empty`: no edges extracted — Phase 2 must reconstruct from source (Mode B)

Write `analysis/graphs/<benchmark>/phase1-validation-summary.json`:

```json
{
  "benchmark": "<benchmark>",
  "generated": "<ISO date>",
  "tool_status": {
    "codeql": "available | unavailable",
    "tree_sitter": "available | unavailable"
  },
  "action_points": {
    "expected": <N>,
    "detected": <N>,
    "missing": <N>
  },
  "chains": {
    "total": <N>,
    "valid": <N>,
    "partially_valid": <N>,
    "invalid": <N>,
    "empty": <N>
  },
  "phase2_flags": {
    "mode_b_reconstruction": ["NNN-chain-name.json", ...],
    "needs_verify": ["NNN-chain-name.json", ...],
    "fix_extractor": ["<description of fix needed>", ...]
  },
  "per_chain": [ /* full array of per-chain verdict objects from sub-agents */ ]
}
```

Also append a **Phase 1 Validation** section to `analysis/graphs/<benchmark>/extraction-report.md`:

```markdown
## Phase 1 Validation

Performed: <date>

### Tool Status
- CodeQL: <available|unavailable>
- tree-sitter: <available|unavailable>

### Action-Point Detection
- Expected: <N> (from SKILL/contexts/<benchmark>.md)
- Detected: <N>
- Missing: <N> — [list if any]

### Chain Validation Summary
- valid: <N>
- partially_valid: <N>
- invalid: <N>
- empty: <N>

### Chains Flagged for Phase 2 Mode B Reconstruction
<list of chain file names>

### Chains Flagged for Phase 2 Verification
<list of chain file names>
```

---

## Completion Criteria

Phase 1 is complete when:

1. All required output files exist under `analysis/graphs/<benchmark>/` (Step 5 checklist).
2. `phase1-validation-summary.json` exists and covers every chain.
3. `extraction-report.md` has been updated with the Phase 1 Validation section.
4. No `invalid` chains remain unless they are documented with a `fix_extractor` note explaining
   why they cannot be corrected before Phase 2.
5. Empty chains are listed in `phase2_flags.mode_b_reconstruction` so Phase 2 knows what to expect.

**Do not proceed to Phase 2 if:**
- Any action points that are critical entry points (not noise, not edge cases) are missing from
  `action-points.json` and the extractor cannot be quickly fixed to find them.
- The extractor produced chain files that do not match the action-point IDs (malformed index).

---

## Output Artifacts

```
analysis/graphs/<benchmark>/
  action-points.json              ← produced by extractor
  method-graph.json               ← produced by extractor
  class-graph.json                ← produced by extractor
  data-sources.json               ← produced by extractor
  chains/index.json               ← produced by extractor
  chains/<slug>.json × N          ← produced by extractor (one per action point)
  extraction-report.md            ← produced by extractor, UPDATED by Phase 1 validation
  phase1-validation-summary.json  ← produced by this skill (Step 7c)
```

`phase1-validation-summary.json` is the handoff artifact to Phase 2. The Phase 2 skill reads it
to know which chains need Mode B reconstruction and what extractor limitations to expect.
