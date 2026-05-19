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

  function comboEffect(config = {}, combo = 1) {
    const intensity = Math.max(0.4, Math.min(config.intensity || 1, 2));
    const pitch = Math.max(0.5, Math.min(config.pitch || 1, 2));
    const type = config.type || 'explosion';
    const comboLift = Math.min(combo, 40) * 3;

    if (type === 'collapse') {
      tone({ frequency: (220 + comboLift) * pitch, slideTo: 62 * pitch, duration: 0.32, type: 'sine', volume: 0.14 * intensity });
      tone({ frequency: 680 * pitch, slideTo: 180 * pitch, duration: 0.22, type: 'triangle', volume: 0.1 * intensity, delay: 0.04 });
      noise({ duration: 0.2, volume: 0.055 * intensity, delay: 0.02, filter: 520 });
      return;
    }

    if (type === 'supernova') {
      tone({ frequency: 76 * pitch, slideTo: 42 * pitch, duration: 0.42, type: 'sine', volume: 0.24 * intensity });
      tone({ frequency: 420 * pitch, slideTo: 1180 * pitch, duration: 0.34, type: 'sawtooth', volume: 0.12 * intensity, delay: 0.03 });
      tone({ frequency: 840 * pitch, slideTo: 1680 * pitch, duration: 0.3, type: 'triangle', volume: 0.1 * intensity, delay: 0.1 });
      noise({ duration: 0.38, volume: 0.09 * intensity, delay: 0.02, filter: 2100 });
      noise({ duration: 0.16, volume: 0.045 * intensity, delay: 0.17, filter: 6200 });
      return;
    }

    if (type === 'thunder-break') {
      tone({ frequency: 1480 * pitch, slideTo: 360 * pitch, duration: 0.075, type: 'square', volume: 0.09 * intensity });
      tone({ frequency: 740 * pitch, slideTo: 120 * pitch, duration: 0.16, type: 'sawtooth', volume: 0.08 * intensity, delay: 0.045 });
      tone({ frequency: 62 * pitch, slideTo: 42 * pitch, duration: 0.22, type: 'sine', volume: 0.2 * intensity, delay: 0.08 });
      noise({ duration: 0.11, volume: 0.09 * intensity, delay: 0.01, filter: 6800 });
      noise({ duration: 0.18, volume: 0.055 * intensity, delay: 0.08, filter: 900 });
      return;
    }

    if (type === 'big-bang') {
      tone({ frequency: 44 * pitch, slideTo: 28 * pitch, duration: 0.56, type: 'sine', volume: 0.3 * intensity });
      tone({ frequency: 330 * pitch, slideTo: 1320 * pitch, duration: 0.48, type: 'sawtooth', volume: 0.16 * intensity, delay: 0.03 });
      tone({ frequency: 990 * pitch, slideTo: 1980 * pitch, duration: 0.36, type: 'triangle', volume: 0.12 * intensity, delay: 0.14 });
      tone({ frequency: 1480 * pitch, slideTo: 2220 * pitch, duration: 0.28, type: 'sine', volume: 0.08 * intensity, delay: 0.24 });
      noise({ duration: 0.5, volume: 0.13 * intensity, delay: 0.01, filter: 1600 });
      noise({ duration: 0.24, volume: 0.07 * intensity, delay: 0.24, filter: 7200 });
      return;
    }

    if (type === 'black-hole') {
      tone({ frequency: 260 * pitch, slideTo: 31 * pitch, duration: 0.62, type: 'sine', volume: 0.24 * intensity });
      tone({ frequency: 1180 * pitch, slideTo: 110 * pitch, duration: 0.5, type: 'sawtooth', volume: 0.09 * intensity, delay: 0.04 });
      tone({ frequency: 72 * pitch, slideTo: 38 * pitch, duration: 0.48, type: 'triangle', volume: 0.18 * intensity, delay: 0.14 });
      noise({ duration: 0.46, volume: 0.075 * intensity, delay: 0.04, filter: 420 });
      return;
    }

    if (type === 'gate') {
      tone({ frequency: 220 * pitch, slideTo: 880 * pitch, duration: 0.42, type: 'triangle', volume: 0.12 * intensity });
      tone({ frequency: 330 * pitch, slideTo: 990 * pitch, duration: 0.42, type: 'sine', volume: 0.1 * intensity, delay: 0.05 });
      tone({ frequency: 660 * pitch, slideTo: 330 * pitch, duration: 0.28, type: 'square', volume: 0.055 * intensity, delay: 0.18 });
      noise({ duration: 0.22, volume: 0.05 * intensity, delay: 0.1, filter: 5200 });
      return;
    }

    if (type === 'divine') {
      [0, 0.045, 0.09, 0.135].forEach((delay, index) => {
        tone({ frequency: [392, 523.25, 659.25, 1046.5][index] * pitch, slideTo: [523.25, 659.25, 783.99, 1567.98][index] * pitch, duration: 0.36, type: 'sine', volume: 0.075 * intensity, delay });
      });
      tone({ frequency: 98 * pitch, slideTo: 196 * pitch, duration: 0.46, type: 'triangle', volume: 0.16 * intensity });
      noise({ duration: 0.2, volume: 0.035 * intensity, delay: 0.08, filter: 8400 });
      return;
    }

    if (type === 'reality-delete') {
      tone({ frequency: 720 * pitch, slideTo: 36 * pitch, duration: 0.18, type: 'square', volume: 0.1 * intensity });
      noise({ duration: 0.08, volume: 0.12 * intensity, delay: 0.04, filter: 2400 });
      tone({ frequency: 42 * pitch, slideTo: 24 * pitch, duration: 0.58, type: 'sine', volume: 0.32 * intensity, delay: 0.18 });
      tone({ frequency: 1440 * pitch, slideTo: 180 * pitch, duration: 0.32, type: 'sawtooth', volume: 0.08 * intensity, delay: 0.22 });
      noise({ duration: 0.36, volume: 0.11 * intensity, delay: 0.2, filter: 120 });
      return;
    }

    tone({ frequency: 88 * pitch, slideTo: 52 * pitch, duration: 0.28, type: 'sine', volume: 0.22 * intensity });
    tone({ frequency: (520 + comboLift) * pitch, slideTo: 980 * pitch, duration: 0.24, type: 'square', volume: 0.1 * intensity, delay: 0.04 });
    tone({ frequency: (1040 + comboLift) * pitch, slideTo: 1560 * pitch, duration: 0.18, type: 'triangle', volume: 0.08 * intensity, delay: 0.11 });
    noise({ duration: 0.3, volume: 0.085 * intensity, delay: 0.03, filter: 1800 });
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
    comboEffect,
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
