// ═══════════════════════════════════════════
// SAVE / LOAD / EXAMPLES
// ═══════════════════════════════════════════
'use strict';

const SAVE_VERSION = 3;

function buildSaveObject(){
  return {
    version: SAVE_VERSION,
    meta: {
      name: "ThermoSim simulation",
      date: new Date().toISOString(),
    },
    domain: { Lx, Ly, Nx, Ny },
    boundary_conditions: { top:BC.top, bottom:BC.bottom, left:BC.left, right:BC.right },
    physics: {
      visc:P.visc, diff:P.diff, beta:P.beta,
      gravity:P.gravity, T_amb:P.T_amb, T_hot:P.T_hot, T_cold:P.T_cold,
      fan_speed:P.fan_speed,
    },
    numerics: { cfl:P.cfl, spf:P.spf, iter:P.iter, sim_speed:P.sim_speed },
    geometry_objects: serializeGeoObjects(),
    probes: serializeProbes(),
  };
}

function saveSimulation(){
  const obj=buildSaveObject();
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const ts=new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
  a.href=url; a.download=`thermosim_${ts}.json`; a.click();
  URL.revokeObjectURL(url);
}

function applyLoadedSimulation(obj){
  if(obj.version&&obj.version>SAVE_VERSION){
    if(!confirm('Version de fichier inconnue (v'+obj.version+'). Tenter quand même ?')) return;
  }

  // Domain
  const d=obj.domain||{};
  applyDomain(d.Lx||5, d.Ly||5, d.Nx||64, d.Ny||64);
  cellPx=Math.min(W,H)/Math.max(Nx,Ny);
  zoom=1; panX=0; panY=0;

  // Physics
  const ph=obj.physics||{};
  Object.assign(P,{
    visc:ph.visc??P.visc, diff:ph.diff??P.diff, beta:ph.beta??P.beta,
    gravity:ph.gravity??P.gravity, T_amb:ph.T_amb??P.T_amb,
    T_hot:ph.T_hot??P.T_hot, T_cold:ph.T_cold??P.T_cold,
    fan_speed:ph.fan_speed??P.fan_speed,
  });

  // Numerics
  const n=obj.numerics||{};
  Object.assign(P,{
    cfl:n.cfl??P.cfl, spf:n.spf??P.spf,
    iter:n.iter??P.iter, sim_speed:n.sim_speed??P.sim_speed,
  });

  // BC
  const bc=obj.boundary_conditions||{};
  BC.top=bc.top||'wall'; BC.bottom=bc.bottom||'wall';
  BC.left=bc.left||'wall'; BC.right=bc.right||'wall';

  // Geometry objects (new system)
  if(obj.geometry_objects){
    deserializeGeoObjects(obj.geometry_objects);
  }

  // Rebuild matrices from geometry
  resetFields();
  rasterizeGeoObjects(cellType,T,U,V,Nx,Ny,dx,dy,Ly,P);
  for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
    const c=cellType[idx(i,j)];
    if(c===C_HOT)       T[idx(i,j)]=P.T_hot;
    else if(c===C_COLD) T[idx(i,j)]=P.T_cold;
  }
  applyAllBC();
  simTime=0;

  // Probes
  deserializeProbes(obj.probes||[]);
  clearProbeData();

  // Refresh UI
  updateDomainInfo();
  updateBCUI();
  refreshSliders();
  refreshGeoList();

  console.log('Simulation chargée', obj.meta?.date);
}

function loadFromJSON(json){
  try{
    applyLoadedSimulation(JSON.parse(json));
  } catch(err){
    alert('Erreur de lecture JSON :\n'+err.message);
  }
}

document.getElementById('btn-save').addEventListener('click',saveSimulation);
document.getElementById('file-input').addEventListener('change',e=>{
  if(e.target.files.length>0){
    const reader=new FileReader();
    reader.onload=ev=>loadFromJSON(ev.target.result);
    reader.readAsText(e.target.files[0]);
    e.target.value='';
  }
});

// ── EXAMPLES ──────────────────────────────────────────────────────
const examplesSelect=document.getElementById('examples-select');

async function loadExamplesIndex(){
  try{
    const res=await fetch('./examples/index.json?v='+Date.now());
    if(!res.ok) return;
    const list=await res.json();
    examplesSelect.innerHTML='<option value="">— Exemples —</option>';
    for(const item of list){
      const opt=document.createElement('option');
      opt.value=item.file; opt.textContent=item.label;
      examplesSelect.appendChild(opt);
    }
  } catch(e){
    console.warn('Impossible de charger les exemples:',e);
  }
}

examplesSelect.addEventListener('change',async()=>{
  const file=examplesSelect.value;
  if(!file) return;
  try{
    const res=await fetch('./examples/'+file+'?v='+Date.now());
    if(!res.ok) throw new Error('HTTP '+res.status);
    const json=await res.text();
    loadFromJSON(json);
  } catch(e){
    alert('Impossible de charger l\'exemple: '+e.message);
  }
  examplesSelect.value=''; // reset
});

loadExamplesIndex();
