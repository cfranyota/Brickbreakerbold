import { COLS, LEVELS, POWERS, ROWS, type Cell, type Power } from "@/game/levels";

const BALL_R = 12;
const BASE_PADDLE_W = 176;

type Frame = {
  w: number;
  h: number;
  square: boolean;
  gridX: number;
  gridY: number;
  cellW: number;
  cellH: number;
  paddleY: number;
  paddleH: number;
};

function portraitFrame(): Frame {
  return {
    w: 720,
    h: 1280,
    square: false,
    gridX: 18,
    gridY: 112,
    cellW: (720 - 36) / COLS,
    cellH: 46,
    paddleY: 1008,
    paddleH: 34,
  };
}

function squareFrame(): Frame {
  const w = 1080;
  const h = 1080;
  const gridX = 28;
  const gridY = 150;
  const cellH = 40;
  return {
    w,
    h,
    square: true,
    gridX,
    gridY,
    cellW: (w - gridX * 2) / COLS,
    cellH,
    paddleY: 900,
    paddleH: 36,
  };
}

let frame = portraitFrame();

export function isSquareScreen() {
  const ratio = window.innerWidth / Math.max(1, window.innerHeight);
  return ratio >= 0.78 && ratio <= 1.28;
}

type Mode = "beginner" | "intermediate" | "hardcore";
type Phase =
  | "loading"
  | "menu"
  | "pick"
  | "about"
  | "scores"
  | "ready"
  | "play"
  | "miss"
  | "paused"
  | "levelclear"
  | "win"
  | "over";

type Brick = {
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
  row: number;
  hits: number;
  power: Power | null;
  switcher: 0 | 1 | 2;
  switchable: boolean;
  visible: boolean;
  cooldown: number;
};

type Item = { x: number; y: number; w: number; h: number; vy: number; power: Power };
type Missile = { x: number; y: number; w: number; h: number; vy: number };
type Ufo = { x: number; y: number; vx: number; kind: 0 | 1; col: number; t: number };
type Bit = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; s: number };
type Floater = { x: number; y: number; life: number; text: string };
type Hot = { id: string; x: number; y: number; w: number; h: number };
type PointerRec = { x: number; y: number; id: string | null; moved: number };
type ScoreRow = { score: number; level: number; mode: Mode; at: number };

const MODE_META: Record<
  Mode,
  { lives: number; speed: number; buttons: boolean; tilt: boolean; title: string; blurb: string }
> = {
  beginner: {
    lives: 5,
    speed: 560,
    buttons: false,
    tilt: false,
    title: "Beginner",
    blurb: "Drag the paddle. Five balls.",
  },
  intermediate: {
    lives: 3,
    speed: 680,
    buttons: true,
    tilt: false,
    title: "Intermediate",
    blurb: "Arrow buttons. Three balls.",
  },
  hardcore: {
    lives: 2,
    speed: 820,
    buttons: false,
    tilt: true,
    title: "Hardcore",
    blurb: "Tilt the phone. Two balls. Faster.",
  },
};

const POWER_LABEL: Record<Power, string> = {
  longer: "Wide",
  slow: "Slow",
  shorter: "Narrow",
  fast: "Fast",
  missile: "Missile",
  life: "Life",
  ufo: "UFO",
  flip: "Flip",
  wrap: "Wrap",
  score: "+100",
};

const SCORE_KEY = "bbb-bold-scores-v1";
const SETTING_KEY = "bbb-bold-settings-v1";

export async function saveApkFile() {
  const href = `${assetBase()}BrickBreakerBold.apk`;
  try {
    const res = await fetch(href);
    if (!res.ok) throw new Error("missing");
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("not apk");
    const blob = new Blob([buf], { type: "application/vnd.android.package-archive" });
    const file = new File([blob], "BrickBreakerBold.apk", {
      type: "application/vnd.android.package-archive",
    });
    const share = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (share.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "BrickBreaker Bold" });
        return "shared";
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return "saved";
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "BrickBreakerBold.apk";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 20000);
    return "saved";
  } catch {
    window.location.assign(href);
    return "opened";
  }
}

function assetBase(): string {
  const b = import.meta.env.BASE_URL || "/";
  return b.endsWith("/") ? b : `${b}/`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });
}

function imgOk(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function readScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeScores(rows: ScoreRow[]) {
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(rows.slice(0, 8)));
  } catch {
    /* private mode */
  }
}

export class BrickBreaker {
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private running = false;
  private images = new Map<string, HTMLImageElement>();
  private hot: Hot[] = [];
  private pointers = new Map<number, PointerRec>();
  private pressedId: string | null = null;
  private leftHeld = false;
  private rightHeld = false;
  private keyLeft = false;
  private keyRight = false;
  private dragId: number | null = null;
  private dragX = frame.w / 2;
  private phase: Phase = "loading";
  private mode: Mode = "beginner";
  private level = 1;
  private score = 0;
  private lives = 5;
  private ammo = 0;
  private bestNote = false;
  private missT = 0;
  private shake = 0;
  private reduced = false;
  private tilt = 0;
  private tiltSeen = false;
  private finePointer = false;
  private bricks: (Brick | null)[] = [];
  private items: Item[] = [];
  private missiles: Missile[] = [];
  private ufos: Ufo[] = [];
  private bits: Bit[] = [];
  private floaters: Floater[] = [];
  private paddle = { x: 0, y: frame.paddleY, w: BASE_PADDLE_W, h: frame.paddleH };
  private ball = { x: 0, y: 0, vx: 0, vy: 0, r: BALL_R };
  private fx = { longer: 0, shorter: 0, fast: 0, slow: 0, flip: 0, wrap: 0 };
  private musicOn = true;
  private sfxOn = true;
  private audioUnlocked = false;
  private music: HTMLAudioElement | null = null;
  private lastHitSfx = 0;
  private loadN = 0;
  private loadD = 1;
  private readonly onDown: (e: PointerEvent) => void;
  private readonly onMove: (e: PointerEvent) => void;
  private readonly onUp: (e: PointerEvent) => void;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onResize: () => void;
  private readonly onOrient: (e: DeviceOrientationEvent) => void;
  private readonly onHide: () => void;
  private readonly onContext: (e: Event) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e);
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keyUp(e);
    this.onResize = () => this.resize();
    this.onOrient = (e) => this.orient(e);
    this.onHide = () => this.visibility();
    this.onContext = (e) => e.preventDefault();
    try {
      const saved = JSON.parse(localStorage.getItem(SETTING_KEY) || "{}") as {
        music?: boolean;
        sfx?: boolean;
      };
      if (typeof saved.music === "boolean") this.musicOn = saved.music;
      if (typeof saved.sfx === "boolean") this.sfxOn = saved.sfx;
    } catch {
      /* ignore */
    }
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.canvas.addEventListener("contextmenu", this.onContext);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("deviceorientation", this.onOrient);
    document.addEventListener("visibilitychange", this.onHide);
    void this.boot();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("deviceorientation", this.onOrient);
    document.removeEventListener("visibilitychange", this.onHide);
    this.music?.pause();
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.resize();
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private async boot() {
    const base = `${assetBase()}bbb/`;
    const names = [
      "bg",
      "start_bg",
      "moon",
      "logo_L",
      "ball",
      "paddle",
      "missile",
      "breakingBrick",
      "brick1",
      "brick2",
      "brick3",
      "brick4",
      "brick5",
      "brick6",
      "brick7",
      "ufo2",
      "ufo4",
      "button_play",
      "beginner",
      "intermediate",
      "hardcore",
      "gameover",
      "win",
      "level_clear",
      "select_title",
      ...POWERS.map((_, i) => `item${i + 1}`),
    ];
    this.loadD = names.length;
    this.loadN = 0;
    await Promise.all(
      names.map(async (name) => {
        const img = await loadImage(`${base}${name}.png`);
        this.images.set(name, img);
        this.loadN += 1;
      }),
    );
    const music = new Audio(`${base}audio/background.mp3`);
    music.loop = true;
    music.volume = 0.35;
    this.music = music;
    void document.fonts?.load("700 32px Outfit").catch(() => undefined);
    this.phase = "menu";
  }

  private resize() {
    const square = isSquareScreen();
    this.canvas.classList.toggle("is-square", square);
    document.documentElement.classList.toggle("is-square", square);
    const next = square ? squareFrame() : portraitFrame();
    if (next.square !== frame.square || next.gridY !== frame.gridY || next.paddleY !== frame.paddleY) {
      this.applyFrame(next);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private applyFrame(next: Frame) {
    const prev = frame;
    const sx = next.w / prev.w;
    const sy = next.h / prev.h;
    frame = next;
    this.paddle.y = frame.paddleY;
    this.paddle.h = frame.paddleH;
    this.paddle.x *= sx;
    this.ball.x *= sx;
    this.ball.y *= sy;
    this.dragX *= sx;
    for (const b of this.bricks) if (b) this.layoutBrick(b);
    for (const it of this.items) {
      it.x *= sx;
      it.y *= sy;
    }
    for (const m of this.missiles) {
      m.x *= sx;
      m.y *= sy;
    }
    for (const u of this.ufos) {
      u.x *= sx;
      u.y *= sy;
    }
  }

  private layoutBrick(b: Brick) {
    const pad = 4;
    b.x = frame.gridX + b.col * frame.cellW + pad;
    b.y = frame.gridY + b.row * frame.cellH + pad;
    b.w = frame.cellW - pad * 2;
    b.h = frame.cellH - pad * 2;
  }

  private basePaddleW() {
    return frame.square ? 260 : BASE_PADDLE_W;
  }

  private orient(e: DeviceOrientationEvent) {
    const portrait = window.innerHeight >= window.innerWidth;
    const value = portrait ? e.gamma : e.beta;
    if (value == null || Number.isNaN(value)) return;
    this.tilt = value;
    this.tiltSeen = true;
  }

  private visibility() {
    if (document.hidden && (this.phase === "play" || this.phase === "ready" || this.phase === "miss")) {
      this.phase = "paused";
    }
  }

  private saveSettings() {
    try {
      localStorage.setItem(
        SETTING_KEY,
        JSON.stringify({ music: this.musicOn, sfx: this.sfxOn }),
      );
    } catch {
      /* ignore */
    }
  }

  private unlock() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    if (this.musicOn) void this.music?.play().catch(() => undefined);
  }

  private blip(name: "bounce" | "hit" | "catch" | "missile_launch") {
    if (!this.sfxOn || !this.audioUnlocked) return;
    const now = performance.now();
    if (name === "hit" && now - this.lastHitSfx < 45) return;
    if (name === "hit") this.lastHitSfx = now;
    const audio = new Audio(`${assetBase()}bbb/audio/${name}.m4a`);
    audio.volume = name === "missile_launch" ? 0.45 : 0.6;
    void audio.play().catch(() => undefined);
  }

  private toggleMusic() {
    this.musicOn = !this.musicOn;
    this.saveSettings();
    if (!this.music) return;
    if (this.musicOn && this.audioUnlocked) void this.music.play().catch(() => undefined);
    else this.music.pause();
  }

  private toggleSfx() {
    this.sfxOn = !this.sfxOn;
    this.saveSettings();
  }

  private pos(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * frame.w,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * frame.h,
    };
  }

  private hitTest(x: number, y: number): string | null {
    for (let i = this.hot.length - 1; i >= 0; i--) {
      const h = this.hot[i]!;
      if (x >= h.x && y >= h.y && x <= h.x + h.w && y <= h.y + h.h) return h.id;
    }
    return null;
  }

  private anyHeld(id: string) {
    for (const rec of this.pointers.values()) if (rec.id === id) return true;
    return false;
  }

  private pointerDown(e: PointerEvent) {
    e.preventDefault();
    this.unlock();
    const p = this.pos(e);
    const id = this.hitTest(p.x, p.y);
    this.pointers.set(e.pointerId, { x: p.x, y: p.y, id, moved: 0 });
    this.pressedId = id;
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore synthetic pointers */
    }
    if (id === "left") this.leftHeld = true;
    else if (id === "right") this.rightHeld = true;
    else if (id === null && (this.phase === "play" || this.phase === "ready" || this.phase === "miss")) {
      this.dragId = e.pointerId;
      this.dragX = p.x;
    }
  }

  private pointerMove(e: PointerEvent) {
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    const p = this.pos(e);
    rec.moved += Math.hypot(p.x - rec.x, p.y - rec.y);
    rec.x = p.x;
    rec.y = p.y;
    if (this.dragId === e.pointerId) this.dragX = p.x;
  }

  private pointerUp(e: PointerEvent) {
    const rec = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (rec?.id === "left") this.leftHeld = this.anyHeld("left");
    if (rec?.id === "right") this.rightHeld = this.anyHeld("right");
    if (this.dragId === e.pointerId) this.dragId = null;
    if (this.pressedId === rec?.id) this.pressedId = null;
    if (!rec) return;
    if (rec.moved < 18 && rec.id && rec.id !== "left" && rec.id !== "right") {
      this.activate(rec.id);
    } else if (rec.moved < 18 && rec.id === null && this.phase === "ready") {
      this.launch();
    }
  }

  private keyDown(e: KeyboardEvent) {
    const k = e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(k)) e.preventDefault();
    this.unlock();
    if (k === "ArrowLeft" || k === "a" || k === "A") this.keyLeft = true;
    if (k === "ArrowRight" || k === "d" || k === "D") this.keyRight = true;
    if (k === " " || k === "Enter") {
      if (this.phase === "ready") this.launch();
      else if (this.phase === "play" && k === " ") this.fire();
      else if (this.phase === "menu") this.phase = "pick";
      else if (this.phase === "levelclear") this.nextLevel();
      else if (this.phase === "paused") this.phase = "play";
    }
    if (k === "Shift") this.fire();
    if (k === "Escape" || k === "p" || k === "P") {
      if (this.phase === "play" || this.phase === "ready" || this.phase === "miss") this.phase = "paused";
      else if (this.phase === "paused") this.phase = "play";
    }
    if (k === "m" || k === "M") this.toggleMusic();
  }

  private keyUp(e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this.keyLeft = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this.keyRight = false;
  }

  private activate(id: string) {
    if (id === "play") this.phase = "pick";
    else if (id === "about") this.phase = "about";
    else if (id === "scores") this.phase = "scores";
    else if (id === "back") this.phase = "menu";
    else if (id === "apk") this.downloadApk();
    else if (id === "music") this.toggleMusic();
    else if (id === "sfx") this.toggleSfx();
    else if (id === "beginner" || id === "intermediate" || id === "hardcore") {
      if (id === "hardcore") void this.askTilt();
      this.startRun(id);
    } else if (id === "launch") this.launch();
    else if (id === "fire") this.fire();
    else if (id === "pause") {
      if (this.phase === "play" || this.phase === "ready" || this.phase === "miss") this.phase = "paused";
    } else if (id === "resume") {
      this.phase = this.ball.vx === 0 && this.ball.vy === 0 ? "ready" : "play";
    } else if (id === "menu") {
      this.ufos = [];
      this.items = [];
      this.missiles = [];
      this.phase = "menu";
    } else if (id === "next") this.nextLevel();
    else if (id === "retry") this.startRun(this.mode);
  }

  private async askTilt() {
    const ctor = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof ctor.requestPermission === "function") {
      try {
        await ctor.requestPermission();
      } catch {
        /* user dismissed */
      }
    }
  }

  private downloadApk() {
    void saveApkFile();
  }

  private startRun(mode: Mode) {
    this.mode = mode;
    this.level = 1;
    this.score = 0;
    this.lives = MODE_META[mode].lives;
    this.ammo = 0;
    this.bestNote = false;
    this.items = [];
    this.missiles = [];
    this.ufos = [];
    this.bits = [];
    this.floaters = [];
    this.clearFx();
    this.loadLevel(1);
    this.phase = "ready";
    this.centerPaddle();
    this.stickBall();
  }

  private clearFx() {
    this.fx = { longer: 0, shorter: 0, fast: 0, slow: 0, flip: 0, wrap: 0 };
  }

  private centerPaddle() {
    this.paddle.w = this.basePaddleW();
    this.paddle.x = (frame.w - this.paddle.w) / 2;
    this.paddle.y = frame.paddleY;
    this.paddle.h = frame.paddleH;
  }

  private stickBall() {
    this.ball.r = BALL_R;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.x = this.paddle.x + this.paddle.w / 2;
    this.ball.y = this.paddle.y - this.ball.r - 3;
  }

  private loadLevel(n: number) {
    const spec = LEVELS[n - 1] ?? [];
    this.bricks = new Array(COLS * ROWS).fill(null);
    for (const cell of spec) this.placeCell(cell);
    this.items = [];
    this.missiles = [];
    this.ufos = [];
  }

  private placeCell(cell: Cell, forcePower?: Power) {
    if (cell.i < 0 || cell.i >= COLS * ROWS) return;
    const col = cell.i % COLS;
    const row = Math.floor(cell.i / COLS);
    const power =
      forcePower ??
      (cell.power === "random"
        ? POWERS[Math.floor(Math.random() * POWERS.length)]!
        : (cell.power ?? null));
    const brick: Brick = {
      col,
      row,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      hits: cell.switcher ? 1 : cell.hits,
      power: cell.switcher ? null : power,
      switcher: cell.switcher ?? 0,
      switchable: !!cell.switchable,
      visible: !cell.hidden,
      cooldown: 0,
    };
    this.layoutBrick(brick);
    this.bricks[cell.i] = brick;
  }

  private launch() {
    if (this.phase !== "ready") return;
    const speed = this.targetSpeed();
    const ang = -Math.PI / 2 + (Math.random() * 0.62 - 0.31);
    this.ball.vx = Math.cos(ang) * speed;
    this.ball.vy = Math.sin(ang) * speed;
    this.phase = "play";
    this.blip("bounce");
  }

  private targetSpeed() {
    let mul = 1;
    if (this.fx.fast > 0) mul *= 1.38;
    if (this.fx.slow > 0) mul *= 0.7;
    return MODE_META[this.mode].speed * mul * (frame.square ? 1.22 : 1);
  }

  private fire() {
    if (this.phase !== "play" || this.ammo <= 0) return;
    this.ammo -= 1;
    const w = 28;
    const h = 52;
    this.missiles.push({
      x: this.paddle.x + this.paddle.w / 2 - w / 2,
      y: this.paddle.y - h,
      w,
      h,
      vy: 980,
    });
    this.blip("missile_launch");
  }

  private update(dt: number) {
    for (const bit of this.bits) {
      bit.life -= dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.vy += 500 * dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 36 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt);

    if (this.phase === "miss") {
      this.movePaddle(dt);
      this.stickBall();
      this.missT -= dt;
      if (this.missT <= 0) this.phase = "ready";
      return;
    }
    if (this.phase === "ready") {
      this.movePaddle(dt);
      this.stickBall();
      return;
    }
    if (this.phase !== "play") return;

    this.fx.longer = Math.max(0, this.fx.longer - dt);
    this.fx.shorter = Math.max(0, this.fx.shorter - dt);
    this.fx.fast = Math.max(0, this.fx.fast - dt);
    this.fx.slow = Math.max(0, this.fx.slow - dt);
    this.fx.flip = Math.max(0, this.fx.flip - dt);
    this.fx.wrap = Math.max(0, this.fx.wrap - dt);
    for (const b of this.bricks) if (b && b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - dt);

    this.movePaddle(dt);
    this.moveBall(dt);
    this.moveItems(dt);
    this.moveMissiles(dt);
    this.moveUfos(dt);
  }

  private paddleWidth() {
    let mul = 1;
    if (this.fx.longer > 0) mul *= 1.48;
    if (this.fx.shorter > 0) mul *= 0.7;
    return this.basePaddleW() * mul;
  }

  private movePaddle(dt: number) {
    const prevCenter = this.paddle.x + this.paddle.w / 2;
    this.paddle.w = this.paddleWidth();
    this.paddle.x = prevCenter - this.paddle.w / 2;

    const flip = this.fx.flip > 0;
    const left = flip ? this.rightHeld || this.keyRight : this.leftHeld || this.keyLeft;
    const right = flip ? this.leftHeld || this.keyLeft : this.rightHeld || this.keyRight;
    const speed = frame.square ? 1120 : 860;

    if (left && !right) {
      this.paddle.x -= speed * dt;
    } else if (right && !left) {
      this.paddle.x += speed * dt;
    } else if (this.dragId !== null) {
      const center = flip ? frame.w - this.dragX : this.dragX;
      this.paddle.x = center - this.paddle.w / 2;
    } else if (MODE_META[this.mode].tilt && this.tiltSeen && this.fx.flip <= 0) {
      const t = clamp(this.tilt, -28, 28) / 28;
      const target = (frame.w - this.paddle.w) / 2 + t * (frame.w / 2 - this.paddle.w / 2);
      this.paddle.x += (target - this.paddle.x) * Math.min(1, dt * 8);
    } else if (MODE_META[this.mode].tilt && this.tiltSeen && this.fx.flip > 0) {
      const t = clamp(this.tilt, -28, 28) / 28;
      const target = (frame.w - this.paddle.w) / 2 - t * (frame.w / 2 - this.paddle.w / 2);
      this.paddle.x += (target - this.paddle.x) * Math.min(1, dt * 8);
    }

    if (this.fx.wrap > 0) {
      if (this.paddle.x > frame.w) this.paddle.x = -this.paddle.w;
      if (this.paddle.x + this.paddle.w < 0) this.paddle.x = frame.w;
    } else {
      this.paddle.x = clamp(this.paddle.x, 0, frame.w - this.paddle.w);
    }
  }

  private moveBall(dt: number) {
    if (this.phase !== "play") return;
    const speed = this.targetSpeed();
    const mag = Math.hypot(this.ball.vx, this.ball.vy) || 1;
    this.ball.vx = (this.ball.vx / mag) * speed;
    this.ball.vy = (this.ball.vy / mag) * speed;
    if (Math.abs(this.ball.vy) < speed * 0.26) {
      this.ball.vy = Math.sign(this.ball.vy || -1) * speed * 0.26;
      const m2 = Math.hypot(this.ball.vx, this.ball.vy) || 1;
      this.ball.vx = (this.ball.vx / m2) * speed;
      this.ball.vy = (this.ball.vy / m2) * speed;
    }
    const dist = speed * dt;
    const steps = Math.max(1, Math.ceil(dist / (this.ball.r * 0.55)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (this.phase !== "play") return;
      this.ball.x += this.ball.vx * h;
      this.ball.y += this.ball.vy * h;
      this.walls();
      this.brickHit();
      this.paddleHit();
      if (this.ball.y - this.ball.r > frame.h + 8) {
        this.miss();
        return;
      }
    }
  }

  private walls() {
    const r = this.ball.r;
    if (this.ball.x < r) {
      this.ball.x = r;
      this.ball.vx = Math.abs(this.ball.vx);
      this.blip("bounce");
    } else if (this.ball.x > frame.w - r) {
      this.ball.x = frame.w - r;
      this.ball.vx = -Math.abs(this.ball.vx);
      this.blip("bounce");
    }
    if (this.ball.y < r + 96) {
      this.ball.y = r + 96;
      this.ball.vy = Math.abs(this.ball.vy);
      this.blip("bounce");
    }
  }

  private brickHit() {
    const r = this.ball.r;
    let best: { b: Brick; d2: number; dx: number; dy: number } | null = null;
    for (const b of this.bricks) {
      if (!b || !b.visible || b.hits <= 0 || b.cooldown > 0) continue;
      const cx = clamp(this.ball.x, b.x, b.x + b.w);
      const cy = clamp(this.ball.y, b.y, b.y + b.h);
      const dx = this.ball.x - cx;
      const dy = this.ball.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r * r && (!best || d2 < best.d2)) best = { b, d2, dx, dy };
    }
    if (!best) return;
    const dist = Math.sqrt(best.d2);
    let nx = 0;
    let ny = -1;
    if (dist > 0.001) {
      nx = best.dx / dist;
      ny = best.dy / dist;
    } else if (Math.abs(this.ball.vx) > Math.abs(this.ball.vy)) {
      nx = -Math.sign(this.ball.vx) || -1;
      ny = 0;
    }
    const push = r - dist + 0.75;
    this.ball.x += nx * push;
    this.ball.y += ny * push;
    const dot = this.ball.vx * nx + this.ball.vy * ny;
    if (dot < 0) {
      this.ball.vx -= 2 * dot * nx;
      this.ball.vy -= 2 * dot * ny;
    }
    this.chip(best.b);
  }

  private paddleHit() {
    if (this.ball.vy <= 0) return;
    const p = this.paddle;
    const r = this.ball.r;
    if (
      this.ball.y + r >= p.y &&
      this.ball.y <= p.y + p.h &&
      this.ball.x >= p.x - r &&
      this.ball.x <= p.x + p.w + r
    ) {
      const hit = clamp((this.ball.x - (p.x + p.w / 2)) / (p.w / 2), -1, 1);
      const speed = this.targetSpeed();
      const ang = -Math.PI / 2 + hit * 1.05;
      this.ball.vx = Math.cos(ang) * speed;
      this.ball.vy = Math.sin(ang) * speed;
      this.ball.y = p.y - r - 1;
      this.blip("bounce");
      if (!this.reduced) this.shake = Math.max(this.shake, 0.05);
    }
  }

  private chip(b: Brick) {
    b.cooldown = 0.12;
    this.blip("hit");
    if (!this.reduced) this.shake = Math.max(this.shake, 0.09);
    if (b.switcher) {
      this.toggleSwitches();
      return;
    }
    this.score += 10;
    this.floater(b.x + b.w / 2, b.y, "+10");
    this.burst(b);
    if (b.power || b.hits <= 1) {
      if (b.power) this.spawnItem(b, b.power);
      this.removeBrick(b);
    } else {
      b.hits -= 1;
    }
    this.checkClear();
  }

  private smash(b: Brick) {
    if (b.switcher) {
      this.toggleSwitches();
      return;
    }
    this.score += 10;
    this.floater(b.x + b.w / 2, b.y, "+10");
    this.burst(b);
    if (b.power) this.spawnItem(b, b.power);
    this.removeBrick(b);
    this.checkClear();
  }

  private removeBrick(b: Brick) {
    const i = b.row * COLS + b.col;
    this.bits.push({
      x: b.x,
      y: b.y,
      vx: 0,
      vy: 0,
      life: 0.22,
      max: 0.22,
      color: "break",
      s: b.w,
    });
    this.bricks[i] = null;
  }

  private toggleSwitches() {
    for (const b of this.bricks) {
      if (!b) continue;
      if (b.switchable) b.visible = !b.visible;
      if (b.switcher === 1) b.switcher = 2;
      else if (b.switcher === 2) b.switcher = 1;
    }
  }

  private checkClear() {
    if (this.phase !== "play") return;
    for (const b of this.bricks) {
      if (b && !b.switcher && b.hits > 0) return;
    }
    this.score += 50 * this.level;
    this.ball.vx = 0;
    this.ball.vy = 0;
    if (this.level >= LEVELS.length) {
      this.phase = "win";
      this.commitScore();
    } else {
      this.phase = "levelclear";
    }
  }

  private miss() {
    this.lives -= 1;
    this.missiles = [];
    this.items = [];
    this.clearFx();
    if (this.lives <= 0) {
      this.lives = 0;
      this.phase = "over";
      this.commitScore();
      return;
    }
    this.phase = "miss";
    this.missT = 0.65;
    this.stickBall();
  }

  private commitScore() {
    const rows = readScores();
    if (this.score <= 0) {
      this.bestNote = false;
      return;
    }
    const best = rows[0]?.score ?? 0;
    this.bestNote = this.score >= best;
    rows.push({ score: this.score, level: this.level, mode: this.mode, at: Date.now() });
    rows.sort((a, b) => b.score - a.score);
    writeScores(rows);
  }

  private nextLevel() {
    if (this.level >= LEVELS.length) {
      this.phase = "win";
      return;
    }
    this.level += 1;
    this.clearFx();
    this.loadLevel(this.level);
    this.centerPaddle();
    this.stickBall();
    this.phase = "ready";
  }

  private spawnItem(b: Brick, power: Power) {
    const w = 108;
    const h = 36;
    this.items.push({
      x: b.x + b.w / 2 - w / 2,
      y: b.y + b.h,
      w,
      h,
      vy: 300,
      power,
    });
  }

  private moveItems(dt: number) {
    for (const it of this.items) it.y += it.vy * dt;
    const p = this.paddle;
    this.items = this.items.filter((it) => {
      const caught =
        it.y + it.h >= p.y &&
        it.y <= p.y + p.h &&
        it.x + it.w >= p.x &&
        it.x <= p.x + p.w;
      if (caught) {
        this.applyPower(it.power);
        this.blip("catch");
        return false;
      }
      return it.y < frame.h + 20;
    });
  }

  private applyPower(power: Power) {
    if (power === "longer") this.fx.longer = 14;
    else if (power === "shorter") this.fx.shorter = 12;
    else if (power === "fast") this.fx.fast = 12;
    else if (power === "slow") this.fx.slow = 10;
    else if (power === "flip") this.fx.flip = 12;
    else if (power === "wrap") this.fx.wrap = 14;
    else if (power === "missile") this.ammo += 3;
    else if (power === "life") this.lives = Math.min(9, this.lives + 1);
    else if (power === "score") {
      this.score += 100;
      this.floater(this.paddle.x + this.paddle.w / 2, this.paddle.y - 20, "+100");
    } else if (power === "ufo") {
      this.ufos.push({
        x: -140,
        y: 150 + Math.random() * 80,
        vx: 250,
        kind: Math.random() > 0.34 ? 0 : 1,
        col: -2,
        t: 0,
      });
    }
    if (power !== "score") {
      this.floater(this.paddle.x + this.paddle.w / 2, this.paddle.y - 24, POWER_LABEL[power]);
    }
  }

  private moveMissiles(dt: number) {
    for (const m of this.missiles) m.y -= m.vy * dt;
    const keep: Missile[] = [];
    for (const m of this.missiles) {
      if (this.phase !== "play" || m.y + m.h < 60) continue;
      const cx = m.x + m.w / 2;
      const cy = m.y + 8;
      let hit: Brick | null = null;
      for (const b of this.bricks) {
        if (!b || !b.visible || b.hits <= 0) continue;
        if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
          hit = b;
          break;
        }
      }
      if (hit) this.smash(hit);
      else keep.push(m);
    }
    this.missiles = keep;
  }

  private moveUfos(dt: number) {
    const keep: Ufo[] = [];
    for (const u of this.ufos) {
      u.t += dt;
      u.x += u.vx * dt;
      u.y += Math.sin(u.t * 2.2) * 40 * dt;
      const col = Math.floor((u.x + 60) / frame.cellW);
      if (col !== u.col) {
        u.col = col;
        this.ufoDrop(u, col);
      }
      if (u.x < frame.w + 160) keep.push(u);
    }
    this.ufos = keep;
  }

  private ufoDrop(u: Ufo, col: number) {
    if (col < 0 || col >= COLS) return;
    const row = clamp(Math.floor((u.y - frame.gridY) / frame.cellH), 0, 9);
    for (let r = row; r < row + 2; r++) {
      const i = r * COLS + col;
      if (this.bricks[i]) continue;
      if (Math.random() > 0.5) continue;
      if (u.kind === 0) {
        this.placeCell({ i, hits: 1, power: "random" });
      } else {
        this.placeCell({ i, hits: 1 + Math.ceil(Math.random() * 3) });
      }
    }
  }

  private burst(b: Brick) {
    const colors = ["#f4efe4", "#e7b008", "#e25b45", "#7ec8e3", "#f4efe4"];
    const color = colors[Math.min(b.hits, 4)] ?? "#f4efe4";
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 180;
      this.bits.push({
        x: b.x + b.w / 2,
        y: b.y + b.h / 2,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.2,
        max: 0.5,
        color,
        s: 4 + Math.random() * 4,
      });
    }
  }

  private floater(x: number, y: number, text: string) {
    this.floaters.push({ x, y, text, life: 0.7 });
    if (this.floaters.length > 16) this.floaters.shift();
  }

  private draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(
      this.canvas.width / frame.w,
      0,
      0,
      this.canvas.height / frame.h,
      0,
      0,
    );
    ctx.clearRect(0, 0, frame.w, frame.h);
    this.hot = [];
    const ox = this.shake > 0 && !this.reduced ? (Math.random() - 0.5) * 10 * (this.shake / 0.1) : 0;
    const oy = this.shake > 0 && !this.reduced ? (Math.random() - 0.5) * 6 * (this.shake / 0.1) : 0;
    ctx.save();
    ctx.translate(ox, oy);

    if (this.phase === "loading") this.drawLoading(ctx);
    else if (this.phase === "menu") this.drawMenu(ctx);
    else if (this.phase === "pick") this.drawPick(ctx);
    else if (this.phase === "about") this.drawAbout(ctx);
    else if (this.phase === "scores") this.drawScores(ctx);
    else this.drawMatch(ctx);

    ctx.restore();
    document.documentElement.dataset.phase = this.phase;
  }

  private blit(
    ctx: CanvasRenderingContext2D,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const img = this.images.get(name);
    if (!imgOk(img)) return false;
    ctx.drawImage(img, x, y, w, h);
    return true;
  }

  private round(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  private button(
    ctx: CanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    kind: "gold" | "navy" | "ghost",
  ) {
    this.hot.push({ id, x, y, w, h });
    const pressed = this.pressedId === id;
    const yy = y + (pressed ? 3 : 0);
    this.round(ctx, x, yy, w, h, 20);
    if (kind === "gold") {
      ctx.fillStyle = "#e7b008";
      ctx.fill();
      ctx.fillStyle = "#1b1403";
    } else if (kind === "navy") {
      ctx.fillStyle = "#102033";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#e7b008";
      ctx.stroke();
      ctx.fillStyle = "#f4efe4";
    } else {
      ctx.fillStyle = "rgba(6, 14, 24, 0.45)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244, 239, 228, 0.4)";
      ctx.stroke();
      ctx.fillStyle = "#f4efe4";
    }
    ctx.font = "700 30px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, yy + h / 2 + 1);
  }

  private iconButton(
    ctx: CanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
    label: string,
    on: boolean,
  ) {
    this.hot.push({ id, x, y, w: 96, h: 96 });
    this.round(ctx, x, y, 96, 96, 24);
    ctx.fillStyle = on ? "#e7b008" : "rgba(8,16,28,0.55)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = on ? "#1b1403" : "rgba(244,239,228,0.35)";
    ctx.stroke();
    ctx.fillStyle = on ? "#1b1403" : "#f4efe4";
    ctx.font = "700 22px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 48, y + 48);
  }

  private backdrop(ctx: CanvasRenderingContext2D) {
    if (!this.blit(ctx, "bg", 0, 0, frame.w, frame.h)) {
      ctx.fillStyle = "#071422";
      ctx.fillRect(0, 0, frame.w, frame.h);
    }
    const g = ctx.createLinearGradient(0, 0, 0, frame.h);
    g.addColorStop(0, "rgba(4, 10, 18, 0.45)");
    g.addColorStop(0.4, "rgba(4, 10, 18, 0.05)");
    g.addColorStop(1, "rgba(4, 10, 18, 0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, frame.w, frame.h);
  }

  private drawLoading(ctx: CanvasRenderingContext2D) {
    this.backdrop(ctx);
    const titleY = frame.square ? frame.h * 0.42 : 560;
    const barY = frame.square ? frame.h * 0.5 : 640;
    const barW = frame.square ? 520 : 400;
    const barX = (frame.w - barW) / 2;
    ctx.fillStyle = "#f4efe4";
    ctx.font = "700 36px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BrickBreaker Bold", frame.w / 2, titleY);
    this.round(ctx, barX, barY, barW, 14, 7);
    ctx.fillStyle = "rgba(244,239,228,0.2)";
    ctx.fill();
    this.round(ctx, barX, barY, barW * (this.loadN / this.loadD), 14, 7);
    ctx.fillStyle = "#e7b008";
    ctx.fill();
  }

  private drawMenu(ctx: CanvasRenderingContext2D) {
    if (frame.square) {
      this.drawMenuSquare(ctx);
      return;
    }
    this.backdrop(ctx);
    this.blit(ctx, "moon", 520, 40, 150, 200);
    this.blit(ctx, "start_bg", 0, 980, frame.w, 355);
    const logoW = 640;
    const logoH = (170 / 629) * logoW;
    if (!this.blit(ctx, "logo_L", (frame.w - logoW) / 2, 150, logoW, logoH)) {
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 64px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BrickBreaker", frame.w / 2, 240);
      ctx.fillStyle = "#e7b008";
      ctx.fillText("Bold", frame.w / 2, 320);
    }
    const play = this.images.get("button_play");
    const px = 150;
    const py = 470;
    const pw = 420;
    const ph = 120;
    this.hot.push({ id: "play", x: px, y: py, w: pw, h: ph });
    if (imgOk(play)) {
      ctx.drawImage(play, px, py + (this.pressedId === "play" ? 4 : 0), pw, ph);
    } else {
      this.button(ctx, "play", px, py, pw, ph, "Play", "gold");
    }
    this.button(ctx, "about", 170, 640, 380, 84, "About", "navy");
    this.button(ctx, "scores", 170, 748, 380, 84, "High scores", "navy");
    if (!assetBase().startsWith(".")) {
      this.button(ctx, "apk", 170, 856, 380, 84, "Download APK", "gold");
    }
    ctx.fillStyle = "rgba(244,239,228,0.72)";
    ctx.font = "500 22px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Version 3.0.0  ·  Android 15 and up", frame.w / 2, 990);
    this.iconButton(ctx, "music", 40, 1148, this.musicOn ? "MUS" : "OFF", this.musicOn);
    this.iconButton(ctx, "sfx", 156, 1148, this.sfxOn ? "SFX" : "OFF", this.sfxOn);
  }

  private drawMenuSquare(ctx: CanvasRenderingContext2D) {
    this.backdrop(ctx);
    this.blit(ctx, "moon", frame.w - 190, 36, 150, 190);
    this.blit(ctx, "start_bg", 0, frame.h - 280, frame.w, 280);
    const logoW = 560;
    const logoH = (170 / 629) * logoW;
    const logoY = 250;
    if (!this.blit(ctx, "logo_L", (frame.w - logoW) / 2, logoY, logoW, logoH)) {
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 64px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BrickBreaker", frame.w / 2, logoY + 70);
      ctx.fillStyle = "#e7b008";
      ctx.fillText("Bold", frame.w / 2, logoY + 140);
    }
    const pw = 460;
    const ph = 104;
    const px = (frame.w - pw) / 2;
    const py = 470;
    this.hot.push({ id: "play", x: px, y: py, w: pw, h: ph });
    const play = this.images.get("button_play");
    if (imgOk(play)) {
      ctx.drawImage(play, px, py + (this.pressedId === "play" ? 4 : 0), pw, ph);
    } else {
      this.button(ctx, "play", px, py, pw, ph, "Play", "gold");
    }
    const bw = 300;
    const gap = 24;
    const bx = (frame.w - (bw * 2 + gap)) / 2;
    this.button(ctx, "about", bx, 604, bw, 80, "About", "navy");
    this.button(ctx, "scores", bx + bw + gap, 604, bw, 80, "High scores", "navy");
    let extras = 720;
    if (!assetBase().startsWith(".")) {
      this.button(ctx, "apk", (frame.w - 420) / 2, 708, 420, 76, "Download APK", "gold");
      extras = 812;
    }
    ctx.fillStyle = "rgba(244,239,228,0.72)";
    ctx.font = "500 22px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Version 3.0.0", frame.w / 2, extras);
    this.iconButton(ctx, "music", frame.w / 2 - 116, extras + 28, this.musicOn ? "MUS" : "OFF", this.musicOn);
    this.iconButton(ctx, "sfx", frame.w / 2 + 20, extras + 28, this.sfxOn ? "SFX" : "OFF", this.sfxOn);
  }

  private drawPick(ctx: CanvasRenderingContext2D) {
    if (frame.square) {
      this.drawPickSquare(ctx);
      return;
    }
    this.backdrop(ctx);
    this.button(ctx, "back", 28, 28, 140, 72, "Back", "ghost");
    const title = this.images.get("select_title");
    if (imgOk(title)) ctx.drawImage(title, (frame.w - 460) / 2, 108, 460, 160);
    else {
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 42px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Select a difficulty", frame.w / 2, 180);
    }
    const modes: Mode[] = ["beginner", "intermediate", "hardcore"];
    modes.forEach((mode, i) => {
      const y = 300 + i * 230;
      this.hot.push({ id: mode, x: 48, y, w: 624, h: 220 });
      this.round(ctx, 48, y, 624, 220, 28);
      ctx.fillStyle = "rgba(8, 16, 28, 0.72)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = i === 2 ? "#e25b45" : "#e7b008";
      ctx.stroke();
      const art = this.images.get(mode === "beginner" ? "beginner" : mode);
      if (imgOk(art)) ctx.drawImage(art, 80, y + 36, 360, 80);
      ctx.fillStyle = "#f4efe4";
      ctx.font = "500 28px Outfit, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(MODE_META[mode].blurb, 80, y + 160);
      ctx.fillStyle = "#e7b008";
      ctx.font = "700 22px Outfit, sans-serif";
      ctx.fillText(MODE_META[mode].title.toUpperCase(), 80, y + 196);
    });
  }

  private drawPickSquare(ctx: CanvasRenderingContext2D) {
    this.backdrop(ctx);
    this.button(ctx, "back", 36, 48, 140, 64, "Back", "ghost");
    ctx.fillStyle = "#f4efe4";
    ctx.font = "700 40px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Select a difficulty", frame.w / 2, 200);
    const modes: Mode[] = ["beginner", "intermediate", "hardcore"];
    modes.forEach((mode, i) => {
      const y = 250 + i * 230;
      const x = 48;
      const w = frame.w - 96;
      const h = 210;
      this.hot.push({ id: mode, x, y, w, h });
      this.round(ctx, x, y, w, h, 28);
      ctx.fillStyle = "rgba(8, 16, 28, 0.72)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = i === 2 ? "#e25b45" : "#e7b008";
      ctx.stroke();
      const art = this.images.get(mode === "beginner" ? "beginner" : mode);
      if (imgOk(art)) ctx.drawImage(art, x + 36, y + 28, 420, 90);
      ctx.fillStyle = "#f4efe4";
      ctx.font = "500 28px Outfit, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(MODE_META[mode].blurb, x + 36, y + 150);
      ctx.fillStyle = "#e7b008";
      ctx.font = "700 22px Outfit, sans-serif";
      ctx.fillText(MODE_META[mode].title.toUpperCase(), x + 36, y + 186);
    });
  }

  private drawAbout(ctx: CanvasRenderingContext2D) {
    if (frame.square) {
      this.drawAboutSquare(ctx);
      return;
    }
    this.backdrop(ctx);
    this.button(ctx, "back", 28, 28, 140, 72, "Back", "ghost");
    ctx.fillStyle = "#e7b008";
    ctx.font = "700 40px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("About", frame.w / 2, 160);
    const paragraphs = [
      "BrickBreaker Bold started as an open source BlackBerry 10 game by the Browser Team at Research In Motion. Apache License 2.0.",
      "This is a modern rebuild for Android 15 and up, and for current browsers. Nine levels, switches, missiles, power ups, and the UFO are intact.",
      "Original authors Xinyuan Fan and Pawel Chomicki, produced by Genevieve Mak. Music by Kevin MacLeod.",
      "Drag or use the arrows. A moves left, D moves right. Space launches. On a phone, tilt in Hardcore.",
    ];
    ctx.font = "500 26px Outfit, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#f4efe4";
    let y = 220;
    for (const para of paragraphs) {
      const lines = this.wrap(ctx, para, 620);
      for (const line of lines) {
        ctx.fillText(line, 50, y);
        y += 36;
      }
      y += 22;
    }
  }

  private wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width > max && cur) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  private drawAboutSquare(ctx: CanvasRenderingContext2D) {
    this.backdrop(ctx);
    this.button(ctx, "back", 36, 48, 140, 64, "Back", "ghost");
    ctx.fillStyle = "#e7b008";
    ctx.font = "700 40px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("About", frame.w / 2, 200);
    const paragraphs = [
      "BrickBreaker Bold started as an open source BlackBerry 10 game by the Browser Team at Research In Motion. Apache License 2.0.",
      "This is a modern rebuild for phones, including square screens like the Passport, and for current browsers. Nine levels, switches, missiles, power ups, and the UFO are intact.",
      "Original authors Xinyuan Fan and Pawel Chomicki, produced by Genevieve Mak. Music by Kevin MacLeod.",
      "Drag or use the arrows. A moves left, D moves right. Space launches. On a phone, tilt in Hardcore.",
    ];
    ctx.font = "500 26px Outfit, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#f4efe4";
    let y = 270;
    for (const para of paragraphs) {
      const lines = this.wrap(ctx, para, frame.w - 120);
      for (const line of lines) {
        ctx.fillText(line, 60, y);
        y += 36;
      }
      y += 18;
    }
  }

  private drawScores(ctx: CanvasRenderingContext2D) {
    if (frame.square) {
      this.drawScoresSquare(ctx);
      return;
    }
    this.backdrop(ctx);
    this.button(ctx, "back", 28, 28, 140, 72, "Back", "ghost");
    ctx.fillStyle = "#e7b008";
    ctx.font = "700 40px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("High scores", frame.w / 2, 160);
    const rows = readScores();
    if (rows.length === 0) {
      ctx.fillStyle = "#f4efe4";
      ctx.font = "500 28px Outfit, sans-serif";
      ctx.fillText("No scores yet. Play a round.", frame.w / 2, 420);
      return;
    }
    rows.slice(0, 8).forEach((row, i) => {
      const y = 230 + i * 110;
      this.round(ctx, 48, y, 624, 96, 20);
      ctx.fillStyle = "rgba(8,16,28,0.66)";
      ctx.fill();
      ctx.fillStyle = "#e7b008";
      ctx.font = "700 28px Outfit, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1).padStart(2, "0"), 72, y + 48);
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 32px Outfit, sans-serif";
      ctx.fillText(String(row.score), 150, y + 48);
      ctx.font = "500 22px Outfit, sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(244,239,228,0.8)";
      const label = `${MODE_META[row.mode]?.title ?? row.mode}  ·  Lv ${row.level}`;
      ctx.fillText(label, 640, y + 48);
    });
  }

  private drawScoresSquare(ctx: CanvasRenderingContext2D) {
    this.backdrop(ctx);
    this.button(ctx, "back", 36, 48, 140, 64, "Back", "ghost");
    ctx.fillStyle = "#e7b008";
    ctx.font = "700 40px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("High scores", frame.w / 2, 200);
    const rows = readScores();
    if (rows.length === 0) {
      ctx.fillStyle = "#f4efe4";
      ctx.font = "500 28px Outfit, sans-serif";
      ctx.fillText("No scores yet. Play a round.", frame.w / 2, frame.h / 2);
      return;
    }
    rows.slice(0, 8).forEach((row, i) => {
      const y = 260 + i * 96;
      const x = 48;
      const w = frame.w - 96;
      this.round(ctx, x, y, w, 88, 20);
      ctx.fillStyle = "rgba(8,16,28,0.66)";
      ctx.fill();
      ctx.fillStyle = "#e7b008";
      ctx.font = "700 28px Outfit, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1).padStart(2, "0"), x + 24, y + 44);
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 32px Outfit, sans-serif";
      ctx.fillText(String(row.score), x + 100, y + 44);
      ctx.font = "500 22px Outfit, sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(244,239,228,0.8)";
      const label = `${MODE_META[row.mode]?.title ?? row.mode}  ·  Lv ${row.level}`;
      ctx.fillText(label, x + w - 28, y + 44);
    });
  }

  private drawMatch(ctx: CanvasRenderingContext2D) {
    this.backdrop(ctx);
    const moon = this.images.get("moon");
    if (imgOk(moon)) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(moon, frame.w - 180, 80, 140, 190);
      ctx.globalAlpha = 1;
    }

    for (const b of this.bricks) if (b) this.drawBrick(ctx, b);
    for (const bit of this.bits) {
      if (bit.color === "break") {
        ctx.globalAlpha = Math.max(0, bit.life / bit.max);
        this.blit(ctx, "breakingBrick", bit.x, bit.y, bit.s, bit.s * (50 / 180));
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.max(0, bit.life / bit.max);
        ctx.fillStyle = bit.color;
        ctx.fillRect(bit.x, bit.y, bit.s, bit.s);
        ctx.globalAlpha = 1;
      }
    }
    for (const it of this.items) {
      const idx = POWERS.indexOf(it.power);
      if (!this.blit(ctx, `item${idx + 1}`, it.x, it.y, it.w, it.h)) {
        ctx.fillStyle = "#e7b008";
        ctx.fillRect(it.x, it.y, it.w, it.h);
      }
    }
    for (const u of this.ufos) {
      const name = u.kind === 0 ? "ufo2" : "ufo4";
      if (!this.blit(ctx, name, u.x, u.y, 130, 90)) {
        ctx.fillStyle = "#7ec8e3";
        ctx.fillRect(u.x, u.y, 130, 40);
      }
    }
    for (const m of this.missiles) {
      if (!this.blit(ctx, "missile", m.x, m.y, m.w, m.h)) {
        ctx.fillStyle = "#e25b45";
        ctx.fillRect(m.x, m.y, m.w, m.h);
      }
    }

    this.drawPaddle(ctx);
    const bx = this.ball.x - this.ball.r;
    const by = this.ball.y - this.ball.r;
    ctx.save();
    ctx.shadowColor = "#f4efe4";
    ctx.shadowBlur = 12;
    if (!this.blit(ctx, "ball", bx, by, this.ball.r * 2, this.ball.r * 2)) {
      ctx.beginPath();
      ctx.fillStyle = "#f4efe4";
      ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / 0.7);
      ctx.fillStyle = "#e7b008";
      ctx.font = "700 24px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }

    this.drawHud(ctx);

    if (this.phase === "paused") this.overlay(ctx, "Paused", ["resume", "Resume"], ["menu", "Main menu"]);
    else if (this.phase === "levelclear") {
      this.dim(ctx);
      this.blit(ctx, "level_clear", (frame.w - 560) / 2, 430, 560, 110);
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 32px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Score ${this.score}`, frame.w / 2, 580);
      this.button(ctx, "next", (frame.w - 380) / 2, 660, 380, 96, "Next level", "gold");
    } else if (this.phase === "win") {
      this.dim(ctx);
      if (!this.blit(ctx, "win", (frame.w - 560) / 2, 380, 560, 200)) {
        ctx.fillStyle = "#e7b008";
        ctx.font = "700 64px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("You win", frame.w / 2, 460);
      }
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 32px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Score ${this.score}`, frame.w / 2, 640);
      if (this.bestNote) ctx.fillText("New best", frame.w / 2, 690);
      this.button(ctx, "retry", (frame.w - 380) / 2, 760, 380, 90, "Play again", "gold");
      this.button(ctx, "menu", (frame.w - 380) / 2, 870, 380, 90, "Main menu", "navy");
    } else if (this.phase === "over") {
      this.dim(ctx);
      if (!this.blit(ctx, "gameover", (frame.w - 580) / 2, 400, 580, 158)) {
        ctx.fillStyle = "#e25b45";
        ctx.font = "700 60px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Game over", frame.w / 2, 480);
      }
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 32px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Score ${this.score}`, frame.w / 2, 620);
      if (this.bestNote) ctx.fillText("New best", frame.w / 2, 668);
      this.button(ctx, "retry", (frame.w - 380) / 2, 740, 380, 90, "Try again", "gold");
      this.button(ctx, "menu", (frame.w - 380) / 2, 850, 380, 90, "Main menu", "navy");
    } else if (this.phase === "miss") {
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 48px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Miss", frame.w / 2, frame.paddleY - 148);
    }
  }

  private dim(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(4, 8, 16, 0.62)";
    ctx.fillRect(0, 0, frame.w, frame.h);
  }

  private overlay(
    ctx: CanvasRenderingContext2D,
    title: string,
    primary: [string, string],
    secondary: [string, string],
  ) {
    this.dim(ctx);
    ctx.fillStyle = "#f4efe4";
    ctx.font = "700 56px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const bx = (frame.w - 380) / 2;
    ctx.fillText(title, frame.w / 2, frame.square ? 360 : 460);
    this.button(ctx, primary[0], bx, frame.square ? 430 : 540, 380, 96, primary[1], "gold");
    this.button(ctx, secondary[0], bx, frame.square ? 550 : 660, 380, 96, secondary[1], "navy");
    const musicX = frame.square ? frame.w / 2 - 116 : 210;
    const sfxX = frame.square ? frame.w / 2 + 20 : 400;
    const iconY = frame.square ? 690 : 820;
    this.iconButton(ctx, "music", musicX, iconY, this.musicOn ? "MUS" : "OFF", this.musicOn);
    this.iconButton(ctx, "sfx", sfxX, iconY, this.sfxOn ? "SFX" : "OFF", this.sfxOn);
  }

  private drawPaddle(ctx: CanvasRenderingContext2D) {
    const p = this.paddle;
    ctx.save();
    ctx.shadowColor = "#9ad7ff";
    ctx.shadowBlur = 16;
    this.round(ctx, p.x, p.y, p.w, p.h, p.h / 2);
    const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    g.addColorStop(0, "#f4fbff");
    g.addColorStop(0.42, "#7ec8e3");
    g.addColorStop(1, "#3a2d9a");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.save();
    this.round(ctx, p.x + 10, p.y + 6, p.w - 20, 8, 6);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
    ctx.restore();
  }

  private drawBrick(ctx: CanvasRenderingContext2D, b: Brick) {
    let name = "brick1";
    if (b.switcher === 2) name = "brick7";
    else if (b.switcher === 1) name = "brick5";
    else if (b.power) name = "brick6";
    else name = `brick${clamp(b.hits, 1, 4)}`;
    ctx.save();
    if (!b.visible) ctx.globalAlpha = 0.16;
    if (!this.blit(ctx, name, b.x, b.y, b.w, b.h)) {
      ctx.fillStyle = b.power ? "#e25b45" : "#f4efe4";
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.restore();
  }

  private effectsLine() {
    const parts: string[] = [];
    if (this.fx.longer > 0) parts.push("Wide");
    if (this.fx.shorter > 0) parts.push("Narrow");
    if (this.fx.fast > 0) parts.push("Fast");
    if (this.fx.slow > 0) parts.push("Slow");
    if (this.fx.flip > 0) parts.push("Flip");
    if (this.fx.wrap > 0) parts.push("Wrap");
    if (this.ammo > 0) parts.push(`Missile ${this.ammo}`);
    return parts.join("  ");
  }

  private ghostHint() {
    let visible = false;
    let ghost = false;
    for (const b of this.bricks) {
      if (!b || b.switcher || b.hits <= 0) continue;
      if (b.visible) visible = true;
      else ghost = true;
    }
    return ghost && !visible;
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(4, 10, 18, 0.35)";
    ctx.fillRect(0, 0, frame.w, 96);
    ctx.fillStyle = "#f4efe4";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "700 28px Outfit, sans-serif";
    ctx.fillText(String(this.score).padStart(5, "0"), 28, 40);
    ctx.textAlign = "center";
    ctx.fillStyle = "#e7b008";
    ctx.fillText(`LV ${this.level}`, frame.w / 2, 40);
    ctx.textAlign = "right";
    ctx.fillStyle = "#f4efe4";
    ctx.fillText(`BALL ${this.lives}`, frame.w - 120, 40);
    this.hot.push({ id: "pause", x: frame.w - 100, y: 16, w: 76, h: 64 });
    this.round(ctx, frame.w - 100, 16, 76, 64, 16);
    ctx.fillStyle = "rgba(8,16,28,0.55)";
    ctx.fill();
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(frame.w - 78, 32, 10, 32);
    ctx.fillRect(frame.w - 60, 32, 10, 32);

    const fx = this.effectsLine();
    if (fx && (this.phase === "play" || this.phase === "ready")) {
      ctx.textAlign = "left";
      ctx.font = "500 20px Outfit, sans-serif";
      ctx.fillStyle = "#7ec8e3";
      ctx.fillText(fx, 28, 78);
    }

    if (this.phase === "ready") {
      ctx.textAlign = "center";
      ctx.fillStyle = "#f4efe4";
      ctx.font = "700 28px Outfit, sans-serif";
      const hint = this.finePointer
        ? "Tap to launch. Arrows or A and D move."
        : MODE_META[this.mode].tilt
          ? "Tap to launch. Tilt or drag."
          : "Tap to launch. Drag the paddle.";
      ctx.fillText(hint, frame.w / 2, frame.paddleY - 108);
      this.button(ctx, "launch", (frame.w - 420) / 2, frame.h - 132, 420, 96, "Launch", "gold");
    }

    if (this.ghostHint() && this.phase === "play") {
      ctx.textAlign = "center";
      ctx.fillStyle = "#e7b008";
      ctx.font = "700 24px Outfit, sans-serif";
      ctx.fillText("Hit the switch to reveal the rest", frame.w / 2, frame.paddleY - 148);
    }

    const showArrows =
      MODE_META[this.mode].buttons && (this.phase === "play" || this.phase === "miss");
    if (showArrows) {
      this.button(ctx, "left", 24, frame.h - 132, 160, 100, "Left", "navy");
      this.button(ctx, "right", frame.w - 184, frame.h - 132, 160, 100, "Right", "navy");
    }
    if (this.ammo > 0 && this.phase === "play") {
      this.button(ctx, "fire", (frame.w - 300) / 2, frame.h - 128, 300, 96, `Fire ${this.ammo}`, "gold");
    }
  }
}
