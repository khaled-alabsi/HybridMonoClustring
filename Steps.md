1. Start with these benchmark monoliths in this order:

| Order | Benchmark | Role in evaluation | Git clone URL |
| --- | --- | --- | --- |
| 1 | JPetStore | First end-to-end pipeline proof; small/common baseline benchmark | `https://github.com/mybatis/jpetstore-6.git` |
| 2 | AcmeAir | Realistic REST/service/data benchmark | `https://github.com/acmeair/acmeair.git` |
| 3 | PlantsByWebSphere | Plant-store benchmark used in Mono2Micro-style studies | `https://github.com/WASdev/sample.plantsbywebsphere.git` |
| 4 | DayTrader | Heavier enterprise Java trading benchmark | `https://github.com/WASdev/sample.daytrader7.git` |
| 5 | Cargo Tracker | Domain-rich DDD stress test for hierarchy/tagging | `https://github.com/eclipse-ee4j/cargotracker.git` |

2. Clone them locally under `benchmarks/`.

3. Generate a context file for each monolith under `SKILL/contexts/<benchmark-name>.md`.
   Use the template at `SKILL/generate-context/MONOLITH-CONTEXT-TEMPLATE.md`.
   The context file must give any agent an instant orientation: what the app does, its architecture layers, where key classes live, entry points, data sources, and domain vocabulary — without reading source code.

4. Extract and validate graph for each app, see [SKILL/decomposing/PHASE1-EXTRACTION-SKILL.md](SKILL/decomposing/PHASE1-EXTRACTION-SKILL.md) (also references GRAPH_REQUIREMENTS.md and CHAIN_VALIDATION_SKILL.md)
   
5. Begin with `benchmarks/jpetstore-6`, complete one full decomposition run, then generalize the extraction and scoring pipeline to the remaining benchmarks.

   Full plan: [SKILL/decomposing/decomposition-plan.md](SKILL/decomposing/decomposition-plan.md)

|Phase|Name                                 |Paper §§     | status
|-----|-------------------------------------|-------------|
|1    |Component & Chain Extraction         |§§2–4        | done — 21 chains, class/method graphs, 13 tables extracted (static fallback; CodeQL pending) — skill: [SKILL/decomposing/PHASE1-EXTRACTION-SKILL.md](SKILL/decomposing/PHASE1-EXTRACTION-SKILL.md)
|2    |Graph Hardening & Semantic Enrichment|§§5–8 + §10  | not started — skill: [SKILL/decomposing/PHASE2-HARDENING-SKILL.md](SKILL/decomposing/PHASE2-HARDENING-SKILL.md)
|3    |Skeleton Construction                |§9           | not started
|4    |Initial Decomposition                |§§11–12      | not started
|5    |Scoring                              |§§13–15 + §17| not started
|6    |Iterative Refinement                 |§§16, 18–19  | not started
|7    |Evaluation                           |—            | not started