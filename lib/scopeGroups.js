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
