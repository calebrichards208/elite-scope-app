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

// ── Idaho tax ──────────────────────────────────────────────────────
// Elite only pays tax on one half of an Idaho job, so the document's rate is
// set to half of the location's rate — the override that was being done by
// hand on every Idaho document.
//
// Detection is by ZIP, not by looking for "ID" in the text. Idaho ZIPs are
// 832xx-838xx and Washington's are 980xx-994xx, so they never collide.
// Substring matching on "ID" is unsafe: it matches "Cambridge", and the real
// addresses are inconsistent anyway — "ID 83814", "Idaho 83857", "CDA Id on
// 83815", "Coeur d Alene Id 83815".
const IDAHO_ZIP     = /\b83\d{3}\b/;
const WASHINGTON_ZIP = /\b9[89]\d{3}\b/;

function isIdahoAddress(address) {
  if (!address) return false;
  if (WASHINGTON_ZIP.test(address)) return false;
  return IDAHO_ZIP.test(address);
}

function documentTaxRate(locationTaxRate, address) {
  const rate = locationTaxRate || 0;
  return isIdahoAddress(address) ? rate / 2 : rate;
}

// ── Document generation ────────────────────────────────────────────
// JobTread has no "create document from template" API — createDocument takes
// no template id. So we read the template and copy its presentation fields
// onto the new document. Read it fresh every time, so edits Alina makes to the
// template are picked up rather than drifting out of sync.

// Pinned by ID, never by name. Two templates are named "Proposal":
//   22PEaNuVctbe "Default"     — showQuantity false. Sergey's, and what this
//                                app must always use. Lump-sum pricing, so a
//                                quantity column would be wrong.
//   22PVEkn2ERDb "Default BCI" — showQuantity true. Caleb's personal sales
//                                template. Not for this app.
// Matching on name would pick one at random and start putting quantity columns
// on lump-sum bids.
const PROPOSAL_TEMPLATE_ID     = '22PEaNuVctbe';
const CHANGE_ORDER_TEMPLATE_ID = '22PEaNuVctbg';

function documentTemplateIdFor(mode) {
  return mode === 'changeOrder' ? CHANGE_ORDER_TEMPLATE_ID : PROPOSAL_TEMPLATE_ID;
}

// A document cannot reference budget cost groups — JobTread rejects an
// existing-group id outright. Documents own their own copies, linked back to
// the budget by `jobCostItemId`, which is what the JobTread UI does when you
// "select" budget lines. So we rebuild the group from the lines just posted.
//
// An exhibit document carries its own group plus the shared NOTES item —
// never earlier exhibits, which the current exhibit supersedes. A change order
// carries only its own group: NOTES belongs to the signed contract.
function documentLineItems(mode, groupName, postedItems, notes) {
  const group = {
    _type:        'costGroup',
    name:         groupName,
    showChildren: true,
    lineItems: (postedItems || []).map(item => {
      // Both unitCost and unitPrice must be set on every line, or JobTread
      // blocks approval ("A cost/price must be set for X"). Its own UI writes
      // 0 into document copies; the API leaves them null unless told. Sergey
      // prices lump-sum and tracks no costs, so 0 is the honest value.
      const line = {
        _type: 'costItem', name: item.name,
        showQuantity: false,
        unitCost:  0,
        unitPrice: item.unitPrice || 0
      };
      if (item.id)        line.jobCostItemId = item.id;
      if (item.isTaxable) line.isTaxable     = true;
      return line;
    })
  };

  const items = [group];
  if (mode !== 'changeOrder' && notes && notes.id) {
    // The document owns a fresh copy, so the boilerplate has to be carried
    // over explicitly or it renders as an empty NOTES block.
    const notesLine = {
      _type: 'costItem', name: 'NOTES',
      showQuantity: false, showDescription: true,
      unitCost: 0, unitPrice: 0,
      jobCostItemId: notes.id
    };
    if (notes.description) notesLine.description = notes.description;
    items.push(notesLine);
  }
  return items;
}

const TEMPLATE_COPY_FIELDS = [
  'type', 'description', 'footer', 'signatureDisclaimer', 'emailMessage',
  'requireSignature', 'includeInBudget', 'showQuantity', 'showChildCosts',
  'groupsStartCollapsed', 'showCostItemFiles', 'showFinancing', 'showProfit',
  'showProgress', 'showScheduledDocuments', 'allowPartialPayments',
  'showLinesAtDepth', 'dueDays', 'coverPageTitle', 'coverPageSubtitle',
  'coverPageTemplate', 'taxName', 'nonRecoverableTaxName'
];

// `context` supplies what the template cannot know: which job, who it is for,
// the location's tax rate, and the line items. Omitting issueDate is what
// leaves the document in `draft` — Alina still reviews and sends it.
function buildDocumentParams(template, context) {
  const params = {
    jobId:     context.jobId,
    name:      template.name,
    lineItems: context.lineItems,
    taxRate:   context.taxRate || 0,
    fromName:  template.fromName || context.fallbackFromName,
    toName:    context.toName
  };

  TEMPLATE_COPY_FIELDS.forEach(field => {
    if (template[field] !== null && template[field] !== undefined) {
      params[field] = template[field];
    }
  });

  const fromOrg = template.fromOrganizationName || context.fallbackFromOrganizationName;
  if (fromOrg) params.fromOrganizationName = fromOrg;
  if (template.fromEmailAddress) params.fromEmailAddress = template.fromEmailAddress;
  if (template.fromAddress)      params.fromAddress      = template.fromAddress;
  if (template.fromPhoneNumber)  params.fromPhoneNumber  = template.fromPhoneNumber;

  if (context.toOrganizationName) params.toOrganizationName = context.toOrganizationName;
  if (context.toAddress)          params.toAddress          = context.toAddress;

  // JobTread rejects the document outright without one of these.
  if (context.jobLocationName)    params.jobLocationName    = context.jobLocationName;
  if (context.jobLocationAddress) params.jobLocationAddress = context.jobLocationAddress;

  return params;
}

if (typeof module !== 'undefined') {
  module.exports = {
    EXHIBIT_PREFIX,
    CHANGE_ORDER_PREFIX,
    PROPOSAL_TEMPLATE_ID,
    CHANGE_ORDER_TEMPLATE_ID,
    isIdahoAddress,
    documentTaxRate,
    budgetItemsOnly,
    findNotesItemId,
    parseExhibits,
    nextExhibitLetter,
    parseChangeOrders,
    nextChangeOrderNumber,
    changeOrderGroupName,
    detectMode,
    documentTemplateIdFor,
    documentLineItems,
    buildDocumentParams
  };
}
