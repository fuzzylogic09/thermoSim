// ═══════════════════════════════════════════
// GEOMETRY OBJECTS SYSTEM
// Objects are the source of truth. Matrices are derived from objects.
// ═══════════════════════════════════════════
'use strict';

// Object types
const GEO_TYPES = {
  wall:      { label:'Mur (CFD)',       color:'#9ca3af', icon:'🧱', hasTemp:false },
  hot:       { label:'Source chaude',   color:'#f97316', icon:'🔥', hasTemp:true  },
  cold:      { label:'Source froide',   color:'#38bdf8', icon:'❄️', hasTemp:true  },
  fan_right: { label:'Ventil. →',       color:'#a78bfa', icon:'💨', hasTemp:false, hasFan:true },
  fan_left:  { label:'Ventil. ←',       color:'#a78bfa', icon:'💨', hasTemp:false, hasFan:true },
  fan_up:    { label:'Ventil. ↑',       color:'#a78bfa', icon:'💨', hasTemp:false, hasFan:true },
  fan_down:  { label:'Ventil. ↓',       color:'#a78bfa', icon:'💨', hasTemp:false, hasFan:true },
};

// Object shapes
const GEO_SHAPES = {
  rect:   'Rectangle',
  circle: 'Cercle',
  hline:  'Ligne H',
  vline:  'Ligne V',
};

// C_* constants (must match sim.js)
const C_FLUID=0, C_WALL=1, C_HOT=2, C_COLD=3, C_FAN_R=4, C_FAN_L=5, C_FAN_U=6, C_FAN_D=7;
const TYPE_TO_CELL = {
  wall: C_WALL, hot: C_HOT, cold: C_COLD,
  fan_right: C_FAN_R, fan_left: C_FAN_L, fan_up: C_FAN_U, fan_down: C_FAN_D,
};

let geoObjects = [];   // array of GeoObject
let geoIdCounter = 0;

function newGeoId() { return ++geoIdCounter; }

/**
 * Create a new geometry object.
 * @param {object} opts
 *   name, type, shape, x0, y0, x1, y1 (physical meters, x0<x1, y0<y1)
 *   radius (for circle, in meters)
 *   props: { temperature? } — extra props depending on type
 */
function createGeoObject(opts) {
  return {
    id:     newGeoId(),
    name:   opts.name  || ('Objet ' + (geoIdCounter)),
    type:   opts.type  || 'wall',
    shape:  opts.shape || 'rect',
    // Bounding box in physical coords [m], y0=bottom, y1=top
    x0: opts.x0 ?? 0,
    y0: opts.y0 ?? 0,
    x1: opts.x1 ?? 1,
    y1: opts.y1 ?? 1,
    radius: opts.radius ?? null, // for circles
    visible: true,
    props: opts.props || {},
  };
}

function addGeoObject(opts) {
  const obj = createGeoObject(opts);
  geoObjects.push(obj);
  return obj;
}

function removeGeoObject(id) {
  geoObjects = geoObjects.filter(o => o.id !== id);
}

function getGeoObject(id) {
  return geoObjects.find(o => o.id === id);
}

function clearGeoObjects() {
  geoObjects = [];
  geoIdCounter = 0;
}

/**
 * Rasterize all geometry objects into the cellType and T arrays.
 * Called before simulation starts / after domain change.
 */
function rasterizeGeoObjects(cellType, T, U, V, Nx, Ny, dx, dy, Ly, P) {
  // Reset to fluid
  cellType.fill(C_FLUID);

  // Helper: physical (x,y) with y=0 at bottom → grid indices (i=1..Nx, j=1..Ny), j=1 at top
  function physToCell(px, py) {
    const i = Math.max(1, Math.min(Nx, Math.floor(px / dx) + 1));
    const j = Math.max(1, Math.min(Ny, Math.floor((Ly - py) / dy) + 1));
    return [i, j];
  }
  function idx(i, j) { return i * (Ny + 2) + j; }

  for (const obj of geoObjects) {
    if (!obj.visible) continue;
    const ct = TYPE_TO_CELL[obj.type] ?? C_WALL;
    const info = GEO_TYPES[obj.type];

    // Convert bounding box to grid range
    const [i0, j1] = physToCell(obj.x0, obj.y1); // top-left in physical = top in grid (low j)
    const [i1, j0] = physToCell(obj.x1, obj.y0); // bottom-right in physical = bottom in grid (high j)

    if (obj.shape === 'rect' || obj.shape === 'hline' || obj.shape === 'vline') {
      for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) {
        for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) {
          if (i < 1 || i > Nx || j < 1 || j > Ny) continue;
          const ix = idx(i, j);
          cellType[ix] = ct;
          if (info?.hasTemp) {
            T[ix] = obj.props.temperature ?? (ct === C_HOT ? P.T_hot : P.T_cold);
          }
          U[ix] = 0; V[ix] = 0;
        }
      }
    } else if (obj.shape === 'circle') {
      // Center in physical coords
      const cx_phys = (obj.x0 + obj.x1) / 2;
      const cy_phys = (obj.y0 + obj.y1) / 2;
      const r_phys  = obj.radius ?? Math.min(obj.x1 - obj.x0, obj.y1 - obj.y0) / 2;
      // Center in grid cells (fractional)
      const ci = cx_phys / dx + 0.5;
      const cj = (Ly - cy_phys) / dy + 0.5;
      const ri = r_phys / dx;
      const rj = r_phys / dy;
      for (let i = Math.max(1, Math.floor(ci - ri - 1)); i <= Math.min(Nx, Math.ceil(ci + ri + 1)); i++) {
        for (let j = Math.max(1, Math.floor(cj - rj - 1)); j <= Math.min(Ny, Math.ceil(cj + rj + 1)); j++) {
          const di = (i - ci) / ri;
          const dj = (j - cj) / rj;
          if (di * di + dj * dj <= 1) {
            const ix = idx(i, j);
            cellType[ix] = ct;
            if (info?.hasTemp) {
              T[ix] = obj.props.temperature ?? (ct === C_HOT ? P.T_hot : P.T_cold);
            }
            U[ix] = 0; V[ix] = 0;
          }
        }
      }
    }
  }
}

// ── SERIALIZATION ──────────────────────────────────────────────────
function serializeGeoObjects() {
  return geoObjects.map(o => ({
    id:      o.id,
    name:    o.name,
    type:    o.type,
    shape:   o.shape,
    x0:      o.x0,  y0: o.y0,
    x1:      o.x1,  y1: o.y1,
    radius:  o.radius,
    visible: o.visible,
    props:   { ...o.props },
  }));
}

function deserializeGeoObjects(arr) {
  clearGeoObjects();
  if (!Array.isArray(arr)) return;
  for (const o of arr) {
    const obj = createGeoObject(o);
    obj.id = o.id;
    if (o.id > geoIdCounter) geoIdCounter = o.id;
    geoObjects.push(obj);
  }
}

// ── TYPE COLOR HELPER ──────────────────────────────────────────────
function typeColor(type) { return GEO_TYPES[type]?.color ?? '#ffffff'; }
function typeIcon(type)  { return GEO_TYPES[type]?.icon  ?? '❓'; }
function typeLabel(type) { return GEO_TYPES[type]?.label ?? type; }
