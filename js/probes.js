// ═══════════════════════════════════════════
// PROBE SYSTEM — Temperature vs time
// ═══════════════════════════════════════════
'use strict';

let probes = [];
let probeIdCounter = 0;
const MAX_PROBE_SAMPLES = 4000;
const PROBE_SAMPLE_INTERVAL = 0.05;
let lastProbeSampleTime = -Infinity;
let dragProbe = null;

const PROBE_COLORS = [
  '#f0e040','#ff6b6b','#4ecdc4','#a78bfa','#fb923c',
  '#34d399','#f472b6','#60a5fa','#fbbf24','#86efac',
];
function nextProbeColor(){ return PROBE_COLORS[probes.length % PROBE_COLORS.length]; }

function addProbe(physX, physY){
  const id = ++probeIdCounter;
  probes.push({ id, x:physX, y:physY, label:'S'+id, color:nextProbeColor(), data:[] });
  rebuildProbeLegend();
  openGraphPanel();
  renderProbeMarkers();
}

function deleteProbe(id){
  probes = probes.filter(p => p.id !== id);
  rebuildProbeLegend();
  renderProbeMarkers();
  if(probes.length===0) closeGraphPanel();
}

function clearProbeData(){
  probes.forEach(p => p.data=[]);
  lastProbeSampleTime = -Infinity;
}

function physToGrid(px, py){
  const i = Math.max(1, Math.min(Nx, Math.floor(px/dx)+1));
  const j = Math.max(1, Math.min(Ny, Math.floor((Ly-py)/dy)+1));
  return [i,j];
}

function sampleProbes(){
  if(simTime - lastProbeSampleTime < PROBE_SAMPLE_INTERVAL) return;
  lastProbeSampleTime = simTime;
  for(const p of probes){
    const [i,j] = physToGrid(p.x, p.y);
    p.data.push({ t:simTime, T:T[idx(i,j)] });
    if(p.data.length > MAX_PROBE_SAMPLES) p.data.shift();
  }
}

// ── PROBE SVG MARKERS ─────────────────────────────────────────────
function renderProbeMarkers(){
  const svg = document.getElementById('probe-svg');
  const { gw, gh, ox, oy } = getGeo();
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  while(svg.firstChild) svg.removeChild(svg.firstChild);

  for(const p of probes){
    const sx = ox + (p.x/Lx)*gw;
    const sy = oy + ((Ly-p.y)/Ly)*gh;
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('data-id', p.id);
    g.style.cursor = (currentTool==='probe_move') ? 'grab' : 'default';
    g.style.pointerEvents = (currentTool==='probe_move') ? 'all' : 'none';

    // Hit area
    const ring = document.createElementNS('http://www.w3.org/2000/svg','circle');
    ring.setAttribute('cx',sx); ring.setAttribute('cy',sy); ring.setAttribute('r',12);
    ring.setAttribute('fill','transparent'); g.appendChild(ring);

    // Body
    const body = document.createElementNS('http://www.w3.org/2000/svg','circle');
    body.setAttribute('cx',sx); body.setAttribute('cy',sy-2); body.setAttribute('r',7);
    body.setAttribute('fill',p.color); body.setAttribute('stroke','#fff');
    body.setAttribute('stroke-width','1.5'); g.appendChild(body);

    // Needle
    const needle = document.createElementNS('http://www.w3.org/2000/svg','line');
    needle.setAttribute('x1',sx); needle.setAttribute('y1',sy+5);
    needle.setAttribute('x2',sx); needle.setAttribute('y2',sy+1);
    needle.setAttribute('stroke',p.color); needle.setAttribute('stroke-width','2');
    g.appendChild(needle);

    // Label
    const lbl = document.createElementNS('http://www.w3.org/2000/svg','text');
    lbl.setAttribute('x',sx); lbl.setAttribute('y',sy+1);
    lbl.setAttribute('text-anchor','middle'); lbl.setAttribute('dominant-baseline','middle');
    lbl.setAttribute('fill','#000'); lbl.setAttribute('font-size','7');
    lbl.setAttribute('font-family','DM Sans,sans-serif'); lbl.setAttribute('font-weight','600');
    lbl.textContent = p.label; g.appendChild(lbl);

    // Temperature pill
    const [pi,pj] = physToGrid(p.x, p.y);
    const curT = T[idx(pi,pj)];
    const pillBg = document.createElementNS('http://www.w3.org/2000/svg','rect');
    const pillTxt = document.createElementNS('http://www.w3.org/2000/svg','text');
    pillBg.setAttribute('x',sx-20); pillBg.setAttribute('y',sy-26);
    pillBg.setAttribute('width',40); pillBg.setAttribute('height',14);
    pillBg.setAttribute('rx',5); pillBg.setAttribute('fill','rgba(13,15,20,.9)');
    pillBg.setAttribute('stroke',p.color); pillBg.setAttribute('stroke-width','1');
    pillTxt.setAttribute('x',sx); pillTxt.setAttribute('y',sy-15);
    pillTxt.setAttribute('text-anchor','middle'); pillTxt.setAttribute('dominant-baseline','middle');
    pillTxt.setAttribute('fill',p.color); pillTxt.setAttribute('font-size','8');
    pillTxt.setAttribute('font-family','DM Sans,monospace'); pillTxt.setAttribute('font-weight','600');
    pillTxt.textContent = curT.toFixed(1)+'°C';
    g.appendChild(pillBg); g.appendChild(pillTxt);
    svg.appendChild(g);

    // Drag
    g.addEventListener('pointerdown', e=>{
      if(currentTool!=='probe_move') return;
      e.stopPropagation();
      dragProbe=p; g.style.cursor='grabbing';
      g.setPointerCapture(e.pointerId);
    });
    g.addEventListener('pointermove', e=>{
      if(dragProbe!==p) return;
      e.stopPropagation();
      const rect=wrap.getBoundingClientRect();
      const mx=e.clientX-rect.left, my=e.clientY-rect.top;
      const geo=getGeo();
      p.x = Math.max(0,Math.min(Lx,(mx-geo.ox)/geo.gw*Lx));
      p.y = Math.max(0,Math.min(Ly,Ly-(my-geo.oy)/geo.gh*Ly));
      renderProbeMarkers();
    });
    g.addEventListener('pointerup', ()=>{ dragProbe=null; g.style.cursor='grab'; });
  }
}

// ── GRAPH PANEL ───────────────────────────────────────────────────
const graphPanel  = document.getElementById('graph-panel');
const graphCanvas = document.getElementById('graph-canvas');
const graphCtx    = graphCanvas.getContext('2d');
let graphH = 180;

function openGraphPanel(){ graphPanel.classList.add('open'); graphPanel.style.height=graphH+'px'; }
function closeGraphPanel(){ graphPanel.classList.remove('open'); }

// fmtTime() is defined in renderer.js (loaded before probes.js)

function rebuildProbeLegend(){
  const leg = document.getElementById('graph-legend');
  leg.innerHTML='';
  for(const p of probes){
    const item=document.createElement('div');
    item.className='legend-item';
    item.innerHTML=`<span class="legend-dot" style="background:${p.color}"></span>`
      +`<span style="color:${p.color}">${p.label}</span>`
      +`<span class="del-probe" data-id="${p.id}" title="Supprimer">✕</span>`;
    item.querySelector('.del-probe').addEventListener('click',e=>{
      deleteProbe(parseInt(e.target.dataset.id));
    });
    leg.appendChild(item);
  }
}

function drawGraph(){
  const wrap = graphCanvas.parentElement;
  const cw = wrap.clientWidth  || wrap.offsetWidth  || 400;
  const ch = wrap.clientHeight || wrap.offsetHeight || graphH - 36;
  if(cw < 10 || ch < 10) return; // panel not visible yet
  if(graphCanvas.width!==cw||graphCanvas.height!==ch){
    graphCanvas.width=cw; graphCanvas.height=ch;
  }
  const GW=cw, GH=ch;
  const PAD={top:8,right:14,bottom:28,left:48};
  const plotW=GW-PAD.left-PAD.right;
  const plotH=GH-PAD.top-PAD.bottom;

  graphCtx.fillStyle='rgba(4,4,20,1)';
  graphCtx.fillRect(0,0,GW,GH);

  if(probes.length===0||probes.every(p=>p.data.length<2)){
    graphCtx.fillStyle='rgba(122,128,153,.5)';
    graphCtx.font='10px DM Sans';
    graphCtx.textAlign='center';
    graphCtx.fillText('Aucune donnée — placez des sondes (📍)', GW/2, GH/2);
    return;
  }

  let tMin=Infinity,tMax=-Infinity,TMin=Infinity,TMax=-Infinity;
  for(const p of probes) for(const d of p.data){
    if(d.t<tMin)tMin=d.t; if(d.t>tMax)tMax=d.t;
    if(d.T<TMin)TMin=d.T; if(d.T>TMax)TMax=d.T;
  }
  if(tMax===tMin) tMax=tMin+1;
  const dTr=TMax-TMin, TMargin=dTr<0.1?0.5:dTr*0.07;
  TMin-=TMargin; TMax+=TMargin;
  if(TMax===TMin) TMax=TMin+1;

  function tx(t){ return PAD.left+(t-tMin)/(tMax-tMin)*plotW; }
  function ty(T){ return PAD.top+(1-(T-TMin)/(TMax-TMin))*plotH; }

  graphCtx.strokeStyle='rgba(30,32,50,1)'; graphCtx.lineWidth=.5;
  const tStep=niceStep(tMax-tMin,6), TStep=niceStep(TMax-TMin,4);
  graphCtx.font='8px DM Sans'; graphCtx.fillStyle='rgba(122,128,153,.8)';
  for(let t=Math.ceil(tMin/tStep)*tStep;t<=tMax+1e-9;t+=tStep){
    const x=tx(t); graphCtx.beginPath(); graphCtx.moveTo(x,PAD.top); graphCtx.lineTo(x,PAD.top+plotH); graphCtx.stroke();
    graphCtx.textAlign='center'; graphCtx.fillText(fmtTime(t),x,GH-6);
  }
  for(let Tv=Math.ceil(TMin/TStep)*TStep;Tv<=TMax+1e-9;Tv+=TStep){
    const y=ty(Tv); graphCtx.beginPath(); graphCtx.moveTo(PAD.left,y); graphCtx.lineTo(PAD.left+plotW,y); graphCtx.stroke();
    graphCtx.textAlign='right'; graphCtx.fillText(Tv.toFixed(1)+'°',PAD.left-3,y+3);
  }

  graphCtx.strokeStyle='rgba(232,160,32,.25)'; graphCtx.lineWidth=1;
  graphCtx.strokeRect(PAD.left,PAD.top,plotW,plotH);

  graphCtx.fillStyle='rgba(122,128,153,.6)'; graphCtx.font='8px DM Sans';
  graphCtx.save(); graphCtx.translate(10,PAD.top+plotH/2); graphCtx.rotate(-Math.PI/2);
  graphCtx.textAlign='center'; graphCtx.fillText('T (°C)',0,0); graphCtx.restore();

  for(const p of probes){
    if(p.data.length<2) continue;
    graphCtx.strokeStyle=p.color; graphCtx.lineWidth=1.5;
    graphCtx.lineJoin='round'; graphCtx.lineCap='round';
    graphCtx.beginPath();
    let first=true;
    for(const d of p.data){
      const x=tx(d.t), y=ty(d.T);
      if(first){ graphCtx.moveTo(x,y); first=false; } else { graphCtx.lineTo(x,y); }
    }
    graphCtx.stroke();
    const last=p.data[p.data.length-1];
    graphCtx.fillStyle=p.color;
    graphCtx.beginPath(); graphCtx.arc(tx(last.t),ty(last.T),3,0,Math.PI*2); graphCtx.fill();
  }
}

// Resize graph
(function(){
  const handle=document.getElementById('graph-resize');
  let dragging=false, startY=0, startH=180;
  handle.addEventListener('pointerdown',e=>{ dragging=true; startY=e.clientY; startH=graphH; handle.setPointerCapture(e.pointerId); e.preventDefault(); });
  handle.addEventListener('pointermove',e=>{ if(!dragging) return; graphH=Math.max(120,Math.min(500,startH-(e.clientY-startY))); graphPanel.style.height=graphH+'px'; });
  handle.addEventListener('pointerup',()=>{ dragging=false; });
})();

document.getElementById('btn-graph-close').addEventListener('click', closeGraphPanel);
document.getElementById('btn-graph-clear-data').addEventListener('click', clearProbeData);

function serializeProbes(){
  return probes.map(p=>({ id:p.id, label:p.label, color:p.color, x:p.x, y:p.y }));
}
function deserializeProbes(arr){
  probes=[]; probeIdCounter=0;
  if(!Array.isArray(arr)) return;
  for(const p of arr){
    probeIdCounter=Math.max(probeIdCounter,p.id);
    probes.push({ id:p.id, label:p.label, color:p.color, x:p.x, y:p.y, data:[] });
  }
  rebuildProbeLegend();
  renderProbeMarkers();
  if(probes.length>0) openGraphPanel();
}

// ── THERMAL ENERGY MONITOR ────────────────────────────────────────
// Tracks domain mean temperature and source heat flux over time
const energyData = []; // {t, Tmean, Tvar, flux}
const MAX_ENERGY_SAMPLES = 4000;
const ENERGY_SAMPLE_INTERVAL = 0.1;
let lastEnergySampleTime = -Infinity;

function sampleEnergy(){
  if(simTime - lastEnergySampleTime < ENERGY_SAMPLE_INTERVAL) return;
  lastEnergySampleTime = simTime;

  let Tsum=0, Tsum2=0, nFluid=0;
  // Mean temperature of fluid cells only
  for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
    const c=cellType[idx(i,j)];
    if(c===C_FLUID||c===C_HOT||c===C_COLD){
      const t=T[idx(i,j)];
      Tsum+=t; Tsum2+=t*t; nFluid++;
    }
  }
  const Tmean = nFluid>0 ? Tsum/nFluid : P.T_amb;
  const Tvar  = nFluid>0 ? Math.sqrt(Math.max(0,Tsum2/nFluid - Tmean*Tmean)) : 0;

  // Approximate heat flux: sum of |T_source - T_neighbor| on source cell boundaries
  // (proxy for how much heat is still being exchanged)
  let flux=0;
  if(_srcT){
    for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
      const t=_srcT[idx(i,j)];
      if(isNaN(t)) continue;
      // Check 4 neighbors: if neighbor is fluid, add delta T
      for(const[ni,nj] of [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]){
        if(ni<1||ni>Nx||nj<1||nj>Ny) continue;
        if(cellType[idx(ni,nj)]===C_FLUID){
          flux += Math.abs(t - T[idx(ni,nj)]);
        }
      }
    }
    // Normalize by number of source boundary faces
    flux = flux * (P.diff||2e-5) / (dx*dx);
  }

  energyData.push({t:simTime, Tmean, Tvar, flux});
  if(energyData.length > MAX_ENERGY_SAMPLES) energyData.shift();
}

function clearEnergyData(){
  energyData.length=0;
  lastEnergySampleTime=-Infinity;
}

// Energy graph panel
const energyPanel  = document.getElementById('energy-panel');
const energyCanvas = document.getElementById('energy-canvas');
const energyCtx    = energyCanvas.getContext('2d');

function openEnergyPanel(){ energyPanel.classList.add('open'); }
function closeEnergyPanel(){ energyPanel.classList.remove('open'); }
function toggleEnergyPanel(){ energyPanel.classList.toggle('open'); }

function drawEnergyGraph(){
  if(!energyPanel.classList.contains('open')) return;
  const wrap = energyCanvas.parentElement;
  const cw = wrap.clientWidth  || 400;
  const ch = wrap.clientHeight || 120;
  if(cw<10||ch<10) return;
  if(energyCanvas.width!==cw||energyCanvas.height!==ch){
    energyCanvas.width=cw; energyCanvas.height=ch;
  }
  const GW=cw, GH=ch;
  const PAD={top:8,right:14,bottom:28,left:48};
  const plotW=GW-PAD.left-PAD.right;
  const plotH=GH-PAD.top-PAD.bottom;

  energyCtx.fillStyle='rgba(4,4,20,1)';
  energyCtx.fillRect(0,0,GW,GH);

  if(energyData.length<2){
    energyCtx.fillStyle='rgba(122,128,153,.5)'; energyCtx.font='10px DM Sans';
    energyCtx.textAlign='center';
    energyCtx.fillText('Démarrez la simulation pour voir l\'évolution thermique', GW/2, GH/2);
    return;
  }

  let tMin=Infinity,tMax=-Infinity,TMin=Infinity,TMax=-Infinity,FMax=0;
  for(const d of energyData){
    if(d.t<tMin)tMin=d.t; if(d.t>tMax)tMax=d.t;
    if(d.Tmean-d.Tvar<TMin)TMin=d.Tmean-d.Tvar;
    if(d.Tmean+d.Tvar>TMax)TMax=d.Tmean+d.Tvar;
    if(d.flux>FMax)FMax=d.flux;
  }
  if(tMax===tMin) tMax=tMin+1;
  const dTr=TMax-TMin, TMargin=dTr<0.1?0.5:dTr*0.07;
  TMin-=TMargin; TMax+=TMargin;
  if(TMax===TMin) TMax=TMin+1;

  function tx(t){ return PAD.left+(t-tMin)/(tMax-tMin)*plotW; }
  function ty(T){ return PAD.top+(1-(T-TMin)/(TMax-TMin))*plotH; }

  // Grid
  energyCtx.strokeStyle='rgba(30,32,50,1)'; energyCtx.lineWidth=.5;
  const tStep=niceStep(tMax-tMin,6), TStep=niceStep(TMax-TMin,4);
  energyCtx.font='8px DM Sans'; energyCtx.fillStyle='rgba(122,128,153,.8)';
  for(let t=Math.ceil(tMin/tStep)*tStep;t<=tMax+1e-9;t+=tStep){
    const x=tx(t); energyCtx.beginPath(); energyCtx.moveTo(x,PAD.top); energyCtx.lineTo(x,PAD.top+plotH); energyCtx.stroke();
    energyCtx.textAlign='center'; energyCtx.fillText(fmtTime(t),x,GH-6);
  }
  for(let Tv=Math.ceil(TMin/TStep)*TStep;Tv<=TMax+1e-9;Tv+=TStep){
    const y=ty(Tv); energyCtx.beginPath(); energyCtx.moveTo(PAD.left,y); energyCtx.lineTo(PAD.left+plotW,y); energyCtx.stroke();
    energyCtx.textAlign='right'; energyCtx.fillText(Tv.toFixed(1)+'°',PAD.left-3,y+3);
  }
  energyCtx.strokeStyle='rgba(232,160,32,.25)'; energyCtx.lineWidth=1;
  energyCtx.strokeRect(PAD.left,PAD.top,plotW,plotH);

  // T amb reference line
  if(P.T_amb>=TMin&&P.T_amb<=TMax){
    const ya=ty(P.T_amb);
    energyCtx.setLineDash([4,3]); energyCtx.strokeStyle='rgba(100,150,255,.4)'; energyCtx.lineWidth=1;
    energyCtx.beginPath(); energyCtx.moveTo(PAD.left,ya); energyCtx.lineTo(PAD.left+plotW,ya); energyCtx.stroke();
    energyCtx.setLineDash([]);
    energyCtx.fillStyle='rgba(100,150,255,.7)'; energyCtx.font='7px DM Sans';
    energyCtx.textAlign='left'; energyCtx.fillText('T_amb',PAD.left+2,ya-2);
  }

  // Variance band
  energyCtx.fillStyle='rgba(52,211,153,.08)';
  energyCtx.beginPath();
  for(let k=0;k<energyData.length;k++){
    const d=energyData[k];
    const x=tx(d.t), y=ty(d.Tmean+d.Tvar);
    k===0?energyCtx.moveTo(x,y):energyCtx.lineTo(x,y);
  }
  for(let k=energyData.length-1;k>=0;k--){
    const d=energyData[k];
    energyCtx.lineTo(tx(d.t),ty(d.Tmean-d.Tvar));
  }
  energyCtx.closePath(); energyCtx.fill();

  // Mean T line
  energyCtx.strokeStyle='#34d399'; energyCtx.lineWidth=1.8;
  energyCtx.lineJoin='round'; energyCtx.lineCap='round';
  energyCtx.beginPath();
  for(let k=0;k<energyData.length;k++){
    const d=energyData[k];
    const x=tx(d.t), y=ty(d.Tmean);
    k===0?energyCtx.moveTo(x,y):energyCtx.lineTo(x,y);
  }
  energyCtx.stroke();

  // Flux line (normalized, on secondary axis right side)
  if(FMax>1e-10){
    // Map flux 0..FMax → TMin..TMax for display
    const fluxToT = f => TMin + (f/FMax)*(TMax-TMin);
    energyCtx.strokeStyle='#f97316'; energyCtx.lineWidth=1.2;
    energyCtx.setLineDash([3,2]);
    energyCtx.beginPath();
    for(let k=0;k<energyData.length;k++){
      const d=energyData[k];
      const x=tx(d.t), y=ty(fluxToT(d.flux));
      k===0?energyCtx.moveTo(x,y):energyCtx.lineTo(x,y);
    }
    energyCtx.stroke();
    energyCtx.setLineDash([]);
    // Right axis label for flux
    energyCtx.fillStyle='#f97316'; energyCtx.font='7px DM Sans';
    energyCtx.textAlign='left'; energyCtx.fillText('flux≈'+FMax.toFixed(1),PAD.left+plotW+2,PAD.top+8);
  }

  // Y axis label
  energyCtx.fillStyle='rgba(52,211,153,.7)'; energyCtx.font='8px DM Sans';
  energyCtx.save(); energyCtx.translate(10,PAD.top+plotH/2); energyCtx.rotate(-Math.PI/2);
  energyCtx.textAlign='center'; energyCtx.fillText('T moy (°C)',0,0); energyCtx.restore();

  // Last value display
  const last=energyData[energyData.length-1];
  energyCtx.fillStyle='rgba(13,15,20,.85)'; energyCtx.strokeStyle='#34d399'; energyCtx.lineWidth=1;
  const lx=tx(last.t), ly=ty(last.Tmean);
  energyCtx.beginPath(); energyCtx.arc(lx,ly,3.5,0,Math.PI*2); energyCtx.fillStyle='#34d399'; energyCtx.fill();
  // Equilibrium indicator: if variance is low relative to dT, show "≈ équilibre"
  const src_temps = _srcT ? Array.from(_srcT).filter(v=>!isNaN(v)) : [];
  if(src_temps.length>0){
    const Tsrc_mean = src_temps.reduce((a,b)=>a+b,0)/src_temps.length;
    const diffFromSrc = Math.abs(last.Tmean-Tsrc_mean);
    const totalRange = Math.abs(Tsrc_mean-P.T_amb);
    if(totalRange>0.5){
      const pct = Math.max(0,Math.min(100,100*(1-diffFromSrc/totalRange)));
      energyCtx.fillStyle='rgba(122,128,153,.9)'; energyCtx.font='bold 8px DM Sans';
      energyCtx.textAlign='right';
      energyCtx.fillText(`équil. ${pct.toFixed(0)}%`, PAD.left+plotW, PAD.top+8);
    }
  }
}

document.getElementById('btn-energy-close').addEventListener('click', closeEnergyPanel);
document.getElementById('btn-energy-clear').addEventListener('click', ()=>{ clearEnergyData(); });
document.getElementById('btn-energy-toggle').addEventListener('click', toggleEnergyPanel);