const { Plugin, ItemView, PluginSettingTab, Setting, Notice, Modal, MarkdownView, MarkdownRenderer, addIcon } = require('obsidian');

const VIEW_TYPE = 'my-little-guy-view';
const RIBBON_ICON_ID = 'my-little-guy-sword';
const RIBBON_ICON_SVG = `
<path d="M46 4 L54 4 L58 62 L50 73 L42 62 Z" fill="#cbd5e1"/>
<path d="M49 4 L51 4 L52 60 L50 67 L48 60 Z" fill="#f8fafc"/>
<rect x="29" y="62" width="42" height="10" rx="3" fill="#e8b923"/>
<rect x="29" y="62" width="42" height="10" rx="3" fill="none" stroke="#8a6d1f" stroke-width="1.6"/>
<rect x="43" y="72" width="14" height="21" rx="3" fill="#8a5a2b"/>
<line x1="43" y1="77.5" x2="57" y2="77.5" stroke="#5c3517" stroke-width="1.6"/>
<line x1="43" y1="83" x2="57" y2="83" stroke="#5c3517" stroke-width="1.6"/>
<line x1="43" y1="88.5" x2="57" y2="88.5" stroke="#5c3517" stroke-width="1.6"/>
<circle cx="50" cy="95" r="5.5" fill="#e8b923"/>
<circle cx="50" cy="95" r="2.2" fill="#e11d48"/>
`;
const MILESTONE_LEVELS = [4, 8, 12, 16, 19];
const STANDARD_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated',
  'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained',
  'Stunned', 'Unconscious',
];

const DEFAULT_SETTINGS = {
  sheetPath: '',
  hasAutoOpened: false,
};

const ABILITIES = [
  { id: 'str', label: 'Strength' },
  { id: 'dex', label: 'Dexterity' },
  { id: 'con', label: 'Constitution' },
  { id: 'int', label: 'Intelligence' },
  { id: 'wis', label: 'Wisdom' },
  { id: 'cha', label: 'Charisma' },
];

const SKILLS = [
  { id: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
  { id: 'animal_handling', label: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', label: 'Arcana', ability: 'int' },
  { id: 'athletics', label: 'Athletics', ability: 'str' },
  { id: 'deception', label: 'Deception', ability: 'cha' },
  { id: 'history', label: 'History', ability: 'int' },
  { id: 'insight', label: 'Insight', ability: 'wis' },
  { id: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { id: 'investigation', label: 'Investigation', ability: 'int' },
  { id: 'medicine', label: 'Medicine', ability: 'wis' },
  { id: 'nature', label: 'Nature', ability: 'int' },
  { id: 'perception', label: 'Perception', ability: 'wis' },
  { id: 'performance', label: 'Performance', ability: 'cha' },
  { id: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { id: 'religion', label: 'Religion', ability: 'int' },
  { id: 'sleight_of_hand', label: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', label: 'Stealth', ability: 'dex' },
  { id: 'survival', label: 'Survival', ability: 'wis' },
];

const PROF_MULT = { none: 0, half: 0.5, prof: 1, expertise: 2 };

function abilityMod(score) {
  return Math.floor((Number(score ?? 10) - 10) / 2);
}

function fmtMod(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

// Parses "XdY+Z" style formulas, or a bare "+N"/"N" modifier (rolled as 1d20+N).
function rollFormula(formula) {
  const trimmed = String(formula || '').trim() || '1d20';
  const diceMatch = trimmed.match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/i);
  if (diceMatch) {
    const count = Math.max(1, Math.min(100, parseInt(diceMatch[1] || '1', 10)));
    const sides = Math.max(2, parseInt(diceMatch[2], 10));
    const mod = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s+/g, ''), 10) : 0;
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
    return { total: rolls.reduce((a, b) => a + b, 0) + mod, rolls, mod, sides, count };
  }
  const parsed = parseInt(trimmed.replace(/^\+/, ''), 10);
  const mod = Number.isNaN(parsed) ? 0 : parsed;
  const roll = 1 + Math.floor(Math.random() * 20);
  return { total: roll + mod, rolls: [roll], mod, sides: 20, count: 1 };
}

// Shows a roll result centered on the page instead of Obsidian's corner Notice.
function showRollResult(mainText, subText) {
  const overlay = document.createElement('div');
  overlay.className = 'csh-roll-overlay';
  const mainEl = document.createElement('div');
  mainEl.className = 'csh-roll-overlay-main';
  mainEl.textContent = mainText;
  overlay.appendChild(mainEl);
  if (subText) {
    const subEl = document.createElement('div');
    subEl.className = 'csh-roll-overlay-sub';
    subEl.textContent = subText;
    overlay.appendChild(subEl);
  }
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('csh-roll-overlay-visible'));
  setTimeout(() => {
    overlay.classList.remove('csh-roll-overlay-visible');
    setTimeout(() => overlay.remove(), 250);
  }, 1800);
}

function rollFreeform(formula) {
  const result = rollFormula(formula);
  const breakdown = (result.count > 1 || result.mod !== 0)
    ? `[${result.rolls.join(', ')}]${result.mod ? (result.mod >= 0 ? '+' + result.mod : result.mod) : ''}`
    : `${result.rolls[0]}`;
  const label = `${result.count}d${result.sides}${result.mod ? (result.mod >= 0 ? '+' + result.mod : result.mod) : ''}`;
  showRollResult(`🎲 ${result.total}`, `${label}: ${breakdown}`);
}

// d20 check/save/attack roll with a flat modifier, called out with nat 1/20 flavor text.
function rollCheck(label, modifier) {
  const roll = 1 + Math.floor(Math.random() * 20);
  const total = roll + modifier;
  const flavor = roll === 20 ? ' 🎉 Nat 20!' : roll === 1 ? ' 💀 Nat 1!' : '';
  showRollResult(`🎲 ${total}${flavor}`, `${label}: ${roll} ${modifier >= 0 ? '+' : ''}${modifier}`);
}

function getProficiencyBonus(fm) {
  if (typeof fm.proficiency_bonus === 'number') return fm.proficiency_bonus;
  const level = getTotalLevel(fm);
  return Math.floor((level - 1) / 4) + 2;
}

// Normalizes any of the class shapes we support into [{name, subclass, level}, ...]:
//   class: Wizard
//   class: {name: Wizard, subclass: Evocation}
//   class: [Wizard, Fighter]
//   classes: [{name: Wizard, subclass: Evocation, level: 5}, {name: Fighter, level: 2}]
// Also tolerates capitalized keys (Class/Classes) since hand-written sheets vary.
function getClassList(fm) {
  const rawList = fm.classes ?? fm.Classes ?? fm.CLASSES;
  if (Array.isArray(rawList) && rawList.length) {
    return rawList.map((c) => {
      if (typeof c === 'string') return { name: c, level: undefined };
      return {
        name: c.name || c.class || 'Class ?',
        subclass: c.subclass,
        level: c.level !== undefined ? Number(c.level) : undefined,
      };
    });
  }

  const single = fm.class ?? fm.Class ?? fm.CLASS;
  if (single === undefined || single === null || single === '') return [];

  if (Array.isArray(single)) {
    return single.map((n) => (typeof n === 'string' ? { name: n } : { name: n.name || 'Class ?', subclass: n.subclass, level: n.level }));
  }
  if (typeof single === 'object') {
    return [{
      name: single.name || 'Class ?',
      subclass: single.subclass ?? fm.subclass,
      level: single.level !== undefined ? Number(single.level) : Number(fm.level) || undefined,
    }];
  }
  return [{ name: String(single), subclass: fm.subclass, level: Number(fm.level) || undefined }];
}

function getTotalLevel(fm, classes) {
  const list = classes || getClassList(fm);
  if (list.length > 1) {
    const sum = list.reduce((acc, c) => acc + (Number(c.level) || 0), 0);
    if (sum > 0) return sum;
  }
  if (fm.level !== undefined) return Number(fm.level) || 1;
  if (list[0] && list[0].level) return Number(list[0].level) || 1;
  return 1;
}

const SKILL_LABEL_TO_ID = SKILLS.reduce((acc, s) => { acc[s.label.toLowerCase()] = s.id; return acc; }, {});
const ABILITY_LABEL_TO_ID = ABILITIES.reduce((acc, a) => { acc[a.label.toLowerCase()] = a.id; return acc; }, {});

function tableCells(line) {
  return line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
}

// Finds the markdown table whose header line contains `headerNeedle` and returns
// its rows (starting exactly at the header, not mid-line) up to the first line
// that isn't part of the table.
function findTableRows(body, headerNeedle) {
  const idx = body.indexOf(headerNeedle);
  if (idx === -1) return null;
  const lineStart = body.lastIndexOf('\n', idx) + 1;
  const lines = body.slice(lineStart).split('\n');
  const rows = [];
  for (const line of lines) {
    if (line.trim().startsWith('|')) rows.push(line);
    else break;
  }
  return rows.length ? rows : null;
}

// Parses the hand-formatted "Kadria" character sheet template (markdown tables +
// ☐/☑ checkboxes + [] bracket slot counters) into a frontmatter-shaped object.
// Only fields the template actually represents are set; anything not found in the
// body (session-only state like tracked feature uses, death saves, notes, creatures,
// sheet_url) is left untouched by the caller.
function parseSheetBody(body) {
  const out = {};

  try {
    const rows = findTableRows(body, 'Character Name');
    if (rows && rows.length >= 3) {
      const [name, , classSub, species, level, background, alignment] = tableCells(rows[2]);
      if (name) out.character = name;
      if (classSub) {
        const m = classSub.match(/^(.*?)(?:\s*\((.*?)\))?$/);
        if (m) {
          if (m[1]) out.class = m[1].trim();
          if (m[2]) out.subclass = m[2].trim();
        }
      }
      if (species) out.species = species;
      if (level) out.level = Number(level) || undefined;
      if (background) out.background = background;
      if (alignment) out.alignment = alignment;
    }
  } catch (e) { /* ignore malformed section */ }

  try {
    const abilities = {};
    const scoreRe = /\|\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s*\|\s*[+-]?\d+\s*\|\s*(\d+)\s*\|/gi;
    let m;
    while ((m = scoreRe.exec(body))) {
      const id = ABILITY_LABEL_TO_ID[m[1].toLowerCase()];
      if (!id) continue;
      abilities[id] = abilities[id] || {};
      abilities[id].score = Number(m[2]);
    }
    const saveRe = /\|\s*(☑|☐)\s*\|\s*[+-]?\d+\s*\|\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s*\|/gi;
    while ((m = saveRe.exec(body))) {
      const id = ABILITY_LABEL_TO_ID[m[2].toLowerCase()];
      if (!id) continue;
      abilities[id] = abilities[id] || {};
      abilities[id].save_prof = m[1] === '☑';
    }
    if (Object.keys(abilities).length) out.abilities = abilities;
  } catch (e) { /* ignore */ }

  try {
    const skills = {};
    const re = /\|\s*(☑|☐)\s*\|\s*[+-]?\d+\s*\|\s*([A-Za-z][A-Za-z ]*?)\s*\([A-Za-z]+\)\s*\|/g;
    let m;
    while ((m = re.exec(body))) {
      const id = SKILL_LABEL_TO_ID[m[2].trim().toLowerCase()];
      if (id) skills[id] = { prof: m[1] === '☑' ? 'prof' : 'none' };
    }
    if (Object.keys(skills).length) out.skills = skills;
  } catch (e) { /* ignore */ }

  try {
    const senses = {};
    const pp = body.match(/Passive Perception:\*\*[ \t]*(\d+)/i);
    const pi = body.match(/Passive Insight:\*\*[ \t]*(\d+)/i);
    if (pp) senses.passive_perception = Number(pp[1]);
    if (pi) senses.other = `Passive Insight: ${pi[1]}`;
    if (Object.keys(senses).length) out.senses = senses;
  } catch (e) { /* ignore */ }

  try {
    const rows = findTableRows(body, 'Armor Class');
    if (rows && rows.length >= 3) {
      const [ac, init, speed, profBonus] = tableCells(rows[2]);
      if (ac) out.ac = Number(ac) || undefined;
      if (init) out.initiative_bonus = Number(init.replace('+', '')) || 0;
      if (speed) {
        const walk = parseInt(speed, 10);
        if (!Number.isNaN(walk)) out.speed = { walk, fly: 0, swim: 0, climb: 0, burrow: 0 };
      }
      if (profBonus) out.proficiency_bonus = Number(profBonus.replace('+', '')) || undefined;
    }
  } catch (e) { /* ignore */ }

  try {
    const hp = body.match(/Hit Points \(Current \/ Max\):\*\*[ \t]*(\d+)\s*\/\s*(\d+)/i);
    if (hp) { out.hp = Number(hp[1]); out.hp_max = Number(hp[2]); }
    const temp = body.match(/Temp HP & Hit Dice:\*\*[ \t]*(\d+)\s*\/\s*(\d+)/i);
    if (temp) { out.temp_hp = Number(temp[1]); out.hit_dice_total = Number(temp[2]); }
  } catch (e) { /* ignore */ }

  try {
    const sc = body.match(/Spellcasting Ability:\*\*[ \t]*([A-Za-z]+)/i);
    const dc = body.match(/Spell Save DC:\*\*[ \t]*(\d+)/i);
    const atk = body.match(/Spell Attack Bonus:\*\*[ \t]*([+-]?\d+)/i);
    if (sc) out.spellcasting_ability = sc[1];
    if (dc) out.spell_save_dc = Number(dc[1]);
    if (atk) out.spell_attack_bonus = Number(atk[1].replace('+', ''));
  } catch (e) { /* ignore */ }

  try {
    const slotsLine = body.match(/Spell Slots:\*\*[ \t]*(.+)/i);
    if (slotsLine) {
      const chunks = slotsLine[1].split(/(?=Lvl\d)/i);
      const spellSlots = {};
      chunks.forEach((chunk) => {
        const cm = chunk.match(/Lvl(\d+)\s*(.*)/i);
        if (!cm) return;
        const rest = cm[2];
        if (/\[/.test(rest)) {
          const max = (rest.match(/\[/g) || []).length;
          const used = (rest.match(/\[[xX]\]/g) || []).length;
          spellSlots[cm[1]] = { max, used };
        } else {
          spellSlots[cm[1]] = { max: 0, used: 0 };
        }
      });
      if (Object.keys(spellSlots).length) out.spell_slots = spellSlots;
    }
  } catch (e) { /* ignore */ }

  try {
    // "Spell cards" callouts: > [!note]+ Cantrips ... / > [!note]+ Level N ...
    // followed by ![[embed]] lines for each spell in that group.
    const spellsByLevel = {};
    const calloutRe = /^>\s*\[!note\]\+\s*(Cantrips|Level\s*(\d+))[^\n]*\n((?:>.*(?:\n|$))*)/gim;
    let cm;
    while ((cm = calloutRe.exec(body))) {
      const lvl = /^cantrip/i.test(cm[1]) ? 0 : Number(cm[2]);
      const embedRe = /!\[\[([^\]]+?\.md)\]\]/g;
      const paths = [];
      let em;
      while ((em = embedRe.exec(cm[3]))) paths.push(em[1]);
      if (paths.length) spellsByLevel[lvl] = paths;
    }
    if (Object.keys(spellsByLevel).length) out.spells_by_level = spellsByLevel;
  } catch (e) { /* ignore */ }

  try {
    const covered = new Set();
    Object.values(out.spells_by_level || {}).forEach((paths) => {
      paths.forEach((p) => covered.add(p.split('/').pop().replace(/\.md$/i, '')));
    });
    const spellLinkRe = /!\[\[(?:.*\/)?([^/\]]+)\.md\]\]/g;
    const spells = [];
    let m;
    while ((m = spellLinkRe.exec(body))) {
      if (!spells.includes(m[1]) && !covered.has(m[1])) spells.push(m[1]);
    }
    out.spells = spells;
  } catch (e) { /* ignore */ }

  try {
    const idx = body.search(/\|\s*Name\s*\|\s*Atk Bonus\s*\|\s*Damage/i);
    if (idx !== -1) {
      const lines = body.slice(idx).split('\n');
      const actions = [];
      for (let i = 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim().startsWith('|')) break;
        const cells = tableCells(line);
        if (cells.length >= 3 && cells[0]) {
          actions.push({ name: cells[0], type: 'Action', detail: `${cells[1]} to hit, ${cells[2]}` });
        }
      }
      if (actions.length) out.actions = actions;
    }
  } catch (e) { /* ignore */ }

  try {
    const idx = body.search(/##\s*Equipment/i);
    if (idx !== -1) {
      const section = body.slice(idx).split(/\n##\s|\n---/)[0];
      const items = [];
      section.split('\n').forEach((line) => {
        const m = line.match(/^-\s+(.+)$/);
        if (m) items.push({ name: m[1].trim(), qty: 1 });
      });
      if (items.length) out.inventory = items;
    }
  } catch (e) { /* ignore */ }

  try {
    const traits = [];
    const cfMatch = body.match(/\*\*Class Features \(([^)]+)\):\*\*[ \t]*(.+)/i);
    if (cfMatch) {
      traits.push({ name: `Class Features (${cfMatch[1]})`, source: 'Class', description: cfMatch[2].trim() });
    }

    const stMatch = body.match(/\*\*Species Traits \(([^)]+)\):\*\*/i);
    if (stMatch) {
      const speciesName = stMatch[1];
      const section = body.slice(body.indexOf(stMatch[0]) + stMatch[0].length).split(/\n##\s|\n---/)[0];
      const bulletRe = /^-\s*\*\*(.+?)\.\*\*\s*(.*)$/gm;
      const languages = [];
      const resistances = [];
      let darkvisionFt;
      let bm;
      while ((bm = bulletRe.exec(section))) {
        const traitName = bm[1].trim();
        const desc = bm[2].trim();
        if (/^languages$/i.test(traitName)) {
          desc.split(',').forEach((l) => { const t = l.trim(); if (t) languages.push(t); });
          continue;
        }
        traits.push({ name: traitName, source: `Species (${speciesName})`, description: desc });
        if (/darkvision/i.test(traitName)) {
          const dv = desc.match(/(\d+)\s*feet/i);
          if (dv) darkvisionFt = Number(dv[1]);
        }
        const res = desc.match(/resistance to (\w+) damage/i);
        if (res) resistances.push(res[1][0].toUpperCase() + res[1].slice(1).toLowerCase());
      }
      if (languages.length) out.proficiencies = Object.assign({ armor: [], weapons: [], tools: [] }, out.proficiencies, { languages });
      if (resistances.length) out.defenses = Object.assign({ immunities: [], vulnerabilities: [] }, out.defenses, { resistances });
      if (darkvisionFt) out.senses = Object.assign({}, out.senses, { darkvision: darkvisionFt });
    }
    if (traits.length) out.traits = traits;
  } catch (e) { /* ignore */ }

  try {
    const toolsLine = body.match(/Languages & Proficiencies:\*\*[ \t]*(.+)/i);
    if (toolsLine) {
      const tools = toolsLine[1].split(',').map((t) => t.trim()).filter(Boolean);
      if (tools.length) out.proficiencies = Object.assign({ armor: [], weapons: [], languages: [] }, out.proficiencies, { tools });
    }
  } catch (e) { /* ignore */ }

  try {
    [['Traits', 'personality_traits'], ['Ideals', 'ideals'], ['Bonds', 'bonds'], ['Flaws', 'flaws']].forEach(([label, key]) => {
      const m = body.match(new RegExp(`\\*\\*${label}:\\*\\*[ \\t]*(.*)`, 'i'));
      if (m) out[key] = m[1].trim();
    });
  } catch (e) { /* ignore */ }

  try {
    const condMatch = body.match(/Active Conditions:\*\*[ \t]*(.*)/i);
    if (condMatch) {
      const text = condMatch[1].replace(/_/g, '').trim();
      out.conditions = text ? text.split(',').map((c) => c.trim()).filter(Boolean) : [];
    }
    const exLine = body.match(/Exhaustion Level:\*\*[ \t]*(.*)/i);
    if (exLine) out.exhaustion = (exLine[1].match(/☑/g) || []).length;
  } catch (e) { /* ignore */ }

  return out;
}

const STANDARD_DICE = [4, 6, 8, 10, 12, 20, 100];

class DiceModal extends Modal {
  constructor(app, defaultFormula) {
    super(app);
    this.defaultFormula = (defaultFormula || '').trim();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('csh-dice-modal');
    contentEl.createEl('h2', { text: '🎲 Roll a Die' });

    const modRow = contentEl.createDiv({ cls: 'csh-modal-row' });
    modRow.createEl('label', { text: 'Modifier: ' });
    const modInput = modRow.createEl('input', { type: 'number' });
    const defaultMod = this.defaultFormula.match(/([+-]\d+)\s*$/);
    modInput.value = defaultMod ? String(parseInt(defaultMod[1], 10)) : '0';

    const grid = contentEl.createDiv({ cls: 'csh-dice-grid' });
    STANDARD_DICE.forEach((sides) => {
      const btn = grid.createEl('button', { text: `d${sides}`, cls: 'csh-dice-btn' });
      btn.addEventListener('click', () => {
        const mod = Number(modInput.value) || 0;
        rollFreeform(`1d${sides}${mod >= 0 ? '+' + mod : mod}`);
      });
    });

    if (this.defaultFormula) {
      const customRow = contentEl.createDiv({ cls: 'csh-modal-row' });
      const customBtn = customRow.createEl('button', { text: `Roll "${this.defaultFormula}"`, cls: 'csh-dice-btn csh-dice-btn-wide' });
      customBtn.addEventListener('click', () => rollFreeform(this.defaultFormula));
    }

    const btnRow = contentEl.createDiv({ cls: 'csh-modal-btns' });
    const closeBtn = btnRow.createEl('button', { text: 'Close' });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

class LevelUpModal extends Modal {
  constructor(app, fm, classes, onSubmit) {
    super(app);
    this.fm = fm;
    this.classes = classes || [];
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Level Up' });

    let classIndex = 0;
    if (this.classes.length > 1) {
      const classRow = contentEl.createDiv({ cls: 'csh-modal-row' });
      classRow.createEl('label', { text: 'Class gaining a level: ' });
      const select = classRow.createEl('select');
      this.classes.forEach((c, idx) => {
        select.createEl('option', {
          text: `${c.name}${c.level ? ' (' + c.level + ')' : ''}`,
          value: String(idx),
        });
      });
      select.addEventListener('change', () => { classIndex = Number(select.value); });
    }

    const hitDie = this.fm.hit_die || 8;
    const avg = Math.floor(hitDie / 2) + 1;
    contentEl.createEl('p', { text: `Hit die: d${hitDie}. Average roll: ${avg}.` });

    let hpGain = avg;
    let conMod = this.fm.con_mod ?? 0;

    const hpRow = contentEl.createDiv({ cls: 'csh-modal-row' });
    hpRow.createEl('label', { text: 'HP gained (before CON mod): ' });
    const hpInput = hpRow.createEl('input', { type: 'number' });
    hpInput.value = String(avg);
    hpInput.addEventListener('change', () => { hpGain = Number(hpInput.value) || 0; });

    const conRow = contentEl.createDiv({ cls: 'csh-modal-row' });
    conRow.createEl('label', { text: 'CON modifier: ' });
    const conInput = conRow.createEl('input', { type: 'number' });
    conInput.value = String(conMod);
    conInput.addEventListener('change', () => { conMod = Number(conInput.value) || 0; });

    const btnRow = contentEl.createDiv({ cls: 'csh-modal-btns' });
    const confirmBtn = btnRow.createEl('button', { text: 'Confirm', cls: 'mod-cta' });
    confirmBtn.addEventListener('click', () => {
      this.onSubmit(hpGain + conMod, classIndex);
      this.close();
    });
    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CharacterHubView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.pageIndex = 0;
    this.isSyncing = false;
    this.isLoading = false;
    this.pages = [
      { title: '⚔️ Combat', render: (root, fm) => this.renderCombatWidget(root, fm) },
      { title: '💪 Abilities, Saves & Senses', render: (root, fm) => this.renderAbilitiesWidget(root, fm) },
      { title: '🎯 Skills', render: (root, fm) => this.renderSkillsWidget(root, fm) },
      { title: '🗡️ Actions', render: (root, fm) => this.renderActionsWidget(root, fm) },
      { title: '🎒 Inventory', render: (root, fm) => this.renderInventoryWidget(root, fm) },
      { title: '🔮 Spells & Spell Slots', render: (root, fm) => this.renderSpellsWidget(root, fm) },
      { title: '🏃 Speed & Defenses', render: (root, fm) => this.renderSpeedDefensesWidget(root, fm) },
      { title: '⭐ Features & Traits', render: (root, fm) => this.renderFeaturesTraitsWidget(root, fm) },
      { title: '📜 Proficiencies & Training', render: (root, fm) => this.renderProficienciesWidget(root, fm) },
      { title: '📖 Background', render: (root, fm) => this.renderBackgroundWidget(root, fm) },
      { title: '📝 Notes', render: (root, fm) => this.renderNotesWidget(root, fm) },
      { title: '🐾 Extras: Creatures', render: (root, fm) => this.renderCreaturesWidget(root, fm) },
      { title: '🌙 Rest', render: (root, fm) => this.renderRestWidget(root, fm) },
      { title: '⬆️ Level Up', render: (root, fm) => this.renderLevelUpWidget(root, fm) },
    ];
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'My Little Guy'; }
  getIcon() { return 'user'; }

  async onOpen() {
    this.contentEl.addClass('csh-root');
    await this.render();
    await this.syncFrontmatterFromBody();
    this.registerEvent(this.app.vault.on('modify', async (f) => {
      if (!this.file || f.path !== this.file.path) return;
      if (this.isSyncing) { this.isSyncing = false; return; }
      await this.syncFrontmatterFromBody();
    }));
  }

  async getFile() {
    const path = this.plugin.settings.sheetPath;
    if (path) {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (f) return f;
    }
    if (this.plugin.lastActiveFile) return this.plugin.lastActiveFile;
    return this.app.workspace.getActiveFile();
  }

  async updateFrontmatter(mutator) {
    if (!this.file) return;
    this.isSyncing = true;
    await this.app.fileManager.processFrontMatter(this.file, mutator);
    await this.render();
  }

  // Re-parses the markdown body (tables/checkboxes) and rewrites the derived
  // frontmatter fields to match. Runs on every edit to the tracked file, so any
  // live widget state (HP, used spell slots, conditions, etc.) that isn't also
  // reflected in the printed sheet gets reverted to the sheet's values — that's
  // the accepted tradeoff of keeping the printed sheet as the source of truth.
  async syncFrontmatterFromBody() {
    if (!this.file) return;
    const content = await this.app.vault.read(this.file);
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const parsed = parseSheetBody(body);
    if (!parsed || !Object.keys(parsed).length) return;

    new Notice('Character sheet edited — regenerating data, one moment…');
    this.isLoading = true;
    await this.render();

    this.isSyncing = true;
    await this.app.fileManager.processFrontMatter(this.file, (fm) => {
      Object.entries(parsed).forEach(([k, v]) => { fm[k] = v; });
    });

    this.isLoading = false;
    await this.render();
  }

  async render() {
    const root = this.contentEl;
    root.empty();

    if (this.isLoading) {
      root.createEl('div', { cls: 'csh-loading', text: 'Syncing character sheet from markdown…' });
      return;
    }

    const file = await this.getFile();
    if (!file || file.extension !== 'md') {
      this.file = null;
      root.createEl('div', {
        text: 'No character sheet selected. Open a markdown note, or set one in this plugin\'s settings.',
        cls: 'csh-empty',
      });
      return;
    }
    this.file = file;

    const cache = this.app.metadataCache.getFileCache(file);
    const fm = (cache && cache.frontmatter) || {};

    this.renderTrackBar(root, file);
    root.createEl('h2', { text: fm.character || file.basename });
    this.renderHeader(root, fm);
    this.renderPager(root, fm);
  }

  renderTrackBar(root, file) {
    const bar = root.createDiv({ cls: 'csh-track-bar' });
    const pinned = !!this.plugin.settings.sheetPath;
    bar.createEl('span', {
      cls: 'csh-muted',
      text: `Tracking: ${file.path}${pinned ? ' (pinned)' : ' (following active note)'}`,
    });
    const pinBtn = bar.createEl('button', { text: pinned ? 'Unpin' : 'Pin this file', cls: 'csh-pin-btn' });
    pinBtn.addEventListener('click', async () => {
      this.plugin.settings.sheetPath = pinned ? '' : file.path;
      await this.plugin.saveSettings();
      this.render();
    });
  }

  renderHeader(root, fm) {
    const el = root.createDiv({ cls: 'csh-section csh-header' });
    const classes = getClassList(fm);
    const totalLevel = getTotalLevel(fm, classes);
    const classText = classes.length
      ? classes.map((c) => `${c.name}${c.subclass ? ' (' + c.subclass + ')' : ''}${classes.length > 1 && c.level ? ' ' + c.level : ''}`).join(' / ')
      : 'Class ?';
    el.createEl('div', {
      cls: 'csh-subtitle',
      text: `${classText} — Level ${totalLevel}${fm.species ? ' · ' + fm.species : ''}`,
    });

    const statRow = el.createDiv({ cls: 'csh-hp-row' });
    statRow.createEl('span', { text: '❤️ HP: ' });
    const hpCur = statRow.createEl('input', { type: 'number', cls: 'csh-hp-input' });
    hpCur.value = String(fm.hp ?? fm.hp_max ?? 0);
    statRow.createEl('span', { text: ' / ' + String(fm.hp_max ?? 0) });
    hpCur.addEventListener('change', () => {
      const v = Number(hpCur.value) || 0;
      this.updateFrontmatter((f) => { f.hp = v; });
    });

    statRow.createEl('span', { text: '   🛡️ AC: ' });
    const acInput = statRow.createEl('input', { type: 'number', cls: 'csh-hp-input' });
    acInput.value = String(fm.ac ?? 10);
    acInput.addEventListener('change', () => {
      this.updateFrontmatter((f) => { f.ac = Number(acInput.value) || 10; });
    });

    const toolRow = el.createDiv({ cls: 'csh-header-tool-row' });
    const shortBtn = toolRow.createEl('button', { text: '🔥 Short', cls: 'csh-header-rest-btn' });
    shortBtn.addEventListener('click', () => this.doShortRest());
    const longBtn = toolRow.createEl('button', { text: '🌙 Long', cls: 'csh-header-rest-btn' });
    longBtn.addEventListener('click', () => this.doLongRest());
    const diceInput = toolRow.createEl('input', { type: 'text', cls: 'csh-dice-input', placeholder: '1d20+5' });
    const rollBtn = toolRow.createEl('button', { text: '🎲 Roll', cls: 'csh-header-rest-btn' });
    const openDicePicker = () => new DiceModal(this.app, diceInput.value).open();
    rollBtn.addEventListener('click', openDicePicker);
    diceInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDicePicker(); });

    if (typeof fm.exhaustion === 'number' && fm.exhaustion > 0) {
      el.createEl('div', { cls: 'csh-muted', text: `💀 Exhaustion: ${fm.exhaustion}` });
    }
  }

  renderPager(root, fm) {
    const nav = root.createDiv({ cls: 'csh-page-nav' });
    const prevBtn = nav.createEl('button', { text: '‹', cls: 'csh-page-arrow' });
    const titleWrap = nav.createDiv({ cls: 'csh-page-title-wrap' });
    titleWrap.createEl('div', { cls: 'csh-page-title', text: this.pages[this.pageIndex].title });
    titleWrap.createEl('div', { cls: 'csh-page-counter', text: `${this.pageIndex + 1} / ${this.pages.length}` });
    const nextBtn = nav.createEl('button', { text: '›', cls: 'csh-page-arrow' });

    prevBtn.addEventListener('click', () => {
      this.pageIndex = (this.pageIndex - 1 + this.pages.length) % this.pages.length;
      this.render();
    });
    nextBtn.addEventListener('click', () => {
      this.pageIndex = (this.pageIndex + 1) % this.pages.length;
      this.render();
    });

    const dots = root.createDiv({ cls: 'csh-page-dots' });
    this.pages.forEach((p, idx) => {
      const dot = dots.createEl('button', { cls: 'csh-dot' + (idx === this.pageIndex ? ' active' : '') });
      dot.setAttr('aria-label', p.title);
      dot.addEventListener('click', () => { this.pageIndex = idx; this.render(); });
    });

    const pageBody = root.createDiv({ cls: 'csh-page-body' });
    this.pages[this.pageIndex].render(pageBody, fm);
  }

  async doShortRest() {
    await this.updateFrontmatter((f) => {
      if (f.pact_slots) f.pact_slots.used = 0;
      (f.resources || []).forEach((r) => { if (r.recovery === 'short') r.used = 0; });
      (f.features || []).forEach((ft) => { if (ft.recovery === 'short') ft.used = 0; });
    });
    new Notice('Short rest complete.');
  }

  async doLongRest() {
    await this.updateFrontmatter((f) => {
      if (typeof f.hp_max === 'number') f.hp = f.hp_max;
      if (f.spell_slots) {
        Object.keys(f.spell_slots).forEach((lvl) => { f.spell_slots[lvl].used = 0; });
      }
      if (f.pact_slots) f.pact_slots.used = 0;
      (f.resources || []).forEach((r) => { r.used = 0; });
      (f.features || []).forEach((ft) => { ft.used = 0; });
      if (typeof f.hit_dice_used === 'number') {
        const total = f.hit_dice_total || f.level || 1;
        f.hit_dice_used = Math.max(0, f.hit_dice_used - Math.max(1, Math.floor(total / 2)));
      }
      if (typeof f.exhaustion === 'number' && f.exhaustion > 0) f.exhaustion -= 1;
      if (f.death_saves) f.death_saves = { successes: 0, failures: 0 };
    });
    new Notice('Long rest complete — HP, spell slots, and features restored.');
  }

  renderRestWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });
    const btnRow = sec.createDiv({ cls: 'csh-btn-row' });

    const shortBtn = btnRow.createEl('button', { text: '🔥 Short Rest', cls: 'csh-rest-btn' });
    shortBtn.addEventListener('click', () => this.doShortRest());

    const longBtn = btnRow.createEl('button', { text: '🌙 Long Rest', cls: 'csh-rest-btn csh-long' });
    longBtn.addEventListener('click', () => this.doLongRest());
  }

  renderCombatWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });

    // Health (current HP & AC live in the top bar — this block covers what's unique to combat)
    const hpBlock = sec.createDiv({ cls: 'csh-combat-block' });
    hpBlock.createEl('h4', { text: '❤️ Health' });

    const tempRow = hpBlock.createDiv({ cls: 'csh-hp-row' });
    tempRow.createEl('span', { text: '✨ Temp HP: ' });
    const tempInput = tempRow.createEl('input', { type: 'number', cls: 'csh-hp-input' });
    tempInput.value = String(fm.temp_hp ?? 0);
    tempInput.addEventListener('change', () => {
      this.updateFrontmatter((f) => { f.temp_hp = Number(tempInput.value) || 0; });
    });

    const dmgRow = hpBlock.createDiv({ cls: 'csh-btn-row' });
    const amountInput = dmgRow.createEl('input', { type: 'number', cls: 'csh-hp-input', placeholder: 'Amt' });
    const dmgBtn = dmgRow.createEl('button', { text: '🗡️ Damage', cls: 'csh-rest-btn' });
    const healBtn = dmgRow.createEl('button', { text: '💚 Heal', cls: 'csh-rest-btn csh-long' });
    dmgBtn.addEventListener('click', () => {
      const amt = Number(amountInput.value) || 0;
      if (amt <= 0) return;
      this.updateFrontmatter((f) => {
        let remaining = amt;
        const temp = f.temp_hp || 0;
        if (temp > 0) {
          const absorbed = Math.min(temp, remaining);
          f.temp_hp = temp - absorbed;
          remaining -= absorbed;
        }
        f.hp = Math.max(0, (f.hp || 0) - remaining);
      });
    });
    healBtn.addEventListener('click', () => {
      const amt = Number(amountInput.value) || 0;
      if (amt <= 0) return;
      this.updateFrontmatter((f) => {
        const max = f.hp_max || 0;
        f.hp = Math.min(max, (f.hp || 0) + amt);
      });
    });

    // Death saves
    const dsBlock = sec.createDiv({ cls: 'csh-combat-block' });
    dsBlock.createEl('h4', { text: '💀 Death Saves' });
    const ds = fm.death_saves || { successes: 0, failures: 0 };

    const sRow = dsBlock.createDiv({ cls: 'csh-slot-row' });
    sRow.createEl('span', { text: '✅ Success', cls: 'csh-slot-label' });
    const sPips = sRow.createDiv({ cls: 'csh-pips' });
    for (let i = 0; i < 3; i++) {
      const pip = sPips.createEl('button', { cls: 'csh-pip csh-pip-success' + (i < (ds.successes || 0) ? ' used' : '') });
      pip.addEventListener('click', () => {
        this.updateFrontmatter((f) => {
          f.death_saves = f.death_saves || { successes: 0, failures: 0 };
          f.death_saves.successes = (i < f.death_saves.successes) ? i : i + 1;
        });
      });
    }

    const fRow = dsBlock.createDiv({ cls: 'csh-slot-row' });
    fRow.createEl('span', { text: '❌ Failure', cls: 'csh-slot-label' });
    const fPips = fRow.createDiv({ cls: 'csh-pips' });
    for (let i = 0; i < 3; i++) {
      const pip = fPips.createEl('button', { cls: 'csh-pip csh-pip-failure' + (i < (ds.failures || 0) ? ' used' : '') });
      pip.addEventListener('click', () => {
        this.updateFrontmatter((f) => {
          f.death_saves = f.death_saves || { successes: 0, failures: 0 };
          f.death_saves.failures = (i < f.death_saves.failures) ? i : i + 1;
        });
      });
    }

    // Conditions
    const condBlock = sec.createDiv({ cls: 'csh-combat-block' });
    condBlock.createEl('h4', { text: '☣️ Conditions' });
    const active = fm.conditions || [];
    const condGrid = condBlock.createDiv({ cls: 'csh-condition-grid' });

    STANDARD_CONDITIONS.forEach((cond) => {
      const isActive = active.includes(cond);
      const chip = condGrid.createEl('button', { text: cond, cls: 'csh-condition-chip' + (isActive ? ' active' : '') });
      chip.addEventListener('click', () => {
        this.updateFrontmatter((f) => {
          f.conditions = f.conditions || [];
          const idx = f.conditions.indexOf(cond);
          if (idx >= 0) f.conditions.splice(idx, 1);
          else f.conditions.push(cond);
        });
      });
    });
    active.filter((c) => !STANDARD_CONDITIONS.includes(c)).forEach((cond) => {
      const chip = condGrid.createEl('button', { text: cond, cls: 'csh-condition-chip active' });
      chip.addEventListener('click', () => {
        this.updateFrontmatter((f) => {
          f.conditions = (f.conditions || []).filter((c) => c !== cond);
        });
      });
    });

    const addCondRow = condBlock.createDiv({ cls: 'csh-add-row' });
    const condInput = addCondRow.createEl('input', { type: 'text', placeholder: 'Custom condition...' });
    const addCondBtn = addCondRow.createEl('button', { text: '+' });
    const addCustomCondition = () => {
      const v = condInput.value.trim();
      if (!v) return;
      this.updateFrontmatter((f) => {
        f.conditions = f.conditions || [];
        if (!f.conditions.includes(v)) f.conditions.push(v);
      });
    };
    addCondBtn.addEventListener('click', addCustomCondition);
    condInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustomCondition(); });

    // Class features & their uses
    const featBlock = sec.createDiv({ cls: 'csh-combat-block' });
    featBlock.createEl('h4', { text: '⚡ Class Features' });
    const features = fm.features || [];
    if (!features.length) {
      featBlock.createEl('div', { cls: 'csh-muted', text: 'No tracked features yet.' });
    }

    features.forEach((feat, idx) => {
      const row = featBlock.createDiv({ cls: 'csh-feature-row' });

      const nameInput = row.createEl('input', { type: 'text', cls: 'csh-item-name' });
      nameInput.value = feat.name || '';
      nameInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.features[idx].name = nameInput.value; });
      });

      const maxInput = row.createEl('input', { type: 'number', cls: 'csh-feature-max', title: 'Max uses' });
      maxInput.value = String(feat.max ?? 0);
      maxInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.features[idx].max = Math.max(0, Number(maxInput.value) || 0); });
      });

      const recoverySelect = row.createEl('select', { cls: 'csh-feature-recovery-select' });
      ['short', 'long', 'other'].forEach((r) => {
        recoverySelect.createEl('option', { text: r, value: r });
      });
      recoverySelect.value = feat.recovery || 'short';
      recoverySelect.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.features[idx].recovery = recoverySelect.value; });
      });

      const max = feat.max || 0;
      if (max > 0) {
        const pips = row.createDiv({ cls: 'csh-pips' });
        for (let i = 0; i < max; i++) {
          const pip = pips.createEl('button', { cls: 'csh-pip' + (i < (feat.used || 0) ? ' used' : '') });
          pip.addEventListener('click', () => {
            this.updateFrontmatter((f) => {
              const cur = f.features[idx];
              cur.used = (i < cur.used) ? i : i + 1;
            });
          });
        }
      }

      const del = row.createEl('button', { text: '✕', cls: 'csh-del-btn' });
      del.addEventListener('click', () => {
        this.updateFrontmatter((f) => { f.features.splice(idx, 1); });
      });
    });

    const addFeatBtn = featBlock.createEl('button', { text: '+ Add feature', cls: 'csh-add-btn' });
    addFeatBtn.addEventListener('click', () => {
      this.updateFrontmatter((f) => {
        f.features = f.features || [];
        f.features.push({ name: 'New Feature', max: 1, used: 0, recovery: 'short' });
      });
    });
  }

  renderLevelUpWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });
    const classes = getClassList(fm);
    const level = getTotalLevel(fm, classes);
    const prof = Math.floor((level - 1) / 4) + 2;
    sec.createEl('div', { cls: 'csh-muted', text: `Current Level ${level} · Proficiency +${prof}` });

    const btn = sec.createEl('button', { text: '⬆️ Level Up', cls: 'csh-levelup-btn' });
    btn.addEventListener('click', () => {
      new LevelUpModal(this.app, fm, classes, async (hpGain, classIndex) => {
        let newLevel = level + 1;
        await this.updateFrontmatter((f) => {
          if (Array.isArray(f.classes) && f.classes.length) {
            const target = f.classes[classIndex];
            if (target && typeof target === 'object') {
              target.level = (Number(target.level) || 0) + 1;
            } else {
              f.classes[classIndex] = { name: target, level: 1 };
            }
            f.level = f.classes.reduce((acc, c) => acc + (Number(typeof c === 'object' ? c.level : 0) || 0), 0);
          } else {
            f.level = (f.level || 1) + 1;
          }
          newLevel = f.level;
          f.proficiency_bonus = Math.floor((f.level - 1) / 4) + 2;
          f.hp_max = (f.hp_max || 0) + hpGain;
          f.hp = (f.hp || 0) + hpGain;
          if (f.hit_dice_total !== undefined) f.hit_dice_total = (f.hit_dice_total || 0) + 1;
        });
        new Notice(`Leveled up to ${newLevel}!`);
        if (MILESTONE_LEVELS.includes(newLevel)) {
          new Notice('Milestone level — remember your Ability Score Improvement / Feat.');
        }
      }).open();
    });
  }

  renderSpellsWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });

    if (fm.spellcasting_ability || fm.spell_save_dc !== undefined || fm.spell_attack_bonus !== undefined) {
      const parts = [];
      if (fm.spellcasting_ability) parts.push(`🔮 ${fm.spellcasting_ability}`);
      if (fm.spell_save_dc !== undefined) parts.push(`Save DC ${fm.spell_save_dc}`);
      if (fm.spell_attack_bonus !== undefined) parts.push(`Attack ${fmtMod(fm.spell_attack_bonus)}`);
      sec.createEl('div', { cls: 'csh-muted', text: parts.join(' · ') });
    }

    const slots = fm.spell_slots || {};
    const byLevel = fm.spells_by_level || {};
    const levelKeys = new Set([...Object.keys(slots), ...Object.keys(byLevel)].map(Number));
    const sortedLevels = Array.from(levelKeys).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);

    if (!sortedLevels.length && !fm.pact_slots) {
      sec.createEl('div', { cls: 'csh-muted', text: 'No spells or spell slots recorded yet.' });
    }

    sortedLevels.forEach((lvl) => {
      const spellPaths = byLevel[lvl] || [];
      const slot = slots[lvl];
      if (!spellPaths.length && !(slot && slot.max)) return;

      const levelSec = sec.createDiv({ cls: 'csh-spell-level' });
      const headerRow = levelSec.createDiv({ cls: 'csh-spell-level-header' });
      headerRow.createEl('h4', { text: lvl === 0 ? '✨ Cantrips' : `🔹 Level ${lvl}` });

      if (lvl === 0) {
        headerRow.createEl('span', { cls: 'csh-muted', text: 'At will' });
      } else if (slot) {
        const pips = headerRow.createDiv({ cls: 'csh-pips' });
        for (let i = 0; i < (slot.max || 0); i++) {
          const pip = pips.createEl('button', { cls: 'csh-pip' + (i < (slot.used || 0) ? ' used' : '') });
          pip.addEventListener('click', () => {
            this.updateFrontmatter((f) => {
              const cur = (f.spell_slots || {})[lvl];
              if (cur) cur.used = (i < cur.used) ? i : i + 1;
            });
          });
        }
      }

      if (spellPaths.length) {
        const cardsWrap = levelSec.createDiv({ cls: 'csh-spell-cards' });
        spellPaths.forEach((path) => {
          const card = cardsWrap.createDiv({ cls: 'csh-spell-card' });
          const name = path.split('/').pop().replace(/\.md$/i, '');
          card.createEl('div', { cls: 'csh-spell-card-name', text: `📖 ${name}` });
          const embedEl = card.createDiv({ cls: 'csh-spell-card-embed' });
          MarkdownRenderer.render(this.app, `![[${path}]]`, embedEl, this.file.path, this).catch(() => {
            embedEl.setText(`Couldn't find "${path}" in the vault.`);
          });
        });
      }
    });

    if (fm.pact_slots) {
      const p = fm.pact_slots;
      const row = sec.createDiv({ cls: 'csh-slot-row' });
      row.createEl('span', { text: '🔺 Pact', cls: 'csh-slot-label' });
      const pips = row.createDiv({ cls: 'csh-pips' });
      for (let i = 0; i < (p.max || 0); i++) {
        const pip = pips.createEl('button', { cls: 'csh-pip' + (i < (p.used || 0) ? ' used' : '') });
        pip.addEventListener('click', () => {
          this.updateFrontmatter((f) => {
            f.pact_slots.used = (i < f.pact_slots.used) ? i : i + 1;
          });
        });
      }
    }

    sec.createEl('h4', { text: '📋 Other Known Spells' });
    sec.createEl('div', { cls: 'csh-muted', text: 'Quick-add spells that don\'t have a linked note yet.' });
    const spellList = sec.createDiv({ cls: 'csh-spell-list' });
    const spells = fm.spells || [];
    spells.forEach((sp, idx) => {
      const row = spellList.createDiv({ cls: 'csh-spell-row' });
      row.createEl('span', { text: sp });
      const del = row.createEl('button', { text: '✕', cls: 'csh-del-btn' });
      del.addEventListener('click', () => {
        this.updateFrontmatter((f) => { f.spells.splice(idx, 1); });
      });
    });

    const addRow = sec.createDiv({ cls: 'csh-add-row' });
    const input = addRow.createEl('input', { type: 'text', placeholder: 'Add spell...' });
    const addBtn = addRow.createEl('button', { text: '+' });
    const addSpell = () => {
      const v = input.value.trim();
      if (!v) return;
      this.updateFrontmatter((f) => { f.spells = f.spells || []; f.spells.push(v); });
    };
    addBtn.addEventListener('click', addSpell);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSpell(); });
  }

  renderInventoryWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });

    const list = sec.createDiv({ cls: 'csh-inventory-list' });
    const items = fm.inventory || [];
    items.forEach((item, idx) => {
      const row = list.createDiv({ cls: 'csh-inventory-row' });
      const nameInput = row.createEl('input', { type: 'text', cls: 'csh-item-name' });
      nameInput.value = item.name || '';
      nameInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.inventory[idx].name = nameInput.value; });
      });

      const qtyWrap = row.createDiv({ cls: 'csh-qty-wrap' });
      const minus = qtyWrap.createEl('button', { text: '-' });
      qtyWrap.createEl('span', { text: String(item.qty ?? 1), cls: 'csh-qty' });
      const plus = qtyWrap.createEl('button', { text: '+' });
      minus.addEventListener('click', () => {
        this.updateFrontmatter((f) => {
          f.inventory[idx].qty = Math.max(0, (f.inventory[idx].qty || 1) - 1);
        });
      });
      plus.addEventListener('click', () => {
        this.updateFrontmatter((f) => {
          f.inventory[idx].qty = (f.inventory[idx].qty || 0) + 1;
        });
      });

      const del = row.createEl('button', { text: '✕', cls: 'csh-del-btn' });
      del.addEventListener('click', () => {
        this.updateFrontmatter((f) => { f.inventory.splice(idx, 1); });
      });
    });

    const addBtn = sec.createEl('button', { text: '+ Add item', cls: 'csh-add-btn' });
    addBtn.addEventListener('click', () => {
      this.updateFrontmatter((f) => {
        f.inventory = f.inventory || [];
        f.inventory.push({ name: 'New Item', qty: 1 });
      });
    });
  }

  // Reusable tag/chip list editor (used for defenses, languages, tools, etc).
  renderChipEditor(container, items, onChange) {
    const grid = container.createDiv({ cls: 'csh-condition-grid' });
    items.forEach((item, idx) => {
      const chip = grid.createEl('button', { text: item, cls: 'csh-condition-chip active' });
      chip.addEventListener('click', () => {
        const next = items.slice();
        next.splice(idx, 1);
        onChange(next);
      });
    });
    const addRow = container.createDiv({ cls: 'csh-add-row' });
    const input = addRow.createEl('input', { type: 'text', placeholder: 'Add...' });
    const addBtn = addRow.createEl('button', { text: '+' });
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      onChange(items.concat([v]));
    };
    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  }

  renderAbilitiesWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });
    const abilities = fm.abilities || {};
    const prof = getProficiencyBonus(fm);

    const grid = sec.createDiv({ cls: 'csh-ability-grid' });
    ABILITIES.forEach(({ id, label }) => {
      const a = abilities[id] || {};
      const score = a.score ?? 10;
      const mod = abilityMod(score);

      const card = grid.createDiv({ cls: 'csh-ability-card' });
      card.createEl('div', { cls: 'csh-ability-label', text: label.slice(0, 3).toUpperCase() });
      const scoreInput = card.createEl('input', { type: 'number', cls: 'csh-ability-score' });
      scoreInput.value = String(score);
      scoreInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => {
          f.abilities = f.abilities || {};
          f.abilities[id] = f.abilities[id] || {};
          f.abilities[id].score = Number(scoreInput.value) || 10;
        });
      });
      const modRow = card.createDiv({ cls: 'csh-ability-mod-row' });
      modRow.createEl('div', { cls: 'csh-ability-mod', text: fmtMod(mod) });
      const checkRollBtn = modRow.createEl('button', { text: '🎲', cls: 'csh-roll-btn-sm', title: `Roll ${label} check` });
      checkRollBtn.addEventListener('click', () => rollCheck(`${label} Check`, mod));

      const saveTotal = mod + (a.save_prof ? prof : 0);
      const saveRow = card.createDiv({ cls: 'csh-ability-save' });
      const saveCheck = saveRow.createEl('input', { type: 'checkbox' });
      saveCheck.checked = !!a.save_prof;
      saveRow.createEl('span', { text: ` Save ${fmtMod(saveTotal)}` });
      saveCheck.addEventListener('change', () => {
        this.updateFrontmatter((f) => {
          f.abilities = f.abilities || {};
          f.abilities[id] = f.abilities[id] || {};
          f.abilities[id].save_prof = saveCheck.checked;
        });
      });
      const saveRollBtn = saveRow.createEl('button', { text: '🎲', cls: 'csh-roll-btn-sm', title: `Roll ${label} save` });
      saveRollBtn.addEventListener('click', () => rollCheck(`${label} Save`, saveTotal));
    });

    const senses = fm.senses || {};
    sec.createEl('h4', { text: '👁️ Senses' });
    const sensesBlock = sec.createDiv();
    const passivePerception = senses.passive_perception ?? (10 + abilityMod((abilities.wis || {}).score ?? 10));
    sensesBlock.createEl('div', { cls: 'csh-muted', text: `Passive Perception: ${passivePerception}` });
    if (senses.darkvision) sensesBlock.createEl('div', { cls: 'csh-muted', text: `Darkvision: ${senses.darkvision}ft` });
    if (senses.other) sensesBlock.createEl('div', { cls: 'csh-muted', text: senses.other });
  }

  renderSkillsWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });
    const abilities = fm.abilities || {};
    const skillsFm = fm.skills || {};
    const prof = getProficiencyBonus(fm);

    const list = sec.createDiv({ cls: 'csh-skill-list' });
    SKILLS.forEach(({ id, label, ability }) => {
      const s = skillsFm[id] || {};
      const abilityId = s.ability || ability;
      const score = (abilities[abilityId] || {}).score ?? 10;
      const mod = abilityMod(score);
      const profLevel = s.prof || 'none';
      const total = mod + Math.floor(prof * (PROF_MULT[profLevel] ?? 0));

      const row = list.createDiv({ cls: 'csh-skill-row' });
      row.createEl('span', { cls: 'csh-skill-name', text: `${label} (${abilityId.toUpperCase()})` });
      row.createEl('span', { cls: 'csh-skill-total', text: fmtMod(total) });
      const select = row.createEl('select', { cls: 'csh-skill-prof-select' });
      [['none', '—'], ['half', '½'], ['prof', '●'], ['expertise', '●●']].forEach(([val, txt]) => {
        select.createEl('option', { text: txt, value: val });
      });
      select.value = profLevel;
      select.addEventListener('change', () => {
        this.updateFrontmatter((f) => {
          f.skills = f.skills || {};
          f.skills[id] = f.skills[id] || {};
          f.skills[id].prof = select.value;
        });
      });

      const rollBtn = row.createEl('button', { text: '🎲', cls: 'csh-roll-btn', title: `Roll ${label}` });
      rollBtn.addEventListener('click', () => rollCheck(label, total));
    });
  }

  renderActionsWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });
    const actions = fm.actions || [];
    const list = sec.createDiv({ cls: 'csh-action-list' });
    if (!actions.length) list.createEl('div', { cls: 'csh-muted', text: 'No actions recorded yet.' });

    actions.forEach((act, idx) => {
      const wrap = list.createDiv({ cls: 'csh-action-item' });
      const row = wrap.createDiv({ cls: 'csh-action-row' });

      const nameInput = row.createEl('input', { type: 'text', cls: 'csh-item-name' });
      nameInput.value = act.name || '';
      nameInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.actions[idx].name = nameInput.value; });
      });

      const typeSelect = row.createEl('select');
      ['Action', 'Bonus Action', 'Reaction', 'Other'].forEach((t) => typeSelect.createEl('option', { text: t, value: t }));
      typeSelect.value = act.type || 'Action';
      typeSelect.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.actions[idx].type = typeSelect.value; });
      });

      const atkMatch = (act.detail || '').match(/([+-]\d+)\s*to hit/i);
      if (atkMatch) {
        const bonus = parseInt(atkMatch[1], 10);
        const atkRollBtn = row.createEl('button', { text: '🎲', cls: 'csh-roll-btn', title: `Roll ${act.name || 'attack'} to-hit` });
        atkRollBtn.addEventListener('click', () => rollCheck(act.name || 'Attack', bonus));
      }

      const dmgMatch = (act.detail || '').match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
      if (dmgMatch) {
        const dmgRollBtn = row.createEl('button', { text: '🎲 dmg', cls: 'csh-roll-btn', title: `Roll ${act.name || 'attack'} damage` });
        dmgRollBtn.addEventListener('click', () => rollFreeform(dmgMatch[1]));
      }

      const del = row.createEl('button', { text: '✕', cls: 'csh-del-btn' });
      del.addEventListener('click', () => {
        this.updateFrontmatter((f) => { f.actions.splice(idx, 1); });
      });

      const detailInput = wrap.createEl('input', { type: 'text', cls: 'csh-action-detail', placeholder: 'Attack bonus / damage / effect...' });
      detailInput.value = act.detail || '';
      detailInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.actions[idx].detail = detailInput.value; });
      });
    });

    const addBtn = sec.createEl('button', { text: '+ Add action', cls: 'csh-add-btn' });
    addBtn.addEventListener('click', () => {
      this.updateFrontmatter((f) => {
        f.actions = f.actions || [];
        f.actions.push({ name: 'New Action', type: 'Action', detail: '' });
      });
    });
  }

  renderSpeedDefensesWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });

    sec.createEl('h4', { text: '🏃 Speed (ft)' });
    const speed = fm.speed || {};
    const speedIcons = { walk: '🚶', fly: '🕊️', swim: '🏊', climb: '🧗', burrow: '⛏️' };
    const speedGrid = sec.createDiv({ cls: 'csh-speed-grid' });
    ['walk', 'fly', 'swim', 'climb', 'burrow'].forEach((key) => {
      const wrap = speedGrid.createDiv({ cls: 'csh-speed-item' });
      wrap.createEl('span', { cls: 'csh-muted', text: `${speedIcons[key]} ${key}` });
      const input = wrap.createEl('input', { type: 'number' });
      input.value = String(speed[key] ?? 0);
      input.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.speed = f.speed || {}; f.speed[key] = Number(input.value) || 0; });
      });
    });

    sec.createEl('h4', { text: '🛡️ Defenses' });
    const defRow = sec.createDiv({ cls: 'csh-hp-row' });
    defRow.createEl('span', { text: '💨 Initiative: ' });
    const initInput = defRow.createEl('input', { type: 'number', cls: 'csh-hp-input' });
    initInput.value = String(fm.initiative_bonus ?? 0);
    initInput.addEventListener('change', () => {
      this.updateFrontmatter((f) => { f.initiative_bonus = Number(initInput.value) || 0; });
    });
    defRow.createEl('span', { text: '  (AC lives in the top bar)', cls: 'csh-muted' });

    const defenses = fm.defenses || {};
    [['resistances', '🔰 Resistances'], ['immunities', '✨ Immunities'], ['vulnerabilities', '💥 Vulnerabilities']].forEach(([key, label]) => {
      sec.createEl('h4', { text: label });
      this.renderChipEditor(sec, defenses[key] || [], (list) => {
        this.updateFrontmatter((f) => { f.defenses = f.defenses || {}; f.defenses[key] = list; });
      });
    });
  }

  renderFeaturesTraitsWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });
    const traits = fm.traits || [];
    if (!traits.length) sec.createEl('div', { cls: 'csh-muted', text: 'No traits recorded yet.' });

    traits.forEach((t, idx) => {
      const card = sec.createDiv({ cls: 'csh-trait-card' });
      const header = card.createDiv({ cls: 'csh-trait-header' });

      const nameInput = header.createEl('input', { type: 'text', cls: 'csh-item-name' });
      nameInput.value = t.name || '';
      nameInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.traits[idx].name = nameInput.value; });
      });

      const sourceInput = header.createEl('input', { type: 'text', cls: 'csh-trait-source', placeholder: 'Species / Class / Feat' });
      sourceInput.value = t.source || '';
      sourceInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.traits[idx].source = sourceInput.value; });
      });

      const del = header.createEl('button', { text: '✕', cls: 'csh-del-btn' });
      del.addEventListener('click', () => {
        this.updateFrontmatter((f) => { f.traits.splice(idx, 1); });
      });

      const desc = card.createEl('textarea', { cls: 'csh-trait-desc' });
      desc.value = t.description || '';
      desc.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.traits[idx].description = desc.value; });
      });
    });

    const addBtn = sec.createEl('button', { text: '+ Add trait', cls: 'csh-add-btn' });
    addBtn.addEventListener('click', () => {
      this.updateFrontmatter((f) => {
        f.traits = f.traits || [];
        f.traits.push({ name: 'New Trait', source: '', description: '' });
      });
    });
  }

  renderProficienciesWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });
    const prof = fm.proficiencies || {};
    [['armor', '🥋 Armor'], ['weapons', '⚔️ Weapons'], ['tools', '🛠️ Tools'], ['languages', '🗣️ Languages']].forEach(([key, label]) => {
      sec.createEl('h4', { text: label });
      this.renderChipEditor(sec, prof[key] || [], (list) => {
        this.updateFrontmatter((f) => { f.proficiencies = f.proficiencies || {}; f.proficiencies[key] = list; });
      });
    });
  }

  renderBackgroundWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });

    const nameRow = sec.createDiv({ cls: 'csh-hp-row' });
    nameRow.createEl('span', { text: 'Background: ' });
    const bgInput = nameRow.createEl('input', { type: 'text' });
    bgInput.value = fm.background || '';
    bgInput.addEventListener('change', () => {
      this.updateFrontmatter((f) => { f.background = bgInput.value; });
    });

    [
      ['personality_traits', '🙂 Personality Traits'],
      ['ideals', '⭐ Ideals'],
      ['bonds', '🔗 Bonds'],
      ['flaws', '💢 Flaws'],
      ['backstory', '📜 Backstory'],
    ].forEach(([key, label]) => {
      sec.createEl('h4', { text: label });
      const ta = sec.createEl('textarea', { cls: 'csh-trait-desc' });
      ta.value = fm[key] || '';
      ta.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f[key] = ta.value; });
      });
    });
  }

  renderNotesWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });

    sec.createEl('h4', { text: '🗓️ Session Notes' });
    const sessionNotes = fm.session_notes || [];
    const list = sec.createDiv({ cls: 'csh-session-list' });
    if (!sessionNotes.length) {
      list.createEl('div', { cls: 'csh-muted', text: 'No session notes yet.' });
    }
    sessionNotes.forEach((path) => {
      const row = list.createDiv({ cls: 'csh-session-row' });
      const link = row.createEl('a', { text: path.split('/').pop().replace(/\.md$/i, ''), cls: 'csh-session-link' });
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) { new Notice(`Couldn't find "${path}" — it may have been moved or deleted.`); return; }
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(file);
      });
      const unlink = row.createEl('button', { text: '✕', cls: 'csh-del-btn', title: 'Remove from this list (does not delete the file)' });
      unlink.addEventListener('click', () => {
        this.updateFrontmatter((f) => { f.session_notes = (f.session_notes || []).filter((p) => p !== path); });
      });
    });

    const newBtn = sec.createEl('button', { text: '+ New Session Note (Today)', cls: 'csh-add-btn' });
    newBtn.addEventListener('click', () => this.createOrOpenTodaysSessionNote(fm));

    sec.createEl('h4', { text: '📝 General Notes' });
    const ta = sec.createEl('textarea', { cls: 'csh-notes-area' });
    ta.value = fm.notes || '';
    ta.addEventListener('change', () => {
      this.updateFrontmatter((f) => { f.notes = ta.value; });
    });
  }

  async createOrOpenTodaysSessionNote(fm) {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const characterName = fm.character || this.file.basename;
    const safeName = characterName.replace(/[\\/:*?"<>|]/g, '').trim();
    const folder = `${safeName} Notes`;
    const path = `${folder}/${dateStr}.md`;

    if (!this.app.vault.getAbstractFileByPath(folder)) {
      try { await this.app.vault.createFolder(folder); } catch (e) { /* already exists */ }
    }

    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      const content = `# Session Notes — ${dateStr}\n\n**Character:** ${characterName}\n\n## Summary\n\n\n## Loot & Rewards\n\n\n## NPCs Encountered\n\n\n## Next Steps\n\n`;
      file = await this.app.vault.create(path, content);
      await this.updateFrontmatter((f) => {
        f.session_notes = f.session_notes || [];
        if (!f.session_notes.includes(path)) f.session_notes.push(path);
      });
      new Notice(`Created session note for ${dateStr}.`);
    }

    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file);
  }

  renderCreaturesWidget(root, fm) {
    const sec = root.createDiv({ cls: 'csh-section' });
    const creatures = fm.creatures || [];
    if (!creatures.length) sec.createEl('div', { cls: 'csh-muted', text: 'No companions or summons tracked.' });

    creatures.forEach((c, idx) => {
      const card = sec.createDiv({ cls: 'csh-creature-card' });
      const header = card.createDiv({ cls: 'csh-feature-row' });

      const nameInput = header.createEl('input', { type: 'text', cls: 'csh-item-name' });
      nameInput.value = c.name || '';
      nameInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.creatures[idx].name = nameInput.value; });
      });

      const del = header.createEl('button', { text: '✕', cls: 'csh-del-btn' });
      del.addEventListener('click', () => {
        this.updateFrontmatter((f) => { f.creatures.splice(idx, 1); });
      });

      const statRow = card.createDiv({ cls: 'csh-hp-row' });
      statRow.createEl('span', { text: '🛡️ AC: ' });
      const acInput = statRow.createEl('input', { type: 'number', cls: 'csh-hp-input' });
      acInput.value = String(c.ac ?? 10);
      acInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.creatures[idx].ac = Number(acInput.value) || 0; });
      });

      statRow.createEl('span', { text: '   ❤️ HP: ' });
      const hpInput = statRow.createEl('input', { type: 'number', cls: 'csh-hp-input' });
      hpInput.value = String(c.hp ?? c.hp_max ?? 0);
      hpInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.creatures[idx].hp = Number(hpInput.value) || 0; });
      });
      statRow.createEl('span', { text: ' / ' + String(c.hp_max ?? 0) });

      const hpMaxRow = card.createDiv({ cls: 'csh-hp-row' });
      hpMaxRow.createEl('span', { text: 'Max HP: ', cls: 'csh-muted' });
      const hpMaxInput = hpMaxRow.createEl('input', { type: 'number', cls: 'csh-hp-input' });
      hpMaxInput.value = String(c.hp_max ?? 0);
      hpMaxInput.addEventListener('change', () => {
        this.updateFrontmatter((f) => { f.creatures[idx].hp_max = Number(hpMaxInput.value) || 0; });
      });
    });

    const addBtn = sec.createEl('button', { text: '+ Add creature', cls: 'csh-add-btn' });
    addBtn.addEventListener('click', () => {
      this.updateFrontmatter((f) => {
        f.creatures = f.creatures || [];
        f.creatures.push({ name: 'New Creature', ac: 10, hp: 1, hp_max: 1 });
      });
    });
  }

}

class CharacterHubSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'My Little Guy Settings' });

    new Setting(containerEl)
      .setName('Character sheet file')
      .setDesc('Path to the markdown file to track. Leave empty to follow whichever note is currently active.')
      .addText((text) => text
        .setPlaceholder('Characters/My Character.md')
        .setValue(this.plugin.settings.sheetPath)
        .onChange(async (value) => {
          this.plugin.settings.sheetPath = value.trim();
          await this.plugin.saveSettings();
          this.plugin.refreshView();
        }));
  }
}

module.exports = class CharacterSheetHubPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.lastActiveFile = null;

    this.registerView(VIEW_TYPE, (leaf) => new CharacterHubView(leaf, this));

    this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
      const view = leaf && leaf.view;
      if (view instanceof MarkdownView && view.file) {
        this.lastActiveFile = view.file;
        if (!this.settings.sheetPath) this.refreshView();
      }
    }));

    this.app.workspace.onLayoutReady(async () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) this.lastActiveFile = activeView.file;

      // First-run convenience: open the panel automatically once so a freshly
      // downloaded vault is immediately showing the character sheet with no
      // clicks needed beyond enabling community plugins. Never repeats after
      // the first time, so it doesn't force itself on users who close it later.
      if (!this.settings.hasAutoOpened) {
        this.settings.hasAutoOpened = true;
        await this.saveSettings();
        await this.activateView();
      }
    });

    addIcon(RIBBON_ICON_ID, RIBBON_ICON_SVG);
    this.addRibbonIcon(RIBBON_ICON_ID, 'Open My Little Guy', () => this.activateView());

    // 'open-my-little-guy' is referenced by users' pinned mobile toolbar buttons
    // (Settings -> Configure toolbar) — never rename this id, it would silently
    // break their pin on update.
    this.addCommand({
      id: 'open-my-little-guy',
      name: 'Open My Little Guy',
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: 'set-active-file-as-character-sheet',
      name: 'Use current file as Character Sheet',
      callback: async () => {
        const f = this.app.workspace.getActiveFile() || this.lastActiveFile;
        if (!f) { new Notice('No active file.'); return; }
        this.settings.sheetPath = f.path;
        await this.saveSettings();
        new Notice(`Character sheet set to ${f.basename}`);
        this.refreshView();
      },
    });

    this.addSettingTab(new CharacterHubSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  refreshView() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      if (leaf.view && leaf.view.render) leaf.view.render();
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
};
