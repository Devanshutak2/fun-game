// ============================================================
// FUN — chase-the-correct-answer quiz game
// ============================================================

// ---- 1. Question data ----
// Each question has one correct answer (true = Yes, false = No).
// The button matching `a` becomes the "runner" that dodges clicks.
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
let order = [];       // shuffled copy of questions for this playthrough
let qIndex = 0;       // which question we're on
let score = 0;
let roamTimer = null; // setInterval handle for the runner button
let answered = false; // guards against double-answering one question

// ---- 3. Sound engine (Web Audio API — no audio files needed) ----
let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(freq, dur, type, vol) {
  try {
    const c = ctx();
    const osc = c.createOscillator();   // generates the tone
    const gain = c.createGain();        // controls volume/fade-out
    osc.type = type || 'sine';
    osc.frequency.value = freq;         // pitch in Hz
    gain.gain.value = vol || 0.12;
    osc.connect(gain);
    gain.connect(c.destination);        // destination = speakers
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur); // fade out
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
const QUESTION_TIME = 5000; // ms
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

// ---- 5. Leaderboard (in-memory for now; swap to localStorage once deployed) ----
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

// ---- 6. Grab DOM elements once ----
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

// Finds a random on-screen spot for a button that doesn't overlap the question card
function randomPos(el) {
  const margin = 12;
  const cardRect = card.getBoundingClientRect();
  const w = el.offsetWidth || 110;
  const h = el.offsetHeight || 54;
  const maxX = window.innerWidth - w - margin;
  const maxY = window.innerHeight - h - margin;
  let x, y, tries = 0;
  do {
    x = margin + Math.random() * (maxX - margin);
    y = margin + Math.random() * (maxY - margin);
    tries++;
  } while (
    tries < 12 &&
    x < cardRect.right + margin && x + w > cardRect.left - margin &&
    y < cardRect.bottom + margin && y + h > cardRect.top - margin
  );
  return { x, y };
}

function placeStill(el, x, y) {
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

function moveRunner(el) {
  const pos = randomPos(el);
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';
}

function stopRoam() {
  if (roamTimer) { clearInterval(roamTimer); roamTimer = null; }
}

// ---- 8. Core game loop ----
function loadQuestion() {
  if (qIndex >= order.length) { endGame(); return; }

  answered = false;
  const item = order[qIndex];
  questionEl.textContent = item.q;
  qnumEl.textContent = qIndex + 1;

  btnYes.classList.remove('runner', 'decoy');
  btnNo.classList.remove('runner', 'decoy');

  // Decide which button is correct (the "runner") for this question
  const yesIsRunner = item.a === true;
  const runnerBtn = yesIsRunner ? btnYes : btnNo;
  const stillBtn = yesIsRunner ? btnNo : btnYes;

  runnerBtn.classList.add('runner');
  stillBtn.classList.add('decoy');

  // Place the still (decoy) button near the bottom, runner somewhere random
  const stillX = window.innerWidth / 2 - (stillBtn.offsetWidth || 110) / 2 - (yesIsRunner ? 90 : -90);
  const stillY = window.innerHeight - 140;
  placeStill(stillBtn, Math.max(20, Math.min(stillX, window.innerWidth - 140)), stillY);

  moveRunner(runnerBtn);

  stopRoam();
  const speed = 950; // ms between jumps — lower = harder
  roamTimer = setInterval(() => {
    if (answered) return;
    moveRunner(runnerBtn);
  }, speed);

  stopTimer();
  startTimer(() => {
    if (answered) return;
    answered = true;
    stopRoam();
    sfx.timeup();
    flash('miss');
    showToast('Too slow ✗');
    qIndex++;
    setTimeout(loadQuestion, 550);
  });
}

function handleClick(clicked) {
  if (answered) return;
  const isRunner = clicked.classList.contains('runner');

  if (isRunner) {
    answered = true;
    stopRoam();
    stopTimer();
    score++;
    scoreEl.textContent = score;
    sfx.catch();
    flash('hit');
    showToast('Caught it ✓');
    qIndex++;
    setTimeout(loadQuestion, 550);
  } else {
    // Clicking the decoy does nothing except a little negative feedback
    sfx.miss();
    flash('miss');
    showToast("Nope — that one's not it");
  }
}

btnYes.addEventListener('click', () => handleClick(btnYes));
btnNo.addEventListener('click', () => handleClick(btnNo));

// ---- 9. Start / end screens ----
function startGame() {
  ctx(); // unlock audio — browsers require a user gesture first
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
  stopRoam();
  stopTimer();
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
