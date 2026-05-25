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
