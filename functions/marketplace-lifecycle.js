'use strict';

const ORDER_STATUSES = new Set(['pending', 'accepted', 'preparing', 'shipped', 'delivered', 'cancelled']);

function canTransition(from, to) {
  if (from === 'pending') return to === 'accepted' || to === 'cancelled';
  if (from === 'accepted') return to === 'preparing' || to === 'cancelled';
  if (from === 'preparing') return to === 'shipped' || to === 'cancelled';
  if (from === 'shipped') return to === 'delivered';
  return false;
}

function normalizeStatus(value) {
  const status = String(value || '').toLowerCase();
  return ORDER_STATUSES.has(status) ? status : 'pending';
}

function deriveGroupStatus(orders) {
  const statuses = orders.map((order) => normalizeStatus(order?.fulfillmentStatus || order?.status));
  if (!statuses.length) return 'pending';
  if (statuses.every((status) => status === 'cancelled')) return 'cancelled';
  if (statuses.every((status) => status === 'delivered' || status === 'cancelled')) return 'delivered';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('preparing')) return 'preparing';
  if (statuses.includes('shipped')) return 'shipped';
  if (statuses.includes('accepted')) return 'accepted';
  return 'pending';
}

function isKnownStatus(value) {
  return ORDER_STATUSES.has(String(value || '').toLowerCase());
}

module.exports = { ORDER_STATUSES, canTransition, deriveGroupStatus, isKnownStatus, normalizeStatus };
