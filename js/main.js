// ═══════════════════════════════════════════
// MAIN — Loop, Input, Presets
// ═══════════════════════════════════════════
'use strict';

let currentTool='hot', brushSize=1;
let running=true, lastTS=0, fpsA=0, fpsF=0, fps=0;

// ── COORDINATE HELPERS ────────────────────────────────────────────
function screenToGrid(sx,sy){
  const{gw,gh,ox,oy}=getGeo();
  return [Math.floor((sx-ox)/gw*Nx)+1, Math.floor((sy-oy)/gh*Ny)+1];
}
function gridToPhys(gi,gj){
  return [(gi-.5)*dx, (Ny-gj+.5)*dy];
}

// ── PAINTING (free-draw into matrices, for quick sketching) ────────
const T2C={wall:C_WALL,hot:C_HOT,cold:C_COLD,
  fan_right:C_FAN_R,fan_left:C_FAN_L,fan_up:C_FAN_U,fan_down:C_FAN_D,erase:C_FLUID};

function paintAt(sx,sy){
  if(currentTool==='probe'){
    const[gi,gj]=screenToGrid(sx,sy);
    if(gi>=1&&gi<=Nx&&gj>=1&&gj<=Ny){
      const px=(gi-.5)*dx, py=Ly-(gj-.5)*dy;
      addProbe(px,py);
    }
    return;
  }
  if(currentTool==='probe_move') return;

  const[gi,gj]=screenToGrid(sx,sy);
  const r=Math.floor(brushSize/2);
  const ct=T2C[currentTool]??C_FLUID;
  for(let di=-r;di<=r;di++) for(let dj=-r;dj<=r;dj++){
    const ii=gi+di, jj=gj+dj;
    if(ii<1||ii>Nx||jj<1||jj>Ny) continue;
    cellType[idx(ii,jj)]=ct;
    if(ct===C_HOT)       T[idx(ii,jj)]=P.T_hot;
    else if(ct===C_COLD) T[idx(ii,jj)]=P.T_cold;
    else if(ct===C_FLUID){ U[idx(ii,jj)]=0; V[idx(ii,jj)]=0; }
    else if(ct===C_WALL){ U[idx(ii,jj)]=0; V[idx(ii,jj)]=0; }
  }
}

// ── DRAG-TO-CREATE RECTANGLE ──────────────────────────────────────
let drawStart=null;
const dragRectEl=document.getElementById('drag-rect');

function startDrawRect(sx,sy){
  drawStart={sx,sy};
  // Color the indicator rect by tool type
  const toolColors={
    hot:'#f97316', cold:'#38bdf8', wall:'#9ca3af',
    fan_right:'#a78bfa', fan_left:'#a78bfa', fan_up:'#a78bfa', fan_down:'#a78bfa',
    erase:'#d07070',
  };
  const c=toolColors[currentTool]||'#e8a020';
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
  const{gw,gh,ox,oy}=getGeo();
  // Convert screen rect to physical coords
  const px0=((Math.min(drawStart.sx,sx)-ox)/gw*Lx);
  const px1=((Math.max(drawStart.sx,sx)-ox)/gw*Lx);
  const py0=(Ly-(Math.max(drawStart.sy,sy)-oy)/gh*Ly);
  const py1=(Ly-(Math.min(drawStart.sy,sy)-oy)/gh*Ly);
  // Clamp to domain
  const x0=Math.max(0,Math.min(Lx,px0)), x1=Math.max(0,Math.min(Lx,px1));
  const y0=Math.max(0,Math.min(Ly,py0)), y1=Math.max(0,Math.min(Ly,py1));
  if(Math.abs(x1-x0)<dx/2||Math.abs(y1-y0)<dy/2){ drawStart=null; return; }

  if(currentTool==='erase'){
    // Remove any geo objects whose bounding box overlaps the erased rect
    const before=geoObjects.length;
    geoObjects=geoObjects.filter(obj=>{
      // AABB overlap test
      const noOverlap=(obj.x1<=x0||obj.x0>=x1||obj.y1<=y0||obj.y0>=y1);
      return noOverlap;
    });
    if(geoObjects.length!==before){ rebuildFromGeo(); refreshGeoList(); }
    drawStart=null; return;
  }

  // Auto-create geometry object from the drawn rectangle
  const typeMap={hot:'hot',cold:'cold',wall:'wall',
    fan_right:'fan_right',fan_left:'fan_left',fan_up:'fan_up',fan_down:'fan_down'};
  const gtype=typeMap[currentTool];
  if(gtype){
    addGeoObject({
      name: typeLabel(gtype)+' '+(geoIdCounter+1),
      type: gtype, shape:'rect',
      x0, y0, x1, y1,
    });
    rebuildFromGeo();
    refreshGeoList();
    // Switch to geometry tab to show the new object
    document.querySelector('.tab-btn[data-tab="geometry"]').click();
  }
  drawStart=null;
}

// ── POINTER EVENTS ────────────────────────────────────────────────
let ptrs={}, isPaint=false, isPan=false, panSX,panSY,panSPX,panSPY, lastPinch=null;
let isDrawingRect=false;
function getPos(e){ const r=wrap.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; }

wrap.addEventListener('pointerdown',e=>{
  ptrs[e.pointerId]=e;
  if(Object.keys(ptrs).length===1){
    const[x,y]=getPos(e);
    // Right-click = pan
    if(e.button===1||e.button===2){ isPan=true; panSX=e.clientX; panSY=e.clientY; panSPX=panX; panSPY=panY; e.preventDefault(); return; }
    // Free-draw or probe tools
    if(currentTool==='probe'){
      paintAt(x,y);   // place probe on click — DON'T set isPaint (no drag repeat)
      isPaint=false;
    } else if(currentTool==='probe_move'){
      isPaint=true;   // needs drag tracking for SVG markers
    } else {
      // Start rect-draw
      isPaint=false; isDrawingRect=true; startDrawRect(x,y);
    }
  } else { isPaint=false; isDrawingRect=false; drawStart=null; dragRectEl.style.display='none'; lastPinch=null; }
  e.preventDefault();
},{passive:false});

wrap.addEventListener('pointermove',e=>{
  ptrs[e.pointerId]=e;
  const pv=Object.values(ptrs);
  const[sx,sy]=getPos(e);

  if(pv.length===1){
    if(isPan&&(e.buttons&6)){ panX=panSPX+(e.clientX-panSX); panY=panSPY+(e.clientY-panSY); }
    else if(isPaint){ paintAt(sx,sy); }
    else if(isDrawingRect){ updateDrawRect(sx,sy); }
  } else if(pv.length===2){
    isPaint=false; isDrawingRect=false; dragRectEl.style.display='none';
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
    const[px,py]=gridToPhys(gi,gj);
    const t=T[idx(gi,gj)], u=U[idx(gi,gj)], v=V[idx(gi,gj)], sp=Math.hypot(u,v);
    const ctN=['fluide','mur','chaud','froid','ventil→','ventil←','ventil↑','ventil↓'];
    tip.style.display='block';
    tip.style.left=sx+16+'px'; tip.style.top=sy+16+'px';
    tip.innerHTML=`<b>[${gi},${gj}]</b> — ${ctN[cellType[idx(gi,gj)]]}<br>x=${fmtM(px)}m | y=${fmtM(py)}m<br>T=<b>${t.toFixed(2)}°C</b> | |v|=${sp.toFixed(4)} m/s`;
    hc.innerHTML=`x=<span>${fmtM(px)}m</span> y=<span>${fmtM(py)}m</span>`;
  } else { tip.style.display='none'; hc.innerHTML=''; }

  e.preventDefault();
},{passive:false});

wrap.addEventListener('pointerup',e=>{
  const[sx,sy]=getPos(e);
  if(isDrawingRect){ finishDrawRect(sx,sy); }
  delete ptrs[e.pointerId];
  if(!Object.keys(ptrs).length){ isPaint=false; isPan=false; isDrawingRect=false; lastPinch=null; }
});
wrap.addEventListener('pointercancel',e=>{ delete ptrs[e.pointerId]; isPaint=false; isDrawingRect=false; dragRectEl.style.display='none'; });
wrap.addEventListener('contextmenu',e=>e.preventDefault());
wrap.addEventListener('mousedown',e=>{ if(e.button===1||e.button===2){ isPan=true; panSX=e.clientX; panSY=e.clientY; panSPX=panX; panSPY=panY; } });
wrap.addEventListener('mousemove',e=>{ if(isPan&&(e.buttons&6)){ panX=panSPX+(e.clientX-panSX); panY=panSPY+(e.clientY-panSY); } });
wrap.addEventListener('mouseup',e=>{ if(e.button===1||e.button===2) isPan=false; });
wrap.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=wrap.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  const dz=e.deltaY<0?1.15:.87, oz=zoom;
  zoom=Math.max(.25,Math.min(24,zoom*dz));
  panX=mx-(mx-panX)*(zoom/oz); panY=my-(my-panY)*(zoom/oz);
  document.getElementById('hud-zoom').textContent=zoom.toFixed(2)+'×';
},{passive:false});

// ── CONTROL BUTTONS ───────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click',()=>{
  running=!running;
  const btn=document.getElementById('btn-play');
  btn.textContent=running?'⏸ Pause':'▶ Run';
  btn.classList.toggle('active',running);
});
document.getElementById('btn-step').addEventListener('click',()=>{ simStep(dt_cur); simTime+=dt_cur; });
document.getElementById('btn-reset-fields').addEventListener('click',()=>{ resetFields(); rebuildFromGeo(); clearProbeData(); });
document.getElementById('btn-clear').addEventListener('click',()=>{
  if(confirm('Effacer toute la géométrie et les champs ?')){ clearGeoObjects(); rebuildFromGeo(); refreshGeoList(); }
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

const PRESETS = {
  room_radiator:()=>{
    applyDomain(6,3,96,48); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=20; P.T_hot=60; P.T_cold=10; P.gravity=9.81; P.beta=3.4e-3; P.visc=1.5e-5; P.diff=2.1e-5;
    // Walls
    addGeoObject({name:'Mur haut',  type:'wall',shape:'hline',x0:0,y0:Ly,x1:Lx,y1:Ly});
    addGeoObject({name:'Mur bas',   type:'wall',shape:'hline',x0:0,y0:0, x1:Lx,y1:0});
    addGeoObject({name:'Mur gauche',type:'wall',shape:'vline',x0:0,y0:0, x1:0, y1:Ly});
    addGeoObject({name:'Mur droit', type:'wall',shape:'vline',x0:Lx,y0:0,x1:Lx,y1:Ly});
    addGeoObject({name:'Radiateur', type:'hot', shape:'rect',x0:0.2,y0:0,x1:1.2,y1:0.15});
  },
  room_ac:()=>{
    applyDomain(8,3,96,36); BC={top:'wall',bottom:'hot',left:'wall',right:'wall'};
    P.T_amb=25; P.T_hot=32; P.T_cold=16; P.gravity=9.81;
    addGeoObject({name:'Mur haut',  type:'wall',shape:'hline',x0:0,y0:Ly,x1:Lx,y1:Ly});
    addGeoObject({name:'Mur gauche',type:'wall',shape:'vline',x0:0,y0:0, x1:0, y1:Ly});
    addGeoObject({name:'Mur droit', type:'wall',shape:'vline',x0:Lx,y0:0,x1:Lx,y1:Ly});
    addGeoObject({name:'Climatiseur',type:'cold',shape:'rect',x0:Lx*.6,y0:Ly*.9,x1:Lx*.85,y1:Ly});
  },
  benard:()=>{
    applyDomain(4,2,80,40); BC={top:'cold',bottom:'hot',left:'wall',right:'wall'};
    P.T_hot=40; P.T_cold=20; P.T_amb=30; P.gravity=9.81; P.beta=3.4e-3; P.visc=1.5e-5; P.diff=2.1e-5;
    addGeoObject({name:'Mur gauche',type:'wall',shape:'vline',x0:0,y0:0,x1:0,y1:Ly});
    addGeoObject({name:'Mur droit', type:'wall',shape:'vline',x0:Lx,y0:0,x1:Lx,y1:Ly});
  },
  thermal_plume:()=>{
    applyDomain(4,8,40,80); BC={top:'open',bottom:'wall',left:'open',right:'open'};
    P.T_amb=15; P.T_hot=40; P.gravity=9.81; P.beta=3.4e-3;
    addGeoObject({name:'Source chaude',type:'hot',shape:'rect',x0:Lx/2-.3,y0:0,x1:Lx/2+.3,y1:.2});
  },
  chimney:()=>{
    applyDomain(3,6,40,80); BC={top:'open',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=15; P.T_hot=300; P.gravity=9.81; P.beta=3.4e-3;
    const cw=Lx*.15, ci=Lx/2;
    addGeoObject({name:'Mur cheminée G',type:'wall',shape:'rect',x0:ci-cw,y0:Ly*.05,x1:ci-cw+.05,y1:Ly*.95});
    addGeoObject({name:'Mur cheminée D',type:'wall',shape:'rect',x0:ci+cw-.05,y0:Ly*.05,x1:ci+cw,y1:Ly*.95});
    addGeoObject({name:'Foyer',type:'hot',shape:'rect',x0:ci-cw+.06,y0:Ly*.8,x1:ci+cw-.06,y1:Ly*.95});
  },
  hot_pipe:()=>{
    applyDomain(2,2,64,64); BC={top:'open',bottom:'open',left:'open',right:'open'};
    P.T_amb=20; P.T_hot=200; P.gravity=9.81; P.beta=3.4e-3;
    addGeoObject({name:'Tuyau chaud',type:'hot',shape:'circle',x0:Lx/2-.3,y0:Ly/2-.3,x1:Lx/2+.3,y1:Ly/2+.3,radius:.3});
  },
  lid_driven:()=>{
    applyDomain(1,1,64,64); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=20; P.T_hot=40; P.T_cold=10; P.gravity=9.81; P.fan_speed=1;
    addGeoObject({name:'Couvercle mobile',type:'fan_right',shape:'hline',x0:0.02,y0:Ly-.02,x1:Lx-.02,y1:Ly});
    addGeoObject({name:'Fond chaud',type:'hot', shape:'hline',x0:0,y0:0,x1:Lx,y1:.02});
    addGeoObject({name:'Toit froid',type:'cold',shape:'hline',x0:0,y0:Ly-.02,x1:Lx,y1:Ly});
  },
  rayleigh_benard_strong:()=>{
    applyDomain(8,2,128,32); BC={top:'cold',bottom:'hot',left:'wall',right:'wall'};
    P.T_hot=80; P.T_cold=0; P.T_amb=40; P.gravity=9.81; P.beta=3.4e-3; P.visc=1e-5; P.diff=1.5e-5;
    addGeoObject({name:'Mur gauche',type:'wall',shape:'vline',x0:0,y0:0,x1:0,y1:Ly});
    addGeoObject({name:'Mur droit', type:'wall',shape:'vline',x0:Lx,y0:0,x1:Lx,y1:Ly});
  },
  cpu_cooling:()=>{
    applyDomain(0.08,0.05,80,50); BC={top:'open',bottom:'wall',left:'wall',right:'open'};
    P.T_amb=25; P.T_hot=85; P.fan_speed=2; P.gravity=9.81; P.visc=1.5e-5; P.diff=2.1e-5;
    addGeoObject({name:'CPU',type:'hot',shape:'rect',x0:.02,y0:0,x1:.06,y1:.012});
    addGeoObject({name:'Ailette 1',type:'wall',shape:'rect',x0:.025,y0:.012,x1:.028,y1:.035});
    addGeoObject({name:'Ailette 2',type:'wall',shape:'rect',x0:.038,y0:.012,x1:.041,y1:.035});
    addGeoObject({name:'Ailette 3',type:'wall',shape:'rect',x0:.051,y0:.012,x1:.054,y1:.035});
    addGeoObject({name:'Ventilateur',type:'fan_right',shape:'vline',x0:0,y0:0,x1:.002,y1:.05});
  },
  diff_only:()=>{
    applyDomain(1,1,64,64); BC={top:'cold',bottom:'hot',left:'wall',right:'wall'};
    P.T_hot=100; P.T_cold=0; P.T_amb=50; P.gravity=0;
    addGeoObject({name:'Mur gauche',type:'wall',shape:'vline',x0:0,y0:0,x1:0,y1:Ly});
    addGeoObject({name:'Mur droit', type:'wall',shape:'vline',x0:Lx,y0:0,x1:Lx,y1:Ly});
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
