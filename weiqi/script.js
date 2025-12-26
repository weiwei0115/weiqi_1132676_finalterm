(() => {
  // ===== 基本常數 =====
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const OTHER = c => (c === BLACK ? WHITE : BLACK);
const PAD_RATIO = 0.03; // 你要的棋盤邊界比例

  // ===== DOM =====
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const turnText = document.getElementById("turnText");
  const turnDot = document.getElementById("turnDot");
  const aiThinking = document.getElementById("aiThinking");
  const sizeSel = document.getElementById("sizeSel");
  const firstSel = document.getElementById("firstSel");
  const aiLevelSel = document.getElementById("aiLevel");
  const aiColorSel = document.getElementById("aiColor");
  const mcPlayoutsEl = document.getElementById("mcPlayouts");
  const mcCandidatesEl = document.getElementById("mcCandidates");
  const newBtn = document.getElementById("newBtn");
  const undoBtn = document.getElementById("undoBtn");
  const passBtn = document.getElementById("passBtn");
  const resignBtn = document.getElementById("resignBtn");
  const clearLogBtn = document.getElementById("clearLogBtn");
  const capB = document.getElementById("capB");
  const capW = document.getElementById("capW");
  const logEl = document.getElementById("log");
  const komiInput = document.getElementById("komiInput");
  const scoreBtn = document.getElementById("scoreBtn");
  const finalizeScoreBtn = document.getElementById("finalizeScoreBtn");
  const exitScoreBtn = document.getElementById("exitScoreBtn");
  const scoreBox = document.getElementById("scoreBox");

  const sbStones = document.getElementById("sbStones");
  const sbTerr = document.getElementById("sbTerr");
  const sbTotal = document.getElementById("sbTotal");
  const swStones = document.getElementById("swStones");
  const swTerr = document.getElementById("swTerr");
  const swKomi = document.getElementById("swKomi");
  const swTotal = document.getElementById("swTotal");
  const winnerText = document.getElementById("winnerText");
  const showLiveAreaEl = document.getElementById("showLiveArea");
  const showAtariEl = document.getElementById("showAtari");

  // ===== 遊戲狀態 =====
  let N = 9;
  let board = [];
  let toPlay = BLACK;
  let captures = { [BLACK]: 0, [WHITE]: 0 };
  let lastMove = null; // {x,y} or {pass:true}
  let consecutivePasses = 0;
  let cachedGeom = null;

  // 歷史：用於悔棋與簡易打劫判定
  // 每個快照包含：boardSerialized, boardArrCopy, toPlay, captures, lastMove, consecutivePasses
  let history = [];
  // ===== 視覺/動畫狀態 =====
let hover = { x: -1, y: -1 };         // 滑鼠目前指向的座標（交叉點）
let captureAnims = [];               // 提子動畫隊列
let rafId = null;                    // requestAnimationFrame id

  // ===== 點目（結算）狀態 =====
  let scoringMode = false;
  let scoreBoard = null;      // board 的複本用來點目
  let deadSet = new Set();    // 記錄死子（存 y*N+x）

  // AI 控制
  let aiBusy = false;

  // ===== 工具函式 =====
  const inside = (x,y) => x>=0 && y>=0 && x<N && y<N;
  const idx = (x,y) => y*N + x;

  function cloneBoardArr(b){ return b.slice(); }

  function serialize(b){
    // 用字串序列化：足夠做簡易打劫比較
    return b.join("");
  }
function countEmpty(b){
  let e = 0;
  for(const v of b) if(v === EMPTY) e++;
  return e;
}

function countLegalNonPass(color){
  let c = 0;
  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      if(board[idx(x,y)]===EMPTY && isLegalMove(x,y,color)) c++;
    }
  }
  return c;
}

  function log(msg){
    const t = new Date();
    const hh = String(t.getHours()).padStart(2,'0');
    const mm = String(t.getMinutes()).padStart(2,'0');
    logEl.textContent += `[${hh}:${mm}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function updateHUD(){
    turnText.textContent = `輪到：${toPlay===BLACK ? "黑" : "白"}`;
    turnDot.style.color = toPlay===BLACK ? "#111" : "#f3f4f6";
    capB.textContent = String(captures[BLACK]);
    capW.textContent = String(captures[WHITE]);
    undoBtn.disabled = history.length <= 1 || aiBusy;
    passBtn.disabled = aiBusy;
    newBtn.disabled = aiBusy;
    resignBtn.disabled = aiBusy;
  }

  // ===== 棋盤繪製 =====
  function draw(){
    const { rect, W, pad, g } = geom();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.width * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);



    ctx.clearRect(0,0,W,W);

    // 線
    ctx.lineWidth = Math.max(1, W*0.002);
    ctx.strokeStyle = "rgba(0,0,0,0.62)";
    for(let i=0;i<N;i++){
      const x = pad + i*g;
      const y = pad + i*g;

      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(W-pad, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, W-pad);
      ctx.stroke();
    }

    // 星位
    const star = getStarPoints(N);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    for(const p of star){
      const x = pad + p.x*g;
      const y = pad + p.y*g;
      ctx.beginPath();
      ctx.arc(x,y, Math.max(2, W*0.006), 0, Math.PI*2);
      ctx.fill();
    }

    // 棋子
    const r = g*0.42;
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        const v = board[idx(x,y)];
        if(v===EMPTY) continue;

        const cx = pad + x*g;
        const cy = pad + y*g;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx+g*0.05, cy+g*0.06, r, 0, Math.PI*2);
        ctx.fillStyle = "rgba(0,0,0,0.20)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI*2);
        const grad = ctx.createRadialGradient(cx-r*0.35, cy-r*0.35, r*0.2, cx, cy, r);
        if(v===BLACK){
          grad.addColorStop(0, "#4b4b4b");
          grad.addColorStop(1, "#0b0b0b");
        }else{
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(1, "#d7d7d7");
        }
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }
    }

    // 最後一手標記
    if(lastMove && !lastMove.pass){
      const cx = pad + lastMove.x*g;
      const cy = pad + lastMove.y*g;
      ctx.beginPath();
      ctx.arc(cx, cy, r*0.25, 0, Math.PI*2);
      ctx.fillStyle = "rgba(122,162,255,0.95)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.stroke();
    }
  }

  function getStarPoints(n){
    // 常見星位（0-based）
    if(n===9){
      return [{x:2,y:2},{x:6,y:2},{x:4,y:4},{x:2,y:6},{x:6,y:6}];
    }
    if(n===13){
      return [{x:3,y:3},{x:9,y:3},{x:6,y:6},{x:3,y:9},{x:9,y:9}];
    }
    return [
      {x:3,y:3},{x:9,y:3},{x:15,y:3},
      {x:3,y:9},{x:9,y:9},{x:15,y:9},
      {x:3,y:15},{x:9,y:15},{x:15,y:15},
    ];
  }

  // ===== 氣 / 群 / 提子 =====
  function neighbors(x,y){
    const out = [];
    if(inside(x-1,y)) out.push([x-1,y]);
    if(inside(x+1,y)) out.push([x+1,y]);
    if(inside(x,y-1)) out.push([x,y-1]);
    if(inside(x,y+1)) out.push([x,y+1]);
    return out;
  }

  function getGroupAndLiberties(b, x0, y0){
    const color = b[idx(x0,y0)];
    const stack = [[x0,y0]];
    const visited = new Set([idx(x0,y0)]);
    const stones = [];
    const libs = new Set();

    while(stack.length){
      const [x,y] = stack.pop();
      stones.push([x,y]);

      for(const [nx,ny] of neighbors(x,y)){
        const v = b[idx(nx,ny)];
        if(v===EMPTY){
          libs.add(idx(nx,ny));
        }else if(v===color){
          const id = idx(nx,ny);
          if(!visited.has(id)){
            visited.add(id);
            stack.push([nx,ny]);
          }
        }
      }
    }
    return { stones, liberties: libs.size, libertySet: libs, color };
  }
// ====== Canvas 座標換算（和你點擊用的同一套） ======
function geom(){
  if(cachedGeom) return cachedGeom;

  const rect = canvas.getBoundingClientRect();
  const W = rect.width;
  const pad = W * PAD_RATIO;
  const g = (W - 2*pad) / (N-1);
  const r = g * 0.42;

  cachedGeom = { rect, W, pad, g, r };
  return cachedGeom;
}
function toCanvasXY(x, y){
  const { pad, g } = geom();
  return { cx: pad + x*g, cy: pad + y*g };
}

// ====== 提子動畫：在 applyMove 捕捉被提的石頭 ======
function addCaptureAnim(stones, color){
  const t0 = performance.now();
  for(const [x,y] of stones){
    captureAnims.push({ x, y, color, t0, dur: 280 });
  }
  ensureRAF();
}

// 你要在 applyMove() 裡，removeGroup 之前把 g.stones 傳進來。
// 我下面也給你 applyMove 的「改法」(見下一段)

// ====== 活棋範圍顯示（hover 同色連通團 + 氣） ======
function drawLiveAreaOverlay(now){
  if(!showLiveAreaEl || !showLiveAreaEl.checked) return;
  if(hover.x < 0) return;

  const id = idx(hover.x, hover.y);
  const v = board[id];
  if(v === EMPTY) return;

  const info = getGroupAndLiberties(board, hover.x, hover.y);
  const { pad, g, r } = geom();

  // 高亮該團棋子（半透明圓）
  ctx.save();
  ctx.fillStyle = "rgba(122,162,255,0.18)";
  for(const [x,y] of info.stones){
    const { cx, cy } = toCanvasXY(x,y);
    ctx.beginPath();
    ctx.arc(cx, cy, r*0.92, 0, Math.PI*2);
    ctx.fill();
  }

  // 標出氣（小圓點）
  ctx.fillStyle = "rgba(80,220,160,0.85)";
  for(const libId of info.libertySet){
    const lx = libId % N;
    const ly = Math.floor(libId / N);
    const { cx, cy } = toCanvasXY(lx,ly);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, r*0.18), 0, Math.PI*2);
    ctx.fill();
  }

  // 顯示氣數（小字）
  const { cx, cy } = toCanvasXY(hover.x, hover.y);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.roundRect(cx - r*0.8, cy - r*1.25, r*1.6, r*0.55, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `${Math.max(12, g*0.18)}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`氣:${info.liberties}`, cx, cy - r*0.98);

  ctx.restore();
}

// ====== 叫吃警告（Atari）：找所有 liberties==1 的團 ======
function findAtariThreats(){
  const vis = new Uint8Array(N*N);
  const threats = []; // {color, stones, libertyId}

  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      const id = idx(x,y);
      const v = board[id];
      if(v===EMPTY || vis[id]) continue;

      const info = getGroupAndLiberties(board, x, y);
      for(const [sx,sy] of info.stones){
        vis[idx(sx,sy)] = 1;
      }

      if(info.liberties === 1){
        const libertyId = info.libertySet.values().next().value;
        threats.push({ color: info.color, stones: info.stones, libertyId });
      }
    }
  }
  return threats;
}

function drawAtariOverlay(now){
  if(!showAtariEl || !showAtariEl.checked) return;

  const threats = findAtariThreats();
  if(threats.length === 0) return;

  const { r } = geom();
  const pulse = 0.5 + 0.5*Math.sin(now/140); // 0..1

  ctx.save();

  for(const t of threats){
    // 1) 被叫吃的那團：紅色外圈
    ctx.strokeStyle = "rgba(255,80,80,0.9)";
    ctx.lineWidth = Math.max(2, r*0.12);
    for(const [x,y] of t.stones){
      const { cx, cy } = toCanvasXY(x,y);
      ctx.beginPath();
      ctx.arc(cx, cy, r*0.92, 0, Math.PI*2);
      ctx.stroke();
    }

    // 2) 唯一一口氣的位置：閃爍圈（提示打吃點/救命點）
    const lx = t.libertyId % N;
    const ly = Math.floor(t.libertyId / N);
    const { cx, cy } = toCanvasXY(lx,ly);

    ctx.strokeStyle = `rgba(255,220,80,${0.35 + 0.45*pulse})`;
    ctx.lineWidth = Math.max(2, r*0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, r*(0.55 + 0.25*pulse), 0, Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = `rgba(255,220,80,${0.12 + 0.10*pulse})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r*(0.35 + 0.20*pulse), 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();

  // 有 atari 且開啟提示 => 需要持續動畫
  ensureRAF();
}

// ====== 提子動畫疊圖 ======
function drawCaptureAnims(now){
  if(captureAnims.length === 0) return;

  const { r } = geom();
  const alive = [];

  ctx.save();
  for(const a of captureAnims){
    const t = (now - a.t0) / a.dur;
    if(t >= 1) continue;

    alive.push(a);

    const scale = 1 - t;              // 1 -> 0
    const alpha = 0.85 * (1 - t);     // 0.85 -> 0
    const { cx, cy } = toCanvasXY(a.x, a.y);

    // 畫一顆「正在消失」的棋子（用簡化漸層）
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r*scale, 0, Math.PI*2);
    const grad = ctx.createRadialGradient(cx-r*0.25, cy-r*0.25, r*0.1, cx, cy, r);
    if(a.color === BLACK){
      grad.addColorStop(0, "#4b4b4b");
      grad.addColorStop(1, "#0b0b0b");
    }else{
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#d7d7d7");
    }
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.restore();

  captureAnims = alive;
  if(captureAnims.length > 0) ensureRAF();
}

// ====== 把疊圖掛到 draw 後面（不破壞你原 draw / scoring wrapper） ======
(function hookDraw(){
  const baseDraw = draw;
  draw = function(){
    baseDraw();
    const now = performance.now();
    drawCaptureAnims(now);
    drawLiveAreaOverlay(now);
    drawAtariOverlay(now);
  };
})();

// ====== hover 事件：只有勾選活棋範圍顯示才需要 ======
canvas.addEventListener("mousemove", (ev) => {
  if(!showLiveAreaEl || !showLiveAreaEl.checked) return;

  const p = canvasToCoord(ev); // 你原本已有這個函式
  if(!p){
    if(hover.x !== -1){
      hover = {x:-1, y:-1};
      draw();
    }
    return;
  }
  if(p.x !== hover.x || p.y !== hover.y){
    hover = p;
    draw();
  }
});

canvas.addEventListener("mouseleave", () => {
  if(hover.x !== -1){
    hover = {x:-1, y:-1};
    draw();
  }
});

// ====== 勾選切換時重繪 / 控制 RAF ======
showLiveAreaEl?.addEventListener("change", () => draw());
showAtariEl?.addEventListener("change", () => {
  draw();
  if(showAtariEl.checked) ensureRAF();
});

// ====== RAF：只有需要動畫（提子/叫吃閃爍）才跑 ======
function ensureRAF(){
  if(rafId) return;
  const tick = () => {
    rafId = null;

    // 如果正在點目模式，你可以選擇仍顯示叫吃/活棋；不想顯示就加條件 return
    const need =
      (captureAnims.length > 0) ||
      (showAtariEl && showAtariEl.checked);

    if(need){
      draw();
      rafId = requestAnimationFrame(tick);
    }
  };
  rafId = requestAnimationFrame(tick);
}

  function removeGroup(b, stones){
    for(const [x,y] of stones){
      b[idx(x,y)] = EMPTY;
    }
  }

  // ===== 合法著判定（含簡易打劫） =====
  function isLegalMove(x,y,color){
    if(!inside(x,y)) return false;
    if(board[idx(x,y)] !== EMPTY) return false;

    const b2 = cloneBoardArr(board);
    const opp = OTHER(color);
    b2[idx(x,y)] = color;

    // 先提對方無氣群
    let captured = 0;
    for(const [nx,ny] of neighbors(x,y)){
      if(b2[idx(nx,ny)] === opp){
        const g = getGroupAndLiberties(b2, nx, ny);
        if(g.liberties === 0){
          captured += g.stones.length;
          removeGroup(b2, g.stones);
        }
      }
    }

    // 自殺禁手（若沒提子且自己群無氣）
    const selfG = getGroupAndLiberties(b2, x, y);
    if(selfG.liberties === 0 && captured === 0) return false;

    // 簡易打劫：禁止立即回到兩手前局面
    if(history.length >= 2){
      const twoPliesAgo = history[history.length-2].boardSerialized;
      if(serialize(b2) === twoPliesAgo) return false;
    }

    return true;
  }

  function applyMove(x,y,color){
    const opp = OTHER(color);
    board[idx(x,y)] = color;

    let captured = 0;
    for(const [nx,ny] of neighbors(x,y)){
      if(board[idx(nx,ny)] === opp){
        const g = getGroupAndLiberties(board, nx, ny);
        if(g.liberties === 0){
          captured += g.stones.length;
          addCaptureAnim(g.stones, OTHER(color)); // 被提的是對方色
          removeGroup(board, g.stones);
        }
      }
    }

    captures[color] += captured;

    lastMove = {x,y};
    consecutivePasses = 0;
    pushHistory();

    log(`${color===BLACK?"黑":"白"}：(${x+1},${y+1})${captured?`，提 ${captured} 子`: ""}`);
    toPlay = OTHER(toPlay);
    updateHUD();
    draw();
    maybeAIMove();
  }

  function passMove(color){
    lastMove = {pass:true};
    consecutivePasses++;
    pushHistory();
    log(`${color===BLACK?"黑":"白"}：虛著（Pass）`);

    if(consecutivePasses >= 2){
        log(`雙方連續虛著：可進入點目（按「進入點目」）。`);
        }

    toPlay = OTHER(toPlay);
    updateHUD();
    draw();
    maybeAIMove();
  }

  function resign(color){
    log(`${color===BLACK?"黑":"白"} 認輸。對局結束。`);
  }

  function pushHistory(){
    history.push({
      boardSerialized: serialize(board),
      boardArr: cloneBoardArr(board),
      toPlay,
      captures: { [BLACK]: captures[BLACK], [WHITE]: captures[WHITE] },
      lastMove: lastMove ? {...lastMove} : null,
      consecutivePasses
    });
  }

  function restoreFromSnapshot(snap){
    board = cloneBoardArr(snap.boardArr);
    toPlay = snap.toPlay;
    captures = { [BLACK]: snap.captures[BLACK], [WHITE]: snap.captures[WHITE] };
    lastMove = snap.lastMove ? {...snap.lastMove} : null;
    consecutivePasses = snap.consecutivePasses;
  }

  // ===== 合法著列表 =====
  function getAllLegalMoves(color){
    const moves = [];
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        if(board[idx(x,y)]===EMPTY && isLegalMove(x,y,color)){
          moves.push({x,y});
        }
      }
    }
    moves.push({pass:true}); // pass 永遠合法
    return moves;
  }

  // ===== AI =====
  function aiEnabledForColor(color){
    const mode = Number(aiColorSel.value); // 1 黑, 2 白, 3 皆AI
    if(mode === 3) return true;
    return mode === color;
  }

  function maybeAIMove(){
    if(aiBusy) return;
    const lvl = Number(aiLevelSel.value);
    if(lvl === 0) return;
    if(!aiEnabledForColor(toPlay)) return;

    aiBusy = true;
    aiThinking.textContent = "AI 思考中…";
    updateHUD();

    setTimeout(() => {
      try{
        const move = chooseAIMove(toPlay, lvl);
        if(move.pass){
          passMove(toPlay);
        }else{
          applyMove(move.x, move.y, toPlay);
        }
      } finally {
        aiBusy = false;
        aiThinking.textContent = "";
        updateHUD();
      }
    }, 30);
  }

function chooseAIMove(color, lvl){
  const moves = getAllLegalMoves(color);
  if(moves.length === 1) return moves[0];

  // Lv1: 隨機（盡量不 pass）
  if(lvl === 1){
    const nonPass = moves.filter(m => !m.pass);
    const pool = nonPass.length ? nonPass : moves;
    return pool[(Math.random() * pool.length) | 0];
  }

  // Lv2: Heuristic（後盤會判斷 pass）
  if(lvl === 2){
    let best = null;
    let bestScore = -1e18;

    let bestNonPass = null;
    let bestNonPassScore = -1e18;

    for(const m of moves){
      const sc = scoreHeuristicMove(color, m);

      if(sc > bestScore){
        bestScore = sc;
        best = m;
      }

      if(!m.pass && sc > bestNonPassScore){
        bestNonPassScore = sc;
        bestNonPass = m;
      }
    }

    const empties = countEmpty(board);
    const emptyRatio = empties / (N*N);
    const lateEnough = (emptyRatio < 0.45); // 後盤/官子階段

    if(lateEnough && bestNonPass && bestNonPassScore < 1){
      return { pass:true };
    }

    return best || moves[moves.length - 1];
  }

  // Lv3: Monte Carlo
  return chooseMonteCarlo(color);
}



  function scoreHeuristicMove(color, m){
    if(m.pass){
  // Pass 的價值：盤面越接近收束、可下的有意義著越少，Pass 越合理
  // empty 比例越低 => 越接近終局
  const empties = countEmpty(board);
  const emptyRatio = empties / (N*N);

  // 可下的合法非 pass 著越少 => 越容易 Pass
  const legal = countLegalNonPass(color);

  // 基礎：早期不鼓勵 pass，後期逐步鼓勵
  // emptyRatio 低（例如 < 0.35）時，pass 分數會顯著上升
  let s = -10 + (1 - emptyRatio) * 18;

  // 合法著很少時，再加分
  if(legal <= 6) s += 6;
  else if(legal <= 12) s += 3;

  // 如果已經有人 pass，連續 pass 更有意義（可能準備收束）
  if(consecutivePasses === 1) s += 3;

  return s;
}

    const x = m.x, y = m.y;

    const b2 = cloneBoardArr(board);
    const opp = OTHER(color);
    b2[idx(x,y)] = color;

    let captured = 0;
    for(const [nx,ny] of neighbors(x,y)){
      if(b2[idx(nx,ny)] === opp){
        const g = getGroupAndLiberties(b2, nx, ny);
        if(g.liberties === 0){
          captured += g.stones.length;
          removeGroup(b2, g.stones);
        }
      }
    }

    const selfG = getGroupAndLiberties(b2, x, y);

    const cx = (N-1)/2, cy = (N-1)/2;
    const dist = Math.abs(x-cx) + Math.abs(y-cy);

    let adjOwn = 0, adjOpp = 0;
    for(const [nx,ny] of neighbors(x,y)){
      const v = board[idx(nx,ny)];
      if(v===color) adjOwn++;
      if(v===opp) adjOpp++;
    }

    return captured*100 + selfG.liberties*6 + adjOwn*2 + adjOpp*1 - dist*0.6;
  }

  function chooseMonteCarlo(color){
    const playouts = clampInt(Number(mcPlayoutsEl.value)||250, 10, 2000);
    const candLimit = clampInt(Number(mcCandidatesEl.value)||25, 5, 80);

    const moves = getAllLegalMoves(color);
    const scored = moves.map(m => ({m, s: scoreHeuristicMove(color, m)}))
                        .sort((a,b)=>b.s-a.s);

    let candidates = scored.slice(0, Math.min(candLimit, scored.length)).map(o=>o.m);

// 保證包含 pass（避免 MC 永遠不考慮 pass）
if(!candidates.some(m => m.pass)){
  candidates.push({pass:true});
}

    let best = candidates[0];
    let bestWin = -1;

    for(const m of candidates){
      let wins = 0;
      for(let k=0;k<playouts;k++){
        const result = playoutOnce(color, m);
        if(result > 0) wins++;
      }
      if(wins > bestWin){
        bestWin = wins;
        best = m;
      }
    }
    return best;
  }

  function playoutOnce(rootColor, firstMove){
    const b = cloneBoardArr(board);
    const caps = { [BLACK]: captures[BLACK], [WHITE]: captures[WHITE] };
    let player = rootColor;

    if(firstMove.pass){
      // pass
    }else{
      applyMoveOn(b, caps, firstMove.x, firstMove.y, player);
    }
    player = OTHER(player);

    let passStreak = firstMove.pass ? 1 : 0;
    const maxSteps = (N<=9 ? 60 : (N<=13 ? 110 : 160));
    let prev2 = serialize(b);
    let prev1 = serialize(b);

    for(let step=0; step<maxSteps; step++){
      const mv = randomLegalMoveOn(b, player, prev2);
      if(mv.pass){
        passStreak++;
        if(passStreak >= 2) break;
      }else{
        passStreak = 0;
        applyMoveOn(b, caps, mv.x, mv.y, player);
      }

      prev2 = prev1;
      prev1 = serialize(b);
      player = OTHER(player);
    }

    const stones = countStones(b);
    const scoreB = caps[BLACK] + stones[BLACK];
    const scoreW = caps[WHITE] + stones[WHITE];
    const diff = (rootColor===BLACK) ? (scoreB-scoreW) : (scoreW-scoreB);
    return diff;
  }

  function randomLegalMoveOn(b, color, twoPliesAgoSerialized){
    const empties = [];
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        if(b[idx(x,y)]===EMPTY) empties.push({x,y});
      }
    }

    for(let i=empties.length-1;i>0;i--){
      const j = (Math.random()*(i+1))|0;
      [empties[i], empties[j]] = [empties[j], empties[i]];
    }

    for(let t=0; t<Math.min(empties.length, 120); t++){
      const {x,y} = empties[t];
      if(isLegalMoveOn(b, x, y, color, twoPliesAgoSerialized)){
        return {x,y};
      }
    }
    return {pass:true};
  }

  function isLegalMoveOn(b, x, y, color, twoPliesAgoSerialized){
    if(!inside(x,y)) return false;
    if(b[idx(x,y)] !== EMPTY) return false;

    const b2 = b.slice();
    const opp = OTHER(color);
    b2[idx(x,y)] = color;

    let captured = 0;
    for(const [nx,ny] of neighbors(x,y)){
      if(b2[idx(nx,ny)] === opp){
        const g = getGroupAndLiberties(b2, nx, ny);
        if(g.liberties === 0){
          captured += g.stones.length;
          removeGroup(b2, g.stones);
        }
      }
    }

    const selfG = getGroupAndLiberties(b2, x, y);
    if(selfG.liberties === 0 && captured === 0) return false;

    if(twoPliesAgoSerialized){
      if(serialize(b2) === twoPliesAgoSerialized) return false;
    }
    return true;
  }

  function applyMoveOn(b, caps, x, y, color){
    const opp = OTHER(color);
    b[idx(x,y)] = color;

    let captured = 0;
    for(const [nx,ny] of neighbors(x,y)){
      if(b[idx(nx,ny)] === opp){
        const g = getGroupAndLiberties(b, nx, ny);
        if(g.liberties === 0){
          captured += g.stones.length;
          removeGroup(b, g.stones);
        }
      }
    }
    caps[color] += captured;
  }

  function countStones(b){
    let cb=0, cw=0;
    for(const v of b){
      if(v===BLACK) cb++;
      else if(v===WHITE) cw++;
    }
    return { [BLACK]: cb, [WHITE]: cw };
  }

  function clampInt(v, lo, hi){
    v = Math.floor(v);
    if(Number.isNaN(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  // ===== 事件：點棋盤落子 =====
  function canvasToCoord(ev){
    
    const { rect, pad, g } = geom();
    const x = (ev.clientX - rect.left);
    const y = (ev.clientY - rect.top);



    const ix = Math.round((x - pad) / g);
    const iy = Math.round((y - pad) / g);
    if(!inside(ix,iy)) return null;

    const cx = pad + ix*g;
    const cy = pad + iy*g;
    const dist2 = (x-cx)*(x-cx) + (y-cy)*(y-cy);
    if(dist2 > (g*0.45)*(g*0.45)) return null;

    return {x:ix, y:iy};
  }

  canvas.addEventListener("click", (ev) => {
    const p = canvasToCoord(ev);
    if(!p) return;
        // 點目模式：點棋子切換死子
    if(scoringMode){
      // 點的是 scoreBoard 上的棋子才可切換
      if(scoreBoard && scoreBoard[idx(p.x,p.y)] !== EMPTY){
        toggleDeadAt(p.x,p.y);
      }
      return;
    }

    if(aiBusy) return;

    const lvl = Number(aiLevelSel.value);
    if(lvl !== 0 && aiEnabledForColor(toPlay)) return; // AI 執子時禁點

    

    if(isLegalMove(p.x,p.y,toPlay)){
      applyMove(p.x,p.y,toPlay);
    }else{
      log(`不合法：(${p.x+1},${p.y+1}) 可能是自殺禁手或打劫或該點已有子。`);
    }
  });
  function setScoringUI(on){
    scoringMode = on;
    scoreBox.style.display = on ? "block" : "none";
    finalizeScoreBtn.disabled = !on;
    exitScoreBtn.disabled = !on;

    // 點目期間禁止 AI 自動落子與一般控制
    passBtn.disabled = on || aiBusy;
    undoBtn.disabled = on || aiBusy || history.length <= 1;
    newBtn.disabled = on || aiBusy;
    resignBtn.disabled = on || aiBusy;

    // 進入點目按鈕：若已在點目就禁用
    scoreBtn.disabled = on || aiBusy;

    aiThinking.textContent = on ? "點目模式" : "";
    updateHUD();
  }

  function enterScoring(){
    if(aiBusy) return;
    scoringMode = true;
    deadSet.clear();
    scoreBoard = board.slice(); // 複本
    setScoringUI(true);
    renderScore(); // 初次計算
    draw();        // 重畫（會顯示死子標記）
    log("進入點目模式：點棋子可切換死子。");
  }

  function exitScoring(){
    scoringMode = false;
    scoreBoard = null;
    deadSet.clear();
    setScoringUI(false);
    draw();
    log("離開點目模式。");
  }

  function toggleDeadAt(x,y){
    const id = idx(x,y);
    if(!scoreBoard) return;
    const v = scoreBoard[id];
    if(v === EMPTY) return;

    if(deadSet.has(id)) deadSet.delete(id);
    else deadSet.add(id);

    renderScore();
    draw();
  }

  function makeScoringBoard(){
    // 以 scoreBoard 為基礎移除死子，回傳新陣列
    const b = scoreBoard.slice();
    for(const id of deadSet){
      b[id] = EMPTY;
    }
    return b;
  }

  function countAreaScore(b, komi){
    // 面積點：棋子數 + 地
    let stonesB = 0, stonesW = 0;
    for(const v of b){
      if(v===BLACK) stonesB++;
      else if(v===WHITE) stonesW++;
    }

    // flood-fill 空地，判定邊界顏色是否唯一
    const vis = new Uint8Array(N*N);
    let terrB = 0, terrW = 0;

    const q = [];
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        const id0 = idx(x,y);
        if(b[id0] !== EMPTY || vis[id0]) continue;

        // BFS region
        q.length = 0;
        q.push([x,y]);
        vis[id0] = 1;

        let region = 0;
        const borderColors = new Set();

        while(q.length){
          const [cx,cy] = q.pop();
          region++;

          for(const [nx,ny] of neighbors(cx,cy)){
            const nid = idx(nx,ny);
            const vv = b[nid];
            if(vv === EMPTY){
              if(!vis[nid]){
                vis[nid] = 1;
                q.push([nx,ny]);
              }
            }else{
              borderColors.add(vv);
            }
          }
        }

        if(borderColors.size === 1){
          const only = [...borderColors][0];
          if(only === BLACK) terrB += region;
          else if(only === WHITE) terrW += region;
        }
        // 若邊界同時接觸黑白 => 中立地，不算任何一方
      }
    }

    const totalB = stonesB + terrB;
    const totalW = stonesW + terrW + komi;

    return { stonesB, stonesW, terrB, terrW, komi, totalB, totalW };
  }

  function renderScore(){
    if(!scoringMode) return;
    const komi = Number(komiInput.value) || 0;
    const b = makeScoringBoard();
    const s = countAreaScore(b, komi);

    sbStones.textContent = String(s.stonesB);
    sbTerr.textContent = String(s.terrB);
    sbTotal.textContent = String(s.totalB);

    swStones.textContent = String(s.stonesW);
    swTerr.textContent = String(s.terrW);
    swKomi.textContent = String(s.komi);
    swTotal.textContent = String(s.totalW);

    const diff = s.totalB - s.totalW;
    if(Math.abs(diff) < 1e-9){
      winnerText.textContent = "平局";
    }else if(diff > 0){
      winnerText.textContent = `黑勝 ${diff.toFixed(1)}`;
    }else{
      winnerText.textContent = `白勝 ${(-diff).toFixed(1)}`;
    }
  }

  // 在 draw() 最後加上「死子標記」的疊圖
  const _origDraw = draw;
  draw = function(){
    _origDraw();

    if(!scoringMode || !scoreBoard) return;

   const { pad, g, r } = geom();

    // 在死子上畫 X
    ctx.lineWidth = Math.max(2, W*0.003);
    ctx.strokeStyle = "rgba(255,80,80,0.85)";

    for(const id of deadSet){
      const x = id % N;
      const y = Math.floor(id / N);
      const cx = pad + x*g;
      const cy = pad + y*g;

      ctx.beginPath();
      ctx.moveTo(cx - r*0.55, cy - r*0.55);
      ctx.lineTo(cx + r*0.55, cy + r*0.55);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + r*0.55, cy - r*0.55);
      ctx.lineTo(cx - r*0.55, cy + r*0.55);
      ctx.stroke();
    }
  };

  // ===== 控制項 =====

  newBtn.addEventListener("click", () => newGame());
  undoBtn.addEventListener("click", () => undo());
  passBtn.addEventListener("click", () => {
    if(aiBusy) return;
    const lvl = Number(aiLevelSel.value);
    if(lvl !== 0 && aiEnabledForColor(toPlay)) return;
    passMove(toPlay);
  });
  resignBtn.addEventListener("click", () => {
    if(aiBusy) return;
    resign(toPlay);
  });
  clearLogBtn.addEventListener("click", () => { logEl.textContent = ""; });
  scoreBtn.addEventListener("click", () => {
    enterScoring();
  });

  exitScoreBtn.addEventListener("click", () => {
    exitScoring();
  });

  finalizeScoreBtn.addEventListener("click", () => {
    if(!scoringMode) return;
    renderScore();
    log("確認結算：以上為面積點結果（已依死子標記移除後計地）。");
  });

  sizeSel.addEventListener("change", () => newGame());
  firstSel.addEventListener("change", () => newGame());
  aiLevelSel.addEventListener("change", () => { updateHUD(); maybeAIMove(); });
  aiColorSel.addEventListener("change", () => { updateHUD(); maybeAIMove(); });

window.addEventListener("resize", () => {
  cachedGeom = null;
  draw();
});


  function newGame(){
    if(aiBusy) return;
    N = Number(sizeSel.value);
    board = new Array(N*N).fill(EMPTY);
    captures = { [BLACK]: 0, [WHITE]: 0 };
    toPlay = Number(firstSel.value);
    lastMove = null;
    consecutivePasses = 0;
    history = [];
    pushHistory();

    log(`新局開始：${N}路，${toPlay===BLACK?"黑":"白"}先。`);
    updateHUD();
    draw();
    maybeAIMove();
  }

  function undo(){
    if(aiBusy) return;
    if(history.length <= 1) return;

    history.pop();
    const snap = history[history.length-1];
    restoreFromSnapshot(snap);
    log(`悔棋：回到上一手。`);
    updateHUD();
    draw();
    maybeAIMove();
  }

  // ===== 初始化 =====
  newGame();
})();
