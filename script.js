// ============================================================
// FUN — chase-the-correct-answer quiz game
// ============================================================

// ---- 1. Question data ----
const questions = [
  { q: "Is the sky blue on a clear day?", a: true },
  { q: "Can a square have five sides?", a: false },
  { q: "Do fish breathe underwater using gills?", a: true },
  { q: "Is the sun colder than the Earth?", a: false },
  { q: "Does water freeze at 0°C?", a: true },
  { q: "Can humans photosynthesize like plants?", a: false },
  { q: "Is Mount Everest the tallest mountain on Earth?", a: true },
  { q: "Do all birds fly?", a: false },
];

// ---- 2. Game state ----
let order = [];
let qIndex = 0;
let score = 0;
let answered = false;
let currentRunner = null;

// ---- 3. Sound engine ----
let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(freq, dur, type, vol) {
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = vol || 0.12;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.stop(c.currentTime + dur);
  } catch (e) { /* audio can fail silently, game still works */ }
}
const sfx = {
  catch: () => { beep(880, 0.12, 'triangle', 0.15); setTimeout(() => beep(1320, 0.15, 'triangle', 0.13), 90); },
  miss: () => beep(160, 0.18, 'sawtooth', 0.12),
  tick: () => beep(1000, 0.03, 'square', 0.03),
  timeup: () => beep(110, 0.3, 'sawtooth', 0.15),
  win: () => { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'triangle', 0.14), i * 110)); }
};

// ---- 4. Per-question countdown timer ----
const QUESTION_TIME = 15000;
let timerRAF = null;
const timerFill = document.getElementById('timerFill');

function startTimer(onExpire) {
  const start = performance.now();
  let lastTickSecond = -1;
  function frame(now) {
    const elapsed = now - start;
    const pct = Math.max(0, 1 - elapsed / QUESTION_TIME);
    timerFill.style.width = (pct * 100) + '%';
    timerFill.classList.toggle('warn', pct < 0.3);

    const secLeft = Math.ceil((QUESTION_TIME - elapsed) / 1000);
    if (secLeft !== lastTickSecond && secLeft <= 3 && secLeft > 0) {
      lastTickSecond = secLeft;
      sfx.tick();
    }
    if (elapsed >= QUESTION_TIME) { onExpire(); return; }
    timerRAF = requestAnimationFrame(frame);
  }
  timerRAF = requestAnimationFrame(frame);
}
function stopTimer() {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = null;
}

// ---- 5. Leaderboard ----
let leaderboard = [];
function renderLeaderboard() {
  const list = document.getElementById('leaderboardList');
  if (leaderboard.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);">No scores yet — be the first.</div>';
    return;
  }
  const sorted = leaderboard.slice().sort((a, b) => b.score - a.score).slice(0, 5);
  list.innerHTML = sorted.map((row, i) =>
    `<div class="lb-row"><span class="n">${i + 1}. ${row.name}</span><span class="s">${row.score}</span></div>`
  ).join('');
}

// ---- 6. DOM elements ----
const card = document.getElementById('card');
const btnYes = document.getElementById('btnYes');
const btnNo = document.getElementById('btnNo');
const questionEl = document.getElementById('question');
const scoreEl = document.getElementById('score');
const qnumEl = document.getElementById('qnum');
const qtotalEl = document.getElementById('qtotal');
const toastEl = document.getElementById('toast');
const flashEl = document.getElementById('flash');
const startOverlay = document.getElementById('startOverlay');
const endOverlay = document.getElementById('endOverlay');

qtotalEl.textContent = questions.length;

// ---- 7. Helpers ----
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 900);
}

function flash(kind) {
  flashEl.className = 'flash ' + kind;
  setTimeout(() => flashEl.className = 'flash', 400);
}

function randomPos(el, avoidX, avoidY) {
  const margin = 12;
  const cardRect = card.getBoundingClientRect();
  const w = el.offsetWidth || 110;
  const h = el.offsetHeight || 54;
  const maxX = window.innerWidth - w - margin;
  const maxY = window.innerHeight - h - margin;
  let best = null, bestDist = -1;

  for (let tries = 0; tries < 10; tries++) {
    const x = margin + Math.random() * (maxX - margin);
    const y = margin + Math.random() * (maxY - margin);
    const overlapsCard = x < cardRect.right + margin && x + w > cardRect.left - margin &&
                          y < cardRect.bottom + margin && y + h > cardRect.top - margin;
    if (overlapsCard) continue;
    const cx = x + w / 2, cy = y + h / 2;
    const dist = (avoidX == null) ? Math.random() : Math.hypot(cx - avoidX, cy - avoidY);
    if (dist > bestDist) { bestDist = dist; best = { x, y }; }
  }
  if (!best) best = { x: margin, y: margin };
  return best;
}

function placeAt(el, x, y) {
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

function moveRunnerAwayFrom(el, avoidX, avoidY) {
  const pos = randomPos(el, avoidX, avoidY);
  placeAt(el, pos.x, pos.y);
}

// ---- 8. Cursor-proximity dodge ----
const DODGE_RADIUS = 110;

function handlePointerMove(clientX, clientY) {
  if (answered || !currentRunner) return;
  const rect = currentRunner.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dist = Math.hypot(clientX - cx, clientY - cy);
  if (dist < DODGE_RADIUS) {
    moveRunnerAwayFrom(currentRunner, clientX, clientY);
  }
}

document.addEventListener('mousemove', (e) => handlePointerMove(e.clientX, e.clientY));
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches[0]) {
    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: true });

// On touchscreens there's no "hovering near" a button before you tap it —
// your finger just lands directly on it. So instead we intercept the tap
// itself: if you touch the runner button, it dodges away and the tap is
// cancelled (never registers as a catch). The decoy button still works
// normally since it's not the runner.
function handleRunnerTouchStart(e) {
  if (answered) return;
  if (!e.currentTarget.classList.contains('runner')) return; // let decoy taps through normally
  e.preventDefault(); // stops the click event from also firing
  const touch = e.touches[0];
  moveRunnerAwayFrom(e.currentTarget, touch.clientX, touch.clientY);
}
btnYes.addEventListener('touchstart', handleRunnerTouchStart, { passive: false });
btnNo.addEventListener('touchstart', handleRunnerTouchStart, { passive: false });

// ---- 9. Core game loop ----
function loadQuestion() {
  if (qIndex >= order.length) { endGame(); return; }

  answered = false;
  const item = order[qIndex];
  questionEl.textContent = item.q;
  qnumEl.textContent = qIndex + 1;

  btnYes.classList.remove('runner', 'decoy');
  btnNo.classList.remove('runner', 'decoy');

  const yesIsRunner = item.a === true;
  const runnerBtn = yesIsRunner ? btnYes : btnNo;
  const stillBtn = yesIsRunner ? btnNo : btnYes;

  runnerBtn.classList.add('runner');
  stillBtn.classList.add('decoy');
  currentRunner = runnerBtn;

  const w = runnerBtn.offsetWidth || 110;
  const startX = window.innerWidth / 2 - w / 2;
  const startY = window.innerHeight - 140;

  placeAt(stillBtn, startX, startY);
  placeAt(runnerBtn, startX, startY);

  stopTimer();
  startTimer(() => {
    if (answered) return;
    answered = true;
    sfx.timeup();
    flash('miss');
    showToast('Too slow ✗');
    qIndex++;
    setTimeout(loadQuestion, 550);
  });
}

function handleClick(clicked) {
  if (answered) return;
  answered = true;
  stopTimer();

  const isRunner = clicked.classList.contains('runner');

  if (isRunner) {
    score++;
    scoreEl.textContent = score;
    sfx.catch();
    flash('hit');
    showToast('Caught it ✓');
  } else {
    sfx.miss();
    flash('miss');
    showToast("Nope — wrong answer ✗");
  }

  qIndex++;
  setTimeout(loadQuestion, 550);
}

btnYes.addEventListener('click', () => handleClick(btnYes));
btnNo.addEventListener('click', () => handleClick(btnNo));

// ---- 10. Start / end screens ----
function startGame() {
  ctx();
  order = shuffle(questions);
  qIndex = 0;
  score = 0;
  scoreEl.textContent = 0;
  startOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
  document.getElementById('nameInput').disabled = false;
  document.getElementById('saveScoreBtn').disabled = false;
  loadQuestion();
}

function endGame() {
  stopTimer();
  currentRunner = null;
  sfx.win();
  document.getElementById('finalScore').textContent = score;
  document.getElementById('finalTotal').textContent = questions.length;
  document.getElementById('nameInput').value = '';
  renderLeaderboard();
  endOverlay.classList.remove('hidden');
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('saveScoreBtn').addEventListener('click', () => {
  const input = document.getElementById('nameInput');
  const name = (input.value || 'player').trim().slice(0, 12) || 'player';
  leaderboard.push({ name, score });
  input.disabled = true;
  document.getElementById('saveScoreBtn').disabled = true;
  renderLeaderboard();
});
