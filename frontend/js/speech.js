// English pronunciation with the browser's built-in speech synthesis, so no
// audio files are needed and any word (including the user's own) can be read.

export const canSpeak = 'speechSynthesis' in window;

function englishVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'en-US') ?? voices.find((v) => v.lang.startsWith('en'));
}

export function speak(text) {
  if (!canSpeak || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.voice = englishVoice() ?? null;
  utterance.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}
