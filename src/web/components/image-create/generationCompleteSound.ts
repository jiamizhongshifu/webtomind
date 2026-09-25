import { isGenerationSoundEnabled } from './generationSoundPreference';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }
  return audioContext;
}

export function primeGenerationCompleteSound(): void {
  if (!isGenerationSoundEnabled()) return;
  const context = getAudioContext();
  if (!context) return;
  void context
    .resume()
    .then(() => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.02);
    })
    .catch(() => undefined);
}

function playGenerationTone(
  notes: Array<{ frequency: number; offset: number; duration: number }>,
  peakGain: number,
  oscillatorType: OscillatorType = 'sine'
): void {
  if (!isGenerationSoundEnabled()) return;
  const context = getAudioContext();
  if (!context) return;

  void context
    .resume()
    .then(() => {
      const startAt = context.currentTime + 0.02;
      notes.forEach((note) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = oscillatorType;
        oscillator.frequency.setValueAtTime(
          note.frequency,
          startAt + note.offset
        );
        gain.gain.setValueAtTime(0.0001, startAt + note.offset);
        gain.gain.exponentialRampToValueAtTime(
          peakGain,
          startAt + note.offset + 0.018
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          startAt + note.offset + note.duration
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt + note.offset);
        oscillator.stop(startAt + note.offset + note.duration + 0.03);
      });
    })
    .catch(() => undefined);
}

export function playGenerationCompleteSound(): void {
  playGenerationTone(
    [
      { frequency: 659.25, offset: 0, duration: 0.11 },
      { frequency: 880, offset: 0.13, duration: 0.14 }
    ],
    0.18
  );
}

export function playGenerationFailedSound(): void {
  playGenerationTone(
    [
      { frequency: 392, offset: 0, duration: 0.13 },
      { frequency: 293.66, offset: 0.15, duration: 0.18 }
    ],
    0.14,
    'triangle'
  );
}
