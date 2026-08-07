# Change Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Sergey post post-signing scope additions as flat `Change Order N` cost groups from the same three-step flow he already uses for exhibits, and fix the shipped bug that shows duplicate scope lines.

**Architecture:** All parsing, numbering, and mode-detection logic moves into a new `lib/scopeGroups.js`, following the existing dual-mode pattern (`<script src>` in the browser, `require` in node tests). `index.html` keeps only DOM wiring and API calls. The duplicated fetch-and-parse block that exists twice in `index.html` collapses into one helper, so the bug fix lands in a single place.

**Tech Stack:** Vanilla JS, single-file `index.html`, Cloudflare Workers static assets, `node:test` for unit tests, JobTread Pave API.

## Global Constraints

- Cost group naming is `Change Order 1`, `Change Order 2` — title case, **no `#`**, space before the digit.
- Change order cost groups are **top-level**: `parentCostGroupId` is never set.
- Change orders write **no NOTES item**; the job-level `NOTES` item is never modified in change-order mode.
- Every read of job cost items must exclude document copies (`item.document` truthy). JobTread copies items into each document built from the budget.
- Mode detection uses documents where `type === 'customerOrder'` and `status === 'approved'`. Do not read the Pipeline Stage field.
- Test command is `node --test 'test/*.test.js'` (the glob must be quoted).
- `lib/*.js` files end with the dual-mode export guard: `if (typeof module !== 'undefined') { module.exports = {...}; }`
- Do not introduce cost codes, margin, or per-item pricing. Lump sum on the last line only, per `PROJECT_BRIEF.md`.
- The app must never create documents. Alina builds them in JobTread.

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/scopeGroups.js` (create) | Pure logic: budget-item filtering, exhibit parsing, change-order parsing, numbering, mode detection. No DOM, no network. |
| `test/scopeGroups.test.js` (create) | Unit tests for the above. |
| `index.html` (modify) | DOM wiring, JobTread queries, posting. Delegates all parsing to `lib/scopeGroups.js`. |

**Reference data for tests** — real shapes from `TEST JOB` (`22PcFcUW9xHt`), verified against the live API:

```js
// cost item, budget copy
{ id: '22PcFcZK4SDK', name: 'DEFG', unitPrice: 3000,
  costGroup: { id: '22PcFcZG96Rt', name: 'Exhibit A' }, document: null }

// cost item, document copy — same name, different ids
{ id: '22PcFcaVLFqD', name: 'DEFG', unitPrice: 3000,
  costGroup: { id: '22PcFcaVLFq9', name: 'Exhibit A' },
  document: { id: '22PcFcaVDuZF' } }

// document
{ id: '22PcFcaVDuZF', name: 'Proposal', type: 'customerOrder', status: 'approved' }
```

---

### Task 1: Extract scope-group logic into a tested module

**Files:**
- Create: `lib/scopeGroups.js`
- Create: `test/scopeGroups.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `budgetItemsOnly(items) -> Array`, `findNotesItemId(items) -> string|null`, `parseExhibits(items) -> Array<{id, name, letter, items}>`, `nextExhibitLetter(letters: string[]) -> string`.

- [ ] **Step 1: Write the failing test**

Create `test/scopeGroups.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/scopeGroups.test.js'`
Expected: FAIL — `Cannot find module '../lib/scopeGroups.js'`

- [ ] **Step 3: Write the implementation**

Create `lib/scopeGroups.js`:

```js
const EXHIBIT_PREFIX = 'Exhibit ';

// JobTread copies cost items into every document built from the budget, so an
// unfiltered query returns each line once per document. Budget items are the
// ones with no document.
function budgetItemsOnly(items) {
  return (items || []).filter(item => !item.document);
}

function findNotesItemId(items) {
  const notes = budgetItemsOnly(items).find(i => i.name === 'NOTES' && !i.costGroup);
  return notes ? notes.id : null;
}

function parseExhibits(items) {
  const map = {};
  budgetItemsOnly(items).forEach(item => {
    const groupName = item.costGroup && item.costGroup.name;
    if (!groupName || !groupName.startsWith(EXHIBIT_PREFIX)) return;
    const letter = groupName.slice(EXHIBIT_PREFIX.length).trim();
    if (!letter) return;
    if (!map[letter]) {
      map[letter] = { id: item.costGroup.id, name: groupName, letter, items: [] };
    }
    map[letter].items.push(item);
  });
  return Object.values(map).sort((a, b) => a.letter.localeCompare(b.letter));
}

function nextExhibitLetter(existingLetters) {
  const sorted = [...existingLetters].sort();
  if (sorted.length === 0) return 'A';
  const last  = sorted[sorted.length - 1];
  const chars = last.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] < 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
    i--;
  }
  return 'A' + chars.join('');
}

if (typeof module !== 'undefined') {
  module.exports = {
    EXHIBIT_PREFIX,
    budgetItemsOnly,
    findNotesItemId,
    parseExhibits,
    nextExhibitLetter
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test 'test/*.test.js'`
Expected: PASS — 31 tests (23 existing + 8 new), 0 failing

- [ ] **Step 5: Commit**

```bash
git add lib/scopeGroups.js test/scopeGroups.test.js
git commit -m "Add scopeGroups module with budget-only item filtering"
```

---

### Task 2: Wire index.html to the module and fix the duplicate-lines bug

The fetch-and-parse block is duplicated verbatim at `index.html:1435-1473` (job select) and `index.html:2632-2669` (post-submit refresh). Both are replaced by one helper so the fix lands once.

**Files:**
- Modify: `index.html:1110-1112` (script tags), `index.html:1435-1473`, `index.html:1508-1523`, `index.html:2632-2669`

**Interfaces:**
- Consumes: `budgetItemsOnly`, `findNotesItemId`, `parseExhibits`, `nextExhibitLetter` from Task 1.
- Produces: `fetchJobScopeItems(jobId) -> Promise<Array>` — all cost items for a job, including document copies, with `document: {id}` selected so callers can filter.

- [ ] **Step 1: Add the script tag**

In `index.html`, after line 1112 (`<script src="lib/githubIssue.js"></script>`), add:

```html
<script src="lib/scopeGroups.js"></script>
```

- [ ] **Step 2: Add the shared fetch helper**

Insert immediately above `function getJobStage(job) {` (currently `index.html:1367`):

```js
// Fetches every cost item on a job, including copies owned by documents.
// Callers filter with budgetItemsOnly() — see lib/scopeGroups.js.
async function fetchJobScopeItems(jobId) {
  let items = [];
  let page  = null;
  do {
    const params = { where: [['job', 'id'], '=', jobId], size: 100 };
    if (page) params.page = page;
    const data = await jtPost({
      $: { grantKey },
      organization: {
        $: { id: orgId },
        costItems: {
          $: params,
          nextPage: {},
          nodes: {
            id: {}, name: {}, unitPrice: {},
            costGroup: { id: {}, name: {} },
            document: { id: {} }
          }
        }
      }
    });
    items = items.concat(data?.organization?.costItems?.nodes || []);
    page  = data?.organization?.costItems?.nextPage || null;
  } while (page);
  return items;
}
```

- [ ] **Step 3: Replace the job-select fetch block**

Replace `index.html:1436-1473` — everything from `let items = [];` through the `existingExhibits = Object.values(exhibitMap)...` line — with:

```js
    const items = await fetchJobScopeItems(selectedJob.id);

    existingNotesId  = findNotesItemId(items);
    existingExhibits = parseExhibits(items);
```

Leave the surrounding `try {` / `catch` and the lines after it unchanged.

- [ ] **Step 4: Delete the now-duplicated nextExhibitLetter**

Delete `index.html:1508-1523` (the whole `function nextExhibitLetter(existingLetters) { ... }` block). It now comes from `lib/scopeGroups.js`.

- [ ] **Step 5: Replace the post-submit refresh block**

Replace `index.html:2633-2669` — from `let items = [];` through `existingExhibits = Object.values(exhibitMap)...` — with:

```js
        const items = await fetchJobScopeItems(selectedJob.id);

        existingNotesId  = findNotesItemId(items);
        existingExhibits = parseExhibits(items);
```

- [ ] **Step 6: Verify no stale references remain**

Run: `grep -n "exhibitMap\|startsWith('Exhibit " index.html`
Expected: no output.

Run: `node --test 'test/*.test.js'`
Expected: PASS — 31 tests, 0 failing

- [ ] **Step 7: Verify in the real app**

Open the app, paste the grant key, and select `TEST JOB` (it is in `Appointment Booked`, so it appears in the default list).
Expected: Exhibit A loads **4 lines** (`This is a test job`, `1-2-3`, `ABC`, `DEFG`) and a total of `3000`.
Before this fix it showed 8 lines. If you see 8, the filter is not being applied.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "Fix duplicate scope lines from document cost-item copies

The cost-item query had no document filter, so JobTread's per-document
copies loaded as extra lines — TEST JOB showed 8 lines for Exhibit A's 4.
Collapses the two duplicated fetch-and-parse blocks into one helper."
```

---

### Task 3: Change-order parsing, numbering, and mode detection

**Files:**
- Modify: `lib/scopeGroups.js`
- Modify: `test/scopeGroups.test.js`

**Interfaces:**
- Consumes: `budgetItemsOnly` from Task 1.
- Produces: `parseChangeOrders(items) -> Array<{id, name, number, items}>`, `nextChangeOrderNumber(numbers: number[]) -> number`, `changeOrderGroupName(number) -> string`, `detectMode(documents) -> 'changeOrder'|'exhibit'`.

- [ ] **Step 1: Write the failing tests**

First, replace the `require` destructuring at the top of `test/scopeGroups.test.js` with the merged list (do not add a second `require`):

```js
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
```

Then append these tests to the end of the file. They reuse the `budgetItem` and `docItem` helpers already defined there in Task 1:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test 'test/scopeGroups.test.js'`
Expected: FAIL — `parseChangeOrders is not a function`

- [ ] **Step 3: Write the implementation**

In `lib/scopeGroups.js`, add below `parseExhibits` (before `nextExhibitLetter`):

```js
const CHANGE_ORDER_PREFIX  = 'Change Order ';
const CHANGE_ORDER_PATTERN = /^Change Order (\d+)$/;

function parseChangeOrders(items) {
  const map = {};
  budgetItemsOnly(items).forEach(item => {
    const groupName = item.costGroup && item.costGroup.name;
    if (!groupName) return;
    const match = CHANGE_ORDER_PATTERN.exec(groupName);
    if (!match) return;
    const number = parseInt(match[1], 10);
    if (!map[number]) {
      map[number] = { id: item.costGroup.id, name: groupName, number, items: [] };
    }
    map[number].items.push(item);
  });
  return Object.values(map).sort((a, b) => a.number - b.number);
}

function nextChangeOrderNumber(existingNumbers) {
  if (!existingNumbers || existingNumbers.length === 0) return 1;
  return Math.max(...existingNumbers) + 1;
}

function changeOrderGroupName(number) {
  return CHANGE_ORDER_PREFIX + number;
}

// A signed contract is an approved customerOrder. Deliberately not derived from
// the Pipeline Stage field, which depends on a human moving a card.
function detectMode(documents) {
  const signed = (documents || []).some(
    d => d.type === 'customerOrder' && d.status === 'approved'
  );
  return signed ? 'changeOrder' : 'exhibit';
}
```

Extend the export block to:

```js
if (typeof module !== 'undefined') {
  module.exports = {
    EXHIBIT_PREFIX,
    CHANGE_ORDER_PREFIX,
    budgetItemsOnly,
    findNotesItemId,
    parseExhibits,
    nextExhibitLetter,
    parseChangeOrders,
    nextChangeOrderNumber,
    changeOrderGroupName,
    detectMode
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test 'test/*.test.js'`
Expected: PASS — 39 tests, 0 failing

- [ ] **Step 5: Commit**

```bash
git add lib/scopeGroups.js test/scopeGroups.test.js
git commit -m "Add change-order parsing, numbering, and mode detection"
```

---

### Task 4: Detect mode on job select and show it in the banner

**Files:**
- Modify: `index.html` — state declarations near line 1133, the job-select flow, `showExhibitBanner()` at line 1525 (renamed), and the banner element at line 928.

**Interfaces:**
- Consumes: `detectMode`, `parseChangeOrders`, `nextChangeOrderNumber`, `changeOrderGroupName` from Task 3; `fetchJobScopeItems` from Task 2.
- Produces: globals `currentMode` (`'exhibit'|'changeOrder'`), `currentChangeOrder` (number|null), `existingChangeOrders` (array); functions `fetchJobDocuments(jobId) -> Promise<Array>`, `showScopeBanner()`, `toggleMode()`.

- [ ] **Step 1: Add state globals**

Next to `let currentExhibit = null;` and `let existingExhibits = [];` (`index.html:1133-1134`), add:

```js
let currentMode         = 'exhibit'; // 'exhibit' | 'changeOrder'
let currentChangeOrder  = null;
let existingChangeOrders = [];
```

- [ ] **Step 2: Add the documents fetch**

Directly below `fetchJobScopeItems`, add:

```js
async function fetchJobDocuments(jobId) {
  const data = await jtPost({
    $: { grantKey },
    organization: {
      $: { id: orgId },
      documents: {
        $: { where: [['job', 'id'], '=', jobId], size: 100 },
        nodes: { id: {}, name: {}, type: {}, status: {} }
      }
    }
  });
  return data?.organization?.documents?.nodes || [];
}
```

- [ ] **Step 3: Populate mode on job select**

In the job-select block, replace the three lines added in Task 2 (`const items = await fetchJobScopeItems(...)` and the two assignments below it) with:

```js
    const [items, documents] = await Promise.all([
      fetchJobScopeItems(selectedJob.id),
      fetchJobDocuments(selectedJob.id).catch(() => [])
    ]);

    existingNotesId      = findNotesItemId(items);
    existingExhibits     = parseExhibits(items);
    existingChangeOrders = parseChangeOrders(items);
    currentMode          = detectMode(documents);
```

`fetchJobDocuments` is `.catch`-guarded so a documents failure degrades to exhibit mode rather than blocking job selection.

- [ ] **Step 4: Make the banner mode-aware**

Rename `showExhibitBanner()` to `showScopeBanner()` and replace its body (`index.html:1525-1548`) with:

```js
function showScopeBanner() {
  const bannerText = document.getElementById('exhibit-banner-text');

  if (currentMode === 'changeOrder') {
    const numbers = existingChangeOrders.map(o => o.number);
    currentChangeOrder = nextChangeOrderNumber(numbers);
    lines = [];
    renderLines();
    document.getElementById('total-price').value = '';
    bannerText.textContent =
      `Contract signed · Creating ${changeOrderGroupName(currentChangeOrder)}`;
    show('exhibit-banner');
    return;
  }

  currentChangeOrder = null;

  if (existingExhibits.length === 0) {
    currentExhibit = 'A';
    bannerText.textContent = 'New job — creating Exhibit A';
    show('exhibit-banner');
  } else {
    const existingLetters = existingExhibits.map(e => e.letter);
    const lastLetter      = existingLetters[existingLetters.length - 1];
    const nextLetter      = nextExhibitLetter(existingLetters);
    currentExhibit        = nextLetter;

    const lastExhibit = existingExhibits[existingExhibits.length - 1];
    const priceItem   = lastExhibit.items.find(i => i.unitPrice > 0);
    lines = lastExhibit.items.map(i => ({ id: nextLineId++, text: i.name }));
    renderLines();
    if (priceItem) document.getElementById('total-price').value = priceItem.unitPrice;

    bannerText.textContent = `Exhibit ${lastLetter} loaded — posting as Exhibit ${nextLetter}`;
    show('exhibit-banner');
    toast(`Exhibit ${lastLetter} loaded`, 'ok');
  }
}
```

A change order starts from a blank line list — it is new scope, not a revision of prior scope, so prior lines are never preloaded.

Run `grep -n "showExhibitBanner" index.html` and update every remaining call site to `showScopeBanner`.

- [ ] **Step 5: Add the override tap**

Add below `showScopeBanner`:

```js
function toggleMode() {
  currentMode = currentMode === 'changeOrder' ? 'exhibit' : 'changeOrder';
  showScopeBanner();
  updateSubmitLabel();
}
```

Make the banner tappable by adding to the `<div id="exhibit-banner" ...>` element at `index.html:928` — inside the existing `style` attribute, append `;cursor:pointer` and add `onclick="toggleMode()"` and `title="Tap to switch between exhibit and change order"`.

- [ ] **Step 6: Add the submit-label helper**

Add below `toggleMode`:

```js
function updateSubmitLabel() {
  const btn = document.getElementById('submit-btn');
  if (!btn || btn.disabled) return;
  btn.textContent = currentMode === 'changeOrder'
    ? 'Post Change Order to JobTread'
    : 'Post Exhibit to JobTread';
}
```

Call `updateSubmitLabel();` on the line immediately after each `showScopeBanner();` call.

- [ ] **Step 7: Verify in the real app**

Run: `node --test 'test/*.test.js'` — Expected: PASS, 39 tests.

Open the app and select `TEST JOB`.
Expected: banner reads `Contract signed · Creating Change Order 4` (three change orders exist), the line list is empty, and the button reads `Post Change Order to JobTread`.
Tap the banner. Expected: it switches to `Exhibit A loaded — posting as Exhibit B` and the button reverts.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "Detect change-order mode from approved customerOrder documents"
```

---

### Task 5: Post a change order

**Files:**
- Modify: `index.html` — `submitToJobTread()` at line 2512, `saveDraft`/`loadDraft` at lines 1716-1731.

**Interfaces:**
- Consumes: `changeOrderGroupName`, `currentMode`, `currentChangeOrder`, `existingChangeOrders`, `existingNotesId`.
- Produces: no new exports.

- [ ] **Step 1: Branch the group creation**

In `submitToJobTread()`, replace lines 2522-2534 (from `const exhibitName = ...` through the `positionAfter` assignment) with:

```js
  const isChangeOrder = currentMode === 'changeOrder';
  const groupLabel    = isChangeOrder
    ? changeOrderGroupName(currentChangeOrder || 1)
    : `Exhibit ${currentExhibit || 'A'}`;
  const isFirstExhibit = !isChangeOrder && existingExhibits.length === 0;

  try {
    const groupParams = {
      jobId:        selectedJob.id,
      name:         groupLabel,
      showChildren: true
    };

    // Change orders sit flat, after NOTES or after the last change order.
    // Never nested under a parent group — one group must map to exactly one
    // signable document.
    if (isChangeOrder) {
      const lastOrder = existingChangeOrders[existingChangeOrders.length - 1];
      if (lastOrder) {
        groupParams.positionAfter = { id: lastOrder.id, type: 'costGroup' };
      } else if (existingNotesId) {
        groupParams.positionAfter = { id: existingNotesId, type: 'costItem' };
      }
    } else if (existingExhibits.length > 0) {
      groupParams.positionAfter = {
        id: existingExhibits[existingExhibits.length - 1].id,
        type: 'costGroup'
      };
    }
```

Then replace every remaining use of `exhibitName` in the function with `groupLabel` (the `createCostGroup` error string and the success message).

- [ ] **Step 2: Skip all NOTES writes in change-order mode**

Change the notes branch (currently `if (isFirstExhibit) { ... } else if (extraNotes.length > 0 && existingNotesId) { ... }`) so both arms are skipped for change orders. Replace the `if (isFirstExhibit)` condition with:

```js
    if (isChangeOrder) {
      // No NOTES item. The Change Order template footer carries the
      // post-signing terms, and the job-level NOTES belongs to a signed
      // contract that must not be edited retroactively.
    } else if (isFirstExhibit) {
```

- [ ] **Step 3: Update the success strings**

Replace the two success lines:

```js
    btn.classList.add('success-state');
    btn.innerHTML = `✓ ${groupLabel} posted!`;
    toast(
      isChangeOrder
        ? `${groupLabel} posted! Open JobTread to send the change order.`
        : `${groupLabel} posted! Open JobTread to generate the proposal.`,
      'ok'
    );
```

In the reset `setTimeout`, replace `btn.textContent = 'Post Exhibit to JobTread';` with `updateSubmitLabel();`.

- [ ] **Step 4: Persist mode in the draft**

Replace `saveDraft` (line 1716) with:

```js
function saveDraft(jobId) {
  if (!jobId) return;
  localStorage.setItem(draftKey(jobId), JSON.stringify({
    lines: lines.map(l => l.text),
    notes: document.getElementById('additional-notes').value,
    mode:  currentMode
  }));
}
```

Where the draft is restored (`index.html:1491-1497`), after `document.getElementById('additional-notes').value = draft.notes || '';` add:

```js
    if (draft.mode === 'exhibit' || draft.mode === 'changeOrder') currentMode = draft.mode;
```

Restore the mode **before** `showScopeBanner()` runs, so the banner reflects the draft.

- [ ] **Step 5: Run tests**

Run: `node --test 'test/*.test.js'`
Expected: PASS — 39 tests, 0 failing

- [ ] **Step 6: Verify end to end against TEST JOB**

In the app, select `TEST JOB` (change-order mode, `Change Order 4`), dictate or type two lines, enter `500`, and post.

Then verify with the JobTread MCP:

```
{"job": {"$": {"id": "22PcFcUW9xHt"},
  "costGroups": {"$": {"size": 40},
    "nodes": {"name": {}, "parentCostGroup": {"name": {}},
              "document": {"id": {}}}}}}
```

Expected: a new `Change Order 4` group with `parentCostGroup: null` and `document: null`.

Confirm the budget stayed additive:

```
{"job": {"$": {"id": "22PcFcUW9xHt"},
  "budgetOnly": {"_": "costItems",
    "$": {"where": [["document", "id"], "=", null]},
    "sum": {"$": "price"}}}}
```

Expected: `6500` (the prior `6000` plus `500`).

Also confirm no second `NOTES` item was created: the job should still have exactly one budget `NOTES` item.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Post change orders as flat Change Order N groups

Change-order mode writes a top-level group positioned after NOTES (or
after the previous change order), skips all NOTES writes, and carries
its mode in the per-job draft."
```

---

## Cleanup

- [ ] Delete the `TEST JOB` change orders created during Step 6 verification, or leave `TEST JOB` as the standing fixture. Do not leave test change orders on a real customer job.
- [ ] Tell Alina the document must be built from the **Change Order** template, not Proposal. During testing, `Change Order 2` on `TEST JOB` was built from the Proposal template — the customer would have received bid terms on a signed job.
