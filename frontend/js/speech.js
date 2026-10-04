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

// `rate` below 1 reads more slowly (e.g. 0.6 for the "slow" button).
export function speak(text, rate = 0.9) {
  if (!canSpeak || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.voice = englishVoice() ?? null;
  utterance.rate = rate;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}
