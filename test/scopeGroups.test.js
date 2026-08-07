const test = require('node:test');
const assert = require('node:assert');
const {
  budgetItemsOnly,
  findNotesItemId,
  parseExhibits,
  nextExhibitLetter,
  parseChangeOrders,
  nextChangeOrderNumber,
  changeOrderGroupName,
  detectMode
} = require('../lib/scopeGroups.js');

const budgetItem = (name, groupName, groupId, extra = {}) => ({
  id: `budget-${name}`, name, unitPrice: null,
  costGroup: groupName ? { id: groupId, name: groupName } : null,
  document: null, ...extra
});

const docItem = (name, groupName, groupId, docId) => ({
  id: `doc-${name}`, name, unitPrice: 0,
  costGroup: groupName ? { id: groupId, name: groupName } : null,
  document: { id: docId }
});

test('budgetItemsOnly drops items owned by a document', () => {
  const items = [
    budgetItem('DEFG', 'Exhibit A', 'g1'),
    docItem('DEFG', 'Exhibit A', 'g2', 'doc1')
  ];
  const result = budgetItemsOnly(items);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'budget-DEFG');
});

test('budgetItemsOnly tolerates null and undefined', () => {
  assert.deepStrictEqual(budgetItemsOnly(null), []);
  assert.deepStrictEqual(budgetItemsOnly(undefined), []);
});

test('findNotesItemId returns the budget NOTES item, never a document copy', () => {
  const items = [
    docItem('NOTES', null, null, 'doc1'),
    budgetItem('NOTES', null, null)
  ];
  assert.strictEqual(findNotesItemId(items), 'budget-NOTES');
});

test('findNotesItemId returns null when no budget NOTES item exists', () => {
  assert.strictEqual(findNotesItemId([budgetItem('DEFG', 'Exhibit A', 'g1')]), null);
});

test('parseExhibits ignores document copies so lines are not duplicated', () => {
  const items = [
    budgetItem('one', 'Exhibit A', 'g1'),
    budgetItem('two', 'Exhibit A', 'g1'),
    docItem('one', 'Exhibit A', 'g2', 'doc1'),
    docItem('two', 'Exhibit A', 'g2', 'doc1')
  ];
  const exhibits = parseExhibits(items);
  assert.strictEqual(exhibits.length, 1);
  assert.strictEqual(exhibits[0].items.length, 2);
  assert.strictEqual(exhibits[0].id, 'g1');
});

test('parseExhibits sorts by letter and ignores non-exhibit groups', () => {
  const items = [
    budgetItem('b', 'Exhibit B', 'gB'),
    budgetItem('a', 'Exhibit A', 'gA'),
    budgetItem('c', 'Change Order 1', 'gC')
  ];
  const exhibits = parseExhibits(items);
  assert.deepStrictEqual(exhibits.map(e => e.letter), ['A', 'B']);
});

test('nextExhibitLetter starts at A and increments', () => {
  assert.strictEqual(nextExhibitLetter([]), 'A');
  assert.strictEqual(nextExhibitLetter(['A']), 'B');
  assert.strictEqual(nextExhibitLetter(['A', 'B', 'C']), 'D');
});

test('nextExhibitLetter rolls over past Z', () => {
  assert.strictEqual(nextExhibitLetter(['Z']), 'AA');
});

test('parseChangeOrders ignores document copies', () => {
  const items = [
    budgetItem('item 1', 'Change Order 1', 'g1'),
    docItem('item 1', 'Change Order 1', 'g2', 'doc1')
  ];
  const orders = parseChangeOrders(items);
  assert.strictEqual(orders.length, 1);
  assert.strictEqual(orders[0].items.length, 1);
  assert.strictEqual(orders[0].id, 'g1');
});

test('parseChangeOrders sorts numerically, not alphabetically', () => {
  const items = [
    budgetItem('a', 'Change Order 10', 'g10'),
    budgetItem('b', 'Change Order 2', 'g2'),
    budgetItem('c', 'Change Order 1', 'g1')
  ];
  assert.deepStrictEqual(parseChangeOrders(items).map(o => o.number), [1, 2, 10]);
});

test('parseChangeOrders ignores exhibits and near-miss names', () => {
  const items = [
    budgetItem('a', 'Exhibit A', 'gA'),
    budgetItem('b', 'Change Order #3', 'gHash'),
    budgetItem('c', 'Change Orders', 'gParent'),
    budgetItem('d', 'Change Order 1', 'g1')
  ];
  assert.deepStrictEqual(parseChangeOrders(items).map(o => o.number), [1]);
});

test('nextChangeOrderNumber starts at 1 and increments from the max', () => {
  assert.strictEqual(nextChangeOrderNumber([]), 1);
  assert.strictEqual(nextChangeOrderNumber([1]), 2);
  assert.strictEqual(nextChangeOrderNumber([1, 2, 3]), 4);
  assert.strictEqual(nextChangeOrderNumber([3, 1]), 4);
});

test('changeOrderGroupName has no hash and a single space', () => {
  assert.strictEqual(changeOrderGroupName(1), 'Change Order 1');
  assert.strictEqual(changeOrderGroupName(12), 'Change Order 12');
});

test('detectMode returns changeOrder when a customerOrder is approved', () => {
  const docs = [{ id: 'd1', type: 'customerOrder', status: 'approved' }];
  assert.strictEqual(detectMode(docs), 'changeOrder');
});

test('detectMode returns exhibit for pending, denied, or draft only', () => {
  assert.strictEqual(detectMode([{ type: 'customerOrder', status: 'pending' }]), 'exhibit');
  assert.strictEqual(detectMode([{ type: 'customerOrder', status: 'denied' }]), 'exhibit');
  assert.strictEqual(detectMode([{ type: 'customerOrder', status: 'draft' }]), 'exhibit');
  assert.strictEqual(detectMode([]), 'exhibit');
  assert.strictEqual(detectMode(null), 'exhibit');
});

test('detectMode ignores approved documents of other types', () => {
  const docs = [{ type: 'customerInvoice', status: 'approved' }];
  assert.strictEqual(detectMode(docs), 'exhibit');
});
