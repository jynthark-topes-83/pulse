// ===== PULSE AUDIO ENGINE =====
// Small Web Audio synth: no assets, no dependencies.

window.PulseAudio = (() => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let enabled = true;
  let overdriveTimer = null;
  let overdriveStep = 0;

  function getContext() {
    if (!AudioContextClass || !enabled) return null;

    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.18;
      master.connect(context.destination);
    }

    if (context.state === 'suspended') {
      const resumeResult = context.resume();
      if (resumeResult && typeof resumeResult.catch === 'function') {
        resumeResult.catch(() => {});
      }
    }

    return context;
  }

  function tone({ frequency = 440, duration = 0.08, type = 'sine', volume = 0.25, delay = 0, slideTo = null }) {
    const ctx = getContext();
    if (!ctx || !master) return;

    const now = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function noise({ duration = 0.12, volume = 0.12, delay = 0, filter = 900 }) {
    const ctx = getContext();
    if (!ctx || !master) return;

    const now = ctx.currentTime + delay;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i += 1) {
      output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = ctx.createBufferSource();
    const bandpass = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    bandpass.type = 'bandpass';
    bandpass.frequency.value = filter;
    bandpass.Q.value = 5;

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.buffer = buffer;
    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + duration);
  }

  function tap(combo = 1) {
    const pitch = Math.min(880, 320 + combo * 18);
    tone({ frequency: pitch, slideTo: pitch * 1.35, duration: 0.055, type: 'triangle', volume: 0.16 });
    tone({ frequency: pitch * 0.5, duration: 0.035, type: 'sine', volume: 0.06 });
  }

  function boost() {
    tone({ frequency: 520, slideTo: 760, duration: 0.09, type: 'square', volume: 0.13 });
    tone({ frequency: 780, slideTo: 1040, duration: 0.11, type: 'triangle', volume: 0.14, delay: 0.055 });
    tone({ frequency: 1170, slideTo: 1560, duration: 0.13, type: 'sine', volume: 0.12, delay: 0.12 });
  }

  function milestone() {
    tone({ frequency: 72, slideTo: 48, duration: 0.22, type: 'sine', volume: 0.22 });
    tone({ frequency: 440, slideTo: 880, duration: 0.24, type: 'triangle', volume: 0.16, delay: 0.02 });
    tone({ frequency: 1320, slideTo: 1760, duration: 0.28, type: 'sine', volume: 0.12, delay: 0.09 });
    noise({ duration: 0.28, volume: 0.08, delay: 0.03, filter: 1800 });
  }

  function max() {
    tone({ frequency: 180, slideTo: 130, duration: 0.075, type: 'square', volume: 0.09 });
    noise({ duration: 0.055, volume: 0.035, filter: 380 });
  }

  function reset() {
    tone({ frequency: 420, slideTo: 180, duration: 0.18, type: 'triangle', volume: 0.13 });
    tone({ frequency: 260, slideTo: 90, duration: 0.22, type: 'sine', volume: 0.1, delay: 0.04 });
  }

  function minus() {
    tone({ frequency: 260, slideTo: 190, duration: 0.07, type: 'triangle', volume: 0.1 });
  }

  function overdriveMusicStep() {
    const lead = [415.3, 554.37, 739.99, 932.33, 830.61, 622.25, 987.77, 1244.51];
    const bass = [51.91, 65.41, 46.25, 77.78];
    const chord = [207.65, 311.13, 415.3, 554.37];
    const leadNote = lead[overdriveStep % lead.length];
    const bassNote = bass[Math.floor(overdriveStep / 4) % bass.length];

    tone({ frequency: leadNote, slideTo: leadNote * 1.5, duration: 0.095, type: 'sawtooth', volume: 0.032 });

    if (overdriveStep % 2 === 0) {
      tone({ frequency: leadNote * 2, duration: 0.045, type: 'square', volume: 0.018, delay: 0.045 });
    }

    if (overdriveStep % 4 === 0) {
      tone({ frequency: bassNote, slideTo: bassNote * 0.74, duration: 0.18, type: 'sine', volume: 0.078 });
      noise({ duration: 0.035, volume: 0.025, filter: 120 });
    }

    if (overdriveStep % 8 === 4) {
      chord.forEach((frequency, index) => {
        tone({ frequency, slideTo: frequency * 1.01, duration: 0.24, type: 'triangle', volume: 0.018, delay: index * 0.012 });
      });
    }

    if (overdriveStep % 4 === 2) {
      noise({ duration: 0.028, volume: 0.014, filter: 4200 });
    }

    overdriveStep += 1;
  }

  function startOverdriveMusic() {
    if (overdriveTimer) return;
    const canStartNow = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (!canStartNow) return;
    overdriveStep = 0;
    boost();
    overdriveMusicStep();
    overdriveTimer = setInterval(overdriveMusicStep, 150);
  }

  function stopOverdriveMusic() {
    clearInterval(overdriveTimer);
    overdriveTimer = null;
  }

  return {
    tap,
    boost,
    milestone,
    max,
    reset,
    minus,
    startOverdriveMusic,
    stopOverdriveMusic,
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) stopOverdriveMusic();
    },
  };
})();
