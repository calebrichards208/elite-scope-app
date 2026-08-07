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
