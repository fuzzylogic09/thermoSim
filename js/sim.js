// ═══════════════════════════════════════════
// SIMULATION ENGINE
// ═══════════════════════════════════════════
'use strict';

// C_* constants defined in geo.js (loaded first)

let Lx=5, Ly=5, Nx=64, Ny=64, dx, dy;
function computeDxDy(){ dx=Lx/Nx; dy=Ly/Ny; }
computeDxDy();

let BC = { top:'wall', bottom:'wall', left:'wall', right:'wall' };
const BC_CYCLE  = ['wall','open','sym'];
const BC_LABEL  = { wall:'Mur', open:'Ouvert', sym:'Symétrie' };
const BC_CLASS  = { wall:'bc-wall', open:'bc-open', sym:'bc-sym' };

let U,V,U0,V0,T,T0,pres,divg,cellType;
function allocArrays(){
  const s=(Nx+2)*(Ny+2);
  U=new Float32Array(s); V=new Float32Array(s);
  U0=new Float32Array(s); V0=new Float32Array(s);
  T=new Float32Array(s); T0=new Float32Array(s);
  pres=new Float32Array(s); divg=new Float32Array(s);
  cellType=new Uint8Array(s);
}
allocArrays();
function idx(i,j){ return i*(Ny+2)+j; }

let P = {
  visc:1.516e-5, diff:2.13e-5, beta:3.41e-3,
  gravity:9.81, T_amb:20,
  cfl:0.5, spf:2, iter:20, sim_speed:1.0
};

let simTime=0, dt_cur=0.01;

function computeDt(vmax){
  // maxFanSpeed() from geo.js
  const fanRef = maxFanSpeed();
  const v = Math.max(vmax, fanRef, 0.01);
  return Math.max(1e-6, P.cfl*Math.min(dx,dy)/v*P.sim_speed);
}

// ── BOUNDARY CONDITIONS ────────────────────────────────────────────
function applyBoundaryConditions(){
  for(let i=1;i<=Nx;i++){
    const jt=1;
    switch(BC.top){
      case'wall': U[idx(i,0)]=-U[idx(i,jt)]; V[idx(i,0)]=0;  T[idx(i,0)]=T[idx(i,jt)]; break;
      case'open': U[idx(i,0)]=U[idx(i,jt)];  V[idx(i,0)]=Math.min(0,V[idx(i,jt)]); T[idx(i,0)]=P.T_amb; break;
      case'sym':  U[idx(i,0)]=U[idx(i,jt)];  V[idx(i,0)]=-V[idx(i,jt)]; T[idx(i,0)]=T[idx(i,jt)]; break;
    }
    const jb=Ny;
    switch(BC.bottom){
      case'wall': U[idx(i,Ny+1)]=-U[idx(i,jb)]; V[idx(i,Ny+1)]=0; T[idx(i,Ny+1)]=T[idx(i,jb)]; break;
      case'open': U[idx(i,Ny+1)]=U[idx(i,jb)];  V[idx(i,Ny+1)]=Math.max(0,V[idx(i,jb)]); T[idx(i,Ny+1)]=P.T_amb; break;
      case'sym':  U[idx(i,Ny+1)]=U[idx(i,jb)];  V[idx(i,Ny+1)]=-V[idx(i,jb)]; T[idx(i,Ny+1)]=T[idx(i,jb)]; break;
    }
  }
  for(let j=1;j<=Ny;j++){
    const il=1;
    switch(BC.left){
      case'wall': U[idx(0,j)]=0;  V[idx(0,j)]=-V[idx(il,j)]; T[idx(0,j)]=T[idx(il,j)]; break;
      case'open': U[idx(0,j)]=Math.min(0,U[idx(il,j)]); V[idx(0,j)]=V[idx(il,j)]; T[idx(0,j)]=P.T_amb; break;
      case'sym':  U[idx(0,j)]=-U[idx(il,j)]; V[idx(0,j)]=V[idx(il,j)]; T[idx(0,j)]=T[idx(il,j)]; break;
    }
    const ir=Nx;
    switch(BC.right){
      case'wall': U[idx(Nx+1,j)]=0; V[idx(Nx+1,j)]=-V[idx(ir,j)]; T[idx(Nx+1,j)]=T[idx(ir,j)]; break;
      case'open': U[idx(Nx+1,j)]=Math.max(0,U[idx(ir,j)]); V[idx(Nx+1,j)]=V[idx(ir,j)]; T[idx(Nx+1,j)]=P.T_amb; break;
      case'sym':  U[idx(Nx+1,j)]=-U[idx(ir,j)]; V[idx(Nx+1,j)]=V[idx(ir,j)]; T[idx(Nx+1,j)]=T[idx(ir,j)]; break;
    }
  }
}

// Per-cell fan velocity maps (built from geo objects, updated on rebuildFromGeo)
let _fanU=null, _fanV=null;
function buildFanMap(){
  const s=(Nx+2)*(Ny+2);
  _fanU=new Float32Array(s); _fanV=new Float32Array(s);
  function physToCell(px,py){
    return [Math.max(1,Math.min(Nx,Math.floor(px/dx)+1)),
            Math.max(1,Math.min(Ny,Math.floor((Ly-py)/dy)+1))];
  }
  for(const obj of geoObjects){
    if(!obj.visible||obj.type!=='fan') continue;
    const dir=obj.props.direction||'right';
    const spd=obj.props.speed??2.0;
    const angleDeg=obj.props.angleDeg??null;
    let fu,fv;
    if(angleDeg!==null){
      const rad=angleDeg*Math.PI/180;
      fu=spd*Math.cos(rad); fv=-spd*Math.sin(rad); // y-down in grid
    } else {
      fu=0; fv=0;
      if(dir==='right') fu= spd; if(dir==='left') fu=-spd;
      if(dir==='up')    fv=-spd; if(dir==='down') fv= spd;
    }
    const [i0,j1]=physToCell(obj.x0,obj.y1);
    const [i1,j0]=physToCell(obj.x1,obj.y0);
    for(let i=Math.min(i0,i1);i<=Math.max(i0,i1);i++)
      for(let j=Math.min(j0,j1);j<=Math.max(j0,j1);j++){
        if(i<1||i>Nx||j<1||j>Ny) continue;
        const ix=i*(Ny+2)+j;
        _fanU[ix]=fu; _fanV[ix]=fv;
      }
  }
}

// Per-cell source temperature maps
let _srcT=null; // temperature imposed at each source cell (C_HOT / C_COLD)
function buildSrcTMap(){
  const s=(Nx+2)*(Ny+2);
  _srcT=new Float32Array(s);
  _srcT.fill(NaN); // NaN = not a source cell
  function physToCell(px,py){
    return [Math.max(1,Math.min(Nx,Math.floor(px/dx)+1)),
            Math.max(1,Math.min(Ny,Math.floor((Ly-py)/dy)+1))];
  }
  for(const obj of geoObjects){
    if(!obj.visible||(obj.type!=='source'&&obj.type!=='hot'&&obj.type!=='cold')) continue;
    const t=obj.props.temperature??20;
    const [i0,j1]=physToCell(obj.x0,obj.y1);
    const [i1,j0]=physToCell(obj.x1,obj.y0);
    for(let i=Math.min(i0,i1);i<=Math.max(i0,i1);i++)
      for(let j=Math.min(j0,j1);j<=Math.max(j0,j1);j++){
        if(i<1||i>Nx||j<1||j>Ny) continue;
        const ix=i*(Ny+2)+j;
        // Circle check
        if(obj.shape==='circle'){
          const cxp=(obj.x0+obj.x1)/2, cyp=(obj.y0+obj.y1)/2;
          const rp=obj.radius??Math.min(obj.x1-obj.x0,obj.y1-obj.y0)/2;
          const ci=cxp/dx+0.5, cj=(Ly-cyp)/dy+0.5;
          const ri=rp/dx, rj=rp/dy;
          if((i-ci)**2/ri**2+(j-cj)**2/rj**2>1) continue;
        }
        _srcT[ix]=t;
      }
  }
}

function applyInternalBC(){
  for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
    const c=cellType[idx(i,j)];
    if(c===C_WALL){ U[idx(i,j)]=0; V[idx(i,j)]=0; }
    else if(c===C_HOT||c===C_COLD){
      const t=_srcT?.[idx(i,j)];
      if(!isNaN(t)) T[idx(i,j)]=t;
      U[idx(i,j)]=0; V[idx(i,j)]=0;
    }
    else if(c>=C_FAN_R&&c<=C_FAN_D&&_fanU){
      U[idx(i,j)]=_fanU[idx(i,j)];
      V[idx(i,j)]=_fanV[idx(i,j)];
    }
  }
}

function applyAllBC(){ applyBoundaryConditions(); applyInternalBC(); }

// ── SOLVERS ────────────────────────────────────────────────────────
// For temperature: wall cells are FROZEN (not updated) and act as zero-flux
// by virtue of nbr() returning the fluid cell's own value at wall faces.
// This prevents walls from conducting heat themselves.
function nbr(x,ii,jj,selfVal){
  return cellType[idx(ii,jj)]===C_WALL ? selfVal : x[idx(ii,jj)];
}

function linSolve(x,x0,ax,ay,iters,isTemp){
  const c=1+2*ax+2*ay, cR=1/c;
  for(let k=0;k<iters;k++){
    for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
      const ct=cellType[idx(i,j)];
      if(ct===C_WALL){
        if(!isTemp) x[idx(i,j)]=0;
        // For temperature: wall cells are NOT updated here at all.
        // Their value is irrelevant since nbr() never uses them.
        continue;
      }
      if(ct===C_HOT||ct===C_COLD){
        // Source cells: temperature is Dirichlet (fixed), skip diffusion
        if(isTemp) continue;
        x[idx(i,j)]=0; continue;
      }
      if(isTemp){
        const self=x[idx(i,j)];
        x[idx(i,j)]=(x0[idx(i,j)]
          +ax*(nbr(x,i+1,j,self)+nbr(x,i-1,j,self))
          +ay*(nbr(x,i,j+1,self)+nbr(x,i,j-1,self)))*cR;
      } else {
        x[idx(i,j)]=(x0[idx(i,j)]
          +ax*(x[idx(i+1,j)]+x[idx(i-1,j)])
          +ay*(x[idx(i,j+1)]+x[idx(i,j-1)]))*cR;
      }
    }
    applyBoundaryConditions();
  }
}

function diffuse(x,x0,coeff,dt,isTemp=false){
  const ax=dt*coeff/(dx*dx), ay=dt*coeff/(dy*dy);
  linSolve(x,x0,ax,ay,P.iter,isTemp);
}

function sampleField(d0,x,y){
  x=Math.max(.5,Math.min(Nx+.5,x));
  y=Math.max(.5,Math.min(Ny+.5,y));
  const i0=Math.floor(x),i1=Math.min(i0+1,Nx+1);
  const j0=Math.floor(y),j1=Math.min(j0+1,Ny+1);
  const s1=x-i0,s0=1-s1,t1=y-j0,t0=1-t1;
  const corners=[[i0,j0,s0*t0],[i0,j1,s0*t1],[i1,j0,s1*t0],[i1,j1,s1*t1]];
  let sum=0,wsum=0;
  for(const[ci,cj,w] of corners){
    if(ci>=1&&ci<=Nx&&cj>=1&&cj<=Ny&&cellType[idx(ci,cj)]===C_WALL) continue;
    sum+=d0[idx(ci,cj)]*w; wsum+=w;
  }
  if(wsum<1e-9) return d0[idx(Math.round(x),Math.round(y))];
  return sum/wsum;
}

function advect(d,d0,u,v,dt,isTemp=false){
  const dtx=dt/dx, dty=dt/dy;
  for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
    const ct=cellType[idx(i,j)];
    if(ct===C_WALL) continue;
    // Source cells: temperature is fixed, don't advect
    if(isTemp&&(ct===C_HOT||ct===C_COLD)) continue;
    const bx=i-dtx*u[idx(i,j)], by=j-dty*v[idx(i,j)];
    if(isTemp){
      d[idx(i,j)]=sampleField(d0,bx,by);
    } else {
      const x=Math.max(.5,Math.min(Nx+.5,bx)),y=Math.max(.5,Math.min(Ny+.5,by));
      const i0=Math.floor(x),i1=i0+1,j0=Math.floor(y),j1=j0+1;
      const s1=x-i0,s0=1-s1,t1=y-j0,t0=1-t1;
      d[idx(i,j)]=s0*(t0*d0[idx(i0,j0)]+t1*d0[idx(i0,j1)])+s1*(t0*d0[idx(i1,j0)]+t1*d0[idx(i1,j1)]);
    }
  }
  applyBoundaryConditions();
}

function project(u,v,p,dv){
  const ax=1/(dx*dx),ay=1/(dy*dy),c=2*(ax+ay);
  for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
    dv[idx(i,j)]=-.5*((u[idx(i+1,j)]-u[idx(i-1,j)])/dx+(v[idx(i,j+1)]-v[idx(i,j-1)])/dy);
    p[idx(i,j)]=0;
  }
  applyBoundaryConditions();
  for(let k=0;k<P.iter;k++){
    for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++)
      p[idx(i,j)]=(dv[idx(i,j)]+ax*(p[idx(i+1,j)]+p[idx(i-1,j)])+ay*(p[idx(i,j+1)]+p[idx(i,j-1)]))/c;
    applyBoundaryConditions();
  }
  for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
    if(cellType[idx(i,j)]===C_WALL) continue;
    u[idx(i,j)]-=.5*(p[idx(i+1,j)]-p[idx(i-1,j)])/dx;
    v[idx(i,j)]-=.5*(p[idx(i,j+1)]-p[idx(i,j-1)])/dy;
  }
  applyBoundaryConditions();
}

function buoyancy(v,T,dt){
  const g=P.gravity, b=P.beta, Ta=P.T_amb;
  for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
    if(cellType[idx(i,j)]!==C_FLUID) continue;
    v[idx(i,j)]+=dt*(-g*b*(T[idx(i,j)]-Ta));
  }
}

function simStep(dt){
  applyAllBC();
  buoyancy(V,T,dt);
  U0.set(U); V0.set(V);
  diffuse(U,U0,P.visc,dt); diffuse(V,V0,P.visc,dt);
  project(U,V,pres,divg);
  U0.set(U); V0.set(V);
  advect(U,U0,U0,V0,dt); advect(V,V0,U0,V0,dt);
  project(U,V,pres,divg);
  applyAllBC();
  T0.set(T); diffuse(T,T0,P.diff,dt,true);
  T0.set(T); advect(T,T0,U,V,dt,true);
  applyAllBC(); // re-enforces source temperatures
}

// ── STATS ─────────────────────────────────────────────────────────
let simStats={tMin:0,tMax:100,vMax:0,vAvg:0};
function gatherStats(){
  let tMin=Infinity,tMax=-Infinity,vMax=0,vSum=0,n=0;
  for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
    const t=T[idx(i,j)];
    if(t<tMin)tMin=t; if(t>tMax)tMax=t;
    const sp=Math.hypot(U[idx(i,j)],V[idx(i,j)]);
    if(sp>vMax)vMax=sp; vSum+=sp; n++;
  }
  if(!isFinite(tMin)){tMin=0;tMax=100;}
  if(tMax===tMin) tMax=tMin+1;
  simStats={tMin,tMax,vMax,vAvg:n?vSum/n:0};
}

// ── DOMAIN & REBUILD ──────────────────────────────────────────────
function applyDomain(lx,ly,nx,ny){
  Lx=lx; Ly=ly; Nx=nx; Ny=ny; computeDxDy(); allocArrays();
}

function resetFields(){
  T.fill(P.T_amb); T0.fill(P.T_amb);
  U.fill(0); V.fill(0); U0.fill(0); V0.fill(0);
  pres.fill(0); divg.fill(0);
  simTime=0;
}

let _hotT=null, _coldT=null; // legacy — kept for backward compat refs

function rebuildFromGeo(){
  resetFields();
  rasterizeGeoObjects(cellType,T,U,V,Nx,Ny,dx,dy,Ly,P);
  buildFanMap();
  buildSrcTMap();
  // Apply source temperatures to T array
  if(_srcT){
    for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
      const t=_srcT[idx(i,j)];
      if(!isNaN(t)) T[idx(i,j)]=t;
    }
  }
  applyAllBC();
}
