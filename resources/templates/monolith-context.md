# Monolith Context: {{APP_NAME}}

> Generated: {{DATE}}  
> Source: `benchmarks/{{BENCHMARK_DIR}}/`  
> Graph artifacts: `analysis/graphs/{{BENCHMARK_DIR}}/`

---

## 1. App Identity

- **Purpose**: {{ONE_OR_TWO_SENTENCE_DESCRIPTION}}
- **Build tool**: {{maven|gradle}}
- **Framework**: {{spring-mvc|jakarta-ee|spring-boot|...}}
- **Java version**: {{JAVA_VERSION}}
- **Modules**: {{NUMBER_OF_MODULES}} ({{list module names}})

---

## 2. Architecture Layers

List layers from top (entry) to bottom (data), with the responsibility of each and where it lives:

- **{{Layer name}}** — {{responsibility}}  
  → `{{package.or.path}}`
- **{{Layer name}}** — {{responsibility}}  
  → `{{package.or.path}}`
- **{{Layer name}}** — {{responsibility}}  
  → `{{package.or.path}}`

---

## 3. Package / Module Map

One entry per top-level package or Maven/Gradle module. Describe its role in one phrase.

- `{{package.or.module}}` — {{role}}
- `{{package.or.module}}` — {{role}}
- `{{package.or.module}}` — {{role}}

---

## 4. Action Points by Module

Capped at **10 modules** (ranked by action-point count) and **10 action points per module**.  
Each entry: `[TYPE] path-or-trigger → ClassName.methodName()`  
Types: `HTTP`, `MQ`, `SCHEDULER`, `CLI`, `EVENT`

### {{Module / Sub-app Name}}

- `[HTTP] {{METHOD}} {{path}}` → `{{Class.method()}}`
- `[HTTP] {{METHOD}} {{path}}` → `{{Class.method()}}`
- `[MQ]   {{trigger}}`         → `{{Class.method()}}`
- `[HTTP] {{METHOD}} {{path}}` → `{{Class.method()}}`
- `[HTTP] {{METHOD}} {{path}}` → `{{Class.method()}}`

### {{Module / Sub-app Name}}

- `[HTTP] {{METHOD}} {{path}}` → `{{Class.method()}}`
- ...

<!-- Repeat up to 10 modules -->

> ⚠ **Truncation notice**: If more than 10 modules exist or any module has more than 10 action points,
> note it here. Example: "14 modules found — showing top 10. Module X had 15 action points — showing 10."

---

## 5. External Boundaries

Only the *type* of each integration — no URLs, table names, or method details.

- **Database**: `{{relational-sql|mongodb|in-memory|...}}`
- **Messaging**: `{{jms|amqp|kafka|...}}` *(omit if none)*
- **Remote calls**: `{{rest-client|soap|grpc|...}}` *(omit if none)*
- **Caching**: `{{redis|wxs|ehcache|...}}` *(omit if none)*
- **Other**: `{{ldap|smtp|file-system|...}}` *(omit if none)*

---

## 6. Key Classes

High-fanout hub nodes from the method/class graph. Format: class name → role.  
List the top 5–10 classes an agent should start from when navigating the codebase.

- `{{ClassName}}` — {{role, e.g. "central service orchestrator for order flow"}}
- `{{ClassName}}` — {{role}}
- `{{ClassName}}` — {{role}}

---

## 7. Domain Vocabulary

Core domain terms extracted from class and method names. Group related terms.

- **{{domain concept}}**: `{{Term1}}`, `{{Term2}}`, `{{Term3}}`
- **{{domain concept}}**: `{{Term1}}`, `{{Term2}}`

---

## 8. Navigation Guide

Quick lookup: where to find what. One bullet per convention.

- `{{pattern or concern}}` → `{{package.path}}` (e.g. "All DAOs → `com.x.dao`")
- `{{pattern or concern}}` → `{{package.path}}`
- `{{pattern or concern}}` → `{{package.path}}`

---

## 9. Noise Catalog

Classes and packages that are **cross-cutting and must be excluded from decomposition reasoning**.  
Include a one-phrase rationale so no agent second-guesses the exclusion.

- `{{package.or.ClassName}}` — {{reason, e.g. "logging utility, no domain logic"}}
- `{{package.or.ClassName}}` — {{reason, e.g. "generic exception mapper, not domain-specific"}}
- `{{package.or.ClassName}}` — {{reason, e.g. "security filter, applies globally"}}
- `{{package.or.ClassName}}` — {{reason, e.g. "properties/config loader, infrastructure concern"}}
- `{{package.or.ClassName}}` — {{reason, e.g. "serialization helper, no business logic"}}
