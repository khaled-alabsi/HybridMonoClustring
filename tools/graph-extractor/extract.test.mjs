/**
 * Regression tests for tools/graph-extractor/extract.mjs
 *
 * Run with: node --test tools/graph-extractor/extract.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractCalls, parseFields, extractConstructorChainCalls, loadBenchmark, extractBenchmark, BENCHMARKS } from './extract.mjs';

// ---------------------------------------------------------------------------
// Expected reachedDataSources for every jpetstore-6 chain.
// These values were verified by source inspection during chain validation.
// The two entries marked FIX reflect what should be present after the bug fix.
// ---------------------------------------------------------------------------
const EXPECTED_JPETSTORE_CHAINS = {
  // AccountActionBean
  newAccountForm:        [],
  newAccount:            ['table:account', 'table:bannerdata', 'table:product', 'table:profile', 'table:signon'],
  editAccountForm:       [],
  editAccount:           ['table:account', 'table:bannerdata', 'table:product', 'table:profile', 'table:signon'],
  signonForm:            [],
  signon:                ['table:account', 'table:bannerdata', 'table:product', 'table:profile', 'table:signon'],
  signoff:               [],
  // CartActionBean
  addItemToCart:         ['table:inventory', 'table:item', 'table:product'],
  removeItemFromCart:    [],
  updateCartQuantities:  [],
  viewCart:              [],
  checkOut:              [],
  // CatalogActionBean
  viewMain:              [],
  viewCategory:          ['table:category', 'table:product'],
  viewProduct:           ['table:item', 'table:product'],
  viewItem:              ['table:inventory', 'table:item', 'table:product'],
  searchProducts:        ['table:product'],           // FIX: was [] before nested-call fix
  // OrderActionBean
  listOrders:            ['table:orders', 'table:orderstatus'],
  newOrderForm:          [],
  newOrder:              ['table:inventory', 'table:lineitem', 'table:orders', 'table:orderstatus', 'table:sequence'],
  viewOrder:             ['table:inventory', 'table:item', 'table:lineitem', 'table:orders', 'table:orderstatus', 'table:product'], // FIX: was missing lineitem
};

// Integration test: run the full pipeline in-memory and verify all 21 chains.
// This guards against both the two fixed bugs AND regressions in previously-correct chains.
test('integration: all 21 jpetstore-6 chains have correct reachedDataSources', async () => {
  const codeql = { available: false, reason: 'test-stub' };
  const treeSitter = { available: false, reason: 'test-stub' };
  const context = await loadBenchmark('jpetstore-6', BENCHMARKS['jpetstore-6'], codeql, treeSitter);
  const outputs = extractBenchmark(context);

  const chainByMethod = new Map(
    outputs.chains.chains.map((chain) => [chain.actionPoint.methodName, chain]),
  );

  assert.strictEqual(
    outputs.chains.chains.length,
    21,
    `Expected 21 chains, got ${outputs.chains.chains.length}`,
  );

  for (const [methodName, expectedSources] of Object.entries(EXPECTED_JPETSTORE_CHAINS)) {
    const chain = chainByMethod.get(methodName);
    assert.ok(chain, `Missing chain for action method: ${methodName}`);
    assert.deepEqual(
      [...chain.reachedDataSources].sort(),
      [...expectedSources].sort(),
      `${methodName}: reachedDataSources mismatch`,
    );
  }
});

// ---------------------------------------------------------------------------
// Regression: nested call in addAll() argument not detected
// Bug: extractCalls used /\b(\w+)\s*\.\s*(\w+)\s*\(([^)]*)\)/g which stopped
//      at the first ')' found inside the arg list, consuming the inner call's
//      text as part of the outer match's args.  The inner receiver.method( was
//      then never matched.
// Fix: regex changed to /\b(\w+)\s*\.\s*(\w+)\s*\(/ (no closing-paren requirement).
// Affected chain: 017-catalog-action-bean-search-products.json
//   CatalogService#searchProductList called productMapper.searchProductList(...)
//   inside products.addAll(...) — product table was missing from reachedDataSources.
// ---------------------------------------------------------------------------
test('fix: nested call inside addAll() argument is detected (CatalogService#searchProductList)', () => {
  // Exact body of CatalogService#searchProductList in jpetstore-6
  const body = `
    List<Product> products = new ArrayList<>();
    for (String keyword : keywords.split("\\\\s+")) {
      products.addAll(productMapper.searchProductList("%" + keyword.toLowerCase() + "%"));
    }
    return products;
  `;

  const calls = extractCalls(body);
  const pairs = calls.map((c) => `${c.receiver}.${c.method}`);

  // The inner nested call MUST be detected
  assert.ok(
    calls.some((c) => c.receiver === 'productMapper' && c.method === 'searchProductList'),
    `Expected productMapper.searchProductList to be detected. Got: ${pairs.join(', ')}`,
  );
});

// ---------------------------------------------------------------------------
// Regression: nested call in setLineItems() argument not detected
// Affected chain: 021-order-action-bean-view-order.json
//   OrderService#getOrder called lineItemMapper.getLineItemsByOrderId(orderId)
//   inside order.setLineItems(...) — lineitem table was missing from reachedDataSources.
// ---------------------------------------------------------------------------
test('fix: nested call inside setLineItems() argument is detected (OrderService#getOrder)', () => {
  // Exact body of OrderService#getOrder in jpetstore-6
  const body = `
    Order order = orderMapper.getOrder(orderId);
    order.setLineItems(lineItemMapper.getLineItemsByOrderId(orderId));
    order.getLineItems().forEach(lineItem -> {
      Item item = itemMapper.getItem(lineItem.getItemId());
      item.setQuantity(itemMapper.getInventoryQuantity(lineItem.getItemId()));
      lineItem.setItem(item);
    });
    return order;
  `;

  const calls = extractCalls(body);
  const pairs = calls.map((c) => `${c.receiver}.${c.method}`);

  // The inner nested call MUST be detected
  assert.ok(
    calls.some((c) => c.receiver === 'lineItemMapper' && c.method === 'getLineItemsByOrderId'),
    `Expected lineItemMapper.getLineItemsByOrderId to be detected. Got: ${pairs.join(', ')}`,
  );

  // Outer call must still be detected too
  assert.ok(
    calls.some((c) => c.receiver === 'order' && c.method === 'setLineItems'),
    `Expected order.setLineItems to be detected. Got: ${pairs.join(', ')}`,
  );
});

// ---------------------------------------------------------------------------
// Sanity: simple (non-nested) calls still work after the regex change
// ---------------------------------------------------------------------------
test('sanity: simple non-nested calls are still detected', () => {
  const body = `
    Account account = accountService.getAccount(username);
    catalogService.getProductListByCategory(account.getFavouriteCategoryId());
    return new ForwardResolution(ACCOUNT_FORM);
  `;

  const calls = extractCalls(body);

  assert.ok(
    calls.some((c) => c.receiver === 'accountService' && c.method === 'getAccount'),
    'Expected accountService.getAccount',
  );
  assert.ok(
    calls.some((c) => c.receiver === 'catalogService' && c.method === 'getProductListByCategory'),
    'Expected catalogService.getProductListByCategory',
  );
  assert.ok(
    calls.some((c) => c.receiver === 'account' && c.method === 'getFavouriteCategoryId'),
    'Expected account.getFavouriteCategoryId',
  );
});

// ---------------------------------------------------------------------------
// Regression: parseFields incorrectly reads "return" as a field type on CRLF
// files. The fieldPattern uses multiline mode which treats \r as a line
// terminator, allowing "return trade;" to be matched as type="return" name="trade"
// when the \r\n empty-line case causes the line-context extraction to produce
// an empty string (lineStart > lineEnd), bypassing the keyword filter.
// Fix: added !/^[A-Z]/.test(fieldType) guard — Java reference types must start
// with an uppercase letter, so primitives and keywords are safely excluded.
// Affected benchmark: sample.daytrader7 DTBroker3MDB.java
//   fields['trade'] was 'return' instead of 'TradeServices', causing
//   DTBroker3MDB#onMessage chain to reach no data sources ([]) instead of
//   the 5 expected trading tables.
// ---------------------------------------------------------------------------
test('fix: parseFields handles CRLF line endings - does not map "trade" to "return"', () => {
  // Reproduces the exact CRLF pattern in DTBroker3MDB.java
  const classText = [
    'public class DTBroker3MDB {',
    '    @EJB',
    '    private TradeSLSBLocal tradeSLSB;',
    '',
    '    public void onMessage(Message message) {',
    '        TradeServices trade = null;',
    '        try {',
    '            trade = getTrade(false);',
    '            trade.completeOrder(1, true);',
    '        } catch (Exception e) {}',
    '    }',
    '',
    '    private TradeServices getTrade(boolean direct) throws Exception {',
    '        TradeServices trade;',
    '        if (direct) {',
    '            trade = new TradeDirect();',
    '        } else {',
    '            trade = tradeSLSB;',
    '        }',
    '        return trade;',
    '    }',
    '}',
  ].join('\r\n'); // CRLF line endings (Windows)

  const fields = parseFields(classText);

  assert.strictEqual(
    fields['trade'],
    'TradeServices',
    `fields['trade'] should be 'TradeServices', got '${fields['trade']}'`,
  );
  assert.strictEqual(fields['tradeSLSB'], 'TradeSLSBLocal');
});

// ---------------------------------------------------------------------------
// Expected reachedDataSources for key DayTrader business chains.
// These values were verified by source inspection during chain validation.
// Chains marked CORRECT-EMPTY legitimately reach no data sources.
// ---------------------------------------------------------------------------
const EXPECTED_DAYTRADER_BUSINESS_CHAINS = [
  // DTBroker3MDB: completes orders → all 5 trading tables (FIX: was [] before CRLF fix)
  { class: 'DTBroker3MDB',          method: 'onMessage',           tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:orderejb','table:quoteejb'] },
  // DTStreamer3MDB: fires CDI events only, no DB access (CORRECT-EMPTY)
  { class: 'DTStreamer3MDB',         method: 'onMessage',           tables: [] },
  // MarketSummarySingleton: queries quoteejb via JPA Criteria API (FIX: was [] before criteriaQuery fix)
  { class: 'MarketSummarySingleton', method: 'updateMarketSummary', tables: ['table:quoteejb'] },
  // TestServlet: creates test quotes via new TradeAction().createQuote() → all 5 tables (FIX: was [] before constructor-chain fix)
  { class: 'TestServlet',           method: 'doGet',               tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:orderejb','table:quoteejb'] },
  { class: 'TestServlet',           method: 'doPost',              tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:orderejb','table:quoteejb'] },
  // TradeAppServlet: handles all trading operations
  { class: 'TradeAppServlet',        method: 'doGet',               tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:orderejb','table:quoteejb'] },
  { class: 'TradeAppServlet',        method: 'doPost',              tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:orderejb','table:quoteejb'] },
  // TradeScenarioServlet: dispatches via RequestDispatcher, no direct DB (CORRECT-EMPTY)
  { class: 'TradeScenarioServlet',   method: 'doGet',               tables: [] },
  { class: 'TradeScenarioServlet',   method: 'doPost',              tables: [] },
  // JSF beans
  { class: 'PortfolioJSF',          method: 'sell',                tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:orderejb','table:quoteejb'] },
  { class: 'QuoteJSF',              method: 'buy',                 tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:orderejb','table:quoteejb'] },
  { class: 'TradeAppJSF',           method: 'login',               tables: ['table:accountejb','table:accountprofileejb'] },
  { class: 'TradeAppJSF',           method: 'register',            tables: ['table:accountejb','table:accountprofileejb'] },
  { class: 'TradeAppJSF',           method: 'updateProfile',       tables: ['table:accountejb','table:accountprofileejb'] },
  { class: 'TradeAppJSF',           method: 'logout',              tables: ['table:accountejb','table:accountprofileejb'] },
  // Admin operations touch all 6 tables
  { class: 'TradeConfigJSF',        method: 'resetTrade',          tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:keygenejb','table:orderejb','table:quoteejb'] },
  { class: 'TradeConfigJSF',        method: 'populateDatabase',    tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:keygenejb','table:orderejb','table:quoteejb'] },
  { class: 'TradeConfigJSF',        method: 'buildDatabaseTables', tables: ['table:accountejb','table:accountprofileejb','table:holdingejb','table:keygenejb','table:orderejb','table:quoteejb'] },
];

// Integration test: run the full pipeline in-memory and verify 16 key business chains.
// Guards against regression in extractConstructorChainCalls: new X().method() pattern.
test('fix: extractConstructorChainCalls detects method call chained on constructor result', () => {
  // Covers: new TradeAction().createQuote("s:" + i, ...) — the pattern used by TestServlet#performTask
  const body = `
    for (int i = 1; i <= 10; i++) {
      AccountDataBean a = new TradeAction().createQuote("s:" + i, "Company " + i, new BigDecimal(i * 1.1));
      out.println(a.toString());
    }
  `;
  const calls = extractConstructorChainCalls(body);
  // Should detect TradeAction().createQuote — constructor with no args
  const tradeActionCall = calls.find((c) => c.className === 'TradeAction' && c.method === 'createQuote');
  assert.ok(tradeActionCall, 'Should detect new TradeAction().createQuote(...)');
  // Should NOT create a false detection for BigDecimal (no chained call after it)
  const bigDecimalCall = calls.find((c) => c.className === 'BigDecimal');
  assert.ok(!bigDecimalCall, 'Should not detect new BigDecimal(...) as chained call (no method after it)');
});

// Guards against regressions in any of the three fixed extractor bugs for DayTrader.
test('integration: daytrader key business chains have correct reachedDataSources', async () => {
  const codeql = { available: false, reason: 'test-stub' };
  const treeSitter = { available: false, reason: 'test-stub' };
  const context = await loadBenchmark('sample.daytrader7', BENCHMARKS['sample.daytrader7'], codeql, treeSitter);
  const outputs = extractBenchmark(context);

  const chainByClassMethod = new Map(
    outputs.chains.chains.map((chain) => [
      `${chain.actionPoint.className}#${chain.actionPoint.methodName}`,
      chain,
    ]),
  );

  for (const { class: cls, method, tables } of EXPECTED_DAYTRADER_BUSINESS_CHAINS) {
    const key = `${cls}#${method}`;
    const chain = chainByClassMethod.get(key);
    assert.ok(chain, `Missing chain for: ${key}`);
    assert.deepEqual(
      [...chain.reachedDataSources].sort(),
      [...tables].sort(),
      `${key}: reachedDataSources mismatch`,
    );
  }
});
