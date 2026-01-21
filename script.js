/* ================= SETUP ================= */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 🧱 LANE BORDERS
const BORDER_WIDTH = 40;
const LANE_COLOR = "#d8d67a";
const BORDER_COLOR = "#b9b55e";

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.touchAction = "none";
ctx.imageSmoothingEnabled = false;

/* ================= UI ================= */
const playBtn = document.getElementById("playBtn");
const homeScreen = document.getElementById("homeScreen");

function drawLane() {
  ctx.fillStyle = LANE_COLOR;
  ctx.fillRect(BORDER_WIDTH, 0, canvas.width - BORDER_WIDTH * 2, canvas.height);

  ctx.fillStyle = BORDER_COLOR;
  ctx.fillRect(0, 0, BORDER_WIDTH, canvas.height);
  ctx.fillRect(canvas.width - BORDER_WIDTH, 0, BORDER_WIDTH, canvas.height);
}

/* ================= RESIZE ================= */
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* ================= GAME STATE ================= */
let score = 0;
let running = false;
let roundCompleted = false;

/* ================= ASSETS ================= */
const pinImg = new Image();
pinImg.src = "PNG1.png";

const ballImg = new Image();
ballImg.src = "images(1).png";

const sndThrow = new Audio("sounds/throw.mp3");
const sndHit = new Audio("sounds/hit.mp3");
const sndStrike = new Audio("sounds/strike.mp3");

/* ================= CONSTANTS ================= */
const PIN_FRICTION = 0.90;
const PIN_RADIUS = 28;
const BALL_RADIUS = 40;
const PIN_WIDTH = 90;
const PIN_HEIGHT = 115;
const MAX_UP_SPEED = 50;

// ✅ Physics additions
const PIN_MIN_DIST = PIN_RADIUS * 2;
const PIN_RESTITUTION = 0.35;

/* ================= BALL ================= */
const ball = {
  x: 0, y: 0, r: BALL_RADIUS,
  vx: 0, vy: 0,
  rotation: 0,
  moving: false,
  respawning: false,

  reset() {
    this.x = canvas.width / 2;
    this.y = canvas.height - 80;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.moving = false;
    this.respawning = false;
  },

  speed() {
    return Math.hypot(this.vx, this.vy);
  },

  update() {
    if (!this.moving) return;

    this.x += this.vx;
    this.y -= Math.abs(this.vy);

    this.rotation += this.speed() * 0.015;

    this.vx *= 0.996;
    this.vy *= 0.996;

    this.x = Math.max(0, Math.min(canvas.width, this.x));

    if (this.y <= 0 && !this.respawning) {
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.moving = false;
      this.respawning = true;
      setTimeout(() => this.reset(), 500);
    }
  },

  draw() {
    if (this.respawning) return;
   /*
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(this.x + 14, this.y + 20, this.r * 0.9, this.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();  */

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(ballImg, -this.r, -this.r, this.r * 2, this.r * 2);
    ctx.restore();
  }
};

/* ================= PIN DRAW ================= */
function drawPin(p) {
  if (p.hit && p.life <= 0) return;

  const t = p.hit ? Math.min(1, (100 - p.life) / 30) : 0;
  const yOffset = t * 35;
  const scale = 1 - t * 0.18;

  ctx.save();
  ctx.translate(p.x, p.y + yOffset);
  ctx.rotate(p.fallAngle * t);
  ctx.scale(scale, scale);
  ctx.drawImage(pinImg, -PIN_WIDTH / 2, -PIN_HEIGHT / 2, PIN_WIDTH, PIN_HEIGHT);
  ctx.restore();
}

/* ================= PINS ================= */
const layout = [4, 3, 2, 1];
const pins = [];

function createPins() {
  pins.length = 0;
  roundCompleted = false;

  const cx = canvas.width / 2;
  const startY = 85;
  const gapX = 75;
  const gapY = 55;

  layout.forEach((count, row) => {
    const rowWidth = (count - 1) * gapX;
    for (let i = 0; i < count; i++) {
      pins.push({
        x: cx - rowWidth / 2 + i * gapX,
        y: startY + row * gapY,
        vx: 0,
        vy: 0,
        hit: false,
        life: 100,
        fallAngle: 0
      });
    }
  });
}

/* ================= PHYSICS ================= */
function applyImpulse(p, speed, sourceX, angle = null) {
  if (!p.hit) {
    score++;
    p.hit = true;
    p.fallAngle = angle ?? (sourceX < p.x ? -1.2 : 1.2);
  }

  p.vy = -Math.min(speed, MAX_UP_SPEED);
  p.life = 100;
}

function checkBallPinCollision() {
  pins.forEach(p => {
    if (p.hit) return;

    const dx = p.x - ball.x;
    const dy = p.y - ball.y;
    const dist = Math.hypot(dx, dy);

    if (dist < ball.r + PIN_RADIUS) {
      const nx = dx / dist;
      const ny = dy / dist;

      const impact = Math.min(ball.speed() * 1.2, MAX_UP_SPEED);

      applyImpulse(p, impact, ball.x);

      p.vx = nx * impact * 0.6;
      p.vy += ny * impact * 0.6;

      const pushOut = (ball.r + PIN_RADIUS - dist) + 1;
      p.x += nx * pushOut;
      p.y += ny * pushOut;

      sndHit.currentTime = 0;
      sndHit.play().catch(() => {});
    }
  });
}

/* ================= PIN–PIN REPULSION (NO OVERLAP) ================= */
function checkPinPinCollision() {
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const a = pins[i];
      const b = pins[j];
      if (!a.hit && !b.hit) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= PIN_MIN_DIST || dist === 0) continue;

      const nx = dx / dist;
      const ny = dy / dist;

      const overlap = PIN_MIN_DIST - dist;
      const correction = overlap / 2;

      a.x -= nx * correction;
      a.y -= ny * correction;
      b.x += nx * correction;
      b.y += ny * correction;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal > 0) continue;

      const impulse = -(1 + PIN_RESTITUTION) * velAlongNormal / 2;
      const ix = impulse * nx;
      const iy = impulse * ny;

      a.vx -= ix;
      a.vy -= iy;
      b.vx += ix;
      b.vy += iy;
    }
  }
}

/* ================= INPUT ================= */
let isDragging = false;
let startX = 0, startY = 0, currentX = 0;

function getPos(e) {
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX, y: t.clientY };
}

canvas.addEventListener("mousedown", handleStart);
canvas.addEventListener("touchstart", e => { e.preventDefault(); handleStart(e); }, { passive: false });
window.addEventListener("mousemove", handleMove);
window.addEventListener("touchmove", e => { e.preventDefault(); handleMove(e); }, { passive: false });
window.addEventListener("mouseup", handleEnd);
window.addEventListener("touchend", handleEnd);

function handleStart(e) {
  if (!running || ball.moving) return;
  const p = getPos(e);
  if (Math.hypot(p.x - ball.x, p.y - ball.y) < ball.r + 25) {
    startX = ball.x;
    startY = ball.y;
    currentX = p.x;
    isDragging = true;
  }
}

function handleMove(e) {
  if (!isDragging || ball.moving) return;
  const p = getPos(e);
  ball.x += (p.x - currentX);
  ball.x = Math.max(0, Math.min(canvas.width, ball.x));
  currentX = p.x;
}

function handleEnd(e) {
  if (!isDragging || ball.moving) return;
  isDragging = false;

  const p = e.changedTouches ? e.changedTouches[0] : e;

  const dx = p.clientX - startX; // 👈 side swipe
  const dy = p.clientY - startY; // 👈 forward swipe

  if (dy < -20) {
    // forward speed
    ball.vy = Math.min(Math.abs(dy) * 0.15, 20);

    // side movement based on swipe direction
    ball.vx = Math.max(
      -6,
      Math.min(6, dx * 0.05)
    );

    ball.moving = true;
    sndThrow.currentTime = 0;
    sndThrow.play().catch(() => {});
  }
}


/* ================= GAME FLOW ================= */
function startGame() {
  homeScreen.style.display = "none";
  canvas.style.display = "block";
  running = true;
  score = 0;
  createPins();
  ball.reset();
  gameLoop();
}

playBtn.onclick = () => {
  window.parent.postMessage({ type: "readyGame" }, "*");
};

window.addEventListener("message", e => {
  if (!e.data || !e.data.payload) return;
  if (e.data.payload.command === "startGame") startGame();
  if (e.data.payload.command === "endGame") running = false;
});

/* ================= LOOP ================= */
function gameLoop() {
  if (!running) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawLane();

  ball.update();
  checkBallPinCollision();
  checkPinPinCollision();

  if (!roundCompleted && pins.every(p => p.hit)) {
    roundCompleted = true;
    sndStrike.play().catch(() => {});
    setTimeout(() => {
      createPins();
      ball.reset();
    }, 1500);
  }

  pins.forEach(p => {
    if (p.hit) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92;
      p.vy *= PIN_FRICTION;
      p.life--;
    }
    drawPin(p);
  });

  ball.draw();
  requestAnimationFrame(gameLoop);
}
