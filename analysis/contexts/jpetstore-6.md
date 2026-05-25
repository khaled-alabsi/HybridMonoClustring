# Monolith Context: jpetstore-6

> Generated: 2026-05-25  
> Source: `benchmarks/jpetstore-6/`  
> Graph artifacts: `analysis/graphs/jpetstore-6/`

---

## 1. App Identity

- **Purpose**: Classic online pet store — users browse a catalog of animals by category and product, manage a shopping cart, place orders, and maintain their account profile.
- **Build tool**: Maven
- **Framework**: Stripes (MVC) + Spring (DI) + MyBatis (SQL mapping)
- **Java version**: 17
- **Modules**: 1 (single Maven module — `jpetstore-6`)

---

## 2. Architecture Layers

- **Web layer** — Stripes `ActionBean` classes handle HTTP requests, hold form state, and delegate to services. No business logic here.  
  → `org.mybatis.jpetstore.web.actions`
- **Service layer** — Plain Spring beans contain all business logic and coordinate mapper calls.  
  → `org.mybatis.jpetstore.service`
- **Mapper layer** — MyBatis mapper interfaces + XML maps provide typed SQL access to the database. No logic beyond queries.  
  → `org.mybatis.jpetstore.mapper` (interfaces) · `src/main/resources/org/mybatis/jpetstore/mapper/` (XML)
- **Domain layer** — Plain Java entities carry data between layers. `Cart` is in-memory only (session-scoped); all others are persisted.  
  → `org.mybatis.jpetstore.domain`

---

## 3. Package / Module Map

- `org.mybatis.jpetstore.web.actions` — Stripes ActionBeans: web entry points for Account, Cart, Catalog, and Order flows
- `org.mybatis.jpetstore.service` — Business services: `AccountService`, `CatalogService`, `OrderService`
- `org.mybatis.jpetstore.mapper` — MyBatis mapper interfaces: `AccountMapper`, `CategoryMapper`, `ItemMapper`, `LineItemMapper`, `OrderMapper`, `ProductMapper`, `SequenceMapper`
- `org.mybatis.jpetstore.domain` — Domain entities: `Account`, `Cart`, `CartItem`, `Category`, `Item`, `LineItem`, `Order`, `Product`, `Sequence`
- `src/main/resources/org/mybatis/jpetstore/mapper/` — MyBatis XML SQL maps (one per mapper interface)
- `src/main/webapp/` — JSP views and static resources; no business logic

---

## 4. Action Points by Module

21 action points total across 4 ActionBeans. All are Stripes HTTP handlers (framework: Stripes).

### AccountActionBean *(7 action points — all shown)*

- `[HTTP] /actions/Account.action?newAccountForm` → `AccountActionBean.newAccountForm()`
- `[HTTP] /actions/Account.action?newAccount` → `AccountActionBean.newAccount()`
- `[HTTP] /actions/Account.action?editAccountForm` → `AccountActionBean.editAccountForm()`
- `[HTTP] /actions/Account.action?editAccount` → `AccountActionBean.editAccount()`
- `[HTTP] /actions/Account.action?signonForm` → `AccountActionBean.signonForm()` *(default handler)*
- `[HTTP] /actions/Account.action?signon` → `AccountActionBean.signon()`
- `[HTTP] /actions/Account.action?signoff` → `AccountActionBean.signoff()`

### CartActionBean *(5 action points — all shown)*

- `[HTTP] /actions/Cart.action?addItemToCart` → `CartActionBean.addItemToCart()`
- `[HTTP] /actions/Cart.action?removeItemFromCart` → `CartActionBean.removeItemFromCart()`
- `[HTTP] /actions/Cart.action?updateCartQuantities` → `CartActionBean.updateCartQuantities()`
- `[HTTP] /actions/Cart.action?viewCart` → `CartActionBean.viewCart()`
- `[HTTP] /actions/Cart.action?checkOut` → `CartActionBean.checkOut()`

### CatalogActionBean *(5 action points — all shown)*

- `[HTTP] /actions/Catalog.action?viewMain` → `CatalogActionBean.viewMain()` *(default handler)*
- `[HTTP] /actions/Catalog.action?viewCategory` → `CatalogActionBean.viewCategory()`
- `[HTTP] /actions/Catalog.action?viewProduct` → `CatalogActionBean.viewProduct()`
- `[HTTP] /actions/Catalog.action?viewItem` → `CatalogActionBean.viewItem()`
- `[HTTP] /actions/Catalog.action?searchProducts` → `CatalogActionBean.searchProducts()`

### OrderActionBean *(4 action points — all shown)*

- `[HTTP] /actions/Order.action?listOrders` → `OrderActionBean.listOrders()`
- `[HTTP] /actions/Order.action?newOrderForm` → `OrderActionBean.newOrderForm()`
- `[HTTP] /actions/Order.action?newOrder` → `OrderActionBean.newOrder()`
- `[HTTP] /actions/Order.action?viewOrder` → `OrderActionBean.viewOrder()`

---

## 5. External Boundaries

- **Database**: `relational-sql` (accessed via MyBatis; 13 tables: `account`, `bannerdata`, `category`, `inventory`, `item`, `lineitem`, `orders`, `orderstatus`, `product`, `profile`, `sequence`, `signin`, `supplier`)
- **Messaging**: none
- **Remote calls**: none
- **Caching**: none

---

## 6. Key Classes

Ranked by degree in the class graph (edges to/from real class nodes):

- `domain.Cart` *(degree 12)* — in-memory session-scoped shopping cart; central hub for cart operations
- `service.OrderService` *(degree 12)* — orchestrates order creation, line-item assembly, and inventory update; highest-coupling service
- `service.CatalogService` *(degree 8)* — drives category/product/item browsing and search; called by both Catalog and Cart flows
- `web.actions.CartActionBean` *(degree 7)* — web entry point for all cart operations; bridges Cart domain with CatalogService
- `domain.Order` *(degree 6)* — core order entity; aggregates `LineItem` list and shipping/billing details
- `web.actions.AccountActionBean` *(degree 4)* — handles login, logout, registration, and profile editing
- `web.actions.OrderActionBean` *(degree 4)* — handles order placement and history viewing
- `domain.Item` *(degree 3)* — leaf-level catalog entity (SKU); referenced by Cart, CartItem, and LineItem

---

## 7. Domain Vocabulary

- **Catalog**: `Category`, `Product`, `Item` (three-level hierarchy: category → product → item/SKU)
- **Shopping**: `Cart`, `CartItem` (session-scoped; not persisted)
- **Commerce**: `Order`, `LineItem`, `Sequence` (persisted; Sequence generates order IDs)
- **Account**: `Account`, `Profile` (profile holds display preferences like language and banner)

---

## 8. Navigation Guide

- Web entry points (ActionBeans) → `org.mybatis.jpetstore.web.actions`
- Business logic → `org.mybatis.jpetstore.service`
- SQL queries (MyBatis interfaces) → `org.mybatis.jpetstore.mapper`
- SQL maps (XML) → `src/main/resources/org/mybatis/jpetstore/mapper/`
- Domain entities → `org.mybatis.jpetstore.domain`
- JSP views → `src/main/webapp/WEB-INF/`
- Spring wiring → `src/main/resources/spring-*.xml`

---

## 9. Noise Catalog

- `domain.Sequence` / `mapper.SequenceMapper` — database sequence generator for order ID auto-increment; pure infrastructure, no domain logic
- `domain.CartItem` — thin wrapper around `Item` with a quantity field; exists only to support `Cart` in-memory structure, carries no independent domain logic
- JSP files under `src/main/webapp/` — view templates only; no business logic, excluded from graph analysis
- `bannerdata` table / banner-related fields on `Account` — UI personalization (ad banner per category); irrelevant to decomposition boundaries
