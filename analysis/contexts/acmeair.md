# Monolith Context: acmeair

> Generated: 2026-05-25  
> Source: `benchmarks/acmeair/`  
> Graph artifacts: `analysis/graphs/acmeair/`

---

## 1. App Identity

- **Purpose**: Airline reservation system — customers search for flights, book and cancel reservations, manage their profile, and authenticate via session tokens. Designed as a cloud-benchmark workload.
- **Build tool**: Gradle
- **Framework**: JAX-RS (Java EE 7) + CDI, with pluggable data-service back ends (MongoDB via Morphia, or IBM WXS)
- **Java version**: Java EE 7 target; no explicit Java version pinned in build.gradle
- **Modules**: 7 — `acmeair-common`, `acmeair-services`, `acmeair-services-morphia`, `acmeair-services-wxs`, `acmeair-webapp`, `acmeair-loader`, `acmeair-reporter`

---

## 2. Architecture Layers

- **REST layer** — JAX-RS resource classes expose HTTP endpoints for bookings, flights, customers, and auth. No business logic; delegates directly to service interfaces.  
  → `acmeair-webapp/src/main/java/com/acmeair/web/`
- **Service interface layer** — CDI-injectable service interfaces define all business operations. Decoupled from the data store.  
  → `acmeair-services/src/main/java/com/acmeair/service/`
- **Service implementation layer** — Two swappable implementations: Morphia (MongoDB) and WXS (IBM WebSphere eXtreme Scale in-memory data grid). Selected at deploy time via CDI.  
  → `acmeair-services-morphia/src/main/java/com/acmeair/morphia/services/`  
  → `acmeair-services-wxs/src/main/java/com/acmeair/wxs/service/`
- **Entity/domain layer** — Shared domain entities used across all modules.  
  → `acmeair-common/src/main/java/com/acmeair/entities/`

---

## 3. Package / Module Map

- `acmeair-common` — Shared domain entities (`Flight`, `FlightSegment`, `Booking`, `Customer`, `CustomerSession`, `AirportCodeMapping`) and service interfaces (`BookingService`, `FlightService`, `CustomerService`, `TransactionService`)
- `acmeair-services` — Service interface contracts + `ServiceLocator`, `KeyGenerator`, `DataService` abstraction
- `acmeair-services-morphia` — MongoDB/Morphia service implementations + MongoDB entity mappings + `MongoConnectionManager`
- `acmeair-services-wxs` — IBM WXS (in-memory data grid) service implementations + WXS session/cache utilities
- `acmeair-webapp` — JAX-RS REST resources (`BookingsREST`, `FlightsREST`, `CustomerREST`, `LoginREST`), admin/config endpoints (`AcmeAirConfiguration`), session filter (`RESTCookieSessionFilter`), and loader trigger (`LoaderREST`)
- `acmeair-loader` — Test data loader (`CustomerLoader`, `FlightLoader`, `Loader`); populates the database for benchmarking runs
- `acmeair-reporter` — JMeter JTL result parser and report generator (`ReportGenerator`, `ResultParser`); test reporting tooling only

---

## 4. Action Points by Module

21 action points total, all in `acmeair-webapp`. All are JAX-RS HTTP handlers (framework: JAX-RS / Java EE 7).

### BookingsREST *(4 action points — all shown)*

- `[HTTP POST] /bookings/bookflights` → `BookingsREST.bookFlights()`
- `[HTTP GET]  /bookings/bybookingnumber/{userid}/{number}` → `BookingsREST.getBookingByNumber()`
- `[HTTP GET]  /bookings/byuser/{userid}` → `BookingsREST.getBookingsByUser()`
- `[HTTP POST] /bookings/cancelbooking` → `BookingsREST.cancelBookingsByNumber()`

### FlightsREST *(2 action points — all shown)*

- `[HTTP POST] /flights/queryflights` → `FlightsREST.getTripFlights()`
- `[HTTP POST] /flights/browseflights` → `FlightsREST.browseFlights()`

### CustomerREST *(2 action points — all shown)*

- `[HTTP GET]  /customer/byid/{userid}` → `CustomerREST.getCustomer()`
- `[HTTP POST] /customer/byid/{userid}` → `CustomerREST.putCustomer()`

### LoginREST *(2 action points — all shown)*

- `[HTTP POST] /login` → `LoginREST.login()`
- `[HTTP GET]  /login/logout` → `LoginREST.logout()`

### AcmeAirConfiguration *(9 action points — all shown)*

- `[HTTP GET] /config/dataServiceInfo` → `AcmeAirConfiguration.getDataServiceInfo()`
- `[HTTP GET] /config/activeDataServiceInfo` → `AcmeAirConfiguration.getActiveDataServiceInfo()`
- `[HTTP GET] /config/runtime` → `AcmeAirConfiguration.getRuntimeInfo()`
- `[HTTP GET] /config/countBookings` → `AcmeAirConfiguration.countBookings()`
- `[HTTP GET] /config/countCustomers` → `AcmeAirConfiguration.countCustomer()`
- `[HTTP GET] /config/countSessions` → `AcmeAirConfiguration.countCustomerSessions()`
- `[HTTP GET] /config/countFlights` → `AcmeAirConfiguration.countFlights()`
- `[HTTP GET] /config/countFlightSegments` → `AcmeAirConfiguration.countFlightSegments()`
- `[HTTP GET] /config/countAirports` → `AcmeAirConfiguration.countAirports()`

### LoaderREST *(2 action points — all shown)*

- `[HTTP GET] /loader/load` → `LoaderREST.loadDB()`
- `[HTTP GET] /loader/query` → `LoaderREST.queryLoader()`

---

## 5. External Boundaries

- **Database**: `mongodb` (via Morphia ODM — primary implementation)
- **Caching**: `wxs` (IBM WebSphere eXtreme Scale — alternative in-memory data grid implementation)
- **Messaging**: none
- **Remote calls**: none

---

## 6. Key Classes

Ranked by degree in the class graph (edges to/from real class nodes). Note: reporter and loader classes have high degree but are noise — see Section 9.

- `service.FlightService` *(degree 18)* — core service interface for flight and flight-segment queries; implemented by both Morphia and WXS modules
- `service.CustomerService` *(degree 17)* — core service interface for customer profile and session management
- `wxs.service.FlightServiceImpl` *(degree 32)* — WXS implementation of FlightService; highest-coupling production class
- `wxs.service.BookingServiceImpl` *(degree 27)* — WXS implementation of BookingService; orchestrates booking creation and cancellation
- `wxs.utils.WXSSessionManager` *(degree 30)* — manages IBM WXS session/cache connections; central infrastructure hub for the WXS path
- `morphia.services.util.MongoConnectionManager` *(degree 19)* — manages MongoDB connections and Morphia datastore; central infrastructure hub for the Morphia path
- `web.BookingsREST` — primary consumer-facing REST resource; orchestrates flight search + booking in one flow
- `web.LoginREST` — issues and validates session tokens consumed by all other REST resources

---

## 7. Domain Vocabulary

- **Aviation**: `Flight`, `FlightSegment`, `AirportCodeMapping` (segment = origin/destination pair; flight = a scheduled instance of a segment)
- **Booking**: `Booking`, `BookingService` (one booking links a customer to one or two flights: outbound + return)
- **Customer**: `Customer`, `CustomerAddress`, `CustomerSession` (session = short-lived auth token after login)
- **Infrastructure**: `DataService`, `TransactionService`, `KeyGenerator`, `ServiceLocator` (pluggability abstractions)

---

## 8. Navigation Guide

- REST endpoints → `acmeair-webapp/src/main/java/com/acmeair/web/`
- Admin/config endpoints → `acmeair-webapp/src/main/java/com/acmeair/config/`
- Session auth filter → `com.acmeair.web.RESTCookieSessionFilter`
- Service interfaces → `acmeair-services/src/main/java/com/acmeair/service/`
- MongoDB implementation → `acmeair-services-morphia/src/main/java/com/acmeair/morphia/`
- WXS implementation → `acmeair-services-wxs/src/main/java/com/acmeair/wxs/`
- Domain entities (shared) → `acmeair-common/src/main/java/com/acmeair/entities/`
- Test data loader → `acmeair-loader/src/main/java/com/acmeair/loader/`

---

## 9. Noise Catalog

- `acmeair-reporter` (entire module) — JMeter JTL result parser and HTML report generator; pure test tooling, no domain logic, must be excluded from decomposition
- `acmeair-loader` (entire module) — populates the database with synthetic test data; dev/test utility, not part of the application runtime
- `com.acmeair.config.AcmeAirConfiguration` — diagnostic/admin REST endpoints (entity counts, runtime info); infrastructure monitoring, not business logic
- `com.acmeair.config.LoaderREST` — REST trigger for the data loader; test tooling surface, not a business operation
- `com.acmeair.web.RESTCookieSessionFilter` — cross-cutting JAX-RS request filter for session token validation; applies globally, carries no domain logic
- `com.acmeair.morphia.BigDecimalConverter` / `BigIntegerConverter` — Morphia type converters; serialization infrastructure
- `com.acmeair.wxs.utils.WXSSessionManager` — IBM WXS connection/cache plumbing; infrastructure concern, not decomposable business logic
