// English pronunciation with the browser's built-in speech synthesis, so no
// audio files are needed and any word (including the user's own) can be read.

export const canSpeak = 'speechSynthesis' in window;

// Chrome loads its voices in the background; asking early means the English
// voice is usually ready by the first word.
if (canSpeak) speechSynthesis.getVoices();

// macOS ships joke voices (Bells, Zarvox…) tagged as en-US.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/;

const englishVoices = () => speechSynthesis.getVoices()
  .filter((v) => v.lang.replace('_', '-').startsWith('en') && !NOVELTY.test(v.name));

function englishVoice() {
  const voices = englishVoices();
  return voices.find((v) => v.lang === 'en-US') ?? voices[0];
}

// Two voices for the podcast hosts, from different accents if possible. With
// only one English voice, the hosts are told apart by pitch.
function hostVoices() {
  const first = englishVoice();
  const others = englishVoices().filter((v) => v.name !== first?.name);
  const second = others.find((v) => v.lang !== first.lang) ?? others[0];
  return second
    ? [{ voice: first, pitch: 1 }, { voice: second, pitch: 1 }]
    : [{ voice: first, pitch: 1.15 }, { voice: first, pitch: 0.8 }];
}

function utterance(text, rate, { voice = englishVoice(), pitch = 1 } = {}) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? 'en-US';
  u.voice = voice ?? null;
  u.rate = rate;
  u.pitch = pitch;
  return u;
}

// The queue being read by speakLines(), so it can be told when it is cut off.
let queue = null;

function interrupt() {
  const stopped = queue;
  queue = null;
  speechSynthesis.cancel();
  stopped?.onEnd(false);
}

// `rate` below 1 reads more slowly (e.g. 0.6 for the "slow" button).
export function speak(text, rate = 0.9) {
  if (!canSpeak || !text) return;
  interrupt();
  speechSynthesis.speak(utterance(text, rate));
}

// Reads `lines` ([{ text, host }]) one after another from line `start`, in a
// different voice for each host. Calls onLine(i) as each line starts, and
// onEnd(true) after the last one or onEnd(false) when something else is spoken
// or stopSpeaking() is called. One utterance per line, because Chrome stops
// long utterances after about 15 seconds.
export function speakLines(lines, { start = 0, rate = 0.9, onLine = () => {}, onEnd = () => {} } = {}) {
  if (!canSpeak) return;
  interrupt();
  const hosts = hostVoices();
  // Kept referenced: Chrome drops the events of utterances that get garbage collected.
  const current = { onEnd, utterances: [] };
  queue = current;
  lines.slice(start).forEach(({ text, host = 0 }, k) => {
    const u = utterance(text, rate, hosts[host % hosts.length]);
    u.onstart = () => queue === current && onLine(start + k);
    // e.g. "not-allowed" when the browser blocks speech without a user gesture.
    u.onerror = (e) => {
      if (queue === current && e.error !== 'interrupted' && e.error !== 'canceled') interrupt();
    };
    if (start + k === lines.length - 1) {
      u.onend = () => {
        if (queue !== current) return;
        queue = null;
        onEnd(true);
      };
    }
    current.utterances.push(u);
    speechSynthesis.speak(u);
  });
}

// Reads `sentences` one after another, calling onSentence(i) as each starts
// and onSentence(-1) at the end or when stopped.
export function speakAll(sentences, onSentence, rate = 0.9) {
  speakLines(sentences.map((text) => ({ text })), {
    rate,
    onLine: onSentence,
    onEnd: () => onSentence(-1),
  });
}

export function stopSpeaking() {
  if (canSpeak) interrupt();
}
