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
- `benchmarks/` contains vendored open-source monolith benchmark code used for evaluation.
- `private-docs/` contains local draft notes and planning documents that should remain private.

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

## Useful Commands

```bash
git status -sb
find benchmarks -maxdepth 2 -type d -name .git -print
find benchmarks -type f -size +90M -print
```

Use `rg` for searching whenever available.
