// ═══════════════════════════════════════════
// MAIN — Loop, Input, Presets
// ═══════════════════════════════════════════
'use strict';

let brushSize=1;
let running=true, lastTS=0, fpsA=0, fpsF=0, fps=0;

// currentDrawType is managed in ui.js
// activeTab is managed in ui.js

// ── COORDINATE HELPERS ────────────────────────────────────────────
function screenToGrid(sx,sy){
  const{gw,gh,ox,oy}=getGeo();
  return [Math.floor((sx-ox)/gw*Nx)+1, Math.floor((sy-oy)/gh*Ny)+1];
}
function screenToPhys(sx,sy){
  const{gw,gh,ox,oy}=getGeo();
  const px=Math.max(0,Math.min(Lx,(sx-ox)/gw*Lx));
  const py=Math.max(0,Math.min(Ly,Ly-(sy-oy)/gh*Ly));
  return [px,py];
}
function gridToPhys(gi,gj){ return [(gi-.5)*dx,(Ny-gj+.5)*dy]; }

// ── DRAG-TO-CREATE RECTANGLE ──────────────────────────────────────
let drawStart=null;
const dragRectEl=document.getElementById('drag-rect');

const TOOL_COLORS={
  hot:'#f97316', cold:'#38bdf8', wall:'#9ca3af',
  fan:'#a78bfa', erase:'#d07070',
};

function startDrawRect(sx,sy){
  drawStart={sx,sy};
  const c=TOOL_COLORS[currentDrawType]||'#e8a020';
  dragRectEl.style.borderColor=c;
  dragRectEl.style.background=c+'18';
  dragRectEl.style.display='block';
  updateDrawRect(sx,sy);
}
function updateDrawRect(sx,sy){
  if(!drawStart) return;
  const x0=Math.min(drawStart.sx,sx), y0=Math.min(drawStart.sy,sy);
  const x1=Math.max(drawStart.sx,sx), y1=Math.max(drawStart.sy,sy);
  dragRectEl.style.left=x0+'px'; dragRectEl.style.top=y0+'px';
  dragRectEl.style.width=(x1-x0)+'px'; dragRectEl.style.height=(y1-y0)+'px';
}
function finishDrawRect(sx,sy){
  if(!drawStart){ dragRectEl.style.display='none'; return; }
  dragRectEl.style.display='none';
  const [x0p,y0p]=screenToPhys(Math.min(drawStart.sx,sx), Math.max(drawStart.sy,sy));
  const [x1p,y1p]=screenToPhys(Math.max(drawStart.sx,sx), Math.min(drawStart.sy,sy));
  const x0=x0p, y0=y0p, x1=x1p, y1=y1p;

  if(Math.abs(x1-x0)<dx/2||Math.abs(y1-y0)<dy/2){ drawStart=null; return; }

  if(currentDrawType==='erase'){
    const before=geoObjects.length;
    geoObjects=geoObjects.filter(obj=>{
      return (obj.x1<=x0||obj.x0>=x1||obj.y1<=y0||obj.y0>=y1);
    });
    if(geoObjects.length!==before){ rebuildFromGeo(); refreshGeoList(); }
    drawStart=null; return;
  }

  if(currentDrawType&&GEO_TYPES[currentDrawType]){
    const name=typeLabel(currentDrawType)+' '+(geoIdCounter+1);
    addGeoObject({ name, type:currentDrawType, shape:'rect', x0, y0, x1, y1 });
    rebuildFromGeo();
    refreshGeoList();
    // Switch to geometry tab
    document.querySelector('.tab-btn[data-tab="geometry"]').click();
  }
  drawStart=null;
}

// ── GEO DRAG-MOVE ON CANVAS ───────────────────────────────────────
let dragGeoObj=null, dragGeoOffX=0, dragGeoOffY=0;
let dragGeoOrigX0=0, dragGeoOrigY0=0, dragGeoOrigX1=0, dragGeoOrigY1=0;

function tryStartGeoDrag(sx,sy){
  // Only in geometry tab, no draw type active
  if(activeTab!=='geometry'||currentDrawType) return false;
  const[px,py]=screenToPhys(sx,sy);
  // Find topmost geo object containing this point
  for(let i=geoObjects.length-1;i>=0;i--){
    const o=geoObjects[i];
    if(!o.visible) continue;
    if(px>=o.x0&&px<=o.x1&&py>=o.y0&&py<=o.y1){
      dragGeoObj=o;
      dragGeoOffX=px-(o.x0+o.x1)/2;
      dragGeoOffY=py-(o.y0+o.y1)/2;
      dragGeoOrigX0=o.x0; dragGeoOrigY0=o.y0;
      dragGeoOrigX1=o.x1; dragGeoOrigY1=o.y1;
      wrap.style.cursor='grabbing';
      return true;
    }
  }
  return false;
}
function moveGeoDrag(sx,sy){
  if(!dragGeoObj) return;
  const[px,py]=screenToPhys(sx,sy);
  const w=dragGeoOrigX1-dragGeoOrigX0, h=dragGeoOrigY1-dragGeoOrigY0;
  let cx=px-dragGeoOffX, cy=py-dragGeoOffY;
  cx=Math.max(w/2,Math.min(Lx-w/2,cx));
  cy=Math.max(h/2,Math.min(Ly-h/2,cy));
  dragGeoObj.x0=cx-w/2; dragGeoObj.x1=cx+w/2;
  dragGeoObj.y0=cy-h/2; dragGeoObj.y1=cy+h/2;
  rebuildFromGeo();
  refreshGeoList();
}
function finishGeoDrag(){
  if(!dragGeoObj) return;
  dragGeoObj=null;
  wrap.style.cursor='';
}

// ── POINTER EVENTS ────────────────────────────────────────────────
let ptrs={}, isPaint=false, isPan=false;
let panSX,panSY,panSPX,panSPY, lastPinch=null;
let isDrawingRect=false, isGeoDrag=false;

function getPos(e){
  const r=wrap.getBoundingClientRect();
  return [e.clientX-r.left, e.clientY-r.top];
}

wrap.addEventListener('pointerdown',e=>{
  ptrs[e.pointerId]=e;
  if(Object.keys(ptrs).length===1){
    const[x,y]=getPos(e);
    if(e.button===1||e.button===2){
      isPan=true; panSX=e.clientX; panSY=e.clientY; panSPX=panX; panSPY=panY;
      e.preventDefault(); return;
    }

    // Probe tools — always active regardless of tab
    if(currentDrawType==='probe'){
      const[gi,gj]=screenToGrid(x,y);
      if(gi>=1&&gi<=Nx&&gj>=1&&gj<=Ny){
        const[px2,py2]=gridToPhys(gi,gj);
        addProbe(px2,py2);
      }
      e.preventDefault(); return;
    }
    if(currentDrawType==='probe_move'){
      isPaint=true; e.preventDefault(); return;
    }

    // Geometry drag (geometry tab, no draw type)
    if(activeTab==='geometry'&&!currentDrawType){
      if(tryStartGeoDrag(x,y)){ isGeoDrag=true; e.preventDefault(); return; }
    }

    // Draw mode — only if a draw type is selected AND we're in draw tab (or geometry tab)
    if(currentDrawType&&GEO_TYPES[currentDrawType]||currentDrawType==='erase'){
      isPaint=false; isDrawingRect=true; startDrawRect(x,y);
      e.preventDefault(); return;
    }
    // No tool active — allow pan with left button drag
    isPan=true; panSX=e.clientX; panSY=e.clientY; panSPX=panX; panSPY=panY;
  } else {
    isPaint=false; isDrawingRect=false; isGeoDrag=false;
    drawStart=null; dragRectEl.style.display='none'; lastPinch=null;
    finishGeoDrag();
  }
  e.preventDefault();
},{passive:false});

wrap.addEventListener('pointermove',e=>{
  ptrs[e.pointerId]=e;
  const pv=Object.values(ptrs);
  const[sx,sy]=getPos(e);

  if(pv.length===1){
    if(isPan){
      panX=panSPX+(e.clientX-panSX); panY=panSPY+(e.clientY-panSY);
    } else if(isGeoDrag){
      moveGeoDrag(sx,sy);
    } else if(isPaint&&currentDrawType==='probe_move'){
      // probe move handled by SVG events
    } else if(isDrawingRect){
      updateDrawRect(sx,sy);
    }
  } else if(pv.length===2){
    isPaint=false; isDrawingRect=false; isGeoDrag=false;
    drawStart=null; dragRectEl.style.display='none';
    finishGeoDrag();
    const p1=pv[0],p2=pv[1];
    const cx=(p1.clientX+p2.clientX)/2, cy=(p1.clientY+p2.clientY)/2;
    const dist=Math.hypot(p2.clientX-p1.clientX,p2.clientY-p1.clientY);
    const r=wrap.getBoundingClientRect(), mx=cx-r.left, my=cy-r.top;
    if(lastPinch){
      const dz=dist/lastPinch.dist, oz=zoom;
      zoom=Math.max(.25,Math.min(24,zoom*dz));
      panX=mx-(mx-panX)*(zoom/oz)+(cx-lastPinch.cx);
      panY=my-(my-panY)*(zoom/oz)+(cy-lastPinch.cy);
      document.getElementById('hud-zoom').textContent=zoom.toFixed(2)+'×';
    }
    lastPinch={dist,cx,cy};
  }

  // Tooltip
  const[gi,gj]=screenToGrid(sx,sy);
  const tip=document.getElementById('tooltip');
  const hc=document.getElementById('hud-cursor');
  if(gi>=1&&gi<=Nx&&gj>=1&&gj<=Ny){
    const[px2,py2]=gridToPhys(gi,gj);
    const t=T[idx(gi,gj)], u=U[idx(gi,gj)], v=V[idx(gi,gj)], sp=Math.hypot(u,v);
    const ctN=['fluide','mur','chaud','froid','ventil→','ventil←','ventil↑','ventil↓'];
    tip.style.display='block';
    tip.style.left=sx+16+'px'; tip.style.top=sy+16+'px';
    tip.innerHTML=`<b>[${gi},${gj}]</b> — ${ctN[cellType[idx(gi,gj)]]}<br>`
      +`x=${fmtM(px2)}m | y=${fmtM(py2)}m<br>`
      +`T=<b>${t.toFixed(2)}°C</b> | |v|=${sp.toFixed(4)} m/s`;
    hc.innerHTML=`x=<span>${fmtM(px2)}m</span> y=<span>${fmtM(py2)}m</span>`;
  } else { tip.style.display='none'; hc.innerHTML=''; }

  e.preventDefault();
},{passive:false});

wrap.addEventListener('pointerup',e=>{
  const[sx,sy]=getPos(e);
  if(isDrawingRect){ finishDrawRect(sx,sy); isDrawingRect=false; }
  if(isGeoDrag){ finishGeoDrag(); isGeoDrag=false; }
  delete ptrs[e.pointerId];
  if(!Object.keys(ptrs).length){ isPaint=false; isPan=false; lastPinch=null; }
});
wrap.addEventListener('pointercancel',e=>{
  delete ptrs[e.pointerId]; isPaint=false; isDrawingRect=false; isGeoDrag=false;
  dragRectEl.style.display='none'; finishGeoDrag();
});
wrap.addEventListener('contextmenu',e=>e.preventDefault());
wrap.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=wrap.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  const dz=e.deltaY<0?1.15:.87, oz=zoom;
  zoom=Math.max(.25,Math.min(24,zoom*dz));
  panX=mx-(mx-panX)*(zoom/oz); panY=my-(my-panY)*(zoom/oz);
  document.getElementById('hud-zoom').textContent=zoom.toFixed(2)+'×';
},{passive:false});
// Middle/right drag to pan
wrap.addEventListener('mousedown',e=>{
  if(e.button===1||e.button===2){
    isPan=true; panSX=e.clientX; panSY=e.clientY; panSPX=panX; panSPY=panY;
  }
});
wrap.addEventListener('mousemove',e=>{
  if(isPan&&(e.buttons&6)){ panX=panSPX+(e.clientX-panSX); panY=panSPY+(e.clientY-panSY); }
});
wrap.addEventListener('mouseup',e=>{ if(e.button===1||e.button===2) isPan=false; });

// ── CONTROL BUTTONS ───────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click',()=>{
  running=!running;
  const btn=document.getElementById('btn-play');
  btn.textContent=running?'⏸ Pause':'▶ Run';
  btn.classList.toggle('active',running);
});
document.getElementById('btn-step').addEventListener('click',()=>{
  simStep(dt_cur); simTime+=dt_cur;
});
document.getElementById('btn-reset-fields').addEventListener('click',()=>{
  resetFields(); rebuildFromGeo(); clearProbeData();
});
document.getElementById('btn-clear').addEventListener('click',()=>{
  if(confirm('Effacer toute la géométrie et les champs ?')){
    clearGeoObjects(); rebuildFromGeo(); refreshGeoList();
  }
});

// ── MAIN LOOP ─────────────────────────────────────────────────────
function loop(ts){
  requestAnimationFrame(loop);
  const dtR=Math.min((ts-lastTS)/1000,.1)||.016; lastTS=ts;
  fpsA+=dtR; fpsF++;
  if(fpsA>.5){ fps=Math.round(fpsF/fpsA); fpsA=0; fpsF=0; }

  if(running){
    gatherStats();
    dt_cur=computeDt(simStats.vMax);
    const dtC=Math.min(dt_cur,5);
    for(let s=0;s<P.spf;s++){ simStep(dtC); simTime+=dtC; }
    sampleProbes();
  } else { gatherStats(); }

  render();
  if(probes.length>0){ renderProbeMarkers(); drawGraph(); }
  updateHUD();
}

// ── PRESETS ───────────────────────────────────────────────────────
function applyPreset(fn){
  clearGeoObjects();
  fn();
  cellPx=Math.min(W,H)/Math.max(Nx,Ny);
  zoom=1; panX=0; panY=0;
  rebuildFromGeo();
  refreshGeoList();
  refreshSliders();
  clearProbeData();
  simTime=0;
  updateDomainInfo();
  updateBCUI();
}

const PRESETS={
  room_radiator:()=>{
    applyDomain(6,3,96,48); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=20; P.gravity=9.81; P.beta=3.4e-3; P.visc=1.5e-5; P.diff=2.1e-5;
    addGeoObject({name:'Mur haut',   type:'wall',shape:'hline',x0:0,   y0:Ly,   x1:Lx, y1:Ly});
    addGeoObject({name:'Mur bas',    type:'wall',shape:'hline',x0:0,   y0:0,    x1:Lx, y1:0});
    addGeoObject({name:'Mur gauche', type:'wall',shape:'vline',x0:0,   y0:0,    x1:0,  y1:Ly});
    addGeoObject({name:'Mur droit',  type:'wall',shape:'vline',x0:Lx,  y0:0,    x1:Lx, y1:Ly});
    addGeoObject({name:'Radiateur',  type:'hot', shape:'rect', x0:0.2, y0:0,    x1:1.2,y1:0.15,props:{temperature:60}});
  },
  room_ac:()=>{
    applyDomain(8,3,96,36); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=25; P.gravity=9.81;
    addGeoObject({name:'Mur haut',    type:'wall',shape:'hline',x0:0,     y0:Ly,     x1:Lx,      y1:Ly});
    addGeoObject({name:'Mur bas',     type:'wall',shape:'hline',x0:0,     y0:0,      x1:Lx,      y1:0});
    addGeoObject({name:'Mur gauche',  type:'wall',shape:'vline',x0:0,     y0:0,      x1:0,       y1:Ly});
    addGeoObject({name:'Mur droit',   type:'wall',shape:'vline',x0:Lx,    y0:0,      x1:Lx,      y1:Ly});
    addGeoObject({name:'Climatiseur', type:'cold',shape:'rect', x0:Lx*.6, y0:Ly*.9, x1:Lx*.85,  y1:Ly, props:{temperature:16}});
    addGeoObject({name:'Sol chaud',   type:'hot', shape:'hline',x0:0,     y0:0,      x1:Lx,      y1:0.05,props:{temperature:32}});
  },
  benard:()=>{
    applyDomain(4,2,80,40); BC={top:'open',bottom:'open',left:'wall',right:'wall'};
    P.T_amb=30; P.gravity=9.81; P.beta=3.4e-3; P.visc=1.5e-5; P.diff=2.1e-5;
    addGeoObject({name:'Mur gauche',   type:'wall',shape:'vline',x0:0,  y0:0,x1:0,  y1:Ly});
    addGeoObject({name:'Mur droit',    type:'wall',shape:'vline',x0:Lx, y0:0,x1:Lx, y1:Ly});
    addGeoObject({name:'Plancher chaud',type:'hot', shape:'hline',x0:0, y0:0,x1:Lx, y1:0.05,props:{temperature:40}});
    addGeoObject({name:'Plafond froid', type:'cold',shape:'hline',x0:0, y0:Ly-0.05,x1:Lx,y1:Ly,props:{temperature:20}});
  },
  thermal_plume:()=>{
    applyDomain(4,8,40,80); BC={top:'open',bottom:'wall',left:'open',right:'open'};
    P.T_amb=15; P.gravity=9.81; P.beta=3.4e-3;
    addGeoObject({name:'Source chaude',type:'hot',shape:'rect',x0:Lx/2-.3,y0:0,x1:Lx/2+.3,y1:.2,props:{temperature:40}});
  },
  chimney:()=>{
    applyDomain(3,6,40,80); BC={top:'open',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=15; P.gravity=9.81; P.beta=3.4e-3;
    const cw=Lx*.15, ci=Lx/2;
    addGeoObject({name:'Mur G',  type:'wall',shape:'rect',x0:ci-cw,    y0:Ly*.05,x1:ci-cw+.05,y1:Ly*.95});
    addGeoObject({name:'Mur D',  type:'wall',shape:'rect',x0:ci+cw-.05,y0:Ly*.05,x1:ci+cw,   y1:Ly*.95});
    addGeoObject({name:'Foyer',  type:'hot', shape:'rect',x0:ci-cw+.06,y0:Ly*.8, x1:ci+cw-.06,y1:Ly*.95,props:{temperature:300}});
  },
  hot_pipe:()=>{
    applyDomain(2,2,64,64); BC={top:'open',bottom:'open',left:'open',right:'open'};
    P.T_amb=20; P.gravity=9.81; P.beta=3.4e-3;
    addGeoObject({name:'Tuyau chaud',type:'hot',shape:'circle',x0:Lx/2-.3,y0:Ly/2-.3,x1:Lx/2+.3,y1:Ly/2+.3,radius:.3,props:{temperature:200}});
  },
  lid_driven:()=>{
    applyDomain(1,1,64,64); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=20; P.gravity=9.81;
    addGeoObject({name:'Couvercle',type:'fan', shape:'hline',x0:.02,y0:Ly-.02,x1:Lx-.02,y1:Ly,props:{speed:1,direction:'right'}});
    addGeoObject({name:'Fond chaud',type:'hot', shape:'hline',x0:0,  y0:0,    x1:Lx,   y1:.02,props:{temperature:40}});
    addGeoObject({name:'Toit froid',type:'cold',shape:'hline',x0:0,  y0:Ly-.02,x1:Lx,  y1:Ly, props:{temperature:10}});
  },
  rayleigh_benard_strong:()=>{
    applyDomain(8,2,128,32); BC={top:'open',bottom:'open',left:'wall',right:'wall'};
    P.T_amb=40; P.gravity=9.81; P.beta=3.4e-3; P.visc=1e-5; P.diff=1.5e-5;
    addGeoObject({name:'Mur G',   type:'wall',shape:'vline',x0:0,  y0:0,x1:0,  y1:Ly});
    addGeoObject({name:'Mur D',   type:'wall',shape:'vline',x0:Lx, y0:0,x1:Lx, y1:Ly});
    addGeoObject({name:'Plancher',type:'hot', shape:'hline',x0:0,  y0:0,x1:Lx, y1:.05,props:{temperature:80}});
    addGeoObject({name:'Plafond', type:'cold',shape:'hline',x0:0,  y0:Ly-.05,x1:Lx,y1:Ly,props:{temperature:0}});
  },
  cpu_cooling:()=>{
    applyDomain(0.08,0.05,80,50); BC={top:'open',bottom:'wall',left:'wall',right:'open'};
    P.T_amb=25; P.gravity=9.81; P.visc=1.5e-5; P.diff=2.1e-5;
    addGeoObject({name:'CPU',   type:'hot', shape:'rect',x0:.02,y0:0,   x1:.06,y1:.012,props:{temperature:85}});
    addGeoObject({name:'Ail. 1',type:'wall',shape:'rect',x0:.025,y0:.012,x1:.028,y1:.035});
    addGeoObject({name:'Ail. 2',type:'wall',shape:'rect',x0:.038,y0:.012,x1:.041,y1:.035});
    addGeoObject({name:'Ail. 3',type:'wall',shape:'rect',x0:.051,y0:.012,x1:.054,y1:.035});
    addGeoObject({name:'Ventil.',type:'fan', shape:'vline',x0:0,y0:0,x1:.002,y1:.05,props:{speed:2,direction:'right'}});
  },
  diff_only:()=>{
    applyDomain(1,1,64,64); BC={top:'open',bottom:'open',left:'wall',right:'wall'};
    P.T_amb=50; P.gravity=0;
    addGeoObject({name:'Mur G',  type:'wall',shape:'vline',x0:0,  y0:0,x1:0,  y1:Ly});
    addGeoObject({name:'Mur D',  type:'wall',shape:'vline',x0:Lx, y0:0,x1:Lx, y1:Ly});
    addGeoObject({name:'Source chaude',type:'hot', shape:'hline',x0:0,y0:0,   x1:Lx,y1:.02,props:{temperature:100}});
    addGeoObject({name:'Source froide',type:'cold',shape:'hline',x0:0,y0:Ly-.02,x1:Lx,y1:Ly,props:{temperature:0}});
  },
};

document.querySelectorAll('.preset-btn').forEach(b=>b.addEventListener('click',()=>{
  const fn=PRESETS[b.dataset.preset]; if(fn) applyPreset(fn);
}));

// ── INIT ──────────────────────────────────────────────────────────
updateDomainInfo();
updateBCUI();
applyPreset(PRESETS.room_radiator);
requestAnimationFrame(loop);
