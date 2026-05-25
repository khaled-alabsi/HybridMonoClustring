1. Start with these benchmark monoliths in this order:

| Order | Benchmark | Role in evaluation | Git clone URL |
| --- | --- | --- | --- |
| 1 | JPetStore | First end-to-end pipeline proof; small/common baseline benchmark | `https://github.com/mybatis/jpetstore-6.git` |
| 2 | AcmeAir | Realistic REST/service/data benchmark | `https://github.com/acmeair/acmeair.git` |
| 3 | PlantsByWebSphere | Plant-store benchmark used in Mono2Micro-style studies | `https://github.com/WASdev/sample.plantsbywebsphere.git` |
| 4 | DayTrader | Heavier enterprise Java trading benchmark | `https://github.com/WASdev/sample.daytrader7.git` |
| 5 | Cargo Tracker | Domain-rich DDD stress test for hierarchy/tagging | `https://github.com/eclipse-ee4j/cargotracker.git` |

2. Clone them locally under `benchmarks/`.

3. Begin with `benchmarks/jpetstore-6`, complete one full decomposition run, then generalize the extraction and scoring pipeline to the remaining benchmarks.
