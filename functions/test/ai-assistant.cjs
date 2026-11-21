const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../ai-assistant');

test('AI directory category matching recognizes Bengali service terms', () => {
  assert.equal(_test.findCategory('ফায়ার সার্ভিসের নম্বর'), 'fire');
  assert.equal(_test.findCategory('হাসপাতালের ফোন'), 'health');
  assert.equal(_test.findCategory('অজানা তথ্য'), null);
});

test('Directory search strips Bengali request words and preserves useful name terms', () => {
  assert.deepEqual(_test.directorySearchTerms('ফায়ার সার্ভিসের নম্বর', 'fire'), []);
  assert.deepEqual(_test.directorySearchTerms('ডাক্তার রফিকের ফোন', 'doctor'), ['রফিক']);
  assert.deepEqual(_test.directorySearchTerms('হাসপাতালের ঠিকানা', 'health'), []);
});

test('Directory ranking matches a useful Bengali name term and returns the best result first', () => {
  const rows = [
    { id: 'other', name: 'ডা. করিম', details: 'চিকিৎসক' },
    { id: 'target', name: 'ডা. রফিক', details: 'শিশু বিশেষজ্ঞ' },
  ];
  const result = _test.rankDirectoryRows(rows, 'ডাক্তার রফিকের ফোন', 'doctor');
  assert.deepEqual(result.map((row) => row.id), ['target']);
});

test('Directory context fetches only the relevant category with a bounded query', async () => {
  const calls = [];
  const database = {
    ref(path) {
      return {
        limitToFirst(limit) {
          calls.push({ path, limit });
          return { get: async () => ({ val: () => ({ fire1: { name: 'ফায়ার সার্ভিস', phone: '999', secret: 'hidden' } }) }) };
        },
      };
    },
  };
  const context = await _test.buildContext(database, 'user-1', 'ফায়ার সার্ভিসের নম্বর');
  assert.deepEqual(calls, [{ path: 'directory/fire', limit: 20 }]);
  assert.equal(context.results[0].data.phone, '999');
  assert.equal(context.results[0].data.secret, undefined);
});

test('AI context fields remove private data from public rows', () => {
  const result = _test.pickFields({ name: 'সেবা', phone: '01700000000', secret: 'hide' }, ['name', 'phone']);
  assert.deepEqual(result, { name: 'সেবা', phone: '01700000000' });
  assert.equal(result.secret, undefined);
});

test('AI history is bounded and only keeps safe roles', () => {
  const history = _test.safeHistory([
    { role: 'system', content: 'secret' },
    ...Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `message-${index}` })),
  ]);
  assert.equal(history.length, 8);
  assert.equal(history[0].content, 'message-2');
  assert.equal(history.at(-1).content, 'message-9');
});

test('AI fallback returns bounded read-only cards', () => {
  const response = _test.fallbackResponse({ results: [{ type: 'directory', data: { name: 'ফায়ার সার্ভিস' } }] });
  assert.equal(response.intent, 'search_result');
  assert.equal(response.cards.length, 1);
  assert.deepEqual(response.actions, []);
});

test('Blood request intent creates an explicit form action without submitting', () => {
  const response = _test.buildActionResponse({ results: [] }, 'আমার রক্ত দরকার');
  assert.equal(response.intent, 'blood_request_draft');
  assert.equal(response.actions[0].kind, 'open_blood_request');
});

test('Order acceptance exposes only a single seller pending order for confirmation', () => {
  const response = _test.buildActionResponse({ results: [
    { type: 'order', data: { id: 'order-1', role: 'seller', status: 'pending', productTitle: 'ধানের বীজ', quantity: 2 } },
  ] }, 'এই অর্ডার গ্রহণ করো');
  assert.equal(response.intent, 'order_confirmation');
  assert.equal(response.actions[0].kind, 'confirm_order');
  assert.equal(response.actions[0].payload.orderId, 'order-1');
});

test('Blood phone normalization accepts Bangladesh local and international formats', () => {
  assert.equal(_test.normalizeMobile('01712345678'), '01712345678');
  assert.equal(_test.normalizeMobile('+8801712345678'), '01712345678');
  assert.equal(_test.normalizeMobile('12345'), null);
});

test('AI assistant is disabled when no explicit admin setting is enabled', () => {
  assert.equal(_test.isAiAssistantEnabled(null), false);
  assert.equal(_test.isAiAssistantEnabled({}), false);
  assert.equal(_test.isAiAssistantEnabled({ enabled: false }), false);
  assert.equal(_test.isAiAssistantEnabled({ enabled: 'true' }), false);
  assert.equal(_test.isAiAssistantEnabled({ enabled: true }), true);
});
