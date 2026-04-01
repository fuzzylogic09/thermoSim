// ═══════════════════════════════════════════
// RENDERER
// ═══════════════════════════════════════════
'use strict';

let W, H, cellPx, zoom=1, panX=0, panY=0, vizMode='temp';

const wrap   = document.getElementById('canvas-wrap');
const canvas = document.getElementById('sim-canvas');
const ctx    = canvas.getContext('2d');
const rcv    = document.getElementById('ruler-canvas');
const rctx   = rcv.getContext('2d');

function resizeCanvas(){
  const r = wrap.getBoundingClientRect();
  W = r.width; H = r.height;
  [canvas, rcv].forEach(c => {
    c.width  = W; c.height  = H;
    c.style.width  = W + 'px'; c.style.height = H + 'px';
  });
  cellPx = Math.min(W, H) / Math.max(Nx, Ny);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function getGeo(){
  const gw=Nx*cellPx*zoom, gh=Ny*cellPx*zoom;
  return { gw, gh, ox:(W-gw)/2+panX, oy:(H-gh)/2+panY };
}

// ── COLOUR MAPPING ────────────────────────────────────────────────
function tempRGB(t, lo, hi){
  let v = Math.max(0, Math.min(1, (t-lo)/(hi-lo)));
  const S = [
    [0,   [0,0,128]],
    [.18, [0,25,220]],
    [.38, [0,210,220]],
    [.5,  [0,170,0]],
    [.65, [255,215,0]],
    [.82, [255,90,0]],
    [1,   [200,0,0]],
  ];
  let a=S[0], b=S[S.length-1];
  for(let k=0;k<S.length-1;k++) if(v>=S[k][0]&&v<=S[k+1][0]){ a=S[k]; b=S[k+1]; break; }
  const f=(v-a[0])/(b[0]-a[0]);
  return [
    a[1][0]+(b[1][0]-a[1][0])*f,
    a[1][1]+(b[1][1]-a[1][1])*f,
    a[1][2]+(b[1][2]-a[1][2])*f,
  ];
}

const offC = document.createElement('canvas');
let offCtx;
function ensureOff(){
  if(offC.width!==Nx||offC.height!==Ny){ offC.width=Nx; offC.height=Ny; offCtx=offC.getContext('2d'); }
}

// ── RULERS ────────────────────────────────────────────────────────
function niceStep(range, ticks){
  const r=range/ticks, m=Math.pow(10,Math.floor(Math.log10(r)));
  for(const f of [1,2,2.5,5,10]) if(f*m>=r) return f*m;
  return m;
}
function fmtM(v){
  if(Math.abs(v)>=100) return v.toFixed(0);
  if(Math.abs(v)>=10)  return v.toFixed(1);
  if(Math.abs(v)>=1)   return v.toFixed(2);
  if(Math.abs(v)>=.1)  return v.toFixed(3);
  return v.toExponential(2);
}
function fmtTime(s){
  if(s<60)   return s.toFixed(2)+' s';
  if(s<3600) return (s/60).toFixed(2)+' min';
  return (s/3600).toFixed(3)+' h';
}

function drawRulers(ox,oy,gw,gh){
  rctx.clearRect(0,0,W,H);
  rctx.font='8px DM Sans'; rctx.fillStyle='rgba(122,128,153,.8)';
  rctx.strokeStyle='rgba(232,160,32,.15)'; rctx.lineWidth=.5;
  const sx=niceStep(Lx,Math.max(4,Math.floor(gw/60)));
  const sy=niceStep(Ly,Math.max(4,Math.floor(gh/35)));
  for(let m=0;m<=Lx+1e-9;m+=sx){
    const px=ox+m/Lx*gw; if(px<ox-1||px>ox+gw+1) continue;
    rctx.beginPath(); rctx.moveTo(px,oy+gh); rctx.lineTo(px,oy+gh+5); rctx.stroke();
    rctx.textAlign='center'; rctx.fillText(fmtM(m)+'m', px-12, oy+gh+13);
  }
  for(let m=0;m<=Ly+1e-9;m+=sy){
    const py=oy+m/Ly*gh; if(py<oy-1||py>oy+gh+1) continue;
    rctx.beginPath(); rctx.moveTo(ox-5,py); rctx.lineTo(ox,py); rctx.stroke();
    rctx.textAlign='right'; rctx.fillText(fmtM(Ly-m)+'m', ox-7, py+3); rctx.textAlign='left';
  }
}

// ── GEO OBJECT OVERLAYS ───────────────────────────────────────────
function drawGeoOverlays(ox,oy,gw,gh){
  // Draw outlines of geo objects on canvas
  ctx.save();
  ctx.lineWidth=1;
  for(const obj of geoObjects){
    if(!obj.visible) continue;
    const color = typeColor(obj.type);
    ctx.strokeStyle = color + 'cc';
    ctx.setLineDash([3,3]);
    if(obj.shape==='circle'){
      const cxS = ox + ((obj.x0+obj.x1)/2/Lx)*gw;
      const cyS = oy + ((Ly-(obj.y0+obj.y1)/2)/Ly)*gh;
      const r_phys = obj.radius ?? Math.min(obj.x1-obj.x0,obj.y1-obj.y0)/2;
      const rS  = r_phys/Lx*gw;
      ctx.beginPath(); ctx.arc(cxS,cyS,rS,0,Math.PI*2); ctx.stroke();
    } else {
      const x0S = ox + obj.x0/Lx*gw;
      const y0S = oy + (Ly-obj.y1)/Ly*gh; // top in screen
      const wS  = (obj.x1-obj.x0)/Lx*gw;
      const hS  = (obj.y1-obj.y0)/Ly*gh;
      ctx.strokeRect(x0S, y0S, wS, hS);
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// ── MAIN RENDER ───────────────────────────────────────────────────
function render(){
  ensureOff();
  const { tMin, tMax, vMax } = simStats;
  const { gw, gh, ox, oy } = getGeo();

  ctx.fillStyle='#020208'; ctx.fillRect(0,0,W,H);

  if(vizMode!=='vel'){
    const img=offCtx.getImageData(0,0,Nx,Ny);
    const d=img.data;
    for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
      const ct=cellType[idx(i,j)];
      const px=((j-1)*Nx+(i-1))*4;
      if(ct===C_WALL){
        d[px]=52; d[px+1]=56; d[px+2]=72; d[px+3]=255;
      } else {
        const[r,g,b]=tempRGB(T[idx(i,j)],tMin,tMax);
        d[px]=r; d[px+1]=g; d[px+2]=b; d[px+3]=255;
        if(ct>=C_FAN_R){ d[px]=70; d[px+1]=30; d[px+2]=170; }
      }
    }
    offCtx.putImageData(img,0,0);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(offC,ox,oy,gw,gh);
  } else {
    ctx.fillStyle='#040414'; ctx.fillRect(ox,oy,gw,gh);
  }

  if(vizMode==='vel'||vizMode==='both'){
    const st=Math.max(3,Math.floor(7/zoom));
    for(let i=st;i<=Nx;i+=st) for(let j=st;j<=Ny;j+=st){
      const u=U[idx(i,j)],v=V[idx(i,j)],sp=Math.hypot(u,v);
      if(sp<.0005) continue;
      const cx=ox+(i-.5)/Nx*gw, cy=oy+(j-.5)/Ny*gh;
      const ml=cellPx*zoom*st*.42, sc=Math.min(ml,sp/Math.max(vMax,.01)*ml+ml*.1);
      const nx=u/sp, ny=v/sp, al=Math.min(.9,sp/Math.max(vMax,.01)*.7+.2);
      ctx.globalAlpha=al; ctx.strokeStyle='#fff'; ctx.lineWidth=.8;
      ctx.beginPath();
      ctx.moveTo(cx-nx*sc*.45,cy-ny*sc*.45);
      ctx.lineTo(cx+nx*sc*.55,cy+ny*sc*.55);
      ctx.stroke();
      const ax=cx+nx*sc*.55, ay=cy+ny*sc*.55, pw=sc*.26;
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(ax,ay);
      ctx.lineTo(ax-nx*pw-ny*pw*.5,ay-ny*pw+nx*pw*.5);
      ctx.lineTo(ax-nx*pw+ny*pw*.5,ay-ny*pw-nx*pw*.5);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  if(vizMode==='stream'){
    ctx.strokeStyle='rgba(170,200,255,.35)'; ctx.lineWidth=.6;
    for(let s=0;s<35;s++){
      let x=1+Math.random()*(Nx-2), y=1+Math.random()*(Ny-2);
      ctx.beginPath();
      for(let l=0;l<90;l++){
        const ii=Math.max(1,Math.min(Nx,Math.round(x))), jj=Math.max(1,Math.min(Ny,Math.round(y)));
        if(cellType[idx(ii,jj)]===C_WALL) break;
        const u=U[idx(ii,jj)], v=V[idx(ii,jj)], sp=Math.hypot(u,v);
        if(sp<.002) break;
        const px=ox+(x-.5)/Nx*gw, py=oy+(y-.5)/Ny*gh;
        l===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
        x+=u/sp*.35; y+=v/sp*.35;
        if(x<1||x>Nx||y<1||y>Ny) break;
      }
      ctx.stroke();
    }
  }

  // Geo outlines on top
  if(zoom>1) drawGeoOverlays(ox,oy,gw,gh);

  // Icons when zoomed in
  if(zoom>2){
    const fnL={[C_HOT]:'🔥',[C_COLD]:'❄️',[C_FAN_R]:'→',[C_FAN_L]:'←',[C_FAN_U]:'↑',[C_FAN_D]:'↓'};
    ctx.font=`${Math.min(12,cellPx*zoom*.42)}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    for(let i=1;i<=Nx;i++) for(let j=1;j<=Ny;j++){
      const ct=cellType[idx(i,j)]; if(ct===C_FLUID||ct===C_WALL) continue;
      ctx.fillText(fnL[ct]||'', ox+(i-.5)/Nx*gw, oy+(j-.5)/Ny*gh);
    }
  }

  // Grid lines
  if(zoom>4&&cellPx*zoom>14){
    ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=.4;
    for(let i=0;i<=Nx;i++){
      const x=ox+i/Nx*gw; ctx.beginPath(); ctx.moveTo(x,oy); ctx.lineTo(x,oy+gh); ctx.stroke();
    }
    for(let j=0;j<=Ny;j++){
      const y=oy+j/Ny*gh; ctx.beginPath(); ctx.moveTo(ox,y); ctx.lineTo(ox+gw,y); ctx.stroke();
    }
  }

  // Domain border
  ctx.strokeStyle='rgba(232,160,32,.25)'; ctx.lineWidth=1.5;
  ctx.strokeRect(ox,oy,gw,gh);

  drawRulers(ox,oy,gw,gh);
}
