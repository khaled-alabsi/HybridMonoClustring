/**
 * Regression tests for tools/graph-extractor/extract.mjs
 *
 * Run with: node --test tools/graph-extractor/extract.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractCalls, loadBenchmark, extractBenchmark, BENCHMARKS } from './extract.mjs';

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
