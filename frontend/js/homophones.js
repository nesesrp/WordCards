// Common English words that sound the same (in American English, which the
// speech voice uses). In dictation, typing any word of the group counts.

const GROUPS = [
  'there their they\'re', 'to too two', 'your you\'re', 'its it\'s', 'whose who\'s',
  'hear here', 'see sea', 'right write', 'know no', 'new knew', 'one won',
  'buy by bye', 'for four', 'eight ate', 'flower flour', 'week weak', 'meet meat',
  'son sun', 'whole hole', 'hour our', 'wear where', 'which witch', 'weather whether',
  'road rode', 'break brake', 'mail male', 'tail tale', 'pair pear', 'plain plane',
  'peace piece', 'sail sale', 'sell cell', 'cent scent sent', 'dear deer', 'fair fare',
  'hair hare', 'blue blew', 'wait weight', 'way weigh', 'knight night', 'knot not',
  'knows nose', 'made maid', 'main mane', 'steal steel', 'stair stare', 'threw through',
  'wood would', 'allowed aloud', 'bare bear', 'be bee', 'berry bury', 'board bored',
  'cereal serial', 'heal heel', 'higher hire', 'in inn', 'hi high', 'i eye', 'sole soul',
  'some sum', 'stationary stationery', 'suite sweet', 'tide tied', 'vain vein',
  'waist waste', 'principal principle', 'groan grown', 'guessed guest', 'missed mist',
  'passed past', 'patience patients', 'rain reign', 'scene seen', 'sight site',
  'flu flew', 'die dye', 'aisle isle', 'cheap cheep', 'chews choose', 'course coarse',
  'find fined', 'flea flee', 'grate great', 'heard herd', 'hymn him', 'idle idol',
  'loan lone', 'nun none', 'or oar', 'pail pale', 'pain pane', 'pause paws',
  'pray prey', 'wrap rap', 'real reel', 'role roll', 'sew so', 'stake steak',
  'throne thrown', 'whale wail', 'whine wine', 'air heir', 'cellar seller',
  'creak creek', 'fir fur', 'knead need', 'lessen lesson', 'medal meddle',
  'pedal peddle', 'rose rows', 'sore soar', 'tax tacks', 'warn worn', 'ad add',
].map((g) => g.split(' '));

const BY_WORD = new Map(GROUPS.flatMap((g) => g.map((w) => [w, g])));

// Words that sound like `word` (not including itself); `word` is normalized.
export const homophones = (word) => (BY_WORD.get(word) ?? []).filter((w) => w !== word);
