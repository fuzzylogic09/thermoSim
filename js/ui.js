'use strict';

// ── TABS ──────────────────────────────────────────────────────────
let activeTab='domain';
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    activeTab=btn.dataset.tab;
    document.getElementById('tab-'+activeTab)?.classList.add('active');
  });
});

// ── THEME ─────────────────────────────────────────────────────────
(function(){
  const stored=localStorage.getItem('als-theme')||'dark';
  document.documentElement.setAttribute('data-theme',stored);
  const btn=document.getElementById('theme-toggle');
  function updateIcon(){
    btn.textContent=document.documentElement.getAttribute('data-theme')==='dark'?'☀️':'🌙';
  }
  updateIcon();
  btn.addEventListener('click',()=>{
    const next=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',next);
    localStorage.setItem('als-theme',next);
    updateIcon();
  });
})();

// ── SLIDERS ───────────────────────────────────────────────────────
function fmtParam(v,f){
  if(f==='exp') return v.toExponential(2);
  if(f==='2f')  return v.toFixed(2);
  if(f==='1f')  return v.toFixed(1);
  if(f==='0f')  return Math.round(v)+'';
  return String(v);
}
function sliderVal(w,r){ return w.dataset.log==='1'?Math.pow(10,r):parseFloat(r); }
function rawFromVal(w,v){ return w.dataset.log==='1'?Math.log10(v):v; }
function setSliderRaw(wrap,raw){
  const mn=parseFloat(wrap.dataset.min),mx=parseFloat(wrap.dataset.max);
  const pct=Math.max(0,Math.min(100,(raw-mn)/(mx-mn)*100));
  wrap.querySelector('.slider-fill').style.width=pct+'%';
  wrap.querySelector('.slider-thumb').style.left=pct+'%';
  wrap.querySelector('.slider-native').value=raw;
  const val=sliderVal(wrap,raw), key=wrap.dataset.key;
  if(key) P[key]=(key==='spf'||key==='iter')?Math.round(val):val;
  const el=document.getElementById(wrap.dataset.disp);
  if(el&&key) el.textContent=fmtParam(P[key],wrap.dataset.fmt);
}
document.querySelectorAll('.slider-wrap').forEach(wrap=>{
  const mn=parseFloat(wrap.dataset.min),mx=parseFloat(wrap.dataset.max),st=parseFloat(wrap.dataset.step);
  setSliderRaw(wrap,parseFloat(wrap.querySelector('.slider-native').value));
  let dr=false;
  function clamp(v){ return Math.max(mn,Math.min(mx,Math.round(v/st)*st)); }
  function sd(){ dr=true; wrap.querySelector('.slider-thumb').classList.add('active'); }
  function md(cx){ if(!dr) return; const r=wrap.getBoundingClientRect(); setSliderRaw(wrap,clamp(mn+(cx-r.left)/r.width*(mx-mn))); }
  function ed(){ dr=false; wrap.querySelector('.slider-thumb').classList.remove('active'); }
  wrap.addEventListener('mousedown',e=>{ e.preventDefault(); sd(); md(e.clientX); });
  window.addEventListener('mousemove',e=>{ if(dr) md(e.clientX); });
  window.addEventListener('mouseup',ed);
  let tx=0,ty=0,iH=null;
  wrap.addEventListener('touchstart',e=>{ tx=e.touches[0].clientX; ty=e.touches[0].clientY; iH=null; },{passive:true});
  wrap.addEventListener('touchmove',e=>{
    const dx=Math.abs(e.touches[0].clientX-tx),dy=Math.abs(e.touches[0].clientY-ty);
    if(iH===null&&dx+dy>8) iH=dx>dy;
    if(iH){ e.preventDefault(); if(!dr) sd(); md(e.touches[0].clientX); }
  },{passive:false});
  wrap.addEventListener('touchend',()=>{ ed(); iH=null; });
  wrap.querySelector('.slider-native').addEventListener('input',e=>setSliderRaw(wrap,parseFloat(e.target.value)));
});
function refreshSliders(){
  document.querySelectorAll('.slider-wrap').forEach(wrap=>{
    const k=wrap.dataset.key; if(!k||P[k]===undefined) return;
    setSliderRaw(wrap,rawFromVal(wrap,P[k]));
  });
}

// ── BC ─────────────────────────────────────────────────────────────
function updateBCUI(){
  ['top','bottom','left','right'].forEach(side=>{
    const btn=document.getElementById('bc-'+side);
    const lbl=document.getElementById('bc-'+side+'-lbl');
    btn.className='bc-side-btn '+BC_CLASS[BC[side]];
    lbl.textContent=BC_LABEL[BC[side]];
  });
}
['top','bottom','left','right'].forEach(side=>{
  document.getElementById('bc-'+side).addEventListener('click',()=>{
    BC[side]=BC_CYCLE[(BC_CYCLE.indexOf(BC[side])+1)%BC_CYCLE.length];
    updateBCUI();
  });
});

// ── DOMAIN INFO ───────────────────────────────────────────────────
function updateDomainInfo(){
  document.getElementById('info-lx').textContent=Lx.toFixed(3);
  document.getElementById('info-ly').textContent=Ly.toFixed(3);
  document.getElementById('info-nx').textContent=Nx;
  document.getElementById('info-ny').textContent=Ny;
  document.getElementById('info-dx').textContent=fmtM(dx)+'×'+fmtM(dy)+' m';
}

// ── HUD ───────────────────────────────────────────────────────────
function updateHUD(){
  const{tMin,tMax,vMax,vAvg}=simStats;
  document.getElementById('st-simtime').textContent=fmtTime(simTime);
  document.getElementById('st-dt').textContent=dt_cur.toExponential(2)+' s';
  const cfl=vMax*dt_cur/Math.min(dx,dy);
  const cel=document.getElementById('st-cfl');
  cel.textContent=cfl.toFixed(3); cel.className='sv'+(cfl>.85?' warn':'');
  document.getElementById('st-dxdy').textContent=fmtM(dx)+'×'+fmtM(dy)+' m';
  document.getElementById('st-fps').textContent=fps;
  document.getElementById('st-accel').textContent=P.sim_speed.toFixed(1)+'×';
  const L=Math.min(Lx,Ly);
  document.getElementById('st-re').textContent=(vMax*L/P.visc).toExponential(2);
  const dT=Math.max(tMax-P.T_amb,P.T_amb-tMin,1);
  document.getElementById('st-ra').textContent=(P.gravity*P.beta*dT*L**3/(P.visc*P.diff)).toExponential(2);
  document.getElementById('st-pr').textContent=(P.visc/P.diff).toFixed(3);
  document.getElementById('st-tmax').textContent=tMax.toFixed(2)+' °C';
  document.getElementById('st-tmin').textContent=tMin.toFixed(2)+' °C';
  document.getElementById('st-vmax').textContent=vMax.toFixed(4)+' m/s';
  document.getElementById('st-vmoy').textContent=vAvg.toFixed(4)+' m/s';
  document.getElementById('leg-min').textContent=tMin.toFixed(1)+'°C';
  document.getElementById('leg-mid').textContent=((tMin+tMax)/2).toFixed(1)+'°C';
  document.getElementById('leg-max').textContent=tMax.toFixed(1)+'°C';
}

// ── VIZ ───────────────────────────────────────────────────────────
document.querySelectorAll('.viz-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.viz-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); vizMode=b.dataset.viz;
}));

// ── DRAW TOOL (one-shot: deselects after drawing) ─────────────────
let currentDrawType=null;
function setDrawTool(t){
  currentDrawType=t;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>{
    b.classList.toggle('active',b.dataset.tool===t);
  });
  if(canvas) canvas.style.cursor=(t==='probe_move')?'default':'crosshair';
  if(typeof renderProbeMarkers==='function') renderProbeMarkers();
}
function clearDrawTool(){
  currentDrawType=null;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.classList.remove('active'));
  if(canvas) canvas.style.cursor='';
}
document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.addEventListener('click',()=>{
  if(currentDrawType===b.dataset.tool) clearDrawTool();
  else setDrawTool(b.dataset.tool);
}));

// ── PANEL TOGGLE ──────────────────────────────────────────────────
document.getElementById('panel-toggle').addEventListener('click',()=>{
  document.getElementById('panel').classList.toggle('collapsed');
});

// ── DOMAIN MODAL ──────────────────────────────────────────────────
function openDomainModal(){
  document.getElementById('m-lx').value=Lx;
  document.getElementById('m-ly').value=Ly;
  document.getElementById('m-nx').value=Nx;
  document.getElementById('m-ny').value=Ny;
  updDomainModal();
  document.getElementById('modal-domain').classList.add('open');
}
function closeDomainModal(){ document.getElementById('modal-domain').classList.remove('open'); }
function updDomainModal(){
  const lx=parseFloat(document.getElementById('m-lx').value)||1;
  const ly=parseFloat(document.getElementById('m-ly').value)||1;
  const nx=parseInt(document.getElementById('m-nx').value)||32;
  const ny=parseInt(document.getElementById('m-ny').value)||32;
  const ddx=lx/nx,ddy=ly/ny;
  document.getElementById('modal-derived').innerHTML=
    `dx=${fmtM(ddx)} m | dy=${fmtM(ddy)} m<br>`+
    `${(nx*ny).toLocaleString()} cellules | ~${(nx*ny*8*4/1024/1024).toFixed(1)} MB`;
}
['m-lx','m-ly','m-nx','m-ny'].forEach(id=>document.getElementById(id).addEventListener('input',updDomainModal));
['btn-domain-top','btn-domain-panel'].forEach(id=>document.getElementById(id).addEventListener('click',openDomainModal));
document.getElementById('m-cancel').addEventListener('click',closeDomainModal);
document.getElementById('modal-domain').addEventListener('click',e=>{
  if(e.target===document.getElementById('modal-domain')) closeDomainModal();
});
document.getElementById('m-apply').addEventListener('click',()=>{
  const lx=parseFloat(document.getElementById('m-lx').value);
  const ly=parseFloat(document.getElementById('m-ly').value);
  const nx=parseInt(document.getElementById('m-nx').value);
  const ny=parseInt(document.getElementById('m-ny').value);
  if(!lx||lx<=0||!ly||ly<=0||!nx||nx<8||!ny||ny<8){ alert('Valeurs invalides.'); return; }
  applyDomain(lx,ly,nx,ny);
  cellPx=Math.min(W,H)/Math.max(Nx,Ny); zoom=1; panX=0; panY=0;
  rebuildFromGeo(); clearProbeData(); updateDomainInfo(); closeDomainModal();
});

// ── LOCK ALL TOGGLE ───────────────────────────────────────────────
document.getElementById('lock-all-toggle').addEventListener('change',e=>{
  const locked=e.target.checked;
  document.querySelector('label.lock-toggle .lock-icon').textContent=locked?'🔒':'🔓';
  for(const o of geoObjects) o.locked=locked;
  refreshGeoList();
  if(selectedGeoId){ const o=getGeoObject(selectedGeoId); if(o) document.getElementById('prop-locked').checked=o.locked; }
});

// ── GEO LIST ──────────────────────────────────────────────────────
let selectedGeoId=null;

function selectGeoObject(id){
  selectedGeoId=id;
  refreshGeoList();
  if(id) openPropsForObject(id);
}

function refreshGeoList(){
  const list=document.getElementById('geo-list');
  const count=document.getElementById('geo-count');
  count.textContent=geoObjects.length;
  list.innerHTML='';
  if(geoObjects.length===0){
    list.innerHTML='<div class="geo-empty"><span class="geo-empty-icon">📐</span>Aucun objet.<br>Allez dans <b>Dessiner</b>.</div>';
    return;
  }
  geoObjects.forEach((obj,i)=>{
    const isSelected=obj.id===selectedGeoId;
    const item=document.createElement('div');
    item.className='geo-item'+(isSelected?' selected':'');
    item.style.animationDelay=(i*.03)+'s';

    let sub=[GEO_SHAPES[obj.shape]||obj.shape];
    if(obj.type==='source') sub.push(obj.props.temperature+'°C');
    if(obj.type==='fan')    sub.push(obj.props.angleDeg+'° · '+obj.props.speed+' m/s');
    sub.push(`${obj.x0.toFixed(2)},${obj.y0.toFixed(2)}→${obj.x1.toFixed(2)},${obj.y1.toFixed(2)}`);

    item.innerHTML=`
      <div class="geo-item-type-dot" style="background:${typeColor(obj.type)}"></div>
      <div class="geo-item-info">
        <div class="geo-item-name">${typeIcon(obj.type)} ${obj.name}${obj.locked?' 🔒':''}</div>
        <div class="geo-item-sub">${sub.join(' · ')}</div>
      </div>
      <div class="geo-item-actions">
        <button class="geo-action-btn del" title="Supprimer" data-id="${obj.id}" data-action="del">✕</button>
      </div>`;
    item.addEventListener('click',e=>{
      const btn=e.target.closest('[data-action]');
      if(btn&&btn.dataset.action==='del'){
        removeGeoObject(parseInt(btn.dataset.id));
        rebuildFromGeo(); refreshGeoList();
        if(selectedGeoId===parseInt(btn.dataset.id)){ selectedGeoId=null; closePropsPanel(); }
        return;
      }
      selectGeoObject(obj.id);
      // Switch to props tab
      document.querySelector('.tab-btn[data-tab="props"]').click();
    });
    list.appendChild(item);
  });
}

// ── PROPERTIES PANEL ──────────────────────────────────────────────
function closePropsPanel(){
  document.getElementById('props-empty').style.display='';
  document.getElementById('props-content').style.display='none';
}

function openPropsForObject(id){
  const obj=getGeoObject(id);
  if(!obj){ closePropsPanel(); return; }
  document.getElementById('props-empty').style.display='none';
  document.getElementById('props-content').style.display='flex';

  document.getElementById('props-type-label').textContent=typeIcon(obj.type)+' '+typeLabel(obj.type);
  document.getElementById('prop-name').value=obj.name;
  document.getElementById('prop-x0').value=obj.x0;
  document.getElementById('prop-y0').value=obj.y0;
  document.getElementById('prop-x1').value=obj.x1;
  document.getElementById('prop-y1').value=obj.y1;
  document.getElementById('prop-radius').value=obj.radius??'';
  document.getElementById('prop-locked').checked=obj.locked??false;
  document.getElementById('prop-visible').checked=obj.visible??true;

  // Type-specific fields
  const isSource=obj.type==='source'||obj.type==='hot'||obj.type==='cold';
  document.getElementById('prop-temp-row').style.display=isSource?'':'none';
  if(isSource) document.getElementById('prop-temperature').value=obj.props.temperature??60;
  document.getElementById('prop-fan-rows').style.display=obj.type==='fan'?'':'none';
  if(obj.type==='fan'){
    document.getElementById('prop-fan-speed').value=obj.props.speed??2;
    const angle=obj.props.angleDeg??0;
    document.getElementById('prop-fan-angle').value=angle;
    drawAngleDial(angle);
  }
}

// Angle dial canvas
const dialCanvas=document.getElementById('fan-angle-dial');
const dialCtx=dialCanvas.getContext('2d');
function drawAngleDial(angleDeg){
  const s=44, cx=s/2, cy=s/2, r=18;
  dialCtx.clearRect(0,0,s,s);
  const isDark=document.documentElement.getAttribute('data-theme')!=='light';
  dialCtx.beginPath(); dialCtx.arc(cx,cy,r,0,Math.PI*2);
  dialCtx.fillStyle=isDark?'#1a1e2a':'#e8eaf0';
  dialCtx.strokeStyle='#a78bfa'; dialCtx.lineWidth=1.5;
  dialCtx.fill(); dialCtx.stroke();
  // Arrow
  const rad=(angleDeg-90)*Math.PI/180; // 0°=right: offset by -90 for canvas
  const rad2=(angleDeg)*Math.PI/180;
  // Actually: 0°=right in our system, canvas 0=right too, so:
  const arad=(-angleDeg)*Math.PI/180; // negate because canvas y-down
  const ex=cx+r*.7*Math.cos(arad), ey=cy+r*.7*Math.sin(arad);
  dialCtx.beginPath(); dialCtx.moveTo(cx,cy); dialCtx.lineTo(ex,ey);
  dialCtx.strokeStyle='#a78bfa'; dialCtx.lineWidth=2; dialCtx.stroke();
  // Dot at tip
  dialCtx.beginPath(); dialCtx.arc(ex,ey,3,0,Math.PI*2);
  dialCtx.fillStyle='#a78bfa'; dialCtx.fill();
}
// Drag on dial
(function(){
  let dialing=false;
  function dialAngle(e){
    const r=dialCanvas.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const dx=e.clientX-cx, dy=e.clientY-cy;
    let angle=Math.round(-Math.atan2(dy,dx)*180/Math.PI);
    if(angle<0) angle+=360;
    document.getElementById('prop-fan-angle').value=angle;
    drawAngleDial(angle);
  }
  dialCanvas.addEventListener('mousedown',e=>{ dialing=true; dialAngle(e); e.preventDefault(); });
  window.addEventListener('mousemove',e=>{ if(dialing) dialAngle(e); });
  window.addEventListener('mouseup',()=>{ dialing=false; });
  dialCanvas.addEventListener('touchstart',e=>{ dialing=true; dialAngle(e.touches[0]); },{passive:true});
  window.addEventListener('touchmove',e=>{ if(dialing) dialAngle(e.touches[0]); },{passive:true});
  window.addEventListener('touchend',()=>{ dialing=false; });
})();

document.getElementById('prop-fan-angle').addEventListener('input',e=>{
  drawAngleDial(parseFloat(e.target.value)||0);
});

// Apply properties
document.getElementById('btn-props-apply').addEventListener('click',()=>{
  if(!selectedGeoId) return;
  const obj=getGeoObject(selectedGeoId);
  if(!obj) return;
  obj.name=document.getElementById('prop-name').value||obj.name;
  obj.x0=parseFloat(document.getElementById('prop-x0').value)||obj.x0;
  obj.y0=parseFloat(document.getElementById('prop-y0').value)||obj.y0;
  obj.x1=parseFloat(document.getElementById('prop-x1').value)||obj.x1;
  obj.y1=parseFloat(document.getElementById('prop-y1').value)||obj.y1;
  const rv=document.getElementById('prop-radius').value;
  obj.radius=rv===''?null:parseFloat(rv);
  obj.locked=document.getElementById('prop-locked').checked;
  obj.visible=document.getElementById('prop-visible').checked;
  if(obj.type==='source'||obj.type==='hot'||obj.type==='cold'){
    obj.props.temperature=parseFloat(document.getElementById('prop-temperature').value);
  }
  if(obj.type==='fan'){
    obj.props.speed=parseFloat(document.getElementById('prop-fan-speed').value)||2;
    obj.props.angleDeg=((parseFloat(document.getElementById('prop-fan-angle').value)||0)%360+360)%360;
  }
  // Ensure x0<x1, y0<y1
  if(obj.x0>obj.x1)[obj.x0,obj.x1]=[obj.x1,obj.x0];
  if(obj.y0>obj.y1)[obj.y0,obj.y1]=[obj.y1,obj.y0];
  rebuildFromGeo();
  refreshGeoList();
  openPropsForObject(selectedGeoId); // refresh display
});

document.getElementById('btn-props-delete').addEventListener('click',()=>{
  if(!selectedGeoId) return;
  removeGeoObject(selectedGeoId);
  selectedGeoId=null;
  rebuildFromGeo(); refreshGeoList(); closePropsPanel();
});

// ── GEO CLEAR ─────────────────────────────────────────────────────
document.getElementById('btn-geo-clear').addEventListener('click',()=>{
  if(geoObjects.length===0||confirm('Effacer tous les objets ?')){
    clearGeoObjects(); selectedGeoId=null;
    rebuildFromGeo(); refreshGeoList(); closePropsPanel();
  }
});
