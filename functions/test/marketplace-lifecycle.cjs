'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canTransition, deriveGroupStatus, normalizeStatus } = require('../marketplace-lifecycle');

test('allows only forward seller transitions and pending buyer cancellation', () => {
  assert.equal(canTransition('pending', 'accepted'), true);
  assert.equal(canTransition('pending', 'cancelled'), true);
  assert.equal(canTransition('accepted', 'preparing'), true);
  assert.equal(canTransition('preparing', 'shipped'), true);
  assert.equal(canTransition('shipped', 'delivered'), true);
  assert.equal(canTransition('delivered', 'pending'), false);
  assert.equal(canTransition('shipped', 'cancelled'), false);
});

test('derives mixed group status without exposing a seller order as completed too early', () => {
  assert.equal(deriveGroupStatus([{ fulfillmentStatus: 'shipped' }, { fulfillmentStatus: 'pending' }]), 'pending');
  assert.equal(deriveGroupStatus([{ fulfillmentStatus: 'delivered' }, { fulfillmentStatus: 'cancelled' }]), 'delivered');
  assert.equal(deriveGroupStatus([{ fulfillmentStatus: 'cancelled' }, { fulfillmentStatus: 'cancelled' }]), 'cancelled');
  assert.equal(deriveGroupStatus([{ fulfillmentStatus: 'accepted' }, { fulfillmentStatus: 'accepted' }]), 'accepted');
});

test('normalizes unknown legacy status safely', () => {
  assert.equal(normalizeStatus('bogus'), 'pending');
  assert.equal(normalizeStatus('DELIVERED'), 'delivered');
});
