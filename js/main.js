'use strict';

let brushSize=1;
let running=true, lastTS=0, fpsA=0, fpsF=0, fps=0;

// ── COORDINATE HELPERS ────────────────────────────────────────────
function screenToGrid(sx,sy){
  const{gw,gh,ox,oy}=getGeo();
  return [Math.floor((sx-ox)/gw*Nx)+1, Math.floor((sy-oy)/gh*Ny)+1];
}
function screenToPhys(sx,sy){
  const{gw,gh,ox,oy}=getGeo();
  return [Math.max(0,Math.min(Lx,(sx-ox)/gw*Lx)),
          Math.max(0,Math.min(Ly,Ly-(sy-oy)/gh*Ly))];
}
function gridToPhys(gi,gj){ return [(gi-.5)*dx,(Ny-gj+.5)*dy]; }

// ── DRAG-TO-CREATE ─────────────────────────────────────────────────
let drawStart=null;
const dragRectEl=document.getElementById('drag-rect');
const TOOL_COLORS={source:'#f97316',wall:'#9ca3af',fan:'#a78bfa',erase:'#d07070'};

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
  dragRectEl.style.left=x0+'px'; dragRectEl.style.top=y0+'px';
  dragRectEl.style.width=Math.abs(sx-drawStart.sx)+'px';
  dragRectEl.style.height=Math.abs(sy-drawStart.sy)+'px';
}
function finishDrawRect(sx,sy){
  if(!drawStart){ dragRectEl.style.display='none'; return; }
  dragRectEl.style.display='none';
  const[x0p,y0p]=screenToPhys(Math.min(drawStart.sx,sx),Math.max(drawStart.sy,sy));
  const[x1p,y1p]=screenToPhys(Math.max(drawStart.sx,sx),Math.min(drawStart.sy,sy));
  const x0=x0p,y0=y0p,x1=x1p,y1=y1p;

  if(Math.abs(x1-x0)<dx/2&&Math.abs(y1-y0)<dy/2){ drawStart=null; return; }

  if(currentDrawType==='erase'){
    const before=geoObjects.length;
    geoObjects=geoObjects.filter(o=>o.x1<=x0||o.x0>=x1||o.y1<=y0||o.y0>=y1);
    if(geoObjects.length!==before){ rebuildFromGeo(); refreshGeoList(); }
  } else if(currentDrawType&&GEO_TYPES[currentDrawType]){
    const name=typeLabel(currentDrawType)+' '+(geoIdCounter+1);
    const newObj=addGeoObject({name,type:currentDrawType,shape:'rect',
      x0:Math.min(x0,x1),y0:Math.min(y0,y1),x1:Math.max(x0,x1),y1:Math.max(y0,y1)});
    rebuildFromGeo();
    refreshGeoList();
    // Select new object and show props
    selectGeoObject(newObj.id);
    document.querySelector('.tab-btn[data-tab="props"]').click();
    openPropsForObject(newObj.id);
  }

  // ONE-SHOT: clear tool after drawing
  clearDrawTool();
  drawStart=null;
}

// ── GEO DRAG-MOVE ─────────────────────────────────────────────────
let dragGeoObj=null, dragGeoOffX=0, dragGeoOffY=0;
let dragGeoW=0, dragGeoH=0;

function tryStartGeoDrag(sx,sy){
  if(currentDrawType) return false;
  const[px,py]=screenToPhys(sx,sy);
  for(let i=geoObjects.length-1;i>=0;i--){
    const o=geoObjects[i];
    if(!o.visible||o.locked) continue;
    if(px>=o.x0&&px<=o.x1&&py>=o.y0&&py<=o.y1){
      dragGeoObj=o;
      dragGeoOffX=px-(o.x0+o.x1)/2;
      dragGeoOffY=py-(o.y0+o.y1)/2;
      dragGeoW=o.x1-o.x0; dragGeoH=o.y1-o.y0;
      wrap.style.cursor='grabbing';
      return true;
    }
  }
  return false;
}
function moveGeoDrag(sx,sy){
  if(!dragGeoObj) return;
  const[px,py]=screenToPhys(sx,sy);
  let cx=px-dragGeoOffX, cy=py-dragGeoOffY;
  cx=Math.max(dragGeoW/2,Math.min(Lx-dragGeoW/2,cx));
  cy=Math.max(dragGeoH/2,Math.min(Ly-dragGeoH/2,cy));
  dragGeoObj.x0=cx-dragGeoW/2; dragGeoObj.x1=cx+dragGeoW/2;
  dragGeoObj.y0=cy-dragGeoH/2; dragGeoObj.y1=cy+dragGeoH/2;
  rebuildFromGeo();
  if(selectedGeoId===dragGeoObj.id) openPropsForObject(dragGeoObj.id);
}
function finishGeoDrag(){
  if(!dragGeoObj) return;
  dragGeoObj=null; wrap.style.cursor='';
  refreshGeoList();
}

// ── POINTER EVENTS ─────────────────────────────────────────────────
let ptrs={}, isPan=false, isPaint=false;
let panSX,panSY,panSPX,panSPY, lastPinch=null;
let isDrawingRect=false, isGeoDrag=false;

function getPos(e){ const r=wrap.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; }

wrap.addEventListener('pointerdown',e=>{
  ptrs[e.pointerId]=e;
  if(Object.keys(ptrs).length===1){
    const[x,y]=getPos(e);
    if(e.button===1||e.button===2){
      isPan=true; panSX=e.clientX; panSY=e.clientY; panSPX=panX; panSPY=panY;
      e.preventDefault(); return;
    }
    // Probe click
    if(currentDrawType==='probe'){
      const[gi,gj]=screenToGrid(x,y);
      if(gi>=1&&gi<=Nx&&gj>=1&&gj<=Ny){
        const[px2,py2]=gridToPhys(gi,gj); addProbe(px2,py2);
      }
      e.preventDefault(); return;
    }
    if(currentDrawType==='probe_move'){ isPaint=true; e.preventDefault(); return; }
    // Geometry drag (no draw tool active)
    if(!currentDrawType&&(activeTab==='geometry'||activeTab==='props')){
      if(tryStartGeoDrag(x,y)){ isGeoDrag=true; e.preventDefault(); return; }
    }
    // Draw rect
    if(currentDrawType&&(GEO_TYPES[currentDrawType]||currentDrawType==='erase')){
      isDrawingRect=true; startDrawRect(x,y); e.preventDefault(); return;
    }
    // Default: pan
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
    if(isPan){ panX=panSPX+(e.clientX-panSX); panY=panSPY+(e.clientY-panSY); }
    else if(isGeoDrag){ moveGeoDrag(sx,sy); }
    else if(isDrawingRect){ updateDrawRect(sx,sy); }
  } else if(pv.length===2){
    isPaint=false; isDrawingRect=false; isGeoDrag=false;
    drawStart=null; dragRectEl.style.display='none'; finishGeoDrag();
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
    const t=T[idx(gi,gj)],u=U[idx(gi,gj)],v=V[idx(gi,gj)],sp=Math.hypot(u,v);
    const ctN=['fluide','mur','source+','source-','vent→','vent←','vent↑','vent↓'];
    tip.style.display='block'; tip.style.left=(sx+16)+'px'; tip.style.top=(sy+16)+'px';
    tip.innerHTML=`<b>[${gi},${gj}]</b> ${ctN[cellType[idx(gi,gj)]]}<br>`
      +`x=${fmtM(px2)}m y=${fmtM(py2)}m<br>`
      +`T=<b>${t.toFixed(1)}°C</b>  |v|=${sp.toFixed(3)} m/s`;
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
wrap.addEventListener('mousedown',e=>{ if(e.button===1||e.button===2){ isPan=true; panSX=e.clientX; panSY=e.clientY; panSPX=panX; panSPY=panY; } });
wrap.addEventListener('mousemove',e=>{ if(isPan&&(e.buttons&6)){ panX=panSPX+(e.clientX-panSX); panY=panSPY+(e.clientY-panSY); } });
wrap.addEventListener('mouseup',e=>{ if(e.button===1||e.button===2) isPan=false; });

// ── CONTROL BUTTONS ───────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click',()=>{
  running=!running;
  const b=document.getElementById('btn-play');
  b.textContent=running?'⏸ Pause':'▶ Run';
  b.classList.toggle('active',running);
});
document.getElementById('btn-step').addEventListener('click',()=>{ simStep(dt_cur); simTime+=dt_cur; });
document.getElementById('btn-reset-fields').addEventListener('click',()=>{
  resetFields(); rebuildFromGeo();
  clearProbeData();
  if(typeof clearEnergyData==='function') clearEnergyData();
});
document.getElementById('btn-clear').addEventListener('click',()=>{
  if(confirm('Effacer toute la géométrie et les champs ?')){
    clearGeoObjects(); selectedGeoId=null; rebuildFromGeo(); refreshGeoList(); closePropsPanel();
  }
});

// ── MAIN LOOP ─────────────────────────────────────────────────────
function loop(ts){
  requestAnimationFrame(loop);
  const dtR=Math.min((ts-lastTS)/1000,.1)||.016; lastTS=ts;
  fpsA+=dtR; fpsF++;
  if(fpsA>.5){ fps=Math.round(fpsF/fpsA); fpsA=0; fpsF=0; }
  if(running){
    gatherStats(); dt_cur=computeDt(simStats.vMax);
    const dtC=Math.min(dt_cur,5);
    for(let s=0;s<P.spf;s++){ simStep(dtC); simTime+=dtC; }
    sampleProbes();
    sampleEnergy();
  } else { gatherStats(); }
  render();
  if(probes.length>0){ renderProbeMarkers(); drawGraph(); }
  drawEnergyGraph();
  updateHUD();
}

// ── PRESETS ───────────────────────────────────────────────────────
function applyPreset(fn){
  clearGeoObjects(); selectedGeoId=null;
  fn();
  cellPx=Math.min(W,H)/Math.max(Nx,Ny); zoom=1; panX=0; panY=0;
  rebuildFromGeo(); refreshGeoList(); closePropsPanel();
  refreshSliders(); clearProbeData(); simTime=0;
  updateDomainInfo(); updateBCUI();
}

const PRESETS={
  room_radiator:()=>{
    applyDomain(6,3,96,48); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=20; P.gravity=9.81; P.beta=3.4e-3; P.visc=1.5e-5; P.diff=2.1e-5;
    addGeoObject({name:'Mur haut',  type:'wall',shape:'hline',x0:0,y0:Ly,x1:Lx,y1:Ly,locked:true});
    addGeoObject({name:'Mur bas',   type:'wall',shape:'hline',x0:0,y0:0,x1:Lx,y1:0,locked:true});
    addGeoObject({name:'Mur gauche',type:'wall',shape:'vline',x0:0,y0:0,x1:0,y1:Ly,locked:true});
    addGeoObject({name:'Mur droit', type:'wall',shape:'vline',x0:Lx,y0:0,x1:Lx,y1:Ly,locked:true});
    addGeoObject({name:'Radiateur', type:'source',shape:'rect',x0:.2,y0:0,x1:1.2,y1:.15,props:{temperature:60}});
  },
  benard:()=>{
    applyDomain(4,2,80,40); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=30; P.gravity=9.81; P.beta=3.4e-3; P.visc=1.5e-5; P.diff=2.1e-5;
    addGeoObject({name:'Mur G',type:'wall',shape:'vline',x0:0,y0:0,x1:.05,y1:Ly,locked:true});
    addGeoObject({name:'Mur D',type:'wall',shape:'vline',x0:Lx-.05,y0:0,x1:Lx,y1:Ly,locked:true});
    addGeoObject({name:'Plancher chaud',type:'source',shape:'hline',x0:0,y0:0,x1:Lx,y1:.05,props:{temperature:40}});
    addGeoObject({name:'Plafond froid', type:'source',shape:'hline',x0:0,y0:Ly-.05,x1:Lx,y1:Ly,props:{temperature:20}});
  },
  thermal_plume:()=>{
    applyDomain(4,8,40,80); BC={top:'open',bottom:'wall',left:'open',right:'open'};
    P.T_amb=15; P.gravity=9.81; P.beta=3.4e-3;
    addGeoObject({name:'Source chaude',type:'source',shape:'rect',x0:Lx/2-.3,y0:0,x1:Lx/2+.3,y1:.2,props:{temperature:40}});
  },
  chimney:()=>{
    applyDomain(3,6,40,80); BC={top:'open',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=15; P.gravity=9.81; P.beta=3.4e-3;
    const cw=Lx*.15,ci=Lx/2;
    addGeoObject({name:'Mur G',type:'wall',shape:'rect',x0:ci-cw,y0:Ly*.05,x1:ci-cw+.05,y1:Ly*.95});
    addGeoObject({name:'Mur D',type:'wall',shape:'rect',x0:ci+cw-.05,y0:Ly*.05,x1:ci+cw,y1:Ly*.95});
    addGeoObject({name:'Foyer',type:'source',shape:'rect',x0:ci-cw+.06,y0:Ly*.8,x1:ci+cw-.06,y1:Ly*.95,props:{temperature:300}});
  },
  hot_pipe:()=>{
    applyDomain(2,2,64,64); BC={top:'open',bottom:'open',left:'open',right:'open'};
    P.T_amb=20; P.gravity=9.81; P.beta=3.4e-3;
    addGeoObject({name:'Tuyau',type:'source',shape:'circle',x0:Lx/2-.3,y0:Ly/2-.3,x1:Lx/2+.3,y1:Ly/2+.3,radius:.3,props:{temperature:200}});
  },
  cpu_cooling:()=>{
    applyDomain(.08,.05,80,50); BC={top:'open',bottom:'wall',left:'wall',right:'open'};
    P.T_amb=25; P.gravity=9.81; P.visc=1.5e-5; P.diff=2.1e-5;
    addGeoObject({name:'CPU',type:'source',shape:'rect',x0:.02,y0:0,x1:.06,y1:.012,props:{temperature:85}});
    addGeoObject({name:'Ail.1',type:'wall',shape:'rect',x0:.025,y0:.012,x1:.028,y1:.035});
    addGeoObject({name:'Ail.2',type:'wall',shape:'rect',x0:.038,y0:.012,x1:.041,y1:.035});
    addGeoObject({name:'Ail.3',type:'wall',shape:'rect',x0:.051,y0:.012,x1:.054,y1:.035});
    addGeoObject({name:'Ventil.',type:'fan',shape:'vline',x0:0,y0:0,x1:.002,y1:.05,props:{speed:2,angleDeg:0}});
  },
  diff_only:()=>{
    applyDomain(1,1,64,64); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=50; P.gravity=0;
    addGeoObject({name:'Mur G',type:'wall',shape:'vline',x0:0,y0:0,x1:.02,y1:Ly,locked:true});
    addGeoObject({name:'Mur D',type:'wall',shape:'vline',x0:Lx-.02,y0:0,x1:Lx,y1:Ly,locked:true});
    addGeoObject({name:'Chaud',type:'source',shape:'hline',x0:0,y0:0,x1:Lx,y1:.02,props:{temperature:100}});
    addGeoObject({name:'Froid',type:'source',shape:'hline',x0:0,y0:Ly-.02,x1:Lx,y1:Ly,props:{temperature:0}});
  },
  lid_driven:()=>{
    applyDomain(1,1,64,64); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=20; P.gravity=9.81;
    addGeoObject({name:'Couvercle',type:'fan',shape:'hline',x0:.02,y0:Ly-.02,x1:Lx-.02,y1:Ly,props:{speed:1,angleDeg:0}});
    addGeoObject({name:'Fond chaud',type:'source',shape:'hline',x0:0,y0:0,x1:Lx,y1:.02,props:{temperature:40}});
    addGeoObject({name:'Toit froid',type:'source',shape:'hline',x0:0,y0:Ly-.02,x1:Lx,y1:Ly,props:{temperature:10}});
  },
  rayleigh_benard_strong:()=>{
    applyDomain(8,2,128,32); BC={top:'wall',bottom:'wall',left:'wall',right:'wall'};
    P.T_amb=40; P.gravity=9.81; P.beta=3.4e-3; P.visc=1e-5; P.diff=1.5e-5;
    addGeoObject({name:'Mur G',type:'wall',shape:'vline',x0:0,y0:0,x1:.06,y1:Ly,locked:true});
    addGeoObject({name:'Mur D',type:'wall',shape:'vline',x0:Lx-.06,y0:0,x1:Lx,y1:Ly,locked:true});
    addGeoObject({name:'Plancher',type:'source',shape:'hline',x0:0,y0:0,x1:Lx,y1:.06,props:{temperature:80}});
    addGeoObject({name:'Plafond', type:'source',shape:'hline',x0:0,y0:Ly-.06,x1:Lx,y1:Ly,props:{temperature:0}});
  },
};

document.querySelectorAll('.preset-btn').forEach(b=>b.addEventListener('click',()=>{
  const fn=PRESETS[b.dataset.preset]; if(fn) applyPreset(fn);
}));

updateDomainInfo(); updateBCUI();
applyPreset(PRESETS.room_radiator);
requestAnimationFrame(loop);