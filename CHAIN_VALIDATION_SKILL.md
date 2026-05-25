# Chain Validation Skill

## Purpose

Use this skill when validating whether a generated chain file under `analysis/graphs/<benchmark>/chains/` is supported by the benchmark source code.

The goal is not to prove perfect runtime behavior. The goal is to verify that every node and edge in the chain has a reasonable static source-code or configuration basis, and that missing or suspicious links are reported clearly.

Validation must explicitly check for both:

- false positives (FP): nodes or edges included in the chain that are not supported by source/config evidence
- false negatives (FN): nodes or edges missing from the chain even though source/config evidence shows they should be present

## Inputs

Required input:

- one chain file, for example:

```text
analysis/graphs/acmeair/chains/004-acme-air-configuration-count-bookings.json
```

Related files to inspect:

- `analysis/graphs/<benchmark>/action-points.json`
- `analysis/graphs/<benchmark>/method-graph.json`
- `analysis/graphs/<benchmark>/class-graph.json`
- `analysis/graphs/<benchmark>/data-sources.json`
- `analysis/graphs/<benchmark>/extraction-report.md`
- source files under `benchmarks/<benchmark>/`

## Validation Output

Produce a short validation report with this structure:

```text
Chain: <chain file>
Verdict: valid | partially valid | invalid

Action point:
- ...

Validated edges:
- ...

Suspicious edges:
- ...

False positives:
- ...

Missing expected edges:
- ...

False negatives:
- ...

Source evidence:
- ...
```

Use `valid` only when the action point, all important call edges, and all data-source edges are statically supported.

Use `partially valid` when the chain starts correctly but has unresolved calls, weak fallback edges, missing data-source links, or ambiguous polymorphic targets.

Use `invalid` when the chain starts from the wrong action point, references methods/classes that do not exist, or contains major unsupported edges.

Verdict guidance:

- `valid`: no material FP or FN found.
- `partially valid`: minor FP/FN found, or uncertainty remains because static evidence is ambiguous.
- `invalid`: major FP/FN found, such as wrong root action point, unsupported data-source reachability, or missing a clearly required service/data-source branch.

## Step 1: Identify the Benchmark and Action Point

Open the chain JSON and read:

- `actionPoint.classFqn`
- `actionPoint.methodName`
- `actionPoint.file`
- `actionPoint.line`
- `rootMethodId`
- `reachedDataSources`

Then open the source file named by `actionPoint.file`.

Check:

- the class exists
- the method exists
- the method is a plausible action point for that framework
- the line number is close to the method declaration
- action annotations or framework conventions match the benchmark profile

Examples:

- JPetStore: `*ActionBean` public action method, optionally `@DefaultHandler`
- AcmeAir: JAX-RS `@Path` plus `@GET`, `@POST`, etc.
- PlantsByWebSphere: `@WebServlet`, JSF/CDI `@Named`, or web-facing bean
- DayTrader: servlet method, JSF/CDI bean, EJB schedule, or message-driven bean
- Cargo Tracker: JAX-RS resource, JSF/CDI bean, scheduled method, batch job, or message consumer

## Step 2: Validate Every Edge

For every edge in `edges` and every path in `paths`, check the edge according to its `type`.

An edge is a potential FP until source/config evidence supports it.

### `call`

Validate that the source method body contains a call matching the edge target.

Check:

- `fromNode.file`
- `fromNode.methodName`
- `toNode.className`
- `toNode.methodName`
- `callSite`

The call is supported if the source method contains a matching receiver/method call, for example:

```java
bs.count()
catalogService.getItem(itemId)
orderService.insertOrder(order)
```

If the receiver type is a field, constructor parameter, or injected service, verify the field type.

### `polymorphic_call`

Validate that the edge connects an interface or superclass method to a plausible implementation method.

Check:

- target implementation class exists
- implementation class `implements` or `extends` the source type
- implementation method exists
- method names match

Mark as suspicious if multiple implementations exist and the chain does not explain which one is active.

For AcmeAir, multiple data-service implementations such as Morphia and WXS may both appear. That is acceptable only if the report treats them as alternative static possibilities.

If an implementation class does not implement or extend the source type, mark the `polymorphic_call` as FP.

### `data_access`

Validate that the source method or mapper/config indicates access to the data source.

For relational/MyBatis:

- inspect mapper XML
- verify statement id
- verify SQL operation
- verify table names

For JPA:

- inspect entity annotations such as `@Entity`, `@Table`, `@NamedQuery`, `@NamedNativeQuery`
- verify repository/DAO method reaches entity or query

For external endpoints:

- verify the source method touches a static resource type such as `Datastore`, `MongoClient`, `ObjectGrid`, `ObjectMap`, queue/session/client, or configured endpoint
- verify the external endpoint exists in `data-sources.json`

### `entity_table`

Validate that the entity class exists and has a reasonable table mapping.

Check:

- `@Entity`
- `@Table(name = "...")`, if present
- fallback table name based on class name, if no explicit table exists

### Framework/Config Edges

For these edge types:

- `config_route`
- `injection`
- `framework_entry`
- `scheduled_trigger`
- `message_trigger`
- `batch_trigger`

Validate against annotations or config files:

- `web.xml`
- Spring XML
- JSF config
- MyBatis XML
- JPA persistence XML
- server XML
- batch job XML
- annotations such as `@WebServlet`, `@Path`, `@Schedule`, `@MessageDriven`, `@Named`, `@Inject`

## Step 3: Validate Path Continuity

Each path in `paths` must be continuous:

- first `nodeIds[0]` equals `rootMethodId`
- for every edge, `edge.from` equals the previous node
- for every edge, `edge.to` equals the next node
- final node should be a terminal method, unresolved node, table, queue, or external endpoint

If path continuity is broken, the chain is invalid.

## Step 4: Check Completeness

A chain is incomplete if:

- the action method clearly calls a service but the service call is missing
- a service clearly calls a mapper/repository/datastore but the data-source edge is missing
- the chain stops at an interface even though a static implementation is visible
- a data-source node exists in `data-sources.json` but is not reached from a relevant chain
- the chain only contains the action point but the source method has downstream calls

Mark these as `Missing expected edges`.

Every missing expected edge is a potential FN. Classify it as FN when the source/config evidence is clear enough that the extractor should have included it.

## Step 5: Check Overreach

A chain may overreach if:

- it includes unrelated implementations
- it follows utility/logging/framework calls as business dependencies
- it includes every possible implementation without marking them as alternatives
- it treats UI rendering helpers as data-source dependencies
- it reaches data sources that the action method cannot plausibly trigger

Mark these as `Suspicious edges`.

Every suspicious unsupported edge is a potential FP. Classify it as FP when source/config evidence does not justify the node or edge.

## Step 6: False Positive Review

Review all included nodes and edges for FP.

Mark a node or edge as FP when:

- the referenced class, method, table, queue, or endpoint does not exist
- `from` or `to` points to the wrong class or method
- the source method does not contain the claimed call
- the receiver field type does not match the target class
- a `polymorphic_call` points to an unrelated implementation
- a data-source edge points to a table/endpoint not touched by the source method, mapper, entity, or config
- a framework/config edge is not supported by annotation/config evidence
- utility/logging/UI/rendering behavior is treated as a business/data dependency without justification

For each FP, report:

- edge id or node id
- why it is unsupported
- expected correction, if obvious
- source files inspected

Example:

```text
False positives:
- Edge `polymorphic_call:X->Y` appears unsupported: `Y` does not implement or extend `X`'s declaring type.
```

## Step 7: False Negative Review

Review the source method and downstream methods for missing nodes or edges.

Mark a missing node or edge as FN when:

- the action method has a direct service/DAO/mapper/datastore call missing from the chain
- the chain stops at an interface while a static implementation is visible
- a service implementation calls another service/repository/mapper/datastore that is missing
- a mapper XML statement clearly touches a table missing from the chain
- an entity/table relation is visible but missing
- config maps a route, servlet, batch job, schedule, message listener, or injection relation that should connect to the chain
- a data-source endpoint is used by the chain but absent from `reachedDataSources`

For each FN, report:

- missing edge or node
- evidence proving it should be present
- likely extractor rule needed

Example:

```text
False negatives:
- Missing data edge from `BookingServiceImpl#count` to `external_endpoint:mongodb`; method calls `datastore.find(...)`.
```

## Step 8: Source Evidence Rules

When reporting evidence:

- cite file paths and line numbers
- quote only very short code snippets
- prefer summaries over long pasted source
- mention whether evidence came from Java source, XML, SQL, annotations, or generated graph metadata

Example evidence item:

```text
- benchmarks/acmeair/acmeair-webapp/src/main/java/com/acmeair/config/AcmeAirConfiguration.java:133 calls `bs.count()`, supporting the edge to `BookingService#count`.
```

## Step 9: Common Validation Commands

Use `rg` first:

```bash
rg -n "class AcmeAirConfiguration|countBookings|bs\\.count" benchmarks/acmeair
rg -n "class BookingServiceImpl|Long count\\(" benchmarks/acmeair
rg -n "Datastore|ObjectGrid|ObjectMap|MongoClient" benchmarks/acmeair
```

Inspect a chain quickly:

```bash
node -e "const c=require('./analysis/graphs/acmeair/chains/004-acme-air-configuration-count-bookings.json'); console.log(c.actionPoint); console.log(c.reachedDataSources);"
```

Check path continuity:

```bash
node - <<'NODE'
const c = require('./analysis/graphs/acmeair/chains/004-acme-air-configuration-count-bookings.json');
for (const p of c.paths) {
  let ok = p.nodeIds[0] === c.rootMethodId;
  for (let i = 0; i < p.edges.length; i++) {
    ok &&= p.edges[i].from === p.nodeIds[i];
    ok &&= p.edges[i].to === p.nodeIds[i + 1];
  }
  console.log(ok ? 'ok' : 'broken', p.nodeIds);
}
NODE
```

Find likely FNs by comparing method calls in source to chain edges:

```bash
rg -n "countBookings|bs\\.count|customerService\\.|flightService\\.|datastore\\.|getMap\\(" benchmarks/acmeair
node - <<'NODE'
const c = require('./analysis/graphs/acmeair/chains/004-acme-air-configuration-count-bookings.json');
console.log(c.edges.map(e => `${e.type}: ${e.from} -> ${e.to}`));
NODE
```

Find likely FPs by checking that every referenced class/method exists:

```bash
node - <<'NODE'
const c = require('./analysis/graphs/acmeair/chains/004-acme-air-configuration-count-bookings.json');
for (const n of c.nodes) {
  if (n.file) console.log(n.id, n.file, n.line ?? '');
}
NODE
```

## Important Constraints

- Do not run the monolith application.
- Do not mutate benchmark source files.
- Do not silently fix generated chains during validation.
- Report validation findings separately from extractor fixes.
- If a chain is wrong, describe the smallest extractor rule needed to fix it.
