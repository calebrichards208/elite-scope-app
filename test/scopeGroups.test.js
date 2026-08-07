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

// ── Document generation ────────────────────────────────────────────
const {
  PROPOSAL_TEMPLATE_ID,
  CHANGE_ORDER_TEMPLATE_ID,
  documentTemplateIdFor,
  documentLineItems,
  buildDocumentParams
} = require('../lib/scopeGroups.js');

test('documentTemplateIdFor picks the Change Order template only in change-order mode', () => {
  assert.strictEqual(documentTemplateIdFor('changeOrder'), CHANGE_ORDER_TEMPLATE_ID);
  assert.strictEqual(documentTemplateIdFor('exhibit'), PROPOSAL_TEMPLATE_ID);
});

test('proposal template is the showQuantity:false one, pinned by id not name', () => {
  // Two templates are named "Proposal"; "Default BCI" (22PVEkn2ERDb) shows
  // quantities, which is wrong for lump-sum bids.
  assert.strictEqual(PROPOSAL_TEMPLATE_ID, '22PEaNuVctbe');
  assert.notStrictEqual(PROPOSAL_TEMPLATE_ID, '22PVEkn2ERDb');
});

test('an exhibit document rebuilds its group and appends NOTES', () => {
  const posted = [
    { id: 'ci-1', name: 'Demo Bathroom' },
    { id: 'ci-2', name: 'Install Vanity', unitPrice: 3000, isTaxable: true }
  ];
  const items = documentLineItems('exhibit', 'Exhibit B', posted,
    { id: 'notes-1', description: '- Permit not included.' });

  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0]._type, 'costGroup');
  assert.strictEqual(items[0].name, 'Exhibit B');
  assert.deepStrictEqual(items[0].lineItems, [
    { _type: 'costItem', name: 'Demo Bathroom', showQuantity: false,
      unitCost: 0, unitPrice: 0, jobCostItemId: 'ci-1' },
    { _type: 'costItem', name: 'Install Vanity', showQuantity: false,
      unitCost: 0, unitPrice: 3000, jobCostItemId: 'ci-2', isTaxable: true }
  ]);
  assert.deepStrictEqual(items[1], {
    _type: 'costItem', name: 'NOTES',
    showQuantity: false, showDescription: true, unitCost: 0, unitPrice: 0,
    jobCostItemId: 'notes-1', description: '- Permit not included.'
  });
});

test('every document line carries a cost AND a price so it can be approved', () => {
  // JobTread blocks approval with "A cost/price must be set for X" otherwise,
  // and mode detection depends on documents reaching approved status.
  const items = documentLineItems('exhibit', 'Exhibit A',
    [{ id: 'a', name: 'one' }, { id: 'b', name: 'two', unitPrice: 500 }],
    { id: 'n', description: 'terms' });
  items[0].lineItems.forEach(l => {
    assert.strictEqual(l.unitCost, 0);
    assert.strictEqual(typeof l.unitPrice, 'number');
  });
  assert.strictEqual(items[0].lineItems[0].unitPrice, 0);
  assert.strictEqual(items[0].lineItems[1].unitPrice, 500);
  assert.strictEqual(items[1].unitCost, 0);
  assert.strictEqual(items[1].unitPrice, 0);
});

test('NOTES boilerplate is carried into the document, not left blank', () => {
  const items = documentLineItems('exhibit', 'Exhibit A', [{ id: 'a', name: 'x' }],
    { id: 'n', description: '- Building permit not included in the price.' });
  assert.strictEqual(items[1].description, '- Building permit not included in the price.');
});

test('a change order rebuilds only its own group, never NOTES', () => {
  const items = documentLineItems('changeOrder', 'Change Order 2',
    [{ id: 'ci-9', name: 'Relocate Valve', unitPrice: 500, isTaxable: true }],
    { id: 'notes-1', description: 'terms' });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].name, 'Change Order 2');
});

test('an exhibit document omits NOTES when the job has none', () => {
  const items = documentLineItems('exhibit', 'Exhibit A', [{ id: 'c', name: 'x' }], null);
  assert.strictEqual(items.length, 1);
});

test('document line items never reference budget groups by id', () => {
  // JobTread rejects an existing-group id: documents own their own copies,
  // linked back to the budget via jobCostItemId.
  const items = documentLineItems('exhibit', 'Exhibit A', [{ id: 'ci-1', name: 'x' }],
    { id: 'n' });
  const json = JSON.stringify(items);
  assert.strictEqual(json.includes('existingCostGroup'), false);
  assert.strictEqual(json.includes('existingCostItem'), false);
  assert.strictEqual(items[0].lineItems[0].jobCostItemId, 'ci-1');
});

test('buildDocumentParams copies template fields and fills job context', () => {
  const template = {
    name: 'Change Order', type: 'customerOrder', footer: 'Amends the contract.',
    requireSignature: true, showQuantity: false, includeInBudget: true,
    dueDays: 15, fromName: null, fromOrganizationName: null, taxName: null
  };
  const params = buildDocumentParams(template, {
    jobId: 'job-1', lineItems: [{ existingCostGroup: { id: 'g1' } }],
    taxRate: 0.08375, toName: 'CaleJ Rich', toOrganizationName: 'Caleb John Richards',
    toAddress: '123 Test St', jobLocationName: '123 Test St',
    jobLocationAddress: '123 Test St, Waconia, MN 55387, USA',
    fallbackFromName: 'Sergey Stefoglo',
    fallbackFromOrganizationName: 'Elite Construction + Remodeling'
  });

  assert.strictEqual(params.jobId, 'job-1');
  assert.strictEqual(params.name, 'Change Order');
  assert.strictEqual(params.type, 'customerOrder');
  assert.strictEqual(params.footer, 'Amends the contract.');
  assert.strictEqual(params.requireSignature, true);
  assert.strictEqual(params.showQuantity, false);
  assert.strictEqual(params.taxRate, 0.08375);
  assert.strictEqual(params.toName, 'CaleJ Rich');
  // Template leaves these null, so the grant identity fills in.
  assert.strictEqual(params.fromName, 'Sergey Stefoglo');
  assert.strictEqual(params.fromOrganizationName, 'Elite Construction + Remodeling');
  // JobTread rejects the document without a job location.
  assert.strictEqual(params.jobLocationName, '123 Test St');
});

test('buildDocumentParams omits issueDate so the document stays a draft', () => {
  const params = buildDocumentParams(
    { name: 'Proposal', type: 'customerOrder' },
    { jobId: 'j', lineItems: [], taxRate: 0, toName: 'X', fallbackFromName: 'Y' }
  );
  assert.strictEqual('issueDate' in params, false);
});

test('buildDocumentParams never emits null-valued template fields', () => {
  const params = buildDocumentParams(
    { name: 'Proposal', type: 'customerOrder', footer: null, coverPageTitle: null },
    { jobId: 'j', lineItems: [], taxRate: 0, toName: 'X', fallbackFromName: 'Y' }
  );
  assert.strictEqual('footer' in params, false);
  assert.strictEqual('coverPageTitle' in params, false);
});

test('buildDocumentParams preserves showQuantity:false rather than dropping it as falsy', () => {
  const params = buildDocumentParams(
    { name: 'Proposal', type: 'customerOrder', showQuantity: false, showChildCosts: false },
    { jobId: 'j', lineItems: [], taxRate: 0, toName: 'X', fallbackFromName: 'Y' }
  );
  assert.strictEqual(params.showQuantity, false);
  assert.strictEqual(params.showChildCosts, false);
});

// ── Idaho tax ──────────────────────────────────────────────────────
const { isIdahoAddress, documentTaxRate } = require('../lib/scopeGroups.js');

test('recognises Idaho addresses across the messy real formats', () => {
  [
    "112 E Borah Ave, Coeur d'Alene, ID 83814, USA",
    '1155 Morris Road, Princeton Idaho 83857',
    '706 W 12th Ave, Post Falls ID 83854',
    "6937 N Windy Pines St, Coeur d'Alene ID 83815-9171",
    '7553 W Lund St, Rathdrum  ID 83858',
    '2173 Tumbleweed Circle, Hayden Idaho 83835',
    '816 S Bailey Ct, CDA ID 83814',
    '2876 E Winter Pines Ct, CDA Id on 83815',
    '7823 N Rude st, Dalton gardens Id 83825',
    '1427 W Benjamin Ave, Coeur d Alene Id 83815',
    'MOSCOW ID 83843'
  ].forEach(addr => assert.strictEqual(isIdahoAddress(addr), true, addr));
});

test('does not mistake Washington addresses for Idaho', () => {
  [
    '403 E 8th Ave, Spokane, WA 99202, USA',
    '12612 E Houk Rd, Spokane Valley, WA 99216, USA',
    '123 Broadway, Seattle, WA 98122, USA',
    '123 E Test St, Spokane WA 99202'
  ].forEach(addr => assert.strictEqual(isIdahoAddress(addr), false, addr));
});

test('does not match street names that merely contain the letters id', () => {
  // "Cambridge" contains "id" — a naive substring match flags this as Idaho.
  assert.strictEqual(isIdahoAddress('1419 E Cambridge Ln, Spokane, WA 99203, USA'), false);
});

test('halves the tax rate on Idaho jobs only', () => {
  assert.strictEqual(documentTaxRate(0.06, '608 N 16th St, Coeur d\'Alene ID 83814'), 0.03);
  assert.strictEqual(documentTaxRate(0.091, '403 E 8th Ave, Spokane, WA 99202, USA'), 0.091);
});

test('documentTaxRate handles a missing rate or address', () => {
  assert.strictEqual(documentTaxRate(null, 'MOSCOW ID 83843'), 0);
  assert.strictEqual(documentTaxRate(0.089, null), 0.089);
  assert.strictEqual(documentTaxRate(0.089, ''), 0.089);
});

// ── Job naming ─────────────────────────────────────────────────────
const {
  JOB_NAME_MAX_LENGTH, needsProjectName, appendProjectName,
  projectNameVariants, PROJECT_NAME_VOCABULARY
} = require('../lib/scopeGroups.js');

test('a bare customer name needs a project word', () => {
  ['Doreen Smith', 'Mike Mires', 'Mistie Varner', 'Robert Schneider', 'Theresa Wilson']
    .forEach(n => assert.strictEqual(needsProjectName(n), true, n));
});

test('names that already describe the project are left alone', () => {
  [
    'Karen Brewer Bathroom', 'Bjork Deck', 'Theresa Wilson-Back deck',
    'Robert McPherson Laundry Room', 'Buchmann Wet Area Remodel',
    'Noreen Pederson Tub to Shower', 'Mary Christensen Bath/Closet'
  ].forEach(n => assert.strictEqual(needsProjectName(n), false, n));
});

test('appendProjectName adds the descriptor', () => {
  assert.strictEqual(appendProjectName('Doreen Smith', 'Bathroom'), 'Doreen Smith Bathroom');
});

test('appendProjectName shortens to a sensible variant when tight', () => {
  const result = appendProjectName('Christy Craver Jr', 'Bathroom');
  assert.strictEqual(result, 'Christy Craver Jr Bathroom');
  assert.ok(result.length <= JOB_NAME_MAX_LENGTH);
});

test('a tight name shortens Tub to Shower to Shower, never to Tub', () => {
  // 'Jenn Replogle Smith Tub to Shower' is 33 — too long.
  const result = appendProjectName('Jenn Replogle Smith', 'Tub to Shower');
  assert.strictEqual(result, 'Jenn Replogle Smith Shower');
  assert.ok(!result.endsWith(' Tub'), 'must never shorten to the word Tub');
});

test('multi-word descriptors shorten to a real term, not their first word', () => {
  assert.deepStrictEqual(projectNameVariants('Tub to Shower'), ['Tub to Shower', 'Shower']);
  assert.deepStrictEqual(projectNameVariants('Basement Finish'), ['Basement Finish', 'Basement']);
  assert.deepStrictEqual(projectNameVariants('Laundry Room'), ['Laundry Room', 'Laundry']);
  assert.deepStrictEqual(projectNameVariants('Master Bathroom'), ['Master Bathroom', 'Bathroom', 'Bath']);
});

test('the vocabulary covers the descriptors actually used in the account', () => {
  ['Bathroom', 'Master Bathroom', 'Shower Remodel', 'Tub to Shower',
   'Wet Area', 'Deck', 'Kitchen', 'Basement Finish', 'Laundry Room']
    .forEach(term => assert.ok(PROJECT_NAME_VOCABULARY.includes(term), term));
});

test('every vocabulary term fits a typical customer name', () => {
  PROJECT_NAME_VOCABULARY.forEach(term => {
    const out = appendProjectName('Doreen Kruger', term);
    assert.ok(out.length <= JOB_NAME_MAX_LENGTH, `${out} is ${out.length}`);
    assert.notStrictEqual(out, 'Doreen Kruger', `${term} produced no suffix`);
  });
});

test('appendProjectName keeps every result within the cap', () => {
  [['Doreen Smith', 'Bathroom'], ['Christy Craver Jr', 'Bathroom Remodel'],
   ['Bartholomew Fitzgerald-Smythe', 'Bathroom'], ['Karen Brewer', 'Wet Area Remodel']]
    .forEach(([n, d]) => {
      const out = appendProjectName(n, d);
      assert.ok(out.length <= JOB_NAME_MAX_LENGTH, `${out} is ${out.length} chars`);
    });
});

test('appendProjectName never truncates the customer name', () => {
  const longName = 'Bartholomew Fitzgerald-Smythe';  // 29 chars, no room for more
  assert.strictEqual(appendProjectName(longName, 'Bathroom'), longName);
});

test('appendProjectName tolerates junk input', () => {
  assert.strictEqual(appendProjectName('Doreen Smith', ''), 'Doreen Smith');
  assert.strictEqual(appendProjectName('Doreen Smith', '   '), 'Doreen Smith');
  assert.strictEqual(appendProjectName('Doreen Smith', 'Bath   Remodel'), 'Doreen Smith Bath Remodel');
  assert.strictEqual(appendProjectName('', 'Bathroom'), '');
});
