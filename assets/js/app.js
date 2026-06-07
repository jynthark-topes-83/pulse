// ===== STATE =====

const {
  SKINS,
  STORAGE_KEY,
  MAX_COUNTER_VALUE,
  BOOST_HOLD_DURATION,
  BOOST_WORDS,
  COMBO_EFFECTS,
} = window.PulseConfig;

let state = loadState();
let activeCounterId = null;
let comboCount = 0;
let comboTimer = null;
let boostHoldUntil = 0;
let boostHoldTimer = null;
let copyrightTapCount = 0;
let copyrightTapTimer = null;

// ===== PERSISTENCE =====

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.secretSkinUnlocked = Boolean(parsed.secretSkinUnlocked);
      const selectedSkin = SKINS.find(s => s.id === parsed.skin);
      if (!selectedSkin || (selectedSkin.hidden && !parsed.secretSkinUnlocked)) parsed.skin = 'pulse';
      parsed.counters = (parsed.counters || []).map(counter => ({
        ...counter,
        value: clampCounterValue(counter.value),
      }));
      return parsed;
    }
  } catch (e) { /* ignore */ }
  return { counters: [], skin: 'pulse' };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ===== SKIN =====

function setSkinAttributes(skinId) {
  const frame = document.querySelector('.iphone-frame');
  document.documentElement.setAttribute('data-skin', skinId);
  document.body.setAttribute('data-skin', skinId);
  frame?.setAttribute('data-skin', skinId);
}

function syncThemeColor(skin) {
  document.getElementById('theme-color')?.setAttribute('content', skin.bg);
}

function repaintSkin() {
  const frame = document.querySelector('.iphone-frame');
  if (!frame) return;

  frame.classList.add('skin-changing');
  void frame.offsetWidth;
  requestAnimationFrame(() => frame.classList.remove('skin-changing'));
}

function applySkin(skinId, options = {}) {
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin || (skin.hidden && !state.secretSkinUnlocked)) return;

  const overlay = document.getElementById('skin-transition');
  const isSwitch = state.skin !== skinId;

  if (isSwitch && overlay) {
    // Use the target skin's bg so the overlay matches what we're transitioning to
    overlay.style.background = skin.bg;
    overlay.classList.add('active');
    setTimeout(() => {
      setSkinAttributes(skinId);
      syncThemeColor(skin);
      repaintSkin();
      if (skinId === 'jynthark' && options.startMusic) {
        window.PulseAudio?.startOverdriveMusic();
      } else {
        window.PulseAudio?.stopOverdriveMusic();
      }
      state.skin = skinId;
      clearVisualEffects();
      saveState();
      renderSkinList();
      document.getElementById('skin-overlay')?.classList.remove('active');
      // Wait a frame for the new skin to fully paint, then fade out
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.remove('active');
        });
      });
    }, 200);
    return;
  }

  setSkinAttributes(skinId);
  syncThemeColor(skin);
  repaintSkin();
  if (skinId === 'jynthark' && options.startMusic) {
    window.PulseAudio?.startOverdriveMusic();
  } else {
    window.PulseAudio?.stopOverdriveMusic();
  }
  state.skin = skinId;
  clearVisualEffects();
  saveState();
  renderSkinList();
  document.getElementById('skin-overlay')?.classList.remove('active');
}

function renderSkinList() {
  const container = document.getElementById('skin-list');
  container.innerHTML = SKINS.filter(s => !s.hidden || state.secretSkinUnlocked).map(s => `
    <div class="skin-swatch ${s.id === state.skin ? 'active' : ''}"
         style="background: ${s.bg}; color: ${s.accent};"
         data-skin="${s.id}">
      ${s.label}
    </div>
  `).join('');

  container.querySelectorAll('.skin-swatch').forEach(el => {
    el.addEventListener('click', () => applySkin(el.dataset.skin, { startMusic: true }));
  });
}

// ===== SESSIONS SCREEN =====

function renderCountersList() {
  const list = document.getElementById('counters-list');
  if (state.counters.length === 0) {
    list.innerHTML = `<div class="empty-state">no pulses yet<br>create your first one ↓</div>`;
    return;
  }
  list.innerHTML = state.counters.map(c => `
    <div class="counter-card" data-id="${c.id}">
      <span class="card-name">${escapeHtml(c.name)}</span>
      <span class="card-value" title="${c.value}">${formatCardValue(c.value)}</span>
    </div>
  `).join('');

  list.querySelectorAll('.counter-card').forEach(el => {
    el.addEventListener('click', () => openCounter(el.dataset.id));
  });
}

function addCounter() {
  const input = document.getElementById('new-counter-name');
  const name = input.value.trim() || `pulse ${state.counters.length + 1}`;
  const counter = {
    id: Date.now().toString(36),
    name,
    value: 0,
  };
  state.counters.push(counter);
  saveState();
  input.value = '';
  renderCountersList();
}

function deleteCounter(id) {
  state.counters = state.counters.filter(c => c.id !== id);
  saveState();
  showScreen('sessions');
  renderCountersList();
}

function setupCopyrightEasterEgg() {
  const copyright = document.querySelector('.copyright');
  if (!copyright) return;

  copyright.addEventListener('click', () => {
    clearTimeout(copyrightTapTimer);
    copyrightTapCount += 1;
    copyright.classList.add('armed');

    if (copyrightTapCount >= 6) {
      unlockSecretSkin();
      copyrightTapCount = 0;
      return;
    }

    copyrightTapTimer = setTimeout(() => {
      copyrightTapCount = 0;
      copyright.classList.remove('armed');
    }, 1400);
  });
}

function unlockSecretSkin() {
  const copyright = document.querySelector('.copyright');
  state.secretSkinUnlocked = true;
  saveState();
  renderSkinList();
  applySkin('jynthark', { startMusic: true });
  window.PulseAudio?.boost();

  if (copyright) {
    copyright.classList.remove('armed');
    copyright.classList.add('unlocked');
    copyright.textContent = 'JYNTHARK OVERDRIVE UNLOCKED';
    setTimeout(() => {
      copyright.textContent = '© jynthark-topes-83';
      copyright.classList.remove('unlocked');
    }, 2600);
  }

  if ('vibrate' in navigator) {
    navigator.vibrate([18, 32, 18, 54, 36, 82]);
  }
}

// ===== COUNTER SCREEN =====

function openCounter(id) {
  activeCounterId = id;
  comboCount = 0;
  clearTimeout(comboTimer);
  const counter = state.counters.find(c => c.id === id);
  if (!counter) return;
  document.getElementById('counter-label').textContent = counter.name;
  updateCounterDisplay();
  showScreen('counter');
}

function getActiveCounter() {
  return state.counters.find(c => c.id === activeCounterId);
}

function updateCounterDisplay() {
  const counter = getActiveCounter();
  if (!counter) return;
  const value = document.getElementById('counter-value');
  const displayValue = formatCounterValue(counter.value);
  const displayLength = displayValue.length;
  value.textContent = displayValue;
  value.classList.toggle('value-long', displayLength >= 5);
  value.classList.toggle('value-huge', displayLength >= 7);
  value.classList.toggle('value-giant', displayLength >= 9);
  value.classList.toggle('value-massive', displayLength >= 12);
}

function incrementCounter(amount, feedback = {}) {
  const counter = getActiveCounter();
  if (!counter) return;
  if (state.skin === 'jynthark') window.PulseAudio?.startOverdriveMusic();
  const previousValue = counter.value;
  counter.value = clampCounterValue(counter.value + amount);
  if (counter.value === previousValue && amount > 0) {
    window.PulseAudio?.max();
    bumpAnimation(2);
    showMaxEffect(false);
    return;
  }
  saveState();
  updateCounterDisplay();
  bumpAnimation(feedback.power || 1);
  playCounterSound(amount, feedback);
  if (feedback.combo) showCombo(feedback.combo);
  if (feedback.x !== undefined && feedback.y !== undefined) showTapBurst(feedback.x, feedback.y, feedback.combo || 1);
  maybeCelebrateMilestone(previousValue, counter.value);
  if (previousValue < MAX_COUNTER_VALUE && counter.value === MAX_COUNTER_VALUE) showMaxEffect(true);
}

function resetCounter() {
  const counter = getActiveCounter();
  if (!counter) return;
  counter.value = 0;
  comboCount = 0;
  clearTimeout(comboTimer);
  saveState();
  updateCounterDisplay();
  bumpAnimation();
  window.PulseAudio?.reset();
}

function bumpAnimation(power = 1) {
  const el = document.getElementById('counter-value');
  const zone = document.getElementById('counter-zone');
  const hitScale = Math.min(1.075, 1.035 + power * 0.007);
  const orbScale = Math.min(1.58, 1.14 + power * 0.038);

  el.style.setProperty('--hit-scale', hitScale.toFixed(3));
  zone.style.setProperty('--orb-scale', orbScale.toFixed(3));
  el.classList.add('bump');
  zone.classList.remove('pulse-hit', 'combo-hit');
  void zone.offsetWidth;
  zone.classList.add(power >= 3 ? 'combo-hit' : 'pulse-hit');

  setTimeout(() => el.classList.remove('bump'), 150);
  setTimeout(() => zone.classList.remove('pulse-hit', 'combo-hit'), 620);
}

function clearVisualEffects() {
  document.getElementById('counter-value')?.classList.remove('bump');
  document.getElementById('counter-zone')?.classList.remove('pulse-hit', 'combo-hit', 'milestone-shock', 'holding', 'flash');
  document.getElementById('combo-badge')?.classList.remove('show', 'boost-word');
  document.getElementById('milestone-effect')?.classList.remove('show');
  document.getElementById('max-effect')?.classList.remove('show', 'limit-tap');
  document.querySelectorAll('.tap-burst, .milestone-particle, .combo-effect').forEach(el => el.remove());
  clearTimeout(boostHoldTimer);
  boostHoldUntil = 0;
}

function showMaxEffect(isFirstReach = false) {
  const effect = document.getElementById('max-effect');
  const zone = document.getElementById('counter-zone');
  if (!effect || !zone) return;

  effect.querySelector('.max-label').textContent = isFirstReach ? 'maximum pulse' : 'limit 9999';
  effect.classList.remove('show', 'limit-tap');
  zone.classList.remove('milestone-shock');
  void effect.offsetWidth;
  effect.classList.add('show');
  if (!isFirstReach) effect.classList.add('limit-tap');
  zone.classList.add('milestone-shock');
  setTimeout(() => zone.classList.remove('milestone-shock'), 900);

  if (isFirstReach && 'vibrate' in navigator) {
    navigator.vibrate([24, 34, 24, 54]);
  }
}

function registerCombo() {
  clearTimeout(comboTimer);
  comboCount += 1;
  comboTimer = setTimeout(() => {
    comboCount = 0;
  }, 900);
  return comboCount;
}

function showCombo(count) {
  if (count < 2) return;
  const badge = document.getElementById('combo-badge');
  const shouldBoost = count >= 5 && count % 5 === 0;
  const boostIndex = Math.min(Math.floor(count / 5) - 1, BOOST_WORDS.length - 1);
  const boostWord = BOOST_WORDS[boostIndex];

  if (!shouldBoost && performance.now() < boostHoldUntil) return;

  badge.textContent = shouldBoost ? `${boostWord} ×${count}` : `combo ×${count}`;
  badge.classList.remove('show', 'boost-word');
  if (shouldBoost) badge.classList.add('boost-word');
  void badge.offsetWidth;
  badge.classList.add('show');

  if (shouldBoost) {
    window.PulseAudio?.boost();
    triggerComboEffect(count);
    clearTimeout(boostHoldTimer);
    boostHoldUntil = performance.now() + BOOST_HOLD_DURATION;
    boostHoldTimer = setTimeout(() => {
      badge.classList.remove('show', 'boost-word');
      boostHoldUntil = 0;
    }, BOOST_HOLD_DURATION);
  }
}

function getComboEffect(count) {
  return COMBO_EFFECTS
    .filter(effect => count >= effect.minCombo && count % effect.every === 0)
    .filter(effect => effect.skins === 'all' || effect.skins.includes(state.skin))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
}

function triggerComboEffect(count) {
  const preset = getComboEffect(count);
  if (!preset) return;
  const zone = document.getElementById('counter-zone');
  if (!zone) return;

  const visual = preset.visual || {};
  const duration = visual.duration || 1600;
  const intensity = visual.intensity || 1;
  const rings = visual.rings || 3;
  const shards = visual.shards || 20;
  const effect = document.createElement('div');
  effect.className = 'combo-effect';
  effect.dataset.effect = visual.type || 'planet-explode';
  effect.style.setProperty('--combo-effect-duration', `${duration}ms`);
  effect.style.setProperty('--combo-effect-intensity', intensity.toFixed(2));
  effect.style.setProperty('--combo-effect-hue', `${visual.hue || 0}deg`);
  effect.innerHTML = `<span class="combo-effect-core"></span><span class="combo-effect-label">${escapeHtml(preset.label || `combo ×${count}`)}</span>`;

  for (let i = 0; i < rings; i += 1) {
    const ring = document.createElement('span');
    ring.className = 'combo-effect-ring';
    ring.style.setProperty('--ring-index', i);
    ring.style.setProperty('--ring-delay', `${i * 90}ms`);
    effect.appendChild(ring);
  }

  for (let i = 0; i < shards; i += 1) {
    const shard = document.createElement('span');
    shard.className = 'combo-effect-shard';
    shard.style.setProperty('--angle', `${(360 / shards) * i}deg`);
    shard.style.setProperty('--distance', `${90 + Math.random() * 170}px`);
    shard.style.setProperty('--shard-delay', `${Math.random() * 160}ms`);
    shard.style.setProperty('--shard-size', `${4 + Math.random() * 11}px`);
    effect.appendChild(shard);
  }

  zone.querySelectorAll('.combo-effect').forEach(el => el.remove());
  zone.appendChild(effect);
  window.PulseAudio?.comboEffect?.(preset.sound || {}, count);
  if (preset.vibrate && 'vibrate' in navigator) navigator.vibrate(preset.vibrate);
  setTimeout(() => effect.remove(), duration + 240);
}

function showTapBurst(clientX, clientY, combo = 1) {
  const zone = document.getElementById('counter-zone');
  const rect = zone.getBoundingClientRect();
  const burst = document.createElement('span');
  burst.className = 'tap-burst';
  burst.style.setProperty('--tap-x', `${rect.width / 2}px`);
  burst.style.setProperty('--tap-y', `${rect.height / 2}px`);
  burst.style.setProperty('--burst-scale', Math.min(7.2, 3.4 + combo * 0.34).toFixed(2));
  zone.appendChild(burst);
  setTimeout(() => burst.remove(), 760);
}

function maybeCelebrateMilestone(previousValue, nextValue) {
  if (nextValue <= previousValue || nextValue < 100) return;

  const previousMilestone = Math.floor(Math.max(previousValue, 0) / 100);
  const nextMilestone = Math.floor(nextValue / 100);

  if (nextMilestone <= previousMilestone) return;
  showMilestoneEffect(nextMilestone * 100);
}

function showMilestoneEffect(value) {
  const effect = document.getElementById('milestone-effect');
  const zone = document.getElementById('counter-zone');
  if (!effect) return;

  effect.querySelector('.milestone-number').textContent = value;
  effect.querySelectorAll('.milestone-particle').forEach(particle => particle.remove());
  for (let i = 0; i < 28; i += 1) {
    const particle = document.createElement('span');
    particle.className = 'milestone-particle';
    particle.style.setProperty('--angle', `${(360 / 28) * i}deg`);
    effect.appendChild(particle);
  }
  effect.classList.remove('show');
  zone.classList.remove('milestone-shock');
  void effect.offsetWidth;
  effect.classList.add('show');
  zone.classList.add('milestone-shock');
  setTimeout(() => zone.classList.remove('milestone-shock'), 1250);
  window.PulseAudio?.milestone();

  if ('vibrate' in navigator) {
    navigator.vibrate([18, 28, 18, 42, 22, 64]);
  }
}

// ===== GESTURES =====

function setupGestures() {
  const zone = document.getElementById('counter-zone');
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let holdTimer = null;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let activePointerId = null;
  let didSwipe = false;
  let didHold = false;

  const HOLD_DURATION = 650;
  const SWIPE_THRESHOLD = 42;
  const TAP_MOVE_LIMIT = 12;
  const DOUBLE_TAP_DELAY = 320;
  const DOUBLE_TAP_DISTANCE = 34;

  function clearHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
    zone.classList.remove('holding');
  }

  zone.addEventListener('pointerdown', (e) => {
    if (activePointerId !== null) return;
    e.preventDefault();
    activePointerId = e.pointerId;
    zone.setPointerCapture?.(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    startTime = performance.now();
    didSwipe = false;
    didHold = false;
    zone.classList.add('holding');

    holdTimer = setTimeout(() => {
      didHold = true;
      resetCounter();
      zone.classList.add('flash');
      setTimeout(() => zone.classList.remove('flash'), 200);
      clearHold();
    }, HOLD_DURATION);
  });

  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId || didHold) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.35 && !didSwipe) {
      didSwipe = true;
      clearHold();
      if (dx < 0) {
        incrementCounter(-1, { power: 1.2 });
      } else {
        const combo = registerCombo();
        incrementCounter(1, { combo, power: combo, x: e.clientX, y: e.clientY });
      }
    }
  });

  zone.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const elapsed = performance.now() - startTime;
    activePointerId = null;
    clearHold();

    if (didSwipe || didHold) return;
    if (elapsed >= HOLD_DURATION) return;
    if (Math.hypot(dx, dy) > TAP_MOVE_LIMIT) return;

    const now = performance.now();
    const isDoubleTap = now - lastTapAt <= DOUBLE_TAP_DELAY
      && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) <= DOUBLE_TAP_DISTANCE;

    if (isDoubleTap) {
      lastTapAt = 0;
      const combo = registerCombo();
      incrementCounter(1, { combo, power: combo + 2, x: e.clientX, y: e.clientY });
      return;
    }

    lastTapAt = now;
    lastTapX = e.clientX;
    lastTapY = e.clientY;
    const combo = registerCombo();
    incrementCounter(1, { combo, power: combo, x: e.clientX, y: e.clientY });
  });

  zone.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    clearHold();
  });

  zone.addEventListener('dblclick', (e) => e.preventDefault());
  zone.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ===== FOCUS MODE =====

function toggleFocusMode() {
  const screen = document.getElementById('counter-screen');
  screen.classList.toggle('focus-mode');
}

function exitFocusMode() {
  document.getElementById('counter-screen').classList.remove('focus-mode');
}

// ===== NAVIGATION =====

function showScreen(name) {
  exitFocusMode();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (name === 'sessions') {
    document.getElementById('sessions-screen').classList.add('active');
    renderCountersList();
  } else if (name === 'counter') {
    document.getElementById('counter-screen').classList.add('active');
  }
}

// ===== UTILS =====

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatCardValue(value) {
  const abs = Math.abs(value);
  if (abs < 10000) return value.toLocaleString('en-US');

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: abs < 1000000 ? 1 : 2,
  }).format(value);
}

function formatCounterValue(value) {
  return value.toLocaleString('en-US');
}

function clampCounterValue(value) {
  return Math.max(0, Math.min(MAX_COUNTER_VALUE, Number(value) || 0));
}

function playCounterSound(amount, feedback = {}) {
  if (amount < 0) {
    window.PulseAudio?.minus();
    return;
  }

  window.PulseAudio?.tap(feedback.combo || 1);
}

// ===== INIT =====

function init() {
  applySkin(state.skin);
  renderCountersList();
  renderSkinList();
  setupGestures();
  setupCopyrightEasterEgg();

  // Add counter
  document.getElementById('add-counter-btn').addEventListener('click', addCounter);
  document.getElementById('new-counter-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCounter();
  });

  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    showScreen('sessions');
  });

  // Focus mode
  document.getElementById('focus-btn').addEventListener('click', () => {
    toggleFocusMode();
  });
  document.getElementById('focus-exit-btn').addEventListener('click', () => {
    exitFocusMode();
  });

  // Delete button
  document.getElementById('delete-btn').addEventListener('click', () => {
    if (activeCounterId) deleteCounter(activeCounterId);
  });

  // Skin overlay
  document.getElementById('skin-btn').addEventListener('click', () => {
    document.getElementById('skin-overlay').classList.add('active');
  });

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext && location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // PWA caching is an enhancement; keep the app usable if registration fails.
    });
  });
}

document.addEventListener('DOMContentLoaded', init);

// Prevent iOS double-tap zoom globally
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });
