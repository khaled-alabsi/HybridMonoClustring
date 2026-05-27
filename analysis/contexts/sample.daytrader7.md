# Monolith Context: sample.daytrader7

> Generated: 2026-05-27  
> Source: `benchmarks/sample.daytrader7/`  
> Graph artifacts: `analysis/graphs/sample.daytrader7/`

---

## 1. App Identity

- **Purpose**: Enterprise Java stock trading benchmark — traders log in, buy and sell stocks (quotes), manage their portfolio (holdings), and view a live market summary. Designed as a Java EE 7 performance benchmark workload for IBM WebSphere Liberty.
- **Build tool**: Maven
- **Framework**: Java EE 7 — Servlet, JSF, EJB 3, JPA, JMS, WebSocket
- **Java version**: Java EE 7 target; no explicit Java version pinned in pom.xml
- **Modules**: 3 — `daytrader-ee7-ejb` (business logic + entities), `daytrader-ee7-web` (web tier), `daytrader-ee7` (EAR packager, no source)

---

## 2. Architecture Layers

- **JSF / web layer** — JSF managed beans handle user-facing interactions (login, trade, portfolio, config). Servlets handle legacy and scenario-driver paths. Both delegate to `TradeAction`.  
  → `daytrader-ee7-web/src/main/java/com/ibm/websphere/samples/daytrader/web/`  
  → `daytrader-ee7-web/src/main/java/com/ibm/websphere/samples/daytrader/web/jsf/`
- **Business facade layer** — `TradeAction` + `TradeServices` interface act as a single entry point from the web tier into business logic. Routes calls to either the EJB or Direct path.  
  → `daytrader-ee7-ejb/src/main/java/com/ibm/websphere/samples/daytrader/` (TradeAction.java, TradeServices.java)
- **EJB business logic layer** — `TradeSLSBBean` (stateless session bean) implements the full trading operations. `DTBroker3MDB` and `DTStreamer3MDB` handle async order processing via JMS.  
  → `daytrader-ee7-ejb/src/main/java/com/ibm/websphere/samples/daytrader/ejb3/`
- **Direct JDBC layer** — `TradeDirect` is an alternative implementation that bypasses EJB and accesses the DB directly via JDBC; used for performance comparison.  
  → `daytrader-ee7-ejb/src/main/java/com/ibm/websphere/samples/daytrader/direct/`
- **Entity / JPA layer** — JPA entities mapped to the 6 DB tables.  
  → `daytrader-ee7-ejb/src/main/java/com/ibm/websphere/samples/daytrader/entities/`

---

## 3. Package / Module Map

**`daytrader-ee7-ejb`** — EJB module containing all business logic, entities, and utilities:
- `com.ibm.websphere.samples.daytrader` — `TradeAction` (facade), `TradeServices` (interface)
- `com.ibm.websphere.samples.daytrader.ejb3` — `TradeSLSBBean`, `TradeSLSBLocal/Remote`, `DTBroker3MDB`, `DTStreamer3MDB`, `MarketSummarySingleton`
- `com.ibm.websphere.samples.daytrader.direct` — `TradeDirect` (full JDBC impl), `KeySequenceDirect`
- `com.ibm.websphere.samples.daytrader.entities` — JPA entities: `AccountDataBean`, `AccountProfileDataBean`, `HoldingDataBean`, `OrderDataBean`, `QuoteDataBean`
- `com.ibm.websphere.samples.daytrader.beans` — DTOs: `MarketSummaryDataBean`, `RunStatsDataBean`
- `com.ibm.websphere.samples.daytrader.util` — `TradeConfig`, `FinancialUtils`, `Log`, `KeyBlock`, `CompleteOrderThread`

**`daytrader-ee7-web`** — Web module containing web tier and benchmark primitives:
- `com.ibm.websphere.samples.daytrader.web` — `TradeAppServlet`, `TradeScenarioServlet`, `TradeServletAction`, `TradeBuildDB`, `TradeConfigServlet`, `OrdersAlertFilter`
- `com.ibm.websphere.samples.daytrader.web.jsf` — JSF beans: `TradeAppJSF`, `PortfolioJSF`, `QuoteJSF`, `MarketSummaryJSF`, `TradeConfigJSF`, `OrderDataJSF`, `AccountDataJSF`
- `com.ibm.websphere.samples.daytrader.web.websocket` — `MarketSummaryWebSocket` (real-time market push)
- `com.ibm.websphere.samples.daytrader.web.prims` — 38 Ping* benchmark primitive servlets — **noise, see Section 9**

---

## 4. Action Points by Module

90 action points total. 76 belong to 38 Ping* benchmark primitive servlets (noise — see Section 9). The 14 business action points are shown below across 10 classes.

> ⚠ Truncated: 90 total action points found. 38 Ping\* primitive classes (76 action points) omitted — benchmark micro-tests, not business logic.

### TradeAppJSF *(4 action points — all shown)*

- `[HTTP] JSF action → login` → `TradeAppJSF.login()`
- `[HTTP] JSF action → register` → `TradeAppJSF.register()`
- `[HTTP] JSF action → updateProfile` → `TradeAppJSF.updateProfile()`
- `[HTTP] JSF action → logout` → `TradeAppJSF.logout()`

### PortfolioJSF *(1 action point — all shown)*

- `[HTTP] JSF action → sell` → `PortfolioJSF.sell()`

### QuoteJSF *(1 action point — all shown)*

- `[HTTP] JSF action → buy` → `QuoteJSF.buy()`

### TradeAppServlet *(2 action points — all shown)*

- `[HTTP GET]  /trade/*` → `TradeAppServlet.doGet()`
- `[HTTP POST] /trade/*` → `TradeAppServlet.doPost()`

### TradeScenarioServlet *(2 action points — all shown)*

- `[HTTP GET]  /scenario` → `TradeScenarioServlet.doGet()`
- `[HTTP POST] /scenario` → `TradeScenarioServlet.doPost()`

### TradeConfigJSF *(3 action points — all shown)*

- `[HTTP] JSF action → resetTrade` → `TradeConfigJSF.resetTrade()`
- `[HTTP] JSF action → populateDatabase` → `TradeConfigJSF.populateDatabase()`
- `[HTTP] JSF action → buildDatabaseTables` → `TradeConfigJSF.buildDatabaseTables()`

### DTBroker3MDB *(1 action point — all shown)*

- `[MQ] JMS Queue listener` → `DTBroker3MDB.onMessage()` *(async order completion)*

### DTStreamer3MDB *(1 action point — all shown)*

- `[MQ] JMS Topic listener` → `DTStreamer3MDB.onMessage()` *(market data stream)*

---

## 5. External Boundaries

- **Database**: `relational-sql` (via JPA/EJB; also direct JDBC path — 6 tables: `accountejb`, `accountprofileejb`, `holdingejb`, `keygenejb`, `orderejb`, `quoteejb`)
- **Messaging**: `jms` (JMS queue for async order processing via `DTBroker3MDB`; JMS topic for market data streaming via `DTStreamer3MDB`)
- **WebSocket**: `websocket` (market summary push to browser clients via `MarketSummaryWebSocket`)
- **Remote calls**: none

---

## 6. Key Classes

Ranked by degree in the class graph (edges to/from real class nodes):

- `direct.TradeDirect` *(degree 107)* — direct JDBC implementation of all trade operations; highest-degree node; alternative to EJB path, used for raw performance benchmarking
- `ejb3.TradeSLSBBean` *(degree 81)* — stateless session EJB implementing the full trading API (buy, sell, getHoldings, getQuote, login, logout, etc.); primary runtime implementation
- `TradeAction` *(degree 24)* — facade delegating to either `TradeSLSBBean` or `TradeDirect`; the single entry point from the web tier into business logic
- `web.TradeScenarioServlet` *(degree 23)* — drives automated trading scenarios; calls `TradeAction` in loops to simulate load
- `web.websocket.MarketSummaryWebSocket` *(degree 21)* — pushes live market summary updates to browser WebSocket clients
- `web.TradeServletAction` *(degree 19)* — bridges raw HTTP servlet parameters to `TradeAction` calls; handles the servlet-path trade flow
- `direct.KeySequenceDirect` *(degree 17)* — DB-backed primary key generator used across all entities
- `web.TradeBuildDB` *(degree 16)* — populates the database with test accounts, quotes, and holdings

---

## 7. Domain Vocabulary

- **Trading**: `Quote` (stock price snapshot), `Order` (buy/sell transaction), `Holding` (position in a stock), `buy`, `sell`
- **Account**: `Account` (credentials + balance), `AccountProfile` (contact info + preferences)
- **Market**: `MarketSummary`, `TSIA` (Trade Stock Index Average), `openTSIA`
- **Infrastructure**: `KeyGen` (sequence generator), `RunStats`, `TradeConfig`, `CompleteOrderThread`

---

## 8. Navigation Guide

- JSF entry points → `daytrader-ee7-web/src/main/java/.../web/jsf/`
- Servlet entry points → `daytrader-ee7-web/src/main/java/.../web/`
- Business facade (start here) → `daytrader-ee7-ejb/src/main/java/.../TradeAction.java`
- EJB business logic → `daytrader-ee7-ejb/src/main/java/.../ejb3/TradeSLSBBean.java`
- Direct JDBC logic → `daytrader-ee7-ejb/src/main/java/.../direct/TradeDirect.java`
- JPA entities → `daytrader-ee7-ejb/src/main/java/.../entities/`
- Async MDB processors → `daytrader-ee7-ejb/src/main/java/.../ejb3/` (DTBroker3MDB, DTStreamer3MDB)
- WebSocket push → `daytrader-ee7-web/src/main/java/.../web/websocket/MarketSummaryWebSocket.java`
- Financial utilities → `daytrader-ee7-ejb/src/main/java/.../util/FinancialUtils.java`

---

## 9. Noise Catalog

- `web.prims.*` — 38 Ping* benchmark primitive servlets (76 of 90 action points); each isolates a single Java EE feature (JDBC, JMS, session, CDI, async, WebSocket, etc.) for micro-benchmarking; no domain logic whatsoever — must be fully excluded from decomposition
- `web.TestServlet` — catch-all test harness servlet; not a business endpoint
- `web.TradeBuildDB` — DB population utility for test setup; admin tooling, not a runtime business operation
- `TradeConfigJSF` / `TradeConfigServlet` — benchmark administration UI (reset DB, rebuild tables); tooling concern, not domain logic
- `ejb3.MarketSummarySingleton` — EJB singleton caching market summary in memory; infrastructure caching, not decomposable business logic
- `direct.KeySequenceDirect` / `util.KeyBlock` — primary key sequence generator; pure infrastructure plumbing
- `util.Log` — logging utility wrapper; cross-cutting infrastructure
- `util.TradeConfig` — runtime configuration constants (trade mode, order processing mode, etc.); infrastructure, applies globally
