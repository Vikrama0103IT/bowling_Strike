/* ================= SETUP ================= */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.touchAction = "none"; 
ctx.imageSmoothingEnabled = false;

/* ================= UI ELEMENTS ================= */
const playBtn = document.getElementById("playBtn");
const homeScreen = document.getElementById("homeScreen");

/* ================= CANVAS RESIZING ================= */
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* ================= GAME STATE ================= */
let score = 0;
let round = 1;
let throwCount = 0;
let running = false;
let roundCompleted = false;

/* ================= ASSETS ================= */
const pinImg = new Image();
pinImg.src = "PNG1.png";

const ballImg = new Image();
ballImg.src = "image5.png";

const sndThrow = new Audio("sounds/throw.mp3");
const sndHit = new Audio("sounds/hit.mp3");
const sndStrike = new Audio("sounds/strike.mp3");

/* ================= CONSTANTS ================= */
const PIN_FRICTION = 0.965;
const PIN_RADIUS = 28;        
const BALL_RADIUS = 35;       
const PIN_WIDTH = 90;        
const PIN_HEIGHT = 150;       
const PIN_HIT_THRESHOLD = 0.75; 

/* ================= BALL OBJECT ================= */
const ball = {
  x: 0, y: 0, r: BALL_RADIUS,
  vx: 0, vy: 0, rotation: 0,
  moving: false, respawning: false,

  reset() {
    this.x = canvas.width / 2;
    this.y = canvas.height - 80;
    this.vx = 0; this.vy = 0;
    this.rotation = 0;
    this.moving = false;
    this.respawning = false;
  },

  speed() { return Math.hypot(this.vx, this.vy); },

  update() {
    if (!this.moving) return;
    this.x += this.vx;
    this.y -= Math.abs(this.vy); 
    this.rotation += this.speed() * 0.04;
    this.vx *= 0.994;
    this.vy *= 0.994;

    // Side wall collisions
    if (this.x - this.r <= 0) { this.x = this.r; this.vx = 0; }
    if (this.x + this.r >= canvas.width) { this.x = canvas.width - this.r; this.vx = 0; }

    // RESET TRIGGER: Ball center reaches the very top edge (y=0)
    if (this.y <= 0 && !this.respawning) {
      this.y = 0;
      this.vx = 0; this.vy = 0;
      this.moving = false;
      this.respawning = true;
      setTimeout(() => this.reset(), 400); 
    }
  },

  draw() {
    if (this.respawning) return;
    const s = this.r * 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.drawImage(ballImg, -this.r, -this.r, s, s);
    ctx.restore();
  }
};

/* ================= PINS LOGIC ================= */
const layout = [4, 3, 2, 1];
const pins = [];

function createPins() {
  pins.length = 0;
  roundCompleted = false;
  const cx = canvas.width / 2;
  const startY = 80; 
  const gapX = 75; 
  const gapY = 55;

  layout.forEach((count, row) => {
    const rowWidth = (count - 1) * gapX;
    for (let i = 0; i < count; i++) {
      pins.push({
        x: cx - rowWidth / 2 + i * gapX,
        y: startY + row * gapY,
        vx: 0, vy: 0, rot: 0, hit: false, life: 90
      });
    }
  });
}

function drawPin(p) {
  if (p.hit && p.life <= 0) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.drawImage(pinImg, -PIN_WIDTH/2, -PIN_HEIGHT/2, PIN_WIDTH, PIN_HEIGHT);
  ctx.restore();
}

/* ================= COLLISIONS & SCORE SYNC ================= */
function applyImpulse(p, nx, ny, strength) {
  if (!p.hit) { 
    score++; 
    p.hit = true; 
    window.parent.postMessage({ type: 'updateBattleScore', score: score }, '*');
  }
  p.vx += nx * strength;
  p.vy += ny * strength * 0.7;
  p.rot += nx * 0.8;
  p.life = 90;
}

function checkBallPinCollision() {
  if (ball.x <= ball.r || ball.x >= canvas.width - ball.r) return;
  pins.forEach(p => {
    if (p.hit) return;
    const dx = p.x - ball.x;
    const dy = p.y - ball.y;
    const dist = Math.hypot(dx, dy);
    if (dist < (ball.r + PIN_RADIUS)) {
      applyImpulse(p, dx/dist, dy/dist, ball.speed() * 0.95);
      sndHit.currentTime = 0;
      sndHit.play().catch(() => {});
    }
  });
}

function checkPinPinCollision() {
  for (let i = 0; i < pins.length; i++) {
    const a = pins[i]; if (!a.hit) continue; 
    for (let j = 0; j < pins.length; j++) {
      const b = pins[j]; if (b.hit) continue; 
      const dx = b.x - a.x; const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < PIN_RADIUS * 2) {
        const strikerSpeed = Math.hypot(a.vx, a.vy);
        const hitDirectness = 1 - (dist / (PIN_RADIUS * 2));
        const impactPower = strikerSpeed * hitDirectness;
        if (impactPower > PIN_HIT_THRESHOLD) {
          applyImpulse(b, dx/dist, dy/dist, strikerSpeed * 0.8);
        } else { a.vx *= -0.3; }
      }
    }
  }
}

/* ================= INPUT HANDLING (TOUCH ON BALL) ================= */
let isDragging = false;
let startX = 0, startY = 0, currentX = 0;

function getPos(e) {
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX, y: t.clientY };
}

canvas.addEventListener("mousedown", handleStart);
canvas.addEventListener("touchstart", (e) => { e.preventDefault(); handleStart(e); }, { passive: false });
window.addEventListener("mousemove", handleMove);
window.addEventListener("touchmove", (e) => { e.preventDefault(); handleMove(e); }, { passive: false });
window.addEventListener("mouseup", handleEnd);
window.addEventListener("touchend", handleEnd);

function handleStart(e) {
  if (!running || ball.moving || ball.respawning) return;
  const p = getPos(e);
  
  // Hit detection: Check if touch is inside the ball radius
  const dist = Math.hypot(p.x - ball.x, p.y - ball.y);
  if (dist < ball.r + 20) { // 20px buffer for easier grabbing
    startX = ball.x; 
    startY = ball.y; 
    currentX = p.x;
    isDragging = true;
  }
}

function handleMove(e) {
  if (!isDragging || ball.moving) return;
  const p = getPos(e);
  const dx = p.x - currentX;
  ball.x += dx;
  
  // Constrain movement within walls
  if (ball.x < ball.r) ball.x = ball.r;
  if (ball.x > canvas.width - ball.r) ball.x = canvas.width - ball.r;
  
  currentX = p.x;
}

function handleEnd(e) {
  if (!isDragging || ball.moving) return;
  isDragging = false;
  
  const p = e.changedTouches ? e.changedTouches[0] : e;
  const totalDx = p.clientX - startX;
  const totalDy = p.clientY - startY;
  const distance = Math.hypot(totalDx, totalDy);
  
  // Throw logic
  if (distance > 40 && totalDy < -15) {
    const speed = Math.min(distance * 0.16, 20);
    ball.vx = (totalDx / distance) * speed * 0.65; 
    ball.vy = Math.max(Math.abs((totalDy / distance) * speed), 10);
    ball.moving = true;
    throwCount++;
    sndThrow.currentTime = 0;
    sndThrow.play().catch(() => {});
  }
}

/* ================= MULTIPLAYER CORE ================= */
function startGame() {
  homeScreen.style.display = "none";
  canvas.style.display = "block";
  running = true;
  createPins();
  ball.reset();
  gameLoop();
}

playBtn.onclick = () => {
  window.parent.postMessage({ type: "readyGame" }, "*");
};

window.addEventListener("message", function (event) {
  if (event.data && event.data.type === "parent-event") {
    var command = event.data.payload.command;
    if (command === "startGame") {
      startGame();
    } else if (command === "endGame") {
      running = false;
    }
  }
});

/* ================= MAIN LOOP ================= */
function gameLoop() {
  if (!running) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ball.update();
  checkBallPinCollision();
  checkPinPinCollision();

  if (!roundCompleted && pins.every(p => p.hit)) {
    roundCompleted = true;
    sndStrike.currentTime = 0; sndStrike.play().catch(() => {});
    setTimeout(() => { round++; createPins(); ball.reset(); }, 900);
  }

  pins.forEach(p => {
    if (p.hit) {
      p.x += p.vx; p.y += p.vy;
      p.vx *= PIN_FRICTION; p.vy *= PIN_FRICTION;
      p.rot += p.vx * 0.015; p.life--;
    }
    drawPin(p);
  });

  ball.draw();
  requestAnimationFrame(gameLoop);
}
