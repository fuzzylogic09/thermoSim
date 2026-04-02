// ═══════════════════════════════════════════
// UI — PANEL TABS, SLIDERS, MODALS, GEO EDITOR
// ═══════════════════════════════════════════
'use strict';

// ── ACTIVE TAB TRACKING ───────────────────────────────────────────
let activeTab = 'domain';

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    const pane=document.getElementById('tab-'+activeTab);
    if(pane) pane.classList.add('active');
    // Update draw-mode tool selection display
    updateDrawToolHighlight();
  });
});

// ── THEME ─────────────────────────────────────────────────────────
(function(){
  const stored=localStorage.getItem('als-theme')||'dark';
  document.documentElement.setAttribute('data-theme',stored);
  const btn=document.getElementById('theme-toggle');
  function updateIcon(){
    const dark=document.documentElement.getAttribute('data-theme')==='dark';
    btn.textContent=dark?'☀️':'🌙';
  }
  updateIcon();
  btn.addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme');
    const next=cur==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',next);
    localStorage.setItem('als-theme',next);
    updateIcon();
    // Re-render so canvas background adapts
    if(typeof gatherStats==='function') gatherStats();
  });
})();

// ── SLIDERS ───────────────────────────────────────────────────────
function fmtParam(v,f){
  if(f==='exp') return v.toExponential(2);
  if(f==='2f')  return v.toFixed(2);
  if(f==='1f')  return v.toFixed(1);
  if(f==='0f')  return Math.round(v).toString();
  return String(v);
}
function sliderVal(wrap,raw){ return wrap.dataset.log==='1'?Math.pow(10,raw):parseFloat(raw); }
function rawFromVal(wrap,val){ return wrap.dataset.log==='1'?Math.log10(val):val; }

function setSliderRaw(wrap,raw){
  const mn=parseFloat(wrap.dataset.min), mx=parseFloat(wrap.dataset.max);
  const pct=Math.max(0,Math.min(100,(raw-mn)/(mx-mn)*100));
  wrap.querySelector('.slider-fill').style.width=pct+'%';
  wrap.querySelector('.slider-thumb').style.left=pct+'%';
  wrap.querySelector('.slider-native').value=raw;
  const val=sliderVal(wrap,raw);
  const key=wrap.dataset.key;
  if(key) P[key]=(key==='spf'||key==='iter')?Math.round(val):val;
  const dispEl=document.getElementById(wrap.dataset.disp);
  if(dispEl&&key) dispEl.textContent=fmtParam(P[key],wrap.dataset.fmt);
}

document.querySelectorAll('.slider-wrap').forEach(wrap=>{
  const mn=parseFloat(wrap.dataset.min),mx=parseFloat(wrap.dataset.max),st=parseFloat(wrap.dataset.step);
  setSliderRaw(wrap,parseFloat(wrap.querySelector('.slider-native').value));
  let dragging=false;
  function getRaw(){ return parseFloat(wrap.querySelector('.slider-native').value); }
  function clamp(v){ return Math.max(mn,Math.min(mx,Math.round(v/st)*st)); }
  function startDrag(){ dragging=true; wrap.querySelector('.slider-thumb').classList.add('active'); }
  function moveDrag(cx){
    if(!dragging) return;
    const rect=wrap.getBoundingClientRect();
    setSliderRaw(wrap,clamp(mn+(cx-rect.left)/rect.width*(mx-mn)));
  }
  function endDrag(){ dragging=false; wrap.querySelector('.slider-thumb').classList.remove('active'); }
  wrap.addEventListener('mousedown',e=>{ e.preventDefault(); startDrag(); moveDrag(e.clientX); });
  window.addEventListener('mousemove',e=>{ if(dragging) moveDrag(e.clientX); });
  window.addEventListener('mouseup',endDrag);
  let tsx=0,tsy=0,isH=null;
  wrap.addEventListener('touchstart',e=>{ tsx=e.touches[0].clientX; tsy=e.touches[0].clientY; isH=null; },{passive:true});
  wrap.addEventListener('touchmove',e=>{
    const dx=Math.abs(e.touches[0].clientX-tsx),dy=Math.abs(e.touches[0].clientY-tsy);
    if(isH===null&&dx+dy>8) isH=dx>dy;
    if(isH){ e.preventDefault(); if(!dragging) startDrag(); moveDrag(e.touches[0].clientX); }
  },{passive:false});
  wrap.addEventListener('touchend',()=>{ endDrag(); isH=null; });
  wrap.querySelector('.slider-native').addEventListener('input',e=>{ setSliderRaw(wrap,parseFloat(e.target.value)); });
});

function refreshSliders(){
  document.querySelectorAll('.slider-wrap').forEach(wrap=>{
    const key=wrap.dataset.key; if(!key||P[key]===undefined) return;
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
  document.getElementById('info-dx').textContent=fmtM(dx)+'×'+fmtM(dy)+' m';
  // info-dy may not exist in new HTML
}

// ── HUD UPDATE ────────────────────────────────────────────────────
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

// ── DRAW TOOL BUTTONS ─────────────────────────────────────────────
// currentTool='none' when no tool is selected (default)
let currentDrawType = null; // null = no active draw type

function updateDrawToolHighlight(){
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>{
    b.classList.toggle('active', b.dataset.tool===currentDrawType);
  });
}

document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.addEventListener('click',()=>{
  const t=b.dataset.tool;
  if(currentDrawType===t){
    // Click again to deselect
    currentDrawType=null;
  } else {
    currentDrawType=t;
    // Probes don't require geometry tab
    if(t==='probe'||t==='probe_move'){
      // stay on current tab
    }
  }
  updateDrawToolHighlight();
  canvas.style.cursor=(currentDrawType==='probe_move')?'default':'crosshair';
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
    `Cellules: ${(nx*ny).toLocaleString()} | Mémoire ≈ ${(nx*ny*8*4/1024/1024).toFixed(1)} MB`;
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
  cellPx=Math.min(W,H)/Math.max(Nx,Ny);
  zoom=1; panX=0; panY=0;
  rebuildFromGeo();
  clearProbeData();
  updateDomainInfo();
  closeDomainModal();
});

// ── GEO OBJECT MODAL ──────────────────────────────────────────────
let editingGeoId = null;

function openGeoModal(id=null, prefillType=null){
  editingGeoId=id;
  const title=document.getElementById('geo-modal-title');
  if(id===null){
    const t=prefillType||'wall';
    title.textContent='➕ Nouvel objet';
    document.getElementById('gm-name').value='';
    document.getElementById('gm-type').value=t;
    document.getElementById('gm-shape').value='rect';
    document.getElementById('gm-x0').value=(0).toFixed(2);
    document.getElementById('gm-y0').value=(0).toFixed(2);
    document.getElementById('gm-x1').value=Lx.toFixed(2);
    document.getElementById('gm-y1').value=Ly.toFixed(2);
    document.getElementById('gm-radius').value='';
    updateGeoModalFields(t);
  } else {
    const obj=getGeoObject(id);
    title.textContent='✎ Modifier: '+obj.name;
    document.getElementById('gm-name').value=obj.name;
    document.getElementById('gm-type').value=obj.type;
    document.getElementById('gm-shape').value=obj.shape;
    document.getElementById('gm-x0').value=obj.x0.toFixed(3);
    document.getElementById('gm-y0').value=obj.y0.toFixed(3);
    document.getElementById('gm-x1').value=obj.x1.toFixed(3);
    document.getElementById('gm-y1').value=obj.y1.toFixed(3);
    document.getElementById('gm-radius').value=obj.radius!=null?obj.radius:'';
    // Restore type-specific fields
    updateGeoModalFields(obj.type, obj.props);
  }
  document.getElementById('modal-geo').classList.add('open');
}

function updateGeoModalFields(type, props={}){
  // Temperature row
  const tempRow=document.getElementById('gm-temp-row');
  tempRow.style.display=(type==='hot'||type==='cold')?'':'none';
  if(type==='hot'||type==='cold'){
    const def=type==='hot'?P.T_hot:P.T_cold;
    document.getElementById('gm-temperature').value=props.temperature??def;
  }
  // Fan rows
  const fanRow=document.getElementById('gm-fan-row');
  fanRow.style.display=(type==='fan')?'':'none';
  if(type==='fan'){
    document.getElementById('gm-fan-dir').value=props.direction||'right';
    document.getElementById('gm-fan-speed').value=props.speed??2.0;
  }
}

document.getElementById('gm-type').addEventListener('change',e=>{
  const obj=editingGeoId?getGeoObject(editingGeoId):null;
  updateGeoModalFields(e.target.value, obj?.props||{});
});

function closeGeoModal(){ document.getElementById('modal-geo').classList.remove('open'); }
document.getElementById('modal-geo').addEventListener('click',e=>{
  if(e.target===document.getElementById('modal-geo')) closeGeoModal();
});
document.getElementById('gm-cancel').addEventListener('click',closeGeoModal);
document.getElementById('gm-apply').addEventListener('click',()=>{
  const type=document.getElementById('gm-type').value;
  const shape=document.getElementById('gm-shape').value;
  const rawName=document.getElementById('gm-name').value.trim();
  const x0=parseFloat(document.getElementById('gm-x0').value)||0;
  const y0=parseFloat(document.getElementById('gm-y0').value)||0;
  const x1=parseFloat(document.getElementById('gm-x1').value)||1;
  const y1=parseFloat(document.getElementById('gm-y1').value)||1;
  const rVal=document.getElementById('gm-radius').value;
  const radius=rVal===''?null:parseFloat(rVal);

  // Build props
  const props={};
  if(type==='hot'||type==='cold'){
    const tv=document.getElementById('gm-temperature').value;
    if(tv!=='') props.temperature=parseFloat(tv);
  }
  if(type==='fan'){
    props.direction=document.getElementById('gm-fan-dir').value;
    props.speed=parseFloat(document.getElementById('gm-fan-speed').value)||2;
  }

  const name=rawName||(typeLabel(type)+' '+(geoIdCounter+1));
  const x0f=Math.min(x0,x1), x1f=Math.max(x0,x1);
  const y0f=Math.min(y0,y1), y1f=Math.max(y0,y1);

  if(editingGeoId===null){
    addGeoObject({ name, type, shape, x0:x0f, y0:y0f, x1:x1f, y1:y1f, radius, props });
  } else {
    const obj=getGeoObject(editingGeoId);
    if(obj){
      obj.name=name; obj.type=type; obj.shape=shape;
      obj.x0=x0f; obj.y0=y0f; obj.x1=x1f; obj.y1=y1f;
      obj.radius=radius;
      obj.props={...defaultProps(type),...props};
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
    list.innerHTML='<div class="geo-empty"><span class="geo-empty-icon">📐</span>'
      +'Aucun objet.<br>Sélectionnez un type dans l\'onglet <b>Dessiner</b><br>'
      +'puis dessinez sur le canvas.</div>';
    return;
  }
  geoObjects.forEach((obj,i)=>{
    const item=document.createElement('div');
    item.className='geo-item'+(obj.id===selectedGeoId?' selected':'');
    item.style.animationDelay=(i*.04)+'s';
    const shapeLabel=GEO_SHAPES[obj.shape]||obj.shape;

    // Build sub-label with per-object params
    let subParts=[typeLabel(obj.type), shapeLabel];
    if(obj.type==='hot'||obj.type==='cold')
      subParts.push((obj.props.temperature??'—')+'°C');
    if(obj.type==='fan')
      subParts.push(FAN_DIRS[obj.props.direction||'right'], (obj.props.speed??2)+' m/s');
    subParts.push(`${obj.x0.toFixed(2)},${obj.y0.toFixed(2)}→${obj.x1.toFixed(2)},${obj.y1.toFixed(2)}m`);

    item.innerHTML=`
      <div class="geo-item-type-dot" style="background:${typeColor(obj.type)}"></div>
      <div class="geo-item-info">
        <div class="geo-item-name">${typeIcon(obj.type)} ${obj.name}</div>
        <div class="geo-item-sub">${subParts.join(' · ')}</div>
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
          removeGeoObject(id); rebuildFromGeo(); refreshGeoList(); return;
        }
        if(btn.dataset.action==='dup'){
          const src=getGeoObject(id);
          addGeoObject({...src,name:src.name+' (copie)',id:undefined,props:{...src.props}});
          rebuildFromGeo(); refreshGeoList(); return;
        }
      }
      selectedGeoId=(selectedGeoId===obj.id)?null:obj.id;
      refreshGeoList();
    });
    list.appendChild(item);
  });
}

document.getElementById('btn-geo-clear').addEventListener('click',()=>{
  if(geoObjects.length===0||confirm('Effacer tous les objets ?')){
    clearGeoObjects(); rebuildFromGeo(); refreshGeoList();
  }
});
