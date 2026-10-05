// English pronunciation with the browser's built-in speech synthesis, so no
// audio files are needed and any word (including the user's own) can be read.

export const canSpeak = 'speechSynthesis' in window;

// Chrome loads its voices in the background; asking early means the English
// voice is usually ready by the first word.
if (canSpeak) speechSynthesis.getVoices();

function englishVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'en-US') ?? voices.find((v) => v.lang.startsWith('en'));
}

function utterance(text, rate) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.voice = englishVoice() ?? null;
  u.rate = rate;
  return u;
}

// `rate` below 1 reads more slowly (e.g. 0.6 for the "slow" button).
export function speak(text, rate = 0.9) {
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance(text, rate));
}

// Reads `sentences` one after another, calling onSentence(i) as each starts
// and onSentence(-1) at the end. One utterance per sentence, because Chrome
// stops long utterances after about 15 seconds.
export function speakAll(sentences, onSentence, rate = 0.9) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  sentences.forEach((text, i) => {
    const u = utterance(text, rate);
    u.onstart = () => onSentence(i);
    if (i === sentences.length - 1) u.onend = () => onSentence(-1);
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}
