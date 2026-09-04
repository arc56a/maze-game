/**
 * MazeCollision.js
 * AABB collision detection against maze walls using grid bitmask
 */

const MazeCollision = (() => {
  let _grid = null;
  let _cols = 0;
  let _rows = 0;

  let _freeWalls  = [];
  let _freeFloors = [];

  function _getC() { return MazeRenderer.CELL_SIZE || 7.0; }
  function _getT() { return (MazeRenderer.WALL_T || 0.8) / 2 + 0.4; } // ~0.8m collision margin

  // ─── Init ────────────────────────────────────────────────
  function setMaze(grid, cols, rows) {
    _grid = grid;
    _cols = cols;
    _rows = rows;
  }

  function setFreeformObjects(walls, floors) {
    _freeWalls  = walls || [];
    _freeFloors = floors || [];
  }

  // ─── Resolve position ─────────────────────────────────────
  // Returns corrected position after solid wall collision
  function resolve(position, radius = 0.55) {
    let { x, z } = position;

    // 1. Static Freeform Walls Collision (OBB Logic)
    for (const w of _freeWalls) {
      if (w.cl === false || w.collision === false) continue; // Skip ghost objects

      const rot = w.rotY || 0;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const dx = x - w.x;
      const dz = z - w.z;

      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      const hw = w.width / 2;
      const ht = w.thickness / 2;

      const clampedX = Math.max(-hw, Math.min(hw, localX));
      const clampedZ = Math.max(-ht, Math.min(ht, localZ));

      const diffX = localX - clampedX;
      const diffZ = localZ - clampedZ;
      const distSq = diffX * diffX + diffZ * diffZ;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        const pushLX = dist > 0.0001 ? (diffX / dist) * push : radius;
        const pushLZ = dist > 0.0001 ? (diffZ / dist) * push : 0;

        const pushWX = pushLX * Math.cos(rot) - pushLZ * Math.sin(rot);
        const pushWZ = pushLX * Math.sin(rot) + pushLZ * Math.cos(rot);

        x += pushWX;
        z += pushWZ;
      }
    }

    if (!_grid) return new THREE.Vector3(x, position.y, z);

    const C = _getC();
    const T = _getT();

    const col = Math.floor(x / C);
    const row = Math.floor(z / C);

    // Local position within cell
    const lx = x - col * C;
    const lz = z - row * C;

    const cell = getCell(col, row);

    // North wall (z = row * C)
    if (!(cell & MazeGenerator.N) && lz < T) {
      z = row * C + T;
    }
    // South wall (z = (row+1) * C)
    if (!(cell & MazeGenerator.S) && lz > C - T) {
      z = (row + 1) * C - T;
    }
    // West wall (x = col * C)
    if (!(cell & MazeGenerator.W) && lx < T) {
      x = col * C + T;
    }
    // East wall (x = (col+1) * C)
    if (!(cell & MazeGenerator.E) && lx > C - T) {
      x = (col + 1) * C - T;
    }

    // ─── Corner Pillar Collision ────────────────────────────
    // Every grid intersection has a solid pillar (PW ~1.0m)
    const pRadius = 0.75; // Collision radius for the corner pillar
    const corners = [
      { cx: col * C,       cz: row * C },       // Top-Left
      { cx: (col + 1) * C, cz: row * C },       // Top-Right
      { cx: col * C,       cz: (row + 1) * C },   // Bottom-Left
      { cx: (col + 1) * C, cz: (row + 1) * C }    // Bottom-Right
    ];

    for (const corner of corners) {
      const dx = x - corner.cx;
      const dz = z - corner.cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < pRadius * pRadius) {
        const dist = Math.sqrt(distSq);
        if (dist < 0.0001) continue; // Avoid division by zero
        const push = pRadius / dist;
        x = corner.cx + dx * push;
        z = corner.cz + dz * push;
      }
    }

    return new THREE.Vector3(x, position.y, z);
  }

  // ─── Can move ─────────────────────────────────────────────
  function canMoveTo(x, z, radius = 0.45, y = null) {
    // 1. Static Freeform Walls Collision
    for (const w of _freeWalls) {
      if (w.cl === false || w.collision === false) continue; // Skip ghost objects

      const rot = w.rotY || 0;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const dx = x - w.x;
      const dz = z - w.z;

      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      const hw = (w.width || 1) / 2;
      const ht = (w.thickness || 0.8) / 2;

      // Check if within bounds of the wall box + radius
      if (Math.abs(localX) < hw + radius && Math.abs(localZ) < ht + radius) {
        // Vertical check if Y is provided
        if (y !== null) {
          const wh = w.height || 4.5;
          const wy = w.y || 0;
          if (y < wy - radius || y > wy + wh + radius) continue;
        }

        const nearestX = Math.max(-hw, Math.min(hw, localX));
        const nearestZ = Math.max(-ht, Math.min(ht, localZ));
        const distSq = (localX - nearestX) ** 2 + (localZ - nearestZ) ** 2;
        if (distSq < radius * radius) return false;
      }
    }

    // 2. Static Freeform Floors/Ceilings Collision
    if (y !== null) {
      for (const f of _freeFloors) {
        if (f.cl === false || f.collision === false) continue; // Skip ghost floors

        const fw = (f.width || 1) / 2;
        const fd = (f.depth || 1) / 2;
        const ft = (f.thickness || 0.4);
        const fy = f.y || 0; // Top surface of the floor/ceiling

        // Check horizontal bounds
        if (Math.abs(x - f.x) < fw + radius && Math.abs(z - f.z) < fd + radius) {
          // Check vertical bounds (between fy and fy - ft)
          // We add radius to prevent clipping through
          if (y > fy - ft - radius && y < fy + radius) {
            return false;
          }
        }
      }
    }

    if (!_grid) return true; // If no grid, only freeform checked

    const C = _getC();
    const col = Math.floor(x / C);
    const row = Math.floor(z / C);
    if (col < 0 || col >= _cols || row < 0 || row >= _rows) return false;

    const lx   = x - col * C;
    const lz   = z - row * C;
    const cell = getCell(col, row);

    // Wall checks
    if (!(cell & MazeGenerator.N) && lz < radius)     return false;
    if (!(cell & MazeGenerator.S) && lz > C - radius) return false;
    if (!(cell & MazeGenerator.W) && lx < radius)     return false;
    if (!(cell & MazeGenerator.E) && lx > C - radius) return false;

    // Corner pillar checks
    const pillarR = Math.max(0.75, radius);
    const corners = [
      { cx: col * C,       cz: row * C },
      { cx: (col + 1) * C, cz: row * C },
      { cx: col * C,       cz: (row + 1) * C },
      { cx: (col + 1) * C, cz: (row + 1) * C }
    ];

    for (const corner of corners) {
      const dx = x - corner.cx;
      const dz = z - corner.cz;
      if (dx * dx + dz * dz < pillarR * pillarR) return false;
    }

    return true;
  }

  // ─── Check exit ───────────────────────────────────────────
  function isAtExit(position, exitColOrObj, exitRow, threshold = 2.5) {
    if (!position) return false;

    // Direct object support { x, z } or { col, row }
    if (typeof exitColOrObj === 'object' && exitColOrObj !== null) {
      if (exitColOrObj.x !== undefined && exitColOrObj.z !== undefined) {
        const dx = position.x - exitColOrObj.x;
        const dz = position.z - exitColOrObj.z;
        return Math.sqrt(dx * dx + dz * dz) < threshold;
      }
      exitRow = exitColOrObj.row;
      exitColOrObj = exitColOrObj.col;
    }

    if (exitColOrObj === undefined || exitRow === undefined || isNaN(exitColOrObj) || isNaN(exitRow)) {
      return false;
    }

    const C = _getC();
    // Use the actual door marker position (offset from cell edge)
    const doorX = (exitColOrObj + 1) * C - 1.2;
    const doorZ = exitRow * C + C / 2;

    const dx = position.x - doorX;
    const dz = position.z - doorZ;
    return Math.sqrt(dx * dx + dz * dz) < threshold;
  }

  // ─── Check key pickup ─────────────────────────────────────
  function checkPickup(position, items, threshold = 1.2) {
    return items.filter(item => {
      if (item.collected) return false;
      const dx = position.x - item.worldX;
      const dz = position.z - item.worldZ;
      return Math.sqrt(dx * dx + dz * dz) < threshold;
    });
  }

  // ─── Helpers ─────────────────────────────────────────────
  function getCell(col, row) {
    if (!_grid || row < 0 || row >= _rows || col < 0 || col >= _cols) return 0xF; // open
    return _grid[row][col];
  }

  function inBounds(col, row) {
    return col >= 0 && col < _cols && row >= 0 && row < _rows;
  }

  return { setMaze, setFreeformObjects, resolve, canMoveTo, isAtExit, checkPickup, inBounds };
})();
