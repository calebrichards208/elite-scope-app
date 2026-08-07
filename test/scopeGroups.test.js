const test = require('node:test');
const assert = require('node:assert');
const {
  budgetItemsOnly,
  findNotesItemId,
  parseExhibits,
  nextExhibitLetter
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
