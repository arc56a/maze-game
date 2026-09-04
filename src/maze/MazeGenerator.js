/**
 * MazeGenerator.js
 * Recursive Backtracker algorithm — generates a perfect maze grid
 *
 * Grid cell flags (bitmask):
 *   N=1, S=2, E=4, W=8  → open passages
 */

const MazeGenerator = (() => {

  const N = 1, S = 2, E = 4, W = 8;
  const OPPOSITE = { [N]: S, [S]: N, [E]: W, [W]: E };
  const DX = { [E]: 1, [W]: -1, [N]: 0, [S]: 0 };
  const DY = { [N]: -1, [S]: 1, [E]: 0, [W]: 0 };

  // ─── Generate ─────────────────────────────────────────────
  function generate(cols, rows, seed = Date.now()) {
    // grid[row][col] = passage bitmask
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    const rng  = seededRng(seed);

    function carve(cx, cy) {
      const dirs = shuffle([N, S, E, W], rng);
      for (const dir of dirs) {
        const nx = cx + DX[dir];
        const ny = cy + DY[dir];
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny][nx] === 0) {
          grid[cy][cx] |= dir;
          grid[ny][nx] |= OPPOSITE[dir];
          carve(nx, ny);
        }
      }
    }

    carve(0, 0);

    // Mobile Optimization: Inject Rooms and Widen Paths
    injectRooms(grid, cols, rows, rng);
    widenPaths(grid, cols, rows, rng, 0.2); // 20% extra openness

    return { grid, cols, rows };
  }

  // ─── Mobile Optimizations ─────────────────────────────────

  function injectRooms(grid, cols, rows, rng) {
    const roomCount = Math.floor((cols * rows) / 25); // Roughly 1 room per 5x5 area
    for (let i = 0; i < roomCount; i++) {
      const rw = 2 + Math.floor(rng() * 2); // 2 to 3 wide
      const rh = 2 + Math.floor(rng() * 2); // 2 to 3 high
      const rx = 1 + Math.floor(rng() * (cols - rw - 1));
      const ry = 1 + Math.floor(rng() * (rows - rh - 1));

      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          // Open internal walls to create a big room
          if (x < rx + rw - 1) grid[y][x] |= E;
          if (x > rx) grid[y][x] |= W;
          if (y < ry + rh - 1) grid[y][x] |= S;
          if (y > ry) grid[y][x] |= N;

          // Ensure neighbors match
          if (x < rx + rw - 1) grid[y][x + 1] |= W;
          if (x > rx) grid[y][x - 1] |= E;
          if (y < ry + rh - 1) grid[y + 1][x] |= N;
          if (y > ry) grid[y - 1][x] |= S;
        }
      }
    }
  }

  function widenPaths(grid, cols, rows, rng, factor = 0.15) {
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (rng() < factor) {
          const dir = [N, S, E, W][Math.floor(rng() * 4)];
          grid[r][c] |= dir;
          const nx = c + DX[dir];
          const ny = r + DY[dir];
          grid[ny][nx] |= OPPOSITE[dir];
        }
      }
    }
  }

  // ─── Utils ────────────────────────────────────────────────
  function shuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Simple seeded RNG (mulberry32)
  function seededRng(seed) {
    let s = seed >>> 0;
    return () => {
      s += 0x6d2b79f5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ─── Query helpers ────────────────────────────────────────
  function hasPassage(grid, col, row, dir) {
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return false;
    return !!(grid[row][col] & dir);
  }

  function isWall(grid, col, row, dir) {
    return !hasPassage(grid, col, row, dir);
  }

  // ─── Place start / exit ───────────────────────────────────
  function getStartExit(cols, rows, def = {}) {
    return {
      start: def.start || { col: 0, row: 0 },
      exit:  def.exit  || { col: cols - 1, row: rows - 1 },
    };
  }

  // ─── Smart key positions (Dead Ends first) ─────────────────
  function placeKeys(grid, cols, rows, count, rng) {
    const deadEnds = [];
    const others   = [];
    const exitKey  = `${cols-1},${rows-1}`;
    const startKey = `0,0`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = `${c},${r}`;
        if (k === startKey || k === exitKey) continue;

        const cell = grid[r][c];
        // Count open passages
        let passages = 0;
        if (cell & N) passages++;
        if (cell & S) passages++;
        if (cell & E) passages++;
        if (cell & W) passages++;

        if (passages === 1) deadEnds.push({ col: c, row: r });
        else others.push({ col: c, row: r });
      }
    }

    // Prioritize dead ends for keys
    const combined = [...shuffle(deadEnds, rng), ...shuffle(others, rng)];
    return combined.slice(0, count);
  }

  return { generate, hasPassage, isWall, getStartExit, placeKeys, N, S, E, W };
})();
