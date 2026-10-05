// Guesses the dictionary form of an inflected English word ("cities" → "city",
// "went" → "go"), so it can be found in the word list. Used by the reading page
// and by scripts/build-texts.mjs.

const IRREGULAR = {
  was: 'be', were: 'be', is: 'be', are: 'be', am: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', did: 'do', done: 'do', went: 'go', gone: 'go',
  said: 'say', made: 'make', took: 'take', taken: 'take', came: 'come', saw: 'see',
  seen: 'see', got: 'get', gotten: 'get', gave: 'give', given: 'give', found: 'find',
  thought: 'think', told: 'tell', became: 'become', left: 'leave', felt: 'feel',
  brought: 'bring', began: 'begin', begun: 'begin', kept: 'keep', held: 'hold',
  wrote: 'write', written: 'write', stood: 'stand', heard: 'hear', meant: 'mean',
  met: 'meet', ran: 'run', paid: 'pay', sat: 'sit', spoke: 'speak', spoken: 'speak',
  led: 'lead', grew: 'grow', grown: 'grow', lost: 'lose', fell: 'fall', fallen: 'fall',
  sent: 'send', built: 'build', understood: 'understand', drew: 'draw', drawn: 'draw',
  broke: 'break', broken: 'break', spent: 'spend', rose: 'rise', risen: 'rise',
  drove: 'drive', driven: 'drive', bought: 'buy', wore: 'wear', worn: 'wear',
  chose: 'choose', chosen: 'choose', sold: 'sell', taught: 'teach', caught: 'catch',
  fought: 'fight', threw: 'throw', thrown: 'throw', ate: 'eat', eaten: 'eat',
  knew: 'know', known: 'know', flew: 'fly', flown: 'fly', won: 'win', slept: 'sleep',
  children: 'child', men: 'man', women: 'woman', people: 'person', feet: 'foot',
  teeth: 'tooth', mice: 'mouse', better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  shown: 'show', born: 'bear', according: 'according to', goes: 'go', does: 'do',
  cannot: 'can', "can't": 'can', "won't": 'will', "shan't": 'shall',
};

// Possible dictionary forms of an inflected word, most likely first.
export function lemmas(word) {
  const w = word.toLowerCase().replace(/’/g, "'").replace(/'s$/, '');
  const out = [w];
  // Contractions: "don't" → "do", "they're" → "they", "I've" → "i".
  const short = w.match(/^(.+?)(n't|'re|'ve|'ll|'d|'m)$/);
  if (short) out.push(short[1]);
  if (IRREGULAR[w]) out.push(IRREGULAR[w]);
  const add = (stem, ...ends) => ends.forEach((e) => out.push(stem + e));
  let m;
  if ((m = w.match(/^(.+)ies$/))) add(m[1], 'y');
  if ((m = w.match(/^(.+)ied$/))) add(m[1], 'y');
  if ((m = w.match(/^(.+[sxz]|.+[cs]h)es$/))) add(m[1], '');
  if ((m = w.match(/^(.+)ves$/))) add(m[1], 'f', 'fe'); // wolves → wolf, knives → knife
  if ((m = w.match(/^(.+)s$/))) add(m[1], '');
  for (const end of ['ing', 'ed', 'er', 'est']) {
    if (!(m = w.match(new RegExp(`^(.{2,})${end}$`)))) continue;
    const stem = m[1];
    add(stem, '', 'e');
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1), ''); // running → run
    if (stem.endsWith('i')) add(stem.slice(0, -1), 'y'); // happier → happy
  }
  if ((m = w.match(/^(.+)ly$/))) add(m[1], '', 'le');
  if ((m = w.match(/^(.+)ily$/))) add(m[1], 'y');
  return out;
}
