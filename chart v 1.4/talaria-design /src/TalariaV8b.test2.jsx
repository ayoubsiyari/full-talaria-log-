import { useState, useEffect, useRef } from "react";

// ── Color utilities ──────────────────────────────────────────────────────────
function parseColor(str) {
  if (!str) return { r:255, g:255, b:255, a:1 };
  if (str.startsWith('#')) {
    const h = str.length===4 ? '#'+str[1]+str[1]+str[2]+str[2]+str[3]+str[3] : str;
    return { r:parseInt(h.slice(1,3),16), g:parseInt(h.slice(3,5),16), b:parseInt(h.slice(5,7),16), a:1 };
  }
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) return { r:+m[1], g:+m[2], b:+m[3], a: m[4]!=null ? +m[4] : 1 };
  return { r:255, g:255, b:255, a:1 };
}
function rgbToHsv(r, g, b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0, s=max===0?0:d/max, v=max;
  if (d) { if(max===r) h=(g-b)/d+(g<b?6:0); else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4; h/=6; }
  return { h:h*360, s, v };
}
function hsvToRgb(h, s, v) {
  h/=360;
  const i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  let r,g,b;
  switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;default:r=v;g=p;b=q;}
  return { r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) };
}
const toHex2 = n => Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
function cpBuildColor(r, g, b, a) {
  return a>=1 ? `#${toHex2(r)}${toHex2(g)}${toHex2(b)}` : `rgba(${r},${g},${b},${+a.toFixed(2)})`;
}

// ── Color Picker Popup ───────────────────────────────────────────────────────
const ColorPickerPopup = ({ pos, h, s, v, a, hexStr, c, F, onSVChange, onHChange, onAChange, onHexChange, onClose, onDragStart }) => {
  const rgb = hsvToRgb(h, s, v);
  const solidColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  const hueColor = `hsl(${h},100%,50%)`;
  const outColor = cpBuildColor(rgb.r, rgb.g, rgb.b, a);
  return (
    <div className="tlr-cp" data-sdrop="1" onClick={e=>e.stopPropagation()} style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9200,width:210,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 20px 56px rgba(0,0,0,0.92), 0 0 20px rgba(38,67,247,0.1)`,fontFamily:F}}>
      <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
      <div style={{padding:10}}>
        {/* SV square */}
        <div
          onMouseDown={(e)=>{ const r=e.currentTarget.getBoundingClientRect(); const ns=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), nv=1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)); onSVChange(ns,nv); onDragStart('sv',r); }}
          style={{width:"100%",height:130,position:"relative",marginBottom:9,cursor:"crosshair",userSelect:"none",
            background:`linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 100%), linear-gradient(to right, #fff 0%, ${hueColor} 100%)`}}>
          <div style={{position:"absolute",left:`calc(${s*100}% - 5px)`,top:`calc(${(1-v)*100}% - 5px)`,width:10,height:10,borderRadius:"50%",border:"2px solid #fff",background:solidColor,boxShadow:"0 0 4px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,0,0,0.4)",pointerEvents:"none"}}/>
        </div>
        {/* Hue slider */}
        <div style={{marginBottom:7}}>
          <div style={{fontSize:7,color:c.tm,marginBottom:3,letterSpacing:"0.07em",fontWeight:700}}>HUE</div>
          <div
            onMouseDown={(e)=>{ const r=e.currentTarget.getBoundingClientRect(); onHChange(Math.max(0,Math.min(360,((e.clientX-r.left)/r.width)*360))); onDragStart('hue',r); }}
            style={{position:"relative",height:11,background:"linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",border:`1px solid ${c.brH}`,cursor:"ew-resize",userSelect:"none"}}>
            <div style={{position:"absolute",top:-1,bottom:-1,left:`calc(${(h/360)*100}% - 5px)`,width:10,background:hueColor,border:"2px solid #fff",boxShadow:"0 0 4px rgba(0,0,0,0.8)",pointerEvents:"none"}}/>
          </div>
        </div>
        {/* Alpha slider */}
        <div style={{marginBottom:9}}>
          <div style={{fontSize:7,color:c.tm,marginBottom:3,letterSpacing:"0.07em",fontWeight:700}}>OPACITY</div>
          <div
            onMouseDown={(e)=>{ const r=e.currentTarget.getBoundingClientRect(); onAChange(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))); onDragStart('alpha',r); }}
            style={{position:"relative",height:11,background:`linear-gradient(to right, transparent, ${solidColor}), repeating-conic-gradient(rgba(140,160,255,0.08) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px`,border:`1px solid ${c.brH}`,cursor:"ew-resize",userSelect:"none"}}>
            <div style={{position:"absolute",top:-1,bottom:-1,left:`calc(${a*100}% - 5px)`,width:10,background:solidColor,border:"2px solid #fff",boxShadow:"0 0 4px rgba(0,0,0,0.8)",pointerEvents:"none"}}/>
          </div>
        </div>
        {/* Preview + hex + alpha% */}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{width:22,height:22,background:outColor,border:`1px solid ${c.brH}`,flexShrink:0}}/>
          <div style={{flex:1,display:"flex",alignItems:"center",background:c.well,border:`1px solid ${c.br}`,padding:"3px 6px"}}>
            <span style={{fontSize:8,color:c.tm,marginRight:2,fontFamily:F}}>#</span>
            <input value={hexStr} onChange={e=>onHexChange(e.target.value.replace(/[^0-9a-fA-F]/g,'').slice(0,6))}
              style={{background:"transparent",border:"none",color:c.tx,fontSize:9,fontFamily:F,width:"100%",outline:"none",fontVariantNumeric:"tabular-nums"}}/>
          </div>
          <span style={{fontSize:9,color:c.ts,minWidth:30,textAlign:"right",fontFamily:F,fontVariantNumeric:"tabular-nums",fontWeight:600}}>{Math.round(a*100)}%</span>
        </div>
      </div>
      <div style={{padding:"5px 10px",borderTop:`1px solid ${c.br}`,display:"flex",justifyContent:"flex-end"}}>
        <div onClick={onClose} style={{fontSize:8,color:c.acL,cursor:"pointer",fontWeight:800,fontFamily:F,padding:"2px 6px",letterSpacing:"0.05em"}}>DONE</div>
      </div>
    </div>
  );
};

const Toggle = ({ on, onClick, color, hk, c, swHov, setSwHov }) => {
  const tC = color || c.acL;
  const isH = hk ? swHov === hk : false;
  return (
    <div onClick={onClick}
      onMouseEnter={hk ? ()=>setSwHov(hk) : undefined}
      onMouseLeave={hk ? ()=>setSwHov(null) : undefined}
      style={{ width: 28, height: 14, borderRadius: 7, background: on ? `${tC}33` : isH ? "rgba(140,160,255,0.10)" : "rgba(140,160,255,0.06)", border: `1px solid ${on ? tC+"66" : isH ? "rgba(140,160,255,0.35)" : "rgba(140,160,255,0.22)"}`, position: "relative", cursor: "pointer", transition: "background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease", boxShadow: isH ? `0 0 8px ${on ? tC+"55" : "rgba(140,160,255,0.08)"}` : "none" }}>
      <div style={{ width: 10, height: 10, borderRadius: 5, background: on ? tC : isH ? c.tx : "rgba(140,160,255,0.55)", position: "absolute", top: 1, left: on ? 14 : 2, transition: "left 0.22s cubic-bezier(0.34,1.56,0.64,1), background 0.18s ease", boxShadow: on && isH ? `0 0 6px ${tC}` : "none" }}/>
    </div>
  );
};

const currencyCountry = { EUR: "EU", JPY: "JP", USD: "US", GBP: "GB", AUD: "AU", CAD: "CA", CHF: "CH", NZD: "NZ" };

const SYMBOLS_DATA = [
  { cat:"FOREX", items:[
    {id:"EUR/JPY",name:"Euro / Yen",type:"forex",base:"EUR",quote:"JPY"},
    {id:"EUR/USD",name:"Euro / Dollar",type:"forex",base:"EUR",quote:"USD"},
    {id:"GBP/USD",name:"Pound / Dollar",type:"forex",base:"GBP",quote:"USD"},
    {id:"USD/JPY",name:"Dollar / Yen",type:"forex",base:"USD",quote:"JPY"},
    {id:"AUD/USD",name:"Aussie / Dollar",type:"forex",base:"AUD",quote:"USD"},
    {id:"USD/CAD",name:"Dollar / CAD",type:"forex",base:"USD",quote:"CAD"},
    {id:"GBP/JPY",name:"Pound / Yen",type:"forex",base:"GBP",quote:"JPY"},
    {id:"AUD/JPY",name:"Aussie / Yen",type:"forex",base:"AUD",quote:"JPY"},
    {id:"NZD/USD",name:"Kiwi / Dollar",type:"forex",base:"NZD",quote:"USD"},
    {id:"USD/CHF",name:"Dollar / Franc",type:"forex",base:"USD",quote:"CHF"},
    {id:"EUR/GBP",name:"Euro / Pound",type:"forex",base:"EUR",quote:"GBP"},
  ]},
  { cat:"FUTURES", items:[
    {id:"ES",name:"S&P 500 Futures",type:"futures",col:"#5B8CFF",bg:"rgba(74,106,255,0.28)"},
    {id:"NQ",name:"Nasdaq 100 Futures",type:"futures",col:"#26C6DA",bg:"rgba(38,198,218,0.22)"},
    {id:"GC",name:"Gold Futures",type:"futures",col:"#FFD54F",bg:"rgba(255,213,79,0.22)"},
  ]},
  { cat:"COMMODITIES", items:[
    {id:"XAUUSD",name:"Gold Spot",type:"commodity",col:"#FFD700",bg:"rgba(255,215,0,0.20)"},
  ]},
  { cat:"STOCKS", items:[
    {id:"AAPL",name:"Apple Inc.",type:"stock",col:"#C8C9CA",bg:"rgba(200,201,202,0.18)"},
    {id:"TSLA",name:"Tesla Inc.",type:"stock",col:"#E82127",bg:"rgba(232,33,39,0.22)"},
  ]},
  { cat:"CRYPTO", items:[
    {id:"BTCUSDT",name:"Bitcoin / Tether",type:"crypto",col:"#F7931A",bg:"rgba(247,147,26,0.22)"},
    {id:"ETHUSDT",name:"Ethereum / Tether",type:"crypto",col:"#627EEA",bg:"rgba(98,126,234,0.22)"},
  ]},
];

const SymBadge = ({ sym, w=18, h=12 }) => {
  const cx=w/2, cy=h/2, uid=`${sym.id}-${w}`;
  /* ── Bitcoin ── */
  if (sym.id==="BTCUSDT") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
      <defs><radialGradient id={`bg-${uid}`} cx="40%" cy="35%"><stop offset="0%" stopColor="#FFAC33"/><stop offset="100%" stopColor="#E8820C"/></radialGradient></defs>
      <circle cx={cx} cy={cy} r={Math.min(cx,cy)-0.3} fill={`url(#bg-${uid})`}/>
      <text x={cx+w*0.02} y={cy+h*0.24} textAnchor="middle" fill="#fff" fontSize={h*0.62} fontWeight="900" fontFamily="Arial,sans-serif" letterSpacing="-0.5">₿</text>
    </svg>
  );
  /* ── Ethereum ── */
  if (sym.id==="ETHUSDT") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
      <defs><linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1A1E3C"/><stop offset="100%" stopColor="#111628"/></linearGradient></defs>
      <rect width={w} height={h} rx={2} fill={`url(#bg-${uid})`}/>
      <polygon points={`${cx},${h*0.08} ${cx+w*0.3},${cy-h*0.04} ${cx},${h*0.63} ${cx-w*0.3},${cy-h*0.04}`} fill="#627EEA"/>
      <polygon points={`${cx},${h*0.63} ${cx+w*0.3},${cy-h*0.04} ${cx},${h*0.92}`} fill="#B0C0F5" opacity={0.75}/>
      <polygon points={`${cx},${h*0.63} ${cx-w*0.3},${cy-h*0.04} ${cx},${h*0.92}`} fill="#4A62D8" opacity={0.85}/>
    </svg>
  );
  /* ── Apple ── */
  if (sym.id==="AAPL") {
    const bx=cx, by=cy+h*0.06, br=h*0.44;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
        <rect width={w} height={h} rx={2} fill="#2A2B2E"/>
        <clipPath id={`cp-${uid}`}><rect width={w} height={h} rx={2}/></clipPath>
        <g clipPath={`url(#cp-${uid})`}>
          {/* apple body */}
          <ellipse cx={bx} cy={by} rx={br*0.85} ry={br} fill="#C8C9CA"/>
          {/* bite out of upper right */}
          <circle cx={bx+br*0.72} cy={by-br*0.55} r={br*0.52} fill="#2A2B2E"/>
          {/* top indent between lobes */}
          <circle cx={bx} cy={by-br*0.96} r={br*0.28} fill="#2A2B2E"/>
          {/* stem */}
          <path d={`M${bx+br*0.08},${by-br} C${bx+br*0.15},${by-br*1.4} ${bx+br*0.5},${by-br*1.35} ${bx+br*0.4},${by-br*0.9}`}
            stroke="#C8C9CA" strokeWidth={br*0.22} fill="none" strokeLinecap="round"/>
        </g>
      </svg>
    );
  }
  /* ── Tesla ── */
  if (sym.id==="TSLA") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
      <defs><linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2A0608"/><stop offset="100%" stopColor="#1A0305"/></linearGradient></defs>
      <rect width={w} height={h} rx={2} fill={`url(#bg-${uid})`}/>
      {/* Tesla T — horizontal bar + vertical stem + side arcs */}
      <path d={`M${cx-w*0.36},${h*0.2} L${cx+w*0.36},${h*0.2} L${cx+w*0.22},${h*0.34} C${cx+w*0.22},${h*0.34} ${cx+w*0.08},${h*0.33} ${cx+w*0.06},${h*0.34} L${cx+w*0.06},${h*0.84} L${cx-w*0.06},${h*0.84} L${cx-w*0.06},${h*0.34} C${cx-w*0.08},${h*0.33} ${cx-w*0.22},${h*0.34} ${cx-w*0.22},${h*0.34} Z`}
        fill="#E82127"/>
    </svg>
  );
  /* ── Gold Futures / XAUUSD ── gold bar ── */
  if (sym.id==="GC"||sym.id==="XAUUSD") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
      <defs><linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2B2200"/><stop offset="100%" stopColor="#1A1500"/></linearGradient>
      <linearGradient id={`bar-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFE566"/><stop offset="50%" stopColor="#FFD700"/><stop offset="100%" stopColor="#C8A600"/></linearGradient></defs>
      <rect width={w} height={h} rx={2} fill={`url(#bg-${uid})`}/>
      {/* gold bar shape */}
      <path d={`M${cx-w*0.3},${h*0.28} L${cx+w*0.3},${h*0.28} L${cx+w*0.38},${h*0.72} L${cx-w*0.38},${h*0.72} Z`} fill={`url(#bar-${uid})`}/>
      <line x1={cx-w*0.22} y1={h*0.45} x2={cx+w*0.22} y2={h*0.45} stroke="rgba(0,0,0,0.25)" strokeWidth={0.6}/>
      <text x={cx} y={h*0.64} textAnchor="middle" fill="rgba(0,0,0,0.55)" fontSize={h*0.28} fontWeight="800" fontFamily="'Exo 2',sans-serif">{sym.id==="XAUUSD"?"XAU":"GC"}</text>
    </svg>
  );
  /* ── ES — S&P 500 mini bar chart ── */
  if (sym.id==="ES") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
      <defs><linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0D1640"/><stop offset="100%" stopColor="#080E28"/></linearGradient></defs>
      <rect width={w} height={h} rx={2} fill={`url(#bg-${uid})`}/>
      {[[w*0.18,h*0.72,h*0.48],[w*0.32,h*0.72,h*0.32],[w*0.46,h*0.72,h*0.55],[w*0.60,h*0.72,h*0.22],[w*0.74,h*0.72,h*0.38]].map(([x,bot,ht],i)=>(
        <rect key={i} x={x-w*0.05} y={bot-ht} width={w*0.09} height={ht} rx={1} fill={i===3||i===1?"#FF5068":"#5B8CFF"} opacity={0.9}/>
      ))}
      <text x={w*0.86} y={h*0.42} textAnchor="middle" fill="#5B8CFF" fontSize={h*0.28} fontWeight="900" fontFamily="'Exo 2',sans-serif">ES</text>
    </svg>
  );
  /* ── NQ — Nasdaq mini chart ── */
  if (sym.id==="NQ") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
      <defs><linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#001830"/><stop offset="100%" stopColor="#000D1E"/></linearGradient></defs>
      <rect width={w} height={h} rx={2} fill={`url(#bg-${uid})`}/>
      <polyline points={`${w*0.1},${h*0.72} ${w*0.28},${h*0.55} ${w*0.44},${h*0.62} ${w*0.6},${h*0.35} ${w*0.76},${h*0.28} ${w*0.9},${h*0.22}`}
        fill="none" stroke="#26C6DA" strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round"/>
      <text x={w*0.5} y={h*0.88} textAnchor="middle" fill="#26C6DA" fontSize={h*0.26} fontWeight="900" fontFamily="'Exo 2',sans-serif">NQ</text>
    </svg>
  );
  /* ── default fallback ── */
  const label = sym.id.slice(0,3);
  const fs = h<=12 ? 5 : 6.5;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:"block",flexShrink:0}}>
      <rect width={w} height={h} rx={2} fill={sym.bg||"rgba(255,255,255,0.10)"}/>
      <text x={cx} y={cy+fs*0.38} textAnchor="middle" fill={sym.col||"#fff"} fontSize={fs} fontWeight="800" fontFamily="'Exo 2',sans-serif" letterSpacing="-0.3">{label}</text>
    </svg>
  );
};
const FlagSvg = ({ code, w = 22, h = 14 }) => {
  const sw = { width: w, height: h, viewBox: "0 0 22 14", style: { display: "block", flexShrink: 0 } };
  const cc = currencyCountry[code] || code;
  const f = {
    EU: <svg {...sw}><rect width={22} height={14} fill="#003399"/>{Array.from({length:12},(_,i)=>{const a=(i/12)*Math.PI*2-Math.PI/2;return<circle key={i} cx={11+4.8*Math.cos(a)} cy={7+4.8*Math.sin(a)} r={0.85} fill="#FFCC00"/>})}</svg>,
    JP: <svg {...sw}><rect width={22} height={14} fill="#fff"/><circle cx={11} cy={7} r={4} fill="#BC002D"/></svg>,
    US: <svg {...sw}>
      {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i=><rect key={i} y={i*14/13} width={22} height={14/13+0.2} fill={i%2===0?"#B22234":"#fff"}/>)}
      <rect width={9} height={7.5} fill="#3C3B6E"/>
      {Array.from({length:18},(_,i)=>{const col=i%6,row=Math.floor(i/6);return<circle key={i} cx={0.9+col*1.45+(row%2===0?0:0.72)} cy={0.9+row*2.4} r={0.42} fill="#fff"/>;})}
    </svg>,
    GB: <svg {...sw}>
      <rect width={22} height={14} fill="#012169"/>
      <line x1={0} y1={0} x2={22} y2={14} stroke="#fff" strokeWidth={4}/><line x1={22} y1={0} x2={0} y2={14} stroke="#fff" strokeWidth={4}/>
      <line x1={0} y1={0} x2={22} y2={14} stroke="#C8102E" strokeWidth={2}/><line x1={22} y1={0} x2={0} y2={14} stroke="#C8102E" strokeWidth={2}/>
      <rect x={9.5} y={0} width={3} height={14} fill="#fff"/><rect x={0} y={5.5} width={22} height={3} fill="#fff"/>
      <rect x={10} y={0} width={2} height={14} fill="#C8102E"/><rect x={0} y={6} width={22} height={2} fill="#C8102E"/>
    </svg>,
    AU: <svg {...sw}>
      <rect width={22} height={14} fill="#00008B"/>
      <line x1={0} y1={0} x2={9} y2={7} stroke="#fff" strokeWidth={2.5}/><line x1={9} y1={0} x2={0} y2={7} stroke="#fff" strokeWidth={2.5}/>
      <line x1={0} y1={0} x2={9} y2={7} stroke="#C8102E" strokeWidth={1.2}/><line x1={9} y1={0} x2={0} y2={7} stroke="#C8102E" strokeWidth={1.2}/>
      <rect x={3.8} y={0} width={1.4} height={7} fill="#fff"/><rect x={0} y={2.8} width={9} height={1.4} fill="#fff"/>
      <rect x={4.1} y={0} width={0.8} height={7} fill="#C8102E"/><rect x={0} y={3.1} width={9} height={0.8} fill="#C8102E"/>
      <circle cx={4.5} cy={10.5} r={1.6} fill="#fff" opacity={0.9}/>
      <circle cx={15} cy={3.5} r={1.1} fill="#fff"/><circle cx={13} cy={8} r={0.9} fill="#fff"/><circle cx={18} cy={7.5} r={0.9} fill="#fff"/><circle cx={19} cy={4.5} r={0.8} fill="#fff"/>
    </svg>,
    CA: <svg {...sw}>
      <rect width={22} height={14} fill="#fff"/>
      <rect width={5.5} height={14} fill="#FF0000"/><rect x={16.5} width={5.5} height={14} fill="#FF0000"/>
      <path d="M11,2 L12,5 L14.5,4.5 L13,6 L15,7 L11.5,8.5 L12,11 L11,10 L10,11 L10.5,8.5 L7,7 L9,6 L7.5,4.5 L10,5 Z" fill="#FF0000"/>
    </svg>,
    CH: <svg {...sw}><rect width={22} height={14} fill="#FF0000"/><rect x={9.5} y={2.5} width={3} height={9} fill="#fff"/><rect x={5.5} y={5.5} width={11} height={3} fill="#fff"/></svg>,
    DE: <svg {...sw}><rect width={22} height={14} fill="#000"/><rect y={4.67} width={22} height={4.66} fill="#DD0000"/><rect y={9.33} width={22} height={4.67} fill="#FFCE00"/></svg>,
    FR: <svg {...sw}><rect width={22} height={14} fill="#002395"/><rect x={7.33} width={7.34} height={14} fill="#fff"/><rect x={14.67} width={7.33} height={14} fill="#ED2939"/></svg>,
    IT: <svg {...sw}><rect width={22} height={14} fill="#009246"/><rect x={7.33} width={7.34} height={14} fill="#fff"/><rect x={14.67} width={7.33} height={14} fill="#CE2B37"/></svg>,
    CN: <svg {...sw}><rect width={22} height={14} fill="#DE2910"/><polygon points="3.5,1.5 4.2,3.6 6.2,3.6 4.6,4.8 5.3,6.9 3.5,5.6 1.7,6.9 2.4,4.8 0.8,3.6 2.8,3.6" fill="#FFDE00"/><polygon points="7,0.5 7.5,1.5 8.5,1.3 7.9,2.1 8.4,3 7.4,2.6 6.7,3.3 6.8,2.2 5.9,1.8 6.9,1.5" fill="#FFDE00"/><polygon points="9,2.5 9.3,3.5 10.3,3.5 9.5,4.1 9.8,5.1 9,4.5 8.2,5.1 8.5,4.1 7.7,3.5 8.7,3.5" fill="#FFDE00"/><polygon points="9,5.5 9.3,6.5 10.3,6.5 9.5,7.1 9.8,8.1 9,7.5 8.2,8.1 8.5,7.1 7.7,6.5 8.7,6.5" fill="#FFDE00"/><polygon points="7,8 7.5,9 8.5,8.8 7.9,9.6 8.4,10.5 7.4,10.1 6.7,10.8 6.8,9.7 5.9,9.3 6.9,9" fill="#FFDE00"/></svg>,
    NZ: <svg {...sw}>
      <rect width={22} height={14} fill="#00247D"/>
      <line x1={0} y1={0} x2={9} y2={7} stroke="#fff" strokeWidth={2.5}/><line x1={9} y1={0} x2={0} y2={7} stroke="#fff" strokeWidth={2.5}/>
      <line x1={0} y1={0} x2={9} y2={7} stroke="#C8102E" strokeWidth={1.2}/><line x1={9} y1={0} x2={0} y2={7} stroke="#C8102E" strokeWidth={1.2}/>
      <rect x={3.8} y={0} width={1.4} height={7} fill="#fff"/><rect x={0} y={2.8} width={9} height={1.4} fill="#fff"/>
      <rect x={4.1} y={0} width={0.8} height={7} fill="#C8102E"/><rect x={0} y={3.1} width={9} height={0.8} fill="#C8102E"/>
      <circle cx={14} cy={3} r={1.2} fill="#CC142B" stroke="#fff" strokeWidth={0.4}/>
      <circle cx={18} cy={5.5} r={1} fill="#CC142B" stroke="#fff" strokeWidth={0.4}/>
      <circle cx={17} cy={9.5} r={1} fill="#CC142B" stroke="#fff" strokeWidth={0.4}/>
      <circle cx={13.5} cy={7.5} r={0.8} fill="#CC142B" stroke="#fff" strokeWidth={0.3}/>
    </svg>,
  };
  return f[cc] || <svg {...sw}><rect width={22} height={14} fill="#1a2030"/><text x={11} y={10} textAnchor="middle" fontSize={6} fontWeight="bold" fill="#8CA0FF" fontFamily="sans-serif">{cc}</text></svg>;
};

const TalariaV8b = () => {
  const [tool, setTool] = useState("trendline");
  const [hov, setHov] = useState(null);
  const [dropdown, setDropdown] = useState("trendline");
  const [toolPinned, setToolPinned] = useState(["Trend Line","Horizontal Line","Fib Retracement","Rectangle","Text"]); // start open so user can see it
  const [dialog, setDialog] = useState(false);
  const [dlgTab, setDlgTab] = useState("style");
  const [tickCandle, setTickCandle] = useState("candle");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [buySell, setBuySell] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [btmTab, setBtmTab] = useState("positions");
  const [tf, setTf] = useState("1m");
  const [sizeMode, setSizeMode] = useState("$");
  const [advOpen, setAdvOpen] = useState(true);
  const [advMode, setAdvMode] = useState("breakeven");
  const [logoMenu, setLogoMenu] = useState(false);
  const [replayOpts, setReplayOpts] = useState(false);
  const [replayMode, setReplayMode] = useState("candle");
  const [rollback, setRollback] = useState(true);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoTab, setGotoTab] = useState("pinned");
  const [gotoItems, setGotoItems] = useState([
    {id:1,type:"datetime",label:"09 Jan 2009 07:00",pinned:true},
    {id:2,type:"daily",label:"NY Open",time:"08:00",pinned:true},
    {id:3,type:"daily",label:"London Open",time:"02:00",pinned:false},
    {id:4,type:"price",label:"126.500",pinned:true},
    {id:5,type:"daily",label:"Asian Open",time:"19:00",pinned:false},
  ]);
  const [ddPos, setDdPos] = useState({ top: 60, left: 40 }); // position for dropdown
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbol, setSymbol] = useState("EUR/JPY");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  const [chartType, setChartType] = useState("Candles");
  const [tfOpen, setTfOpen] = useState(false);
  const [tfCat, setTfCat] = useState(null);
  const [tfPinned, setTfPinned] = useState(["1m","5m","15m","1H","4H","1D"]);
  const [tfCustomVal, setTfCustomVal] = useState("");
  const [tfEditMode, setTfEditMode] = useState(false);

  const tfDefaults = {
    minutes: ["1m","5m","15m","30m"],
    hours: ["1H","4H","12H"],
    days: ["1D"],
    weeks: ["1W"],
    months: ["1M"],
  };
  const [tfCustomItems, setTfCustomItems] = useState([]);
  const tfSortItems = (items) => [...items].sort((a, b) => {
    const numA = parseInt(a) || 0;
    const numB = parseInt(b) || 0;
    return numA - numB;
  });
  const tfCategories = {
    minutes: { label: "Minutes", items: tfSortItems([...tfDefaults.minutes, ...tfCustomItems.filter(x => x.endsWith("m"))]) },
    hours: { label: "Hours", items: tfSortItems([...tfDefaults.hours, ...tfCustomItems.filter(x => x.endsWith("H"))]) },
    days: { label: "Days", items: tfSortItems([...tfDefaults.days, ...tfCustomItems.filter(x => x.endsWith("D"))]) },
    weeks: { label: "Weeks", items: tfSortItems([...tfDefaults.weeks, ...tfCustomItems.filter(x => x.endsWith("W"))]) },
    months: { label: "Months", items: tfSortItems([...tfDefaults.months, ...tfCustomItems.filter(x => x.endsWith("M") && !x.endsWith("m"))]) },
  };
  const [tfCustomUnit, setTfCustomUnit] = useState("m");
  const [tfUnitOpen, setTfUnitOpen] = useState(false);
  const [tfIndPos, setTfIndPos] = useState(null);
  const tfBarRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const [canvasDims, setCanvasDims] = useState({w:888,h:360});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState("account");
  const [profileLang, setProfileLang] = useState("english");
  const [profileCat, setProfileCat] = useState("account");
  const [profilePos, setProfilePos] = useState({ x: 0, y: 0 });
  const [profileName, setProfileName] = useState("Trader");
  const [profileAvatar, setProfileAvatar] = useState(null);
  const [profileNameEdit, setProfileNameEdit] = useState(false);
  const [profilePwOpen, setProfilePwOpen] = useState(false);
  const [profileCurPw, setProfileCurPw] = useState("");
  const [profileNewPw, setProfileNewPw] = useState("");
  const [profileConfirmPw, setProfileConfirmPw] = useState("");
  const [darkMode, setDarkMode] = useState(true);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqCat, setFaqCat] = useState("faq");
  const [faqPos, setFaqPos] = useState({ x: 0, y: 0 });
  const [faqExpand, setFaqExpand] = useState(null);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [orderPanelOpen, setOrderPanelOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState(null);
  const [screenshotPos, setScreenshotPos] = useState({ x: 0, y: 0 });
  const [layersOpen, setLayersOpen] = useState(false);
  const [layersPos, setLayersPos] = useState({ x: 0, y: 0 });
  const [layersCat, setLayersCat] = useState("drawings");
  const [layersItems, setLayersItems] = useState(Array.from({length:100},(_,i)=>{
    const types=[
      {icon:"trendline",name:"Trend Line"},{icon:"hline",name:"Horizontal Line"},
      {icon:"fib",name:"Fib Retracement"},{icon:"rect",name:"Rectangle"},
      {icon:"channel",name:"Channel"},{icon:"vline",name:"Vertical Line"},
      {icon:"hray",name:"Horizontal Ray"},{icon:"polyline",name:"Polyline"},
    ];
    const t=types[i%types.length];
    return {id:`l${i+1}`,icon:t.icon,name:`${t.name} ${i+1}`,color:"#4A6AFF"};
  }));
  const [layersVis, setLayersVis] = useState({});
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsPos, setNewsPos] = useState({ x: 0, y: 0 });
  const [newsTab, setNewsTab] = useState("upcoming");
  const [newsSearch, setNewsSearch] = useState("");
  const [newsImpact, setNewsImpact] = useState(["high","med","low"]);
  const [newsSymbolOnly, setNewsSymbolOnly] = useState(false);
  const [newsFilterOpen, setNewsFilterOpen] = useState(false);
  const [newsFilterClosing, setNewsFilterClosing] = useState(false);
  const [newsCntSel, setNewsCntSel] = useState({US:1,EU:1,GB:1,JP:1,AU:1,CA:1,DE:1,FR:1,IT:1,CN:1,CH:1});
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layoutPos, setLayoutPos] = useState({ x: 0, y: 0 });
  const [layoutPanels, setLayoutPanels] = useState({n:1,li:0});
  const [layoutSync, setLayoutSync] = useState({ crosshair: true, time: true, drawings: true, symbol: false, interval: false, dateRange: false, indicators: false, chartType: false });
  const [settingsTab, setSettingsTab] = useState("chart");
  const [sDrop, setSDrop] = useState(null); // which settings dropdown is open
  const [colorPicker, setColorPicker] = useState(null);
  const [cpPos, setCpPos] = useState({ top: 300, left: 500 });
  const [swHov, setSwHov] = useState(null);
  const [settDrop, setSettDrop] = useState(null);
  const [settDropPos, setSettDropPos] = useState({ top: 0, left: 0, w: 0 });
  const [customTemplates, setCustomTemplates] = useState([]);
  const [tplNameInput, setTplNameInput] = useState("");
  const [cpH, setCpH] = useState(0);
  const [cpS, setCpS] = useState(0);
  const [cpV, setCpV] = useState(1);
  const [cpA, setCpA] = useState(1);
  const [cpHex, setCpHex] = useState('ffffff');
  const [cpDragging, setCpDragging] = useState(null);
  const [cpDragRect, setCpDragRect] = useState(null);
  const [settings, setSettings] = useState({
    theme: "Talaria Dark", chartType: "candlestick", precision: "0.00000", timezone: "UTC",
    textColor: "#8CA0FF", background: "#07080E", gridColor: "rgba(140,160,255,0.15)", crosshairColor: "rgba(255,255,255,0.4)",
    priceLine: true, priceLineColor: "#FF5068",
    scaleTextColor: "rgba(255,255,255,0.25)", scaleLineColor: "rgba(140,160,255,0.12)",
    bullBody: "#00D4A1", bullBorder: "#00D4A1", bullWick: "#00D4A1",
    bearBody: "#FF5068", bearBorder: "#FF5068", bearWick: "#FF5068", unifiedBarColor: true, unifiedBarColorVal: "#00D4A1",
    orderPlacement: "instant", showOrderHistory: true, showOpenOrders: true, timeFormat: "24h",
    gridLinesOn: true, gridLineStyle: "solid", gridLineThickness: 1,
    crosshairOn: true, crosshairStyle: "dashed",
    priceLineStyle: "solid", priceLineThickness: 1,
    chartTemplate: "Dark Classic",
  });

  const [indOpen, setIndOpen] = useState(false);
  const [indPinned, setIndPinned] = useState([]);
  const [indActive, setIndActive] = useState([]);
  const [indSelected, setIndSelected] = useState(null);
  const [indSearch, setIndSearch] = useState("");
  const [indPos, setIndPos] = useState({ x: 0, y: 0 });
  const [indCat, setIndCat] = useState("all");
  const [dragging, setDragging] = useState(null);
  const [settingsPos, setSettingsPos] = useState({ x: 0, y: 0 });
  const [closing, setClosing] = useState(new Set());
  const animClose = (setter, key) => {
    setClosing(s => new Set([...s, key]));
    setSettDrop(null);
    setTimeout(() => { setter(false); setClosing(s => { const n = new Set(s); n.delete(key); return n; }); }, 155);
  };

  const c = {
    ac: "#2643F7", acL: "#4A6AFF", acD: "rgba(38,67,247,0.08)", acB: "rgba(38,67,247,0.22)", acG: "rgba(38,67,247,0.12)",
    gold: "#C9A84C",
    bg: "#07080E", sf: "#0A0C14", el: "#0F1119", well: "#060710",
    br: "rgba(140,160,255,0.05)", brL: "rgba(140,160,255,0.08)", brH: "rgba(140,160,255,0.12)",
    tx: "rgba(255,255,255,0.92)", ts: "rgba(255,255,255,0.70)", tm: "rgba(255,255,255,0.50)",
    gn: "#00D4A1", gnD: "rgba(0,212,161,0.07)", gnB: "rgba(0,212,161,0.18)",
    rd: "#FF5068", rdD: "rgba(255,80,104,0.07)", rdB: "rgba(255,80,104,0.18)",
    axTx: "rgba(255,255,255,0.45)", grid: "rgba(140,160,255,0.04)",
  };
  const F = "'Exo 2',sans-serif";

  const allSymbols = SYMBOLS_DATA.flatMap(c => c.items);
  const currentSymbol = allSymbols.find(s => s.id === symbol) || { id:symbol, type:"forex", base:symbol.split("/")[0], quote:symbol.split("/")[1] };
  const chartTypeMap = {
    "Candles": { icon: "candle", label: "Candles" },
    "Hollow Candles": { icon: "hollowCandle", label: "Hollow Candles" },
    "Heikin Ashi": { icon: "heikinAshi", label: "Heikin Ashi" },
    "Bars": { icon: "bars", label: "Bars" },
    "Line": { icon: "lineChart", label: "Line" },
    "Area": { icon: "area", label: "Area" },
    "candles": { icon: "candle", label: "Candles" },
  };
  const currentChartType = chartTypeMap[chartType] || { icon: "candle", label: chartType };
  const gotoNextId = () => Date.now() + Math.random();

  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest('[data-sdrop]')) return;
      setSettDrop(null);
      setColorPicker(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!document.querySelector('link[href*="Exo+2"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById('tlr-scrollbar-css')) {
      const style = document.createElement('style');
      style.id = 'tlr-scrollbar-css';
      style.textContent = `.tlr-scroll::-webkit-scrollbar{width:3px;height:3px}.tlr-scroll::-webkit-scrollbar-track{background:transparent}.tlr-scroll::-webkit-scrollbar-thumb{background:rgba(140,160,255,0.18);border-radius:2px}.tlr-scroll::-webkit-scrollbar-thumb:hover{background:rgba(140,160,255,0.36)}.tlr-scroll{scrollbar-width:thin;scrollbar-color:rgba(140,160,255,0.18) transparent}@keyframes tlrCpIn{from{opacity:0;transform:translateY(-5px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}.tlr-cp{animation:tlrCpIn 0.15s cubic-bezier(0.16,1,0.3,1)}`;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    if (!tfBarRef.current) return;
    const btn = tfBarRef.current.querySelector(`[data-tf="${tf}"]`);
    if (btn) {
      const barRect = tfBarRef.current.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setTfIndPos({ left: btnRect.left - barRect.left, width: btnRect.width });
    } else {
      setTfIndPos(null);
    }
  }, [tf, tfPinned]);

  const catColors = {trend:c.acL, momentum:"#E8820A", volatility:"#C9A84C", volume:c.gn, sessions:"#FF5068", others:c.ts};
  const tplWatchKeys = new Set(["bullBody","bullBorder","bullWick","bearBody","bearBorder","bearWick","background","gridColor","unifiedBarColorVal","crosshairColor","priceLineColor","scaleTextColor","scaleLineColor","textColor"]);
  const updateSetting = (key, val) => setSettings(prev => {
    const next = {...prev, [key]: val};
    if (tplWatchKeys.has(key) && prev.chartTemplate !== "CUSTOM") next.chartTemplate = "CUSTOM";
    return next;
  });
  const defaultTemplateMap = {
    "Dark Classic":   {bullBody:"#00D4A1",bullBorder:"#00D4A1",bullWick:"#00D4A1",bearBody:"#FF5068",bearBorder:"#FF5068",bearWick:"#FF5068",background:"#07080E",gridColor:"rgba(140,160,255,0.15)"},
    "Professional":   {bullBody:"#26A69A",bullBorder:"#26A69A",bullWick:"#26A69A",bearBody:"#EF5350",bearBorder:"#EF5350",bearWick:"#EF5350",background:"#131722",gridColor:"rgba(100,140,200,0.15)"},
    "Ocean Night":    {bullBody:"#00BCD4",bullBorder:"#00BCD4",bullWick:"#00BCD4",bearBody:"#FF4081",bearBorder:"#FF4081",bearWick:"#FF4081",background:"#050D18",gridColor:"rgba(0,188,212,0.12)"},
    "Amber Dusk":     {bullBody:"#FF9800",bullBorder:"#FF9800",bullWick:"#FF9800",bearBody:"#F44336",bearBorder:"#F44336",bearWick:"#F44336",background:"#0E0A05",gridColor:"rgba(255,152,0,0.12)"},
    "Forest Deep":    {bullBody:"#66BB6A",bullBorder:"#66BB6A",bullWick:"#66BB6A",bearBody:"#81C784",bearBorder:"#81C784",bearWick:"#81C784",background:"#060E06",gridColor:"rgba(102,187,106,0.12)"},
    "Midnight":       {bullBody:"#42A5F5",bullBorder:"#42A5F5",bullWick:"#42A5F5",bearBody:"#EF5350",bearBorder:"#EF5350",bearWick:"#EF5350",background:"#040812",gridColor:"rgba(66,165,245,0.12)"},
    "Crimson":        {bullBody:"#F44336",bullBorder:"#F44336",bullWick:"#F44336",bearBody:"#9C27B0",bearBorder:"#9C27B0",bearWick:"#9C27B0",background:"#0C0308",gridColor:"rgba(244,67,54,0.12)"},
    "Arctic Frost":   {bullBody:"#80DEEA",bullBorder:"#80DEEA",bullWick:"#80DEEA",bearBody:"#FFAB40",bearBorder:"#FFAB40",bearWick:"#FFAB40",background:"#05080F",gridColor:"rgba(128,222,234,0.12)"},
    "Cyber Green":    {bullBody:"#00E676",bullBorder:"#00E676",bullWick:"#00E676",bearBody:"#FF1744",bearBorder:"#FF1744",bearWick:"#FF1744",background:"#020A02",gridColor:"rgba(0,230,118,0.12)"},
    "Rose Gold":      {bullBody:"#F48FB1",bullBorder:"#F48FB1",bullWick:"#F48FB1",bearBody:"#FFB74D",bearBorder:"#FFB74D",bearWick:"#FFB74D",background:"#0E0608",gridColor:"rgba(244,143,177,0.12)"},
  };
  const applyTemplate = (name, overrideSettings) => {
    const base = overrideSettings || defaultTemplateMap[name] || {};
    setSettings(prev => ({...prev, ...base, chartTemplate: name}));
  };
  const saveCustomTemplate = () => {
    const name = tplNameInput.trim();
    if (!name) return;
    const snap = {
      n: name,
      cols: [settings.bullBody, settings.bearBody, settings.background],
      settings: {
        bullBody:settings.bullBody,bullBorder:settings.bullBorder,bullWick:settings.bullWick,
        bearBody:settings.bearBody,bearBorder:settings.bearBorder,bearWick:settings.bearWick,
        background:settings.background,gridColor:settings.gridColor,
        unifiedBarColorVal:settings.unifiedBarColorVal,
      },
    };
    setCustomTemplates(prev => [...prev.filter(t=>t.n!==name), snap]);
    setTplNameInput("");
  };
  // Bracket-style on/off indicator (not a React component — called as {Chk(...)})
  const Chk = (on, settKey, hKey) => {
    const isH = swHov === hKey;
    const col = on ? c.acL : isH ? c.ts : "rgba(140,160,255,0.22)";
    return (
      <div onClick={()=>updateSetting(settKey,!on)} onMouseEnter={()=>setSwHov(hKey)} onMouseLeave={()=>setSwHov(null)}
        style={{cursor:"pointer",flexShrink:0,width:10,height:10}}>
        <svg width={10} height={10} style={{display:"block",overflow:"visible"}}>
          {/* Always-visible: top-left + bottom-right brackets */}
          <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={col} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
          <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={col} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
          {/* Hover preview: faint remaining corners */}
          {!on && isH && <>
            <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(74,106,255,0.35)" strokeWidth={1} fill="none" strokeLinecap="square"/>
            <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(74,106,255,0.35)" strokeWidth={1} fill="none" strokeLinecap="square"/>
          </>}
          {/* Active: all 4 corners + glow dot */}
          {on && <>
            <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
            <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
            <circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/>
            <circle cx={5} cy={5} r={1.6} fill={c.acL}/>
          </>}
        </svg>
      </div>
    );
  };
  const openCP = (e, key) => {
    const val = settings[key];
    const p = parseColor(val || '#ffffff');
    const hsv = rgbToHsv(p.r, p.g, p.b);
    setCpH(hsv.h); setCpS(hsv.s); setCpV(hsv.v); setCpA(p.a);
    setCpHex(toHex2(p.r)+toHex2(p.g)+toHex2(p.b));
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.min(rect.left - 90, window.innerWidth - 230);
    setCpPos({ top: rect.bottom + 8, left: Math.max(10, left) });
    setColorPicker(key);
  };
  const cpApply = (nh, ns, nv, na, key) => {
    const rgb = hsvToRgb(nh, ns, nv);
    setCpHex(toHex2(rgb.r)+toHex2(rgb.g)+toHex2(rgb.b));
    updateSetting(key || colorPicker, cpBuildColor(rgb.r, rgb.g, rgb.b, na));
  };
  const indicatorData = [
    // Trend
    {id:"SMA",name:"Simple Moving Average",abbr:"SMA",cat:"trend",desc:"Smoothed average of closing prices over N periods"},
    {id:"EMA",name:"Exponential Moving Average",abbr:"EMA",cat:"trend",desc:"Gives more weight to recent prices"},
    {id:"WMA",name:"Weighted Moving Average",abbr:"WMA",cat:"trend",desc:"Linearly weighted average, emphasises recency"},
    {id:"DEMA",name:"Double EMA",abbr:"DEMA",cat:"trend",desc:"Reduces lag with a double-smoothed EMA"},
    {id:"TEMA",name:"Triple EMA",abbr:"TEMA",cat:"trend",desc:"Further reduces lag using triple smoothing"},
    {id:"HMA",name:"Hull Moving Average",abbr:"HMA",cat:"trend",desc:"Nearly eliminates lag while maintaining smoothness"},
    {id:"VWMA",name:"Volume Weighted MA",abbr:"VWMA",cat:"trend",desc:"MA weighted by volume at each bar"},
    {id:"ALMA",name:"Arnaud Legoux MA",abbr:"ALMA",cat:"trend",desc:"Low-noise Gaussian-weighted moving average"},
    {id:"SUPERTREND",name:"Supertrend",abbr:"ST",cat:"trend",desc:"ATR-based trend-following overlay with signals"},
    {id:"ICHIMOKU",name:"Ichimoku Cloud",abbr:"ICHI",cat:"trend",desc:"Multi-component Japanese trend & support system"},
    // Momentum
    {id:"RSI",name:"Relative Strength Index",abbr:"RSI",cat:"momentum",desc:"Oscillator measuring overbought/oversold conditions"},
    {id:"MACD",name:"MACD",abbr:"MACD",cat:"momentum",desc:"Moving average convergence/divergence histogram"},
    {id:"STOCH",name:"Stochastic",abbr:"STOCH",cat:"momentum",desc:"Compares closing price to price range over N periods"},
    {id:"CCI",name:"Commodity Channel Index",abbr:"CCI",cat:"momentum",desc:"Measures deviation from statistical mean"},
    {id:"MOM",name:"Momentum",abbr:"MOM",cat:"momentum",desc:"Raw price change over N periods"},
    {id:"ROC",name:"Rate of Change",abbr:"ROC",cat:"momentum",desc:"Percentage change in price over N periods"},
    {id:"WPR",name:"Williams %R",abbr:"%R",cat:"momentum",desc:"Overbought/oversold oscillator in -100 to 0 range"},
    {id:"TSI",name:"True Strength Index",abbr:"TSI",cat:"momentum",desc:"Double-smoothed momentum oscillator"},
    {id:"KST",name:"Know Sure Thing",abbr:"KST",cat:"momentum",desc:"Summed & smoothed rate-of-change oscillator"},
    {id:"DPO",name:"Detrended Price Oscillator",abbr:"DPO",cat:"momentum",desc:"Removes trend to isolate cycles"},
    {id:"PPO",name:"Percentage Price Oscillator",abbr:"PPO",cat:"momentum",desc:"MACD expressed as a percentage"},
    {id:"AO",name:"Awesome Oscillator",abbr:"AO",cat:"momentum",desc:"5/34 period SMA midpoint difference"},
    {id:"STOCHRSI",name:"Stochastic RSI",abbr:"StRSI",cat:"momentum",desc:"Stochastic applied to RSI values for sensitivity"},
    // Volatility
    {id:"BB",name:"Bollinger Bands",abbr:"BB",cat:"volatility",desc:"Dynamic bands 2 standard deviations from SMA"},
    {id:"ATR",name:"Average True Range",abbr:"ATR",cat:"volatility",desc:"Average of true range over N periods"},
    {id:"KC",name:"Keltner Channel",abbr:"KC",cat:"volatility",desc:"ATR-based envelope around EMA"},
    {id:"DC",name:"Donchian Channel",abbr:"DC",cat:"volatility",desc:"High/low channel over N periods"},
    {id:"ATRP",name:"ATR Percentage",abbr:"ATRP",cat:"volatility",desc:"ATR expressed as a percentage of price"},
    {id:"HV",name:"Historical Volatility",abbr:"HV",cat:"volatility",desc:"Annualised standard deviation of log returns"},
    {id:"NATR",name:"Normalized ATR",abbr:"NATR",cat:"volatility",desc:"ATR normalised by closing price"},
    {id:"VHF",name:"Vertical Horizontal Filter",abbr:"VHF",cat:"volatility",desc:"Measures trending vs ranging conditions"},
    // Volume
    {id:"VWAP",name:"VWAP",abbr:"VWAP",cat:"volume",desc:"Intraday volume-weighted average price benchmark"},
    {id:"OBV",name:"On Balance Volume",abbr:"OBV",cat:"volume",desc:"Cumulative volume direction indicator"},
    {id:"CMF",name:"Chaikin Money Flow",abbr:"CMF",cat:"volume",desc:"Money flow oscillator over N periods"},
    {id:"MFI",name:"Money Flow Index",abbr:"MFI",cat:"volume",desc:"RSI-like oscillator incorporating volume"},
    {id:"VROC",name:"Volume Rate of Change",abbr:"VROC",cat:"volume",desc:"Percentage change in volume over N periods"},
    {id:"AD",name:"Accumulation/Distribution",abbr:"A/D",cat:"volume",desc:"Cumulative money flow line"},
    {id:"PVT",name:"Price Volume Trend",abbr:"PVT",cat:"volume",desc:"Combines price change percentage with volume"},
    {id:"KLINGER",name:"Klinger Volume Oscillator",abbr:"KVO",cat:"volume",desc:"Long/short volume force oscillator"},
    // Sessions
    {id:"SESS",name:"Session Boxes",abbr:"SESS",cat:"sessions",desc:"Highlights all major trading sessions with boxes"},
    {id:"ASIA",name:"Asia Session",abbr:"ASIA",cat:"sessions",desc:"Highlights the Asian session range"},
    {id:"LON",name:"London Session",abbr:"LON",cat:"sessions",desc:"Highlights the London session range"},
    {id:"NY",name:"New York Session",abbr:"NY",cat:"sessions",desc:"Highlights the New York session range"},
    // Others
    {id:"PIVOT",name:"Pivot Points",abbr:"PIVOT",cat:"others",desc:"Daily/weekly/monthly S/R pivot levels"},
    {id:"PSAR",name:"Parabolic SAR",abbr:"PSAR",cat:"others",desc:"Trailing stop and reversal signal dots"},
    {id:"ADX",name:"Average Directional Index",abbr:"ADX",cat:"others",desc:"Measures trend strength, not direction"},
    {id:"AROON",name:"Aroon",abbr:"AROON",cat:"others",desc:"Identifies trend changes and strength"},
    {id:"ZZ",name:"Zig Zag",abbr:"ZZ",cat:"others",desc:"Filters noise to highlight significant price swings"},
    {id:"FVGBULL",name:"Bullish Fair Value Gap",abbr:"FVG+",cat:"others",desc:"Marks up-side imbalances in price action"},
    {id:"FVGBEAR",name:"Bearish Fair Value Gap",abbr:"FVG−",cat:"others",desc:"Marks down-side imbalances in price action"},
  ];

  const indFiltered = indicatorData
    .filter(i => indCat === "all" ? true : indCat === "pinned" ? indPinned.includes(i.id) : indCat === "active" ? indActive.includes(i.id) : i.cat === indCat)
    .filter(i => !indSearch || i.name.toLowerCase().includes(indSearch.toLowerCase()) || i.abbr.toLowerCase().includes(indSearch.toLowerCase()));

  const I = ({ n, s = 17, cl = "currentColor", w = 1.5 }) => {
    const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: cl, strokeWidth: w, strokeLinecap: "round", strokeLinejoin: "round" };
    const icons = {
      crosshair: <svg {...p}><circle cx="12" cy="12" r="7"/><line x1="12" y1="3" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="3" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/></svg>,
      trendline: <svg {...p}><line x1="5" y1="19" x2="19" y2="5"/><circle cx="5" cy="19" r="1.5" fill={cl} stroke="none"/><circle cx="19" cy="5" r="1.5" fill={cl} stroke="none"/></svg>,
      hline: <svg {...p}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="10" x2="3" y2="14"/><line x1="21" y1="10" x2="21" y2="14"/></svg>,
      channel: <svg {...p}><line x1="4" y1="17" x2="20" y2="7"/><line x1="4" y1="21" x2="20" y2="11"/></svg>,
      fib: <svg {...p}><line x1="4" y1="4" x2="20" y2="4"/><line x1="4" y1="9.5" x2="20" y2="9.5"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="20" x2="20" y2="20"/></svg>,
      rect: <svg {...p}><rect x="4" y="6" width="16" height="12" rx="1"/></svg>,
      text: <svg {...p}><polyline points="5 7 5 4 19 4 19 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/></svg>,
      brush: <svg {...p}><path d="M18 4L10 12"/><path d="M10 12C8 14 6 14 4 16C3 17 4 20 6 20C8 20 9 18 10 16C11 14 12 12 10 12Z"/></svg>,
      pattern: <svg {...p}><polyline points="4 18 8 10 12 14 16 6 20 12"/></svg>,
      indicator: <svg {...p}><path d="M3 18L7 12L11 15L15 7L21 11"/><circle cx="7" cy="12" r="1.5" fill={cl} stroke="none"/><circle cx="15" cy="7" r="1.5" fill={cl} stroke="none"/></svg>,
      eye: <svg {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>,
      palette: <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.5" fill={cl} stroke="none"/><circle cx="15" cy="9" r="1.5" fill={cl} stroke="none"/><circle cx="8" cy="13.5" r="1.5" fill={cl} stroke="none"/></svg>,
      trash: <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
      undo: <svg {...p}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
      redo: <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>,
      magnet: <svg {...p}><path d="M6 2v6a6 6 0 0 0 12 0V2"/></svg>,
      lock: <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
      measure: <svg {...p}><path d="M4 20L20 4"/><path d="M4 20l3.5-1-2.5-2.5z" fill={cl} stroke="none"/><path d="M20 4l-3.5 1 2.5 2.5z" fill={cl} stroke="none"/></svg>,
      play: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><polygon points="7,4 20,12 7,20"/></svg>,
      pause: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
      skipBack: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><polygon points="12,5 3,12 12,19"/><rect x="1" y="5" width="2" height="14"/></svg>,
      skipFwd: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><polygon points="12,5 21,12 12,19"/><rect x="21" y="5" width="2" height="14"/></svg>,
      stepBack: <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>,
      stepFwd: <svg {...p}><polyline points="9 6 15 12 9 18"/></svg>,
      settings: <svg {...p}><line x1="4" y1="6" x2="7" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="11" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="13" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="17" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="7" y2="18"/><circle cx="9" cy="18" r="2"/><line x1="11" y1="18" x2="20" y2="18"/></svg>,
      plus: <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
      minus: <svg {...p}><line x1="5" y1="12" x2="19" y2="12"/></svg>,
      x: <svg {...p}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>,
      check: <svg {...p} strokeWidth={2}><polyline points="4 12 9 17 20 6"/></svg>,
      chevDown: <svg {...p}><polyline points="6 9 12 15 18 9"/></svg>,
      chevRight: <svg {...p} strokeWidth={2}><polyline points="9 6 15 12 9 18"/></svg>,
      user: <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg>,
      tree: <svg {...p}><line x1="6" y1="3" x2="6" y2="21"/><line x1="6" y1="6" x2="18" y2="6"/><line x1="6" y1="12" x2="15" y2="12"/><line x1="6" y1="18" x2="12" y2="18"/></svg>,
      news: <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="14" y2="12"/><line x1="7" y1="16" x2="11" y2="16"/></svg>,
      config: <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="9 10 12 13 15 10"/></svg>,
      goto: <svg {...p}><circle cx="12" cy="12" r="9"/><polyline points="12 8 12 12 15 14"/></svg>,
      rollback: <svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 2 3 8 9 8"/></svg>,
      hray: <svg {...p}><line x1="3" y1="12" x2="21" y2="12"/><polyline points="17 8 21 12 17 16"/></svg>,
      vline: <svg {...p}><line x1="12" y1="3" x2="12" y2="21"/></svg>,
      polyline: <svg {...p}><polyline points="4 18 8 10 14 14 20 6"/></svg>,
      candle: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth={w} strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="6"/><rect x="5" y="6" width="6" height="7" fill={cl} rx="0.5"/><line x1="8" y1="13" x2="8" y2="17"/><line x1="17" y1="7" x2="17" y2="11"/><rect x="14" y="11" width="6" height="5" rx="0.5"/><line x1="17" y1="16" x2="17" y2="22"/></svg>,
      tick: <svg {...p}><line x1="4" y1="12" x2="8" y2="12"/><line x1="8" y1="8" x2="12" y2="8"/><line x1="12" y1="15" x2="16" y2="15"/><line x1="16" y1="10" x2="20" y2="10"/></svg>,
      expand: <svg {...p}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
      bell: <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>,
      link: <svg {...p}><path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
      layout: <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="12" y1="9" x2="12" y2="21"/></svg>,
      screenshot: <svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
      help: <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a3 3 0 0 1 5 1c0 2-3 2.5-3 4.5"/><circle cx="12" cy="17.5" r="0.5" fill={cl} stroke="none"/></svg>,
      hollowCandle: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth={w} strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="6"/><rect x="5" y="6" width="6" height="7" rx="0.5"/><line x1="8" y1="13" x2="8" y2="17"/><line x1="17" y1="7" x2="17" y2="11"/><rect x="14" y="11" width="6" height="5" rx="0.5"/><line x1="17" y1="16" x2="17" y2="22"/></svg>,
      heikinAshi: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth={w} strokeLinecap="round"><line x1="7" y1="3" x2="7" y2="7"/><rect x="4.5" y="7" width="5" height="6" fill={cl} rx="0.5"/><line x1="7" y1="13" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="12"/><rect x="14.5" y="12" width="5" height="5" fill={cl} rx="0.5"/><line x1="17" y1="17" x2="17" y2="21"/></svg>,
      bars: <svg {...p}><line x1="6" y1="4" x2="6" y2="16"/><line x1="3" y1="7" x2="6" y2="7"/><line x1="6" y1="13" x2="9" y2="13"/><line x1="13" y1="8" x2="13" y2="20"/><line x1="10" y1="11" x2="13" y2="11"/><line x1="13" y1="17" x2="16" y2="17"/><line x1="20" y1="5" x2="20" y2="17"/><line x1="17" y1="8" x2="20" y2="8"/><line x1="20" y1="14" x2="23" y2="14"/></svg>,
      lineChart: <svg {...p}><polyline points="3 17 8 11 13 14 18 7 22 10"/></svg>,
      area: <svg {...p}><path d="M3 20 L3 17 L8 11 L13 14 L18 7 L22 10 L22 20 Z" fill={cl} opacity="0.15"/><polyline points="3 17 8 11 13 14 18 7 22 10"/></svg>,
      baseline: <svg {...p}><line x1="2" y1="14" x2="22" y2="14" strokeDasharray="2 2" opacity="0.4"/><polyline points="3 12 7 8 11 11 15 6 19 10 22 12"/><polyline points="3 16 7 19 11 17 15 20 19 18 22 16"/></svg>,
      search: <svg {...p}><circle cx="10" cy="10" r="7"/><line x1="15" y1="15" x2="21" y2="21"/></svg>,
      star: <svg {...p}><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
      starFill: <svg width={s} height={s} viewBox="0 0 24 24" fill={cl} stroke="none"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
      edit: <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
      pin: <svg {...p}><path d="M12 2L12 5"/><path d="M7 5H17L15.5 11H8.5L7 5Z"/><path d="M9 11L7 14"/><path d="M15 11L17 14"/><path d="M12 11V22"/></svg>,
      locate: <svg {...p}><line x1="5" y1="19" x2="17" y2="7"/><polyline points="10,7 17,7 17,14"/><circle cx="17" cy="7" r="1.8" fill={cl} stroke="none"/></svg>,
      filter: <svg {...p}><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>,
      pinFill: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={cl} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L12 5" stroke={cl} strokeWidth={w}/><path d="M7 5H17L15.5 11H8.5L7 5Z" fill={cl} stroke={cl} strokeWidth={w}/><path d="M9 11L7 14" stroke={cl} strokeWidth={w}/><path d="M15 11L17 14" stroke={cl} strokeWidth={w}/><path d="M12 11V22" stroke={cl} strokeWidth={w}/></svg>,
    };
    return icons[n] || null;
  };

  // Button component
  const B = ({ children, onClick, primary, small, hk, sx = {} }) => {
    const isH = hk ? swHov === hk : false;
    const isP = hk ? swHov === hk + "_dn" : false;
    return (
      <button
        onClick={onClick}
        onMouseEnter={hk ? () => setSwHov(hk) : undefined}
        onMouseLeave={hk ? () => setSwHov(null) : undefined}
        onMouseDown={hk ? () => setSwHov(hk + "_dn") : undefined}
        onMouseUp={hk ? () => setSwHov(hk) : undefined}
        style={{
          padding: small ? "0 8px" : "0 14px",
          height: small ? 20 : 28,
          minWidth: small ? undefined : 64,
          display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
          background: primary
            ? isP ? c.ac : isH ? `linear-gradient(135deg,${c.acL},#6A8AFF)` : `linear-gradient(135deg,${c.ac},${c.acL})`
            : isP ? "rgba(140,160,255,0.10)" : isH ? "rgba(140,160,255,0.06)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${primary
            ? isH || isP ? c.acL : "rgba(74,106,255,0.5)"
            : isH || isP ? "rgba(140,160,255,0.4)" : "rgba(140,160,255,0.22)"}`,
          color: primary ? "#fff" : isH || isP ? c.tx : c.ts,
          fontSize: small ? 8 : 10,
          fontWeight: primary ? 700 : 600,
          fontFamily: F,
          cursor: "pointer",
          boxShadow: primary
            ? isH ? `0 2px 14px rgba(38,67,247,0.5)` : `0 2px 8px rgba(38,67,247,0.25)`
            : isH ? "0 0 0 1px rgba(140,160,255,0.08)" : "none",
          transform: isP ? "scale(0.96)" : "scale(1)",
          transition: "background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease",
          WebkitFontSmoothing: "antialiased",
          letterSpacing: "0.02em",
          ...sx
        }}
      >{children}</button>
    );
  };

  const Sel = ({ children, w }) => (
    <select style={{ background: c.well, border: `1px solid ${c.br}`, color: c.tx, padding: "3px 6px", fontSize: 9, fontFamily: F, outline: "none", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)", width: w }}>{children}</select>
  );

  const MiniIn = ({ val, w = 36, pre }) => (
    <div style={{ display: "inline-flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "2px 4px", width: w }}>
      {pre && <span style={{ color: c.tm, fontSize: 8, marginRight: 2 }}>{pre}</span>}
      <span style={{ flex: 1, textAlign: "right", fontSize: 9, fontWeight: 700, fontFamily: F, fontVariantNumeric: "tabular-nums" }}>{val}</span>
    </div>
  );

  // Tool definitions - reorganized by function
  const toolGroups = [
    // Group 1 - Cursor
    [{ id: "crosshair", icon: "crosshair", label: "Cursor", dd: [
      {h:"CURSOR"},{icon:"crosshair",label:"Cross"},{icon:"crosshair",label:"Dot"},{icon:"crosshair",label:"Arrow"},{icon:"brush",label:"Eraser"}
    ]}],
    // Group 2 - Brushes
    [{ id: "brush2", icon: "brush", label: "Brushes", dd: [
      {h:"BRUSHES"},{icon:"brush",label:"Brush"},{icon:"brush",label:"Highlighter"}
    ]}],
    // Group 3 - Lines
    [{ id: "trendline", icon: "trendline", label: "Lines", dd: [
      {h:"LINES"},{icon:"trendline",label:"Trend Line"},{icon:"hray",label:"Horizontal Ray"},{icon:"hline",label:"Horizontal Line"},{icon:"vline",label:"Vertical Line"},{icon:"trendline",label:"Ray"},{icon:"trendline",label:"Extended Line"},{icon:"crosshair",label:"Cross Line"},{icon:"polyline",label:"Polyline"},{icon:"polyline",label:"Path"},{icon:"polyline",label:"Curve"},{icon:"polyline",label:"Double Curve"}
    ]}],
    // Group 4 - Shapes
    [{ id: "rect", icon: "rect", label: "Shapes", dd: [
      {h:"SHAPES"},{icon:"rect",label:"Triangle"},{icon:"rect",label:"Rectangle"},{icon:"rect",label:"Arc"},{icon:"rect",label:"Ellipse"},{icon:"rect",label:"Circle"},
      {h:"ARROWS"},{icon:"trendline",label:"Arrow Marker"},{icon:"trendline",label:"Arrow"},{icon:"trendline",label:"Arrow Mark Up"},{icon:"trendline",label:"Arrow Mark Down"}
    ]}],
    // Group 5 - Channels & Pitchforks
    [{ id: "channel", icon: "channel", label: "Channels", dd: [
      {h:"CHANNELS"},{icon:"channel",label:"Parallel Channel"},{icon:"channel",label:"Regression Channel"},{icon:"channel",label:"Flat Top/Bottom"},{icon:"channel",label:"Disjoint Channel"},
      {h:"PITCHFORKS"},{icon:"channel",label:"Pitchfork"}
    ]}],
    // Group 6 - Fibonacci & Gann
    [{ id: "fib", icon: "fib", label: "Fibonacci & Gann", dd: [
      {h:"FIBONACCI"},{icon:"fib",label:"Fib Retracement"},{icon:"fib",label:"Trend-Based Fib Extension"},{icon:"fib",label:"Fib Channel"},{icon:"fib",label:"Fib Time Zone"},{icon:"fib",label:"Fib Speed Resistance Fan"},{icon:"fib",label:"Trend-Based Fib Time"},{icon:"fib",label:"Fib Circles"},{icon:"fib",label:"Fib Spiral"},{icon:"fib",label:"Fib Speed Resistance Arcs"},{icon:"fib",label:"Fib Wedge"},
      {h:"GANN"},{icon:"fib",label:"Gann Box"},{icon:"fib",label:"Gann Square Fixed"},{icon:"fib",label:"Gann Fan"}
    ]}],
    // Group 6 - Text & Labels
    [{ id: "text", icon: "text", label: "Text & Labels", dd: [
      {h:"TEXT"},{icon:"text",label:"Text"},{icon:"text",label:"Note"},{icon:"text",label:"Price Note"},{icon:"text",label:"Callout"},{icon:"text",label:"Comment"},
      {h:"LABELS"},{icon:"text",label:"Pin"},{icon:"text",label:"Price Label"},{icon:"text",label:"Signpost"},{icon:"text",label:"Flag Mark"},{icon:"text",label:"Image"},
      {h:"EMOJIS"},{icon:"text",label:"Emojis & Stickers"}
    ]}],
    // Group 7 - Patterns & Waves
    [{ id: "pattern", icon: "pattern", label: "Patterns & Waves", dd: [
      {h:"ELLIOTT WAVES"},{icon:"pattern",label:"Elliott Impulse (12345)"},{icon:"pattern",label:"Elliott Correction (ABC)"},{icon:"pattern",label:"Elliott Triangle (ABCDE)"},{icon:"pattern",label:"Elliott Double Combo (WXY)"},{icon:"pattern",label:"Elliott Triple Combo (WXYXZ)"},
      {h:"PATTERNS"},{icon:"pattern",label:"XABCD Pattern"},{icon:"pattern",label:"Head and Shoulders"},{icon:"pattern",label:"ABCD Pattern"},{icon:"pattern",label:"Triangle Pattern"},{icon:"pattern",label:"Three Drives Pattern"}
    ]}],
    // Group 8 - Projections
    [{ id: "measure", icon: "measure", label: "Projections", dd: [
      {h:"PROJECTIONS"},{icon:"rect",label:"Short Position"},{icon:"rect",label:"Long Position"},{icon:"measure",label:"Range Tool"}
    ]}],
    // Group 9 - Volume Tools
    [{ id: "brush", icon: "brush", label: "Volume Tools", dd: [
      {h:"VOLUME-BASED"},{icon:"brush",label:"Anchored VWAP"},{icon:"brush",label:"Fixed Range Volume Profile"},{icon:"brush",label:"Anchored Volume Profile"}
    ]}],
    // Group 10 - Utilities
    [
      { id: "eye", icon: "eye", label: "Visibility", dd: [
        {h:"VISIBILITY"},{icon:"eye",label:"Show/Hide All Drawings"},{icon:"eye",label:"Show/Hide Indicators"},{icon:"eye",label:"Show/Hide Positions"}
      ]},
      { id: "magnet", icon: "magnet", label: "Magnet", dd: [
        {h:"MAGNET STRENGTH"},{icon:"magnet",label:"Off"},{icon:"magnet",label:"Weak"},{icon:"magnet",label:"Strong"}
      ]},
      { id: "lock", icon: "lock", label: "Lock" },
    ],
  ];
  // Group 11 - Actions
  const actionTools = [
    { id: "trash", icon: "trash", label: "Delete", danger: true, dd: [
      {h:"DELETE"},{icon:"trash",label:"Delete All Drawings"},{icon:"trash",label:"Delete All Indicators"},{icon:"trash",label:"Delete All Objects"}
    ]},
    { id: "undo", icon: "undo", label: "Undo" },
    { id: "redo", icon: "redo", label: "Redo" },
  ];

  const priceLabels = ["127.100","127.000","126.900","126.800","126.700","126.600","126.500","126.400","126.300","126.200"];
  const timeLabels = ["16:36","16:46","16:56","17:01","17:06","17:11","17:16","17:21","17:26","17:31","17:36","17:41","17:46","17:51"];

  const closeWindows = () => { setDropdown(null); setLogoMenu(false); setFaqOpen(false); setNewsOpen(false); setLayoutOpen(false); setIndOpen(false); setIndSearch(""); setIndSelected(null); setSDrop(null); setColorPicker(null); setScreenshotOpen(false); setLayersOpen(false); setSettDrop(null); setProfileOpen(false); setClosing(new Set()); };
  // closeAll is triggered by backdrop/outside clicks — intentionally does NOT close the indicators window
  const closeAll = () => { setDropdown(null); setLogoMenu(false); setReplayOpts(false); setGotoOpen(false); setSymbolOpen(false); setChartTypeOpen(false); setSymbolSearch(""); setTfOpen(false); setTfCat(null); setTfUnitOpen(false); setFaqOpen(false); setNewsOpen(false); setLayoutOpen(false); setSDrop(null); setColorPicker(null); setScreenshotOpen(false); setLayersOpen(false); setSettDrop(null); setProfileOpen(false); setClosing(new Set()); };

  // Render a tool button
  const renderTB = (t, ref) => {
    const act = tool === t.id;
    const h = hov === t.id;
    const ddOpen = dropdown === t.id;
    let col = c.ts;
    if (act) col = c.acL;
    else if (h && t.danger) col = c.rd;
    else if (h) col = c.tx;

    return (
      <div key={t.id} style={{ position: "relative", width: "100%" }}
        onMouseEnter={() => setHov(t.id)} onMouseLeave={() => setHov(null)}>
        <button
          ref={ref}
          onClick={(e) => {
            e.stopPropagation();
            setTool(t.id);
            if (t.dd) {
              const rect = e.currentTarget.getBoundingClientRect();
              setDdPos({ top: rect.top, left: 38 });
              const opening = ddOpen ? null : t.id;
              // Close other dropdowns/menus only — leave floating windows open
              setLogoMenu(false); setReplayOpts(false); setGotoOpen(false); setSymbolOpen(false); setChartTypeOpen(false); setTfOpen(false); setTfUnitOpen(false);
              setDropdown(opening);
            } else {
              setDropdown(null);
            }
          }}
          style={{
            width: "100%", height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", cursor: "pointer", color: col, padding: 0,
            transition: "all 0.15s ease", position: "relative", fontFamily: F,
          }}>
          <I n={t.icon} s={15} cl={col}/>
          {t.dd && <div style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)" }}>
            <I n="chevRight" s={7} cl={act ? c.acL : c.tm} w={2}/>
          </div>}
          {act && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
          {h && !act && <div style={{ position: "absolute", bottom: 0, left: "25%", right: "25%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
        </button>
        {h && !ddOpen && !t.dd && <div style={{ position: "absolute", left: "calc(100% + 10px)", top: "50%", transform: "translateY(-50%)", background: c.el, border: `1px solid ${c.brH}`, padding: "4px 10px", fontSize: 10, fontWeight: 600, fontFamily: F, color: c.tx, whiteSpace: "nowrap", zIndex: 100, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", borderLeft: `2px solid ${act ? c.acL : c.brH}` }}>{t.label}</div>}
      </div>
    );
  };

  // Get dropdown items for current open dropdown
  const getDdItems = () => {
    const allTools = [...toolGroups.flat(), ...actionTools];
    const t = allTools.find(x => x.id === dropdown);
    if (!t || !t.dd) return null;
    if (Array.isArray(t.dd)) return t.dd;
    return [{h: t.label.toUpperCase()}, { icon: t.icon, label: t.label }];
  };

  const ddItems = getDdItems();

  return (
    <div style={{ width: "100%", height: "100vh", background: c.bg, fontFamily: F, color: c.tx, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zoom: 1.05 }}
      onClick={closeAll}>
      <style>{`
        @keyframes tlrWinIn  { from { opacity:0; transform:translate(-50%,-50%) scale(0.97) translateY(7px); } to { opacity:1; transform:translate(-50%,-50%) scale(1) translateY(0); } }
        @keyframes tlrWinOut { from { opacity:1; transform:translate(-50%,-50%) scale(1) translateY(0); } to { opacity:0; transform:translate(-50%,-50%) scale(0.97) translateY(7px); } }
        @keyframes tlrDropIn  { from { opacity:0; transform:translateY(-6px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes tlrDropOut { from { opacity:1; transform:translateY(0) scale(1); } to { opacity:0; transform:translateY(-6px) scale(0.98); } }
        @keyframes tlrPopIn  { from { opacity:0; transform:scale(0.97) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .tlr-nospinner::-webkit-outer-spin-button,.tlr-nospinner::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .tlr-nospinner{-moz-appearance:textfield}
        .tlr-unit-sel{background:transparent;border:1px solid rgba(140,160,255,0.2);color:rgba(255,255,255,0.7);font-size:8px;padding:2px 4px;outline:none;cursor:pointer;appearance:none;-webkit-appearance:none}
      `}</style>

      {dropdown && ddItems && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "fixed", top: ddPos.top, left: ddPos.left, zIndex: 9000,
          background: c.sf, border: `1px solid ${c.brH}`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`,
          minWidth: 190, fontFamily: F, animation:"tlrDropIn 0.15s ease",
        }}>
          <div style={{ position: "sticky", top: 0, height: 2, background: `linear-gradient(90deg, ${c.ac}, ${c.acL}, ${c.ac})`, zIndex: 1 }}/>
          <div style={{ padding: "4px 0" }}>
            {ddItems.map((item, i) => {
              if (item.h) return (
                <div key={i} style={{ padding: "6px 14px 3px", fontSize: 7, fontWeight: 700, color: c.tm, letterSpacing: "0.06em" }}>{item.h}
                  {i > 0 && <div style={{ height: 1, marginTop: 3, marginBottom: -3, background: `linear-gradient(90deg, transparent, ${c.br}, transparent)` }}/>}
                </div>
              );
              const firstInGroup = i > 0 && ddItems[i-1]?.h;
              const isPinned = toolPinned.includes(item.label);
              const rowHov = hov===`dd-${i}` || hov===`ddpin-${i}`;
              return (
                <div key={i}
                  onMouseEnter={() => setHov(`dd-${i}`)} onMouseLeave={() => setHov(null)}
                  style={{
                    display: "flex", alignItems: "center", padding: "4px 8px 4px 14px",
                    background: firstInGroup ? c.acD : rowHov ? "rgba(255,255,255,0.03)" : "transparent",
                    position: "relative",
                  }}>
                  <button
                    onClick={() => { setTool(dropdown); setDropdown(null); }}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "2px 0",
                      background: "transparent", border: "none", cursor: "pointer",
                      color: firstInGroup ? c.acL : rowHov ? c.tx : c.ts,
                      fontSize: 10, fontWeight: firstInGroup ? 700 : 500, fontFamily: F,
                    }}>
                    <I n={item.icon} s={13} cl={firstInGroup ? c.acL : rowHov ? c.tx : c.ts}/>
                    {item.label}
                  </button>
                  <div onClick={(e) => {
                    e.stopPropagation();
                    setToolPinned(prev => isPinned ? prev.filter(x => x !== item.label) : [...prev, item.label]);
                  }}
                    onMouseEnter={() => setHov(`ddpin-${i}`)} onMouseLeave={() => setHov(`dd-${i}`)}
                    style={{
                      padding: 3, cursor: "pointer", marginLeft: 4, flexShrink: 0,
                      opacity: isPinned ? 1 : hov===`ddpin-${i}` ? 1 : rowHov ? 0.7 : 0.8,
                      transform: hov===`ddpin-${i}` && !isPinned ? "rotate(-25deg) scale(1.15)" : "none",
                      transition: "all 0.15s",
                    }}>
                    <I n={isPinned ? "pinFill" : "pin"} s={9} cl={isPinned ? c.gold : hov===`ddpin-${i}` ? c.gold : c.ts}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {(indOpen || closing.has("ind")) && (()=>{
        const indTabs=[["active","Active"],["pinned","Pinned"],["all","All"],["trend","Trend"],["momentum","Momentum"],["volatility","Volatility"],["volume","Volume"],["sessions","Sessions"],["others","Others"]];
        const indTabIdx=indTabs.findIndex(([id])=>id===indCat);
        const closeInd=()=>{animClose(setIndOpen,"ind");setIndSearch("");setIndSelected(null);};
        const tabAccent=(id)=> id==="active"?c.gn : id==="pinned"?c.gold : c.acL;
        const tabCount=(id)=> id==="active"?indActive.length : id==="pinned"?indPinned.length : id==="all"?indicatorData.length : indicatorData.filter(i=>i.cat===id).length;
        return (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:`calc(50% + ${indPos.y}px)`,left:`calc(50% + ${indPos.x}px)`,transform:"translate(-50%,-50%)",width:700,height:580,zIndex:9001,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.85), 0 0 24px ${c.acG}`,fontFamily:F,display:"flex",flexDirection:"column",animation:closing.has("ind")?"tlrWinOut 0.15s ease forwards":"tlrWinIn 0.18s ease"}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
          <div onMouseDown={(e)=>{e.preventDefault();setDragging({target:"ind",startX:e.clientX,startY:e.clientY,ox:indPos.x,oy:indPos.y});}} style={{display:"flex",alignItems:"center",padding:"9px 14px",cursor:"move",userSelect:"none",flexShrink:0}}>
            <I n="indicator" s={15} cl={c.acL}/><span style={{fontSize:12,fontWeight:700,flex:1,marginLeft:8,color:c.tx}}>Indicators</span>
            {indActive.length>0 && <span style={{fontSize:9,color:c.gn,marginRight:12,fontWeight:700}}>{indActive.length} active</span>}
            <div onMouseDown={(e)=>e.stopPropagation()} onClick={closeInd} onMouseEnter={()=>setSwHov("xInd")} onMouseLeave={()=>setSwHov(null)} style={{cursor:"pointer",padding:4}}><I n="x" s={18} cl={swHov==="xInd"?c.rd:c.ts}/></div>
          </div>
          <div style={{height:4,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>
          <div style={{padding:"8px 14px",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",background:c.well,border:`1px solid ${c.brH}`,padding:"5px 9px",gap:6}}>
              <I n="search" s={11} cl={c.tm}/>
              <input type="text" placeholder="Search indicators…" value={indSearch} onChange={(e)=>setIndSearch(e.target.value)}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9.5,fontFamily:F,padding:0}}/>
              {indSearch && <div onClick={()=>setIndSearch("")} style={{cursor:"pointer",fontSize:13,color:c.tm,lineHeight:1,paddingRight:2}}>×</div>}
            </div>
          </div>
          {/* Tab bar */}
          <div style={{position:"relative",display:"flex",flexShrink:0}}>
            {indTabs.map(([id,label])=>{
              const isAct=indCat===id;
              const accent=tabAccent(id);
              const cnt=tabCount(id);
              return (
                <button key={id} onClick={()=>setIndCat(id)}
                  style={{flex:1,padding:"9px 2px",border:"none",background:"transparent",fontFamily:F,cursor:"pointer",
                    color: isAct ? accent : (id==="active" ? c.gn : id==="pinned" ? c.gold : c.ts),
                    fontSize:10,fontWeight:isAct?700:500,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:3,
                    transition:"color 0.2s ease",whiteSpace:"nowrap",overflow:"hidden",opacity:isAct?1:id==="active"||id==="pinned"?0.7:1}}>
                  {label}
                  {(cnt>0||(id!=="active"&&id!=="pinned")) && <span style={{fontSize:9,fontWeight:700,color:isAct?accent:(id==="active"?c.gn:id==="pinned"?c.gold:c.tm),marginLeft:1,opacity:isAct?1:id==="active"||id==="pinned"?0.7:1}}>{cnt}</span>}
                </button>
              );
            })}
            <div style={{position:"absolute",bottom:0,height:2,
              width:`${100/indTabs.length}%`,
              left:`${indTabIdx*(100/indTabs.length)}%`,
              transition:"left 0.25s cubic-bezier(0.4,0,0.2,1), background 0.2s ease",
              background:`linear-gradient(90deg,transparent,${tabAccent(indCat)},transparent)`,
              boxShadow:`0 0 8px ${tabAccent(indCat)}55`}}/>
          </div>
          <div className="tlr-scroll" style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
            {indFiltered.length===0 && (
              <div style={{padding:"28px 14px",textAlign:"center",fontSize:9,color:c.tm}}>
                {indCat==="pinned"?"No pinned indicators yet.":indCat==="active"?"No active indicators.":"No results found."}
              </div>
            )}
            {indFiltered.map(ind=>{
              const isAct=indActive.includes(ind.id);
              const isPinned=indPinned.includes(ind.id);
              const isSel=indSelected===ind.id;
              const isH=swHov===`ind-${ind.id}`;
              const isPinHov=swHov===`pin-${ind.id}`;
              const isAddHov=swHov===`add-${ind.id}`;
              const isAddDn=swHov===`add-${ind.id}_dn`;
              const indRowHov=isH||isPinHov||isAddHov||isAddDn;
              return (
                <div key={ind.id}
                  onClick={(e)=>{if(!(e.target.closest('[data-indaction]')))setIndSelected(prev=>prev===ind.id?null:ind.id);}}
                  onMouseEnter={()=>setSwHov(`ind-${ind.id}`)} onMouseLeave={()=>setSwHov(null)}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"7px 14px",cursor:"pointer",
                    background:isAct?"rgba(38,67,247,0.07)":isSel?"rgba(255,255,255,0.045)":indRowHov?"rgba(255,255,255,0.022)":"transparent",
                    borderLeft:isAct?`2px solid ${c.acL}`:isSel?"2px solid rgba(140,160,255,0.3)":"2px solid transparent",
                    transition:"background 0.1s,border-color 0.1s"}}>
                  {/* abbr */}
                  <span style={{minWidth:44,flexShrink:0,fontSize:12,fontWeight:800,color:isAct?c.acL:isSel?c.tx:c.ts,fontFamily:F,letterSpacing:"0.02em"}}>{ind.abbr}</span>
                  {/* name + desc */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:isAct?700:isSel?600:500,color:isAct?c.acL:isSel?c.tx:isH?c.tx:c.ts,lineHeight:1.3,transition:"color 0.1s"}}>{ind.name}</div>
                    <div style={{fontSize:7.5,color:c.tm,lineHeight:1.3,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ind.desc}</div>
                  </div>
                  {/* pin */}
                  <div data-indaction="1"
                    onClick={(e)=>{e.stopPropagation();setIndPinned(prev=>isPinned?prev.filter(x=>x!==ind.id):[...prev,ind.id]);}}
                    onMouseEnter={()=>setSwHov(`pin-${ind.id}`)} onMouseLeave={()=>setSwHov(`ind-${ind.id}`)}
                    style={{width:17,height:17,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,
                      transform:isPinHov&&!isPinned?"rotate(-25deg) scale(1.15)":"none",
                      transition:"transform 0.15s,opacity 0.15s",
                      opacity:isPinned?1:isPinHov?1:indRowHov||isSel?0.6:0}}>
                    <I n={isPinned?"pinFill":"pin"} s={14} cl={isPinned?c.gold:isPinHov?c.gold:c.ts}/>
                  </div>
                  {/* add/remove button */}
                  <div data-indaction="1" style={{flexShrink:0,opacity:isAct?1:indRowHov||isSel?0.7:0,transition:"opacity 0.15s"}}>
                    <button
                      onClick={(e)=>{e.stopPropagation();setIndActive(prev=>isAct?prev.filter(x=>x!==ind.id):[...prev,ind.id]);}}
                      onMouseEnter={()=>setSwHov(`add-${ind.id}`)} onMouseLeave={()=>setSwHov(`ind-${ind.id}`)}
                      onMouseDown={(e)=>{e.stopPropagation();setSwHov(`add-${ind.id}_dn`);}} onMouseUp={()=>setSwHov(`add-${ind.id}`)}
                      style={{width:17,height:17,position:"relative",
                        boxSizing:"border-box",cursor:"pointer",padding:0,
                        background: isAct
                          ? isAddHov ? "rgba(255,80,104,0.12)" : "transparent"
                          : isAddHov ? "rgba(74,106,255,0.12)" : "transparent",
                        border: `1px solid ${isAct
                          ? isAddHov ? "rgba(255,80,104,0.55)" : c.acL
                          : isAddHov ? "rgba(74,106,255,0.55)" : "rgba(140,160,255,0.28)"}`,
                        transform: isAddDn ? "scale(0.88)" : "scale(1)",
                        transition:"background 0.12s,border-color 0.12s,transform 0.08s"}}>
                      {isAct && isAddHov
                        ? <svg width={7} height={7} viewBox="0 0 10 10" fill="none" stroke={c.rd} strokeWidth={2.2} strokeLinecap="round" style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",display:"block",pointerEvents:"none"}}><line x1={2} y1={2} x2={8} y2={8}/><line x1={8} y1={2} x2={2} y2={8}/></svg>
                        : <svg width={7} height={7} viewBox="0 0 10 10" fill="none"
                            stroke={isAct ? c.acL : isAddHov ? c.acL : "rgba(140,160,255,0.55)"}
                            strokeWidth={2.2} strokeLinecap="round" style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",display:"block",pointerEvents:"none"}}>
                            <line x1={5} y1={1} x2={5} y2={9}/><line x1={1} y1={5} x2={9} y2={5}/>
                          </svg>
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{height:4,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>
          <div style={{padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4,flexShrink:0}}>
            <button onClick={closeInd} onMouseEnter={()=>setSwHov("indCancel")} onMouseLeave={()=>setSwHov(null)} style={{height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:600,color:swHov==="indCancel"?c.tx:c.ts,background:swHov==="indCancel"?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.03)",border:`1px solid ${swHov==="indCancel"?"rgba(140,160,255,0.35)":"rgba(140,160,255,0.22)"}`,transition:"background 0.12s,border-color 0.12s,color 0.12s"}}>Cancel</button>
            <button onClick={closeInd} onMouseEnter={()=>setSwHov("indOk")} onMouseLeave={()=>setSwHov(null)} style={{height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:700,color:"#fff",background:swHov==="indOk"?`linear-gradient(135deg,${c.acL},#6A8AFF)`:`linear-gradient(135deg,${c.ac},${c.acL})`,border:`1px solid ${swHov==="indOk"?c.acL:"rgba(74,106,255,0.5)"}`,WebkitFontSmoothing:"antialiased",boxShadow:swHov==="indOk"?`0 2px 12px rgba(38,67,247,0.45)`:`0 2px 6px rgba(38,67,247,0.22)`,transition:"background 0.12s,border-color 0.12s,box-shadow 0.12s"}}>OK</button>
          </div>
        </div>
        );
      })()}
      {(settingsOpen || closing.has("settings")) && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:`calc(50% + ${settingsPos.y}px)`,left:`calc(50% + ${settingsPos.x}px)`,transform:"translate(-50%,-50%)",width:460,height:560,zIndex:9002,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.85), 0 0 24px ${c.acG}`,fontFamily:F,display:"flex",flexDirection:"column",animation:closing.has("settings")?"tlrWinOut 0.15s ease forwards":"tlrWinIn 0.18s ease"}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
          <div onMouseDown={(e)=>{e.preventDefault();setDragging({target:"settings",startX:e.clientX,startY:e.clientY,ox:settingsPos.x,oy:settingsPos.y});}} style={{display:"flex",alignItems:"center",padding:"9px 14px",cursor:"move",userSelect:"none",flexShrink:0}}>
            <I n="settings" s={15} cl={c.acL}/><span style={{fontSize:12,fontWeight:700,flex:1,marginLeft:8}}>Settings</span>
            <div onMouseDown={(e)=>e.stopPropagation()} onClick={()=>animClose(setSettingsOpen,"settings")} onMouseEnter={()=>setSwHov("xSettings")} onMouseLeave={()=>setSwHov(null)} style={{cursor:"pointer",padding:4}}><I n="x" s={18} cl={swHov==="xSettings"?c.rd:c.ts}/></div>
          </div>
          <div style={{height:4,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>
          <div className="tlr-scroll" style={{flex:1,overflowY:"auto",padding:"16px 18px"}}>

            {/* ── CANDLE COLORS ─────────────────────────────── */}
            <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:10}}>CANDLE COLORS</div>
            <div style={{display:"flex",gap:10,marginBottom:4}}>
              {/* Bullish */}
              <div style={{flex:1,background:c.bg,border:`1px solid rgba(0,212,161,0.15)`,padding:"10px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <div style={{width:8,height:8,background:c.gn,transform:"rotate(45deg)"}}/>
                  <span style={{fontSize:8,fontWeight:800,color:c.gn,letterSpacing:"0.06em"}}>BULLISH</span>
                </div>
                {[["Body","bullBody"],["Border","bullBorder"],["Wick","bullWick"]].map(([lbl,key],i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 0"}}>
                    <span style={{fontSize:9.5,color:c.ts}}>{lbl}</span>
                    <div onMouseEnter={()=>setSwHov(key)} onMouseLeave={()=>setSwHov(null)} onClick={(e)=>openCP(e,key)}
                      style={{width:20,height:20,background:settings[key],border:`1px solid ${swHov===key?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)"}`,cursor:"pointer",flexShrink:0,boxShadow:swHov===key?`0 0 8px ${settings[key]}`:"inset 0 1px 3px rgba(0,0,0,0.5)",transition:"border-color 0.12s,box-shadow 0.12s"}}/>
                  </div>
                ))}
              </div>
              {/* Bearish */}
              <div style={{flex:1,background:c.bg,border:`1px solid rgba(255,80,104,0.15)`,padding:"10px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <div style={{width:8,height:8,background:c.rd,transform:"rotate(45deg)"}}/>
                  <span style={{fontSize:8,fontWeight:800,color:c.rd,letterSpacing:"0.06em"}}>BEARISH</span>
                </div>
                {[["Body","bearBody"],["Border","bearBorder"],["Wick","bearWick"]].map(([lbl,key],i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 0"}}>
                    <span style={{fontSize:9.5,color:c.ts}}>{lbl}</span>
                    <div onMouseEnter={()=>setSwHov(key)} onMouseLeave={()=>setSwHov(null)} onClick={(e)=>openCP(e,key)}
                      style={{width:20,height:20,background:settings[key],border:`1px solid ${swHov===key?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)"}`,cursor:"pointer",flexShrink:0,boxShadow:swHov===key?`0 0 8px ${settings[key]}`:"inset 0 1px 3px rgba(0,0,0,0.5)",transition:"border-color 0.12s,box-shadow 0.12s"}}/>
                  </div>
                ))}
              </div>
            </div>

            {/* Unified Bar Color */}
            <div style={{background:c.bg,border:`1px solid ${c.br}`,padding:"8px 12px",marginBottom:18}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {Chk(settings.unifiedBarColor,"unifiedBarColor","chkUnified")}
                <span style={{fontSize:9.5,color:c.ts,flex:1}}>Unified Bar Color</span>
                <div
                  onMouseEnter={()=>settings.unifiedBarColor&&setSwHov("unifiedBarColorVal")}
                  onMouseLeave={()=>setSwHov(null)}
                  onClick={(e)=>settings.unifiedBarColor&&openCP(e,"unifiedBarColorVal")}
                  style={{width:20,height:20,background:settings.unifiedBarColorVal,border:`1px solid ${swHov==="unifiedBarColorVal"?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)"}`,cursor:settings.unifiedBarColor?"pointer":"default",flexShrink:0,boxShadow:swHov==="unifiedBarColorVal"?`0 0 8px ${settings.unifiedBarColorVal}`:"inset 0 1px 3px rgba(0,0,0,0.5)",transition:"border-color 0.12s,box-shadow 0.12s,opacity 0.18s",opacity:settings.unifiedBarColor?1:0.3,filter:settings.unifiedBarColor?"none":"grayscale(1) brightness(0.5)"}}
                />
              </div>
            </div>

            {/* ── CANVAS ────────────────────────────────────── */}
            <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,marginBottom:14}}/>
            <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:10}}>CANVAS</div>
            <div style={{background:c.bg,border:`1px solid ${c.br}`,padding:"2px 12px",marginBottom:18}}>
              {[["Background","background"],["Scale Text","scaleTextColor"],["Scale Lines","scaleLineColor"]].map(([lbl,key])=>(
                <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0"}}>
                  <span style={{fontSize:9.5,color:c.ts}}>{lbl}</span>
                  <div onMouseEnter={()=>setSwHov(key)} onMouseLeave={()=>setSwHov(null)} onClick={(e)=>openCP(e,key)}
                    style={{width:20,height:20,background:settings[key],border:`1px solid ${swHov===key?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)"}`,cursor:"pointer",flexShrink:0,boxShadow:swHov===key?`0 0 8px ${settings[key]}`:"inset 0 1px 3px rgba(0,0,0,0.5)",transition:"border-color 0.12s,box-shadow 0.12s"}}/>
                </div>
              ))}
              {/* Grid Lines row */}
              {(()=>{
                const gStyle=settings.gridLineStyle||"solid", gThick=settings.gridLineThickness||1;
                const gDash={solid:"none",dashed:"5,4",dotted:"1.5,4",longDash:"10,5"}[gStyle]||"none";
                const gH=Math.max(gThick*1.8+4,8);
                return (
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0"}}>
                    {Chk(settings.gridLinesOn,"gridLinesOn","chkGrid")}
                    <span style={{fontSize:9.5,color:c.ts,flex:1}}>Grid Lines</span>
                    <div onMouseEnter={()=>setSwHov("gsb")} onMouseLeave={()=>setSwHov(null)}
                      onClick={(e)=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSettDropPos({top:r.bottom+4,left:r.left});setSettDrop(settDrop==="gridStyle"?null:"gridStyle");}}
                      style={{display:"flex",alignItems:"center",gap:3,padding:"0 5px",height:20,background:swHov==="gsb"||settDrop==="gridStyle"?"rgba(140,160,255,0.08)":"rgba(140,160,255,0.04)",border:`1px solid ${swHov==="gsb"||settDrop==="gridStyle"?"rgba(140,160,255,0.22)":"rgba(140,160,255,0.10)"}`,cursor:"pointer",transition:"all 0.12s",flexShrink:0}}>
                      <svg width={24} height={10}><line x1={1} y1={5} x2={23} y2={5} stroke={c.ts} strokeWidth={1.2} strokeDasharray={gDash}/></svg>
                      <svg width={7} height={5}><path d="M0,0 L3.5,4.5 L7,0" stroke={c.tm} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div onMouseEnter={()=>setSwHov("gtb")} onMouseLeave={()=>setSwHov(null)}
                      onClick={(e)=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSettDropPos({top:r.bottom+4,left:r.left-20});setSettDrop(settDrop==="gridThick"?null:"gridThick");}}
                      style={{display:"flex",alignItems:"center",gap:3,padding:"0 5px",height:20,background:swHov==="gtb"||settDrop==="gridThick"?"rgba(140,160,255,0.08)":"rgba(140,160,255,0.04)",border:`1px solid ${swHov==="gtb"||settDrop==="gridThick"?"rgba(140,160,255,0.22)":"rgba(140,160,255,0.10)"}`,cursor:"pointer",transition:"all 0.12s",flexShrink:0}}>
                      <svg width={24} height={Math.max(gH,10)}><line x1={1} y1={Math.max(gH,10)/2} x2={23} y2={Math.max(gH,10)/2} stroke={c.ts} strokeWidth={gThick*1.2} strokeLinecap="round"/></svg>
                      <svg width={7} height={5}><path d="M0,0 L3.5,4.5 L7,0" stroke={c.tm} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div onMouseEnter={()=>setSwHov("gridColor")} onMouseLeave={()=>setSwHov(null)} onClick={(e)=>openCP(e,"gridColor")}
                      style={{width:20,height:20,background:settings.gridColor,border:`1px solid ${swHov==="gridColor"?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)"}`,cursor:"pointer",flexShrink:0,boxShadow:swHov==="gridColor"?`0 0 8px ${settings.gridColor}`:"inset 0 1px 3px rgba(0,0,0,0.5)",transition:"border-color 0.12s,box-shadow 0.12s"}}/>
                  </div>
                );
              })()}
              {/* Crosshair row */}
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0"}}>
                {Chk(settings.crosshairOn,"crosshairOn","chkCross")}
                <span style={{fontSize:9.5,color:c.ts,flex:1}}>Crosshair</span>
                <div onMouseEnter={()=>setSwHov("crosshairColor")} onMouseLeave={()=>setSwHov(null)} onClick={(e)=>openCP(e,"crosshairColor")}
                  style={{width:20,height:20,background:settings.crosshairColor,border:`1px solid ${swHov==="crosshairColor"?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)"}`,cursor:"pointer",flexShrink:0,boxShadow:swHov==="crosshairColor"?`0 0 8px ${settings.crosshairColor}`:"inset 0 1px 3px rgba(0,0,0,0.5)",transition:"border-color 0.12s,box-shadow 0.12s"}}/>
              </div>
              {/* Price Line row */}
              {(()=>{
                const pStyle=settings.priceLineStyle||"solid", pThick=settings.priceLineThickness||1;
                const pDash={solid:"none",dashed:"5,4",dotted:"1.5,4",longDash:"10,5"}[pStyle]||"none";
                const pH=Math.max(pThick*1.8+4,8);
                return (
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0"}}>
                    {Chk(settings.priceLine,"priceLine","chkPrice")}
                    <span style={{fontSize:9.5,color:c.ts,flex:1}}>Price Line</span>
                    <div onMouseEnter={()=>setSwHov("psb")} onMouseLeave={()=>setSwHov(null)}
                      onClick={(e)=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSettDropPos({top:r.bottom+4,left:r.left});setSettDrop(settDrop==="priceStyle"?null:"priceStyle");}}
                      style={{display:"flex",alignItems:"center",gap:3,padding:"0 5px",height:20,background:swHov==="psb"||settDrop==="priceStyle"?"rgba(140,160,255,0.08)":"rgba(140,160,255,0.04)",border:`1px solid ${swHov==="psb"||settDrop==="priceStyle"?"rgba(140,160,255,0.22)":"rgba(140,160,255,0.10)"}`,cursor:"pointer",transition:"all 0.12s",flexShrink:0}}>
                      <svg width={24} height={10}><line x1={1} y1={5} x2={23} y2={5} stroke={c.ts} strokeWidth={1.2} strokeDasharray={pDash}/></svg>
                      <svg width={7} height={5}><path d="M0,0 L3.5,4.5 L7,0" stroke={c.tm} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div onMouseEnter={()=>setSwHov("ptb")} onMouseLeave={()=>setSwHov(null)}
                      onClick={(e)=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSettDropPos({top:r.bottom+4,left:r.left-20});setSettDrop(settDrop==="priceThick"?null:"priceThick");}}
                      style={{display:"flex",alignItems:"center",gap:3,padding:"0 5px",height:20,background:swHov==="ptb"||settDrop==="priceThick"?"rgba(140,160,255,0.08)":"rgba(140,160,255,0.04)",border:`1px solid ${swHov==="ptb"||settDrop==="priceThick"?"rgba(140,160,255,0.22)":"rgba(140,160,255,0.10)"}`,cursor:"pointer",transition:"all 0.12s",flexShrink:0}}>
                      <svg width={24} height={Math.max(pH,10)}><line x1={1} y1={Math.max(pH,10)/2} x2={23} y2={Math.max(pH,10)/2} stroke={c.ts} strokeWidth={pThick*1.2} strokeLinecap="round"/></svg>
                      <svg width={7} height={5}><path d="M0,0 L3.5,4.5 L7,0" stroke={c.tm} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div onMouseEnter={()=>setSwHov("priceLineColor")} onMouseLeave={()=>setSwHov(null)} onClick={(e)=>openCP(e,"priceLineColor")}
                      style={{width:20,height:20,background:settings.priceLineColor,border:`1px solid ${swHov==="priceLineColor"?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)"}`,cursor:"pointer",flexShrink:0,boxShadow:swHov==="priceLineColor"?`0 0 8px ${settings.priceLineColor}`:"inset 0 1px 3px rgba(0,0,0,0.5)",transition:"border-color 0.12s,box-shadow 0.12s"}}/>
                  </div>
                );
              })()}
            </div>

            {/* ── CHART ─────────────────────────────────────── */}
            <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,marginBottom:14}}/>
            <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:10}}>CHART</div>
            <div style={{background:c.bg,border:`1px solid ${c.br}`,padding:"2px 12px",marginBottom:18}}>
              {[["Time Format","timeFormat","chartTimeFormat",70],["Time Zone","timezone","chartTimezone",130],["Precision","precision","chartPrecision",100]].map(([lbl,sKey,dropKey,w])=>(
                <div key={lbl} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0"}}>
                  <span style={{fontSize:9.5,color:c.ts}}>{lbl}</span>
                  <div onMouseEnter={()=>setSwHov(dropKey)} onMouseLeave={()=>setSwHov(null)}
                    onClick={(e)=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSettDropPos({top:r.bottom+4,left:r.right-w});setSettDrop(settDrop===dropKey?null:dropKey);}}
                    style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",height:22,width:w,background:swHov===dropKey||settDrop===dropKey?"rgba(140,160,255,0.08)":"rgba(140,160,255,0.04)",border:`1px solid ${swHov===dropKey||settDrop===dropKey?"rgba(140,160,255,0.22)":"rgba(140,160,255,0.10)"}`,cursor:"pointer",transition:"all 0.12s",flexShrink:0}}>
                    <span style={{flex:1,fontSize:9,color:c.ts,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{settings[sKey]}</span>
                    <svg width={7} height={5}><path d="M0,0 L3.5,4.5 L7,0" stroke={c.tm} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              ))}
            </div>

            {/* ── TRADING ───────────────────────────────────── */}
            <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,marginBottom:14}}/>
            <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:10}}>TRADING</div>
            <div style={{background:c.bg,border:`1px solid ${c.br}`,padding:"2px 12px",marginBottom:4}}>
              {[["Show Order History","showOrderHistory","togOrderHist"],["Show Open Orders","showOpenOrders","togOpenOrders"]].map(([lbl,key,hk])=>(
                <div key={hk} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0"}}>
                  <span style={{fontSize:9.5,color:c.ts}}>{lbl}</span>
                  <Toggle on={settings[key]} onClick={()=>updateSetting(key,!settings[key])} hk={hk} c={c} swHov={swHov} setSwHov={setSwHov}/>
                </div>
              ))}
            </div>

            {/* ── TEMPLATES ─────────────────────────────────── */}
            {(()=>{
              const defaultTpls = [{n:"Dark Classic",cols:["#00D4A1","#FF5068","#2643F7"]},{n:"Professional",cols:["#26A69A","#EF5350","#1565C0"]},{n:"Ocean Night",cols:["#00BCD4","#FF4081","#00E5FF"]},{n:"Amber Dusk",cols:["#FF9800","#F44336","#FFC107"]},{n:"Forest Deep",cols:["#66BB6A","#81C784","#4CAF50"]},{n:"Midnight",cols:["#42A5F5","#EF5350","#7E57C2"]},{n:"Crimson",cols:["#F44336","#9C27B0","#E91E63"]},{n:"Arctic Frost",cols:["#80DEEA","#FFAB40","#4FC3F7"]},{n:"Cyber Green",cols:["#00E676","#FF1744","#76FF03"]},{n:"Rose Gold",cols:["#F48FB1","#FFB74D","#CE93D8"]}];
              const allTpls = [...customTemplates,...defaultTpls];
              const cur = allTpls.find(t=>t.n===settings.chartTemplate);
              return (
                <div>
                  <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,marginBottom:14}}/>
                  <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:10}}>TEMPLATES</div>

                  {/* Active template picker */}
                  <div onMouseEnter={()=>setSwHov("tplTrig")} onMouseLeave={()=>setSwHov(null)}
                    onClick={(e)=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSettDropPos({top:r.bottom+4,left:r.left,w:r.width});setSettDrop(settDrop==="chartTemplate"?null:"chartTemplate");}}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",marginBottom:10,background:swHov==="tplTrig"||settDrop==="chartTemplate"?"rgba(140,160,255,0.10)":"rgba(140,160,255,0.05)",border:`1px solid ${swHov==="tplTrig"||settDrop==="chartTemplate"?"rgba(140,160,255,0.30)":"rgba(140,160,255,0.15)"}`,cursor:"pointer",transition:"all 0.12s"}}>
                    <span style={{flex:1,fontSize:9.5,color:c.tx,fontFamily:F,fontWeight:600}}>{settings.chartTemplate||"Select Template"}</span>
                    {cur && <div style={{display:"flex",gap:4,flexShrink:0}}>{cur.cols.map((col,i)=><div key={i} style={{width:9,height:9,borderRadius:"50%",background:col,boxShadow:`0 0 5px ${col}99`}}/>)}</div>}
                    <svg width={7} height={5} style={{flexShrink:0,marginLeft:4}}><path d="M0,0 L3.5,4.5 L7,0" stroke={c.ts} strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>

                  {/* Save current as template */}
                  <div style={{background:"rgba(140,160,255,0.04)",border:`1px solid rgba(140,160,255,0.15)`,padding:"10px 12px",marginBottom:4}}>
                    <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>SAVE / LOAD TEMPLATE</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <input
                        value={tplNameInput}
                        onChange={e=>setTplNameInput(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&saveCustomTemplate()}
                        placeholder="Template name…"
                        style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${swHov==="tplInput"?"rgba(140,160,255,0.45)":"rgba(140,160,255,0.22)"}`,color:c.tx,fontSize:9.5,fontFamily:F,padding:"6px 9px",outline:"none",transition:"border-color 0.14s"}}
                        onFocus={()=>setSwHov("tplInput")} onBlur={()=>setSwHov(null)}
                      />
                      <div onMouseEnter={()=>setSwHov("tplSave")} onMouseLeave={()=>setSwHov(null)}
                        onClick={saveCustomTemplate}
                        style={{padding:"6px 12px",background:swHov==="tplSave"?`linear-gradient(135deg,${c.ac},${c.acL})`:`linear-gradient(135deg,rgba(38,67,247,0.35),rgba(74,106,255,0.35))`,border:`1px solid ${swHov==="tplSave"?"transparent":"rgba(74,106,255,0.45)"}`,cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff",fontFamily:F,flexShrink:0,transition:"all 0.14s",whiteSpace:"nowrap",letterSpacing:"0.04em"}}>
                        Save As
                      </div>
                      <div onMouseEnter={()=>setSwHov("tplLoadBtn")} onMouseLeave={()=>setSwHov(null)}
                        onClick={(e)=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSettDropPos({top:r.bottom+4,left:r.right-140,w:140});setSettDrop(settDrop==="loadTemplate"?null:"loadTemplate");}}
                        style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",background:swHov==="tplLoadBtn"||settDrop==="loadTemplate"?"rgba(140,160,255,0.10)":"rgba(140,160,255,0.04)",border:`1px solid ${swHov==="tplLoadBtn"||settDrop==="loadTemplate"?"rgba(140,160,255,0.35)":"rgba(140,160,255,0.18)"}`,cursor:"pointer",fontSize:9,fontWeight:600,color:c.ts,fontFamily:F,flexShrink:0,transition:"all 0.14s",whiteSpace:"nowrap"}}>
                        Load
                        <svg width={8} height={5} viewBox="0 0 8 5"><path d="M0.5,0.5 L4,4 L7.5,0.5" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    </div>
                    <div onMouseEnter={()=>setSwHov("tplReset")} onMouseLeave={()=>setSwHov(null)}
                      onMouseDown={()=>setSwHov("tplReset_dn")} onMouseUp={()=>setSwHov("tplReset")}
                      onClick={()=>applyTemplate("Dark Classic")}
                      style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",
                        background:swHov==="tplReset_dn"?"rgba(38,67,247,0.18)":swHov==="tplReset"?"rgba(74,106,255,0.08)":"transparent",
                        border:`1px solid ${swHov==="tplReset_dn"?"rgba(74,106,255,0.55)":swHov==="tplReset"?"rgba(140,160,255,0.35)":"rgba(140,160,255,0.12)"}`,
                        color:swHov==="tplReset_dn"?c.acL:swHov==="tplReset"?c.tx:c.ts,
                        cursor:"pointer",fontSize:8,fontFamily:F,
                        transform:swHov==="tplReset_dn"?"scale(0.95)":"scale(1)",
                        transition:"background 0.12s,border-color 0.12s,color 0.12s,transform 0.08s"}}>
                      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 2 3 8 9 8"/></svg>
                      Reset to Default
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
          <div style={{height:2,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>
          <div style={{padding:"8px 14px",display:"flex",justifyContent:"flex-end",alignItems:"center",gap:6,flexShrink:0}}>
            <button onClick={()=>animClose(setSettingsOpen,"settings")} style={{height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:600,color:c.ts,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(140,160,255,0.22)",transition:"background 0.12s,border-color 0.12s"}}>Cancel</button>
            <button onClick={()=>animClose(setSettingsOpen,"settings")} style={{height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:700,color:"#fff",background:`linear-gradient(135deg,${c.ac},${c.acL})`,border:"1px solid rgba(74,106,255,0.5)",WebkitFontSmoothing:"antialiased",transition:"background 0.12s,border-color 0.12s"}}>OK</button>
          </div>
        </div>
      )}
      {(profileOpen || closing.has("profile")) && (()=>{
        const profTabs = [["account","Account"],["billing","Billing"]];
        const profTabIdx = profTabs.findIndex(([id])=>id===profileTab);
        const pwInputSx = { width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(140,160,255,0.22)", color:c.tx, fontSize:9.5, fontFamily:F, padding:"6px 9px", outline:"none", boxSizing:"border-box", transition:"border-color 0.14s" };
        const langLabels = { english:"English", arabic:"العربية", turkish:"Türkçe" };
        return (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:`calc(50% + ${profilePos.y}px)`,left:`calc(50% + ${profilePos.x}px)`,transform:"translate(-50%,-50%)",width:400,height:540,zIndex:9002,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.85), 0 0 24px ${c.acG}`,fontFamily:F,display:"flex",flexDirection:"column",animation:closing.has("profile")?"tlrWinOut 0.15s ease forwards":"tlrWinIn 0.18s ease"}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
          {/* Header */}
          <div onMouseDown={(e)=>{e.preventDefault();setDragging({target:"profile",startX:e.clientX,startY:e.clientY,ox:profilePos.x,oy:profilePos.y});}} style={{display:"flex",alignItems:"center",padding:"9px 14px",cursor:"move",userSelect:"none",flexShrink:0}}>
            <I n="user" s={15} cl={c.acL}/><span style={{fontSize:12,fontWeight:700,flex:1,marginLeft:8,color:c.tx}}>Profile</span>
            <div onMouseDown={(e)=>e.stopPropagation()} onClick={()=>animClose(setProfileOpen,"profile")} onMouseEnter={()=>setSwHov("xProfile")} onMouseLeave={()=>setSwHov(null)} style={{cursor:"pointer",padding:4}}><I n="x" s={18} cl={swHov==="xProfile"?c.rd:c.ts}/></div>
          </div>
          <div style={{height:4,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>
          {/* Tab bar with sliding indicator */}
          <div style={{position:"relative",display:"flex",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
            {profTabs.map(([id,label])=>{
              const isA = profileTab===id;
              return (
                <button key={id} onClick={()=>setProfileTab(id)}
                  style={{flex:1,padding:"8px 0",border:"none",background:"transparent",fontFamily:F,cursor:"pointer",color:isA?c.acL:c.ts,fontSize:9.5,fontWeight:isA?700:500,letterSpacing:"0.02em",transition:"color 0.2s ease"}}>
                  {label}
                </button>
              );
            })}
            {/* Sliding indicator */}
            <div style={{position:"absolute",bottom:0,height:2,
              width:"40%",
              left:`calc(${profTabIdx*50}% + 5%)`,
              transition:"left 0.25s cubic-bezier(0.4,0,0.2,1)",
              background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,
              boxShadow:`0 0 8px ${c.acG}`}}/>
          </div>
          {/* Content */}
          <div className="tlr-scroll" style={{flex:1,overflowY:"auto",padding:"16px 18px"}}>
            {profileTab==="account" && <>
              {/* Avatar + info */}
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>PROFILE PICTURE</div>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14,padding:"12px 14px",background:c.bg,border:`1px solid ${c.br}`}}>
                <div style={{position:"relative",flexShrink:0}}>
                  <div style={{width:52,height:52,borderRadius:"50%",border:`2px solid ${c.brH}`,boxShadow:`0 0 14px rgba(38,67,247,0.3)`,flexShrink:0}}>
                    <div style={{width:"100%",height:"100%",borderRadius:"50%",overflow:"hidden",background:`linear-gradient(135deg,#F0A030,${c.ac})`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {profileAvatar
                        ? <img src={profileAvatar} alt="avatar" style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center",display:"block"}}/>
                        : <span style={{fontSize:20,fontWeight:800,color:"#fff"}}>{(profileName||"T")[0].toUpperCase()}</span>}
                    </div>
                  </div>
                  <label
                    onMouseEnter={()=>setSwHov("prof-avatar-btn")} onMouseLeave={()=>setSwHov(null)}
                    onMouseDown={()=>setSwHov("prof-avatar-btn_dn")} onMouseUp={()=>setSwHov("prof-avatar-btn")}
                    style={{position:"absolute",bottom:-2,right:-2,width:17,height:17,borderRadius:"50%",
                      background:swHov==="prof-avatar-btn_dn"?c.ac:swHov==="prof-avatar-btn"?`linear-gradient(135deg,${c.acL},#6A8AFF)`:`linear-gradient(135deg,${c.ac},${c.acL})`,
                      border:`2px solid ${c.sf}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
                      boxShadow:swHov==="prof-avatar-btn"||swHov==="prof-avatar-btn_dn"?`0 0 8px ${c.acG}`:`0 1px 4px ${c.acG}`,
                      transform:swHov==="prof-avatar-btn_dn"?"scale(0.88)":"scale(1)",transition:"all 0.12s"}}>
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={(e)=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=(ev)=>setProfileAvatar(ev.target.result);r.readAsDataURL(f);}}}/>
                    <I n="screenshot" s={8} cl="#fff"/>
                  </label>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:7,color:c.tm,marginBottom:4,fontWeight:700,letterSpacing:"0.06em"}}>DISPLAY NAME</div>
                  {profileNameEdit ? (
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6}}>
                      <input autoFocus value={profileName} onChange={(e)=>setProfileName(e.target.value.slice(0,40))}
                        onKeyDown={(e)=>{if(e.key==="Enter"||e.key==="Escape"){setProfileNameEdit(false);setSwHov(null);}}}
                        style={{...pwInputSx,flex:1}}/>
                      <button
                        onClick={()=>{setProfileNameEdit(false);setSwHov(null);}}
                        onMouseEnter={()=>setSwHov("pn-save")} onMouseLeave={()=>setSwHov(null)}
                        onMouseDown={()=>setSwHov("pn-save_dn")} onMouseUp={()=>setSwHov("pn-save")}
                        style={{flexShrink:0,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",
                          background:swHov==="pn-save_dn"?c.ac:swHov==="pn-save"?`linear-gradient(135deg,${c.acL},#6A8AFF)`:`linear-gradient(135deg,${c.ac},${c.acL})`,
                          border:`1px solid ${swHov==="pn-save"||swHov==="pn-save_dn"?c.acL:"rgba(74,106,255,0.5)"}`,
                          transform:swHov==="pn-save_dn"?"scale(0.92)":"scale(1)",
                          transition:"background 0.12s,border-color 0.12s,transform 0.08s"}}>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{pointerEvents:"none"}}><polyline points="4 12 9 17 20 6"/></svg>
                      </button>
                    </div>
                  ) : (
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                      <span style={{fontSize:11,fontWeight:700,color:c.tx}}>{profileName}</span>
                      <button
                        onClick={()=>setProfileNameEdit(true)}
                        onMouseEnter={()=>setSwHov("pn-edit")} onMouseLeave={()=>setSwHov(null)}
                        onMouseDown={()=>setSwHov("pn-edit_dn")} onMouseUp={()=>setSwHov("pn-edit")}
                        style={{flexShrink:0,width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",
                          background:"none",border:"none",
                          transform:swHov==="pn-edit_dn"?"scale(0.88)":"scale(1)",
                          transition:"transform 0.08s,opacity 0.12s",
                          opacity:swHov==="pn-edit_dn"?0.7:1}}>
                        <svg width={8} height={8} viewBox="0 0 24 24" fill="none"
                          stroke={c.acL}
                          strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{pointerEvents:"none"}}>
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    </div>
                  )}
                  <div style={{fontSize:8,color:c.tm}}>Click the camera icon to upload a photo</div>
                </div>
                <span style={{padding:"3px 8px",background:c.acD,border:`1px solid ${c.acB}`,fontSize:7,fontWeight:800,color:c.acL,letterSpacing:"0.06em",alignSelf:"flex-start"}}>PRO</span>
              </div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              {/* Account info */}
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>ACCOUNT</div>
              <div style={{background:c.bg,border:`1px solid ${c.br}`,marginBottom:14}}>
                {[["User ID","#TLR-00471"],["Email","trader@talaria.io"],["Language",null]].map(([k,v],i,arr)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",borderBottom:i<arr.length-1?`1px solid ${c.br}`:"none"}}>
                    <span style={{fontSize:9.5,color:c.ts,flexShrink:0,marginRight:10}}>{k}</span>
                    {k==="Language"
                      ? (()=>{const isH=swHov==="prof-lang-btn"||settDrop==="profLang";return(
                          <div onClick={(e)=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSettDropPos({top:r.bottom+4,left:r.right-130,w:140});setSettDrop(settDrop==="profLang"?null:"profLang");}}
                            onMouseEnter={()=>setSwHov("prof-lang-btn")} onMouseLeave={()=>setSwHov(null)}
                            style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",cursor:"pointer",minWidth:110,justifyContent:"space-between",
                              background:isH?"rgba(140,160,255,0.08)":"rgba(255,255,255,0.03)",
                              border:`1px solid ${isH?"rgba(140,160,255,0.35)":"rgba(140,160,255,0.18)"}`,
                              transition:"all 0.12s"}}>
                            <span style={{fontSize:9.5,color:c.ts,fontFamily:F}}>{langLabels[profileLang]||"English"}</span>
                            <svg width={8} height={5} viewBox="0 0 8 5"><path d="M0.5,0.5 L4,4 L7.5,0.5" stroke={c.ts} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        );})()
                      : <span style={{fontSize:9,color:k==="User ID"?c.acL:c.tm,fontWeight:k==="User ID"?700:400,fontVariantNumeric:"tabular-nums"}}>{v}</span>}
                  </div>
                ))}
              </div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              {/* Change password */}
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>SECURITY</div>
              <div style={{background:c.bg,border:`1px solid ${c.br}`,marginBottom:4}}>
                <div onClick={()=>setProfilePwOpen(p=>!p)}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",cursor:"pointer",borderBottom:profilePwOpen?`1px solid ${c.br}`:"none"}}>
                  <span style={{fontSize:9.5,color:c.ts}}>Change Password</span>
                  <svg width={10} height={6} viewBox="0 0 10 6" style={{transform:profilePwOpen?"rotate(180deg)":"none",transition:"transform 0.18s"}}>
                    <path d="M1,1 L5,5 L9,1" stroke={c.ts} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {profilePwOpen && (
                  <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
                    {[["Current password",profileCurPw,setProfileCurPw],["New password",profileNewPw,setProfileNewPw],["Confirm new password",profileConfirmPw,setProfileConfirmPw]].map(([label,val,setter],i)=>(
                      <div key={i}>
                        <div style={{fontSize:7.5,color:c.tm,marginBottom:3,fontWeight:600}}>{label.toUpperCase()}</div>
                        <input type="password" value={val} onChange={e=>setter(e.target.value)} style={pwInputSx}/>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"flex-end",marginTop:2}}>
                      <B primary small hk="prof-pw-save">Update Password</B>
                    </div>
                  </div>
                )}
              </div>
            </>}
            {profileTab==="billing" && <>
              {/* Current plan */}
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>CURRENT PLAN</div>
              <div style={{background:c.bg,border:`1px solid ${c.acB}`,marginBottom:14}}>
                <div style={{padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:800,color:c.tx}}>Pro Monthly</div>
                      <div style={{fontSize:8.5,color:c.ts,marginTop:2}}>Renews May 15, 2026 · 147 sessions used</div>
                    </div>
                    <span style={{padding:"3px 8px",background:c.acD,border:`1px solid ${c.acB}`,fontSize:7,fontWeight:800,color:c.acL,letterSpacing:"0.06em"}}>PRO</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {(()=>{const isH=swHov==="prof-upgrade",isP=swHov==="prof-upgrade_dn";return(
                      <div onClick={()=>{}} onMouseEnter={()=>setSwHov("prof-upgrade")} onMouseLeave={()=>setSwHov(null)} onMouseDown={()=>setSwHov("prof-upgrade_dn")} onMouseUp={()=>setSwHov("prof-upgrade")}
                        style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"5px 12px",cursor:"pointer",flex:1,
                          background:isP?c.ac:isH?`linear-gradient(135deg,${c.acL},#6A8AFF)`:`linear-gradient(135deg,${c.ac},${c.acL})`,
                          border:`1px solid ${isH||isP?c.acL:"rgba(74,106,255,0.5)"}`,
                          boxShadow:isH?`0 4px 14px ${c.acG}`:`0 2px 8px ${c.acG}`,
                          transform:isP?"scale(0.98)":"scale(1)",transition:"all 0.12s"}}>
                        <span style={{fontSize:9.5,fontWeight:700,color:"#fff",WebkitFontSmoothing:"antialiased"}}>Upgrade to Annual — Save 20%</span>
                      </div>
                    );})()}
                  </div>
                </div>
              </div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              {/* Payment method */}
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>PAYMENT METHOD</div>
              <div style={{padding:"10px 12px",background:c.bg,border:`1px solid ${c.br}`,display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <div style={{width:38,height:24,background:"rgba(255,255,255,0.04)",border:`1px solid ${c.brH}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:7,fontWeight:800,color:c.acL,letterSpacing:"0.06em"}}>VISA</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:9.5,color:c.ts}}>•••• •••• •••• 4242</div>
                  <div style={{fontSize:8,color:c.tm,marginTop:2}}>Expires 12/27</div>
                </div>
                <B small hk="update-card">Update</B>
              </div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              {/* Invoice history */}
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>INVOICE HISTORY</div>
              <div style={{background:c.bg,border:`1px solid ${c.br}`,marginBottom:4}}>
                {[["Apr 2026","$29.00"],["Mar 2026","$29.00"],["Feb 2026","$29.00"]].map(([d,a],i,arr)=>{
                  const hk=`pdf-${i}`; const isH=swHov===hk;
                  return(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",borderBottom:i<arr.length-1?`1px solid ${c.br}`:"none"}}>
                    <span style={{fontSize:9.5,color:c.ts}}>{d}</span>
                    <span style={{fontSize:9.5,fontWeight:700,color:c.gn}}>{a}</span>
                    <button onMouseEnter={()=>setSwHov(hk)} onMouseLeave={()=>setSwHov(null)}
                      style={{height:20,padding:"0 9px",cursor:"pointer",fontFamily:F,fontSize:9,fontWeight:700,letterSpacing:"0.04em",
                        color:isH?"#fff":c.acL,
                        background:isH?`linear-gradient(135deg,${c.ac},${c.acL})`:"transparent",
                        border:`1px solid ${isH?"rgba(74,106,255,0.5)":c.acB}`,
                        transition:"background 0.12s,color 0.12s,border-color 0.12s"}}>
                      PDF
                    </button>
                  </div>
                );})}
              </div>
            </>}
          </div>
          {/* Footer */}
          <div style={{height:4,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>
          <div style={{padding:"8px 14px",display:"flex",justifyContent:"flex-end",alignItems:"center",gap:4,flexShrink:0}}>
            {profileTab==="account" && <button
              onMouseEnter={()=>setSwHov("prof-logout")} onMouseLeave={()=>setSwHov(null)}
              onMouseDown={()=>setSwHov("prof-logout_dn")} onMouseUp={()=>setSwHov("prof-logout")}
              style={{marginRight:"auto",height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,
                background:swHov==="prof-logout_dn"?"rgba(255,80,104,0.18)":swHov==="prof-logout"?"rgba(255,80,104,0.12)":"rgba(255,80,104,0.06)",
                border:`1px solid ${swHov==="prof-logout"||swHov==="prof-logout_dn"?"rgba(255,80,104,0.6)":"rgba(255,80,104,0.3)"}`,
                color:c.rd,fontSize:9.5,fontWeight:600,letterSpacing:"0.02em",
                transform:swHov==="prof-logout_dn"?"scale(0.96)":"scale(1)",
                transition:"background 0.12s,border-color 0.12s,transform 0.08s"}}>
              Log Out
            </button>}
            <button onClick={()=>animClose(setProfileOpen,"profile")} style={{height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:600,color:c.ts,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(140,160,255,0.22)",transition:"background 0.12s,border-color 0.12s"}}>Cancel</button>
            <button onClick={()=>animClose(setProfileOpen,"profile")} style={{height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:700,color:"#fff",background:`linear-gradient(135deg,${c.ac},${c.acL})`,border:"1px solid rgba(74,106,255,0.5)",WebkitFontSmoothing:"antialiased",transition:"background 0.12s,border-color 0.12s"}}>OK</button>
          </div>
        </div>
        );
      })()}
      {(faqOpen || closing.has("faq")) && (()=>{
        const faqTabs = [["faq","FAQ"],["hotkeys","Hot Keys"],["education","Education"],["about","About"]];
        const faqTabIdx = faqTabs.findIndex(([id])=>id===faqCat);
        return (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:`calc(50% + ${faqPos.y}px)`,left:`calc(50% + ${faqPos.x}px)`,transform:"translate(-50%,-50%)",width:440,height:540,zIndex:9002,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.85), 0 0 24px ${c.acG}`,fontFamily:F,display:"flex",flexDirection:"column",animation:closing.has("faq")?"tlrWinOut 0.15s ease forwards":"tlrWinIn 0.18s ease"}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
          {/* Header */}
          <div onMouseDown={(e)=>{e.preventDefault();setDragging({target:"faq",startX:e.clientX,startY:e.clientY,ox:faqPos.x,oy:faqPos.y});}} style={{display:"flex",alignItems:"center",padding:"9px 14px",cursor:"move",userSelect:"none",flexShrink:0}}>
            <I n="help" s={15} cl="#F0A030"/><span style={{fontSize:12,fontWeight:700,flex:1,marginLeft:8,color:c.tx}}>Help & Support</span>
            <div onMouseDown={(e)=>e.stopPropagation()} onClick={()=>animClose(setFaqOpen,"faq")} onMouseEnter={()=>setSwHov("xFaq")} onMouseLeave={()=>setSwHov(null)} style={{cursor:"pointer",padding:4}}><I n="x" s={18} cl={swHov==="xFaq"?c.rd:c.ts}/></div>
          </div>
          <div style={{height:4,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>
          {/* Sliding tab bar */}
          <div style={{position:"relative",display:"flex",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
            {faqTabs.map(([id,label])=>(
              <button key={id} onClick={()=>{setFaqCat(id);setFaqExpand(null);}}
                style={{flex:1,padding:"8px 0",border:"none",background:"transparent",fontFamily:F,cursor:"pointer",
                  color:faqCat===id?c.acL:c.ts,fontSize:9.5,fontWeight:faqCat===id?700:500,letterSpacing:"0.02em",transition:"color 0.2s ease"}}>
                {label}
              </button>
            ))}
            <div style={{position:"absolute",bottom:0,height:2,
              width:`${80/faqTabs.length}%`,
              left:`calc(${faqTabIdx*(100/faqTabs.length)}% + ${10/faqTabs.length}%)`,
              transition:"left 0.25s cubic-bezier(0.4,0,0.2,1)",
              background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,
              boxShadow:`0 0 8px ${c.acG}`}}/>
          </div>
          {/* Content */}
          <div className="tlr-scroll" style={{flex:1,overflowY:"auto",padding:"14px 16px"}}>
            {faqCat==="faq" && <>
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>FREQUENTLY ASKED QUESTIONS</div>
              {[
                {q:"What file formats are supported?",a:"CSV files with OHLCV data. Each row: timestamp, open, high, low, close, volume. The system auto-detects column order."},
                {q:"How does Replay mode work?",a:"Navigate to any past date using the Go-To panel, then press Play. The chart replays candle-by-candle or tick-by-tick at your chosen speed."},
                {q:"How do I import my own data?",a:"Use File → Import Data, select your CSV file. Column mapping is auto-detected but can be adjusted manually."},
                {q:"Can I use custom indicators?",a:"Open the Indicators panel from the top bar and search the built-in library. Custom scripting support is planned for a future release."},
                {q:"How do I take a screenshot?",a:"Click the camera icon in the top-bar utility buttons. You can download as PNG/JPG or copy directly to clipboard."},
                {q:"Can I set price alerts?",a:"Pin price levels via the Go-To panel. A full alert and notification system is coming in a future release."},
                {q:"How do I save my drawings?",a:"Drawings are auto-saved to your session. Use the Objects Tree panel to manage, hide, or delete individual drawings."},
              ].map((item,i)=>(
                <div key={i} style={{marginBottom:4,border:`1px solid ${faqExpand===i?c.acB:c.br}`,overflow:"hidden"}}>
                  <div onClick={()=>setFaqExpand(faqExpand===i?null:i)}
                    style={{cursor:"pointer",display:"flex",alignItems:"center",padding:"8px 12px",background:faqExpand===i?c.acD:"transparent",transition:"background 0.12s"}}>
                    <span style={{flex:1,fontSize:9.5,fontWeight:600,color:faqExpand===i?c.acL:c.ts}}>{item.q}</span>
                    <svg width={9} height={6} viewBox="0 0 10 6" style={{flexShrink:0,transform:faqExpand===i?"rotate(180deg)":"none",transition:"transform 0.18s"}}>
                      <path d="M1,1 L5,5 L9,1" stroke={faqExpand===i?c.acL:c.tm} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  {faqExpand===i && <div style={{padding:"7px 12px 10px",fontSize:9,color:c.ts,background:c.bg,borderTop:`1px solid ${c.br}`,lineHeight:1.7}}>{item.a}</div>}
                </div>
              ))}
              <div style={{marginTop:10,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:c.bg,border:`1px solid ${c.br}`}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:8.5,color:c.tm}}>Still have questions?</span>
                  <a href="mailto:support@talaria.io"
                    onMouseEnter={()=>setSwHov("faq-mail")} onMouseLeave={()=>setSwHov(null)}
                    style={{fontSize:8.5,fontWeight:600,color:swHov==="faq-mail"?c.acL:c.ts,textDecoration:"none",transition:"color 0.12s",cursor:"pointer"}}>
                    support@talaria.io
                  </a>
                </div>
                <button
                  onMouseEnter={()=>setSwHov("faq-more")} onMouseLeave={()=>setSwHov(null)}
                  onMouseDown={()=>setSwHov("faq-more_dn")} onMouseUp={()=>setSwHov("faq-more")}
                  style={{height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",gap:6,cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:600,
                    color:swHov==="faq-more"||swHov==="faq-more_dn"?c.acL:c.ts,
                    background:swHov==="faq-more_dn"?"rgba(38,67,247,0.10)":swHov==="faq-more"?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.03)",
                    border:`1px solid ${swHov==="faq-more"||swHov==="faq-more_dn"?"rgba(140,160,255,0.40)":"rgba(140,160,255,0.22)"}`,
                    transition:"background 0.12s,border-color 0.12s,color 0.12s"}}>
                  More
                  <svg width={7} height={12} viewBox="0 0 7 12" fill="none" style={{flexShrink:0,pointerEvents:"none",opacity:swHov==="faq-more"||swHov==="faq-more_dn"?1:0.4,transition:"opacity 0.12s"}}>
                    <path d="M1,1 L6,6 L1,11" stroke={c.acL} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </>}
            {faqCat==="hotkeys" && <>{[
                {section:"REPLAY",items:[["Space","Play / Pause"],["→","Step Forward One Candle"],["←","Step Back One Candle"],["Shift+→","Skip 10 Candles Forward"],["Shift+←","Skip 10 Candles Back"],["R","Reset Replay"]]},
                {section:"DRAWING TOOLS",items:[["T","Trend Line"],["H","Horizontal Line"],["V","Vertical Line"],["R","Rectangle"],["F","Fib Retracement"],["Esc","Cancel Drawing"]]},
                {section:"CHART",items:[["Ctrl+Z","Undo"],["Ctrl+Y","Redo"],["Del","Delete Selected"],["Ctrl+A","Select All"],["Ctrl+S","Screenshot"],["Ctrl++","Zoom In"],["Ctrl+−","Zoom Out"]]},
              ].map(({section,items},idx)=>(
                <div key={section} style={{marginBottom:14}}>
                  {idx>0&&<div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>}
                  <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:6}}>{section}</div>
                  <div style={{background:c.bg,border:`1px solid ${c.br}`}}>
                    {items.map(([key,action],i,arr)=>(
                      <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 12px",borderBottom:i<arr.length-1?`1px solid ${c.br}`:"none"}}>
                        <span style={{fontSize:9.5,color:c.ts}}>{action}</span>
                        <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:52,height:18,padding:"0 6px",background:c.el,border:`1px solid ${c.brH}`,fontSize:key.length>6?6.5:key.length>4?7:8,fontWeight:700,color:c.tx,letterSpacing:"0.03em",whiteSpace:"nowrap",boxSizing:"border-box"}}>{key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>}
            {faqCat==="education" && <>
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>TRADING COURSES</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:14}}>
                {[
                  {icon:"📈",title:"Price Action",desc:"Candlestick patterns, market structure & order flow",tag:"12 lessons"},
                  {icon:"⚖️",title:"Risk Management",desc:"Position sizing, R:R ratio, drawdown control",tag:"8 lessons"},
                  {icon:"🧠",title:"Trading Psychology",desc:"Discipline, journaling, managing emotions",tag:"6 lessons"},
                  {icon:"📐",title:"Technical Analysis",desc:"Support & resistance, Fibonacci, indicators",tag:"10 lessons"},
                  {icon:"🔄",title:"Backtesting Mastery",desc:"Build and validate your edge on historical data",tag:"9 lessons"},
                  {icon:"🎯",title:"Strategy Development",desc:"Entry criteria, exits, confluence frameworks",tag:"7 lessons"},
                ].map((course,i)=>(
                  <div key={i}
                    onMouseEnter={()=>setSwHov(`edu-course-${i}`)} onMouseLeave={()=>setSwHov(null)}
                    style={{padding:"10px 10px",background:swHov===`edu-course-${i}`?c.el:c.bg,border:`1px solid ${swHov===`edu-course-${i}`?c.acB:c.br}`,cursor:"pointer",transition:"background 0.12s,border-color 0.12s"}}>
                    <div style={{fontSize:16,marginBottom:5,lineHeight:1}}>{course.icon}</div>
                    <div style={{fontSize:9.5,fontWeight:700,color:swHov===`edu-course-${i}`?c.acL:c.ts,transition:"color 0.12s",marginBottom:3}}>{course.title}</div>
                    <div style={{fontSize:7.5,color:c.tm,lineHeight:1.5,marginBottom:6}}>{course.desc}</div>
                    <div style={{display:"inline-block",fontSize:7,fontWeight:700,color:c.acL,background:c.acB,padding:"2px 6px",letterSpacing:"0.04em"}}>{course.tag}</div>
                  </div>
                ))}
              </div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>HOW TO USE TALARIA</div>
              <div style={{background:c.bg,border:`1px solid ${c.br}`,marginBottom:14}}>
                {[
                  ["Getting Started","Set up your workspace and import your first dataset"],
                  ["Replay Mode","Simulate live markets on historical data, step by step"],
                  ["Drawing Tools","Trend lines, Fibonacci, shapes and annotation tools"],
                  ["Indicators","Add, configure, and layer technical indicators"],
                  ["Templates","Save chart setups and reload them instantly"],
                  ["Backtesting","Run systematic strategy tests and review results"],
                ].map(([title,desc],i,arr)=>(
                  <div key={i} onMouseEnter={()=>setSwHov(`edu-guide-${i}`)} onMouseLeave={()=>setSwHov(null)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:i<arr.length-1?`1px solid ${c.br}`:"none",cursor:"pointer",background:swHov===`edu-guide-${i}`?c.el:"transparent",transition:"background 0.12s"}}>
                    <div style={{width:4,height:4,borderRadius:"50%",background:swHov===`edu-guide-${i}`?c.acL:c.tm,flexShrink:0,transition:"background 0.12s"}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:9.5,fontWeight:600,color:swHov===`edu-guide-${i}`?c.acL:c.ts,transition:"color 0.12s"}}>{title}</div>
                      <div style={{fontSize:7.5,color:c.tm,marginTop:1}}>{desc}</div>
                    </div>
                    <svg width={7} height={12} viewBox="0 0 7 12" fill="none" style={{flexShrink:0,opacity:swHov===`edu-guide-${i}`?1:0.3,transition:"opacity 0.12s"}}>
                      <path d="M1,1 L6,6 L1,11" stroke={c.acL} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ))}
              </div>
              <button
                onMouseEnter={()=>setSwHov("edu-all")} onMouseLeave={()=>setSwHov(null)}
                onMouseDown={()=>setSwHov("edu-all_dn")} onMouseUp={()=>setSwHov("edu-all")}
                style={{width:"100%",height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",gap:6,cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:600,
                  color:swHov==="edu-all"||swHov==="edu-all_dn"?c.acL:c.ts,
                  background:swHov==="edu-all_dn"?"rgba(38,67,247,0.10)":swHov==="edu-all"?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.03)",
                  border:`1px solid ${swHov==="edu-all"||swHov==="edu-all_dn"?"rgba(140,160,255,0.40)":"rgba(140,160,255,0.22)"}`,
                  transition:"background 0.12s,border-color 0.12s,color 0.12s"}}>
                Browse All Education Content
                <svg width={7} height={12} viewBox="0 0 7 12" fill="none" style={{flexShrink:0,opacity:swHov==="edu-all"||swHov==="edu-all_dn"?1:0.4,transition:"opacity 0.12s",pointerEvents:"none"}}>
                  <path d="M1,1 L6,6 L1,11" stroke={c.acL} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </>}
            {faqCat==="about" && <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"12px 14px",background:c.bg,border:`1px solid ${c.br}`}}>
                <img src="/LOGO-07.png" alt="Talaria" style={{width:32,height:32,objectFit:"contain",display:"block"}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:800,color:c.tx}}>Talaria</div>
                  <div style={{fontSize:8.5,color:c.ts,marginTop:2}}>Backtesting & Replay Platform</div>
                </div>
                <span style={{fontSize:8,color:c.tm,fontVariantNumeric:"tabular-nums"}}>v9.0</span>
              </div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>ABOUT</div>
              <div style={{fontSize:9,color:c.ts,lineHeight:1.7,marginBottom:14,padding:"10px 12px",background:c.bg,border:`1px solid ${c.br}`}}>Built for MENA discretionary futures traders. Replay historical markets, test your edge, and refine your strategy with precision instruments designed for serious traders.</div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>VERSION INFORMATION</div>
              <div style={{background:c.bg,border:`1px solid ${c.br}`,marginBottom:14}}>
                {[["Version","9.0.0"],["Build","2025.04.16"],["Release","April 2025"],["Channel","Stable"],["Platform","Web Application"],["License","Professional"]].map(([k,v],i,arr)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 12px",borderBottom:i<arr.length-1?`1px solid ${c.br}`:"none"}}>
                    <span style={{fontSize:9.5,color:c.tm}}>{k}</span>
                    <span style={{fontSize:9.5,fontWeight:600,color:c.ts,fontVariantNumeric:"tabular-nums"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>WHAT'S NEW IN 9.0</div>
              <div style={{background:c.bg,border:`1px solid ${c.br}`,marginBottom:14,padding:"10px 12px"}}>
                {["Redesigned UI with new dark color system","Sliding tab indicators across all panels","Inline password change in Profile window","Education hub with trading courses","FAQ and Help center improvements"].map((note,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:i<4?6:0}}>
                    <div style={{width:4,height:4,background:c.acL,borderRadius:"50%",flexShrink:0,marginTop:3}}/>
                    <span style={{fontSize:9,color:c.ts,lineHeight:1.5}}>{note}</span>
                  </div>
                ))}
              </div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,margin:"4px 0 14px"}}/>
              <div style={{fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em",marginBottom:8}}>CONTACT</div>
              <div style={{background:c.bg,border:`1px solid ${c.br}`,marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderBottom:`1px solid ${c.br}`}}>
                  <span style={{fontSize:9.5,color:c.tm}}>Support Email</span>
                  <a href="mailto:support@talaria.io"
                    onMouseEnter={()=>setSwHov("about-mail")} onMouseLeave={()=>setSwHov(null)}
                    style={{fontSize:9.5,fontWeight:600,color:swHov==="about-mail"?c.acL:c.ts,textDecoration:"none",transition:"color 0.12s",cursor:"pointer"}}>
                    support@talaria.io
                  </a>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px"}}>
                  <span style={{fontSize:9.5,color:c.tm}}>Response Time</span>
                  <span style={{fontSize:9.5,fontWeight:600,color:c.ts}}>Within 24 hours</span>
                </div>
              </div>
              <div style={{display:"flex",gap:4}}>
                {[["about-docs","Documentation"],["about-support","Contact Support"]].map(([hk,label])=>(
                  <button key={hk}
                    onMouseEnter={()=>setSwHov(hk)} onMouseLeave={()=>setSwHov(null)}
                    onMouseDown={()=>setSwHov(hk+"_dn")} onMouseUp={()=>setSwHov(hk)}
                    style={{flex:1,height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:600,
                      color:swHov===hk||swHov===hk+"_dn"?c.acL:c.ts,
                      background:swHov===hk+"_dn"?"rgba(38,67,247,0.10)":swHov===hk?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.03)",
                      border:`1px solid ${swHov===hk||swHov===hk+"_dn"?"rgba(140,160,255,0.40)":"rgba(140,160,255,0.22)"}`,
                      transition:"background 0.12s,border-color 0.12s,color 0.12s"}}>
                    {label}
                  </button>
                ))}
              </div>
            </>}
          </div>
          {/* Footer */}
          <div style={{height:4,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>
          <div style={{padding:"8px 14px",display:"flex",justifyContent:"flex-end",gap:4,flexShrink:0}}>
            <button onClick={()=>animClose(setFaqOpen,"faq")} style={{height:28,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:700,color:"#fff",background:`linear-gradient(135deg,${c.ac},${c.acL})`,border:"1px solid rgba(74,106,255,0.5)",WebkitFontSmoothing:"antialiased",transition:"background 0.12s,border-color 0.12s"}}>Close</button>
          </div>
        </div>
        );
      })()}
      {(screenshotOpen || closing.has("screenshot")) && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:`calc(50% + ${screenshotPos.y}px)`,left:`calc(50% + ${screenshotPos.x}px)`,transform:"translate(-50%,-50%)",width:920,zIndex:9002,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 24px 64px rgba(0,0,0,0.85), 0 0 24px ${c.acG}`,fontFamily:F,display:"flex",flexDirection:"column",animation:closing.has("screenshot")?"tlrWinOut 0.15s ease forwards":"tlrWinIn 0.18s ease"}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
          <div onMouseDown={(e)=>{e.preventDefault();setDragging({target:"screenshot",startX:e.clientX,startY:e.clientY,ox:screenshotPos.x,oy:screenshotPos.y});}}
            style={{display:"flex",alignItems:"center",padding:"9px 14px",cursor:"move",userSelect:"none",flexShrink:0}}>
            <I n="screenshot" s={15} cl={c.acL}/>
            <span style={{fontSize:12,fontWeight:700,marginLeft:8,color:c.tx}}>Screenshot</span>
            <span style={{fontSize:8.5,color:c.tm,fontVariantNumeric:"tabular-nums",marginLeft:8,flex:1}}>{canvasDims.w} × {canvasDims.h} px</span>
            <div onMouseDown={(e)=>e.stopPropagation()} onClick={()=>animClose(setScreenshotOpen,"screenshot")}
              onMouseEnter={()=>setSwHov("xScreenshot")} onMouseLeave={()=>setSwHov(null)}
              style={{cursor:"pointer",padding:4}}>
              <I n="x" s={18} cl={swHov==="xScreenshot"?c.rd:c.ts}/>
            </div>
          </div>
          <div style={{height:4,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`,flexShrink:0}}/>

          {/* chart preview */}
          <div style={{padding:"14px 16px 0",flexShrink:0}}>
            {(()=>{
              const candles=[[48,56,44,54,0],[54,61,52,58,0],[58,60,53,55,1],[55,59,51,57,0],[57,65,55,63,0],[63,67,58,60,1],[60,64,57,62,0],[62,69,61,68,0],[68,72,65,70,0],[70,68,63,65,1],[65,70,63,68,0],[68,74,67,72,0],[72,76,70,74,0],[74,72,68,69,1],[69,73,67,71,0],[71,76,70,75,0],[75,79,73,77,0],[77,75,71,72,1],[72,77,71,76,0],[76,82,75,80,0],[80,84,78,82,0],[82,86,80,84,0],[84,82,79,80,1],[80,83,78,82,0],[82,87,81,86,0],[86,90,84,88,0],[88,86,83,84,1],[84,88,83,87,0],[87,92,86,91,0],[91,94,89,92,0],[92,90,87,88,1],[88,92,87,91,0],[91,95,90,94,0],[94,97,92,95,0],[95,93,90,91,1],[91,95,90,94,0],[94,98,93,97,0],[97,100,95,98,0],[98,96,93,94,1],[94,98,93,97,0],[97,102,96,100,0],[100,103,98,101,0]];
              const allClose=candles.map(d=>d[3]);
              const allH=candles.map(d=>d[1]), allL=candles.map(d=>d[2]);
              const minP=Math.min(...allL)-3, maxP=Math.max(...allH)+3, range=maxP-minP;
              const W=888, H=Math.round(888*(canvasDims.h/canvasDims.w)), padR=44, padB=22, padT=10;
              const chartW=W-padR, chartH=H-padB-padT;
              const py=(p)=>padT+chartH*(1-(p-minP)/range);
              const step=chartW/candles.length;
              const candleW=Math.max(Math.floor(step)-3,4);
              const ma=allClose.map((_,i)=>i<8?null:allClose.slice(i-8,i+1).reduce((a,b)=>a+b,0)/9);
              const gridCount=6;
              const gridPrices=Array.from({length:gridCount},(_,i)=>Math.round(minP+(range/(gridCount-1))*i));
              const times=["15:30","16:00","16:30","17:00","17:30","18:00","18:30"];
              const lastClose=allClose[allClose.length-1];
              return (
                <div style={{background:c.bg,border:`1px solid ${c.brH}`,position:"relative",overflow:"hidden",height:H}}>
                  <svg width={W} height={H} style={{display:"block",position:"absolute",inset:0}}>
                    {gridPrices.map(p=>(
                      <g key={p}>
                        <line x1={0} y1={py(p)} x2={chartW} y2={py(p)} stroke="rgba(140,160,255,0.06)" strokeWidth={1}/>
                        <text x={chartW+5} y={py(p)+3.5} fontSize={8} fill={c.tm} fontFamily={F} fontVariantNumeric="tabular-nums">{p.toFixed(0)}</text>
                      </g>
                    ))}
                    {times.map((t,i)=>(
                      <text key={t} x={Math.round(i*(chartW/6))+2} y={H-6} fontSize={8} fill={c.tm} fontFamily={F} fontVariantNumeric="tabular-nums">{t}</text>
                    ))}
                    <polyline
                      points={ma.map((v,i)=>v==null?null:`${Math.round(step*i+step/2)},${py(v)}`).filter(Boolean).join(" ")}
                      fill="none" stroke={c.acL} strokeWidth={1.5} opacity={0.55}/>
                    {candles.map(([o,h,l,cl,bear],i)=>{
                      const x=Math.round(step*i+(step-candleW)/2);
                      const col=bear?c.rd:c.gn;
                      const bodyY=py(Math.max(o,cl)), bodyH=Math.max(Math.abs(py(o)-py(cl)),2);
                      return (
                        <g key={i}>
                          <line x1={x+candleW/2} y1={py(h)} x2={x+candleW/2} y2={py(l)} stroke={col} strokeWidth={1} opacity={0.7}/>
                          <rect x={x} y={bodyY} width={candleW} height={bodyH} fill={col} opacity={0.9}/>
                        </g>
                      );
                    })}
                    <line x1={0} y1={py(lastClose)} x2={chartW} y2={py(lastClose)} stroke={c.acL} strokeWidth={1} strokeDasharray="5,3" opacity={0.55}/>
                    <rect x={chartW} y={py(lastClose)-9} width={padR} height={18} fill={c.ac} opacity={0.9}/>
                    <text x={chartW+5} y={py(lastClose)+4} fontSize={8.5} fill="#fff" fontFamily={F} fontWeight="700" fontVariantNumeric="tabular-nums">{lastClose}.00</text>
                  </svg>
                  <div style={{position:"absolute",top:8,left:10,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13,fontWeight:800,color:c.tx,letterSpacing:"-0.02em"}}>{symbol}</span>
                    <span style={{fontSize:8,color:c.tm,background:"rgba(140,160,255,0.08)",padding:"2px 6px",border:`1px solid ${c.br}`}}>1m · Candles</span>
                    <span style={{fontSize:8,color:c.gn,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{lastClose}.00</span>
                    <span style={{fontSize:7.5,color:c.gn,fontWeight:600}}>+2.15%</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* footer */}
          <div style={{padding:"10px 16px 12px",borderTop:`1px solid ${c.br}`,marginTop:14,display:"flex",justifyContent:"flex-end",gap:6,flexShrink:0}}>
            {[
              {label:"Copy Link", hk:"sc-cancel", act:()=>{}, primary:false},
              {label:"Copy",     hk:"sc-copy",   act:()=>{}, primary:false},
              {label:"Download", hk:"sc-dl",     act:()=>{}, primary:true},
            ].map(({label,hk,act,primary})=>{
              const isH=swHov===hk, isDn=swHov===hk+"_dn";
              return (
                <button key={hk} onClick={act}
                  onMouseEnter={()=>setSwHov(hk)} onMouseLeave={()=>setSwHov(null)}
                  onMouseDown={()=>setSwHov(hk+"_dn")} onMouseUp={()=>setSwHov(hk)}
                  style={{height:28,padding:"0 18px",display:"flex",alignItems:"center",justifyContent:"center",
                    boxSizing:"border-box",cursor:"pointer",fontFamily:F,fontSize:9.5,fontWeight:primary?700:600,
                    color:primary?"#fff":isH?c.tx:c.ts,
                    background:primary
                      ? isDn?c.ac:isH?`linear-gradient(135deg,${c.acL},#6A8AFF)`:`linear-gradient(135deg,${c.ac},${c.acL})`
                      : isH?"rgba(140,160,255,0.08)":"rgba(255,255,255,0.03)",
                    border:primary?`1px solid ${isH?c.acL:"rgba(74,106,255,0.5)"}`:`1px solid ${isH?"rgba(140,160,255,0.35)":"rgba(140,160,255,0.18)"}`,
                    transform:isDn?"scale(0.97)":"scale(1)",
                    transition:"background 0.12s,border-color 0.12s,transform 0.08s",
                    WebkitFontSmoothing:"antialiased"}}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}


      {logoMenu && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:42,left:10,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`,minWidth:168,fontFamily:F,animation:"tlrDropIn 0.15s ease"}}>
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
          <div style={{padding:"4px 0"}}>
            <div style={{padding:"5px 14px 3px",fontSize:7,fontWeight:700,color:c.tm,letterSpacing:"0.06em"}}>MENU</div>
            {[
              {icon:"settings",label:"Settings",hk:"lm-settings",col:c.acL,alwaysCol:false,action:()=>{setLogoMenu(false);closeWindows();setSettingsOpen(true);}},
              {icon:"user",label:"Profile",hk:"lm-profile",col:c.acL,alwaysCol:true,bold:true,action:()=>{setLogoMenu(false);closeWindows();setSettingsOpen(false);setProfileOpen(true);}},
              {icon:"help",label:"Help & Support",hk:"lm-faq",col:"#F0A030",alwaysCol:true,action:()=>{setLogoMenu(false);closeWindows();setSettingsOpen(false);setFaqOpen(true);}},
            ].map((item)=>{
              const isH = swHov===item.hk;
              const iconCol = item.alwaysCol ? item.col : (isH ? item.col : c.ts);
              const textCol = item.alwaysCol ? item.col : (isH ? item.col : c.ts);
              return (
                <div key={item.hk} onClick={item.action}
                  onMouseEnter={()=>setSwHov(item.hk)} onMouseLeave={()=>setSwHov(null)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",cursor:"pointer",
                    background:isH?"rgba(255,255,255,0.03)":"transparent",
                    borderLeft:isH?`2px solid ${item.col}`:"2px solid transparent",
                    transition:"all 0.1s"}}>
                  <I n={item.icon} s={13} cl={iconCol}/>
                  <span style={{fontSize:10,fontWeight:item.bold?700:isH?700:600,color:textCol,flex:1}}>{item.label}</span>
                </div>
              );
            })}
            <div style={{padding:"6px 10px 4px"}}>
              {(()=>{
                const isH = swHov==="lm-dash";
                const isP = swHov==="lm-dash_dn";
                return (
                  <div onClick={()=>setLogoMenu(false)}
                    onMouseEnter={()=>setSwHov("lm-dash")} onMouseLeave={()=>setSwHov(null)}
                    onMouseDown={()=>setSwHov("lm-dash_dn")} onMouseUp={()=>setSwHov("lm-dash")}
                    style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"6px 10px",cursor:"pointer",
                      background:isP?c.ac:isH?`linear-gradient(135deg,${c.acL},#6A8AFF)`:`linear-gradient(135deg,${c.ac},${c.acL})`,
                      border:`1px solid ${isH||isP?c.acL:"rgba(74,106,255,0.5)"}`,
                      boxShadow:isH?`0 4px 14px ${c.acG}`:`0 2px 8px ${c.acG}`,
                      transform:isP?"scale(0.96)":"scale(1)",
                      transition:"background 0.12s ease,border-color 0.12s ease,box-shadow 0.12s ease,transform 0.08s ease"}}>
                    <I n="layout" s={12} cl="#fff"/>
                    <span style={{fontSize:10,fontWeight:700,color:"#fff",letterSpacing:"0.02em",WebkitFontSmoothing:"antialiased"}}>Go to Dashboard</span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {symbolOpen && (
        <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:42,left:50,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`,minWidth:190,fontFamily:F,animation:"tlrDropIn 0.15s ease"}}>
          <div style={{position:"sticky",top:0,height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,zIndex:1}}/>
          <div style={{padding:"5px 8px 4px",borderBottom:`1px solid ${c.br}`}}>
            <div style={{fontSize:7,fontWeight:700,color:c.tm,letterSpacing:"0.06em",marginBottom:4}}>MARKETS</div>
            <div style={{display:"flex",alignItems:"center",background:c.well,border:`1px solid ${c.brH}`,padding:"4px 7px",gap:5}}>
              <I n="search" s={10} cl={c.tm}/>
              <input type="text" placeholder="Search symbol…" value={symbolSearch} onChange={(e)=>setSymbolSearch(e.target.value)}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9,fontFamily:F,padding:0}}/>
            </div>
          </div>
          <div className="tlr-scroll" style={{maxHeight:320,overflowY:"auto",padding:"4px 0"}}>
            {SYMBOLS_DATA.map(({cat,items})=>{
              const q=symbolSearch.toLowerCase();
              const filtered = items.filter(s=>!q||s.id.toLowerCase().startsWith(q)||s.name.toLowerCase().split(/[\s/\-]+/).some(w=>w.startsWith(q)));
              if(filtered.length===0) return null;
              return (
                <div key={cat}>
                  <div style={{padding:"5px 14px 3px",fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.08em"}}>{cat}</div>
                  {filtered.map(s=>{
                    const isAct=symbol===s.id;
                    const isH=hov===`sym-${s.id}`;
                    return (
                      <div key={s.id}
                        onMouseEnter={()=>setHov(`sym-${s.id}`)} onMouseLeave={()=>setHov(null)}
                        onClick={()=>{setSymbol(s.id);setSymbolOpen(false);setSymbolSearch("");}}
                        style={{display:"flex",alignItems:"center",gap:9,padding:"5px 14px",cursor:"pointer",
                          background:isAct?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",
                          borderLeft:isAct?`2px solid ${c.acL}`:"2px solid transparent"}}>
                        <div style={{display:"flex",alignItems:"center",position:"relative",width:27,height:12,flexShrink:0}}>
                          {s.type==="forex" ? <>
                            <div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.6)",zIndex:1}}><FlagSvg code={s.base} w={18} h={12}/></div>
                            <div style={{position:"absolute",left:9,top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 2px 4px rgba(0,0,0,0.8)",zIndex:2}}><FlagSvg code={s.quote} w={18} h={12}/></div>
                          </> : <SymBadge sym={s} w={27} h={12}/>}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,fontWeight:isAct?700:600,color:isAct?c.acL:isH?c.tx:c.ts,fontFamily:F,lineHeight:1.2}}>{s.id}</div>
                          <div style={{fontSize:7.5,color:c.tm,lineHeight:1.2}}>{s.name}</div>
                        </div>
                        {isAct && <I n="check" s={9} cl={c.acL}/>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {chartTypeOpen && (()=>{
        const ctMap={"Candles":"candle","Hollow Candles":"hollowCandle","Heikin Ashi":"heikinAshi","Bars":"bars","Line":"lineChart","Area":"area"};
        return (
          <div onClick={(e)=>e.stopPropagation()} style={{position:"fixed",top:42,left:140,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`,minWidth:155,fontFamily:F,animation:"tlrDropIn 0.15s ease"}}>
            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
            <div style={{padding:"4px 0"}}>
              <div style={{padding:"5px 14px 3px",fontSize:7,fontWeight:700,color:c.tm,letterSpacing:"0.06em"}}>CHART TYPE</div>
              {["Candles","Hollow Candles","Heikin Ashi","Bars","Line","Area"].map(t=>{
                const isAct=chartType===t; const isH=hov===`ct-${t}`;
                return (
                  <div key={t}
                    onMouseEnter={()=>setHov(`ct-${t}`)} onMouseLeave={()=>setHov(null)}
                    onClick={()=>{setChartType(t);setChartTypeOpen(false);}}
                    style={{display:"flex",alignItems:"center",gap:9,padding:"5px 14px",cursor:"pointer",
                      background:isAct?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",
                      borderLeft:isAct?`2px solid ${c.acL}`:"2px solid transparent"}}>
                    <I n={ctMap[t]} s={13} cl={isAct?c.acL:isH?c.tx:c.ts}/>
                    <span style={{flex:1,fontSize:10,fontWeight:isAct?700:500,color:isAct?c.acL:isH?c.tx:c.ts}}>{t}</span>
                    {isAct && <I n="check" s={9} cl={c.acL}/>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      <div style={{ height: 36, flexShrink: 0, background: c.sf, borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center", padding: "0 10px", gap: 4 }}>
        {(()=>{ const logoActive = logoMenu || settingsOpen || profileOpen || faqOpen; return (
        <div onClick={(e) => { e.stopPropagation(); const was=logoMenu; closeAll(); if(!was) setLogoMenu(true); }}
          onMouseEnter={() => setHov("logo-btn")} onMouseLeave={() => setHov(null)}
          style={{ width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -6 }}>
          <img src="/LOGO-07.png" alt="Talaria"
            style={{ width: 26, height: 26, objectFit: "contain", display: "block",
              transform: logoActive ? "scale(1.14)" : hov==="logo-btn" ? "scale(1.06)" : "scale(1)",
              filter: logoActive
                ? `drop-shadow(0 0 7px ${c.acL}) drop-shadow(0 0 16px rgba(74,106,255,0.45))`
                : hov==="logo-btn" ? `drop-shadow(0 0 4px ${c.acL})` : "none",
              opacity: logoActive ? 1 : hov==="logo-btn" ? 0.95 : 0.85,
              transition: "transform 0.4s ease, filter 0.4s ease, opacity 0.25s ease" }}/>
        </div>
        ); })()}
        <div style={{ width: 1, height: 16, margin: "0 3px 0 0", background: "rgba(140,160,255,0.18)" }}/>
        <button onClick={(e) => { e.stopPropagation(); const was=symbolOpen; closeAll(); if(!was) setSymbolOpen(true); }} onMouseEnter={() => setHov("symbol")} onMouseLeave={() => setHov(null)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", background: "transparent", border: "none", color: c.tx, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: F, position: "relative", width: 128, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", position: "relative", width: 32, height: 14, flexShrink: 0 }}>
            {currentSymbol.type==="forex" ? <>
              <div style={{ position: "absolute", left: 0, top: 0, borderRadius: 1, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.6)", zIndex: 1 }}><FlagSvg code={currentSymbol.base} w={22} h={14}/></div>
              <div style={{ position: "absolute", left: 10, top: 0, borderRadius: 1, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.8)", zIndex: 2 }}><FlagSvg code={currentSymbol.quote} w={22} h={14}/></div>
            </> : <SymBadge sym={currentSymbol} w={32} h={14}/>}
          </div>
          {symbol}
          <svg width={10} height={6} viewBox="0 0 10 6"><path d="M1,1 L5,5 L9,1" stroke={symbolOpen ? c.acL : c.ts} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {hov==="symbol" && !symbolOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
          {symbolOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
        </button>
        <div style={{ width: 1, height: 16, margin: "0 2px", background: "rgba(140,160,255,0.18)" }}/>
        <button onClick={(e) => { e.stopPropagation(); const was=chartTypeOpen; closeAll(); if(!was) setChartTypeOpen(true); }} onMouseEnter={() => setHov("chartType")} onMouseLeave={() => setHov(null)}
          style={{ padding: "3px 7px", display: "flex", alignItems: "center", gap: 4, position: "relative", background: "transparent", border: "none", fontFamily: F, color: chartTypeOpen ? c.acL : hov==="chartType" ? c.tx : c.ts, fontSize: 9.5, fontWeight: 600, cursor: "pointer" }}>
          <I n={currentChartType.icon} s={12} cl={chartTypeOpen ? c.acL : hov==="chartType" ? c.tx : c.ts}/>{currentChartType.label}
          <svg width={10} height={6} viewBox="0 0 10 6"><path d="M1,1 L5,5 L9,1" stroke={chartTypeOpen ? c.acL : c.ts} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {chartTypeOpen && <div style={{ position: "absolute", bottom: -1, left: "10%", right: "10%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
          {hov==="chartType" && !chartTypeOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
        </button>
        <div style={{ width: 1, height: 16, margin: "0 2px", background: "rgba(140,160,255,0.18)" }}/>
        <button onClick={(e) => { e.stopPropagation(); if(indOpen){animClose(setIndOpen,"ind");setIndSearch("");}else{closeWindows();setSettingsOpen(false);setIndOpen(true);} }} onMouseEnter={() => setHov("indicators")} onMouseLeave={() => setHov(null)}
          style={{ padding: "3px 8px", display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", fontFamily: F, color: indOpen ? c.acL : hov==="indicators" ? c.tx : c.ts, fontSize: 9.5, fontWeight: indOpen ? 700 : 600, cursor: "pointer", position: "relative" }}>
          <I n="indicator" s={13} cl={indOpen ? c.acL : hov==="indicators" ? c.tx : c.ts}/>Indicators
          {indOpen && <div style={{ position: "absolute", bottom: -1, left: "10%", right: "10%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
          {hov==="indicators" && !indOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
        </button>
        <div style={{ width: 1, height: 16, margin: "0 4px", background: "rgba(140,160,255,0.18)" }}/>
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <button onClick={(e) => { e.stopPropagation(); const was=tfOpen; setDropdown(null); setLogoMenu(false); setReplayOpts(false); setGotoOpen(false); setSymbolOpen(false); setChartTypeOpen(false); setSymbolSearch(""); setTfOpen(false); setTfCat(null); setTfUnitOpen(false); setSDrop(null); setSettDrop(null); if(!was){ setTfOpen(true); setTfEditMode(false); } }} onMouseEnter={() => setHov("tf-more")} onMouseLeave={() => setHov(null)}
              style={{ padding: "4px 5px", position: "relative", background: "transparent", border: "none", fontFamily: F, cursor: "pointer", display: "flex", alignItems: "center" }}>
              <svg width={10} height={6} viewBox="0 0 10 6"><path d="M1,1 L5,5 L9,1" stroke={tfOpen ? c.acL : hov==="tf-more" ? c.tx : c.ts} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {tfOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
              {hov==="tf-more" && !tfOpen && <div style={{ position: "absolute", bottom: -1, left: "15%", right: "15%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
            </button>
            {tfOpen && (()=>{
              const addCustomTf = () => {
                const val = parseInt(tfCustomVal);
                if (!val || val <= 0) return;
                const key = `${val}${tfCustomUnit}`;
                const allDefaults = Object.values(tfDefaults).flat();
                if (tfCustomItems.includes(key) || allDefaults.includes(key)) return;
                setTfCustomItems(prev => [...prev, key]);
                setTfCustomVal("");
              };
              return (
              <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:42,left:300,zIndex:9000,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7)`,width:200,fontFamily:F,animation:"tlrDropIn 0.15s ease"}}>
                <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                <div className="tlr-scroll" style={{maxHeight:360,overflowY:"auto",padding:"4px 0"}}>
                  {Object.entries(tfCategories).map(([catId,{label,items}],ci)=>(
                    <div key={catId}>
                      {ci>0 && <div style={{height:1,margin:"3px 0",background:`linear-gradient(90deg,transparent,${c.br},transparent)`}}/>}
                      <div style={{padding:"4px 10px 2px",fontSize:7,fontWeight:700,color:c.tm,letterSpacing:"0.07em"}}>{label.toUpperCase()}</div>
                      {items.map(t=>{
                        const isPinned=tfPinned.includes(t);
                        const isCustom=tfCustomItems.includes(t);
                        const isAct=tf===t;
                        const isH=swHov===`tf-${t}`;
                        const isDelHov=swHov===`tfdel-${t}`;
                        return (
                          <div key={t} onMouseEnter={()=>setSwHov(`tf-${t}`)} onMouseLeave={()=>setSwHov(null)}
                            style={{display:"flex",alignItems:"center",padding:"3px 10px",gap:3,
                              background:isAct?c.acD:isH?"rgba(255,255,255,0.025)":"transparent",
                              borderLeft:isAct?`2px solid ${c.acL}`:"2px solid transparent",
                              transition:"background 0.1s"}}>
                            <button onClick={()=>{setTf(t);setTfOpen(false);}}
                              style={{flex:1,background:"transparent",border:"none",cursor:"pointer",
                                color:isAct?c.acL:c.ts,fontSize:9.5,fontWeight:isAct?700:500,
                                fontFamily:F,textAlign:"left",padding:0}}>
                              {t}
                            </button>
                            {isCustom && (
                              <div onClick={e=>{e.stopPropagation();setTfCustomItems(prev=>prev.filter(x=>x!==t));setTfPinned(prev=>prev.filter(x=>x!==t));if(tf===t)setTf("1H");}}
                                onMouseEnter={()=>setSwHov(`tfdel-${t}`)} onMouseLeave={()=>setSwHov(`tf-${t}`)}
                                style={{width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",
                                  cursor:"pointer",flexShrink:0,
                                  opacity:isDelHov?1:isH?0.5:0.2,transition:"opacity 0.15s"}}>
                                <I n="x" s={8} cl={isDelHov?c.rd:c.ts}/>
                              </div>
                            )}
                            <div onClick={e=>{e.stopPropagation();setTfPinned(prev=>isPinned?prev.filter(x=>x!==t):prev.length>=10?prev:[...prev,t]);}}
                              style={{width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",
                                cursor:"pointer",flexShrink:0,
                                opacity:isPinned?1:isH?0.6:0.25,transition:"opacity 0.15s"}}>
                              <I n={isPinned?"pinFill":"pin"} s={9} cl={isPinned?c.gold:c.ts}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.brH},transparent)`}}/>
                <div style={{padding:"7px 10px 8px",display:"flex",alignItems:"center",gap:4}}>
                  <input type="text" inputMode="numeric" value={tfCustomVal}
                    onChange={e=>setTfCustomVal(e.target.value.replace(/[^0-9]/g,""))}
                    onKeyDown={e=>{if(e.key==="Enter")addCustomTf();}}
                    className="tlr-nospinner"
                    style={{width:34,height:22,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(140,160,255,0.22)",
                      color:c.tx,fontSize:9,fontFamily:F,padding:"0 4px",outline:"none",textAlign:"center",
                      boxSizing:"border-box",transition:"border-color 0.14s"}}/>
                  {(()=>{
                    const unitLabels={m:"Minutes",H:"Hours",D:"Days",W:"Weeks",M:"Months"};
                    return (
                    <div style={{flex:1,position:"relative"}}>
                      <div onMouseEnter={()=>setSwHov("tf-unit-btn")} onMouseLeave={()=>setSwHov(null)}
                        onClick={e=>{e.stopPropagation();setTfUnitOpen(v=>!v);}}
                        style={{display:"flex",alignItems:"center",gap:4,padding:"0 6px",height:22,cursor:"pointer",
                          background:swHov==="tf-unit-btn"||tfUnitOpen?"rgba(140,160,255,0.08)":"rgba(140,160,255,0.04)",
                          border:`1px solid ${swHov==="tf-unit-btn"||tfUnitOpen?"rgba(140,160,255,0.22)":"rgba(140,160,255,0.10)"}`,
                          transition:"all 0.12s"}}>
                        <span style={{flex:1,fontSize:8.5,color:c.ts,fontFamily:F,whiteSpace:"nowrap"}}>{unitLabels[tfCustomUnit]}</span>
                        <svg width={7} height={5} viewBox="0 0 7 5"><path d="M0,0 L3.5,4.5 L7,0" stroke={c.tm} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                      {tfUnitOpen && (
                        <div onClick={e=>e.stopPropagation()}
                          style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,zIndex:9100,
                            background:c.sf,border:`1px solid ${c.brH}`,
                            boxShadow:`0 6px 20px rgba(0,0,0,0.6)`,animation:"tlrDropIn 0.13s ease"}}>
                          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                          {[["m","Minutes"],["H","Hours"],["D","Days"],["W","Weeks"],["M","Months"]].map(([u,lbl])=>{
                            const isU=tfCustomUnit===u;
                            const isHU=swHov===`tf-unit-${u}`;
                            return (
                              <div key={u}
                                onMouseEnter={()=>setSwHov(`tf-unit-${u}`)} onMouseLeave={()=>setSwHov(null)}
                                onClick={()=>{setTfCustomUnit(u);setTfUnitOpen(false);}}
                                style={{padding:"4px 8px",cursor:"pointer",fontSize:9,fontFamily:F,
                                  color:isU?c.acL:isHU?c.tx:c.ts,
                                  background:isU?c.acD:isHU?"rgba(255,255,255,0.025)":"transparent",
                                  borderLeft:isU?`2px solid ${c.acL}`:"2px solid transparent",
                                  fontWeight:isU?700:500,transition:"background 0.1s"}}>
                                {lbl}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })()}
                  <button onClick={addCustomTf}
                    onMouseEnter={()=>setSwHov("tf-add")} onMouseLeave={()=>setSwHov(null)}
                    onMouseDown={()=>setSwHov("tf-add_dn")} onMouseUp={()=>setSwHov("tf-add")}
                    style={{width:22,height:22,position:"relative",boxSizing:"border-box",cursor:"pointer",
                      padding:0,flexShrink:0,
                      background:swHov==="tf-add_dn"?"rgba(38,67,247,0.2)":swHov==="tf-add"?"rgba(74,106,255,0.12)":"transparent",
                      border:`1px solid ${swHov==="tf-add_dn"?"rgba(74,106,255,0.65)":swHov==="tf-add"?"rgba(74,106,255,0.55)":"rgba(140,160,255,0.28)"}`,
                      transform:swHov==="tf-add_dn"?"scale(0.88)":"scale(1)",
                      transition:"background 0.12s,border-color 0.12s,transform 0.08s"}}>
                    <svg width={7} height={7} viewBox="0 0 10 10" fill="none"
                      stroke={swHov==="tf-add"||swHov==="tf-add_dn"?c.acL:"rgba(140,160,255,0.55)"}
                      strokeWidth={2.2} strokeLinecap="round"
                      style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",display:"block",pointerEvents:"none"}}>
                      <line x1={5} y1={1} x2={5} y2={9}/><line x1={1} y1={5} x2={9} y2={5}/>
                    </svg>
                  </button>
                </div>
              </div>
              );
            })()}
          </div>
          <div ref={tfBarRef} style={{ display:"flex", alignItems:"center", position:"relative" }}>
            {[...tfPinned].sort((a,b)=>{const uO={m:0,H:1,D:2,W:3,M:4};const uA=a.replace(/[0-9]/g,""),uB=b.replace(/[0-9]/g,"");return uO[uA]!==uO[uB]?uO[uA]-uO[uB]:parseInt(a)-parseInt(b);}).map((t) => (
              <button key={t} data-tf={t} onClick={() => setTf(t)} onMouseEnter={() => setHov(`tf-${t}`)} onMouseLeave={() => setHov(null)}
                style={{ padding: "4px 7px", position: "relative", background: "transparent", border: "none", fontFamily: F, color: tf===t ? c.acL : hov===`tf-${t}` ? c.tx : c.ts, fontSize: 10, fontWeight: tf===t ? 700 : 600, cursor: "pointer" }}>
                {t}
                {hov===`tf-${t}` && tf!==t && <div style={{ position: "absolute", bottom: -1, left: "25%", right: "25%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
              </button>
            ))}
            {tfIndPos && (
              <div style={{ position:"absolute", bottom:-1, height:2, pointerEvents:"none",
                left: tfIndPos.left + tfIndPos.width * 0.18,
                width: tfIndPos.width * 0.64,
                background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`,
                boxShadow: `0 0 6px ${c.acG}`,
                transition: "left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1)" }}/>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}/>
        <button onClick={(e) => { e.stopPropagation(); setRightPanel(null); setOrderPanelOpen(prev => !prev); }}
          onMouseEnter={() => setHov("place-order")} onMouseLeave={() => setHov(null)}
          style={{
            height: 28, padding: "0 14px", marginRight: 6,
            display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", gap: 5,
            background: hov==="place-order" ? `linear-gradient(135deg,${c.acL},#6B8AFF)` : `linear-gradient(135deg,${c.ac},${c.acL})`,
            border: `1px solid ${orderPanelOpen && !rightPanel ? "rgba(74,106,255,0.7)" : "rgba(74,106,255,0.5)"}`,
            cursor: "pointer", fontFamily: F,
            transition: "background 0.12s, border-color 0.12s",
          }}>
          <I n="plus" s={10} cl="#fff" w={2}/>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", WebkitFontSmoothing: "antialiased" }}>Place Order</span>
        </button>
        <div style={{ width: 1, height: 16, margin: "0 2px", background: c.br }}/>
        {[{id:"layout",icon:"layout",label:"Layout"},{id:"layers",icon:"tree",label:"Objects Tree"},{id:"news",icon:"news",label:"News"},{id:"screenshot",icon:"screenshot",label:"Screenshot"},{id:"expand",icon:"expand",label:"Fullscreen"}].map(({id,icon,label}) => (
          <button key={id} onClick={(e) => { if(id==="news"){ e.stopPropagation(); setSettingsOpen(false); if(rightPanel==="news"){setRightPanel(null);}else{setRightPanel("news");setOrderPanelOpen(false);} } if(id==="layout"){ e.stopPropagation(); if(rightPanel==="layout"){setRightPanel(null);}else{setRightPanel("layout");setOrderPanelOpen(false);} } if(id==="screenshot"){ e.stopPropagation(); closeWindows(); setSettingsOpen(false); if(chartCanvasRef.current){const r=chartCanvasRef.current.getBoundingClientRect();setCanvasDims({w:Math.round(r.width),h:Math.round(r.height)});} setScreenshotOpen(true); } if(id==="layers"){ e.stopPropagation(); setSettingsOpen(false); if(rightPanel==="layers"){setRightPanel(null);}else{setRightPanel("layers");setOrderPanelOpen(false);} }}} onMouseEnter={() => setHov(`u-${id}`)} onMouseLeave={() => setHov(null)}
            style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", position: "relative" }}>
            {(() => { const isActive = (id==="news"&&rightPanel==="news") || (id==="layers"&&rightPanel==="layers") || (id==="layout"&&rightPanel==="layout"); return <>
              <I n={icon} s={14} cl={isActive ? c.acL : hov===`u-${id}` ? c.tx : c.ts}/>
              {isActive && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)`, boxShadow: `0 0 6px ${c.acG}` }}/>}
              {hov===`u-${id}` && !isActive && <div style={{ position: "absolute", bottom: 0, left: "25%", right: "25%", height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)` }}/>}
              {hov===`u-${id}` && <div style={{ position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", background: c.el, border: `1px solid ${c.brH}`, padding: "3px 8px", fontSize: 9, fontWeight: 600, fontFamily: F, color: c.tx, whiteSpace: "nowrap", zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>{label}</div>}
            </>; })()}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: 36, flexShrink: 0, background: c.sf, borderRight: `1px solid ${c.br}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2, overflowY: "auto", overflowX: "hidden" }}>
          {toolGroups.map((group, gi) => (
            <div key={gi}>
              {group.map(t => renderTB(t))}
              {gi < toolGroups.length - 1 && <div style={{ height: 1, margin: "1px 8px", background: `linear-gradient(90deg, transparent, ${c.br}, transparent)` }}/>}
            </div>
          ))}
          <div style={{ flex: 1 }}/>
          <div style={{ height: 1, margin: "1px 8px", background: `linear-gradient(90deg, transparent, ${c.br}, transparent)` }}/>
          {actionTools.map(t => renderTB(t))}
          <div style={{ height: 3 }}/>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ flex: 1, position: "relative", background: c.bg, display: "flex" }}>
            <div ref={chartCanvasRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              {priceLabels.map((_, i) => <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: `${(i/(priceLabels.length-1))*100}%`, height: 1, background: c.grid }}/>)}
              {timeLabels.map((_, i) => <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${(i/(timeLabels.length-1))*100}%`, width: 1, background: c.grid }}/>)}
              <div style={{ position: "absolute", left: 0, right: 0, top: "28%", height: 1, background: c.ac, opacity: 0.3 }}>
                <div style={{ position: "absolute", right: 0, top: -9, background: `linear-gradient(135deg,${c.ac},${c.acL})`, color: "#fff", fontSize: 9, fontWeight: 700, fontFamily: F, padding: "2px 8px", fontVariantNumeric: "tabular-nums" }}>126.895</div>
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, top: "58%", height: 1, borderTop: `1px dashed ${c.rd}44` }}/>
              <div style={{ position: "absolute", top: 8, left: 10, zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{symbol}</span>
                  <span style={{ fontSize: 9, color: c.tm }}>? 1m</span>
                  <div onClick={(e) => { e.stopPropagation(); setRollback(!rollback); }} style={{ cursor: "pointer", opacity: rollback ? 1 : 0.4, display: "flex", alignItems: "center", gap: 3 }}>
                    <I n="rollback" s={11} cl={rollback ? c.gn : c.rd}/>
                    <span style={{ fontSize: 7.5, color: rollback ? c.gn : c.rd, fontWeight: 700 }}>{rollback ? "RB" : "LOCKED"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 9.5 }}>
                  {[["O","126,680",c.gn],["H","126,745",c.gn],["L","126,675",c.rd],["C","126,730",c.gn]].map(([k,v,col]) => (
                    <span key={k} style={{ color: c.tm, fontWeight: 600 }}>{k} <span style={{ color: col, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span></span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ width: 65, flexShrink: 0, background: c.sf, borderLeft: `1px solid ${c.br}`, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "6px 0" }}>
              {priceLabels.map((p, i) => <span key={i} style={{ fontSize: 9, fontWeight: 600, color: c.axTx, textAlign: "right", paddingRight: 8, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{p}</span>)}
            </div>
          </div>
          <div style={{ height: 18, flexShrink: 0, background: c.sf, borderTop: `1px solid ${c.br}`, display: "flex", alignItems: "center", paddingRight: 65 }}>
            <div style={{ flex: 1, display: "flex", justifyContent: "space-between", padding: "0 8px", marginLeft: 36 }}>
              {timeLabels.map((t, i) => <span key={i} style={{ fontSize: 8, fontWeight: 600, color: c.axTx, fontVariantNumeric: "tabular-nums" }}>{t}</span>)}
            </div>
          </div>
          {/* Floating Replay Bar */}
          {/* REPLAY BAR PLACEHOLDER */}
          {/* Status bar */}
          <div style={{height:22,flexShrink:0,background:c.sf,borderTop:`1px solid ${c.br}`,display:'flex',alignItems:'center',padding:'0 10px',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,fontSize:9,fontVariantNumeric:'tabular-nums'}}>
              <span style={{color:c.ts,fontWeight:600}}><I n='eye' s={10} cl={c.ts}/></span>
              <span style={{color:c.ts}}>Balance <span style={{fontWeight:700,color:c.tx}}>10,000</span></span>
              <span style={{color:c.ts}}>Equity <span style={{fontWeight:700,color:c.tx}}>10,000</span></span>
              <span style={{color:c.ts}}>PnL <span style={{fontWeight:700,color:c.gn}}>0</span></span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:9}}>
              <I n='goto' s={10} cl={c.ts}/>
              <span style={{fontWeight:600,color:c.ts,fontVariantNumeric:'tabular-nums'}}>(Fri) 2009-01-09 02:21:00</span>
            </div>
          </div>
        </div>
        <div style={{ height: 110, flexShrink: 0, background: c.sf, borderTop: `1px solid ${c.br}`, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", height: 26, padding: "0 10px", borderBottom: `1px solid ${c.br}` }}>
              {["Positions (3)","Open Orders (0)","History"].map((t) => {
                const id = t.split(" ")[0].toLowerCase();
                return <button key={t} onClick={() => setBtmTab(id)} style={{ padding: "5px 12px", position: "relative", background: "transparent", border: "none", color: btmTab===id ? c.acL : c.ts, fontSize: 10, fontWeight: btmTab===id ? 700 : 600, cursor: "pointer", fontFamily: F }}>{t}{btmTab===id && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)` }}/>}</button>;
              })}
            </div>
            <div style={{ flex: 1, padding: "0 10px", overflow: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.5fr 1fr 1fr 0.8fr 0.5fr", fontSize: 8, color: c.tm, fontWeight: 700, letterSpacing: "0.06em", padding: "5px 0 3px", borderBottom: `1px solid ${c.br}` }}>
                <span>SYMBOL</span><span>SIZE</span><span>ENTRY</span><span>MARK</span><span>PNL</span><span></span>
              </div>
              {[{ sym: "EUR/JPY", side: "LONG", sz: "0.50", entry: "126,100", mark: "126,745", pnl: "+$1,090", pc: c.gn }].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.5fr 1fr 1fr 0.8fr 0.5fr", fontSize: 10, fontWeight: 600, padding: "4px 0", alignItems: "center", fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${c.br}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{r.sym}<span style={{ padding: "0 3px", fontSize: 7, fontWeight: 800, background: c.gnD, color: c.gn, border: `1px solid ${c.gnB}` }}>{r.side}</span></div>
                  <span style={{ color: c.ts }}>{r.sz}</span><span style={{ color: c.ts }}>{r.entry}</span><span>{r.mark}</span>
                  <span style={{ color: r.pc, fontWeight: 700 }}>{r.pnl}</span>
                  <B small>Close</B>
                </div>
              ))}
            </div>
        </div>
        <div style={{ width: (rightPanel || orderPanelOpen) ? 280 : 0, flexShrink: 0, overflow: "hidden", transition: "width 0.2s ease" }}>
        {rightPanel ? (()=>{
          const lyRows = [
            [[]], // 1 panel
            [ [{x1:.5,y1:0,x2:.5,y2:1}], [{x1:0,y1:.5,x2:1,y2:.5}] ], // 2 panels
            [ [{x1:.333,y1:0,x2:.333,y2:1},{x1:.667,y1:0,x2:.667,y2:1}], [{x1:0,y1:.333,x2:1,y2:.333},{x1:0,y1:.667,x2:1,y2:.667}],
              [{x1:.5,y1:0,x2:.5,y2:1},{x1:.5,y1:.5,x2:1,y2:.5}], [{x1:.5,y1:0,x2:.5,y2:1},{x1:0,y1:.5,x2:.5,y2:.5}],
              [{x1:0,y1:.5,x2:1,y2:.5},{x1:.5,y1:.5,x2:1,y2:1}], [{x1:0,y1:.5,x2:1,y2:.5},{x1:.5,y1:0,x2:.5,y2:.5}] ], // 3 panels
            [ [{x1:.5,y1:0,x2:.5,y2:1},{x1:0,y1:.5,x2:.5,y2:.5},{x1:.5,y1:.5,x2:1,y2:.5}],
              [{x1:.5,y1:0,x2:.5,y2:1},{x1:.5,y1:.5,x2:1,y2:.5},{x1:0,y1:.5,x2:.5,y2:.5}],
              [{x1:.5,y1:0,x2:.5,y2:1},{x1:0,y1:.333,x2:.5,y2:.333},{x1:0,y1:.667,x2:.5,y2:.667}],
              [{x1:.333,y1:0,x2:.333,y2:1},{x1:.667,y1:0,x2:.667,y2:1},{x1:0,y1:.5,x2:1,y2:.5}],
              [{x1:0,y1:.5,x2:1,y2:.5},{x1:.333,y1:0,x2:.333,y2:.5},{x1:.667,y1:0,x2:.667,y2:.5}],
              [{x1:0,y1:.5,x2:1,y2:.5},{x1:.333,y1:.5,x2:.333,y2:1},{x1:.667,y1:.5,x2:.667,y2:1}],
              [{x1:.333,y1:0,x2:.333,y2:1},{x1:.667,y1:0,x2:.667,y2:1},{x1:0,y1:.5,x2:.333,y2:.5}],
              [{x1:.5,y1:0,x2:.5,y2:.5},{x1:.5,y1:.5,x2:.5,y2:1},{x1:0,y1:.5,x2:1,y2:.5}] ], // 4 panels
            [ [{x1:.5,y1:0,x2:.5,y2:1},{x1:0,y1:.5,x2:.5,y2:.5},{x1:.5,y1:.333,x2:1,y2:.333},{x1:.5,y1:.667,x2:1,y2:.667}],
              [{x1:.5,y1:0,x2:.5,y2:1},{x1:.5,y1:.333,x2:1,y2:.333},{x1:.5,y1:.667,x2:1,y2:.667},{x1:0,y1:.5,x2:.5,y2:.5}],
              [{x1:.333,y1:0,x2:.333,y2:1},{x1:.667,y1:0,x2:.667,y2:1},{x1:0,y1:.5,x2:.333,y2:.5},{x1:.667,y1:.5,x2:1,y2:.5}],
              [{x1:0,y1:.5,x2:1,y2:.5},{x1:.25,y1:0,x2:.25,y2:.5},{x1:.5,y1:0,x2:.5,y2:.5},{x1:.75,y1:0,x2:.75,y2:.5}],
              [{x1:0,y1:.5,x2:1,y2:.5},{x1:.25,y1:.5,x2:.25,y2:1},{x1:.5,y1:.5,x2:.5,y2:1},{x1:.75,y1:.5,x2:.75,y2:1}] ], // 5 panels
            [ [{x1:.333,y1:0,x2:.333,y2:1},{x1:.667,y1:0,x2:.667,y2:1},{x1:0,y1:.5,x2:.333,y2:.5},{x1:.333,y1:.5,x2:.667,y2:.5},{x1:.667,y1:.5,x2:1,y2:.5}],
              [{x1:.333,y1:0,x2:.333,y2:1},{x1:.667,y1:0,x2:.667,y2:1},{x1:0,y1:.5,x2:.333,y2:.5},{x1:.667,y1:.5,x2:1,y2:.5}],
              [{x1:.5,y1:0,x2:.5,y2:1},{x1:0,y1:.333,x2:.5,y2:.333},{x1:0,y1:.667,x2:.5,y2:.667},{x1:.5,y1:.333,x2:1,y2:.333},{x1:.5,y1:.667,x2:1,y2:.667}],
              [{x1:0,y1:.333,x2:1,y2:.333},{x1:0,y1:.667,x2:1,y2:.667},{x1:.5,y1:0,x2:.5,y2:.333},{x1:.5,y1:.333,x2:.5,y2:.667},{x1:.5,y1:.667,x2:.5,y2:1}] ], // 6 panels
            [ [{x1:.333,y1:0,x2:.333,y2:1},{x1:.667,y1:0,x2:.667,y2:1},{x1:0,y1:.5,x2:1,y2:.5},{x1:0,y1:.333,x2:.333,y2:.333},{x1:.667,y1:.333,x2:1,y2:.333}],
              [{x1:0,y1:.333,x2:1,y2:.333},{x1:0,y1:.667,x2:1,y2:.667},{x1:.25,y1:0,x2:.25,y2:.333},{x1:.5,y1:0,x2:.5,y2:.333},{x1:.75,y1:0,x2:.75,y2:.333}] ], // 7 panels
            [ [{x1:.5,y1:0,x2:.5,y2:1},{x1:0,y1:.333,x2:.5,y2:.333},{x1:0,y1:.667,x2:.5,y2:.667},{x1:.5,y1:.333,x2:1,y2:.333},{x1:.5,y1:.667,x2:1,y2:.667}],
              [{x1:.333,y1:0,x2:.333,y2:1},{x1:.667,y1:0,x2:.667,y2:1},{x1:0,y1:.5,x2:.333,y2:.5},{x1:.333,y1:.5,x2:.667,y2:.5},{x1:.667,y1:.5,x2:1,y2:.5}],
              [{x1:0,y1:.333,x2:1,y2:.333},{x1:0,y1:.667,x2:1,y2:.667},{x1:.25,y1:0,x2:.25,y2:.333},{x1:.5,y1:0,x2:.5,y2:.333},{x1:.75,y1:0,x2:.75,y2:.333},{x1:.333,y1:.333,x2:.333,y2:.667}],
              [{x1:.25,y1:0,x2:.25,y2:1},{x1:.5,y1:0,x2:.5,y2:1},{x1:.75,y1:0,x2:.75,y2:1},{x1:0,y1:.5,x2:.25,y2:.5},{x1:.25,y1:.5,x2:.5,y2:.5},{x1:.5,y1:.5,x2:.75,y2:.5},{x1:.75,y1:.5,x2:1,y2:.5}] ], // 8 panels
          ];
          const IW=26, IH=17;
          const syncItems = [
            ["symbol","Symbol"],["interval","Interval"],["crosshair","Crosshair"],["time","Time"],
            ["dateRange","Date Range"],["drawings","Drawings"],["indicators","Indicators"],["chartType","Chart Type"]
          ];
          return (
        <div style={{ width: 280, height: "100%", background: c.sf, borderLeft: `1px solid ${c.br}`, display: "flex", flexDirection: "column", fontFamily: F }}>
          <div style={{ height: 2, background: `linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`, flexShrink: 0 }}/>
          <div style={{ padding: "6px 10px", display: "flex", alignItems: "center" }}>
            <I n={rightPanel==="layout"?"layout":rightPanel==="layers"?"tree":"news"} s={13} cl={c.acL}/>
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1, marginLeft: 7 }}>{rightPanel==="layout"?"Layout":rightPanel==="news"?"News":"Objects Tree"}</span>
            <div onClick={() => setRightPanel(null)} onMouseEnter={()=>setSwHov("xRightPanel")} onMouseLeave={()=>setSwHov(null)} style={{ cursor: "pointer", padding: 2 }}><I n="x" s={15} cl={swHov==="xRightPanel"?c.rd:c.ts}/></div>
          </div>
          <div style={{ height: 4, background: `linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`, flexShrink: 0 }}/>
          <div style={{ flex: 1, overflowY: "auto", fontSize: 9 }} className="tlr-scroll">
            {rightPanel==="news" && (()=>{
              const ALL_COUNTRIES = ["US","EU","GB","JP","AU","CA","DE","FR","IT","CN","CH"];
              const cntNames = {US:"United States",EU:"Euro Zone",GB:"United Kingdom",JP:"Japan",AU:"Australia",CA:"Canada",DE:"Germany",FR:"France",IT:"Italy",CN:"China",CH:"Switzerland"};
              const impCol = {high:c.rd, med:"#FF8C00", low:"#FFD700"};
              const newsData = [
                {id:1,time:"10:00",countdown:"in 3h 20m",country:"DE",impact:"high",title:"Germany ZEW Economic Sentiment",date:"2026.04.16",actual:null,forecast:"-11.4",previous:"-26.0",tab:"upcoming"},
                {id:2,time:"12:30",countdown:"in 5h 50m",country:"US",impact:"high",title:"Core PPI m/m",date:"2026.04.16",actual:null,forecast:"0.2%",previous:"0.5%",tab:"upcoming"},
                {id:3,time:"12:30",countdown:"in 5h 50m",country:"US",impact:"med",title:"Retail Sales m/m",date:"2026.04.16",actual:null,forecast:"0.8%",previous:"-1.1%",tab:"upcoming"},
                {id:4,time:"14:00",countdown:"in 7h 20m",country:"US",impact:"low",title:"Business Inventories m/m",date:"2026.04.16",actual:null,forecast:"0.3%",previous:"0.2%",tab:"upcoming"},
                {id:5,time:"16:00",countdown:"in 9h 20m",country:"CA",impact:"med",title:"BOC Governor Macklem Speaks",date:"2026.04.16",actual:null,forecast:"-",previous:"-",tab:"upcoming"},
                {id:6,time:"19:00",countdown:"in 12h",country:"US",impact:"low",title:"Fed Waller Speaks",date:"2026.04.16",actual:null,forecast:"-",previous:"-",tab:"upcoming"},
                {id:7,time:"08:30",country:"US",impact:"high",title:"CPI m/m",date:"2026.04.15",actual:"0.1%",forecast:"0.3%",previous:"0.2%",tab:"previous"},
                {id:8,time:"08:30",country:"US",impact:"high",title:"Core CPI m/m",date:"2026.04.15",actual:"0.3%",forecast:"0.3%",previous:"0.4%",tab:"previous"},
                {id:9,time:"03:00",country:"CN",impact:"high",title:"GDP q/y",date:"2026.04.16",actual:"5.4%",forecast:"5.2%",previous:"5.4%",tab:"previous"},
                {id:10,time:"10:00",country:"EU",impact:"med",title:"ECB President Lagarde Speaks",date:"2026.04.15",actual:"-",forecast:"-",previous:"-",tab:"previous"},
                {id:11,time:"09:30",country:"GB",impact:"high",title:"GDP m/m",date:"2026.04.11",actual:"0.5%",forecast:"0.1%",previous:"-0.1%",tab:"previous"},
                {id:12,time:"14:00",country:"US",impact:"med",title:"Michigan Consumer Sentiment",date:"2026.04.11",actual:"50.8",forecast:"54.5",previous:"57.0",tab:"previous"},
              ];
              const q = newsSearch.toLowerCase();
              const filtered = newsData.filter(ev =>
                ev.tab===newsTab &&
                newsImpact.includes(ev.impact) &&
                newsCntSel[ev.country] &&
                (!q || ev.title.toLowerCase().includes(q) || ev.country.toLowerCase().includes(q))
              );
              const allCntOn = ALL_COUNTRIES.every(co=>newsCntSel[co]);
              return (
                <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
                  {/* Search + Filter button */}
                  <div style={{padding:"7px 10px",flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
                    {/* Filter toggle button */}
                    {(()=>{
                      const fOn=newsFilterOpen;
                      const fH=swHov==="nfbtn";
                      return (
                        <div onClick={()=>setNewsFilterOpen(p=>!p)}
                          onMouseEnter={()=>setSwHov("nfbtn")} onMouseLeave={()=>setSwHov(null)}
                          style={{alignSelf:"stretch",padding:"0 6px",display:"flex",alignItems:"center",justifyContent:"center",
                            flexShrink:0,cursor:"pointer",position:"relative",
                            background:"transparent",border:"none"}}>
                          <I n="filter" s={13} cl={fOn?c.acL:fH?c.tx:c.ts}/>
                          {fOn && <div style={{position:"absolute",bottom:0,left:"15%",right:"15%",height:2,
                            background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,
                            boxShadow:`0 0 6px ${c.acG}`}}/>}
                          {fH&&!fOn && <div style={{position:"absolute",bottom:0,left:"25%",right:"25%",height:1,
                            background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)`}}/>}
                        </div>
                      );
                    })()}
                    {/* Search bar */}
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:6,background:c.well,border:`1px solid ${c.brH}`,padding:"5px 8px"}}>
                      <I n="search" s={11} cl={c.tm}/>
                      <input type="text" placeholder="Search events…" value={newsSearch} onChange={e=>setNewsSearch(e.target.value)}
                        style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9,fontFamily:F,padding:0}}/>
                      {newsSearch && <div onClick={()=>setNewsSearch("")} style={{cursor:"pointer"}}><I n="x" s={10} cl={c.ts}/></div>}
                    </div>
                  </div>
                  {/* Filters */}
                  <div style={{flexShrink:0,display:"grid",gridTemplateRows:newsFilterOpen?"1fr":"0fr",transition:"grid-template-rows 0.28s cubic-bezier(0.4,0,0.2,1)",overflow:"hidden"}}>
                    <div style={{overflow:"hidden",opacity:newsFilterOpen?1:0,transition:"opacity 0.22s ease"}}>
                      <div style={{padding:"0 10px 10px",display:"flex",flexDirection:"column",gap:8}}>
                        {/* Impact */}
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:10,color:c.tm,minWidth:40,flexShrink:0}}>Impact</span>
                          <div style={{display:"flex",gap:3,flex:1,justifyContent:"center"}}>
                            {["high","med","low"].map(lv=>{
                              const on=newsImpact.includes(lv);
                              const col=impCol[lv];
                              const isH=swHov===`ni-${lv}`;
                              return (
                                <div key={lv}
                                  onClick={()=>setNewsImpact(prev=>on?prev.filter(x=>x!==lv):[...prev,lv])}
                                  onMouseEnter={()=>setSwHov(`ni-${lv}`)} onMouseLeave={()=>setSwHov(null)}
                                  style={{padding:"3px 8px",fontSize:10,fontWeight:on?700:500,cursor:"pointer",
                                    letterSpacing:"0.03em",position:"relative",
                                    background:"transparent",border:"none",
                                    color:on?col:isH?col:c.tm,
                                    transition:"color 0.12s"}}>
                                  {lv==="med"?"Medium":lv==="high"?"High":"Low"}
                                  {on && <div style={{position:"absolute",bottom:0,left:"15%",right:"15%",height:2,
                                    background:`linear-gradient(90deg,transparent,${col},transparent)`,
                                    boxShadow:`0 0 5px ${col}88`}}/>}
                                  {isH&&!on && <div style={{position:"absolute",bottom:0,left:"25%",right:"25%",height:1,
                                    background:`linear-gradient(90deg,transparent,${col}66,transparent)`}}/>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* Symbol only */}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span style={{fontSize:10,color:newsSymbolOnly?c.acL:c.ts,fontWeight:newsSymbolOnly?600:400,transition:"color 0.15s"}}>Chart symbol only</span>
                          <Toggle on={newsSymbolOnly} onClick={()=>setNewsSymbolOnly(p=>!p)} color={c.acL} c={c} swHov={swHov} setSwHov={setSwHov}/>
                        </div>
                        {/* Countries */}
                        <div>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                            <span style={{fontSize:9,fontWeight:700,color:c.tm,letterSpacing:"0.06em"}}>COUNTRIES</span>
                            <div onClick={()=>setNewsCntSel(ALL_COUNTRIES.reduce((a,co)=>({...a,[co]:allCntOn?0:1}),{}))}
                              onMouseEnter={()=>setSwHov("ncAll")} onMouseLeave={()=>setSwHov(null)}
                              style={{width:28,textAlign:"center",fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.04em",
                                color:allCntOn?c.ts:c.acL,
                                textShadow:(!allCntOn&&swHov==="ncAll")?`0 0 8px ${c.acL}`:"none",
                                opacity:swHov==="ncAll"?1:0.85,
                                transition:"color 0.15s,opacity 0.1s,text-shadow 0.15s"}}>
                              {allCntOn?"None":"All"}
                            </div>
                          </div>
                          <div className="tlr-scroll" style={{maxHeight:130,overflowY:"auto",display:"flex",flexDirection:"column",gap:1}}>
                            {ALL_COUNTRIES.map(co=>{
                              const on=!!newsCntSel[co];
                              const isH=swHov===`nc-${co}`;
                              return (
                                <div key={co}
                                  onClick={()=>setNewsCntSel(prev=>({...prev,[co]:prev[co]?0:1}))}
                                  onMouseEnter={()=>setSwHov(`nc-${co}`)} onMouseLeave={()=>setSwHov(null)}
                                  style={{display:"flex",alignItems:"center",gap:7,padding:"4px 8px",cursor:"pointer",
                                    background:isH?"rgba(255,255,255,0.022)":"transparent",
                                    borderLeft:`2px solid ${on?c.acL:"transparent"}`,
                                    transition:"background 0.1s,border-color 0.1s"}}>
                                  <FlagSvg code={co} w={18} h={12}/>
                                  <span style={{flex:1,fontSize:9,color:on?c.acL:c.ts,fontWeight:on?600:400,transition:"color 0.1s"}}>{cntNames[co]}</span>
                                  <div style={{flexShrink:0,width:10,height:10}}>
                                    <svg width={10} height={10} style={{display:"block",overflow:"visible"}}>
                                      <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={on?c.acL:isH?c.ts:"rgba(140,160,255,0.22)"} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                      <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={on?c.acL:isH?c.ts:"rgba(140,160,255,0.22)"} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                      {!on && isH && <>
                                        <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(74,106,255,0.35)" strokeWidth={1} fill="none" strokeLinecap="square"/>
                                        <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(74,106,255,0.35)" strokeWidth={1} fill="none" strokeLinecap="square"/>
                                      </>}
                                      {on && <>
                                        <path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                        <path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                        <circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/>
                                        <circle cx={5} cy={5} r={1.6} fill={c.acL}/>
                                      </>}
                                    </svg>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Blue separator line after filters */}
                  <div style={{height:2,flexShrink:0,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`}}/>
                  {/* Tabs */}
                  {(()=>{const newsTabIdx=["previous","upcoming"].indexOf(newsTab); return(
                  <div style={{position:"relative",display:"flex",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                    {["previous","upcoming"].map(tab=>{
                      const isAct=newsTab===tab;
                      const isH=swHov===`ntab-${tab}`;
                      return (
                        <div key={tab} onClick={()=>setNewsTab(tab)}
                          onMouseEnter={()=>setSwHov(`ntab-${tab}`)} onMouseLeave={()=>setSwHov(null)}
                          style={{flex:1,padding:"7px 0",textAlign:"center",cursor:"pointer",
                            color:isAct?c.acL:isH?c.tx:c.ts,fontSize:9,fontWeight:isAct?700:500,
                            transition:"color 0.15s"}}>
                          {tab[0].toUpperCase()+tab.slice(1)}
                        </div>
                      );
                    })}
                    <div style={{position:"absolute",bottom:0,height:2,
                      width:"40%",
                      left:`calc(${newsTabIdx*50}% + 5%)`,
                      transition:"left 0.25s cubic-bezier(0.4,0,0.2,1)",
                      background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,
                      boxShadow:`0 0 6px ${c.acG}`}}/>
                  </div>
                  );})()}
                  {/* News list */}
                  <div className="tlr-scroll" style={{flex:1,overflowY:"auto"}}>
                    {filtered.length===0
                      ? <div style={{padding:"32px 14px",textAlign:"center",color:c.tm,fontSize:9}}>No events match filters</div>
                      : filtered.map((ev,idx)=>{
                          const col=impCol[ev.impact];
                          const barCount=ev.impact==="high"?3:ev.impact==="med"?2:1;
                          const isH=swHov===`nev-${ev.id}`;
                          const hasAct=ev.actual&&ev.actual!=="-"&&ev.actual!==null;
                          const actVal=hasAct?parseFloat(ev.actual):null;
                          const fcVal=ev.forecast&&ev.forecast!=="-"?parseFloat(ev.forecast):null;
                          const actCol=hasAct?(fcVal!=null?(actVal>=fcVal?c.gn:c.rd):c.tx):c.tm;
                          const beat=hasAct&&fcVal!=null&&actVal>fcVal;
                          const miss=hasAct&&fcVal!=null&&actVal<fcVal;
                          const hasFc=ev.forecast&&ev.forecast!=="-";
                          const hasPrev=ev.previous&&ev.previous!=="-";
                          const hasData=hasAct||hasFc||hasPrev;
                          return (
                            <div key={ev.id}
                              onMouseEnter={()=>setSwHov(`nev-${ev.id}`)}
                              onMouseLeave={()=>setSwHov(null)}
                              style={{display:"flex",alignItems:"stretch",
                                borderBottom:`1px solid ${c.br}`,
                                background:isH?"rgba(255,255,255,0.022)":"transparent",
                                transition:"background 0.12s",cursor:"default",minHeight:48}}>

                              {/* Impact rail */}
                              <div style={{width:3,flexShrink:0,
                                background:`linear-gradient(180deg,${col}cc,${col}55)`,
                                opacity:isH?1:0.45,
                                transition:"opacity 0.15s"}}/>

                              {/* Time + Flag column */}
                              <div style={{width:46,flexShrink:0,display:"flex",flexDirection:"column",
                                alignItems:"center",justifyContent:"center",gap:4,padding:"6px 0",
                                borderRight:`1px solid rgba(140,160,255,0.07)`}}>
                                <span style={{fontSize:10,fontWeight:700,color:c.tx,
                                  fontVariantNumeric:"tabular-nums",letterSpacing:"-0.01em",lineHeight:1}}>
                                  {ev.time}
                                </span>
                                <FlagSvg code={ev.country} w={16} h={10}/>
                              </div>

                              {/* Main content */}
                              <div style={{flex:1,padding:"7px 8px",display:"flex",flexDirection:"column",justifyContent:"center",minWidth:0}}>
                                {/* Impact dots + title */}
                                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                                  <div style={{display:"flex",gap:2.5,flexShrink:0,alignItems:"flex-end"}}>
                                    {[0,1,2].map(i=>(
                                      <div key={i} style={{width:3,borderRadius:1.5,
                                        height:i===0?4:i===1?6:8,
                                        background:i<barCount?col:"rgba(140,160,255,0.13)"}}/>
                                    ))}
                                  </div>
                                  <span style={{fontSize:9,fontWeight:600,color:isH?c.tx:c.ts,
                                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                                    lineHeight:1.3,flex:1,transition:"color 0.1s"}}>
                                    {ev.title}
                                  </span>
                                </div>
                                {/* Date */}
                                <div style={{fontSize:9,fontWeight:700,color:c.acL,marginBottom:hasData?4:0,
                                  fontVariantNumeric:"tabular-nums"}}>
                                  {ev.date}
                                </div>
                                {/* Values: label above, value below, no container */}
                                {hasData && (
                                  <div style={{display:"flex",gap:10}}>
                                    {hasAct && (
                                      <div>
                                        <div style={{fontSize:6.5,fontWeight:700,color:c.tm,letterSpacing:"0.06em",marginBottom:2}}>ACTUAL</div>
                                        <div style={{fontSize:10,fontWeight:800,color:actCol,fontVariantNumeric:"tabular-nums"}}>{ev.actual}</div>
                                      </div>
                                    )}
                                    {hasFc && (
                                      <div>
                                        <div style={{fontSize:6.5,fontWeight:700,color:c.tm,letterSpacing:"0.06em",marginBottom:2}}>FORECAST</div>
                                        <div style={{fontSize:9,fontWeight:600,color:c.ts,fontVariantNumeric:"tabular-nums"}}>{ev.forecast}</div>
                                      </div>
                                    )}
                                    {hasPrev && (
                                      <div>
                                        <div style={{fontSize:6.5,fontWeight:700,color:c.tm,letterSpacing:"0.06em",marginBottom:2}}>PREVIOUS</div>
                                        <div style={{fontSize:9,fontWeight:500,color:c.tm,fontVariantNumeric:"tabular-nums"}}>{ev.previous}</div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Right zone: countdown or beat/miss indicator */}
                              <div style={{width:46,flexShrink:0,display:"flex",flexDirection:"column",
                                alignItems:"center",justifyContent:"center",padding:"0 5px",gap:3}}>
                                {ev.countdown ? (
                                  <span style={{fontSize:9.5,fontWeight:700,color:c.acL,
                                    fontVariantNumeric:"tabular-nums",textAlign:"center",lineHeight:1.35,
                                    whiteSpace:"nowrap",marginRight:6}}>
                                    {ev.countdown.replace("in ","")}
                                  </span>
                                ) : hasAct && fcVal!=null ? (
                                  <>
                                    <svg width={12} height={8} viewBox="0 0 12 8">
                                      <path d={beat?"M1,7 L6,1 L11,7":"M1,1 L6,7 L11,1"}
                                        stroke={beat?c.gn:miss?c.rd:c.tm}
                                        strokeWidth={1.8} fill="none"
                                        strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <span style={{fontSize:8,fontWeight:700,
                                      color:beat?c.gn:miss?c.rd:c.tm,
                                      fontVariantNumeric:"tabular-nums"}}>
                                      {ev.actual}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                </div>
              );
            })()}
            {rightPanel==="layers" && (
              <div>
                {layersItems.length===0 ? (
                  <div style={{padding:"28px 14px",textAlign:"center",color:c.tm,fontSize:9}}>No objects on chart</div>
                ) : layersItems.map(item=>{
                  const isH = swHov===`lyr-${item.id}`;
                  const isJumpH = swHov===`lyrJ-${item.id}`;
                  const isVisH = swHov===`lyrV-${item.id}`;
                  const isDelH = swHov===`lyrD-${item.id}`;
                  const isDelDn = swHov===`lyrD-${item.id}_dn`;
                  const anyHov = isH||isJumpH||isVisH||isDelH||isDelDn;
                  const isVis = layersVis[item.id] !== false;
                  return (
                    <div key={item.id}
                      onMouseEnter={()=>setSwHov(`lyr-${item.id}`)}
                      onMouseLeave={()=>setSwHov(null)}
                      style={{display:"flex",alignItems:"center",gap:7,padding:"6px 10px",
                        background:anyHov?"rgba(255,255,255,0.022)":"transparent",
                        borderLeft:`2px solid ${anyHov?c.acL:"transparent"}`,
                        transition:"background 0.1s,border-color 0.1s"}}>
                      {/* drawing type icon */}
                      <I n={item.icon} s={13} cl={isVis?c.ts:"rgba(140,160,255,0.3)"}/>
                      {/* name */}
                      <span style={{flex:1,fontSize:9.5,fontWeight:500,color:isVis?c.ts:"rgba(140,160,255,0.3)",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                        transition:"color 0.15s"}}>{item.name}</span>
                      {/* action buttons — appear on row hover */}
                      {/* jump to */}
                      <div data-layeraction="1"
                        onClick={(e)=>{e.stopPropagation();}}
                        onMouseEnter={()=>setSwHov(`lyrJ-${item.id}`)}
                        onMouseLeave={()=>setSwHov(`lyr-${item.id}`)}
                        style={{width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",
                          cursor:"pointer",flexShrink:0,opacity:isJumpH?1:anyHov?0.55:0,
                          transition:"opacity 0.15s"}}>
                        <I n="locate" s={13} cl={isJumpH?c.acL:c.ts}/>
                      </div>
                      {/* visibility */}
                      <div data-layeraction="1"
                        onClick={(e)=>{e.stopPropagation();setLayersVis(prev=>({...prev,[item.id]:!isVis}));}}
                        onMouseEnter={()=>setSwHov(`lyrV-${item.id}`)}
                        onMouseLeave={()=>setSwHov(`lyr-${item.id}`)}
                        style={{width:16,height:16,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",
                          cursor:"pointer",flexShrink:0,opacity:isVisH?1:!isVis?1:anyHov?0.55:0,
                          transition:"opacity 0.15s"}}>
                        <I n="eye" s={12} cl={isVisH?c.acL:isVis?c.ts:"#F5A020"}/>
                        {!isVis && (
                          <svg width={16} height={16} viewBox="0 0 16 16" style={{position:"absolute",top:0,left:0,pointerEvents:"none"}}>
                            <line x1={2} y1={2} x2={14} y2={14} stroke={isVisH?c.acL:"#F5A020"} strokeWidth={0.85} strokeLinecap="round"/>
                          </svg>
                        )}
                      </div>
                      {/* delete */}
                      <div data-layeraction="1"
                        onClick={(e)=>{e.stopPropagation();setLayersItems(prev=>prev.filter(x=>x.id!==item.id));}}
                        onMouseEnter={()=>setSwHov(`lyrD-${item.id}`)}
                        onMouseLeave={()=>setSwHov(`lyr-${item.id}`)}
                        onMouseDown={(e)=>{e.stopPropagation();setSwHov(`lyrD-${item.id}_dn`);}}
                        onMouseUp={()=>setSwHov(`lyrD-${item.id}`)}
                        style={{width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",
                          cursor:"pointer",flexShrink:0,opacity:isDelH||isDelDn?1:anyHov?0.55:0,
                          transform:isDelDn?"scale(0.86)":"scale(1)",
                          transition:"opacity 0.15s,transform 0.08s"}}>
                        <I n="trash" s={12} cl={isDelH||isDelDn?c.rd:c.ts}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {rightPanel==="layout" && (
              <div style={{padding:"14px 12px 16px",display:"flex",flexDirection:"column",gap:16}}>
                {/* PANEL LAYOUTS */}
                <div>
                  <div style={{fontSize:7,fontWeight:700,color:c.tm,letterSpacing:"0.07em",marginBottom:10}}>PANEL LAYOUTS</div>
                  {[1,2,3,4,5,6,7,8].map((n)=>{
                    const variants = lyRows[n-1];
                    return (
                      <div key={n} style={{marginBottom:8}}>
                        <div style={{fontSize:7,color:c.tm,marginBottom:4,opacity:0.55}}>{n}</div>
                        <div style={{display:"flex",flexWrap:"nowrap",gap:4}}>
                          {variants.map((lines,li)=>{
                            const isAct = layoutPanels.n===n && layoutPanels.li===li;
                            const isH = swHov===`ly-${n}-${li}`;
                            const pad=2;
                            return (
                              <div key={li}
                                onClick={()=>setLayoutPanels({n,li})}
                                onMouseEnter={()=>setSwHov(`ly-${n}-${li}`)}
                                onMouseLeave={()=>setSwHov(null)}
                                style={{width:IW,height:IH,position:"relative",cursor:"pointer",flexShrink:0,
                                  background:isAct?`rgba(38,67,247,0.22)`:isH?"rgba(140,160,255,0.10)":"rgba(140,160,255,0.05)",
                                  border:`1px solid ${isAct?c.ac:isH?"rgba(140,160,255,0.35)":"rgba(140,160,255,0.22)"}`,
                                  boxShadow:isAct?`0 0 8px ${c.acG}`:"none",
                                  overflow:"hidden",
                                  transition:"background 0.12s,border-color 0.12s,box-shadow 0.12s"}}>
                                <svg width={IW} height={IH} viewBox={`0 0 ${IW} ${IH}`} style={{display:"block",position:"absolute",inset:0}}>
                                  <defs><clipPath id={`ly-clip-${n}-${li}`}><rect x={pad} y={pad} width={IW-pad*2} height={IH-pad*2}/></clipPath></defs>
                                  <g clipPath={`url(#ly-clip-${n}-${li})`}>
                                    {lines.map((l,i)=>(
                                      <line key={i}
                                        x1={pad+l.x1*(IW-pad*2)} y1={pad+l.y1*(IH-pad*2)} x2={pad+l.x2*(IW-pad*2)} y2={pad+l.y2*(IH-pad*2)}
                                        stroke={isAct?c.acL:isH?"rgba(140,160,255,0.55)":"rgba(140,160,255,0.38)"} strokeWidth={0.9}/>
                                    ))}
                                  </g>
                                </svg>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* divider */}
                <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.acB},rgba(74,106,255,0.45),${c.acB},transparent)`}}/>
                {/* SYNC IN LAYOUT */}
                <div>
                  <div style={{fontSize:7,fontWeight:700,color:c.tm,letterSpacing:"0.07em",marginBottom:10}}>SYNC IN LAYOUT</div>
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    {syncItems.map(([key,label])=>{
                      const on = layoutSync[key];
                      const isH = swHov===`sync-${key}`;
                      return (
                        <div key={key}
                          onClick={()=>setLayoutSync(prev=>({...prev,[key]:!prev[key]}))}
                          onMouseEnter={()=>setSwHov(`sync-${key}`)}
                          onMouseLeave={()=>setSwHov(null)}
                          style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                            padding:"5px 8px",cursor:"pointer",
                            background:on?c.acD:isH?"rgba(255,255,255,0.025)":"transparent",
                            borderLeft:`2px solid ${on?c.acL:"transparent"}`,
                            transition:"background 0.1s"}}>
                          <span style={{fontSize:9.5,color:on?c.acL:c.ts,fontWeight:on?700:500,transition:"color 0.15s"}}>{label}</span>
                          <Toggle on={on} onClick={()=>{}} color={c.acL} hk={`sync-${key}`} c={c} swHov={swHov} setSwHov={setSwHov}/>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
          );
        })() : orderPanelOpen ? (
        <div style={{ width: 280, background: c.sf, borderLeft: `1px solid ${c.br}`, display: "flex", flexDirection: "column", fontSize: 10, height: "100%" }}>
          <div style={{ padding: "6px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Place Order</span>
            <span style={{ padding: "0 5px", fontSize: 7.5, fontWeight: 800, color: c.acL, background: c.acD, border: `1px solid ${c.acB}` }}>{symbol}</span>
          </div>
          <div style={{ padding: "3px 10px", borderBottom: `1px solid ${c.br}`, fontSize: 8, color: c.tm }}>Spread: <span style={{ color: c.ts }}>0.00</span> ? Comm: <span style={{ color: c.ts }}>$0.00</span></div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", gap: 3 }}><Sel><option>- Select -</option></Sel><B small>Load</B><B small>Save</B><B small>Del</B></div>
          <div style={{ padding: "4px 10px 0", borderBottom: `1px solid ${c.br}` }}>
            <div style={{ display: "flex", marginBottom: 3 }}>
              {["BUY","SELL"].map((s) => { const a = buySell===s.toLowerCase(); const col = s==="BUY" ? c.gn : c.rd; return (
                <button key={s} onClick={() => setBuySell(s.toLowerCase())} style={{ flex: 1, padding: "5px 0", border: "none", position: "relative", background: a ? (s==="BUY" ? c.gnD : c.rdD) : "transparent", color: a ? col : c.ts, fontSize: 10, fontWeight: 800, fontFamily: F, cursor: "pointer" }}>
                  {s}{a && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${col}, transparent)` }}/>}
                </button>);
              })}
            </div>
            <div style={{ display: "flex", paddingBottom: 2 }}>
              {["Market","Limit","Stop"].map((t) => { const a = orderType===t.toLowerCase(); return <button key={t} onClick={() => setOrderType(t.toLowerCase())} style={{ padding: "5px 12px", position: "relative", background: "transparent", border: "none", color: a ? c.acL : c.ts, fontSize: 10, fontWeight: a ? 700 : 600, fontFamily: F, cursor: "pointer" }}>{t}{a && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, background: `linear-gradient(90deg, transparent, ${c.acL}, transparent)` }}/>}</button>; })}
            </div>
          </div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center", gap: 3 }}>
            {["$","%","#"].map((m) => { const a = sizeMode===m; return <button key={m} onClick={() => setSizeMode(m)} style={{ width: 20, height: 18, background: a ? c.well : "transparent", border: `1px solid ${a ? c.acB : "transparent"}`, color: a ? c.acL : c.tm, fontSize: 9, fontWeight: 800, fontFamily: F, cursor: "pointer" }}>{m}</button>; })}
            <div style={{ flex: 1, display: "flex", alignItems: "center", background: c.well, border: `1px solid ${c.br}`, padding: "2px 5px" }}><span style={{ color: c.tm, fontSize: 8 }}>$</span><span style={{ flex: 1, textAlign: "right", fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>100</span></div>
            <B small sx={{ padding: "2px 3px" }}><I n="minus" s={8}/></B><B small sx={{ padding: "2px 3px" }}><I n="plus" s={8}/></B>
          </div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 800 }}>ENTRY</span>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}><span style={{ padding: "0 4px", fontSize: 7, fontWeight: 800, color: c.acL, background: c.acD }}>SINGLE</span><span style={{ fontSize: 7.5, fontWeight: 800, color: c.rd }}>? STOP LOSS</span></div>
            </div>
            <div style={{ padding: "4px 6px", background: c.well, border: `1px solid ${c.br}`, fontSize: 14, fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>126,530</div>
            {[{q:"1",r:"50",p:"50%",l:"0.32"},{q:"1",r:"50",p:"50%",l:"0.19"}].map((row,i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}>
                <MiniIn val={row.q} w={18}/><B small sx={{padding:"1px 2px"}}><I n="minus" s={6}/></B><B small sx={{padding:"1px 2px"}}><I n="plus" s={6}/></B>
                <MiniIn val={row.r} w={36} pre="$"/><B small sx={{padding:"1px 2px"}}><I n="minus" s={6}/></B><B small sx={{padding:"1px 2px"}}><I n="plus" s={6}/></B>
                <button style={{ width: 14, height: 16, background: c.rdD, border: `1px solid ${c.rdB}`, color: c.rd, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><I n="x" s={6} cl={c.rd}/></button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, padding: "2px 5px", background: c.well, border: `1px solid ${c.br}`, marginTop: 3 }}>
              <span><span style={{ color: c.tm }}>Avg </span><span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>126.778</span></span>
              <span><span style={{ color: c.acL }}>Qty </span><span style={{ fontWeight: 700 }}>0.51 Lots</span></span>
            </div>
          </div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 5, height: 5, background: c.gold, transform: "rotate(45deg)" }}/>PROFIT TARGET</span>
              <span style={{ padding: "0 4px", fontSize: 7, fontWeight: 800, color: c.gn, background: c.gnD }}>SINGLE</span>
            </div>
            {[{p:"0",r:"-",pr:"0.00"},{p:"0",r:"-",pr:"0.00"}].map((_,i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, padding: "2px 0", borderBottom: `1px solid ${c.br}`, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ background: c.well, border: `1px solid ${c.br}`, padding: "1px 4px", fontSize: 8.5, width: 60 }}>0</span>
                <span style={{ color: c.ts }}>-</span><span style={{ color: c.gn, fontWeight: 700 }}>0.00</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5, marginTop: 2 }}><span style={{ color: c.tm }}>Blended</span><span style={{ fontWeight: 800, color: c.gn }}>0.0R ? +$0.00</span></div>
            <div style={{ height: 2.5, background: c.rd, marginTop: 3, opacity: 0.6 }}/><div style={{ height: 2.5, background: `repeating-linear-gradient(90deg,${c.gn} 0,${c.gn} 4px,transparent 4px,transparent 8px)`, opacity: 0.35, marginTop: 1 }}/>
          </div>
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.br}`, display: "flex", alignItems: "center", gap: 6 }}>
            <Toggle on={advOpen} onClick={() => setAdvOpen(!advOpen)} color={c.gold} c={c} swHov={swHov} setSwHov={setSwHov}/><span style={{ fontSize: 9, fontWeight: 600, color: advOpen ? c.tx : c.ts }}>Advanced</span>
          </div>
          {advOpen && <div style={{ borderBottom: `1px solid ${c.br}` }}>
            <div style={{ display: "flex" }}>
              {["breakeven","trailing"].map((m) => <button key={m} onClick={() => setAdvMode(m)} style={{ flex: 1, padding: "4px 0", background: advMode===m ? c.acD : "transparent", border: "none", borderBottom: advMode===m ? `2px solid ${c.gn}` : "2px solid transparent", color: advMode===m ? c.gn : c.ts, fontSize: 8.5, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>{m==="breakeven" ? "Breakeven" : "Trailing SL"}</button>)}
            </div>
            <div style={{ padding: "5px 10px" }}>
              {advMode==="breakeven" ? (
                <div style={{ display: "flex", gap: 3, alignItems: "center", fontSize: 8, flexWrap: "wrap" }}>
                  <span style={{ color: c.tm }}>After</span><MiniIn val="0.5" w={28}/><span style={{ color: c.tm }}>R ? entry +</span><MiniIn val="0" w={24}/><span style={{ color: c.tm }}>pts</span>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 3, alignItems: "center", fontSize: 8, flexWrap: "wrap" }}>
                  <span style={{ color: c.tm }}>After</span><MiniIn val="1" w={22}/><span style={{ color: c.tm }}>R trail</span><MiniIn val="0.5" w={26}/><span style={{ color: c.tm }}>every</span><MiniIn val="0.25" w={28}/><span style={{ color: c.tm }}>R</span>
                </div>
              )}
            </div>
          </div>}
          <div style={{ padding: "4px 10px", marginTop: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}><span style={{ color: c.gn, fontWeight: 700 }}>Reward</span><span style={{ color: c.gn }}><I n="link" s={9} cl={c.gn}/></span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}><span style={{ color: c.rd, fontWeight: 700 }}>Risk</span><span style={{ color: c.rd, fontWeight: 700 }}>$100.00</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}><span style={{ color: c.tm }}>Margin</span><span style={{ color: c.gn, fontWeight: 700 }}>5882%</span></div>
          </div>
          <div style={{ padding: "6px 10px" }}>
            <button style={{ width: "100%", padding: "10px 0", background: buySell==="buy" ? `linear-gradient(135deg,${c.gn},#00B88A)` : `linear-gradient(135deg,${c.rd},#E8405A)`, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 3px 12px ${buySell==="buy" ? "rgba(0,212,161,0.20)" : "rgba(255,80,104,0.20)"}`, clipPath: "polygon(4px 0,calc(100% - 4px) 0,100% 4px,100% calc(100% - 4px),calc(100% - 4px) 100%,4px 100%,0 calc(100% - 4px),0 4px)" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.06em" }}>{buySell==="buy" ? "Buy" : "Sell"} 0.51 {symbol}</span>
            </button>
          </div>
        </div>
        ) : null}
        </div>
      </div>
      <div style={{ height: 14, flexShrink: 0, background: c.sf, borderTop: `1px solid ${c.br}` }}/>
      {settDrop && (()=>{
        const defaultTplOpts = [{n:"Dark Classic",cols:["#00D4A1","#FF5068","#2643F7"]},{n:"Professional",cols:["#26A69A","#EF5350","#1565C0"]},{n:"Ocean Night",cols:["#00BCD4","#FF4081","#00E5FF"]},{n:"Amber Dusk",cols:["#FF9800","#F44336","#FFC107"]},{n:"Forest Deep",cols:["#66BB6A","#81C784","#4CAF50"]},{n:"Midnight",cols:["#42A5F5","#EF5350","#7E57C2"]},{n:"Crimson",cols:["#F44336","#9C27B0","#E91E63"]},{n:"Arctic Frost",cols:["#80DEEA","#FFAB40","#4FC3F7"]},{n:"Cyber Green",cols:["#00E676","#FF1744","#76FF03"]},{n:"Rose Gold",cols:["#F48FB1","#FFB74D","#CE93D8"]}];
        const tplOpts = [...(customTemplates.length>0?[{divider:"SAVED"},...customTemplates,{divider:"DEFAULT"}]:[]),...defaultTplOpts];
        const cfgMap = { gridStyle:{key:"gridLineStyle",type:"style"}, gridThick:{key:"gridLineThickness",type:"thick"}, priceStyle:{key:"priceLineStyle",type:"style"}, priceThick:{key:"priceLineThickness",type:"thick"}, chartTimeFormat:{key:"timeFormat",type:"select",opts:["24h","12h"]}, chartTimezone:{key:"timezone",type:"select",opts:["UTC","UTC+3 (Riyadh)","UTC+4 (Dubai)","UTC+5:30 (IST)","UTC+8 (Asia)","UTC-5 (EST)","UTC-8 (PST)"]}, chartPrecision:{key:"precision",type:"select",opts:["0.00000","0.0000","0.000","0.00","0.0"]}, chartTemplate:{key:"chartTemplate",type:"template",opts:tplOpts} };
        if (settDrop==="profLang") return <>
          <div data-sdrop="1" onClick={e=>e.stopPropagation()} style={{position:"fixed",top:settDropPos.top,left:settDropPos.left,zIndex:9250,width:settDropPos.w||140,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`,fontFamily:F,animation:"tlrPopIn 0.13s ease"}}>
            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
            <div style={{padding:"4px 0"}}>
              <div style={{padding:"5px 12px 3px",fontSize:7,fontWeight:700,color:c.tm,letterSpacing:"0.06em"}}>LANGUAGE</div>
              {[["english","English"],["arabic","العربية"],["turkish","Türkçe"]].map(([id,label])=>{
                const isAct=profileLang===id; const isH=swHov===`lang-${id}`;
                return(
                  <div key={id} onClick={()=>{setProfileLang(id);setSettDrop(null);}}
                    onMouseEnter={()=>setSwHov(`lang-${id}`)} onMouseLeave={()=>setSwHov(null)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",cursor:"pointer",
                      background:isH?"rgba(255,255,255,0.022)":"transparent",
                      borderLeft:`2px solid ${isAct?c.acL:"transparent"}`,
                      transition:"background 0.1s,border-color 0.1s"}}>
                    <span style={{flex:1,fontSize:9.5,fontWeight:isAct?700:500,color:isAct?c.acL:isH?c.tx:c.ts}}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>;
        if (settDrop==="loadTemplate") return <>
          <div data-sdrop="1" onClick={e=>e.stopPropagation()} style={{position:"fixed",top:settDropPos.top,left:settDropPos.left,zIndex:9250,width:settDropPos.w||150,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`,fontFamily:F,animation:"tlrPopIn 0.13s ease"}}>
            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
            <div style={{padding:"4px 0"}}>
              <div style={{padding:"5px 12px 3px",fontSize:7,fontWeight:700,color:c.tm,letterSpacing:"0.06em"}}>SAVED TEMPLATES</div>
              {customTemplates.length===0 ? (
                <div style={{padding:"10px 12px",fontSize:8.5,color:c.tm,fontStyle:"italic",textAlign:"center"}}>No saved templates</div>
              ) : customTemplates.map((tpl,i)=>{
                const isAct=settings.chartTemplate===tpl.n;
                return (
                  <div key={tpl.n} onClick={()=>{applyTemplate(tpl.n,tpl.settings);setSettDrop(null);}}
                    onMouseEnter={()=>setSwHov("ldtpl-"+i)} onMouseLeave={()=>setSwHov(null)}
                    style={{display:"flex",alignItems:"center",gap:7,padding:"6px 12px",cursor:"pointer",
                      background:isAct?c.acD:swHov==="ldtpl-"+i?"rgba(255,255,255,0.03)":"transparent",
                      borderLeft:isAct?`2px solid ${c.acL}`:"2px solid transparent"}}>
                    <div style={{display:"flex",gap:3,flexShrink:0}}>
                      {tpl.cols.map((col,ci)=><div key={ci} style={{width:8,height:8,borderRadius:"50%",background:col,boxShadow:`0 0 4px ${col}88`}}/>)}
                    </div>
                    <span style={{flex:1,fontSize:9.5,color:isAct?c.acL:c.ts,fontWeight:isAct?700:500}}>{tpl.n}</span>
                    <div onClick={(e)=>{e.stopPropagation();setCustomTemplates(prev=>prev.filter((_,j)=>j!==i));}}
                      onMouseEnter={()=>setSwHov("ldtpldel-"+i)} onMouseLeave={()=>setSwHov("ldtpl-"+i)}
                      style={{fontSize:13,lineHeight:1,color:swHov==="ldtpldel-"+i?c.rd:"rgba(140,160,255,0.3)",cursor:"pointer",padding:"0 2px",transition:"color 0.12s"}}>×</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>;
        const cfg = cfgMap[settDrop];
        if (!cfg) return null;
        const styleOpts = [{val:"solid",dash:"none"},{val:"dashed",dash:"5,4"},{val:"dotted",dash:"1.5,4"},{val:"longDash",dash:"10,5"}];
        const thickOpts = [0.5,1,1.5,2,2.5,3];
        return <>
          <div data-sdrop="1" onClick={e=>e.stopPropagation()} style={{position:"fixed",top:settDropPos.top,left:settDropPos.left,zIndex:9250,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${c.acG}`,fontFamily:F,animation:"tlrPopIn 0.13s ease",...(cfg.type==="template"&&settDropPos.w?{width:settDropPos.w}:{minWidth:80})}}>
            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
            <div style={{padding:"4px 0"}}>
              {cfg.type==="select" && cfg.opts.map(opt=>{
                const active = settings[cfg.key]===opt;
                return (
                  <div key={opt} onClick={()=>{updateSetting(cfg.key,opt);setSettDrop(null);}}
                    onMouseEnter={()=>setSwHov("sdrop-"+opt)} onMouseLeave={()=>setSwHov(null)}
                    style={{display:"flex",alignItems:"center",padding:"5px 14px",cursor:"pointer",gap:8,
                      background:active?c.acD:swHov==="sdrop-"+opt?"rgba(255,255,255,0.03)":"transparent",
                      borderLeft:active?`2px solid ${c.acL}`:"2px solid transparent"}}>
                    <span style={{fontSize:10,fontFamily:F,color:active?c.acL:c.ts,fontWeight:active?700:500,flex:1}}>{opt}</span>
                  </div>
                );
              })}
              {cfg.type==="template" && cfg.opts.map((tpl,idx)=>{
                if (tpl.divider) return (
                  <div key={tpl.divider+idx} style={{padding:"5px 12px 3px",fontSize:7,fontWeight:800,color:c.tm,letterSpacing:"0.07em",borderTop:idx>0?`1px solid ${c.br}`:"none"}}>{tpl.divider}</div>
                );
                const active = settings[cfg.key]===tpl.n;
                const isCustom = !!tpl.settings;
                return (
                  <div key={tpl.n} onClick={()=>{isCustom?applyTemplate(tpl.n,tpl.settings):applyTemplate(tpl.n);setSettDrop(null);}}
                    onMouseEnter={()=>setSwHov("tpl-"+tpl.n)} onMouseLeave={()=>setSwHov(null)}
                    style={{display:"flex",alignItems:"center",padding:"6px 12px",cursor:"pointer",gap:6,
                      background:active?c.acD:swHov==="tpl-"+tpl.n?"rgba(255,255,255,0.03)":"transparent",
                      borderLeft:active?`2px solid ${c.acL}`:"2px solid transparent"}}>
                    <span style={{fontSize:10,fontFamily:F,color:active?c.acL:c.ts,fontWeight:active?700:500,flex:1}}>{tpl.n}</span>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      {tpl.cols.map((col,i)=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:col,boxShadow:`0 0 4px ${col}88`}}/>)}
                    </div>
                  </div>
                );
              })}
              {cfg.type==="style" && styleOpts.map(({val,dash})=>{
                const active = settings[cfg.key]===val;
                return (
                  <div key={val} onClick={()=>{updateSetting(cfg.key,val);setSettDrop(null);}}
                    onMouseEnter={()=>setSwHov("sdrop-"+val)} onMouseLeave={()=>setSwHov(null)}
                    style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"7px 14px",cursor:"pointer",
                      background:active?c.acD:swHov==="sdrop-"+val?"rgba(255,255,255,0.03)":"transparent",
                      borderLeft:active?`2px solid ${c.acL}`:"2px solid transparent"}}>
                    <svg width={64} height={12}>
                      <line x1={2} y1={6} x2={62} y2={6} stroke={active?c.acL:c.ts} strokeWidth={1.5} strokeDasharray={dash}/>
                    </svg>
                  </div>
                );
              })}
              {cfg.type==="thick" && thickOpts.map(t=>{
                const active = settings[cfg.key]===t;
                const svgH = Math.max(t*2.5+6,10);
                return (
                  <div key={t} onClick={()=>{updateSetting(cfg.key,t);setSettDrop(null);}}
                    onMouseEnter={()=>setSwHov("stdrop-"+t)} onMouseLeave={()=>setSwHov(null)}
                    style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"4px 14px",cursor:"pointer",
                      background:active?c.acD:swHov==="stdrop-"+t?"rgba(255,255,255,0.03)":"transparent",
                      borderLeft:active?`2px solid ${c.acL}`:"2px solid transparent"}}>
                    <svg width={64} height={svgH}>
                      <line x1={2} y1={svgH/2} x2={62} y2={svgH/2} stroke={active?c.acL:c.ts} strokeWidth={t*1.6} strokeLinecap="round"/>
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        </>;
      })()}
      {cpDragging && (
        <div
          onMouseMove={(e)=>{
            if(!cpDragRect) return;
            if(cpDragging==='sv'){
              const ns=Math.max(0,Math.min(1,(e.clientX-cpDragRect.left)/cpDragRect.width));
              const nv=1-Math.max(0,Math.min(1,(e.clientY-cpDragRect.top)/cpDragRect.height));
              setCpS(ns); setCpV(nv); cpApply(cpH,ns,nv,cpA);
            } else if(cpDragging==='hue'){
              const nh=Math.max(0,Math.min(360,((e.clientX-cpDragRect.left)/cpDragRect.width)*360));
              setCpH(nh); cpApply(nh,cpS,cpV,cpA);
            } else if(cpDragging==='alpha'){
              const na=Math.max(0,Math.min(1,(e.clientX-cpDragRect.left)/cpDragRect.width));
              setCpA(na); cpApply(cpH,cpS,cpV,na);
            }
          }}
          onMouseUp={()=>setCpDragging(null)}
          style={{position:"fixed",inset:0,zIndex:9300,cursor:cpDragging==='sv'?'crosshair':'ew-resize'}}
        />
      )}
      {colorPicker && <>
        <ColorPickerPopup
          pos={cpPos} h={cpH} s={cpS} v={cpV} a={cpA} hexStr={cpHex} c={c} F={F}
          onSVChange={(ns,nv)=>{ setCpS(ns); setCpV(nv); cpApply(cpH,ns,nv,cpA); }}
          onHChange={(nh)=>{ setCpH(nh); cpApply(nh,cpS,cpV,cpA); }}
          onAChange={(na)=>{ setCpA(na); cpApply(cpH,cpS,cpV,na); }}
          onHexChange={(hex)=>{ setCpHex(hex); if(hex.length===6){const p=parseColor('#'+hex);const hsv=rgbToHsv(p.r,p.g,p.b);setCpH(hsv.h);setCpS(hsv.s);setCpV(hsv.v);updateSetting(colorPicker,cpBuildColor(p.r,p.g,p.b,cpA));}}}
          onClose={()=>setColorPicker(null)}
          onDragStart={(type,rect)=>{ setCpDragging(type); setCpDragRect(rect); }}
        />
      </>}
      {dragging && (
        <div
          onMouseMove={(e) => {
            const dx = e.clientX - dragging.startX;
            const dy = e.clientY - dragging.startY;
            if (dragging.target === "settings") setSettingsPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "ind") setIndPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "profile") setProfilePos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "faq") setFaqPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "news") setNewsPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "screenshot") setScreenshotPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "layers") setLayersPos({ x: dragging.ox + dx, y: dragging.oy + dy });
            else if (dragging.target === "layout") setLayoutPos({ x: dragging.ox + dx, y: dragging.oy + dy });
          }}
          onMouseUp={() => setDragging(null)}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998, cursor: "move" }}
        />
      )}
    </div>
  );
};

export default TalariaV8b;
