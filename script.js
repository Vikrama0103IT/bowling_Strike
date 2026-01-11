/* ================= SETUP ================= */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const playBtn = document.getElementById("playBtn");
const homeScreen = document.getElementById("homeScreen");

const BASE_WIDTH = 380;
const BASE_HEIGHT = 680;

/* ================= RESPONSIVE CANVAS ================= */
let scale = 1;

function resizeCanvas() {
  const sw = window.innerWidth;
  const sh = window.innerHeight;

  scale = Math.min(sw / BASE_WIDTH, sh / BASE_HEIGHT);

  canvas.width = BASE_WIDTH * scale;
  canvas.height = BASE_HEIGHT * scale;

  canvas.style.width = sw + "px";
  canvas.style.height = sh + "px";

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* ================= GAME STATE ================= */
let score = 0;
let round = 1;
let throwCount = 0;
let running = false;

/* ================= IMAGES ================= */
const pinImg = new Image();
pinImg.src = "PNG.png";

const ballImg = new Image();
ballImg.src = "ball1.png";

/* ================= SOUND ================= */
const soundEnabled = true;

const sndThrow = new Audio("sounds/throw.mp3");
const sndHit = new Audio("sounds/hit.mp3");
const sndStrike = new Audio("sounds/strike.mp3");

sndThrow.volume = 0.6;
sndHit.volume = 0.7;
sndStrike.volume = 0.9;

/* mobile audio unlock */
document.addEventListener("touchstart", () => {
  sndThrow.play().catch(()=>{});
  sndThrow.pause();
}, { once: true });

/* ================= VIBRATION ================= */
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

/* ================= BALL ================= */
const BALL_FLOOR_OFFSET = 70;

const ball = {
  x: BASE_WIDTH / 2,
  y: BASE_HEIGHT - BALL_FLOOR_OFFSET,
  r: 50,
  vx: 0,
  vy: 0,
  rotation: 0,
  moving: false,

  draw() {
    const speed = Math.hypot(this.vx, this.vy);
    const motion = Math.min(speed / 14, 1);

    /* shadow */
    ctx.beginPath();
    ctx.ellipse(
      this.x,
      this.y + 30 + motion * 10,
      26 + motion * 8,
      6 + motion * 3,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = `rgba(0,0,0,${0.25 - motion * 0.1})`;
    ctx.fill();

    /* rotating ball */
    const size = this.r * 2.3;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.drawImage(ballImg, -size / 2, -size / 2, size, size);
    ctx.restore();
  },

  update() {
    if (!this.moving) return;

    this.x += this.vx;
    this.y -= Math.abs(this.vy);

    const speed = Math.hypot(this.vx, this.vy);
    this.rotation += speed * 0.04;

    const floorY = BASE_HEIGHT - BALL_FLOOR_OFFSET;
    if (this.y > floorY) this.y = floorY;

    this.x = Math.max(this.r, Math.min(BASE_WIDTH - this.r, this.x));
  },

  reset() {
    this.x = BASE_WIDTH / 2;
    this.y = BASE_HEIGHT - BALL_FLOOR_OFFSET;
    this.vx = this.vy = 0;
    this.rotation = 0;
    this.moving = false;
  }
};

/* ================= PINS ================= */
const layout = [4, 3, 2, 1];
const pins = [];

function createPins() {
  pins.length = 0;

  const cx = BASE_WIDTH / 2;
  const startY = 120;
  const gapY = 50;
  const gapX = 60;

  layout.forEach((count, row) => {
    const rowWidth = (count - 1) * gapX;
    for (let i = 0; i < count; i++) {
      pins.push({
        x: cx - rowWidth / 2 + i * gapX,
        y: startY + row * gapY,
        hit: false,
        rot: 0,
        fall: 0
      });
    }
  });
}

/* ================= DRAW PIN ================= */
function drawPin(p) {
  if (p.hit && p.fall > 100) return;

  ctx.save();
  ctx.translate(p.x, p.y + p.fall);
  ctx.rotate(p.rot);

  const pinW = 70;
  const pinH = 72;
  const fallFactor = Math.min(p.fall / 40, 1);

  ctx.beginPath();
  ctx.ellipse(
    0,
    4 + fallFactor * 10,
    14 + fallFactor * 10,
    4 + fallFactor * 2,
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = `rgba(0,0,0,${0.22 - fallFactor * 0.1})`;
  ctx.fill();

  ctx.drawImage(pinImg, -pinW / 2, -pinH, pinW, pinH);
  ctx.restore();
}

/* ================= COLLISION ================= */
function checkCollision() {
  pins.forEach(p => {
    if (!p.hit && Math.hypot(ball.x - p.x, ball.y - p.y) < ball.r + 18) {
      p.hit = true;
      p.rot = (Math.random() - 0.5) * 1.6;
      p.fall = 2;
      score++;

      if (soundEnabled) {
        sndHit.currentTime = 0;
        sndHit.play();
      }
      vibrate(30);
    }
  });
}

/* ================= INPUT ================= */
let sx = 0, sy = 0;

function getPos(e) {
  if (e.touches) {
    return {
      x: e.touches[0].clientX / scale,
      y: e.touches[0].clientY / scale
    };
  }
  return { x: e.clientX / scale, y: e.clientY / scale };
}

canvas.addEventListener("touchstart", e => {
  const p = getPos(e);
  sx = p.x;
  sy = p.y;
});

canvas.addEventListener("touchend", e => {
  if (ball.moving) return;
  const ex = e.changedTouches[0].clientX / scale;
  const ey = e.changedTouches[0].clientY / scale;
  throwBall(sx, sy, ex, ey);
});

canvas.addEventListener("mousedown", e => {
  const p = getPos(e);
  sx = p.x;
  sy = p.y;
});

canvas.addEventListener("mouseup", e => {
  throwBall(sx, sy, e.clientX / scale, e.clientY / scale);
});

/* ================= THROW ================= */
function throwBall(x1, y1, x2, y2) {
  if (ball.moving) return;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 20) return;

  const speed = Math.min(len * 0.12, 18);
  ball.vx = (dx / len) * speed;
  ball.vy = (dy / len) * speed;
  ball.moving = true;
  throwCount++;

  if (soundEnabled) {
    sndThrow.currentTime = 0;
    sndThrow.play();
  }
}

/* ================= GAME LOOP ================= */
function gameLoop() {
  if (!running) return;

  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  /* HUD background */
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, BASE_WIDTH, 42);

  /* HUD text */
  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px Arial";
  ctx.textBaseline = "top";

  ctx.textAlign = "left";
  ctx.fillText(`Round ${round}`, 10, 12);

  ctx.textAlign = "center";
  ctx.fillText(`Score ${score}`, BASE_WIDTH / 2, 12);

  ctx.textAlign = "right";
  ctx.fillText(`Throw ${throwCount}`, BASE_WIDTH - 10, 12);

  ball.update();
  checkCollision();

  pins.forEach(p => {
    if (p.hit) {
      p.rot += 0.05;
      p.fall += 1.5;
    }
    drawPin(p);
  });

  if (ball.moving && ball.y < -80) {
    ball.moving = false;
    ball.reset();

    if (pins.every(p => p.hit)) {
      if (soundEnabled) {
        sndStrike.currentTime = 0;
        sndStrike.play();
      }
      vibrate([80, 40, 80]);

      setTimeout(() => {
        round++;
        throwCount = 0;
        createPins();
      }, 600);
    }
  }

  ball.draw();
  requestAnimationFrame(gameLoop);
}

/* ================= START ================= */
playBtn.onclick = () => {
  homeScreen.style.display = "none";
  canvas.style.display = "block";

  running = true;
  score = 0;
  round = 1;
  throwCount = 0;

  createPins();
  ball.reset();
  gameLoop();
};
