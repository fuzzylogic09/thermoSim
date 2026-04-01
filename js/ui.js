// ═══════════════════════════════════════════
// UI — PANEL TABS, SLIDERS, MODALS, GEO EDITOR
// ═══════════════════════════════════════════
'use strict';

// ── TABS ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    const pane=document.getElementById('tab-'+btn.dataset.tab);
    if(pane) pane.classList.add('active');
  });
});

// ── THEME TOGGLE ──────────────────────────────────────────────────
(function(){
  const stored=localStorage.getItem('als-theme')||'dark';
  document.documentElement.setAttribute('data-theme',stored);
  const btn=document.getElementById('theme-toggle');
  function updateIcon(){ btn.textContent=document.documentElement.getAttribute('data-theme')==='dark'?'☀️':'🌙'; }
  updateIcon();
  btn.addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme');
    const next=cur==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',next);
    localStorage.setItem('als-theme',next);
    updateIcon();
  });
})();

// ── SLIDERS ───────────────────────────────────────────────────────
function fmtParam(v,f){
  if(f==='exp')  return v.toExponential(2);
  if(f==='2f')   return v.toFixed(2);
  if(f==='1f')   return v.toFixed(1);
  if(f==='0f')   return Math.round(v).toString();
  return String(v);
}
function sliderVal(wrap,raw){
  return wrap.dataset.log==='1' ? Math.pow(10,raw) : parseFloat(raw);
}
function rawFromVal(wrap,val){
  return wrap.dataset.log==='1' ? Math.log10(val) : val;
}
function setSliderRaw(wrap,raw){
  const mn=parseFloat(wrap.dataset.min), mx=parseFloat(wrap.dataset.max);
  const pct=(raw-mn)/(mx-mn)*100;
  wrap.querySelector('.slider-fill').style.width=pct+'%';
  wrap.querySelector('.slider-thumb').style.left=pct+'%';
  wrap.querySelector('.slider-native').value=raw;
  const val=sliderVal(wrap,raw);
  const key=wrap.dataset.key;
  P[key]=(key==='spf'||key==='iter')?Math.round(val):val;
  const dispEl=document.getElementById(wrap.dataset.disp);
  if(dispEl) dispEl.textContent=fmtParam(P[key],wrap.dataset.fmt);
}

document.querySelectorAll('.slider-wrap').forEach(wrap=>{
  const mn=parseFloat(wrap.dataset.min),mx=parseFloat(wrap.dataset.max),st=parseFloat(wrap.dataset.step);
  setSliderRaw(wrap,parseFloat(wrap.querySelector('.slider-native').value));
  let dragging=false;
  function getRaw(){ return parseFloat(wrap.querySelector('.slider-native').value); }
  function clamp(v){ return Math.max(mn,Math.min(mx,Math.round(v/st)*st)); }
  function startDrag(){ dragging=true; wrap.querySelector('.slider-thumb').classList.add('active'); }
  function moveDrag(clientX){
    if(!dragging) return;
    const rect=wrap.getBoundingClientRect();
    setSliderRaw(wrap,clamp(mn+(clientX-rect.left)/rect.width*(mx-mn)));
  }
  function endDrag(){ dragging=false; wrap.querySelector('.slider-thumb').classList.remove('active'); }
  wrap.addEventListener('mousedown',e=>{ e.preventDefault(); startDrag(); moveDrag(e.clientX); });
  window.addEventListener('mousemove',e=>{ if(dragging) moveDrag(e.clientX); });
  window.addEventListener('mouseup',endDrag);
  let touchStartX=0,touchStartY=0,isHoriz=null;
  wrap.addEventListener('touchstart',e=>{ touchStartX=e.touches[0].clientX; touchStartY=e.touches[0].clientY; isHoriz=null; },{passive:true});
  wrap.addEventListener('touchmove',e=>{
    const dx=Math.abs(e.touches[0].clientX-touchStartX), dy=Math.abs(e.touches[0].clientY-touchStartY);
    if(isHoriz===null&&dx+dy>8) isHoriz=dx>dy;
    if(isHoriz===true){ e.preventDefault(); if(!dragging) startDrag(); moveDrag(e.touches[0].clientX); }
  },{passive:false});
  wrap.addEventListener('touchend',()=>{ endDrag(); isHoriz=null; });
  wrap.querySelector('.slider-native').addEventListener('input',e=>{ setSliderRaw(wrap,parseFloat(e.target.value)); });
});

function refreshSliders(){
  document.querySelectorAll('.slider-wrap').forEach(wrap=>{
    const key=wrap.dataset.key; if(!key) return;
    setSliderRaw(wrap,rawFromVal(wrap,P[key]));
  });
}

// ── BC UI ─────────────────────────────────────────────────────────
function updateBCUI(){
  ['top','bottom','left','right'].forEach(side=>{
    const btn=document.getElementById('bc-'+side);
    const lbl=document.getElementById('bc-'+side+'-lbl');
    const t=BC[side];
    btn.className='bc-side-btn '+BC_CLASS[t];
    lbl.textContent=BC_LABEL[t];
  });
}
['top','bottom','left','right'].forEach(side=>{
  document.getElementById('bc-'+side).addEventListener('click',()=>{
    const cur=BC_CYCLE.indexOf(BC[side]);
    BC[side]=BC_CYCLE[(cur+1)%BC_CYCLE.length];
    updateBCUI();
  });
});

// ── DOMAIN INFO ───────────────────────────────────────────────────
function updateDomainInfo(){
  document.getElementById('info-lx').textContent=Lx.toFixed(3);
  document.getElementById('info-ly').textContent=Ly.toFixed(3);
  document.getElementById('info-nx').textContent=Nx;
  document.getElementById('info-ny').textContent=Ny;
  document.getElementById('info-dx').textContent=fmtM(dx);
  document.getElementById('info-dy').textContent=fmtM(dy);
}

// ── HUD UPDATE ────────────────────────────────────────────────────
// fmtTime() defined in renderer.js
function updateHUD(){
  const{tMin,tMax,vMax,vAvg}=simStats;
  document.getElementById('st-simtime').textContent=fmtTime(simTime);
  document.getElementById('st-dt').textContent=dt_cur.toExponential(2)+' s';
  const cfl_eff=vMax*dt_cur/Math.min(dx,dy);
  const cel=document.getElementById('st-cfl');
  cel.textContent=cfl_eff.toFixed(3);
  cel.className='sv'+(cfl_eff>.85?' warn':'');
  document.getElementById('st-dxdy').textContent=fmtM(dx)+'×'+fmtM(dy)+' m';
  document.getElementById('st-fps').textContent=fps;
  document.getElementById('st-accel').textContent=P.sim_speed.toFixed(1)+'×';
  const L=Math.min(Lx,Ly);
  document.getElementById('st-re').textContent=(vMax*L/P.visc).toExponential(2);
  const dT=Math.max(tMax-P.T_amb,P.T_amb-tMin,1);
  document.getElementById('st-ra').textContent=(P.gravity*P.beta*dT*Math.pow(L,3)/(P.visc*P.diff)).toExponential(2);
  document.getElementById('st-pr').textContent=(P.visc/P.diff).toFixed(3);
  document.getElementById('st-tmax').textContent=tMax.toFixed(2)+' °C';
  document.getElementById('st-tmin').textContent=tMin.toFixed(2)+' °C';
  document.getElementById('st-vmax').textContent=vMax.toFixed(4)+' m/s';
  document.getElementById('st-vmoy').textContent=vAvg.toFixed(4)+' m/s';
  document.getElementById('leg-min').textContent=tMin.toFixed(1)+'°C';
  document.getElementById('leg-mid').textContent=((tMin+tMax)/2).toFixed(1)+'°C';
  document.getElementById('leg-max').textContent=tMax.toFixed(1)+'°C';
}

// ── VIZ BUTTONS ───────────────────────────────────────────────────
document.querySelectorAll('.viz-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.viz-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); vizMode=b.dataset.viz;
}));

// ── TOOL BUTTONS ──────────────────────────────────────────────────
document.querySelectorAll('.tool-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tool-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); currentTool=b.dataset.tool;
  canvas.style.cursor=currentTool==='probe_move'?'default':'crosshair';
  renderProbeMarkers();
}));

// ── BRUSH ─────────────────────────────────────────────────────────
document.querySelectorAll('.brush-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.brush-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); brushSize=parseInt(b.dataset.brush);
}));

// ── PANEL TOGGLE ──────────────────────────────────────────────────
let panelOpen=true;
document.getElementById('panel-toggle').addEventListener('click',()=>{
  panelOpen=!panelOpen;
  document.getElementById('panel').classList.toggle('collapsed',!panelOpen);
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
  const ddx=lx/nx, ddy=ly/ny;
  document.getElementById('modal-derived').innerHTML=
    `dx=${fmtM(ddx)} m | dy=${fmtM(ddy)} m | ratio=${(ddx/ddy).toFixed(3)}<br>`+
    `Cellules: ${(nx*ny).toLocaleString()} | Mémoire ≈ ${(nx*ny*8*4/1024/1024).toFixed(1)} MB<br>`+
    `dt estimé (CFL=0.5, v=${P.fan_speed} m/s) ≈ ${(0.5*Math.min(ddx,ddy)/Math.max(P.fan_speed,.01)).toExponential(2)} s`;
}
['m-lx','m-ly','m-nx','m-ny'].forEach(id=>document.getElementById(id).addEventListener('input',updDomainModal));
['btn-domain-top','btn-domain-panel'].forEach(id=>document.getElementById(id).addEventListener('click',openDomainModal));
document.getElementById('m-cancel').addEventListener('click',closeDomainModal);
document.getElementById('modal-domain').addEventListener('click',e=>{ if(e.target===document.getElementById('modal-domain')) closeDomainModal(); });
document.getElementById('m-apply').addEventListener('click',()=>{
  const lx=parseFloat(document.getElementById('m-lx').value);
  const ly=parseFloat(document.getElementById('m-ly').value);
  const nx=parseInt(document.getElementById('m-nx').value);
  const ny=parseInt(document.getElementById('m-ny').value);
  if(!lx||lx<=0||!ly||ly<=0||!nx||nx<8||!ny||ny<8){ alert('Valeurs invalides.'); return; }
  // Change domain but keep geometry objects!
  applyDomain(lx,ly,nx,ny);
  cellPx=Math.min(W,H)/Math.max(Nx,Ny);
  zoom=1; panX=0; panY=0;
  rebuildFromGeo();
  clearProbeData();
  updateDomainInfo();
  closeDomainModal();
});

// ── GEO OBJECT MODAL ──────────────────────────────────────────────
let editingGeoId = null; // null = new

function openGeoModal(id=null){
  editingGeoId = id;
  const modal=document.getElementById('modal-geo');
  const title=document.getElementById('geo-modal-title');
  if(id===null){
    title.textContent='➕ Nouvel objet géométrique';
    document.getElementById('gm-name').value='Objet '+(geoIdCounter+1);
    document.getElementById('gm-type').value='wall';
    document.getElementById('gm-shape').value='rect';
    document.getElementById('gm-x0').value=0;
    document.getElementById('gm-y0').value=0;
    document.getElementById('gm-x1').value=Lx;
    document.getElementById('gm-y1').value=Ly;
    document.getElementById('gm-radius').value='';
    document.getElementById('gm-temperature').value='';
    document.getElementById('gm-temp-row').style.display='none';
  } else {
    const obj=getGeoObject(id);
    title.textContent='✎ Modifier: '+obj.name;
    document.getElementById('gm-name').value=obj.name;
    document.getElementById('gm-type').value=obj.type;
    document.getElementById('gm-shape').value=obj.shape;
    document.getElementById('gm-x0').value=obj.x0;
    document.getElementById('gm-y0').value=obj.y0;
    document.getElementById('gm-x1').value=obj.x1;
    document.getElementById('gm-y1').value=obj.y1;
    document.getElementById('gm-radius').value=obj.radius??'';
    document.getElementById('gm-temperature').value=obj.props.temperature??'';
    updateGeoTempRow();
  }
  modal.classList.add('open');
}

function updateGeoTempRow(){
  const type=document.getElementById('gm-type').value;
  const row=document.getElementById('gm-temp-row');
  const info=GEO_TYPES[type];
  row.style.display=(info&&info.hasTemp)?'':'none';
}
document.getElementById('gm-type').addEventListener('change',updateGeoTempRow);

function closeGeoModal(){ document.getElementById('modal-geo').classList.remove('open'); }

document.getElementById('modal-geo').addEventListener('click',e=>{
  if(e.target===document.getElementById('modal-geo')) closeGeoModal();
});
document.getElementById('gm-cancel').addEventListener('click',closeGeoModal);
document.getElementById('gm-apply').addEventListener('click',()=>{
  const name=document.getElementById('gm-name').value||'Objet';
  const type=document.getElementById('gm-type').value;
  const shape=document.getElementById('gm-shape').value;
  const x0=parseFloat(document.getElementById('gm-x0').value)||0;
  const y0=parseFloat(document.getElementById('gm-y0').value)||0;
  const x1=parseFloat(document.getElementById('gm-x1').value)||1;
  const y1=parseFloat(document.getElementById('gm-y1').value)||1;
  const rVal=document.getElementById('gm-radius').value;
  const radius=rVal===''?null:parseFloat(rVal);
  const tempVal=document.getElementById('gm-temperature').value;
  const props={};
  if(tempVal!=='') props.temperature=parseFloat(tempVal);

  if(editingGeoId===null){
    addGeoObject({ name, type, shape, x0:Math.min(x0,x1), y0:Math.min(y0,y1), x1:Math.max(x0,x1), y1:Math.max(y0,y1), radius, props });
  } else {
    const obj=getGeoObject(editingGeoId);
    if(obj){
      obj.name=name; obj.type=type; obj.shape=shape;
      obj.x0=Math.min(x0,x1); obj.y0=Math.min(y0,y1);
      obj.x1=Math.max(x0,x1); obj.y1=Math.max(y0,y1);
      obj.radius=radius; obj.props=props;
    }
  }
  rebuildFromGeo();
  refreshGeoList();
  closeGeoModal();
});

// ── GEO LIST ──────────────────────────────────────────────────────
let selectedGeoId = null;

function refreshGeoList(){
  const list=document.getElementById('geo-list');
  list.innerHTML='';
  if(geoObjects.length===0){
    list.innerHTML='<div class="geo-empty"><span class="geo-empty-icon">📐</span>Aucun objet défini.<br>Créez ou dessinez des objets géométriques.<br>Ils seront indépendants du maillage.</div>';
    return;
  }
  geoObjects.forEach((obj,i)=>{
    const item=document.createElement('div');
    item.className='geo-item'+(obj.id===selectedGeoId?' selected':'');
    item.style.animationDelay=(i*.04)+'s';
    const info=GEO_TYPES[obj.type];
    const shapeLabel=GEO_SHAPES[obj.shape]||obj.shape;
    const coordLabel=`${obj.x0.toFixed(2)},${obj.y0.toFixed(2)} → ${obj.x1.toFixed(2)},${obj.y1.toFixed(2)} m`;
    item.innerHTML=`
      <div class="geo-item-type-dot" style="background:${typeColor(obj.type)}"></div>
      <div class="geo-item-info">
        <div class="geo-item-name">${typeIcon(obj.type)} ${obj.name}</div>
        <div class="geo-item-sub">${typeLabel(obj.type)} · ${shapeLabel} · ${coordLabel}</div>
      </div>
      <div class="geo-item-actions">
        <button class="geo-action-btn" title="Éditer" data-id="${obj.id}" data-action="edit">✎</button>
        <button class="geo-action-btn" title="Dupliquer" data-id="${obj.id}" data-action="dup">⧉</button>
        <button class="geo-action-btn del" title="Supprimer" data-id="${obj.id}" data-action="del">✕</button>
      </div>`;
    item.addEventListener('click',e=>{
      const btn=e.target.closest('[data-action]');
      if(btn){
        const id=parseInt(btn.dataset.id);
        if(btn.dataset.action==='edit'){ openGeoModal(id); return; }
        if(btn.dataset.action==='del'){
          if(confirm('Supprimer cet objet ?')){ removeGeoObject(id); rebuildFromGeo(); refreshGeoList(); } return;
        }
        if(btn.dataset.action==='dup'){
          const src=getGeoObject(id);
          addGeoObject({...src, name:src.name+' (copie)', id:undefined, props:{...src.props}});
          rebuildFromGeo(); refreshGeoList(); return;
        }
      }
      selectedGeoId=obj.id;
      refreshGeoList();
    });
    list.appendChild(item);
  });
}

document.getElementById('btn-geo-add').addEventListener('click',()=>openGeoModal(null));
document.getElementById('btn-geo-clear').addEventListener('click',()=>{
  if(geoObjects.length===0||confirm('Effacer tous les objets ?')){
    clearGeoObjects(); rebuildFromGeo(); refreshGeoList();
  }
});
