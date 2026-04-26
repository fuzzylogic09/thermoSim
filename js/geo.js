// ═══════════════════════════════════════════
// GEOMETRY OBJECTS SYSTEM
// ═══════════════════════════════════════════
'use strict';

const C_FLUID=0, C_WALL=1, C_HOT=2, C_COLD=3, C_FAN_R=4, C_FAN_L=5, C_FAN_U=6, C_FAN_D=7;

const GEO_TYPES = {
  wall:   { label:'Mur (CFD)',   color:'#9ca3af', icon:'🧱', hasFan:false, hasTemp:false },
  source: { label:'Source therm.',color:'#f97316', icon:'🌡', hasFan:false, hasTemp:true  },
  fan:    { label:'Ventilateur', color:'#a78bfa', icon:'💨', hasFan:true,  hasTemp:false },
};

const GEO_SHAPES={rect:'Rectangle',circle:'Cercle',hline:'Ligne H',vline:'Ligne V'};

let geoObjects=[], geoIdCounter=0;
function newGeoId(){ return ++geoIdCounter; }

function defaultProps(type){
  if(type==='source') return { temperature:60, blocksFlow:false };
  if(type==='fan')    return { speed:2.0, angleDeg:0 }; // 0° = right (→)
  return {};
}

function createGeoObject(opts){
  const type=opts.type||'wall';
  const id=opts.id??newGeoId();
  if(id>geoIdCounter) geoIdCounter=id;
  return {
    id, type,
    name:   opts.name||(GEO_TYPES[type]?.label+' '+id),
    shape:  opts.shape||'rect',
    x0:opts.x0??0, y0:opts.y0??0,
    x1:opts.x1??1, y1:opts.y1??1,
    radius: opts.radius??null,
    visible:opts.visible??true,
    locked: opts.locked??false,
    props:  {...defaultProps(type),...(opts.props||{})},
  };
}

function addGeoObject(opts)  { const o=createGeoObject(opts); geoObjects.push(o); return o; }
function removeGeoObject(id) { geoObjects=geoObjects.filter(o=>o.id!==id); }
function getGeoObject(id)    { return geoObjects.find(o=>o.id===id); }
function clearGeoObjects()   { geoObjects=[]; geoIdCounter=0; }

// ── RASTERIZE ──────────────────────────────────────────────────────
// Cell type mapping: source with T>T_amb → C_HOT, otherwise C_COLD
// (purely for colormap; physics uses _srcT array directly)
function sourceCellType(obj,P){
  const t=obj.props.temperature??20;
  return t>=(P.T_amb??20) ? C_HOT : C_COLD;
}

function rasterizeGeoObjects(cellType,T,U,V,Nx,Ny,dx,dy,Ly,P){
  cellType.fill(C_FLUID);
  function physToCell(px,py){
    return [Math.max(1,Math.min(Nx,Math.floor(px/dx)+1)),
            Math.max(1,Math.min(Ny,Math.floor((Ly-py)/dy)+1))];
  }
  function idxF(i,j){ return i*(Ny+2)+j; }

  for(const obj of geoObjects){
    if(!obj.visible) continue;
    let ct,fu=0,fv=0;
    if(obj.type==='fan'){
      // Always use C_FAN_R as base — actual velocity set by _fanU/_fanV
      ct=C_FAN_R;
      const angleDeg=obj.props.angleDeg??0;
      const rad=angleDeg*Math.PI/180;
      const spd=obj.props.speed??2.0;
      fu=spd*Math.cos(rad); fv=-spd*Math.sin(rad); // y inverted in grid
      // Choose closest cardinal for cell type (for display only)
      if(Math.abs(fu)>Math.abs(fv)) ct=fu>=0?C_FAN_R:C_FAN_L;
      else                           ct=fv<=0?C_FAN_U:C_FAN_D;
    } else if(obj.type==='source'||obj.type==='hot'||obj.type==='cold'){
      ct=sourceCellType(obj,P);
    } else {
      ct=C_WALL;
    }
    const t=(obj.type==='source'||obj.type==='hot'||obj.type==='cold')
      ? (obj.props.temperature??20) : null;

    const [i0,j1]=physToCell(obj.x0,obj.y1);
    const [i1,j0]=physToCell(obj.x1,obj.y0);

    if(obj.shape==='rect'||obj.shape==='hline'||obj.shape==='vline'){
      for(let i=Math.min(i0,i1);i<=Math.max(i0,i1);i++)
        for(let j=Math.min(j0,j1);j<=Math.max(j0,j1);j++){
          if(i<1||i>Nx||j<1||j>Ny) continue;
          const ix=idxF(i,j);
          cellType[ix]=ct; U[ix]=fu; V[ix]=fv;
          if(t!==null) T[ix]=t;
        }
    } else if(obj.shape==='circle'){
      const cxp=(obj.x0+obj.x1)/2, cyp=(obj.y0+obj.y1)/2;
      const rp=obj.radius??Math.min(obj.x1-obj.x0,obj.y1-obj.y0)/2;
      const ci=cxp/dx+0.5, cj=(Ly-cyp)/dy+0.5;
      const ri=rp/dx, rj=rp/dy;
      for(let i=Math.max(1,Math.floor(ci-ri-1));i<=Math.min(Nx,Math.ceil(ci+ri+1));i++)
        for(let j=Math.max(1,Math.floor(cj-rj-1));j<=Math.min(Ny,Math.ceil(cj+rj+1));j++)
          if((i-ci)**2/ri**2+(j-cj)**2/rj**2<=1){
            const ix=idxF(i,j);
            cellType[ix]=ct; U[ix]=fu; V[ix]=fv;
            if(t!==null) T[ix]=t;
          }
    }
  }
}

// ── SERIALIZATION ──────────────────────────────────────────────────
function serializeGeoObjects(){
  return geoObjects.map(o=>({
    id:o.id,name:o.name,type:o.type,shape:o.shape,
    x0:o.x0,y0:o.y0,x1:o.x1,y1:o.y1,
    radius:o.radius,visible:o.visible,locked:o.locked,
    props:{...o.props},
  }));
}

function deserializeGeoObjects(arr){
  clearGeoObjects();
  if(!Array.isArray(arr)) return;
  for(const o of arr){
    // Back-compat: old hot/cold/fan_right etc → new types
    let type=o.type, props={...(o.props||{})};
    if(type==='hot')      { type='source'; if(!props.temperature) props.temperature=80; }
    if(type==='cold')     { type='source'; if(!props.temperature) props.temperature=0;  }
    if(type==='fan_right'){ type='fan';  props.angleDeg=0;   props.speed=props.speed??2; }
    if(type==='fan_left') { type='fan';  props.angleDeg=180; props.speed=props.speed??2; }
    if(type==='fan_up')   { type='fan';  props.angleDeg=90;  props.speed=props.speed??2; }
    if(type==='fan_down') { type='fan';  props.angleDeg=270; props.speed=props.speed??2; }
    if(type==='fan'&&props.direction&&props.angleDeg===undefined){
      const dirMap={right:0,up:90,left:180,down:270};
      props.angleDeg=dirMap[props.direction]??0;
    }
    geoObjects.push(createGeoObject({...o,type,props}));
  }
}

function typeColor(type){ return GEO_TYPES[type]?.color??'#ffffff'; }
function typeIcon(type) { return GEO_TYPES[type]?.icon??'❓'; }
function typeLabel(type){ return GEO_TYPES[type]?.label??type; }

function maxFanSpeed(){
  let m=0;
  for(const o of geoObjects) if(o.type==='fan') m=Math.max(m,o.props.speed??0);
  return m;
}