(() => {
  // ===== 基本常數 =====
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const OTHER = c => (c === BLACK ? WHITE : BLACK);

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

  // ===== 遊戲狀態 =====
  let N = 9;
  let board = [];
  let toPlay = BLACK;
  let captures = { [BLACK]: 0, [WHITE]: 0 };
  let lastMove = null; // {x,y} or {pass:true}
  let consecutivePasses = 0;

  // 歷史：用於悔棋與簡易打劫判定
  // 每個快照包含：boardSerialized, boardArrCopy, toPlay, captures, lastMove, consecutivePasses
  let history = [];

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
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.width * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const W = rect.width;
    const pad = W * 0.06;
    const g = (W - 2*pad) / (N-1);

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
    return { stones, liberties: libs.size };
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
      log(`雙方連續虛著，通常可進入數目/點目階段（本版本未實作完整點目）。`);
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

    if(lvl === 1){
      const nonPass = moves.filter(m => !m.pass);
      const pool = nonPass.length ? nonPass : moves;
      return pool[(Math.random() * pool.length) | 0];
    }

    if(lvl === 2){
      let best = null;
      let bestScore = -1e18;
      for(const m of moves){
        const sc = scoreHeuristicMove(color, m);
        if(sc > bestScore){
          bestScore = sc;
          best = m;
        }
      }
      return best || moves[moves.length-1];
    }

    return chooseMonteCarlo(color);
  }

  function scoreHeuristicMove(color, m){
    if(m.pass) return -5;
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

    const candidates = scored.slice(0, Math.min(candLimit, scored.length)).map(o=>o.m);

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
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left);
    const y = (ev.clientY - rect.top);

    const W = rect.width;
    const pad = W * 0.06;
    const g = (W - 2*pad) / (N-1);

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
    if(aiBusy) return;

    const lvl = Number(aiLevelSel.value);
    if(lvl !== 0 && aiEnabledForColor(toPlay)) return; // AI 執子時禁點

    const p = canvasToCoord(ev);
    if(!p) return;

    if(isLegalMove(p.x,p.y,toPlay)){
      applyMove(p.x,p.y,toPlay);
    }else{
      log(`不合法：(${p.x+1},${p.y+1}) 可能是自殺禁手或打劫或該點已有子。`);
    }
  });

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

  sizeSel.addEventListener("change", () => newGame());
  firstSel.addEventListener("change", () => newGame());
  aiLevelSel.addEventListener("change", () => { updateHUD(); maybeAIMove(); });
  aiColorSel.addEventListener("change", () => { updateHUD(); maybeAIMove(); });

  window.addEventListener("resize", () => draw());

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
