# AGENTS.md

Guidance for coding agents working in this repository.

## Project Purpose

This repository supports research on monolith-to-microservice decomposition, especially a method based on:

- action-point enumeration
- deterministic dependency-chain extraction
- graph hardening and semantic enrichment
- domain-hierarchy-guided clustering
- iterative scoring and refinement

The main method notes live in `private-docs/`. Treat those files as research source material, but remember that `private-docs/` is ignored by Git.

## Repository Layout

- `Steps.md` contains the current practical evaluation plan and benchmark list.
- `benchmarks/` contains vendored open-source monolith benchmark code used for evaluation (see Benchmark Inventory below).
- `analysis/graphs/` mirrors the benchmark list — one subfolder per benchmark — and stores extracted graphs, action points, dependency chains, and extraction reports produced by the pipeline.
- `analysis/contexts/` contains a pre-built orientation file for each benchmark (`<benchmark-name>.md`). **Read this before touching a benchmark's source code.** It covers the app's purpose, architecture layers, package map, entry points, key classes, domain vocabulary, and noise catalog.
- `resources/templates/monolith-context.md` is the template used to create context files.
- `tools/graph-extractor/` contains the extraction script (`extract.mjs`) that processes benchmark source code into graph artifacts.
- `private-docs/` contains local draft notes and planning documents that should remain private.

## Benchmark Inventory

All five benchmarks are vendored under `benchmarks/` as static source snapshots. Each was chosen to stress-test a different aspect of the decomposition method:

- **`jpetstore-6`** — Smallest and simplest benchmark. Used first as an end-to-end proof that the full pipeline works (action-point enumeration → chain extraction → clustering → scoring). Cloned from `https://github.com/mybatis/jpetstore-6.git`.
- **`acmeair`** — Realistic REST + service + data-layer monolith, representative of modern Java web applications. Cloned from `https://github.com/acmeair/acmeair.git`.
- **`sample.plantsbywebsphere`** — Standard benchmark used in Mono2Micro-style decomposition studies; results can be compared against prior work. Cloned from `https://github.com/WASdev/sample.plantsbywebsphere.git`.
- **`sample.daytrader7`** — Heavier enterprise Java trading application; tests pipeline scalability. Cloned from `https://github.com/WASdev/sample.daytrader7.git`.
- **`cargotracker`** — Richest in domain-driven design (DDD) concepts; the primary stress test for the domain-hierarchy and semantic-tagging stages of the method. Cloned from `https://github.com/eclipse-ee4j/cargotracker.git`.

The intended evaluation order is: jpetstore-6 → acmeair → plantsbywebsphere → daytrader7 → cargotracker.

## Benchmark Orientation Protocol

Before reading source code in `benchmarks/<name>/`, always read the matching context file first:

```
analysis/contexts/<benchmark-name>.md
```

The context file tells you what the app does, which packages matter, where to find entry points, which classes are hubs, and which classes are noise to ignore. Reading source code without the context file wastes time and risks misinterpreting noise as domain logic.

If no context file exists yet for a benchmark, create one using `resources/templates/monolith-context.md` before starting any analysis work on that benchmark.

## Benchmark Policy

Benchmark projects under `benchmarks/` are vendored as normal files, not submodules. Do not recreate nested `.git/` folders inside benchmark directories unless the user explicitly asks.

When adding a new benchmark:

1. Add its clone URL and evaluation role to `Steps.md`.
2. Clone it into `benchmarks/`.
3. Remove its nested `.git/` directory before committing if the benchmark should be pushed as repository content.
4. Check for files larger than GitHub's normal file-size limit before committing.

## Editing Guidelines

- Keep changes narrowly scoped to the user's request.
- Do not rewrite benchmark source code unless the task specifically requires experiments or instrumentation.
- Prefer adding extraction scripts, generated graph artifacts, or experiment notes outside the benchmark source trees when possible.
- Do not remove or alter `private-docs/` ignore behavior without explicit user approval.

## Strict Generated-Output Guidelines

Files under `analysis/graphs/` are generated graph artifacts. Do not manually edit these files to fix graph content, chain content, action points, reports, or data-source edges. Manual edits will be overwritten the next time the extractor runs and waste review/debugging time.

When graph output is wrong, fix the generator or its supporting configuration instead:

- Update `tools/graph-extractor/extract.mjs` or other graph-generation tooling.
- Regenerate the relevant benchmark output with the graph extraction command.
- Validate the regenerated chain files against benchmark source code.

Only touch `analysis/graphs/` by running the generator, unless the user explicitly asks for a one-off inspection artifact or manual experiment.

## Useful Commands

```bash
git status -sb
find benchmarks -maxdepth 2 -type d -name .git -print
find benchmarks -type f -size +90M -print
npm run graphs:extract:jpetstore
npm run graphs:extract
```

Use `rg` for searching whenever available.

## Keeping AGENTS.md Up to Date

This file is the primary reference for any coding agent working in this repository. Whenever you make a structural change to the project — adding a benchmark, introducing a new top-level folder, changing a key script, or completing a major pipeline stage — update the relevant section of this file in the same commit or task. Specifically:

- Add new benchmarks to the Benchmark Inventory section with their purpose and clone URL.
- Update the Repository Layout section if new top-level folders or important scripts are added.
- Add new useful commands to the Useful Commands section as they are discovered.
- Revise the Project Purpose section if the method's steps or scope change.

Do not leave AGENTS.md stale. An outdated AGENTS.md misleads future agents and wastes time.

## ⛔ HARD RULE — Keep Context Files Up to Date (NO EXCEPTIONS)

Context files under `analysis/contexts/` are the primary orientation layer for every agent working on a benchmark. They **must** be treated as living documents.

**You are required to update the matching context file whenever you:**

- Discover that a class, package, or module was misclassified (e.g. something listed as noise that has domain logic, or vice versa).
- Find a non-obvious architectural detail that took source-code reading to uncover (e.g. a hidden dependency path, a framework quirk, a dual-implementation pattern, an undocumented entry point).
- Identify a hub class whose role was unclear from the graph alone and had to be confirmed by reading source.
- Confirm or correct a section that was inferred statically and may be wrong (e.g. a route hint that turned out to be inaccurate, a layer description that misses a delegation step).
- Add domain vocabulary terms that were discovered during chain analysis or clustering work.
- Find that a noise entry is more important than labelled, or that a business class should be excluded.

**Do NOT defer these updates.** Update the context file in the same task where you made the discovery. A stale context file will cause the next agent to repeat the same investigation from scratch and potentially reach the wrong conclusion.

**What to add:**

- Hard-won facts that are not obvious from the package structure or class names alone.
- Corrections to sections that were generated from static analysis and later proven wrong.
- Short inline notes explaining *why* something is classified the way it is, when the reason is not self-evident.

**What NOT to add:**

- Information that any agent can trivially infer by looking at the package map or graph (no padding).
- Speculative claims — only write what has been confirmed by source-code reading or test output.

Violating this rule means the next agent starts blind. There are no exceptions.
