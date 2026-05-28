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
  **Servlet dispatch detail:** `TradeAppServlet.doGet/doPost` both funnel to the private `performTask(action)` method, which string-switches on the `action` parameter and calls `TradeServletAction#doWelcome/doLogin/doRegister/doQuotes/doBuy/doSell/doPortfolio/doLogout/doHome`. `TradeServletAction` is the intermediary that unpacks HTTP parameters and calls `TradeAction`. This extra hop is not visible from the action-point list alone.  
  **Scenario driver limit:** `TradeScenarioServlet.performTask` dispatches via `RequestDispatcher.forward()` (not direct method calls), so static chain analysis cannot follow it past the dispatch — chain 009/010 reaches only 22 nodes despite the servlet having degree 23 in the class graph. This is a known extractor limitation, not missing domain logic.
- **Business facade layer** — `TradeAction` + `TradeServices` interface act as a single entry point from the web tier into business logic. Routes calls to either the EJB or Direct implementation at runtime based on `TradeConfig.getRunTimeMode()`. Because both paths are always reachable by static analysis, the graph shows both `TradeSLSBBean` and `TradeDirect` in every chain that passes through `TradeAction`.  
  → `daytrader-ee7-ejb/src/main/java/com/ibm/websphere/samples/daytrader/` (TradeAction.java, TradeServices.java)
- **EJB business logic layer** — `TradeSLSBBean` (stateless session bean) implements the full trading operations. `DTBroker3MDB` and `DTStreamer3MDB` handle async order processing via JMS.  
  → `daytrader-ee7-ejb/src/main/java/com/ibm/websphere/samples/daytrader/ejb3/`
- **Direct JDBC layer** — `TradeDirect` is an alternative implementation that bypasses EJB and accesses the DB directly via JDBC; used for performance comparison. In Direct mode, async order completion uses `CompleteOrderThread` (a `Runnable`) instead of the JMS/MDB path.  
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

98 action points total. 79 are benchmark primitives (Ping\* and ExplicitGC — see Section 9). The remaining 19 span business operations, admin/config tooling, and MDB listeners; these are shown below.

> ⚠ Truncated: 98 total action points found. Ping*, ExplicitGC, and TestServlet chains (79 chains) omitted — benchmark micro-tests, not business logic.

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
- **Messaging**: `jms` (JMS queue for async order processing via `DTBroker3MDB`; JMS topic for market data streaming via `DTStreamer3MDB`). In the EJB-mode async path, after `buy`/`sell` enqueues a JMS message, `DTBroker3MDB.onMessage` picks it up and calls `TradeAction#completeOrder`. In the Direct-mode async path there is no JMS: `CompleteOrderThread` is spawned as a thread and calls `TradeServices#completeOrder` → `TradeDirect` directly.
- **WebSocket**: `websocket` (market summary push to browser clients via `MarketSummaryWebSocket`)
- **Remote calls**: none

---

## 6. Key Classes

Ranked by degree in the class graph (edges to/from real class nodes):

- `direct.TradeDirect` *(degree 85)* — direct JDBC implementation of all trade operations; highest-degree node; alternative to EJB path, used for raw performance benchmarking
- `ejb3.TradeSLSBBean` *(degree 65)* — stateless session EJB implementing the full trading API (buy, sell, getHoldings, getQuote, login, logout, etc.); primary runtime implementation
- `TradeAction` *(degree 22)* — facade delegating to either `TradeSLSBBean` or `TradeDirect` based on `TradeConfig.getRunTimeMode()`; the single entry point from the web tier into business logic
- `web.TradeScenarioServlet` *(degree 23)* — drives automated trading scenarios by forwarding to other servlet paths; note: chain analysis reaches only 22 nodes because `RequestDispatcher.forward()` is not followable by static analysis
- `web.websocket.MarketSummaryWebSocket` *(degree 21)* — pushes live market summary updates to browser WebSocket clients
- `web.TradeServletAction` *(degree 20)* — the hidden intermediary between `TradeAppServlet.performTask` and `TradeAction`; unpacks HTTP request parameters for each operation (doLogin, doBuy, doSell, etc.)
- `direct.KeySequenceDirect` *(degree 17)* — DB-backed primary key generator used across all entities
- `web.TradeBuildDB` *(degree 16)* — populates the database with test accounts, quotes, and holdings
- `util.CompleteOrderThread` *(degree ~6)* — `Runnable` used in Direct mode as the thread-based async order completion path; calls `TradeServices#completeOrder` → `TradeDirect` without JMS

---

## 7. Domain Vocabulary

- **Trading**: `Quote` (stock price snapshot), `Order` (buy/sell transaction), `Holding` (position in a stock), `buy`, `sell`, `completeOrder`, `cancelOrder`, `closedOrders`
- **Account**: `Account` (credentials + balance), `AccountProfile` (contact info + preferences), `login`, `logout`, `register`, `updateAccountProfile`
- **Market**: `MarketSummary`, `TSIA` (Trade Stock Index Average), `openTSIA`, `updateQuotePriceVolume`
- **Infrastructure**: `KeyGen` (sequence generator), `RunStats`, `TradeConfig`, `CompleteOrderThread`, `runTimeMode` (EJB vs Direct switch), `performTask` (servlet dispatch kernel)
- **Java EE terms**: `SLSB` (Stateless Session Bean — `TradeSLSBBean`), `MDB` (Message-Driven Bean — `DTBroker3MDB`, `DTStreamer3MDB`), `RequestDispatcher.forward` (used by TradeScenarioServlet, blocks static analysis)

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

- `web.prims.*` — 38 Ping* benchmark primitive servlets (chains 022–098); each isolates a single Java EE feature (JDBC, JMS, session, CDI, async, WebSocket, etc.) for micro-benchmarking; no domain logic whatsoever — must be fully excluded from decomposition
- `web.prims.ExplicitGC` — triggers `System.gc()` under load; chains 020–021; pure JVM benchmarking, not domain logic
- `web.TestServlet` — catch-all test harness servlet; not a business endpoint
- `web.TradeBuildDB` — DB population utility for test setup; admin tooling, not a runtime business operation
- `TradeConfigJSF` / `TradeConfigServlet` — benchmark administration UI (reset DB, rebuild tables); tooling concern, not domain logic
- `ejb3.MarketSummarySingleton` — EJB singleton caching market summary in memory; infrastructure caching, not decomposable business logic
- `direct.KeySequenceDirect` / `util.KeyBlock` — primary key sequence generator; pure infrastructure plumbing
- `util.Log` — logging utility wrapper; cross-cutting infrastructure
- `util.TradeConfig` — runtime configuration constants (trade mode, order processing mode, etc.); infrastructure, applies globally
- `ejb3.MDBStats` / `ejb3.TimerStat` — metrics/timing beans that appear in MDB chain nodes; pure instrumentation, no domain logic

---

## 10. TradeServices Business API

`TradeServices` is the canonical interface that both `TradeSLSBBean` (EJB path) and `TradeDirect` (JDBC path) must implement. Its 20 methods define the complete business API surface — these are the natural decomposition cut-points:

**Account domain** (touches `accountejb`, `accountprofileejb`):
- `login(userId, password)` — authenticate and return account data
- `logout(userId)` — invalidate session
- `register(userId, password, fullname, address, email, creditcard, openBalance)` — create new account
- `getAccountData(userId)` — fetch account balance and metadata
- `getAccountProfileData(userId)` — fetch contact/preferences profile
- `updateAccountProfile(AccountProfileDataBean)` — update profile

**Trading domain** (touches `accountejb`, `holdingejb`, `orderejb`, `quoteejb`):
- `buy(userId, symbol, quantity, orderProcessingMode)` — place buy order
- `sell(userId, holdingId, orderProcessingMode)` — place sell order
- `completeOrder(orderId, twoPhase)` — finalize a pending order (called by MDB or `CompleteOrderThread`)
- `cancelOrder(orderId, twoPhase)` — cancel a pending order
- `getOrders(userId)` — list all orders for account
- `getClosedOrders(userId)` — list orders with status CLOSED
- `getHolding(holdingId)` — fetch single holding
- `getHoldings(userId)` — fetch all holdings for account

**Market domain** (touches `quoteejb`; read-heavy):
- `getQuote(symbol)` — fetch current price snapshot for one symbol
- `getAllQuotes()` — full quote table scan (used for market summary)
- `createQuote(symbol, companyName, price)` — insert a new quote (admin/init)
- `updateQuotePriceVolume(symbol, newPrice, newVolume)` — update quote after a trade
- `getMarketSummary()` — compute or return cached TSIA / openTSIA

**Admin** (not a microservice candidate):
- `resetTrade(deleteAll)` — wipe and re-initialize the trading database

---

## 11. Operation → Data Scope

Derived from chain analysis. Each row shows which DB tables a request actually reaches (confirmed by `reachedDataSources` in chain files). This is the primary clustering signal.

**Account-only operations** (2 tables: `accountejb`, `accountprofileejb`):
- `TradeAppJSF.login` — 74 nodes, tables: accountejb, accountprofileejb
- `TradeAppJSF.register` — 89 nodes, tables: accountejb, accountprofileejb
- `TradeAppJSF.updateProfile` — 52 nodes, tables: accountejb, accountprofileejb

**Full trading operations** (5 tables):
- `QuoteJSF.buy` — 188 nodes, tables: accountejb, accountprofileejb, holdingejb, orderejb, quoteejb
- `PortfolioJSF.sell` — 193 nodes, tables: accountejb, accountprofileejb, holdingejb, orderejb, quoteejb
- `DTBroker3MDB.onMessage` (async order completion) — 145 nodes, same 5 tables
- `TradeAppServlet.doGet/doPost` — 299 nodes (broadest chain), all 5 tables; includes market-summary + portfolio rendering

**No DB access**:
- `DTStreamer3MDB.onMessage` — 19 nodes, no tables; pure JMS event forwarding, fires CDI event for WebSocket push
- `TradeScenarioServlet.doGet/doPost` — 22 nodes, no tables; chain truncated by `RequestDispatcher.forward()` (see Section 2)

**Implication for decomposition:**
The data-scope boundary naturally suggests three microservice candidates:
1. **Account Service** — login, logout, register, getAccountData, updateAccountProfile → owns `accountejb` + `accountprofileejb`
2. **Trading Service** — buy, sell, completeOrder, cancelOrder, getOrders, getHoldings → owns `holdingejb` + `orderejb`; depends on Account and Market
3. **Market Service** — getQuote, getAllQuotes, updateQuotePriceVolume, getMarketSummary → owns `quoteejb`; feeds WebSocket push via DTStreamer3MDB
