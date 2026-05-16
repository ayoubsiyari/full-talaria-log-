"use client";
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { flushSync, createPortal } from "react-dom";
import { ReactFlow, ReactFlowProvider, useReactFlow, useStore, Handle, Position, Background, BackgroundVariant, MiniMap, getBezierPath, BaseEdge, EdgeLabelRenderer, MarkerType, addEdge, applyNodeChanges, applyEdgeChanges, PanOnScrollMode } from 'reactflow';
import 'reactflow/dist/style.css';

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
const ColorPickerPopup = ({ pos, h, s, v, a, hexStr, c, F, onSVChange, onHChange, onAChange, onHexChange, onClose, onDragStart, dragging, animation, hideAlpha }) => {
  const rgb = hsvToRgb(h, s, v);
  const solidColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  const hueColor = `hsl(${h},100%,50%)`;
  const outColor = cpBuildColor(rgb.r, rgb.g, rgb.b, a);
  return (
    <div className="tlr-cp tlr-gloss" data-sdrop="1" onClick={e=>e.stopPropagation()} style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9200,width:210,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:`0 20px 56px rgba(0,0,0,0.92), 0 0 20px rgba(38,67,247,0.1)`,fontFamily:F,animation:animation||"tlrPopIn 0.15s ease"}}>
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
          <div style={{fontSize:9,color:c.tm,marginBottom:3,letterSpacing:"0.07em",fontWeight:700}}>HUE</div>
          <div
            onMouseDown={(e)=>{ const r=e.currentTarget.getBoundingClientRect(); onHChange(Math.max(0,Math.min(360,((e.clientX-r.left)/r.width)*360))); onDragStart('hue',r); }}
            style={{position:"relative",height:11,background:"linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",border:`1px solid ${c.brH}`,cursor:"ew-resize",userSelect:"none"}}>
            <div style={{position:"absolute",top:-1,bottom:-1,left:`calc(${(h/360)*100}% - 5px)`,width:10,background:hueColor,border:"2px solid #fff",boxShadow:"0 0 4px rgba(0,0,0,0.8)",pointerEvents:"none"}}/>
          </div>
        </div>
        {/* Alpha slider */}
        {!hideAlpha && <div style={{marginBottom:9}}>
          <div style={{fontSize:9,color:c.tm,marginBottom:3,letterSpacing:"0.07em",fontWeight:700}}>OPACITY</div>
          <div
            onMouseDown={(e)=>{ const r=e.currentTarget.getBoundingClientRect(); onAChange(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))); onDragStart('alpha',r); }}
            style={{position:"relative",height:11,background:`linear-gradient(to right, rgba(${rgb.r},${rgb.g},${rgb.b},0), ${solidColor}), repeating-conic-gradient(rgba(140,160,255,0.08) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px`,border:`1px solid ${c.brH}`,cursor:"ew-resize",userSelect:"none"}}>
            <div style={{position:"absolute",top:-1,bottom:-1,left:`calc(${a*100}% - 5px)`,width:10,background:solidColor,border:"2px solid #fff",boxShadow:"0 0 4px rgba(0,0,0,0.8)",pointerEvents:"none"}}/>
          </div>
        </div>}
        {/* Preview + hex + alpha% */}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{width:22,height:22,background:outColor,border:`1px solid ${c.brH}`,flexShrink:0}}/>
          <div style={{flex:1,display:"flex",alignItems:"center",background:c.well,border:`1px solid ${c.br}`,padding:"3px 6px"}}>
            <span style={{fontSize:10,color:c.tm,marginRight:2,fontFamily:F}}>#</span>
            <input value={hexStr} onChange={e=>onHexChange(e.target.value.replace(/[^0-9a-fA-F]/g,'').slice(0,6))}
              style={{background:"transparent",border:"none",color:c.tx,fontSize:11,fontFamily:F,width:"100%",outline:"none",fontVariantNumeric:"tabular-nums"}}/>
          </div>
          {!hideAlpha && <span style={{fontSize:11,color:c.ts,minWidth:30,textAlign:"right",fontFamily:F,fontVariantNumeric:"tabular-nums",fontWeight:600}}>{Math.round(a*100)}%</span>}
        </div>
      </div>
      <div style={{padding:"5px 10px",borderTop:`1px solid ${c.br}`,display:"flex",justifyContent:"flex-end"}}>
        <div onClick={onClose} style={{fontSize:10,color:c.acL,cursor:"default",fontWeight:800,fontFamily:F,padding:"2px 6px",letterSpacing:"0.05em"}}>DONE</div>
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
      style={{ width: 28, height: 14, borderRadius: 7, background: on ? `${tC}33` : isH ? "rgba(140,160,255,0.10)" : "rgba(140,160,255,0.06)", border: `1px solid ${on ? tC+"66" : isH ? "rgba(140,160,255,0.35)" : "rgba(140,160,255,0.22)"}`, position: "relative", cursor: "default", transition: "background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease", boxShadow: isH ? `0 0 8px ${on ? tC+"55" : "rgba(140,160,255,0.08)"}` : "none" }}>
      <div style={{ width: 10, height: 10, borderRadius: 5, background: on ? tC : isH ? c.tx : "rgba(140,160,255,0.55)", position: "absolute", top: 1, left: on ? 14 : 2, transition: "left 0.22s cubic-bezier(0.34,1.56,0.64,1), background 0.18s ease", boxShadow: on && isH ? `0 0 6px ${tC}` : "none" }}/>
    </div>
  );
};

const currencyCountry = { EUR: "EU", JPY: "JP", USD: "US", GBP: "GB", AUD: "AU", CAD: "CA", CHF: "CH", NZD: "NZ", SEK: "SE", NOK: "NO", DKK: "DK", SGD: "SG", HKD: "HK", MXN: "MX", ZAR: "ZA", TRY: "TR", PLN: "PL", CZK: "CZ", HUF: "HU" };

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
    SE: <svg {...sw}><rect width={22} height={14} fill="#006AA7"/><rect x={6} y={0} width={3} height={14} fill="#FECC02"/><rect x={0} y={5.5} width={22} height={3} fill="#FECC02"/></svg>,
    NO: <svg {...sw}><rect width={22} height={14} fill="#EF2B2D"/><rect x={5.5} y={0} width={4} height={14} fill="#fff"/><rect x={0} y={5} width={22} height={4} fill="#fff"/><rect x={7} y={0} width={1.5} height={14} fill="#003680"/><rect x={0} y={6.25} width={22} height={1.5} fill="#003680"/></svg>,
    DK: <svg {...sw}><rect width={22} height={14} fill="#C60C30"/><rect x={6} y={0} width={3} height={14} fill="#fff"/><rect x={0} y={5.5} width={22} height={3} fill="#fff"/></svg>,
    SG: <svg {...sw}><rect width={22} height={14} fill="#EF3340"/><rect y={7} width={22} height={7} fill="#fff"/><circle cx={5.5} cy={7} r={2.5} fill="#fff"/><circle cx={7} cy={7} r={2.5} fill="#EF3340"/>{Array.from({length:5},(_,i)=>{const a=(i/5)*Math.PI*2-Math.PI/2;return<circle key={i} cx={10+1.6*Math.cos(a)} cy={4+1.6*Math.sin(a)} r={0.5} fill="#fff"/>;})}      </svg>,
    HK: <svg {...sw}><rect width={22} height={14} fill="#DE2910"/>{Array.from({length:5},(_,i)=>{const a=(i/5)*Math.PI*2-Math.PI/2;return<g key={i} transform={`rotate(${i*72} 11 7)`}><path d="M11,3 C9,4 8,5.5 9,7" stroke="#fff" strokeWidth={0.7} fill="none"/><circle cx={8.8} cy={7.2} r={0.4} fill="#fff"/></g>;})}      </svg>,
    MX: <svg {...sw}><rect width={22} height={14} fill="#006847"/><rect x={7.33} width={7.34} height={14} fill="#fff"/><rect x={14.67} width={7.33} height={14} fill="#CE1126"/><circle cx={11} cy={7} r={1.8} fill="#5C4033" opacity={0.7}/></svg>,
    ZA: <svg {...sw}><rect width={22} height={14} fill="#007A4D"/><rect y={5} width={22} height={4} fill="#fff"/><rect y={5.5} width={22} height={3} fill="#FFB81C"/><rect y={0} width={22} height={5} fill="#007A4D"/><rect y={9} width={22} height={5} fill="#002395"/><polygon points="0,0 0,14 8,7" fill="#000"/><polygon points="0.8,0 0.8,13.2 7,7" fill="#FFB81C"/></svg>,
    TR: <svg {...sw}><rect width={22} height={14} fill="#E30A17"/><circle cx={8.5} cy={7} r={3} fill="#fff"/><circle cx={10} cy={7} r={2.4} fill="#E30A17"/>{Array.from({length:5},(_,i)=>{const a=(i/5)*Math.PI*2-Math.PI/2+0.3;return<polygon key={i} points={`${13.5+2*Math.cos(a)},${7+2*Math.sin(a)} ${13.5+0.8*Math.cos(a+Math.PI/5)},${7+0.8*Math.sin(a+Math.PI/5)} ${13.5+0.8*Math.cos(a-Math.PI/5)},${7+0.8*Math.sin(a-Math.PI/5)}`} fill="#fff"/>;})}      </svg>,
    PL: <svg {...sw}><rect width={22} height={14} fill="#fff"/><rect y={7} width={22} height={7} fill="#DC143C"/></svg>,
    CZ: <svg {...sw}><rect width={22} height={14} fill="#D7141A"/><rect width={22} height={7} fill="#fff"/><polygon points="0,0 0,14 9,7" fill="#11457E"/></svg>,
    HU: <svg {...sw}><rect width={22} height={14} fill="#CE2939"/><rect y={4.67} width={22} height={4.66} fill="#fff"/><rect y={9.33} width={22} height={4.67} fill="#477050"/></svg>,
  };
  return f[cc] || <svg {...sw}><rect width={22} height={14} fill="#1a2030"/><text x={11} y={10} textAnchor="middle" fontSize={6} fontWeight="bold" fill="#8CA0FF" fontFamily="sans-serif">{cc}</text></svg>;
};

const EMOJI_CATS = [
  { id:"smileys",  icon:"😀", label:"Smileys",  emojis:["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🥴","😌","😔","😪","😴","😷","🤒","🤕","🤢","🤧","🥵","🥶","😵","🤯","🤠","🥳","😎","🤓","🧐","😢","😭","😤","😠","😡","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾"] },
  { id:"people",   icon:"👶", label:"People",   emojis:["👋","🤚","🖐","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦵","🦶","👂","🦻","👃","👀","👁","👅","🫀","🧠","🦷","🦴","👶","🧒","👦","👧","🧑","👱","👩","🧔","👴","👵","👲","👳","🧕","💂","👮","👷","🤴","👸","🧙","🧚","🧛","🧟","🧞","🧜","🧝"] },
  { id:"animals",  icon:"🐶", label:"Animals",  emojis:["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🐢","🐍","🦎","🐙","🦑","🦀","🐠","🐟","🐬","🐳","🦈","🐊","🦒","🦓","🦏","🐘","🦛","🦘","🐆","🐅","🐃","🐂","🐄","🦌","🐑","🐐","🦙","🐕","🐈","🐓","🦃","🦤","🦚","🦜","🦩","🦢","🕊","🐇","🦝","🦨","🦡","🦦","🦥","🐁","🐀","🐿","🦔","🐾","🐉","🌵","🎄","🌲","🌳","🌴","🌱","🌿","☘️","🍀","🎍","🎋","🍃","🍂","🍁","🍄","🌾","💐","🌷","🌹","🥀","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","🌙","🌟","⭐","🌠","☁️","⛅","🌤","⛈","🌩","🌨","❄️","☃️","⛄","🌬","💨","🌪","🌫","🌊","🌈","☔","⚡","🌍","🌎","🌏","🗺"] },
  { id:"food",     icon:"🍎", label:"Food",     emojis:["🍎","🍊","🍋","🍇","🍓","🍒","🍑","🥭","🍍","🥝","🍅","🫐","🥑","🍆","🌽","🥕","🥔","🥦","🥒","🌶","🧄","🍔","🍟","🍕","🌭","🌮","🌯","🥙","🥚","🍳","🥞","🧇","🥓","🍜","🍝","🍛","🍣","🍤","🍦","🍰","🎂","🍭","🍬","🍫","🍩","🍪","☕","🍵","🧃","🧋","🍺","🍻","🥂","🍷","🥤","🍼","🫖","🍶","🥃","🍸","🍹","🍾","🥄","🍴","🍽","🥢","🧂"] },
  { id:"activity", icon:"⚽", label:"Activity", emojis:["⚽","🏀","🏈","⚾","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🥊","🥋","🎯","🥅","⛳","🏹","🎣","🤿","🛹","🛷","⛸","🎿","🏋️","🤼","🤸","🤺","🏇","⛷","🏂","🪂","🏌️","🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖","🎗","🎫","🎟","🎪","🤹","🎭","🩺","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🪕","🎻","🎮","🕹","🎲","♟","🎯","🎳","🪀","🪁","🎰","🧩"] },
  { id:"travel",   icon:"✈️", label:"Travel",   emojis:["🚗","🚕","🚙","🚌","🏎","🚓","🚑","🚒","🚚","🚛","🚜","🛻","🏍","🚲","🛴","🛺","🚁","🛸","🚀","✈️","🛩","🛳","🚢","⛵","🚤","🛥","🚂","🚆","🚇","🚊","🚞","🚋","🚝","🏔","🌋","🗻","🏕","🏖","🏜","🏝","🏞","🌅","🌆","🌇","🌃","🌉","🏙","🌌","🌠","🗽","🗼","🏰","🏯","🗾","🎌","⛩","🛕","🕌","🕍","⛪","🌁","⛲","🎠","🎡","🎢","🎪","🏟","🛣","🛤","⛽","🚧","🚦","🚥","♨️","🌐","🗺","🧭"] },
  { id:"objects",  icon:"💡", label:"Objects",  emojis:["💡","🔦","🕯","📱","💻","⌨️","🖥","🖨","🖱","💾","💿","📀","📷","📸","📹","🎥","📞","☎️","📺","📻","🎙","⏱","⏰","⌚","📡","🔋","🔌","💰","💳","💎","🔑","🗝","🔒","🔓","🔨","🔧","🔩","⚙️","⚒","🛠","🗡","⚔️","🛡","🪚","🔗","📎","🖇","📏","📐","✂️","🗃","📦","📫","📬","📭","📮","🗑","🚽","🛁","🧴","🧹","🧺","🧻","🪣","🧼","🪥","🪒","🛒","🚪","🪟","🛏","🛋","🪑","🚿","🪞","🧲","🪜","🧯","🛒","💈","⚗️","🔭","🔬","🩺","🩻","💊","🩹","🩼","🩺","🩻","🧪","🧫","🧬","🏺","🧿","💎"] },
  { id:"symbols",  icon:"❤️", label:"Symbols",  emojis:["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉","✡️","🔯","🕎","☯️","🛐","⛔","🚫","💯","✅","❌","❎","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","💠","🔶","🔷","🔸","🔹","▪️","▫️","◾","◽","⬛","⬜","🔱","⚜️","🏵","🔰","♻️","✔️","☑️","🔘","🔲","🔳","⬜","⬛","🏁","🚩","🎌","🏴","🏳","🏴‍☠️","💢","💥","💫","💦","💨","🕳","💬","💭","💤","♠️","♥️","♦️","♣️","🃏","🎴","🀄"] },
];

// ── Canvas Strategy Builder ─────────────────────────────────────────────────

// Module-level callback ref so section node buttons can trigger state changes
const _cvCb = { addCondition: null, deleteSection: null, insertSection: null, renameSection: null, resizeSection: null, updateDesc: null, setDescPanelOpen: null, startDrag: null, deleteCondition: null, updateCondition: null, requestFitView: null };
const requestCanvasFitView = () => { _cvCb.requestFitView?.(); };

/* ── Node: Section Lane ── */
const GOLD = 'rgba(201,168,76,0.9)';
const GOLD_BD = 'rgba(201,168,76,0.25)';
const GOLD_BG = 'rgba(201,168,76,0.015)';
const GOLD_SIDE = 'rgba(201,168,76,0.05)';

const SectionNode = ({ id, data }) => {
  const [hA, setHA] = React.useState(false);
  const [hD, setHD] = React.useState(false);
  const [hE, setHE] = React.useState(false);
  const [hGrip, setHGrip] = React.useState(false);
  const [hLabel, setHLabel] = React.useState(false);
  const [hDesc, setHDesc] = React.useState(false);
  const [hClose, setHClose] = React.useState(false);
  const [hDescEdit, setHDescEdit] = React.useState(false);
  const [descEditing, setDescEditing] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [taH, setTaH] = React.useState('auto');
  const [descOpen, setDescOpen] = React.useState(false);
  const [descDraft, setDescDraft] = React.useState(data.description || '');
  const [screenshots, setScreenshots] = React.useState(() => {
    const imgs = Array.isArray(data.images) ? data.images : [];
    return Array.from({ length: 4 }, (_, i) => imgs[i] || null);
  });
  const [activeSlot, setActiveSlot] = React.useState(null);
  const [hSlot, setHSlot] = React.useState(null);
  const [pressSlot, setPressSlot] = React.useState(null);
  const [hOpenBtn, setHOpenBtn] = React.useState(null);
  const [hDelBtn, setHDelBtn] = React.useState(null);
  const [pressBtn, setPressBtn] = React.useState(null);
  const [lightbox, setLightbox] = React.useState(null);
  const [lbZoom, setLbZoom] = React.useState(1);
  const [lbHClose, setLbHClose] = React.useState(false);
  const [lbHZoomIn, setLbHZoomIn] = React.useState(false);
  const [lbHZoomOut, setLbHZoomOut] = React.useState(false);
  const [lbHReplace, setLbHReplace] = React.useState(false);
  const [lbHDelete, setLbHDelete] = React.useState(false);
  const [lbPReplace, setLbPReplace] = React.useState(false);
  const [lbPDelete, setLbPDelete] = React.useState(false);
  const [lbImgHover, setLbImgHover] = React.useState(false);
  const [lbPan, setLbPan] = React.useState({x:0, y:0});
  const [lbPanning, setLbPanning] = React.useState(false);
  const [hSlotIdx, setHSlotIdx] = React.useState(null);
  const [hConnIdx, setHConnIdx] = React.useState(null);
  const [pConnIdx, setPConnIdx] = React.useState(null);
  const inputRef = React.useRef(null);
  const descRef = React.useRef(null);
  const descPanelRef = React.useRef(null);
  const descBtnRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const lbImgAreaRef = React.useRef(null);
  const lbPanStartRef = React.useRef(null);
  const cancelRef = React.useRef(false);
  const origHRef = React.useRef(null);

  const { setNodes } = useReactFlow();

  const naturalH = () => getSectionHeight(data.condCount || 0);

  // Lift section above all others while description panel is open. Section's own background
  // is made transparent below so its conditions stay visible AND the opaque description panel
  // paints on top of them.
  React.useEffect(() => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, zIndex: descOpen ? 1000 : -1 } : n));
    _cvCb.setDescPanelOpen && _cvCb.setDescPanelOpen(descOpen);
  }, [descOpen]);

  // Sync description draft when data.description changes while panel is closed
  React.useEffect(() => {
    if (!descOpen) setDescDraft(data.description || '');
  }, [data.description]);
  React.useEffect(() => {
    const imgs = Array.isArray(data.images) ? data.images : [];
    setScreenshots(Array.from({ length: 4 }, (_, i) => imgs[i] || null));
  }, [data.images]);

  // Focus textarea when edit mode activates; reset edit mode when panel closes
  React.useEffect(() => {
    if (!descOpen) setDescEditing(false);
  }, [descOpen]);
  React.useEffect(() => {
    if (descEditing && descRef.current) descRef.current.focus();
  }, [descEditing]);

  // Close panel on click outside (skip while lightbox is open)
  React.useEffect(() => {
    if (!descOpen) return;
    if (lightbox !== null) return;
    const handler = (e) => {
      if (descBtnRef.current && descBtnRef.current.contains(e.target)) return;
      if (descPanelRef.current && !descPanelRef.current.contains(e.target)) {
        setDescOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [descOpen, lightbox]);

  const openLightbox = (idx) => { setLightbox(idx); setLbZoom(1); setLbPan({x:0,y:0}); };

  React.useEffect(() => {
    if (lightbox === null) return;
    const el = lbImgAreaRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      setLbZoom(z => {
        const dz = e.deltaY < 0 ? 0.12 : -0.12;
        const nz = Math.max(0.5, Math.min(3, parseFloat((z + dz).toFixed(2))));
        if (nz <= 1) setLbPan({x:0,y:0});
        return nz;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [lightbox]);

  React.useEffect(() => {
    if (!descOpen) return;
    const el = descRef.current;
    if (!el) return;
    const stop = (e) => e.stopPropagation();
    el.addEventListener('wheel', stop, { passive: true });
    return () => el.removeEventListener('wheel', stop);
  }, [descOpen]);

  const handleScreenshotClick = (idx) => { setActiveSlot(idx); if(fileInputRef.current) fileInputRef.current.click(); };
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if(!file || activeSlot===null) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = {src:ev.target.result, name:file.name};
      setScreenshots(prev=>{
        const n=[...prev];
        n[activeSlot]=img;
        setNodes(nds => nds.map(node => node.id === id ? { ...node, data: { ...node.data, images:n } } : node));
        return n;
      });
      requestCanvasFitView();
    };
    reader.readAsDataURL(file);
    e.target.value='';
  };

  const cycleConnector = (idx) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== id) return n;
      const conns = [...((n.data.connectors && n.data.connectors.length === COND_COLS - 1) ? n.data.connectors : Array(COND_COLS - 1).fill('AND'))];
      const curIdx = CONNECTOR_OPTIONS.indexOf(conns[idx] || 'AND');
      conns[idx] = CONNECTOR_OPTIONS[(curIdx + 1) % CONNECTOR_OPTIONS.length];
      return { ...n, data: { ...n.data, connectors: conns } };
    }));
  };

  const startEdit = (e) => {
    e.stopPropagation();
    origHRef.current = naturalH();
    setDraft(data.label || 'Group');
    setTaH('auto');
    setEditing(true);
    requestCanvasFitView();
  };

  React.useLayoutEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.style.height = '1px';
      const sh = el.scrollHeight;
      el.style.height = sh + 'px';
      setTaH(sh + 'px');
    }
  }, [editing]);
  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleChange = (e) => {
    const val = e.target.value.slice(0, 72);
    if (val !== e.target.value) { e.target.value = val; }
    setDraft(val);
    const el = e.target;
    el.style.height = '1px';
    const sh = el.scrollHeight;
    el.style.height = sh + 'px';
    setTaH(sh + 'px');
    const newH = Math.max(naturalH(), sh + 130);
    _cvCb.resizeSection && _cvCb.resizeSection(data.sectionId, newH);
  };

  const commitEdit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      if (origHRef.current !== null) {
        _cvCb.resizeSection && _cvCb.resizeSection(data.sectionId, origHRef.current);
      }
      setEditing(false);
      return;
    }
    const el = inputRef.current;
    if (el) el.style.height = '1px';
    const sh = el ? el.scrollHeight : 0;
    const finalLabel = draft.trim() || (data.label || 'Group');
    const finalH = Math.max(naturalH(), sh + 130);
    _cvCb.renameSection && _cvCb.renameSection(data.sectionId, finalLabel, finalH);
    setEditing(false);
    requestCanvasFitView();
  };

  const handleDescChange = (e) => {
    const val = e.target.value;
    setDescDraft(val);
    _cvCb.updateDesc && _cvCb.updateDesc(data.sectionId, val);
  };

  const hasDesc = !!(data.description && data.description.trim());

  const GOLD = '#C9A84C';

  return (
    <div className={`${data.deleting?' tlc-sec-deleting':''}${data.dragging?' tlc-sec-dragging':''}`} style={{fontFamily:"'Exo 2',sans-serif",width:'100%',height:'100%',border:'none',boxShadow:'inset 0 0 0 1px var(--tlc-brh)',background:descOpen?'transparent':'var(--tlc-sf)',display:'flex',overflow:'visible',position:'relative'}}>

      {/* Left gold accent bar */}
      <div style={{position:'absolute',top:0,left:0,bottom:0,width:4,background:GOLD,zIndex:2,pointerEvents:'none'}}/>

      {/* Description panel — slides down below button bar */}
      <div
        ref={descPanelRef}
        onClick={e=>e.stopPropagation()}
        style={{
          position:'absolute',left:4,top:54,width:440,
          background:'var(--tlc-sf)',
          display:'flex',flexDirection:'column',
          zIndex:20,
          border:'1px solid var(--tlc-brh)',
          borderTop:'none',
          boxShadow:'4px 12px 32px rgba(0,0,0,0.55)',
          fontFamily:"'Exo 2',sans-serif",
          opacity:descOpen?1:0,
          transform:descOpen?'translateY(0)':'translateY(-10px)',
          pointerEvents:descOpen?'auto':'none',
          transition:'opacity 0.18s ease, transform 0.18s ease',
        }}
      >
        {/* Gold top line */}
        <div style={{height:2,background:GOLD,flexShrink:0}}/>

        {/* Header */}
        <div style={{
          display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'0 14px 0 16px',height:54,flexShrink:0,
          borderBottom:'1px solid var(--tlc-brh)',
        }}>
          <span style={{fontSize:18,fontWeight:700,color:'var(--tlc-tx)',letterSpacing:0.5,textTransform:'uppercase',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginRight:8}}>{data.label||'Group'}</span>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            {/* Edit / confirm button */}
            <div
              onClick={e=>{e.stopPropagation();setDescEditing(o=>{ if(!o) requestCanvasFitView(); return !o; });}}
              onMouseEnter={()=>setHDescEdit(true)}
              onMouseLeave={()=>setHDescEdit(false)}
              style={{
                display:'flex',alignItems:'center',justifyContent:'center',
                padding:10,borderRadius:7,cursor:'default',
                background:descEditing?'rgba(201,168,76,0.15)':hDescEdit?'rgba(255,255,255,0.08)':'transparent',
                transition:'background 0.15s',
              }}
            >
              {descEditing ? (
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                  <polyline points="4 13 9 18 20 7" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                  <path d="M4 20h4l10.5-10.5a2.828 2.828 0 0 0-4-4L4 16v4z" stroke={hDescEdit?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2" strokeLinejoin="round" style={{transition:'stroke 0.15s'}}/>
                  <path d="M14.5 5.5l4 4" stroke={hDescEdit?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
                </svg>
              )}
            </div>
            {/* Close button */}
            <div
              onClick={()=>setDescOpen(false)}
              onMouseEnter={()=>setHClose(true)}
              onMouseLeave={()=>setHClose(false)}
              style={{
                display:'flex',alignItems:'center',justifyContent:'center',
                padding:10,borderRadius:7,cursor:'default',
                background:hClose?'rgba(255,80,104,0.14)':'transparent',
                transition:'background 0.15s',
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                <line x1="5" y1="5" x2="19" y2="19" stroke={hClose?'var(--tlc-rd)':'var(--tlc-tm)'} strokeWidth="2.5" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
                <line x1="19" y1="5" x2="5" y2="19" stroke={hClose?'var(--tlc-rd)':'var(--tlc-tm)'} strokeWidth="2.5" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
              </svg>
            </div>
          </div>
        </div>

        {/* Notes textarea */}
        <textarea
          ref={descRef}
          value={descDraft}
          readOnly={!descEditing}
          onChange={handleDescChange}
          onKeyDown={e=>{if(e.key==='Escape'){if(descEditing)setDescEditing(false);else setDescOpen(false);}e.stopPropagation();}}
          placeholder="Click the edit button to add notes…"
          className="tlr-scroll"
          style={{
            flexShrink:0, height:190, background:'transparent', border:'none', outline:'none',
            color:descEditing?'var(--tlc-ts)':'var(--tlc-tm)', fontSize:21, fontFamily:"'Exo 2',sans-serif",
            lineHeight:1.7, padding:'14px 18px', resize:'none',
            caretColor:GOLD, overflowY:'auto', cursor:descEditing?'text':'default',
          }}
        />
        {/* Divider + screenshots */}
        <div style={{height:1, background:'var(--tlc-brh)', flexShrink:0}}/>
        <div style={{padding:'10px 16px 6px', fontSize:14, fontWeight:700, color:'var(--tlc-tm)', letterSpacing:0.8, textTransform:'uppercase', flexShrink:0}}>Screenshots</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:'0 14px 14px', flexShrink:0}}>
          {screenshots.map((shot, i) => { const src = shot?.src; return (
            <div key={i} data-nodrag="1"
              onClick={e=>{e.stopPropagation(); handleScreenshotClick(i);}}
              onMouseEnter={()=>setHSlot(i)} onMouseLeave={()=>{setHSlot(null);setPressSlot(null);}}
              onMouseDown={()=>setPressSlot(i)} onMouseUp={()=>setPressSlot(null)}
              style={{height:78, position:'relative', overflow:'hidden', cursor:'default',
                background: pressSlot===i ? 'rgba(255,255,255,0.12)' : hSlot===i ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
                border: hSlot===i ? '1px solid rgba(255,255,255,0.30)' : '1px solid var(--tlc-brh)',
                display:'flex', alignItems:'center', justifyContent:'center',
                transform: pressSlot===i ? 'scale(0.97)' : 'scale(1)',
                transition:'background 0.12s, border-color 0.12s, transform 0.08s'}}>
              {src ? (
                <img src={src} style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} alt=""/>
              ) : (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:5, opacity:0.38, pointerEvents:'none'}}>
                  <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="1" stroke="var(--tlc-tm)" strokeWidth="1.5"/>
                    <circle cx="8.5" cy="8.5" r="1.5" fill="var(--tlc-tm)"/>
                    <polyline points="3 16 8 11 13 16" stroke="var(--tlc-tm)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="13 16 16 13 21 18" stroke="var(--tlc-tm)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{fontSize:14, color:'var(--tlc-tm)', fontFamily:'inherit'}}>Add screenshot</span>
                </div>
              )}
              {src && hSlot===i && (
                <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.52)', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
                  <div data-nodrag="1"
                    onClick={e=>{e.stopPropagation(); openLightbox(i);}}
                    onMouseEnter={()=>setHOpenBtn(i)} onMouseLeave={()=>setHOpenBtn(null)}
                    onMouseDown={()=>setPressBtn({i,t:'open'})} onMouseUp={()=>setPressBtn(null)}
                    style={{display:'flex', alignItems:'center', justifyContent:'center', width:38, height:38, borderRadius:4, cursor:'default',
                      background: pressBtn?.i===i&&pressBtn?.t==='open' ? 'rgba(201,168,76,0.55)' : hOpenBtn===i ? 'rgba(201,168,76,0.28)' : 'transparent',
                      transition:'background 0.1s, transform 0.08s',
                      transform: pressBtn?.i===i&&pressBtn?.t==='open' ? 'scale(0.90)' : 'scale(1)', opacity:1}}>
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#C9A84C" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="12" r="3" stroke="#C9A84C" strokeWidth="2.8"/>
                    </svg>
                  </div>
                  <div data-nodrag="1"
                    onClick={e=>{e.stopPropagation(); setScreenshots(p=>{const n=[...p];n[i]=null;setNodes(nds => nds.map(node => node.id === id ? { ...node, data: { ...node.data, images:n } } : node));return n;});}}
                    onMouseEnter={()=>setHDelBtn(i)} onMouseLeave={()=>setHDelBtn(null)}
                    onMouseDown={()=>setPressBtn({i,t:'del'})} onMouseUp={()=>setPressBtn(null)}
                    style={{display:'flex', alignItems:'center', justifyContent:'center', width:38, height:38, borderRadius:4, cursor:'default',
                      background: pressBtn?.i===i&&pressBtn?.t==='del' ? 'rgba(255,80,104,0.55)' : hDelBtn===i ? 'rgba(255,80,104,0.28)' : 'transparent',
                      transition:'background 0.1s, transform 0.08s',
                      transform: pressBtn?.i===i&&pressBtn?.t==='del' ? 'scale(0.90)' : 'scale(1)', opacity:1}}>
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 6l-1 14H6L5 6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 11v6M14 11v6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round"/>
                      <path d="M9 6V4h6v2" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          );})}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleFileChange}/>
      </div>

      {/* Title strip */}
      <div
        className="tlc-strip"
        style={{width:STRIP_W,flexShrink:0,background:'var(--tlc-el)',borderRight:'1px solid var(--tlc-brh)',display:'flex',flexDirection:'column',overflow:'hidden',paddingLeft:4}}
      >
        {/* Button bar */}
        <div style={{height:54,flexShrink:0,position:'relative',borderBottom:'1px solid var(--tlc-brh)'}}>
          {/* Drag handle */}
          <div
            role="button"
            aria-label="Drag to reorder group"
            onPointerDown={e=>{
              if(e.button!==0)return;
              e.stopPropagation();
              e.preventDefault();
              _cvCb.startDrag&&_cvCb.startDrag(data.sectionId,e.clientX,e.clientY,e.pointerId);
            }}
            className="tlc-drag-grip nodrag nopan"
            style={{
              position:'absolute',top:'50%',transform:'translateY(-50%)',left:9,zIndex:5,
              display:'flex',alignItems:'center',justifyContent:'center',
              padding:5,lineHeight:1,userSelect:'none',cursor:'grab',touchAction:'none',
              pointerEvents:'auto',transition:'transform 0.15s ease, opacity 0.15s ease',
            }}
          >
            <svg width={21} height={21} viewBox="0 0 18 18" fill="none">
              {[4,9,14].map(y=>[6,12].map(x=>(
                <circle key={`${x}-${y}`} cx={x} cy={y} r={2} fill='rgba(255,255,255,0.55)'/>
              )))}
            </svg>
          </div>

          {/* Delete bin */}
          <div
            data-nodrag="1"
            onClick={e=>{e.stopPropagation();_cvCb.deleteSection&&_cvCb.deleteSection(data.sectionId);}}
            onMouseEnter={()=>setHD(true)} onMouseLeave={()=>setHD(false)}
            style={{
              position:'absolute',top:'50%',transform:'translateY(-50%)',right:10,
              display:'flex',alignItems:'center',justifyContent:'center',
              padding:5,borderRadius:6,lineHeight:1,cursor:'default',userSelect:'none',
              background:hD?'rgba(255,80,104,0.14)':'transparent',
              transition:'background 0.15s',
            }}
          >
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <polyline points="3 6 5 6 21 6" stroke={hD?'var(--tlc-rd)':'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:'stroke 0.15s'}}/>
              <path d="M19 6l-1 14H6L5 6" stroke={hD?'var(--tlc-rd)':'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:'stroke 0.15s'}}/>
              <path d="M10 11v6M14 11v6" stroke={hD?'var(--tlc-rd)':'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
              <path d="M9 6V4h6v2" stroke={hD?'var(--tlc-rd)':'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:'stroke 0.15s'}}/>
            </svg>
          </div>


          {/* Notes icon */}
          {!editing && (
            <div
              data-nodrag="1"
              ref={descBtnRef}
              onClick={e=>{e.stopPropagation();setDescOpen(o=>{ if(!o) requestCanvasFitView(); return !o; });}}
              onMouseEnter={()=>setHDesc(true)} onMouseLeave={()=>setHDesc(false)}
              style={{
                position:'absolute',top:'50%',transform:'translateY(-50%)',right:50,
                display:'flex',alignItems:'center',justifyContent:'center',
                padding:5,borderRadius:6,lineHeight:1,cursor:'default',userSelect:'none',
                background:(hDesc||descOpen)?'rgba(201,168,76,0.12)':'transparent',
                transition:'background 0.15s',
              }}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                <line x1="4" y1="7" x2="20" y2="7" stroke={(hDesc||descOpen||hasDesc)?GOLD:'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
                <line x1="4" y1="12" x2="20" y2="12" stroke={(hDesc||descOpen||hasDesc)?GOLD:'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
                <line x1="4" y1="17" x2="13" y2="17" stroke={(hDesc||descOpen||hasDesc)?GOLD:'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
              </svg>
            </div>
          )}
        </div>

        {/* Label — gold text, the primary gold accent */}
        <div
          onDoubleClick={startEdit}
          onMouseEnter={()=>setHLabel(true)}
          onMouseLeave={()=>setHLabel(false)}
          style={{flex:1,display:'flex',alignItems:'flex-start',justifyContent:'center',overflow:'hidden',padding:'10px 16px',cursor:'default'}}
        >
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,width:'100%'}}>
            {editing ? (
              <textarea
                ref={inputRef}
                value={draft}
                maxLength={72}
                onChange={handleChange}
                onBlur={commitEdit}
                onKeyDown={e=>{
                  if(e.key==='Enter'){e.preventDefault();inputRef.current?.blur();}
                  if(e.key==='Escape'){cancelRef.current=true;inputRef.current?.blur();}
                  e.stopPropagation();
                }}
                style={{fontSize:19,fontWeight:800,color:GOLD,textTransform:'uppercase',letterSpacing:1.6,width:'100%',height:taH,textAlign:'center',lineHeight:1.5,wordBreak:'break-word',resize:'none',overflow:'hidden',background:'transparent',border:'none',outline:'none',padding:0,caretColor:GOLD,fontFamily:'inherit'}}
              />
            ) : (
              <span style={{fontSize:19,fontWeight:800,color:GOLD,textTransform:'uppercase',letterSpacing:1.6,textAlign:'center',userSelect:'none',wordBreak:'break-word',lineHeight:1.5,width:'100%'}}>{data.label||'Group'}</span>
            )}
            <div
              data-nodrag="1"
              onClick={e=>{e.stopPropagation();if(!editing)startEdit(e);}}
              style={{display:'flex',alignItems:'center',justifyContent:'center',width:36,height:36,borderRadius:6,background:(!editing&&hLabel)?'rgba(201,168,76,0.12)':'transparent',cursor:'default',visibility:(!editing&&hLabel)?'visible':'hidden',transition:'background 0.12s'}}
              onMouseEnter={e=>{if(!editing&&hLabel)e.currentTarget.style.background='rgba(201,168,76,0.22)';}}
              onMouseLeave={e=>{e.currentTarget.style.background=(!editing&&hLabel)?'rgba(201,168,76,0.12)':'transparent';}}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <path d="M4 20h4l10.5-10.5a2.828 2.828 0 0 0-4-4L4 16v4z" stroke={GOLD} strokeWidth="2" strokeLinejoin="round"/>
                <path d="M14.5 5.5l4 4" stroke={GOLD} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div style={{flex:1,background:descOpen?'transparent':'var(--tlc-sf)',position:'relative'}}>
        {/* Dashed placeholder slots for empty positions */}
        {(()=>{
          const slots = getSlotLocalPositions();
          const filled = new Set(data.filledSlots || []);
          return slots.map((p, i) => {
            if (filled.has(i)) return null;
            const isHov = hSlotIdx === i;
            return (
              <div key={`ph_${i}`}
                data-nodrag="1"
                onClick={e=>{e.stopPropagation();_cvCb.addCondition&&_cvCb.addCondition(data.sectionId, i);}}
                onMouseEnter={()=>setHSlotIdx(i)} onMouseLeave={()=>setHSlotIdx(null)}
                style={{
                  position:'absolute',
                  left: p.x - STRIP_W,
                  top: p.y,
                  width: COND_W, height: COND_H,
                  border:`2px dashed ${isHov?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.20)'}`,
                  background:isHov?'rgba(255,255,255,0.04)':'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'default', transition:'background 0.13s, border-color 0.13s',
                  userSelect:'none',
                }}>
                <svg width={42} height={42} viewBox="0 0 24 24" fill="none" style={{opacity:isHov?0.85:0.45,transition:'opacity 0.13s'}}>
                  <line x1="12" y1="5" x2="12" y2="19" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="5" y1="12" x2="19" y2="12" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            );
          });
        })()}
        {/* Connector buttons between slots */}
        {(()=>{
          const slots = getSlotLocalPositions();
          const filled = new Set(data.filledSlots || []);
          const connectors = (data.connectors && data.connectors.length === COND_COLS - 1)
            ? data.connectors
            : Array(COND_COLS - 1).fill('AND');
          const btnW = 76, btnH = 38;
          return slots.slice(0, -1).map((p, i) => {
            const centerX = p.x + COND_W + COND_COL_GAP / 2;
            const isHov = hConnIdx === i;
            const label = connectors[i] || 'AND';
            const isPress = pConnIdx === i;
            const neighborsFilled = filled.has(i) && filled.has(i+1);
            const isOff = label === 'OFF';
            const baseStyle = {
              position:'absolute',
              left: centerX - STRIP_W - btnW/2,
              top: p.y + COND_H/2 - btnH/2,
              width: btnW, height: btnH,
              display:'flex', alignItems:'center', justifyContent:'center', boxSizing:'border-box',
              fontFamily:"'Exo 2',sans-serif",
              fontSize:16, fontWeight:700, letterSpacing:'0.04em',
              userSelect:'none', WebkitFontSmoothing:'antialiased',
              transition:'background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease, color 0.12s ease, opacity 0.12s ease',
            };
            if (!neighborsFilled) {
              return (
                <div key={`conn_${i}`}
                  style={{
                    ...baseStyle,
                    background:'rgba(255,255,255,0.04)',
                    border:'1px solid rgba(255,255,255,0.08)',
                    color:'rgba(255,255,255,0.30)',
                    opacity:0.55,
                    pointerEvents:'none',
                    cursor:'default',
                  }}>
                  —
                </div>
              );
            }
            if (isOff) {
              return (
                <button key={`conn_${i}`}
                  className="nodrag"
                  type="button"
                  onClick={e=>{e.stopPropagation(); cycleConnector(i);}}
                  onMouseEnter={()=>setHConnIdx(i)} onMouseLeave={()=>{setHConnIdx(null);setPConnIdx(null);}}
                  onMouseDown={e=>{e.stopPropagation();setPConnIdx(i);}} onMouseUp={()=>setPConnIdx(null)}
                  style={{
                    ...baseStyle,
                    background: isPress ? 'rgba(255,255,255,0.10)' : isHov ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                    border:`1px solid ${isHov||isPress?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.10)'}`,
                    color:'rgba(255,255,255,0.40)',
                    cursor:'default',
                    transform: isPress ? 'scale(0.96)' : 'scale(1)',
                  }}>
                  —
                </button>
              );
            }
            return (
              <button key={`conn_${i}`}
                className="nodrag"
                type="button"
                onClick={e=>{e.stopPropagation(); cycleConnector(i);}}
                onMouseEnter={()=>setHConnIdx(i)} onMouseLeave={()=>{setHConnIdx(null);setPConnIdx(null);}}
                onMouseDown={e=>{e.stopPropagation();setPConnIdx(i);}} onMouseUp={()=>setPConnIdx(null)}
                style={{
                  ...baseStyle,
                  background: label==='OR'
                    ? (isPress ? '#DB2777' : isHov ? 'linear-gradient(135deg,#EC4899,#F472B6)' : 'linear-gradient(135deg,#DB2777,#EC4899)')
                    : (isPress ? '#10B981' : isHov ? 'linear-gradient(135deg,#34D399,#6EE7B7)' : 'linear-gradient(135deg,#10B981,#34D399)'),
                  border: label==='OR'
                    ? `1px solid ${isHov||isPress ? '#EC4899' : 'rgba(219,39,119,0.55)'}`
                    : `1px solid ${isHov||isPress ? '#34D399' : 'rgba(16,185,129,0.55)'}`,
                  color:'#fff',
                  boxShadow: label==='OR'
                    ? (isHov ? '0 1px 6px rgba(219,39,119,0.20)' : '0 1px 3px rgba(219,39,119,0.10)')
                    : (isHov ? '0 1px 6px rgba(16,185,129,0.20)' : '0 1px 3px rgba(16,185,129,0.10)'),
                  transform: isPress ? 'scale(0.96)' : 'scale(1)',
                  cursor:'default',
                }}>
                {label}
              </button>
            );
          });
        })()}
      </div>


      {/* Screenshot viewer window */}
      {lightbox!==null && screenshots[lightbox]?.src && createPortal(
        <div data-nodrag="1" onClick={e=>{e.stopPropagation(); setLightbox(null);}}
          style={{position:'fixed', inset:0, zIndex:100001, background:'rgba(4,5,15,0.80)',
            '--tlc-bg':'#07080E', '--tlc-sf':'#0A0C14', '--tlc-el':'#0F1119',
            '--tlc-tx':'rgba(255,255,255,0.92)', '--tlc-ts':'rgba(255,255,255,0.70)', '--tlc-tm':'rgba(255,255,255,0.50)',
            '--tlc-brh':'rgba(140,160,255,0.12)',
            '--tlc-rd':'#FF5068', '--tlc-ac':'#C9A84C',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()}
            style={{width:'min(1200px,86vw)', height:'min(820px,88vh)', background:'var(--tlc-bg)',
              border:'1px solid var(--tlc-brh)',
              boxShadow:'0 32px 96px rgba(0,0,0,0.9), 0 0 0 1px rgba(140,160,255,0.13)',
              display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:"'Exo 2',sans-serif"}}>
            <div style={{height:2, background:`linear-gradient(90deg,#C9A84C,#DAB85F,#C9A84C)`, flexShrink:0}}/>
            <div style={{height:44, flexShrink:0, display:'flex', alignItems:'center',
              padding:'0 10px 0 18px', borderBottom:'1px solid var(--tlc-brh)', background:'var(--tlc-bg)'}}>
              <span style={{fontSize:13, fontWeight:800, color:'var(--tlc-tx)', letterSpacing:0.4, flex:1,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:8}}>
                {screenshots[lightbox]?.name || (data.label||'Group')}
              </span>
              <div onClick={()=>setLightbox(null)}
                onMouseEnter={()=>setLbHClose(true)} onMouseLeave={()=>setLbHClose(false)}
                style={{width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'default', borderRadius:4, flexShrink:0,
                  color:lbHClose?'var(--tlc-rd)':'var(--tlc-tm)',
                  background:lbHClose?'rgba(255,80,104,0.08)':'transparent',
                  transition:'color 0.12s, background 0.12s'}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <div ref={lbImgAreaRef}
              onMouseEnter={()=>setLbImgHover(true)} onMouseLeave={()=>{setLbImgHover(false); setLbPanning(false); lbPanStartRef.current=null;}}
              onMouseDown={e=>{ if(lbZoom>1){ e.preventDefault(); setLbPanning(true); lbPanStartRef.current={x:e.clientX, y:e.clientY, px:lbPan.x, py:lbPan.y}; } }}
              onMouseMove={e=>{ if(lbPanning && lbPanStartRef.current){ const s=lbPanStartRef.current; setLbPan({x:s.px+(e.clientX-s.x), y:s.py+(e.clientY-s.y)}); } }}
              onMouseUp={()=>{ setLbPanning(false); lbPanStartRef.current=null; }}
              style={{flex:1, minHeight:0, overflow:'hidden', position:'relative', display:'flex',
                alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.18)', padding:16,
                cursor: lbZoom>1 ? (lbPanning ? 'grabbing' : 'grab') : 'default'}}>
              <img src={screenshots[lightbox].src} alt="" draggable={false}
                style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', display:'block',
                  boxShadow:'0 4px 24px rgba(0,0,0,0.5)',
                  transform:`translate(${lbPan.x}px, ${lbPan.y}px) scale(${lbZoom})`, transformOrigin:'center center',
                  transition: lbPanning ? 'none' : 'transform 0.12s ease',
                  pointerEvents:'none', userSelect:'none'}}/>
              <div style={{position:'absolute', bottom:14, left:'50%', transform:'translateX(-50%)',
                display:'flex', alignItems:'center', gap:4, padding:'4px 6px',
                background:'var(--tlc-sf)', border:'1px solid var(--tlc-brh)', borderRadius:8,
                boxShadow:'0 6px 20px rgba(0,0,0,0.45)',
                opacity:lbImgHover?1:0, pointerEvents:lbImgHover?'auto':'none', transition:'opacity 0.18s ease'}}>
                <div onClick={()=>setLbZoom(z=>{const nz=Math.max(0.5,parseFloat((z-0.25).toFixed(2))); if(nz<=1)setLbPan({x:0,y:0}); return nz;})}
                  onMouseEnter={()=>setLbHZoomOut(true)} onMouseLeave={()=>setLbHZoomOut(false)}
                  style={{display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32,
                    borderRadius:6, cursor:'default',
                    background:lbHZoomOut?'rgba(255,255,255,0.08)':'transparent', transition:'background 0.12s'}}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke={lbHZoomOut?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" style={{transition:'stroke 0.12s'}}/>
                    <line x1="8" y1="11" x2="14" y2="11" stroke={lbHZoomOut?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                    <line x1="16" y1="16" x2="21" y2="21" stroke={lbHZoomOut?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                  </svg>
                </div>
                <span onClick={()=>{setLbZoom(1); setLbPan({x:0,y:0});}}
                  style={{fontSize:12, fontWeight:700, color:'var(--tlc-tm)', minWidth:42, textAlign:'center', cursor:'default', userSelect:'none'}}>
                  {Math.round(lbZoom*100)}%
                </span>
                <div onClick={()=>setLbZoom(z=>Math.min(3,parseFloat((z+0.25).toFixed(2))))}
                  onMouseEnter={()=>setLbHZoomIn(true)} onMouseLeave={()=>setLbHZoomIn(false)}
                  style={{display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32,
                    borderRadius:6, cursor:'default',
                    background:lbHZoomIn?'rgba(255,255,255,0.08)':'transparent', transition:'background 0.12s'}}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke={lbHZoomIn?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" style={{transition:'stroke 0.12s'}}/>
                    <line x1="11" y1="8" x2="11" y2="14" stroke={lbHZoomIn?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                    <line x1="8" y1="11" x2="14" y2="11" stroke={lbHZoomIn?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                    <line x1="16" y1="16" x2="21" y2="21" stroke={lbHZoomIn?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                  </svg>
                </div>
              </div>
            </div>
            <div style={{height:48, flexShrink:0, borderTop:'1px solid var(--tlc-brh)',
              background:'var(--tlc-sf)',
              display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8, padding:'0 14px'}}>
              <button onClick={()=>{setActiveSlot(lightbox); setLbZoom(1); fileInputRef.current?.click();}}
                onMouseEnter={()=>setLbHReplace(true)} onMouseLeave={()=>{setLbHReplace(false);setLbPReplace(false);}}
                onMouseDown={()=>setLbPReplace(true)} onMouseUp={()=>setLbPReplace(false)}
                style={{display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'0 14px', height:30, minWidth:90, boxSizing:'border-box',
                  background: lbPReplace ? '#C9A84C' : lbHReplace ? 'linear-gradient(135deg,#DAB85F,#E6C870)' : 'linear-gradient(135deg,#C9A84C,#DAB85F)',
                  border: `1px solid ${lbHReplace || lbPReplace ? '#DAB85F' : 'rgba(218,184,95,0.5)'}`,
                  color:'#fff', fontSize:12, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:'0.02em',
                  cursor:'default',
                  boxShadow: lbHReplace ? '0 1px 4px rgba(201,168,76,0.18)' : 'none',
                  transform: lbPReplace ? 'scale(0.96)' : 'scale(1)',
                  transition:'background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease',
                  WebkitFontSmoothing:'antialiased'}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                  <polyline points="23 4 23 10 17 10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="1 20 1 14 7 14" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>REPLACE</span>
              </button>
              <button onClick={()=>{setScreenshots(p=>{const n=[...p]; n[lightbox]=null; setNodes(nds => nds.map(node => node.id === id ? { ...node, data: { ...node.data, images:n } } : node)); return n;}); setLightbox(null);}}
                onMouseEnter={()=>setLbHDelete(true)} onMouseLeave={()=>{setLbHDelete(false);setLbPDelete(false);}}
                onMouseDown={()=>setLbPDelete(true)} onMouseUp={()=>setLbPDelete(false)}
                style={{display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'0 14px', height:30, minWidth:90, boxSizing:'border-box',
                  background: lbPDelete ? '#FF5068' : lbHDelete ? 'linear-gradient(135deg,#FF6B7F,#FF8A99)' : 'linear-gradient(135deg,#FF5068,#FF6B7F)',
                  border: `1px solid ${lbHDelete || lbPDelete ? '#FF6B7F' : 'rgba(255,107,127,0.5)'}`,
                  color:'#fff', fontSize:12, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:'0.02em',
                  cursor:'default',
                  boxShadow: lbHDelete ? '0 1px 4px rgba(255,80,104,0.18)' : 'none',
                  transform: lbPDelete ? 'scale(0.96)' : 'scale(1)',
                  transition:'background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease',
                  WebkitFontSmoothing:'antialiased'}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                  <polyline points="3 6 5 6 21 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 6l-1 14H6L5 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 11v6M14 11v6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
                  <path d="M9 6V4h6v2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>DELETE</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Rendered inside .react-flow__nodes via portal — graph coordinates, shares node stacking context
const GraphSepLine = ({ topY, onInsert }) => {
  const [hov, setHov] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const lineStyle = {
    flex:1, height:2, alignSelf:'center',
    background: hov ? 'rgba(201,168,76,0.55)' : 'rgba(201,168,76,0.38)',
    pointerEvents:'none',
    transition:'background 0.15s ease',
  };
  return (
    <div
      style={{
        position:'absolute', left:SEC_X, top:topY, width:SEC_W, height:SEC_GAP,
        zIndex: hov ? 12 : 10, display:'flex', alignItems:'center',
        pointerEvents:'auto',
      }}
      className="tlc-graph-sep nodrag nopan"
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>{ setHov(false); setActive(false); }}
    >
      <div
        className="nodrag nopan"
        onMouseDown={e=>{ e.stopPropagation(); setActive(true); }}
        onMouseUp={()=>setActive(false)}
        onClick={e=>{ e.stopPropagation(); onInsert(); }}
        style={{
          fontSize:20,color:GOLD,lineHeight:1,flexShrink:0,
          display:'flex',alignItems:'center',justifyContent:'center',
          padding:hov?'10px 28px':'0',height:hov?42:0,
          maxWidth:hov?400:0,minWidth:0,
          overflow:'hidden',whiteSpace:'nowrap',
          cursor:'default',userSelect:'none',
          background:active?'rgba(201,168,76,0.26)':hov?'rgba(201,168,76,0.13)':'transparent',
          opacity:hov?1:0,
          transform:active?'scale(0.95)':'scale(1)',
          transition:'max-width 0.15s,padding 0.15s,height 0.15s,opacity 0.15s,background 0.08s,transform 0.08s',
        }}
      ><span style={{fontSize:28,lineHeight:1,marginRight:7}}>+</span>Group</div>
      <div style={lineStyle}/>
    </div>
  );
};

const SepOverlay = ({ topY, botY, onInsert }) => {
  const [hov, setHov] = React.useState(false);
  const [hBtn, setHBtn] = React.useState(false);
  const lineC = 'rgba(201,168,76,0.22)';
  return (
    <div
      style={{position:'absolute',left:0,right:14,top:topY,height:Math.max(botY-topY,0),pointerEvents:'all',display:'flex',alignItems:'center'}}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>{setHov(false);setHBtn(false);}}
    >
      <div style={{flex:1,height:0,borderTop:'2px dotted rgba(201,168,76,0.35)'}}/>
      <div
        onClick={()=>onInsert()}
        onMouseEnter={()=>setHBtn(true)}
        onMouseLeave={()=>setHBtn(false)}
        style={{
          fontSize:10,color:GOLD,lineHeight:1,
          display:'flex',alignItems:'center',justifyContent:'center',
          padding:hov?'2px 5px':'0',height:hov?14:0,
          maxWidth:hov?200:0,minWidth:0,
          overflow:'hidden',whiteSpace:'nowrap',
          cursor:'default',userSelect:'none',
          background:hBtn?GOLD_SIDE:'transparent',
          borderRadius:0,
          opacity:hov?1:0,
          transition:'max-width 0.15s,padding 0.15s,height 0.15s,opacity 0.15s,background 0.12s',
        }}
      >+ Group</div>
      <div style={{flex:1,height:0,borderTop:'2px dotted rgba(201,168,76,0.35)'}}/>
    </div>
  );
};

/* ── Node: Condition Card ── */
const ConditionCard = ({ id, data, selected }) => {
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState('');
  const [taH, setTaH] = React.useState('auto');
  const [hDel, setHDel] = React.useState(false);
  const [hDesc, setHDesc] = React.useState(false);
  const [hMand, setHMand] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [statusMenuPos, setStatusMenuPos] = React.useState({top:0, left:0});
  const statusBtnRef = React.useRef(null);
  const statusMenuRef = React.useRef(null);
  const [hTitle, setHTitle] = React.useState(false);
  const [descOpen, setDescOpen] = React.useState(false);
  const [descEditing, setDescEditing] = React.useState(false);
  const [descDraft, setDescDraft] = React.useState(data.description || '');
  const [descFlipUp, setDescFlipUp] = React.useState(false);
  const [hDescEdit, setHDescEdit] = React.useState(false);
  const [hClose, setHClose] = React.useState(false);
  const [screenshots, setScreenshots] = React.useState(() => {
    const imgs = Array.isArray(data.images) ? data.images : [];
    return Array.from({ length: 4 }, (_, i) => imgs[i] || null);
  });
  const [activeSlot, setActiveSlot] = React.useState(null);
  const [hSlot, setHSlot] = React.useState(null);
  const [pressSlot, setPressSlot] = React.useState(null);
  const [hOpenBtn, setHOpenBtn] = React.useState(null);
  const [hDelBtn, setHDelBtn] = React.useState(null);
  const [pressBtn, setPressBtn] = React.useState(null);
  const [lightbox, setLightbox] = React.useState(null);
  const [lbZoom, setLbZoom] = React.useState(1);
  const [lbHClose, setLbHClose] = React.useState(false);
  const [lbHZoomIn, setLbHZoomIn] = React.useState(false);
  const [lbHZoomOut, setLbHZoomOut] = React.useState(false);
  const [lbHReplace, setLbHReplace] = React.useState(false);
  const [lbHDelete, setLbHDelete] = React.useState(false);
  const [lbPReplace, setLbPReplace] = React.useState(false);
  const [lbPDelete, setLbPDelete] = React.useState(false);
  const [lbImgHover, setLbImgHover] = React.useState(false);
  const [lbPan, setLbPan] = React.useState({x:0, y:0});
  const [lbPanning, setLbPanning] = React.useState(false);
  const lbPanStartRef = React.useRef(null);
  const lbImgAreaRef = React.useRef(null);
  const descBtnRef = React.useRef(null);
  const openLightbox = (idx) => { setLightbox(idx); setLbZoom(1); setLbPan({x:0,y:0}); };

  React.useEffect(() => {
    if (lightbox===null) return;
    const el = lbImgAreaRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      setLbZoom(z => {
        const dz = e.deltaY < 0 ? 0.12 : -0.12;
        const nz = Math.max(0.5, Math.min(3, parseFloat((z + dz).toFixed(2))));
        if (nz <= 1) setLbPan({x:0,y:0});
        return nz;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [lightbox]);
  const titleRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const descRef = React.useRef(null);
  const descPanelRef = React.useRef(null);
  const { setNodes } = useReactFlow();

  React.useEffect(() => { setNodes(nds=>nds.map(n=>n.id===id?{...n,zIndex:(descOpen||statusOpen)?1000:0}:n)); }, [descOpen, statusOpen]);
  React.useEffect(() => {
    if(!statusOpen) return;
    const h = (e) => {
      if(statusBtnRef.current && statusBtnRef.current.contains(e.target)) return;
      if(statusMenuRef.current && !statusMenuRef.current.contains(e.target)) setStatusOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [statusOpen]);
  React.useEffect(() => { if(!descOpen){setDescEditing(false);} }, [descOpen]);
  React.useEffect(() => { if(!descOpen) setDescDraft(data.description||''); }, [data.description]);
  React.useEffect(() => {
    const imgs = Array.isArray(data.images) ? data.images : [];
    setScreenshots(Array.from({ length: 4 }, (_, i) => imgs[i] || null));
  }, [data.images]);
  React.useEffect(() => { if(descEditing && descRef.current) descRef.current.focus(); }, [descEditing]);
  React.useEffect(() => {
    if(!descOpen) return;
    const el = descRef.current;
    if(!el) return;
    const stop = (e) => e.stopPropagation();
    el.addEventListener('wheel', stop, { passive: true });
    return () => el.removeEventListener('wheel', stop);
  }, [descOpen]);
  React.useEffect(() => {
    if(!descOpen) return;
    if(lightbox!==null) return;
    const h = (e) => {
      if (descBtnRef.current && descBtnRef.current.contains(e.target)) return;
      if (descPanelRef.current && !descPanelRef.current.contains(e.target)) setDescOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [descOpen, lightbox]);

  React.useLayoutEffect(() => {
    if (!descOpen) { setDescFlipUp(false); return; }
    const measure = () => {
      const panel = descPanelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const footerTop = document.querySelector('[data-strategy-builder-footer="1"]')?.getBoundingClientRect().top ?? (window.innerHeight - 64);
      setDescFlipUp(rect.bottom > footerTop - 10);
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [descOpen, descDraft]);

  React.useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.style.height = '1px';
      const sh = titleRef.current.scrollHeight;
      titleRef.current.style.height = sh + 'px';
      setTaH(sh + 'px');
    }
  }, [editingTitle, titleDraft]);

  const commitTitle = () => {
    const t = titleDraft.trim();
    if (t) _cvCb.updateCondition?.(id, { label: t });
    setEditingTitle(false);
    requestCanvasFitView();
  };

  const handleScreenshotClick = (idx) => { setActiveSlot(idx); if(fileInputRef.current) fileInputRef.current.click(); };
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if(!file || activeSlot===null) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = {src:ev.target.result, name:file.name};
      setScreenshots(prev=>{ const n=[...prev]; n[activeSlot]=img; _cvCb.updateCondition?.(id,{images:n}); return n; });
      requestCanvasFitView();
    };
    reader.readAsDataURL(file);
    e.target.value='';
  };

  const status = data.status || (data.mandatory === false ? 'optional' : 'mandatory');
  const cardColor = status === 'mandatory' ? '#2643F7' : status === 'optional' ? '#7C3AED' : '#EF4444';
  return (
    <div style={{
      fontFamily:'inherit', width:'100%', height:'100%', borderRadius:0, overflow:(descOpen||statusOpen)?'visible':'hidden',
      background:cardColor,
      boxShadow: selected ? '0 0 0 2px rgba(255,255,255,0.55)' : 'none',
      display:'flex', flexDirection:'column', position:'relative',
    }}>

      {/* Floating description panel */}
      <div ref={descPanelRef} onClick={e=>e.stopPropagation()}
        style={{
          position:'absolute', left:0, top:descFlipUp?'auto':40, bottom:descFlipUp?40:'auto', width:440,
          background:'var(--tlc-sf)', display:'flex', flexDirection:'column',
          zIndex:20, border:'1px solid var(--tlc-brh)', borderTop:'none',
          boxShadow:'4px 16px 40px rgba(0,0,0,0.60)', fontFamily:"'Exo 2',sans-serif",
          opacity:descOpen?1:0, transform:descOpen?'translateY(0)':'translateY(-10px)',
          pointerEvents:descOpen?'auto':'none', transition:'opacity 0.18s ease, transform 0.18s ease',
        }}>
        {/* Top accent line — matches card color */}
        <div style={{height:2, background:cardColor, flexShrink:0}}/>
        {/* Header */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px 0 16px', height:54, flexShrink:0, borderBottom:'1px solid var(--tlc-brh)'}}>
          <span style={{fontSize:16, fontWeight:700, color:'var(--tlc-tx)', letterSpacing:0.5, textTransform:'uppercase', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:8}}>{data.label||'Condition'}</span>
          <div style={{display:'flex', alignItems:'center', gap:4}}>
            <div onClick={e=>{e.stopPropagation();setDescEditing(o=>{ if(!o) requestCanvasFitView(); return !o; });}}
              onMouseEnter={()=>setHDescEdit(true)} onMouseLeave={()=>setHDescEdit(false)}
              style={{display:'flex', alignItems:'center', justifyContent:'center', padding:9, borderRadius:7, cursor:'default',
                background:descEditing?'rgba(38,67,247,0.20)':hDescEdit?'rgba(255,255,255,0.08)':'transparent', transition:'background 0.15s'}}>
              {descEditing ? (
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                  <polyline points="4 13 9 18 20 7" stroke="#2643F7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                  <path d="M4 20h4l10.5-10.5a2.828 2.828 0 0 0-4-4L4 16v4z" stroke={hDescEdit?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2" strokeLinejoin="round" style={{transition:'stroke 0.15s'}}/>
                  <path d="M14.5 5.5l4 4" stroke={hDescEdit?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
                </svg>
              )}
            </div>
            <div onClick={()=>setDescOpen(false)}
              onMouseEnter={()=>setHClose(true)} onMouseLeave={()=>setHClose(false)}
              style={{display:'flex', alignItems:'center', justifyContent:'center', padding:9, borderRadius:7, cursor:'default',
                background:hClose?'rgba(255,80,104,0.14)':'transparent', transition:'background 0.15s'}}>
              <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <line x1="5" y1="5" x2="19" y2="19" stroke={hClose?'var(--tlc-rd)':'var(--tlc-tm)'} strokeWidth="2.5" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
                <line x1="19" y1="5" x2="5" y2="19" stroke={hClose?'var(--tlc-rd)':'var(--tlc-tm)'} strokeWidth="2.5" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
              </svg>
            </div>
          </div>
        </div>
        {/* Notes textarea */}
        <textarea ref={descRef}
          value={descDraft} readOnly={!descEditing}
          onChange={e=>{ const v=e.target.value; setDescDraft(v); _cvCb.updateCondition?.(id,{description:v}); }}
          onKeyDown={e=>{ if(e.key==='Escape'){if(descEditing)setDescEditing(false);else setDescOpen(false);} e.stopPropagation(); }}
          placeholder="Click the edit button to add notes…"
          className="tlr-scroll"
          style={{flexShrink:0, height:190, background:'transparent', border:'none', outline:'none',
            color:descEditing?'var(--tlc-ts)':'var(--tlc-tm)', fontSize:21, fontFamily:"'Exo 2',sans-serif",
            lineHeight:1.7, padding:'14px 18px', resize:'none', caretColor:'#C9A84C',
            overflowY:'auto', cursor:descEditing?'text':'default'}}
        />
        {/* Divider + screenshots */}
        <div style={{height:1, background:'var(--tlc-brh)', flexShrink:0}}/>
        <div style={{padding:'10px 16px 6px', fontSize:14, fontWeight:700, color:'var(--tlc-tm)', letterSpacing:0.8, textTransform:'uppercase', flexShrink:0}}>Screenshots</div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:'0 14px 14px', flexShrink:0}}>
          {screenshots.map((shot, i) => { const src = shot?.src; return (
            <div key={i} data-nodrag="1"
              onClick={e=>{e.stopPropagation(); handleScreenshotClick(i);}}
              onMouseEnter={()=>setHSlot(i)} onMouseLeave={()=>{setHSlot(null);setPressSlot(null);}}
              onMouseDown={()=>setPressSlot(i)} onMouseUp={()=>setPressSlot(null)}
              style={{height:78, position:'relative', overflow:'hidden', cursor:'default',
                background: pressSlot===i ? 'rgba(255,255,255,0.12)' : hSlot===i ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
                border: hSlot===i ? '1px solid rgba(255,255,255,0.30)' : '1px solid var(--tlc-brh)',
                display:'flex', alignItems:'center', justifyContent:'center',
                transform: pressSlot===i ? 'scale(0.97)' : 'scale(1)',
                transition:'background 0.12s, border-color 0.12s, transform 0.08s'}}>
              {src ? (
                <img src={src} style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} alt=""/>
              ) : (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:5, opacity:0.38, pointerEvents:'none'}}>
                  <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="1" stroke="var(--tlc-tm)" strokeWidth="1.5"/>
                    <circle cx="8.5" cy="8.5" r="1.5" fill="var(--tlc-tm)"/>
                    <polyline points="3 16 8 11 13 16" stroke="var(--tlc-tm)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="13 16 16 13 21 18" stroke="var(--tlc-tm)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{fontSize:14, color:'var(--tlc-tm)', fontFamily:'inherit'}}>Add screenshot</span>
                </div>
              )}
              {src && hSlot===i && (
                <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.52)', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
                  {/* Open */}
                  <div data-nodrag="1"
                    onClick={e=>{e.stopPropagation(); openLightbox(i);}}
                    onMouseEnter={()=>setHOpenBtn(i)} onMouseLeave={()=>setHOpenBtn(null)}
                    onMouseDown={()=>setPressBtn({i,t:'open'})} onMouseUp={()=>setPressBtn(null)}
                    style={{display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:4, cursor:'default',
                      background: pressBtn?.i===i&&pressBtn?.t==='open' ? 'rgba(201,168,76,0.55)' : hOpenBtn===i ? 'rgba(201,168,76,0.28)' : 'transparent',
                      transition:'background 0.1s, transform 0.08s',
                      transform: pressBtn?.i===i&&pressBtn?.t==='open' ? 'scale(0.90)' : 'scale(1)',
                      opacity:1}}>
                    <svg width={27} height={27} viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#C9A84C" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="12" r="3" stroke="#C9A84C" strokeWidth="2.8"/>
                    </svg>
                  </div>
                  {/* Delete */}
                  <div data-nodrag="1"
                    onClick={e=>{e.stopPropagation(); setScreenshots(p=>{const n=[...p];n[i]=null;_cvCb.updateCondition?.(id,{images:n});return n;});}}
                    onMouseEnter={()=>setHDelBtn(i)} onMouseLeave={()=>setHDelBtn(null)}
                    onMouseDown={()=>setPressBtn({i,t:'del'})} onMouseUp={()=>setPressBtn(null)}
                    style={{display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:4, cursor:'default',
                      background: pressBtn?.i===i&&pressBtn?.t==='del' ? 'rgba(255,80,104,0.55)' : hDelBtn===i ? 'rgba(255,80,104,0.28)' : 'transparent',
                      transition:'background 0.1s, transform 0.08s',
                      transform: pressBtn?.i===i&&pressBtn?.t==='del' ? 'scale(0.90)' : 'scale(1)',
                      opacity:1}}>
                    <svg width={27} height={27} viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 6l-1 14H6L5 6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 11v6M14 11v6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round"/>
                      <path d="M9 6V4h6v2" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          );})}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleFileChange}/>
      </div>

      {/* Header strip — buttons */}
      <div style={{
        height:40, flexShrink:0,
        background:'rgba(0,0,0,0.20)',
        borderBottom:'1px solid rgba(255,255,255,0.08)',
        display:'flex', alignItems:'center',
        padding:'0 8px', gap:6,
      }}>
        {/* Drag handle — left side */}
        <div className="tlc-drag-grip" style={{display:'flex',alignItems:'center',justifyContent:'center',padding:5,lineHeight:1,userSelect:'none',marginRight:'auto'}}>
          <svg width={21} height={21} viewBox="0 0 18 18" fill="none">
            {[4,9,14].map(y=>[6,12].map(x=>(
              <circle key={`${x}-${y}`} cx={x} cy={y} r={2} fill='rgba(255,255,255,0.55)'/>
            )))}
          </svg>
        </div>
        {/* Status dropdown — Mandatory / Optional / Invalidate */}
        <div data-nodrag="1" className="nodrag"
          ref={statusBtnRef}
          onClick={e=>{
            e.stopPropagation();
            if (statusOpen) { setStatusOpen(false); return; }
            if (statusBtnRef.current) {
              const r = statusBtnRef.current.getBoundingClientRect();
              setStatusMenuPos({ top: r.bottom + 4, left: r.left });
            }
            setStatusOpen(true);
          }}
          onMouseDown={e=>e.stopPropagation()}
          onMouseEnter={()=>setHMand(true)} onMouseLeave={()=>setHMand(false)}
          title={`Status: ${status}`}
          style={{width:36, height:36, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', cursor:'default',
            background: statusOpen ? 'rgba(255,255,255,0.18)' : hMand ? 'rgba(255,255,255,0.14)' : 'transparent',
            transition:'background 0.12s'}}>
          {status === 'mandatory' ? (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <path d="M12 2l2.6 6.6L22 9l-5.5 4.6L18 21l-6-3.6L6 21l1.5-7.4L2 9l7.4-.4L12 2z" fill="rgba(255,255,255,0.95)"/>
            </svg>
          ) : status === 'optional' ? (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <path d="M12 2l2.6 6.6L22 9l-5.5 4.6L18 21l-6-3.6L6 21l1.5-7.4L2 9l7.4-.4L12 2z" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.95)" strokeWidth="2.4"/>
              <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" stroke="rgba(255,255,255,0.95)" strokeWidth="2.4" strokeLinecap="round"/>
            </svg>
          )}
        </div>
        {statusOpen && createPortal(
          <div ref={statusMenuRef} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}
            style={{position:'fixed', top:statusMenuPos.top, left:statusMenuPos.left, width:140,
              background:'#0A0C14', border:'1px solid rgba(140,160,255,0.22)',
              boxShadow:'0 8px 28px rgba(0,0,0,0.7)',
              zIndex:100020, fontFamily:"'Exo 2',sans-serif"}}>
            <div style={{height:2, background:'linear-gradient(90deg,#2643F7,#4A6AFF,#2643F7)'}}/>
            {[
              {key:'mandatory', label:'Mandatory', color:'#2643F7'},
              {key:'optional', label:'Optional', color:'#7C3AED'},
              {key:'invalidate', label:'Invalidate', color:'#EF4444'},
            ].map(opt => {
              const selected = status === opt.key;
              return (
                <div key={opt.key}
                  onMouseDown={e=>{e.stopPropagation(); e.preventDefault();}}
                  onClick={e=>{
                    e.stopPropagation();
                    e.preventDefault();
                    flushSync(() => { _cvCb.updateCondition && _cvCb.updateCondition(id, {status: opt.key}); });
                    setStatusOpen(false);
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background = selected ? 'rgba(38,67,247,0.06)' : 'rgba(255,255,255,0.04)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background = selected ? 'rgba(38,67,247,0.06)' : 'transparent';}}
                  style={{position:'relative', display:'flex', alignItems:'center', gap:7, padding:'4px 9px', cursor:'default',
                    background: selected ? 'rgba(38,67,247,0.06)' : 'transparent',
                    transition:'background 0.08s'}}>
                  {selected && <div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:'linear-gradient(180deg,transparent,#4A6AFF,transparent)',boxShadow:'0 0 6px rgba(38,67,247,0.12)'}}/>}
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
                    {opt.key === 'invalidate' ? (
                      <>
                        <circle cx="12" cy="12" r="10" stroke={opt.color} strokeWidth="2.4"/>
                        <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" stroke={opt.color} strokeWidth="2.4" strokeLinecap="round"/>
                      </>
                    ) : (
                      <path d="M12 2l2.6 6.6L22 9l-5.5 4.6L18 21l-6-3.6L6 21l1.5-7.4L2 9l7.4-.4L12 2z" fill={opt.color}/>
                    )}
                  </svg>
                  <span style={{fontSize:12, fontWeight:selected?700:600, color:selected?'#4A6AFF':'rgba(255,255,255,0.85)', letterSpacing:0.2}}>{opt.label}</span>
                </div>
              );
            })}
          </div>,
          document.body
        )}
        {/* Description button */}
        <div data-nodrag="1" ref={descBtnRef}
          onClick={e=>{ e.stopPropagation(); setDescOpen(o=>{ if(!o) requestCanvasFitView(); return !o; }); }}
          onMouseEnter={()=>setHDesc(true)} onMouseLeave={()=>setHDesc(false)}
          style={{width:36, height:36, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', cursor:'default',
            background: descOpen ? 'rgba(255,255,255,0.22)' : hDesc ? 'rgba(255,255,255,0.14)' : 'transparent',
            transition:'background 0.12s'}}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <line x1="4" y1="7" x2="20" y2="7" stroke="rgba(255,255,255,0.90)" strokeWidth="2.8" strokeLinecap="round"/>
            <line x1="4" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.90)" strokeWidth="2.8" strokeLinecap="round"/>
            <line x1="4" y1="17" x2="13" y2="17" stroke="rgba(255,255,255,0.90)" strokeWidth="2.8" strokeLinecap="round"/>
          </svg>
        </div>
        {/* Delete button — bin icon, turns red on hover */}
        <div data-nodrag="1"
          onClick={e=>{ e.stopPropagation(); _cvCb.deleteCondition?.(id); }}
          onMouseEnter={()=>setHDel(true)} onMouseLeave={()=>setHDel(false)}
          style={{width:36, height:36, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', cursor:'default',
            background: hDel ? 'rgba(255,80,104,0.18)' : 'transparent',
            transition:'background 0.12s'}}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <polyline points="3 6 5 6 21 6" stroke={hDel?'rgba(255,80,104,1)':'rgba(255,255,255,0.90)'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{transition:'stroke 0.12s'}}/>
            <path d="M19 6l-1 14H6L5 6" stroke={hDel?'rgba(255,80,104,1)':'rgba(255,255,255,0.90)'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{transition:'stroke 0.12s'}}/>
            <path d="M10 11v6M14 11v6" stroke={hDel?'rgba(255,80,104,1)':'rgba(255,255,255,0.90)'} strokeWidth="2.8" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
            <path d="M9 6V4h6v2" stroke={hDel?'rgba(255,80,104,1)':'rgba(255,255,255,0.90)'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{transition:'stroke 0.12s'}}/>
          </svg>
        </div>
      </div>

      {/* Main area — title */}
      <div
          onMouseEnter={()=>setHTitle(true)}
          onMouseLeave={()=>setHTitle(false)}
          style={{flex:1, minHeight:0, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px 12px 10px'}}>
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:6, width:'100%'}}>
            {editingTitle ? (
              <textarea ref={titleRef} value={titleDraft}
                maxLength={70}
                onChange={e=>setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();commitTitle();} if(e.key==='Escape')setEditingTitle(false); e.stopPropagation(); }}
                className="tlc-edit"
                style={{width:'100%', height:taH, fontSize:22, fontWeight:700, background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,0.45)', outline:'none', color:'#fff', padding:'2px 0', fontFamily:'inherit', lineHeight:1.3, textAlign:'center', resize:'none', caretColor:'#fff', overflow:'hidden'}}
              />
            ) : (
              <div data-nodrag="1" onDoubleClick={e=>{ e.stopPropagation(); setTitleDraft(data.label||''); setEditingTitle(true); requestCanvasFitView(); }}
                style={{fontSize:22, fontWeight:700, color:'rgba(255,255,255,0.95)', lineHeight:1.35, cursor:'default', wordBreak:'break-word', textAlign:'center', userSelect:'none', width:'100%'}}>
                {data.label||'Condition'}
              </div>
            )}
            <div
              data-nodrag="1"
              onMouseDown={e=>{ e.preventDefault(); }}
              onClick={e=>{ e.stopPropagation(); if(editingTitle){ commitTitle(); } else { setTitleDraft(data.label||''); setEditingTitle(true); requestCanvasFitView(); } }}
              style={{display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:4, cursor:'default', transition:'background 0.12s',
                background: editingTitle ? 'rgba(255,255,255,0.18)' : hTitle ? 'rgba(255,255,255,0.14)' : 'transparent',
                visibility: (editingTitle||hTitle) ? 'visible' : 'hidden'}}
              onMouseEnter={e=>{ e.currentTarget.style.background= editingTitle ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.22)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.background= editingTitle ? 'rgba(255,255,255,0.18)' : hTitle ? 'rgba(255,255,255,0.14)' : 'transparent'; }}
            >
              {editingTitle ? (
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <polyline points="4 13 9 18 20 7" stroke="rgba(255,255,255,0.92)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <path d="M4 20h4l10.5-10.5a2.828 2.828 0 0 0-4-4L4 16v4z" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M14.5 5.5l4 4" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
            </div>
          </div>
        </div>

      {/* Screenshot viewer window */}
      {lightbox!==null && screenshots[lightbox]?.src && createPortal(
        <div data-nodrag="1" onClick={e=>{e.stopPropagation(); setLightbox(null);}}
          style={{position:'fixed', inset:0, zIndex:100001, background:'rgba(4,5,15,0.80)',
            '--tlc-bg':'#07080E', '--tlc-sf':'#0A0C14', '--tlc-el':'#0F1119',
            '--tlc-tx':'rgba(255,255,255,0.92)', '--tlc-ts':'rgba(255,255,255,0.70)', '--tlc-tm':'rgba(255,255,255,0.50)',
            '--tlc-brh':'rgba(140,160,255,0.12)',
            '--tlc-rd':'#FF5068', '--tlc-ac':'#C9A84C',
            display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()}
            style={{width:'min(1200px,86vw)', height:'min(820px,88vh)', background:'var(--tlc-bg)',
              border:'1px solid var(--tlc-brh)',
              boxShadow:'0 32px 96px rgba(0,0,0,0.9), 0 0 0 1px rgba(140,160,255,0.13)',
              display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:"'Exo 2',sans-serif"}}>
            {/* Blue accent */}
            <div style={{height:2, background:`linear-gradient(90deg,#2643F7,#5C7BFF,#2643F7)`, flexShrink:0}}/>
            {/* Title bar */}
            <div style={{height:44, flexShrink:0, display:'flex', alignItems:'center',
              padding:'0 10px 0 18px', borderBottom:'1px solid var(--tlc-brh)', background:'var(--tlc-bg)'}}>
              <span style={{fontSize:13, fontWeight:800, color:'var(--tlc-tx)', letterSpacing:0.4, flex:1,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:8}}>
                {screenshots[lightbox]?.name || (data.label||'Condition')}
              </span>
              <div onClick={()=>setLightbox(null)}
                onMouseEnter={()=>setLbHClose(true)} onMouseLeave={()=>setLbHClose(false)}
                style={{width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'default', borderRadius:4, flexShrink:0,
                  color:lbHClose?'var(--tlc-rd)':'var(--tlc-tm)',
                  background:lbHClose?'rgba(255,80,104,0.08)':'transparent',
                  transition:'color 0.12s, background 0.12s'}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            {/* Image area with floating zoom controls */}
            <div ref={lbImgAreaRef}
              onMouseEnter={()=>setLbImgHover(true)} onMouseLeave={()=>{setLbImgHover(false); setLbPanning(false); lbPanStartRef.current=null;}}
              onMouseDown={e=>{ if(lbZoom>1){ e.preventDefault(); setLbPanning(true); lbPanStartRef.current={x:e.clientX, y:e.clientY, px:lbPan.x, py:lbPan.y}; } }}
              onMouseMove={e=>{ if(lbPanning && lbPanStartRef.current){ const s=lbPanStartRef.current; setLbPan({x:s.px+(e.clientX-s.x), y:s.py+(e.clientY-s.y)}); } }}
              onMouseUp={()=>{ setLbPanning(false); lbPanStartRef.current=null; }}
              style={{flex:1, minHeight:0, overflow:'hidden', position:'relative', display:'flex',
                alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.18)', padding:16,
                cursor: lbZoom>1 ? (lbPanning ? 'grabbing' : 'grab') : 'default'}}>
              <img src={screenshots[lightbox].src} alt="" draggable={false}
                style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', display:'block',
                  boxShadow:'0 4px 24px rgba(0,0,0,0.5)',
                  transform:`translate(${lbPan.x}px, ${lbPan.y}px) scale(${lbZoom})`, transformOrigin:'center center',
                  transition: lbPanning ? 'none' : 'transform 0.12s ease',
                  pointerEvents:'none', userSelect:'none'}}/>
              {/* Floating zoom pill — bottom center, fades in on hover */}
              <div style={{position:'absolute', bottom:14, left:'50%', transform:'translateX(-50%)',
                display:'flex', alignItems:'center', gap:4, padding:'4px 6px',
                background:'var(--tlc-sf)', border:'1px solid var(--tlc-brh)', borderRadius:8,
                boxShadow:'0 6px 20px rgba(0,0,0,0.45)',
                opacity:lbImgHover?1:0, pointerEvents:lbImgHover?'auto':'none', transition:'opacity 0.18s ease'}}>
                <div onClick={()=>setLbZoom(z=>{const nz=Math.max(0.5,parseFloat((z-0.25).toFixed(2))); if(nz<=1)setLbPan({x:0,y:0}); return nz;})}
                  onMouseEnter={()=>setLbHZoomOut(true)} onMouseLeave={()=>setLbHZoomOut(false)}
                  style={{display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32,
                    borderRadius:6, cursor:'default',
                    background:lbHZoomOut?'rgba(255,255,255,0.08)':'transparent', transition:'background 0.12s'}}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke={lbHZoomOut?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" style={{transition:'stroke 0.12s'}}/>
                    <line x1="8" y1="11" x2="14" y2="11" stroke={lbHZoomOut?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                    <line x1="16" y1="16" x2="21" y2="21" stroke={lbHZoomOut?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                  </svg>
                </div>
                <span onClick={()=>{setLbZoom(1); setLbPan({x:0,y:0});}}
                  style={{fontSize:12, fontWeight:700, color:'var(--tlc-tm)', minWidth:42, textAlign:'center', cursor:'default', userSelect:'none'}}>
                  {Math.round(lbZoom*100)}%
                </span>
                <div onClick={()=>setLbZoom(z=>Math.min(3,parseFloat((z+0.25).toFixed(2))))}
                  onMouseEnter={()=>setLbHZoomIn(true)} onMouseLeave={()=>setLbHZoomIn(false)}
                  style={{display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32,
                    borderRadius:6, cursor:'default',
                    background:lbHZoomIn?'rgba(255,255,255,0.08)':'transparent', transition:'background 0.12s'}}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke={lbHZoomIn?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" style={{transition:'stroke 0.12s'}}/>
                    <line x1="11" y1="8" x2="11" y2="14" stroke={lbHZoomIn?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                    <line x1="8" y1="11" x2="14" y2="11" stroke={lbHZoomIn?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                    <line x1="16" y1="16" x2="21" y2="21" stroke={lbHZoomIn?'var(--tlc-tx)':'var(--tlc-tm)'} strokeWidth="2.2" strokeLinecap="round" style={{transition:'stroke 0.12s'}}/>
                  </svg>
                </div>
              </div>
            </div>
            {/* Toolbar — Replace / Delete */}
            <div style={{height:48, flexShrink:0, borderTop:'1px solid var(--tlc-brh)',
              background:'var(--tlc-sf)',
              display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8, padding:'0 14px'}}>
              <button onClick={()=>{setActiveSlot(lightbox); setLbZoom(1); fileInputRef.current?.click();}}
                onMouseEnter={()=>setLbHReplace(true)} onMouseLeave={()=>{setLbHReplace(false);setLbPReplace(false);}}
                onMouseDown={()=>setLbPReplace(true)} onMouseUp={()=>setLbPReplace(false)}
                style={{display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'0 14px', height:30, minWidth:90, boxSizing:'border-box',
                  background: lbPReplace ? '#C9A84C' : lbHReplace ? 'linear-gradient(135deg,#DAB85F,#E6C870)' : 'linear-gradient(135deg,#C9A84C,#DAB85F)',
                  border: `1px solid ${lbHReplace || lbPReplace ? '#DAB85F' : 'rgba(218,184,95,0.5)'}`,
                  color:'#fff', fontSize:12, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:'0.02em',
                  cursor:'default',
                  boxShadow: lbHReplace ? '0 1px 4px rgba(201,168,76,0.18)' : 'none',
                  transform: lbPReplace ? 'scale(0.96)' : 'scale(1)',
                  transition:'background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease',
                  WebkitFontSmoothing:'antialiased'}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                  <polyline points="23 4 23 10 17 10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="1 20 1 14 7 14" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>REPLACE</span>
              </button>
              <button onClick={()=>{setScreenshots(p=>{const n=[...p]; n[lightbox]=null; _cvCb.updateCondition?.(id,{images:n}); return n;}); setLightbox(null);}}
                onMouseEnter={()=>setLbHDelete(true)} onMouseLeave={()=>{setLbHDelete(false);setLbPDelete(false);}}
                onMouseDown={()=>setLbPDelete(true)} onMouseUp={()=>setLbPDelete(false)}
                style={{display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'0 14px', height:30, minWidth:90, boxSizing:'border-box',
                  background: lbPDelete ? '#FF5068' : lbHDelete ? 'linear-gradient(135deg,#FF6B7F,#FF8A99)' : 'linear-gradient(135deg,#FF5068,#FF6B7F)',
                  border: `1px solid ${lbHDelete || lbPDelete ? '#FF6B7F' : 'rgba(255,107,127,0.5)'}`,
                  color:'#fff', fontSize:12, fontWeight:700, fontFamily:"'Exo 2',sans-serif", letterSpacing:'0.02em',
                  cursor:'default',
                  boxShadow: lbHDelete ? '0 1px 4px rgba(255,80,104,0.18)' : 'none',
                  transform: lbPDelete ? 'scale(0.96)' : 'scale(1)',
                  transition:'background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease',
                  WebkitFontSmoothing:'antialiased'}}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                  <polyline points="3 6 5 6 21 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 6l-1 14H6L5 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 11v6M14 11v6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
                  <path d="M9 6V4h6v2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>DELETE</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

/* ── Custom Edge ── */
const TalEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data={}, selected, markerEnd }) => {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd}
        style={{stroke:selected?'var(--tlc-ac)':'var(--tlc-brh)',strokeWidth:selected?2:1.5}}/>
      {data.label&&(
        <EdgeLabelRenderer>
          <div style={{position:'absolute',transform:`translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,fontSize:10,fontFamily:'inherit',background:'var(--tlc-sf)',color:'var(--tlc-ts)',padding:'1px 5px',borderRadius:3,border:'1px solid var(--tlc-brh)',pointerEvents:'none',whiteSpace:'nowrap'}}>{data.label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const CANVAS_NODE_TYPES = { section:SectionNode, condition:ConditionCard };
const CANVAS_EDGE_TYPES = { talEdge:TalEdge };

const SECTION_DEFS = [
  { label:'TREND',       ac:'rgba(38,67,247,0.9)',  bd:'rgba(38,67,247,0.25)',  bg:'rgba(38,67,247,0.035)', hdr:'rgba(38,67,247,0.07)' },
  { label:'LEVELS',      ac:'rgba(6,182,212,0.9)',  bd:'rgba(6,182,212,0.25)',  bg:'rgba(6,182,212,0.035)', hdr:'rgba(6,182,212,0.07)' },
  { label:'ENTRY MODEL', ac:'rgba(34,197,94,0.9)',  bd:'rgba(34,197,94,0.25)',  bg:'rgba(34,197,94,0.035)', hdr:'rgba(34,197,94,0.07)' },
];
const SECTION_COLOR_CYCLE = [
  { ac:'rgba(38,67,247,0.9)',  bd:'rgba(38,67,247,0.25)',  bg:'rgba(38,67,247,0.035)', hdr:'rgba(38,67,247,0.07)' },
  { ac:'rgba(6,182,212,0.9)',  bd:'rgba(6,182,212,0.25)',  bg:'rgba(6,182,212,0.035)', hdr:'rgba(6,182,212,0.07)' },
  { ac:'rgba(34,197,94,0.9)',  bd:'rgba(34,197,94,0.25)',  bg:'rgba(34,197,94,0.035)', hdr:'rgba(34,197,94,0.07)' },
  { ac:'rgba(201,168,76,0.9)', bd:'rgba(201,168,76,0.25)', bg:'rgba(201,168,76,0.035)',hdr:'rgba(201,168,76,0.07)' },
  { ac:'rgba(168,85,247,0.9)', bd:'rgba(168,85,247,0.25)', bg:'rgba(168,85,247,0.035)',hdr:'rgba(168,85,247,0.07)' },
];
const COND_W = 220, COND_H = 275, COND_COLS = 6;
const STRIP_W = 200;
const COND_COL_GAP = 96;
/** Minimum graph width for one section row (strip + 6 condition slots). */
const FLOW_ROW_GRAPH_W = STRIP_W + 32 + COND_COLS * COND_W + (COND_COLS - 1) * COND_COL_GAP;
let SEC_W = 1400, SEC_X = 0; const SEC_H = 325, SEC_GAP = 72;
const BASE_ZOOM = 0.64;
const BOARD_ZOOM_MIN = 0.42;
const BOARD_ZOOM_MAX = 1;
/** Press-and-hold on the group grip before reorder drag starts (avoids click-to-drag). */
const SECTION_DRAG_HOLD_MS = 200;
const CONNECTOR_OPTIONS = ['AND', 'OR', 'OFF'];
function getSectionHeight() {
  return SEC_H;
}
function getSlotLocalPositions() {
  const availW = SEC_W - STRIP_W - 32;
  const fullRowW = COND_COLS * COND_W + (COND_COLS - 1) * COND_COL_GAP;
  const localStartX = STRIP_W + 16 + Math.max(0, (availW - fullRowW) / 2);
  const localY = (SEC_H - COND_H) / 2;
  const slots = [];
  for (let i = 0; i < COND_COLS; i++) {
    slots.push({ x: localStartX + i * (COND_W + COND_COL_GAP), y: localY });
  }
  return slots;
}
function getConditionPositions(section) {
  const slots = getSlotLocalPositions();
  return slots.map(s => ({ x: section.position.x + s.x, y: section.position.y + s.y }));
}

function restackAll(nds) {
  const sections = nds.filter(n => n.type === 'section').sort((a, b) => a.position.y - b.position.y);
  const result = [];
  let y = 0;
  for (const sec of sections) {
    const newSec = { ...sec, position: { x: SEC_X, y }, style: { ...sec.style, width: SEC_W, height: SEC_H }, width: SEC_W, height: SEC_H };
    result.push(newSec);
    const conds = nds.filter(n => n.type === 'condition' && n.data?.sectionId === sec.id);
    const positions = getConditionPositions(newSec);
    conds.forEach(c => {
      const slot = c.data?.slot ?? 0;
      result.push({ ...c, draggable: true, dragHandle: '.tlc-drag-grip', position: positions[slot] ?? c.position });
    });
    y += SEC_H + SEC_GAP;
  }
  return [...nds.filter(n => n.type !== 'section' && n.type !== 'condition'), ...result];
}

function buildInitialSections() {
  const h = getSectionHeight();
  return SECTION_DEFS.map((s, i) => ({
    id: `sec_${i}`,
    type: 'section',
    position: { x: SEC_X, y: i * (h + SEC_GAP) },
    style: { width: SEC_W, height: h },
    width: SEC_W, height: h,
    draggable: false,
    selectable: false,
    focusable: false,
    data: { ...s, sectionId: `sec_${i}`, condCount: 0, filledSlots: [] },
    zIndex: -1,
  }));
}

/* ── Strategy Templates ── */
const templateDemoImage = (title, subtitle, color = '#2643F7') => ({
  name: `${title}.svg`,
  src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360">
      <rect width="720" height="360" fill="#080B14"/>
      <g opacity="0.42" stroke="#293044" stroke-width="1">
        ${Array.from({length: 9}, (_, i) => `<path d="M0 ${40 + i * 36}H720"/>`).join('')}
        ${Array.from({length: 13}, (_, i) => `<path d="M${40 + i * 56} 0V360"/>`).join('')}
      </g>
      <path d="M58 282C112 244 144 252 184 214C232 168 262 190 310 142C360 92 404 116 456 78C506 42 566 58 660 28" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
      <path d="M70 306C132 266 184 244 232 202C286 154 344 126 410 92C486 54 558 38 674 18" fill="none" stroke="#C9A84C" stroke-width="2" stroke-dasharray="10 8" opacity="0.95"/>
      <path d="M92 248H666" stroke="#7C8498" stroke-width="2" stroke-dasharray="5 7" opacity="0.7"/>
      <g>
        ${[98,132,168,206,250,294,340,386,432,482,532,584,636].map((x, i) => {
          const y = [244,226,214,188,168,148,132,116,98,84,70,56,42][i];
          const up = i % 3 !== 1;
          const bodyTop = up ? y - 22 : y - 6;
          const bodyBot = up ? y - 6 : y + 22;
          const col = up ? '#22C55E' : '#EF4444';
          return `<line x1="${x}" y1="${y-34}" x2="${x}" y2="${y+34}" stroke="${col}" stroke-width="3"/><rect x="${x-8}" y="${bodyTop}" width="16" height="${bodyBot-bodyTop}" fill="${col}"/>`;
        }).join('')}
      </g>
      <rect x="28" y="24" width="310" height="64" fill="#000" opacity="0.76" stroke="rgba(140,160,255,0.22)"/>
      <rect x="28" y="24" width="3" height="64" fill="${color}"/>
      <text x="46" y="50" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="17" font-weight="700">${title}</text>
      <text x="46" y="73" fill="#A8B0C2" font-family="Arial, sans-serif" font-size="13">${subtitle}</text>
    </svg>
  `)}`
});

const STRATEGY_TEMPLATES = [
  {
    id: 'trend-pullback',
    name: 'Trend Pullback',
    tagline: 'Buy/sell pullbacks in the direction of the higher-timeframe trend',
    description: 'A structured continuation playbook for joining an established trend after price temporarily retraces into value. The goal is not to predict a reversal or buy a random dip, but to wait for the higher-timeframe trend, the pullback location, and the execution trigger to align. The strategy works best when the market has a clear directional slope, clean swing structure, and enough room to the next liquidity or resistance area to justify at least a 2R target.',
    tags: ['Trend Following', 'Multi-Timeframe', 'Intermediate'],
    icon: '🎯',
    markets: ['forex','crypto','stocks'],
    timeframes: ['1h','4h'],
    groups: [
      { name:'TREND', description:'This group defines the directional environment. Before looking for any entry, the higher timeframe must show that institutions are already marking price in one direction. The 4H chart should have a visible slope, price should respect dynamic support or resistance, and the most recent swings should not look compressed or random. If this section is unclear, the rest of the setup is skipped because pullback entries have poor expectancy inside sideways chop.', images:[templateDemoImage('4H Trend Context','Trend filter, slope, and market structure', '#2643F7')], conditions:[
        { status:'mandatory', label:'Price above 200 EMA on 4H', description:'For long setups, price must be trading above the 200 EMA on the 4H chart and the average should be flat-to-rising or clearly rising. The 200 EMA is used as a regime filter, not as an entry level. If price is repeatedly crossing above and below it, the market is not trending enough for this template. For short setups, mirror the rule and require price below a flat-to-falling or falling 200 EMA.', images:[templateDemoImage('200 EMA Regime Filter','Only trade with the dominant 4H trend', '#2643F7')] },
        { status:'mandatory', label:'ADX > 25 on 4H', description:'ADX should be above 25 to confirm that the move has directional strength rather than random drift. The exact value is less important than the message: momentum must be expanding or already established. If ADX is below 20, pullbacks often fail because there is no dominant force to resume the move. If ADX is extremely extended, wait for a controlled pullback rather than entering after exhaustion.', images:[templateDemoImage('ADX Trend Strength','Avoid weak or range-bound conditions', '#22C55E')] },
        { status:'optional',  label:'Higher highs and higher lows on 4H', description:'This is optional but strongly preferred. A clean sequence of higher highs and higher lows confirms that buyers are defending progressively higher prices. The cleanest long setups occur when the pullback forms a higher low near dynamic support before continuation. For shorts, look for lower highs and lower lows. If swing structure is messy, reduce size or require stronger confirmation from the entry group.', images:[templateDemoImage('Swing Structure','Higher highs and higher lows confirm trend quality', '#7C3AED')] },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'PULLBACK', description:'This group defines the location of the trade. The strategy only becomes interesting when price retraces into a value area inside the trend, ideally near the 20 EMA or a prior breakout zone. The pullback should look controlled, not impulsive against the trend. The purpose is to avoid buying strength after the move has already expanded and instead enter when risk can be defined tightly around a fresh higher low or lower high.', images:[templateDemoImage('Controlled Pullback','Price returns to value without breaking trend structure', '#C9A84C')], conditions:[
        { status:'mandatory',  label:'Price pulls back to 20 EMA on 1H', description:'Price should retrace into the 1H 20 EMA zone or slightly through it, then begin to stabilize. The best pullbacks are shallow-to-moderate and happen after a clear impulse leg. Avoid entries where price is far above the EMA because the stop becomes too wide and the reward-to-risk deteriorates. For shorts, mirror this rule and look for price pulling back upward into the declining 20 EMA.', images:[templateDemoImage('20 EMA Pullback Zone','Dynamic support or resistance defines location', '#C9A84C')] },
        { status:'mandatory',  label:'RSI between 35-55 on 1H', description:'RSI should cool into the middle band, showing that momentum has reset without fully reversing the trend. For longs, 35-55 is ideal because it indicates a pullback but not deep bearish control. For shorts, use the mirrored 45-65 area. If RSI is still very high after a long impulse, the trade is probably late. If RSI collapses below the zone, the pullback may be turning into a trend change.', images:[templateDemoImage('Momentum Reset','RSI cools while trend structure remains intact', '#22C55E')] },
        { status:'invalidate', label:'Price moved more than 1.5R from pullback low', description:'If price has already launched more than 1.5R away from the pullback low before entry, the setup is considered missed. Chasing after the move expands creates poor stop placement and reduces the probability of reaching a clean 2R or 3R target. The correct response is to wait for another pullback or a new structure to form, not to force an entry because the direction was correct.', images:[templateDemoImage('Do Not Chase','Late entries destroy reward-to-risk', '#EF4444')] },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'ENTRY', description:'This group defines the exact trigger. A pullback into value is not enough by itself; price must show that the trend is likely resuming. The entry should happen only after a clear rejection or continuation candle closes in the trend direction. This prevents entering while the pullback is still active. News risk is treated as a hard filter because trendline and EMA pullbacks can be invalidated instantly by high-impact releases.', images:[templateDemoImage('Entry Confirmation','Wait for rejection and continuation from value', '#2643F7')], conditions:[
        { status:'mandatory',  label:'Bullish engulfing or pin bar (1H)', description:'At the pullback zone, the execution candle should show rejection of lower prices for longs, such as a bullish engulfing candle, a strong pin bar, or a clean rejection wick that closes back toward the highs. This candle is the first proof that buyers are defending the pullback. For shorts, use bearish engulfing or rejection from above. Weak inside candles, dojis in the middle of the range, or candles without location do not qualify.', images:[templateDemoImage('Reversal Candle','Confirmation must occur at the pullback zone', '#2643F7')] },
        { status:'mandatory',  label:'Close above prior candle high', description:'The confirmation candle should close above the prior candle high for long setups, proving that momentum is returning rather than merely pausing. This close also provides a clear buy-stop reference above the candle. For short setups, require a close below the prior candle low. If price wicks through the level but closes back inside the prior candle, wait for another signal instead of anticipating.', images:[templateDemoImage('Confirmation Close','Momentum closes beyond the prior candle', '#22C55E')] },
        { status:'invalidate', label:'Major news in next 30 minutes', description:'Do not enter if high-impact news for the instrument, base currency, sector, or index is scheduled within the next 30 minutes. The setup can look perfect technically and still fail from a liquidity shock. If the trade is already open before news, manage according to the risk plan. If not yet entered, stand aside and reassess after spreads and volatility normalize.', images:[templateDemoImage('News Filter','Avoid entering before high-impact releases', '#EF4444')] },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'liquidity-sweep-fvg',
    name: 'Liquidity Sweep + FVG',
    tagline: 'Trade reversals from liquidity grabs into fair value gaps',
    description: 'ICT / Smart Money framework: confirm higher-timeframe bias, wait for a liquidity sweep at a known pool, then enter on a retrace into a fresh fair value gap. Tight invalidation, asymmetric reward, repeatable in trending and ranging conditions.',
    tags: ['ICT/SMC', 'Reversal', 'Advanced'],
    icon: '🌊',
    markets: ['forex','crypto'],
    timeframes: ['5m','15m','4h'],
    groups: [
      { name:'HTF BIAS', description:'Establish the higher-timeframe directional bias so we only take sweeps that align with it.', conditions:[
        { status:'mandatory', label:'4H structure bullish (HH/HL) or bearish (LH/LL)', description:'Read the swing structure on 4H. Mixed structure = stand aside.' },
        { status:'mandatory', label:'Daily open above/below current price', description:'Daily open acts as a magnet. Bias longs below it, shorts above it.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'LIQUIDITY SWEEP', description:'Wait for a clean grab of resting liquidity at a recent swing. Invalid if it happens during news or the Asian range is incomplete.', conditions:[
        { status:'mandatory',  label:'Price sweeps recent swing low/high on 15m', description:'Liquidity grab is the trigger — price must trade through and close back through the swept level.' },
        { status:'mandatory',  label:'Close back through swept level within 3 candles', description:'If price doesn\'t reclaim within 3 candles, treat it as continuation, not a sweep.' },
        { status:'invalidate', label:'Sweep occurs during news event (±15 min)', description:'News-driven sweeps fail more often than they reverse.' },
        { status:'invalidate', label:'Asian session range incomplete', description:'No clean Asian range means no obvious liquidity pool. Trade is speculation, not setup.' },
      ], connectors:['AND','AND','AND','OFF','OFF'] },
      { name:'FVG ENTRY', description:'Enter on the retrace into the fair value gap created by the displacement away from the sweep. Skip if the gap is already filled.', conditions:[
        { status:'mandatory',  label:'FVG forms on 5m within 10 candles of sweep', description:'FVG must be formed by the displacement leaving the sweep. Older gaps are stale.' },
        { status:'mandatory',  label:'Price retraces into FVG midpoint', description:'Use the FVG midpoint as the entry trigger. Stop goes beyond the swept low/high.' },
        { status:'optional',   label:'Volume spike on the sweep candle', description:'Volume confirmation isn\'t required but materially improves win-rate.' },
        { status:'invalidate', label:'FVG fills more than 70% before entry', description:'A near-filled FVG offers no edge — skip.' },
      ], connectors:['AND','AND','AND','OFF','OFF'] },
    ],
  },
  {
    id: 'breakout-retest',
    name: 'Breakout & Retest',
    tagline: 'Enter on retests of consolidation breakouts',
    description: 'Wait for a clean range, confirm the breakout direction with volume, then enter on the retest of the broken level. Clear setups, defined risk, easy to backtest — ideal for traders who want consistency over creativity.',
    tags: ['Breakout', 'Momentum', 'Beginner-friendly'],
    icon: '🚀',
    markets: ['forex','crypto','stocks'],
    timeframes: ['1h'],
    groups: [
      { name:'CONSOLIDATION', description:'Identify a clean, tight range where energy is building before expansion.', conditions:[
        { status:'mandatory', label:'Price ranges within 1.5x ATR for 10+ candles on 1H', description:'Volatility compression — the longer the range, the bigger the break.' },
        { status:'mandatory', label:'Volume below 20-period average during range', description:'Low volume during range confirms accumulation rather than distribution.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'BREAKOUT', description:'A genuine breakout has volume and a clean close beyond the range — skip if it lines up with news.', conditions:[
        { status:'mandatory',  label:'Close beyond range by at least 0.3 ATR', description:'Closing-body break, not just a wick stop-hunt. ATR filter rejects noise.' },
        { status:'mandatory',  label:'Breakout candle volume above 20-period avg', description:'Volume = participation = sustainable move.' },
        { status:'invalidate', label:'Breakout coincides with major news release', description:'News-driven breakouts often fade quickly. Wait for the next setup.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'RETEST ENTRY', description:'Enter on the controlled retest of the broken level with a clear rejection candle. Skip if the retest fails.', conditions:[
        { status:'mandatory',  label:'Price returns to broken level within 5 candles', description:'Retest must come soon — late retests usually mean the break is failing.' },
        { status:'mandatory',  label:'Rejection candle at retest (pin bar / engulfing)', description:'Wait for visual confirmation that the broken level is now flipping support / resistance.' },
        { status:'invalidate', label:'Retest fails — close back inside the range', description:'If price closes back inside the original range, the breakout is dead.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'london-reversal',
    name: 'London Session Reversal',
    tagline: 'Fade Asian session extremes during London open',
    description: 'Watch for liquidity grabs at the Asian session high or low during the London opening hour and trade the reversal with tight invalidation. Works best on major FX pairs that respect session boundaries.',
    tags: ['Session-based', 'Mean Reversion', 'Forex'],
    icon: '🌅',
    markets: ['forex'],
    timeframes: ['15m','1h'],
    groups: [
      { name:'SESSION FILTER', description:'Restrict trading to the high-probability London open window — and step aside if news is incoming.', conditions:[
        { status:'mandatory',  label:'Current time within London (08:00–12:00 UTC)', description:'Setup is only valid during London hours; Asian / NY periods behave differently.' },
        { status:'mandatory',  label:'Within first 90 minutes of London open', description:'The reversal usually plays out in the first 90 minutes. After that, momentum shifts.' },
        { status:'invalidate', label:'High-impact news scheduled in next 30 min', description:'News can blow through the Asian extreme and your stop.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'ASIAN EXTREME', description:'Identify the Asian session high or low — that\'s where the stops sit and where the sweep will happen.', conditions:[
        { status:'mandatory', label:'Price touches Asian high/low in last 30 min', description:'Trade only fresh sweeps — older highs / lows are usually already engineered.' },
        { status:'mandatory', label:'Asian range ≥ 0.3× average daily range', description:'A meaningful Asian range is required for there to be tradable liquidity.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'REVERSAL SIGNAL', description:'Confirm the reversal with a rejection candle and momentum divergence. Skip if currency strength is showing continuation.', conditions:[
        { status:'mandatory',  label:'Rejection candle at Asian extreme (long wick)', description:'Long upper wick for shorts, long lower wick for longs.' },
        { status:'mandatory',  label:'RSI divergence on 15m', description:'Momentum failing at the extreme — classic reversal signal.' },
        { status:'optional',   label:'Failed retest of Asian extreme within 3 candles', description:'A quick failed retest dramatically improves the setup quality.' },
        { status:'invalidate', label:'Currency strength shows continuation, not reversal', description:'If both currencies in the pair are trending the same way, expect continuation.' },
      ], connectors:['AND','AND','AND','OFF','OFF'] },
    ],
  },
  {
    id: 'vwap-reclaim',
    name: 'VWAP Reclaim',
    tagline: 'Trade intraday reversals when price reclaims institutional fair value',
    description: 'Wait for an early session deviation below VWAP, confirm buyers reclaim the level with volume, then enter on the first controlled pullback. Best for liquid indices, futures, and large-cap stocks.',
    tags: ['VWAP', 'Intraday', 'Reclaim', 'Volume', 'Momentum', 'Mean Reversion', 'Session', 'Risk Defined', 'Liquid Markets', 'Intermediate'],
    icon: '📈',
    markets: ['futures','stocks'],
    timeframes: ['1m','5m','15m'],
    groups: [
      { name:'SESSION CONTEXT', description:'Only trade during liquid sessions where VWAP is respected.', conditions:[
        { status:'mandatory', label:'Regular session is open', description:'Avoid thin pre-market or illiquid overnight ranges.' },
        { status:'mandatory', label:'Instrument trades above average volume', description:'VWAP reclaim needs participation to follow through.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'RECLAIM', description:'Price must lose and then reclaim VWAP with intent.', conditions:[
        { status:'mandatory', label:'Price deviates below VWAP', description:'Creates trapped sellers and a clear reclaim level.' },
        { status:'mandatory', label:'Candle closes back above VWAP', description:'Close confirmation prevents buying a temporary wick.' },
        { status:'invalidate', label:'Reclaim occurs into major resistance', description:'Skip if there is no room to target.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'ENTRY', description:'Enter after reclaim holds and risk can be placed cleanly.', conditions:[
        { status:'mandatory', label:'Pullback holds VWAP as support', description:'VWAP should flip from resistance to support.' },
        { status:'optional', label:'Volume expands on reclaim candle', description:'Participation improves follow-through odds.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'opening-range-break',
    name: 'Opening Range Break',
    tagline: 'Capture expansion after the first range of the session is defined',
    description: 'Define the opening range, wait for compression near one boundary, then trade the first clean break with volume confirmation. Avoid mid-range entries and late-session false breaks.',
    tags: ['ORB', 'Breakout', 'Session', 'Momentum', 'Volume', 'Index Futures', 'Stocks', 'Structured', 'Beginner-friendly', 'Rules Based'],
    icon: '⏱️',
    markets: ['futures','stocks'],
    timeframes: ['1m','5m'],
    groups: [
      { name:'RANGE', description:'Build the opening range before looking for expansion.', conditions:[
        { status:'mandatory', label:'First 15 minutes completed', description:'Range must be fixed before breakout decisions.' },
        { status:'mandatory', label:'Opening range is not oversized', description:'Skip stretched opens where stop distance is too wide.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'BREAK', description:'Breakout must happen with momentum and location.', conditions:[
        { status:'mandatory', label:'Close outside opening range', description:'Use closing confirmation instead of wick breaks.' },
        { status:'mandatory', label:'Volume above session average', description:'Volume confirms real participation.' },
        { status:'invalidate', label:'Break happens after failed opposite break', description:'Avoid chop after both sides are swept.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'ema-ribbon-continuation',
    name: 'EMA Ribbon Continuation',
    tagline: 'Join persistent trends when moving averages compress and expand',
    description: 'Trade continuation after a clean EMA ribbon alignment, shallow pullback, and renewed momentum close. This template works best during directional markets with clear slope and spacing.',
    tags: ['EMA', 'Trend', 'Continuation', 'Pullback', 'Momentum', 'Multi-Timeframe', 'Swing', 'Forex', 'Crypto', 'Intermediate'],
    icon: '🧭',
    markets: ['forex','crypto','stocks'],
    timeframes: ['15m','1h','4h'],
    groups: [
      { name:'TREND FILTER', description:'Confirm directional alignment before considering entries.', conditions:[
        { status:'mandatory', label:'20 EMA above 50 EMA for longs', description:'Ribbon alignment defines the trend direction.' },
        { status:'mandatory', label:'Both EMAs slope with trade direction', description:'Flat averages indicate chop.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'PULLBACK', description:'Wait for price to reset without breaking trend structure.', conditions:[
        { status:'mandatory', label:'Pullback touches 20 EMA zone', description:'Entry location should be near dynamic support.' },
        { status:'invalidate', label:'Close beyond 50 EMA', description:'A deep close through the ribbon invalidates continuation.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'TRIGGER', description:'Enter when momentum returns from the pullback.', conditions:[
        { status:'mandatory', label:'Strong close away from 20 EMA', description:'Momentum candle confirms buyers or sellers are back.' },
        { status:'optional', label:'Higher timeframe agrees', description:'Alignment across timeframes improves quality.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'range-fade',
    name: 'Range Fade',
    tagline: 'Fade clean range extremes when volatility stays contained',
    description: 'Identify a mature range, wait for price to test an outer boundary, and enter only after rejection back into value. The edge comes from avoiding trend days and respecting invalidation quickly.',
    tags: ['Range', 'Mean Reversion', 'Support Resistance', 'Rejection', 'Low Volatility', 'Forex', 'Indices', 'Risk Defined', 'Patient', 'Beginner-friendly'],
    icon: '↔️',
    markets: ['forex','futures','stocks'],
    timeframes: ['15m','1h'],
    groups: [
      { name:'RANGE QUALITY', description:'Confirm market is contained before fading extremes.', conditions:[
        { status:'mandatory', label:'At least three touches on range boundaries', description:'Range should be visible and respected.' },
        { status:'mandatory', label:'ATR is below recent average', description:'Lower volatility supports mean reversion.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'REJECTION', description:'Enter only after the extreme rejects.', conditions:[
        { status:'mandatory', label:'Wick through range high or low', description:'Liquidity is taken beyond the boundary.' },
        { status:'mandatory', label:'Close back inside range', description:'Confirms failed breakout.' },
        { status:'invalidate', label:'Full candle closes outside range', description:'Treat as breakout, not fade.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'news-continuation',
    name: 'News Continuation',
    tagline: 'Trade post-news continuation after the first volatility spike settles',
    description: 'Avoid the initial news candle, let spread and direction normalize, then join the continuation only if price holds above the reaction midpoint. Designed for disciplined event trading.',
    tags: ['News', 'Continuation', 'Volatility', 'Event Driven', 'Spread Filter', 'Momentum', 'Forex', 'Stocks', 'Fast Execution', 'Advanced'],
    icon: '📰',
    markets: ['forex','stocks','futures'],
    timeframes: ['1m','5m','15m'],
    groups: [
      { name:'EVENT FILTER', description:'Confirm the event is worth trading and conditions are tradable.', conditions:[
        { status:'mandatory', label:'High-impact event just released', description:'Strategy only applies after meaningful catalysts.' },
        { status:'mandatory', label:'Spread has normalized', description:'Avoid entering while execution quality is poor.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'CONTINUATION', description:'Wait for direction to hold after the initial spike.', conditions:[
        { status:'mandatory', label:'Price holds reaction midpoint', description:'Midpoint hold shows continuation pressure.' },
        { status:'mandatory', label:'Second impulse breaks event high or low', description:'Confirms continuation after digestion.' },
        { status:'invalidate', label:'Price fully retraces the news candle', description:'Retrace means the reaction failed.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'daily-level-rejection',
    name: 'Daily Level Rejection',
    tagline: 'Trade clean reactions at prior day high, low, or close',
    description: 'Mark important daily levels, wait for a controlled test, then enter only after rejection and confirmation on the execution timeframe. Works across liquid markets with visible daily structure.',
    tags: ['Daily Levels', 'Rejection', 'Price Action', 'Support Resistance', 'Session', 'Multi-Timeframe', 'Forex', 'Futures', 'Stocks', 'Discretionary'],
    icon: '📍',
    markets: ['forex','futures','stocks'],
    timeframes: ['5m','15m','1h'],
    groups: [
      { name:'LEVEL SELECTION', description:'Use only levels that are obvious and recent.', conditions:[
        { status:'mandatory', label:'Prior day high, low, or close is nearby', description:'Trade around levels other traders are watching.' },
        { status:'optional', label:'Level aligns with weekly structure', description:'Confluence improves reaction quality.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'REACTION', description:'Wait for price to prove the level matters.', conditions:[
        { status:'mandatory', label:'Price tests level and rejects', description:'Need visible rejection from the level.' },
        { status:'mandatory', label:'Confirmation candle closes away from level', description:'Avoid entering on first touch alone.' },
        { status:'invalidate', label:'Level breaks and retests from other side', description:'Flip bias if the level turns into continuation.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'crypto-funding-squeeze',
    name: 'Crypto Funding Squeeze',
    tagline: 'Fade crowded perpetual positioning when price rejects extremes',
    description: 'Use funding and liquidation context to identify crowded positioning, then trade the squeeze only after price rejects a key level and momentum confirms. Designed for volatile crypto conditions.',
    tags: ['Crypto', 'Funding', 'Squeeze', 'Liquidations', 'Contrarian', 'Volatility', 'Momentum Shift', 'Perpetuals', 'Risk Defined', 'Advanced'],
    icon: '₿',
    markets: ['crypto'],
    timeframes: ['5m','15m','1h'],
    groups: [
      { name:'POSITIONING', description:'Confirm the market is crowded before fading it.', conditions:[
        { status:'mandatory', label:'Funding is elevated in one direction', description:'Crowded positioning creates squeeze risk.' },
        { status:'mandatory', label:'Price is extended from intraday VWAP', description:'Extension gives the squeeze room to mean revert.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'SQUEEZE TRIGGER', description:'Wait for the trapped side to lose control.', conditions:[
        { status:'mandatory', label:'Sweep of local high or low', description:'Liquidity grab triggers trapped entries.' },
        { status:'mandatory', label:'Fast reclaim back through swept level', description:'Reclaim confirms squeeze pressure.' },
        { status:'invalidate', label:'Open interest rises with continuation', description:'Crowd may still be right; skip the fade.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'earnings-gap-go',
    name: 'Earnings Gap & Go',
    tagline: 'Trade post-earnings continuation when the gap holds above value',
    description: 'After earnings, trade continuation only if price holds the gap direction, avoids full fade, and breaks the early session high with volume. Designed for liquid stocks with strong catalysts.',
    tags: ['Earnings', 'Gap', 'Stocks', 'Catalyst', 'Momentum', 'Volume', 'Opening Range', 'Continuation', 'Large Cap', 'Event Driven'],
    icon: '💼',
    markets: ['stocks'],
    timeframes: ['5m','15m','1h'],
    groups: [
      { name:'CATALYST', description:'Confirm the gap is catalyst-backed and liquid.', conditions:[
        { status:'mandatory', label:'Earnings released before session', description:'The gap must be tied to a known catalyst.' },
        { status:'mandatory', label:'Volume is above normal', description:'Institutional participation matters.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'GAP HOLD', description:'Continuation requires the gap to hold.', conditions:[
        { status:'mandatory', label:'Price holds above opening range midpoint', description:'Midpoint hold shows buyers defending the gap.' },
        { status:'mandatory', label:'Breaks opening range high', description:'Confirms continuation instead of fade.' },
        { status:'invalidate', label:'Gap fills before entry', description:'A filled gap means momentum failed.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'order-block-continuation',
    name: 'Order Block Continuation',
    tagline: 'Join continuation from defended institutional demand or supply zones',
    description: 'Identify a clean displacement leg, mark the last opposing candle as the order block, and trade only when price returns with a controlled pullback. The setup is designed for traders who want structure-based entries without chasing momentum after the move has already expanded.',
    tags: ['Order Block', 'Continuation', 'ICT/SMC', 'Pullback', 'Displacement', 'Trend', 'Forex', 'Crypto', 'Intermediate', 'Risk Defined'],
    icon: '🧱',
    markets: ['forex','crypto','futures'],
    timeframes: ['15m','1h','4h'],
    groups: [
      { name:'DISPLACEMENT', description:'Start with a strong move that leaves obvious imbalance and creates a defendable zone.', conditions:[
        { status:'mandatory', label:'Impulse candle breaks prior structure', description:'The displacement must close beyond a meaningful swing, not just wick through it.' },
        { status:'mandatory', label:'Fair value gap remains after displacement', description:'Imbalance confirms urgency and gives the pullback a reason to react.' },
        { status:'invalidate', label:'Displacement candle closes into major opposing level', description:'Skip if the move runs directly into strong opposing structure.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'ORDER BLOCK TEST', description:'Wait for price to revisit the origin of displacement without destroying the structure.', conditions:[
        { status:'mandatory', label:'Price returns to last opposing candle body', description:'The entry zone is the body of the candle before the displacement leg.' },
        { status:'mandatory', label:'Pullback arrives with smaller candles', description:'Controlled retrace is preferred; aggressive counter-momentum reduces quality.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'CONFIRMATION', description:'Only enter after the zone shows active defense.', conditions:[
        { status:'mandatory', label:'Rejection candle closes away from order block', description:'The close confirms buyers or sellers defended the zone.' },
        { status:'optional', label:'Lower timeframe structure shifts back with bias', description:'A micro break improves timing and tightens risk.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'failed-breakout-trap',
    name: 'Failed Breakout Trap',
    tagline: 'Fade breakouts that fail back inside the prior range',
    description: 'Let price break a well-defined range, wait for trapped traders to be exposed, then enter only after price accepts back inside value. This strategy is built around clean invalidation and fast recognition of false continuation.',
    tags: ['Failed Breakout', 'Trap', 'Mean Reversion', 'Range', 'Liquidity', 'Price Action', 'Forex', 'Futures', 'Stocks', 'Intermediate'],
    icon: '🪤',
    markets: ['forex','futures','stocks'],
    timeframes: ['5m','15m','1h'],
    groups: [
      { name:'RANGE BUILD', description:'Define a visible range with enough touches for breakout traders to care about it.', conditions:[
        { status:'mandatory', label:'Range has at least two clean highs and lows', description:'The boundary must be obvious so breakout liquidity is meaningful.' },
        { status:'mandatory', label:'Range midpoint is respected', description:'A respected midpoint confirms the market has accepted the range.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'TRAP', description:'The breakout must fail quickly and force late traders to exit.', conditions:[
        { status:'mandatory', label:'Breakout closes back inside range within 3 candles', description:'Fast failure shows breakout participation is trapped.' },
        { status:'mandatory', label:'Failed break occurs after liquidity sweep', description:'A sweep beyond the boundary creates the best reversal fuel.' },
        { status:'invalidate', label:'Second candle expands outside range', description:'Strong continuation after the break means the trap failed.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'ENTRY CONFIRMATION', description:'Enter after price proves it is accepting back inside the range.', conditions:[
        { status:'mandatory', label:'Retest of broken boundary fails', description:'The old breakout level should reject continuation.' },
        { status:'optional', label:'Momentum divergence at breakout extreme', description:'Divergence adds confidence that the break lacked strength.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'opening-drive-pullback',
    name: 'Opening Drive Pullback',
    tagline: 'Join the first strong session drive after a controlled reset',
    description: 'Trade with the opening drive when the first impulse is clean, broad market participation supports direction, and price pulls back into a shallow value zone. Designed for index futures and liquid stocks during the first hour.',
    tags: ['Opening Drive', 'Pullback', 'Momentum', 'Session', 'Volume', 'Index Futures', 'Stocks', 'Scalping', 'Trend Day', 'Fast Execution'],
    icon: '⚡',
    markets: ['futures','stocks'],
    timeframes: ['1m','5m','15m'],
    groups: [
      { name:'OPENING DRIVE', description:'Confirm the market opens with decisive direction and participation.', conditions:[
        { status:'mandatory', label:'First 10 minutes forms one-sided drive', description:'The open should have clear directional pressure, not overlapping chop.' },
        { status:'mandatory', label:'Volume is above session average', description:'Participation confirms the drive is meaningful.' },
        { status:'invalidate', label:'Price immediately reclaims session open against bias', description:'A failed open drive removes the continuation thesis.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'PULLBACK QUALITY', description:'Wait for a shallow reset instead of chasing the first impulse.', conditions:[
        { status:'mandatory', label:'Pullback holds above drive midpoint', description:'The midpoint should act as value support for longs or resistance for shorts.' },
        { status:'mandatory', label:'Candles compress during pullback', description:'Compression shows counter-pressure is weak.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'RESUMPTION', description:'Enter only when the opening drive resumes.', conditions:[
        { status:'mandatory', label:'Break of pullback trendline with volume', description:'The break confirms the reset is ending.' },
        { status:'optional', label:'Market internals support direction', description:'Breadth or sector confirmation improves follow-through.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'fibonacci-confluence-swing',
    name: 'Fibonacci Confluence Swing',
    tagline: 'Swing trade trend pullbacks at fib and structure confluence',
    description: 'Use higher-timeframe trend structure, Fibonacci retracement zones, and nearby support or resistance to plan patient swing entries. The template focuses on quality location and avoids trades where reward is blocked by nearby structure.',
    tags: ['Fibonacci', 'Swing', 'Trend', 'Confluence', 'Support Resistance', 'Multi-Timeframe', 'Forex', 'Stocks', 'Crypto', 'Patient'],
    icon: '🌀',
    markets: ['forex','stocks','crypto'],
    timeframes: ['4h','1d','1w'],
    groups: [
      { name:'SWING CONTEXT', description:'Trade only in a clear higher-timeframe swing environment.', conditions:[
        { status:'mandatory', label:'Daily trend structure is clear', description:'Use higher highs/lows for longs or lower highs/lows for shorts.' },
        { status:'mandatory', label:'Weekly level does not block target', description:'Avoid entries directly into major weekly resistance or support.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'CONFLUENCE ZONE', description:'Build a zone where multiple tools point to the same area.', conditions:[
        { status:'mandatory', label:'Price pulls into 50-61.8% retracement', description:'The fib zone should align with a normal trend pullback.' },
        { status:'mandatory', label:'Retracement overlaps prior structure', description:'Old resistance becoming support, or old support becoming resistance, improves location.' },
        { status:'optional', label:'Round number or session level nearby', description:'A nearby psychological level adds reaction potential.' },
      ], connectors:['AND','AND','AND','OFF','OFF'] },
      { name:'SWING TRIGGER', description:'Wait for evidence the pullback is ending.', conditions:[
        { status:'mandatory', label:'Daily or 4H rejection candle forms in zone', description:'Confirmation should happen at the confluence zone, not after price has already run.' },
        { status:'invalidate', label:'Close beyond 78.6% retracement', description:'Deep retracement weakens continuation and invalidates the setup.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'vwap-trend-day',
    name: 'VWAP Trend Day',
    tagline: 'Hold trend-day bias while price respects VWAP and upper/lower bands',
    description: 'Identify sessions where price opens with directional conviction and repeatedly respects VWAP or its bands. The strategy avoids mean reversion and instead adds on controlled pullbacks during strong intraday trend conditions.',
    tags: ['VWAP', 'Trend Day', 'Intraday', 'Momentum', 'Volume', 'Futures', 'Stocks', 'Session', 'Continuation', 'Intermediate'],
    icon: '📊',
    markets: ['futures','stocks'],
    timeframes: ['1m','5m','15m'],
    groups: [
      { name:'TREND DAY FILTER', description:'Confirm the session is acting like a trend day before taking continuation setups.', conditions:[
        { status:'mandatory', label:'Price holds one side of VWAP after open', description:'Trend days rarely cross VWAP repeatedly.' },
        { status:'mandatory', label:'Opening range breaks in trend direction', description:'The early range should expand with the bias.' },
        { status:'invalidate', label:'Two clean closes through VWAP', description:'Repeated VWAP crosses suggest balance, not trend.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'PULLBACK', description:'Use VWAP or bands as value zones during the trend.', conditions:[
        { status:'mandatory', label:'Pullback holds VWAP or first band', description:'The value zone should reject counter-trend pressure.' },
        { status:'mandatory', label:'Volume dries up during pullback', description:'Lower volume on pullback confirms weak opposition.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'CONTINUATION', description:'Enter when price resumes toward the trend extreme.', conditions:[
        { status:'mandatory', label:'Candle closes back toward session high or low', description:'The close confirms trend pressure is returning.' },
        { status:'optional', label:'Sector or index basket confirms direction', description:'Broad confirmation improves trend-day reliability.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
    ],
  },
  {
    id: 'pre-market-high-low-break',
    name: 'Pre-Market High/Low Break',
    tagline: 'Trade continuation when regular session accepts beyond pre-market extremes',
    description: 'Mark the pre-market high and low, wait for regular-session acceptance beyond one side, then enter after a controlled retest. The setup is clean for stocks and index futures where overnight levels attract liquidity.',
    tags: ['Pre-Market', 'Breakout', 'Stocks', 'Futures', 'Session', 'Liquidity', 'Retest', 'Momentum', 'Opening Range', 'Rules Based'],
    icon: '🌐',
    markets: ['stocks','futures'],
    timeframes: ['1m','5m','15m'],
    groups: [
      { name:'LEVEL MAP', description:'Define pre-market levels before the regular session starts.', conditions:[
        { status:'mandatory', label:'Pre-market high and low are clear', description:'Avoid messy overnight ranges with too many overlapping extremes.' },
        { status:'mandatory', label:'Pre-market volume is meaningful', description:'Levels matter more when there was actual participation.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
      { name:'ACCEPTANCE', description:'The regular session must accept beyond the level rather than just sweep it.', conditions:[
        { status:'mandatory', label:'Regular-session candle closes beyond pre-market level', description:'Close confirmation filters wick-only stop runs.' },
        { status:'mandatory', label:'Retest holds the broken level', description:'The level should flip support/resistance before entry.' },
        { status:'invalidate', label:'Close returns inside pre-market range', description:'Back inside the range means acceptance failed.' },
      ], connectors:['AND','AND','OFF','OFF','OFF'] },
      { name:'CONTINUATION ENTRY', description:'Join continuation after the level holds.', conditions:[
        { status:'mandatory', label:'Break of retest candle in breakout direction', description:'Use the retest candle as the trigger and risk reference.' },
        { status:'optional', label:'Relative volume above 1.5x', description:'Higher relative volume improves follow-through odds.' },
      ], connectors:['AND','OFF','OFF','OFF','OFF'] },
    ],
  },
].map(t => ({...t, groups:[...t.groups, executionRiskGroupForTemplate(t.id)]}));

function executionRiskGroupForTemplate(id) {
  const map = {
    'trend-pullback': [
      ['Entry trigger: buy stop above confirmation candle high', 'Use a stop order above the reversal candle high for longs; mirror below the candle low for shorts.'],
      ['Order type: stop-market after confirmation close', 'Place the order only after the candle closes and the pullback setup remains valid.'],
      ['Stop placement: beyond pullback swing low/high', 'Stop goes outside the pullback structure, not inside the EMA zone.'],
      ['Targets: first target at 2R, trail remainder behind 20 EMA', 'Secure partial profit at 2R and let continuation run while the trend structure holds.'],
    ],
    'liquidity-sweep-fvg': [
      ['Entry trigger: limit order at FVG midpoint', 'Enter on retrace into the fresh FVG midpoint after the swept level has reclaimed.'],
      ['Order type: limit order inside the fair value gap', 'Use a limit order for precision; skip if price does not retrace cleanly.'],
      ['Stop placement: beyond swept high/low', 'Stop sits outside the liquidity sweep so normal FVG retests do not shake it out.'],
      ['Targets: opposing liquidity pool or 3R minimum', 'Target the next obvious liquidity pool; require at least 3R if the pool is close.'],
    ],
    'breakout-retest': [
      ['Entry trigger: retest rejection closes away from broken level', 'Enter after the retest confirms the old range boundary has flipped.'],
      ['Order type: limit at retest zone or stop above rejection candle', 'Use a limit if price returns to the level, or a stop order after the rejection candle closes.'],
      ['Stop placement: back inside the original range', 'Stop invalidates if price accepts back inside the pre-breakout range.'],
      ['Targets: measured range projection then 2R runner', 'First target equals the range height; keep remainder only if momentum continues.'],
    ],
    'london-reversal': [
      ['Entry trigger: rejection candle after Asian extreme sweep', 'Enter after price sweeps the Asian high/low and closes back into the range.'],
      ['Order type: market or stop-market after rejection close', 'Use confirmation entry rather than anticipating the sweep.'],
      ['Stop placement: beyond swept Asian extreme', 'Stop goes outside the sweep wick with a small spread buffer.'],
      ['Targets: Asian midpoint first, opposite range extreme second', 'Take partials at the midpoint and final target near the other side of the Asian range.'],
    ],
    'vwap-reclaim': [
      ['Entry trigger: pullback holds VWAP after reclaim', 'Enter when price retests VWAP from above and buyers defend it.'],
      ['Order type: limit at VWAP retest or stop above reclaim candle', 'Prefer limit entry at VWAP; use stop order if momentum does not retest.'],
      ['Stop placement: below reclaim swing low', 'Stop sits under the reclaim low or under VWAP with a volatility buffer.'],
      ['Targets: session high first, 2R or upper band second', 'Take first profit at session high and final profit at 2R or VWAP upper band.'],
    ],
    'opening-range-break': [
      ['Entry trigger: close outside opening range with volume', 'Enter only after a closing break, not a wick through the range.'],
      ['Order type: stop-market beyond opening range boundary', 'Place stop order above range high for longs or below range low for shorts.'],
      ['Stop placement: opposite side of opening range or midpoint', 'Use the range midpoint for tight setups; opposite boundary for wider structure.'],
      ['Targets: 1R partial then opening range measured move', 'Take partial at 1R and target the range-height projection for the runner.'],
    ],
    'ema-ribbon-continuation': [
      ['Entry trigger: continuation candle closes away from EMA ribbon', 'Enter after the pullback resolves in the direction of the ribbon.'],
      ['Order type: stop-market beyond continuation candle', 'Use stop order to confirm momentum is actually returning.'],
      ['Stop placement: beyond 50 EMA or pullback swing', 'Stop invalidates if price breaks the ribbon structure.'],
      ['Targets: 2R first, trail behind 20 EMA', 'Take partial at 2R and trail the rest while the 20 EMA holds.'],
    ],
    'range-fade': [
      ['Entry trigger: close back inside range after boundary sweep', 'Enter only after failed breakout confirmation back into the range.'],
      ['Order type: market after rejection close or limit near boundary', 'Use market confirmation or a limit on a shallow retest of the rejected boundary.'],
      ['Stop placement: outside the swept range extreme', 'Stop sits beyond the wick that swept liquidity outside the range.'],
      ['Targets: range midpoint first, opposite boundary second', 'Take partial at midpoint and final target near the opposite side of the range.'],
    ],
    'news-continuation': [
      ['Entry trigger: second impulse breaks news reaction high/low', 'Enter only after the market digests the first spike and continues.'],
      ['Order type: stop-market beyond post-news impulse', 'Use stop order so continuation confirms before entry.'],
      ['Stop placement: below/above reaction midpoint', 'Stop invalidates if price loses the midpoint of the news reaction.'],
      ['Targets: 1.5R partial, next intraday liquidity level final', 'Take partial quickly because volatility can reverse; final target is next liquidity level.'],
    ],
    'daily-level-rejection': [
      ['Entry trigger: confirmation candle rejects daily level', 'Enter after price tests the level and closes away with clear rejection.'],
      ['Order type: stop-market beyond confirmation candle', 'Use confirmation entry to avoid catching the first touch.'],
      ['Stop placement: beyond daily level and rejection wick', 'Stop sits outside the level with enough buffer for normal retests.'],
      ['Targets: nearest intraday level first, 2R second', 'Take partial at the nearest structure and require at least 2R for final target.'],
    ],
    'crypto-funding-squeeze': [
      ['Entry trigger: fast reclaim after sweep against crowded side', 'Enter when price reclaims the swept level and trapped positioning starts unwinding.'],
      ['Order type: stop-market through reclaim trigger', 'Use stop-market for speed; crypto squeezes often move without deep retests.'],
      ['Stop placement: beyond liquidation sweep extreme', 'Stop goes beyond the sweep wick where the squeeze thesis is invalid.'],
      ['Targets: VWAP first, next liquidation cluster second', 'Take partial at VWAP and target the next cluster or 3R for the runner.'],
    ],
    'earnings-gap-go': [
      ['Entry trigger: break of opening range high after gap holds', 'Enter after the stock holds the gap and clears the early high with volume.'],
      ['Order type: stop-market above opening range high', 'Use stop entry to confirm post-earnings momentum.'],
      ['Stop placement: below opening range midpoint or gap hold low', 'Stop invalidates if the gap hold structure fails.'],
      ['Targets: 1R partial, premarket extension or daily ATR final', 'Take partial at 1R and use premarket extension/daily ATR for final target.'],
    ],
    'order-block-continuation': [
      ['Entry trigger: rejection from order block after controlled return', 'Enter only after price returns to the order block and closes away from the zone.'],
      ['Order type: limit inside order block or stop beyond rejection candle', 'Use limit for precision inside the zone, or stop entry if confirmation is needed.'],
      ['Stop placement: beyond full order block and sweep wick', 'Stop sits where the zone is invalidated, not at the midpoint of the block.'],
      ['Targets: prior impulse high/low first, next liquidity pool second', 'Take partial at the prior impulse extreme and final target at opposing liquidity.'],
    ],
    'failed-breakout-trap': [
      ['Entry trigger: failed breakout closes back inside range', 'Enter after price accepts back inside the range and traps breakout traders.'],
      ['Order type: market after failure close or limit at boundary retest', 'Use market confirmation or wait for a retest of the failed breakout boundary.'],
      ['Stop placement: beyond breakout extreme', 'Stop goes outside the failed breakout wick where the trap thesis is wrong.'],
      ['Targets: range midpoint first, opposite range boundary second', 'Take partial at midpoint and target the other side of the range if momentum continues.'],
    ],
    'opening-drive-pullback': [
      ['Entry trigger: break of pullback structure in drive direction', 'Enter when the controlled pullback breaks back with the opening drive.'],
      ['Order type: stop-market beyond pullback trigger candle', 'Use stop entry to avoid anticipating the drive resumption.'],
      ['Stop placement: below/above pullback low/high or drive midpoint', 'Stop invalidates if price loses the pullback structure or drive midpoint.'],
      ['Targets: opening drive extreme first, measured continuation second', 'Take partial at the prior drive extreme and target measured continuation for the runner.'],
    ],
    'fibonacci-confluence-swing': [
      ['Entry trigger: 4H or daily rejection from fib confluence zone', 'Enter after the confluence zone rejects and closes with trend direction.'],
      ['Order type: limit inside zone or stop beyond rejection candle', 'Use limit for planned zone entries or stop confirmation after rejection.'],
      ['Stop placement: beyond 78.6% retracement or structural swing', 'Stop goes past the level where continuation is no longer likely.'],
      ['Targets: prior swing extreme first, extension level second', 'Take partial at the prior high/low and final target at 1.272 or 1.618 extension.'],
    ],
    'vwap-trend-day': [
      ['Entry trigger: pullback holds VWAP/band and closes with trend', 'Enter after price respects the VWAP value zone and resumes in trend direction.'],
      ['Order type: limit at VWAP retest or stop beyond continuation candle', 'Use limit on the retest or stop entry if the trend resumes without filling.'],
      ['Stop placement: opposite side of VWAP/band value zone', 'Stop invalidates when price accepts through the value zone.'],
      ['Targets: session extreme first, outer VWAP band or 2R second', 'Take partial at the session high/low and final near the outer band or fixed R target.'],
    ],
    'pre-market-high-low-break': [
      ['Entry trigger: retest of pre-market level holds after acceptance', 'Enter after regular-session price closes beyond the level and retests it successfully.'],
      ['Order type: stop-market through retest candle', 'Use stop entry to confirm continuation away from the pre-market level.'],
      ['Stop placement: back inside pre-market range', 'Stop invalidates if price accepts back inside the overnight range.'],
      ['Targets: opening range projection first, daily ATR level second', 'Take partial at the projected opening range move and final near the daily ATR extension.'],
    ],
  };
  const rows = map[id] || [
    ['Entry trigger: confirmed setup trigger', 'Enter only after the template setup confirms on the execution timeframe.'],
    ['Order type: defined market, limit, or stop order', 'Choose the order type before execution and avoid improvising during the trade.'],
    ['Stop placement: beyond invalidation structure', 'Stop goes where the trade idea is proven wrong, not at an arbitrary amount.'],
    ['Targets: predefined partial and final levels', 'Plan at least one partial target and one final target before entry.'],
  ];
  return {
    name:'EXECUTION & RISK',
    description:'Define exactly how to enter, what order type to use, where the stop belongs, and where targets should be placed.',
    conditions: rows.map(([label, description]) => ({ status:'mandatory', label, description })),
    connectors:['AND','AND','AND','OFF','OFF'],
  };
}

function buildNodesFromTemplate(template) {
  const sections = [];
  const conds = [];
  const stamp = Date.now();
  template.groups.forEach((group, gi) => {
    const colorScheme = SECTION_COLOR_CYCLE[gi % SECTION_COLOR_CYCLE.length];
    const sectionId = `sec_${stamp}_${gi}`;
    const filledSlots = [];
    (group.conditions || []).slice(0, COND_COLS).forEach((cond, ci) => {
      filledSlots.push(ci);
      conds.push({
        id: `cond_${stamp}_${gi}_${ci}`,
        type: 'condition',
        position: { x: 0, y: 0 },
        style: { width: COND_W, height: COND_H },
        draggable: true, selectable: false, dragHandle: '.tlc-drag-grip',
        data: {
          label: cond.label || 'New condition',
          description: cond.description || '',
          images: Array.isArray(cond.images) ? cond.images : [],
          sectionId, slot: ci,
          status: cond.status || 'mandatory',
          sectionColor: colorScheme.ac,
        },
      });
    });
    sections.push({
      id: sectionId, type: 'section',
      position: { x: SEC_X, y: gi * (SEC_H + SEC_GAP) },
      style: { width: SEC_W, height: SEC_H },
      width: SEC_W, height: SEC_H,
      draggable: false, selectable: false, focusable: false,
      data: { ...colorScheme, sectionId, label: group.name, description: group.description || '', images: Array.isArray(group.images) ? group.images : [], condCount: filledSlots.length, filledSlots, connectors: group.connectors || Array(COND_COLS - 1).fill('AND') },
      zIndex: -1,
    });
  });
  return restackAll([...sections, ...conds]);
}

/* ── Template Picker Modal ── */
const TemplatePickerModal = ({ open, c, F, onPick, onCancel, hasExistingGroups }) => {
  const [selectedId, setSelectedId] = React.useState(null);
  const [hovered, setHovered] = React.useState(null);
  const [confirmReplace, setConfirmReplace] = React.useState(false);
  const [actionHov, setActionHov] = React.useState(null);
  const [actionPress, setActionPress] = React.useState(null);

  React.useEffect(() => {
    if (!open) { setSelectedId(null); setConfirmReplace(false); }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  const allOptions = [
    ...STRATEGY_TEMPLATES,
    { id:'__blank', name:'Create your own', tagline:'', description:'', tags:[], icon:'➕', groups:[] },
  ];

  const commit = () => {
    if (!selectedId) return;
    if (hasExistingGroups && !confirmReplace) { setConfirmReplace(true); return; }
    const tpl = selectedId === '__blank' ? null : STRATEGY_TEMPLATES.find(t => t.id === selectedId);
    onPick(tpl);
  };

  const statsOf = (tpl) => {
    const groups = tpl.groups.length;
    let normal=0, inv=0, opt=0;
    tpl.groups.forEach(g => g.conditions.forEach(c => {
      if (c.status === 'invalidate') inv++;
      else if (c.status === 'optional') opt++;
      else normal++;
    }));
    const conds = normal + inv + opt;
    return `${groups} groups · ${conds} conditions · ${inv} invalidators · ${opt} optional`;
  };

  const IconFor = ({ name }) => (
    <span style={{fontSize:22,lineHeight:1,flexShrink:0,filter:'saturate(1.1)'}}>{name}</span>
  );

  const Card = ({ tpl, isBlank }) => {
    const selected = selectedId === tpl.id;
    const hov = hovered === tpl.id;
    const FieldLabel = ({ children }) => (
      <div style={{fontSize:9,fontWeight:900,color:c.tm,letterSpacing:'0.08em',textTransform:'uppercase',fontFamily:F,lineHeight:1}}>{children}</div>
    );
    const Pill = ({ children, accent }) => (
      <span style={{
        position:'relative',height:22,display:'inline-flex',alignItems:'center',padding:'0 4px 5px',
        fontSize:11,fontWeight:800,color:c.ts,letterSpacing:'0.035em',
        background:'transparent',border:'none',fontFamily:F,textTransform:'uppercase'
      }}>
        {children}
        <span style={{
          position:'absolute',left:0,right:0,bottom:1,height:1.5,
          background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,
          boxShadow:`0 0 5px ${c.acG}`,
          opacity:accent?0.95:0.7
        }}/>
      </span>
    );
    if (isBlank) {
      const blankBg = selected
        ? `linear-gradient(135deg,${c.ac},${c.acL})`
        : hov ? `linear-gradient(135deg,${c.acL},#6A8AFF)` : `linear-gradient(135deg,${c.ac},${c.acL})`;
      return (
        <div
          onClick={()=>setSelectedId(tpl.id)}
          onDoubleClick={()=>{ setSelectedId(tpl.id); setTimeout(commit, 50); }}
          onMouseEnter={()=>setHovered(tpl.id)} onMouseLeave={()=>setHovered(null)}
          style={{
            position:'relative', height:54, padding:'0 18px',
            background:blankBg, border:`1px solid ${selected||hov?c.acL:'rgba(74,106,255,0.5)'}`,
            cursor:'default', userSelect:'none',
            display:'flex', alignItems:'center', justifyContent:'center', gap:9,
            boxShadow: hov ? '0 2px 14px rgba(38,67,247,0.5)' : '0 2px 8px rgba(38,67,247,0.25)',
            transition:'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
          }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
            <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          <span style={{fontSize:13,fontWeight:800,color:'#fff',fontFamily:F,letterSpacing:'0.04em',textTransform:'uppercase'}}>Create Your Own</span>
        </div>
      );
    }
    const marketLabels = (tpl.markets||[]).map(m=>(MKT_CAT_OPTS.find(x=>x.id===m)?.label||m));
    const tfLabels = tpl.timeframes||[];
    return (
      <div
        onClick={()=>setSelectedId(tpl.id)}
        onDoubleClick={()=>{ setSelectedId(tpl.id); setTimeout(commit, 50); }}
        onMouseEnter={()=>setHovered(tpl.id)} onMouseLeave={()=>setHovered(null)}
        style={{
          position:'relative', minHeight:316, padding:0, overflow:'hidden',
          background:selected?'rgba(38,67,247,0.07)':hov?'rgba(140,160,255,0.045)':c.sf,
          border:`1px solid ${selected?c.acL:hov?c.brH:c.br}`,
          cursor:'default', userSelect:'none',
          boxShadow:selected?`0 0 0 1px ${c.acB}, 0 0 18px rgba(38,67,247,0.18)`:hov?'0 8px 22px rgba(0,0,0,0.32)':'none',
          transition:'background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease',
          display:'flex', flexDirection:'column',
        }}>
        <div style={{height:2,background:c.acL,boxShadow:`0 0 6px ${c.acG}`,flexShrink:0}}/>
        {selected && <div style={{position:'absolute',left:0,top:10,bottom:10,width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
        <div style={{padding:'15px 15px 16px',display:'flex',flexDirection:'column',gap:15,flex:1,minHeight:0}}>
          <div style={{display:'grid',gridTemplateColumns:'30px minmax(0,1fr) auto',alignItems:'center',gap:10}}>
            <div style={{width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',background:c.hv2,border:`1px solid ${selected?c.acB:c.brH}`}}>
              <IconFor name={tpl.icon}/>
            </div>
            <div style={{fontSize:16,fontWeight:850,color:c.tx,fontFamily:F,letterSpacing:'0.02em',lineHeight:1.15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tpl.name}</div>
            <div style={{height:20,padding:'0 8px',display:'flex',alignItems:'center',fontSize:9,fontWeight:900,color:selected?c.acL:c.tm,fontFamily:F,letterSpacing:'0.08em',textTransform:'uppercase',border:`1px solid ${selected?c.acB:c.br}`,background:selected?c.acD:'rgba(140,160,255,0.025)'}}>
              {selected?'Selected':'Template'}
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            <FieldLabel>Description</FieldLabel>
            <div style={{minHeight:64,fontSize:12,color:c.ts,fontFamily:F,lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:4,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{tpl.description}</div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{display:'flex',flexDirection:'column',gap:7,minWidth:0}}>
              <FieldLabel>Markets</FieldLabel>
              <div style={{display:'flex',gap:'5px 7px',flexWrap:'wrap',minHeight:21}}>
                {marketLabels.map(m => <Pill key={m}>{m}</Pill>)}
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:7,minWidth:0}}>
              <FieldLabel>Time Frames</FieldLabel>
              <div style={{display:'flex',gap:'5px 7px',flexWrap:'wrap',minHeight:21}}>
                {tfLabels.map(t => <Pill key={t}>{t}</Pill>)}
              </div>
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            <FieldLabel>Strategy Tags</FieldLabel>
            <div style={{display:'flex',gap:'6px 8px',flexWrap:'wrap',minHeight:76,alignContent:'flex-start'}}>
              {tpl.tags.map(t => <Pill key={t} accent>{t}</Pill>)}
            </div>
          </div>

        </div>
      </div>
    );
  };

  const blankTpl = allOptions[allOptions.length-1];

  return createPortal(
    <div onClick={e=>{if(e.target===e.currentTarget)onCancel();}}
      style={{position:'fixed',inset:0,zIndex:100050,background:'rgba(0,0,0,0.60)',
        display:'flex',alignItems:'center',justifyContent:'center',fontFamily:F,
        animation:'tlrCpIn 0.15s ease'}}>
      <div onClick={e=>e.stopPropagation()}
        style={{width:'min(920px,94vw)',maxHeight:'84vh',display:'flex',flexDirection:'column',
          background:c.bg,border:`1px solid ${c.brH}`,
          boxShadow:'0 32px 96px rgba(0,0,0,0.9), 0 0 0 1px rgba(140,160,255,0.13)',
          overflow:'hidden'}}>
        <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
        {/* Header */}
        <div style={{flexShrink:0,padding:'12px 18px',borderBottom:`1px solid ${c.brH}`,display:'flex',alignItems:'center',gap:10}}>
          <img src="/LOGO-07.png" alt="" style={{width:34,height:34,objectFit:'contain',flexShrink:0,display:'block'}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:c.tx,fontFamily:F,letterSpacing:'0.02em'}}>Choose a Strategy Template</div>
            <div style={{fontSize:9,color:c.tm,fontFamily:F,marginTop:2}}>Start from a proven framework or build from scratch</div>
          </div>
          <div onClick={onCancel}
            style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'default',color:c.tm,borderRadius:0,transition:'color 0.12s, background 0.12s, transform 0.08s',flexShrink:0}}
            onMouseEnter={e=>{e.currentTarget.style.color=c.rd;e.currentTarget.style.background='rgba(255,80,104,0.08)';}}
            onMouseLeave={e=>{e.currentTarget.style.color=c.tm;e.currentTarget.style.background='transparent';e.currentTarget.style.transform='scale(1)';}}
            onMouseDown={e=>{e.currentTarget.style.transform='scale(0.92)';}}
            onMouseUp={e=>{e.currentTarget.style.transform='scale(1)';}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
        </div>
        {/* Body */}
        <div className="tlr-scroll" style={{flex:1,overflowY:'auto',padding:'14px 18px 18px',minHeight:0}}>
          <div style={{fontSize:9,fontWeight:850,color:c.tm,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10,fontFamily:F}}>Templates</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:12}}>
            {STRATEGY_TEMPLATES.map(t => <Card key={t.id} tpl={t}/>)}
          </div>

          {confirmReplace && (
            <div style={{marginTop:12,padding:'10px 12px',background:'rgba(255,80,104,0.06)',border:`1px solid rgba(255,80,104,0.30)`,fontSize:10,color:c.ts,fontFamily:F,lineHeight:1.5}}>
              Loading this template will replace your current groups. Click <strong style={{color:c.tx}}>Use Template</strong> again to confirm.
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{flexShrink:0,padding:'10px 18px',borderTop:`1px solid ${c.brH}`,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button onClick={onCancel}
              style={{padding:'0 14px',height:32,minWidth:78,boxSizing:'border-box',background:c.hv2,border:`1px solid rgba(140,160,255,0.22)`,color:c.ts,fontSize:11,fontWeight:700,fontFamily:F,letterSpacing:'0.04em',textTransform:'uppercase',cursor:'default',transition:'background 0.12s, border-color 0.12s, color 0.12s, transform 0.08s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(140,160,255,0.07)';e.currentTarget.style.borderColor='rgba(140,160,255,0.4)';e.currentTarget.style.color=c.tx;}}
              onMouseLeave={e=>{e.currentTarget.style.background=c.hv2;e.currentTarget.style.borderColor='rgba(140,160,255,0.22)';e.currentTarget.style.color=c.ts;e.currentTarget.style.transform='scale(1)';}}
              onMouseDown={e=>{e.currentTarget.style.transform='scale(0.97)';}}
              onMouseUp={e=>{e.currentTarget.style.transform='scale(1)';}}>
              Cancel
            </button>
            <button onClick={()=>onPick(null)}
              style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,padding:'0 14px',height:32,minWidth:136,boxSizing:'border-box',
                background:actionHov==='tpl-create'?`linear-gradient(135deg,${c.acL},#6A8AFF)`:`linear-gradient(135deg,${c.ac},${c.acL})`,
                border:`1px solid rgba(74,106,255,0.5)`,color:'#fff',
                fontSize:11,fontWeight:800,fontFamily:F,letterSpacing:'0.05em',textTransform:'uppercase',
                cursor:'default',boxShadow:actionHov==='tpl-create'?'0 2px 14px rgba(38,67,247,0.5)':'0 2px 8px rgba(38,67,247,0.25)',
                transform:actionPress==='tpl-create'?'scale(0.97)':'scale(1)',
                transition:'background 0.12s, box-shadow 0.12s, transform 0.08s'}}
              onMouseEnter={()=>setActionHov('tpl-create')}
              onMouseLeave={()=>{setActionHov(null);setActionPress(null);}}
              onMouseDown={()=>setActionPress('tpl-create')}
              onMouseUp={()=>setActionPress(null)}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
                <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
              </svg>
              Create Your Own
            </button>
            <button onClick={commit} disabled={!selectedId}
              style={{padding:'0 16px',height:32,minWidth:120,boxSizing:'border-box',
                background:selectedId?`linear-gradient(135deg,${c.ac},${c.acL})`:'rgba(140,160,255,0.10)',
                border:`1px solid ${selectedId?'rgba(74,106,255,0.5)':'rgba(140,160,255,0.18)'}`,
                color:selectedId?'#fff':c.tm,fontSize:11,fontWeight:800,fontFamily:F,letterSpacing:'0.06em',textTransform:'uppercase',
                cursor:'default',opacity:selectedId?1:0.55,
                boxShadow:selectedId?'0 2px 8px rgba(38,67,247,0.25)':'none',
                transition:'background 0.12s, box-shadow 0.12s, filter 0.12s, transform 0.08s'}}
              onMouseEnter={e=>{if(selectedId){e.currentTarget.style.background=`linear-gradient(135deg,${c.acL},#6A8AFF)`;e.currentTarget.style.boxShadow='0 2px 14px rgba(38,67,247,0.5)';}}}
              onMouseLeave={e=>{if(selectedId){e.currentTarget.style.background=`linear-gradient(135deg,${c.ac},${c.acL})`;e.currentTarget.style.boxShadow='0 2px 8px rgba(38,67,247,0.25)';e.currentTarget.style.filter='brightness(1)';e.currentTarget.style.transform='scale(1)';}}}
              onMouseDown={e=>{if(selectedId){e.currentTarget.style.filter='brightness(0.9)';e.currentTarget.style.transform='scale(0.97)';}}}
              onMouseUp={e=>{if(selectedId){e.currentTarget.style.filter='brightness(1)';e.currentTarget.style.transform='scale(1)';}}}>
              {hasExistingGroups && confirmReplace ? 'Replace' : 'Use Template'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const CanvasScrollbar = ({ rfTransform, contentBotGraph, canvasH, rfRef }) => {
  const zoom = rfTransform[2], vpY = rfTransform[1];
  const contentHScreen = contentBotGraph * zoom;
  if (!canvasH || contentHScreen <= canvasH) return null;
  const trackH = canvasH - 12;
  const thumbFrac = Math.min(1, canvasH / contentHScreen);
  const thumbH = Math.max(28, thumbFrac * trackH);
  const scrollableGraph = contentBotGraph - canvasH / zoom;
  const scrollFrac = Math.min(1, Math.max(0, (-vpY / zoom) / scrollableGraph));
  const thumbTop = 6 + scrollFrac * (trackH - thumbH);
  const onThumbDown = (e) => {
    e.stopPropagation();
    const startY = e.clientY, startFrac = scrollFrac;
    const onMove = (ev) => {
      const newFrac = Math.max(0, Math.min(1, startFrac + (ev.clientY - startY) / (trackH - thumbH)));
      rfRef.current?.setViewport({ x: rfTransform[0], y: -(newFrac * scrollableGraph * zoom), zoom });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  return (
    <div style={{position:'absolute',right:3,top:6,bottom:6,width:4,borderRadius:2,background:'rgba(255,255,255,0.06)',pointerEvents:'all',zIndex:20}}>
      <div
        onPointerDown={onThumbDown}
        style={{position:'absolute',top:thumbTop,height:thumbH,width:'100%',borderRadius:2,background:'rgba(255,255,255,0.25)',cursor:'default',transition:'background 0.1s'}}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.45)'}
        onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.25)'}
      />
    </div>
  );
};

const CanvasHScrollbar = ({ rfTransform, contentWidthGraph, canvasW, rfRef }) => {
  const zoom = rfTransform[2];
  const vpX = rfTransform[0];
  const padX = 28;
  const contentWScreen = contentWidthGraph * zoom;
  if (!canvasW || contentWScreen <= canvasW) return null;
  const maxVpX = padX - SEC_X * zoom;
  const minVpX = canvasW - padX - contentWidthGraph * zoom;
  const scrollRange = maxVpX - minVpX;
  if (scrollRange <= 1) return null;
  const scrollFrac = Math.min(1, Math.max(0, (maxVpX - vpX) / scrollRange));
  const trackW = canvasW - 24;
  const thumbFrac = Math.min(1, canvasW / contentWScreen);
  const thumbW = Math.max(28, thumbFrac * trackW);
  const thumbLeft = 6 + scrollFrac * (trackW - thumbW);
  const onThumbDown = (e) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startFrac = scrollFrac;
    const onMove = (ev) => {
      const newFrac = Math.max(0, Math.min(1, startFrac + (ev.clientX - startX) / (trackW - thumbW)));
      rfRef.current?.setViewport({ x: maxVpX - newFrac * scrollRange, y: rfTransform[1], zoom });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  return (
    <div
      style={{
        position: 'absolute', left: 6, right: 18, bottom: 6, height: 4,
        borderRadius: 2, background: 'rgba(255,255,255,0.06)',
        pointerEvents: 'all', zIndex: 20,
      }}
    >
      <div
        onPointerDown={onThumbDown}
        style={{
          position: 'absolute', left: thumbLeft, width: thumbW, height: '100%',
          borderRadius: 2, background: 'rgba(255,255,255,0.25)', cursor: 'default',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.45)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
      />
    </div>
  );
};

function StrategyCanvasWorkspaceInner({ c, F, canvasNodes, setCanvasNodes, canvasEdges, setCanvasEdges, stratBName, setStratBName, stratBDesc, setStratBDesc, setStratBMarkets, setStratBTimeframes, setStratBTags, stratEditId, onSave, onClose, canvasMiniMap, setCanvasMiniMap, canvasPaletteCollapsed, setCanvasPaletteCollapsed, canvasInspectorCollapsed, setCanvasInspectorCollapsed, step, goPrev, goNext, secondaryBtnStyle, primaryBtnStyle, onSecondaryEnter, onSecondaryLeave, onSecondaryDown, onSecondaryUp, onPrimaryEnter, onPrimaryLeave, onPrimaryDown, onPrimaryUp }) {
  const rfRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [history, setHistory] = useState([{ nodes:[], edges:[] }]);
  const [histIdx, setHistIdx] = useState(0);
  const [btnHov, setBtnHov] = useState(null);
  const [outlinePress, setOutlinePress] = useState(null);
  const [outlineStatusOpen, setOutlineStatusOpen] = useState(null);
  const [outlineTip, setOutlineTip] = useState(null);
  const [outlineImagePreview, setOutlineImagePreview] = useState(null);
  const outlineTipTimerRef = useRef(null);
  const [canvasH, setCanvasH] = useState(0);
  const [canvasW, setCanvasW] = useState(0);
  const [sliding, setSliding] = useState(false);
  const rfTransform = useStore(s => s.transform);
  const rfNodeInternals = useStore(s => s.nodeInternals);
  const [descPanelOpen, setDescPanelOpen] = useState(false);
  const scrollValuesRef = useRef({ canvasH: 0, canvasW: 0, contentBotGraph: 0, contentWidthGraph: 0 });
  const dragStartRef = useRef(null);
  const liveOrderRef = useRef([]);
  const gapDataRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const canvasNodesRef = useRef([]);
  const [rfNodesEl, setRfNodesEl] = useState(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateToast, setTemplateToast] = useState(null);
  const [flowViewMode, setFlowViewMode] = useState('board');
  const [outlineZoom, setOutlineZoom] = useState(1);

  useLayoutEffect(() => {
    if (!document.querySelector('link[href*="Exo+2"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(link);
    }
    let style = document.getElementById('tlc-canvas-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tlc-canvas-css';
      document.head.appendChild(style);
    }
    style.textContent = [
      '.react-flow__pane{cursor:default!important}',
      '.react-flow__node{cursor:default!important}',
      '.react-flow__node-section{pointer-events:all!important;overflow:visible!important}',
      '.react-flow__node-condition{pointer-events:all!important}',
      '.tlc-drag-grip,.tlc-drag-grip *{cursor:grab!important}',
      '.tlc-drag-grip:active{transform:translateY(-50%) scale(1.06)!important}',
      '.tlc-dragging,.tlc-dragging *{cursor:grabbing!important}',
      '.tlc-dragging .tlc-graph-sep{pointer-events:none!important}',
      '.tlc-sec-dragging{transition:none!important;filter:drop-shadow(0 10px 28px rgba(0,0,0,0.45))}',
      '.tlc-sliding .react-flow__node-section:not(.tlc-sec-dragging),.tlc-sliding .react-flow__node-condition{transition:transform 0.38s cubic-bezier(0.22,1,0.36,1)!important}',
      '@keyframes tlcSecOut{from{opacity:1;transform:scaleY(1) translateY(0)}to{opacity:0;transform:scaleY(0.65) translateY(-14px)}}',
      '.tlc-sec-deleting{animation:tlcSecOut 0.28s cubic-bezier(0.4,0,1,1) forwards;transform-origin:top center;pointer-events:none}',
    ].join('');
  }, []);

  const hasExistingGroups = canvasNodes.some(n => n.type === 'condition');

  const loadTemplate = useCallback((tpl) => {
    if (!tpl) {
      setCanvasNodes(buildInitialSections());
      setCanvasEdges([]);
    } else {
      setCanvasNodes(buildNodesFromTemplate(tpl));
      setCanvasEdges([]);
      if (setStratBName && (!stratBName || !stratBName.trim())) {
        setStratBName(`${tpl.name} (my version)`);
      }
      if (setStratBDesc && tpl.description) setStratBDesc(tpl.description);
      if (setStratBMarkets && tpl.markets && tpl.markets.length) setStratBMarkets(tpl.markets);
      if (setStratBTimeframes && tpl.timeframes && tpl.timeframes.length) setStratBTimeframes(tpl.timeframes);
      if (setStratBTags && tpl.tags && tpl.tags.length) setStratBTags(tpl.tags);
      setTemplateToast(`Template '${tpl.name}' loaded — customize as needed`);
      setTimeout(() => setTemplateToast(null), 4000);
    }
    setTemplatePickerOpen(false);
  }, [setCanvasNodes, setCanvasEdges, setStratBName, stratBName, setStratBDesc, setStratBMarkets, setStratBTimeframes, setStratBTags]);

  const applySecSize = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w === 0) return;
    const pad = 48;
    const zoomForWidth = Math.max(BOARD_ZOOM_MIN, Math.min(BOARD_ZOOM_MAX, (w - pad) / FLOW_ROW_GRAPH_W));
    const newW = Math.max(FLOW_ROW_GRAPH_W, (w - pad) / zoomForWidth);
    const newX = Math.max(8, (newW - FLOW_ROW_GRAPH_W) * 0.5);
    if (newW !== SEC_W || newX !== SEC_X) {
      SEC_W = newW;
      SEC_X = newX;
      setCanvasNodes(nds => restackAll(nds));
    }
  }, [setCanvasNodes]);

  const fitBoardViewport = useCallback((animate = false) => {
    const inst = rfRef.current;
    const el = canvasContainerRef.current;
    if (!inst || !el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 8 || h < 8) return;

    const { contentBotGraph: graphH } = scrollValuesRef.current;
    const graphW = SEC_X + SEC_W;
    const graphHeight = Math.max(graphH || SEC_H + SEC_GAP, SEC_H + SEC_GAP);
    const padX = 28;
    const padY = 20;

    const zoomX = (w - padX) / Math.max(graphW, FLOW_ROW_GRAPH_W);
    const zoomY = (h - padY) / graphHeight;
    const zoom = Math.max(BOARD_ZOOM_MIN, Math.min(BOARD_ZOOM_MAX, Math.min(zoomX, zoomY)));

    const centerX = SEC_X + SEC_W / 2;
    const x = w / 2 - centerX * zoom;
    const scaledH = graphHeight * zoom;
    const y = scaledH <= h - padY * 2
      ? (h - scaledH) / 2
      : padY;

    inst.setViewport({ x, y, zoom }, animate ? { duration: 280 } : undefined);
  }, []);

  useLayoutEffect(() => { applySecSize(); }, []);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setCanvasH(rect.height);
      setCanvasW(rect.width);
      applySecSize();
      requestAnimationFrame(() => fitBoardViewport(false));
    });
    ro.observe(el);
    const t1 = setTimeout(() => { applySecSize(); fitBoardViewport(false); }, 120);
    const t2 = setTimeout(() => fitBoardViewport(true), 320);
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [applySecSize, fitBoardViewport]);

  useEffect(() => {
    if (step !== 2 || flowViewMode !== 'board') return;
    const t = setTimeout(() => fitBoardViewport(true), 80);
    return () => clearTimeout(t);
  }, [step, flowViewMode, canvasNodes.length, fitBoardViewport]);

  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    if (canvasNodes.length === 0) {
      const initNodes = buildInitialSections();
      setCanvasNodes(initNodes);
      setHistory([{ nodes: initNodes, edges: [] }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushHistory = useCallback((nodes, edges) => {
    setHistory(prev => [...prev.slice(0, histIdx + 1), { nodes, edges }]);
    setHistIdx(prev => prev + 1);
  }, [histIdx]);

  const onNodesChange = useCallback((changes) => {
    const filtered = changes.filter(c => {
      const cid = c.id || c.item?.id || '';
      if (String(cid).startsWith('gap_')) return false;
      return true;
    });
    if (filtered.length === 0) return;
    setCanvasNodes(nds => applyNodeChanges(filtered, nds));
  }, [setCanvasNodes]);

  const onEdgesChange = useCallback((changes) => {
    setCanvasEdges(eds => applyEdgeChanges(changes, eds));
  }, [setCanvasEdges]);

  const onConnect = useCallback((params) => {
    setCanvasEdges(eds => {
      const next = addEdge({ ...params, type:'talEdge', markerEnd:{ type:MarkerType.ArrowClosed, color:'var(--tlc-brh)' } }, eds);
      pushHistory(canvasNodes, next);
      return next;
    });
  }, [setCanvasEdges, canvasNodes, pushHistory]);

  const onSelectionChange = useCallback(({ nodes, edges }) => {
    setSelectedIds([...nodes.map(n=>n.id), ...edges.map(e=>e.id)]);
  }, []);

  const onPaneClick = useCallback(() => setSelectedIds([]), []);

  const onInit = useCallback((instance) => {
    rfRef.current = instance;
    const el = canvasContainerRef.current?.querySelector('.react-flow__nodes');
    if (el) setRfNodesEl(el);
    requestAnimationFrame(() => {
      applySecSize();
      fitBoardViewport(false);
    });
  }, [applySecSize, fitBoardViewport]);

  const addConditionToSection = useCallback((sectionId, targetSlot) => {
    setSliding(true);
    setCanvasNodes(nds => {
      const section = nds.find(n => n.id === sectionId);
      if (!section) return nds;
      const existingConds = nds.filter(n => n.type === 'condition' && n.data?.sectionId === sectionId);
      const filled = new Set(existingConds.map(c => c.data?.slot ?? -1));
      if (filled.size >= COND_COLS) return nds;
      let slot = (typeof targetSlot === 'number' && targetSlot >= 0 && targetSlot < COND_COLS && !filled.has(targetSlot))
        ? targetSlot
        : -1;
      if (slot < 0) {
        for (let i = 0; i < COND_COLS; i++) { if (!filled.has(i)) { slot = i; break; } }
      }
      if (slot < 0) return nds;
      const newFilled = [...filled, slot].sort((a,b)=>a-b);
      const newCount = newFilled.length;
      const newCond = {
        id: `cond_${Date.now()}`,
        type: 'condition',
        position: { x: 0, y: 0 },
        style: { width: COND_W, height: COND_H },
        draggable: true, selectable: false,
        dragHandle: '.tlc-drag-grip',
        data: { label: 'New condition', description: '', images: [], sectionId, slot, sectionColor: section.data.ac },
      };
      const updated = nds
        .map(n => n.id === sectionId ? { ...n, data: { ...n.data, condCount: newCount, filledSlots: newFilled }, style: { ...n.style, height: SEC_H } } : n)
        .concat([newCond]);
      return restackAll(updated);
    });
    setTimeout(() => setSliding(false), 350);
  }, [setCanvasNodes, setSliding]);

  const deleteCondition = useCallback((condId) => {
    setSliding(true);
    setCanvasNodes(nds => {
      const cond = nds.find(n => n.id === condId);
      if (!cond) return nds;
      const sectionId = cond.data.sectionId;
      const section = nds.find(n => n.id === sectionId);
      if (!section) return nds.filter(n => n.id !== condId);
      const remainingConds = nds.filter(n => n.type === 'condition' && n.data?.sectionId === sectionId && n.id !== condId);
      const newFilled = remainingConds.map(c => c.data?.slot ?? -1).filter(s => s >= 0).sort((a,b)=>a-b);
      const updated = nds
        .filter(n => n.id !== condId)
        .map(n => n.id === sectionId ? { ...n, data: { ...n.data, condCount: newFilled.length, filledSlots: newFilled }, style: { ...n.style, height: SEC_H } } : n);
      return restackAll(updated);
    });
    setTimeout(() => setSliding(false), 350);
  }, [setCanvasNodes, setSliding]);

  const updateConditionData = useCallback((condId, updates) => {
    setCanvasNodes(nds => nds.map(n => n.id === condId ? { ...n, data: { ...n.data, ...updates } } : n));
  }, [setCanvasNodes]);

  const addSection = useCallback(() => {
    setCanvasNodes(nds => {
      const sections = nds.filter(n => n.type === 'section');
      if (sections.length >= 10) return nds;
      const maxY = sections.length > 0
        ? Math.max(...sections.map(s => s.position.y + (s.style?.height ?? SEC_H))) + SEC_GAP
        : 0;
      const colorScheme = SECTION_COLOR_CYCLE[sections.length % SECTION_COLOR_CYCLE.length];
      const id = `sec_${Date.now()}`;
      setTimeout(() => {
        if (rfRef.current) {
          const { zoom } = rfRef.current.getViewport();
          rfRef.current.setCenter(SEC_W / 2, maxY + getSectionHeight(0) / 2, { zoom, duration: 250 });
        }
      }, 50);
      return [...nds, {
        id, type: 'section',
        position: { x: SEC_X, y: maxY },
        style: { width: SEC_W, height: getSectionHeight(0) },
        width: SEC_W, height: getSectionHeight(0),
        draggable: false, selectable: false, focusable: false,
        data: { ...colorScheme, sectionId: id, label: 'NEW GROUP', condCount: 0 },
        zIndex: -1,
      }];
    });
  }, [setCanvasNodes]);

  const insertSectionAtStart = useCallback(() => {
    setSliding(true);
    requestAnimationFrame(() => {
      setCanvasNodes(nds => {
        if (nds.filter(n => n.type === 'section').length >= 10) return nds;
        const id = `sec_${Date.now()}`;
        const newH = getSectionHeight(0);
        const shift = newH + SEC_GAP;
        const colorScheme = SECTION_COLOR_CYCLE[nds.filter(n=>n.type==='section').length % SECTION_COLOR_CYCLE.length];
        const shifted = nds.map(n =>
          (n.type === 'section' || n.type === 'condition')
            ? { ...n, position: { ...n.position, y: n.position.y + shift } }
            : n
        );
        return [{ id, type:'section', position:{x:0,y:0}, style:{width:SEC_W,height:newH},
          width:SEC_W, height:newH,
          draggable:false, selectable:false, focusable:false,
          data:{ ...colorScheme, sectionId:id, label:'NEW GROUP', condCount:0 }, zIndex:-1,
        }, ...shifted];
      });
      setTimeout(() => setSliding(false), 350);
    });
  }, [setCanvasNodes]);

  const doDeleteSection = useCallback((sectionId) => {
    setSliding(true);
    requestAnimationFrame(() => {
      setCanvasNodes(nds => {
        const secs = nds.filter(n => n.type === 'section').sort((a, b) => a.position.y - b.position.y);
        const idx = secs.findIndex(s => s.id === sectionId);
        const deletedH = idx >= 0 ? (secs[idx].style?.height ?? SEC_H) : SEC_H;
        const shift = deletedH + SEC_GAP;
        const shiftedSecIds = idx >= 0 ? new Set(secs.slice(idx + 1).map(s => s.id)) : new Set();
        return nds.map(n => {
          if (n.id === sectionId) return { ...n, data: { ...n.data, deleting: true } };
          if (n.type === 'section' && shiftedSecIds.has(n.id))
            return { ...n, position: { ...n.position, y: n.position.y - shift } };
          if (n.type === 'condition' && shiftedSecIds.has(n.data?.sectionId))
            return { ...n, position: { ...n.position, y: n.position.y - shift } };
          return n;
        });
      });
      setTimeout(() => {
        setSliding(false);
        setCanvasNodes(nds => {
          const condIds = nds.filter(n => n.type === 'condition' && n.data?.sectionId === sectionId).map(n => n.id);
          setCanvasEdges(eds => eds.filter(e => !condIds.includes(e.source) && !condIds.includes(e.target)));
          return nds.filter(n => n.id !== sectionId && n.data?.sectionId !== sectionId);
        });
      }, 320);
    });
  }, [setCanvasNodes, setCanvasEdges]);

  const insertSectionAfter = useCallback((afterSectionId) => {
    setSliding(true);
    requestAnimationFrame(() => {
      setCanvasNodes(nds => {
        const secs = nds.filter(n => n.type === 'section').sort((a, b) => a.position.y - b.position.y);
        if (secs.length >= 10) return nds;
        const afterIdx = secs.findIndex(s => s.id === afterSectionId);
        if (afterIdx < 0) return nds;
        const colorScheme = SECTION_COLOR_CYCLE[secs.length % SECTION_COLOR_CYCLE.length];
        const id = `sec_${Date.now()}`;
        const newH = getSectionHeight(0);
        const insertY = secs[afterIdx].position.y + (secs[afterIdx].style?.height ?? SEC_H) + SEC_GAP;
        const shift = newH + SEC_GAP;
        const shiftedSecIds = new Set(secs.slice(afterIdx + 1).map(s => s.id));
        const updated = nds.map(n => {
          if (n.type === 'section' && shiftedSecIds.has(n.id))
            return { ...n, position: { ...n.position, y: n.position.y + shift } };
          if (n.type === 'condition' && shiftedSecIds.has(n.data?.sectionId))
            return { ...n, position: { ...n.position, y: n.position.y + shift } };
          return n;
        });
        return [...updated, {
          id, type: 'section',
          position: { x: SEC_X, y: insertY },
          style: { width: SEC_W, height: newH },
          width: SEC_W, height: newH,
          draggable: false, selectable: false, focusable: false,
          data: { sectionId: id, label: 'NEW GROUP', condCount: 0 },
          zIndex: -1,
        }];
      });
      setTimeout(() => setSliding(false), 350);
    });
  }, [setCanvasNodes]);

  const deleteSelected = useCallback(() => {
    const toDelete = selectedIds.filter(id => {
      const node = canvasNodes.find(n => n.id === id);
      return !node || node.type !== 'section';
    });
    if (toDelete.length === 0) return;
    const nextNodes = canvasNodes.filter(n => !toDelete.includes(n.id));
    const nextEdges = canvasEdges.filter(e => !toDelete.includes(e.id) && !toDelete.includes(e.source) && !toDelete.includes(e.target));
    const finalNodes = nextNodes.map(n => {
      if (n.type !== 'section') return n;
      const cnt = nextNodes.filter(x => x.type === 'condition' && x.data?.sectionId === n.id).length;
      return { ...n, data: { ...n.data, condCount: cnt }, style: { ...n.style, height: getSectionHeight(cnt) }, height: getSectionHeight(cnt) };
    });
    setCanvasNodes(finalNodes);
    setCanvasEdges(nextEdges);
    pushHistory(finalNodes, nextEdges);
    setSelectedIds([]);
  }, [selectedIds, canvasNodes, canvasEdges, setCanvasNodes, setCanvasEdges, pushHistory]);

  const shortcutsRef = useRef({});
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      const r = shortcutsRef.current;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); r.undo && r.undo(); }
      else if ((mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')))) { e.preventDefault(); r.redo && r.redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && r.hasSel) { e.preventDefault(); r.del && r.del(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const doUndo = useCallback(() => {
    if (histIdx <= 0) return;
    const prev = history[histIdx - 1];
    setCanvasNodes(prev.nodes); setCanvasEdges(prev.edges);
    setHistIdx(i => i - 1);
  }, [history, histIdx, setCanvasNodes, setCanvasEdges]);

  const doRedo = useCallback(() => {
    if (histIdx >= history.length - 1) return;
    const next = history[histIdx + 1];
    setCanvasNodes(next.nodes); setCanvasEdges(next.edges);
    setHistIdx(i => i + 1);
  }, [history, histIdx, setCanvasNodes, setCanvasEdges]);

  const doFit = useCallback(() => {
    fitBoardViewport(true);
  }, [fitBoardViewport]);

  const fitViewTimerRef = useRef(null);
  const requestFitView = useCallback(() => {
    if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current);
    fitViewTimerRef.current = setTimeout(() => {
      fitViewTimerRef.current = null;
      fitBoardViewport(true);
    }, 60);
  }, [fitBoardViewport]);

  const applyBoardZoom = useCallback((nextZoom, animate = true) => {
    if (!rfRef.current) return;
    const el = canvasContainerRef.current;
    const { x, y, zoom } = rfRef.current.getViewport();
    const z = Math.max(BOARD_ZOOM_MIN, Math.min(BOARD_ZOOM_MAX, nextZoom));
    if (!el) {
      rfRef.current.setViewport({ x, y, zoom: z }, animate ? { duration: 180 } : undefined);
      return;
    }
    const centerGraphY = (el.clientHeight / 2 - y) / zoom;
    const boardCenterX = SEC_X + SEC_W / 2;
    rfRef.current.setViewport({
      x: el.clientWidth / 2 - boardCenterX * z,
      y: el.clientHeight / 2 - centerGraphY * z,
      zoom: z,
    }, animate ? { duration: 180 } : undefined);
  }, []);

  const setBoardZoom = useCallback((direction) => {
    if (!rfRef.current) return;
    const { zoom } = rfRef.current.getViewport();
    applyBoardZoom(parseFloat((zoom + direction * 0.1).toFixed(2)));
  }, [applyBoardZoom]);

  const setOutlineZoomBy = useCallback((direction) => {
    setOutlineZoom(z => Math.max(0.75, Math.min(1.25, parseFloat((z + direction * 0.05).toFixed(2)))));
  }, []);

  const updateNodeData = useCallback((nodeId, patch) => {
    setCanvasNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
  }, [setCanvasNodes]);

  const selectedNode = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    return canvasNodes.find(n => n.id === selectedIds[0] && n.type === 'condition') || null;
  }, [selectedIds, canvasNodes]);

  const renameSection = useCallback((sectionId, newLabel, newH) => {
    setCanvasNodes(nds => {
      if (newH === undefined) {
        return nds.map(n => n.id === sectionId ? { ...n, data: { ...n.data, label: newLabel } } : n);
      }
      const secs = nds.filter(n => n.type === 'section').sort((a,b) => a.position.y - b.position.y);
      const idx = secs.findIndex(s => s.id === sectionId);
      if (idx < 0) return nds.map(n => n.id === sectionId ? { ...n, data: { ...n.data, label: newLabel } } : n);
      const oldH = secs[idx].style?.height ?? SEC_H;
      const delta = newH - oldH;
      const shiftedSecIds = new Set(secs.slice(idx + 1).map(s => s.id));
      return nds.map(n => {
        if (n.id === sectionId) return { ...n, data: { ...n.data, label: newLabel }, style: { ...n.style, height: newH }, height: newH };
        if (n.type === 'section' && shiftedSecIds.has(n.id)) return { ...n, position: { ...n.position, y: n.position.y + delta } };
        if (n.type === 'condition' && shiftedSecIds.has(n.data?.sectionId)) return { ...n, position: { ...n.position, y: n.position.y + delta } };
        return n;
      });
    });
  }, [setCanvasNodes]);

  const resizeSectionLive = useCallback((sectionId, newH) => {
    setCanvasNodes(nds => {
      const secs = nds.filter(n => n.type === 'section').sort((a,b) => a.position.y - b.position.y);
      const idx = secs.findIndex(s => s.id === sectionId);
      if (idx < 0) return nds;
      const oldH = secs[idx].style?.height ?? SEC_H;
      const delta = newH - oldH;
      if (delta === 0) return nds;
      const shiftedSecIds = new Set(secs.slice(idx + 1).map(s => s.id));
      return nds.map(n => {
        if (n.id === sectionId) return { ...n, style: { ...n.style, height: newH }, height: newH };
        if (n.type === 'section' && shiftedSecIds.has(n.id)) return { ...n, position: { ...n.position, y: n.position.y + delta } };
        if (n.type === 'condition' && shiftedSecIds.has(n.data?.sectionId)) return { ...n, position: { ...n.position, y: n.position.y + delta } };
        return n;
      });
    });
  }, [setCanvasNodes]);

  const updateSectionDesc = useCallback((sectionId, desc) => {
    setCanvasNodes(nds => nds.map(n =>
      n.id === sectionId ? { ...n, data: { ...n.data, description: desc } } : n
    ));
  }, [setCanvasNodes]);

  const updateNodeImages = useCallback((nodeId, images) => {
    setCanvasNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, images } } : n
    ));
  }, [setCanvasNodes]);

  const applySectionDragY = useCallback((sectionId, startGraphY, startClientY, clientY, zoom) => {
    const newGraphY = startGraphY + (clientY - startClientY) / (zoom * getAppZoom());
    setCanvasNodes(nds => {
      const secs = nds.filter(n => n.type === 'section');
      const draggedH = secs.find(s => s.id === sectionId)?.style?.height ?? SEC_H;
      const draggedCenter = newGraphY + draggedH / 2;
      const otherOrder = liveOrderRef.current.filter(id => id !== sectionId);
      let vY = 0;
      const virtualY = {};
      for (const id of otherOrder) {
        virtualY[id] = vY;
        vY += (secs.find(s => s.id === id)?.style?.height ?? SEC_H) + SEC_GAP;
      }
      let insertIdx = otherOrder.length;
      for (let i = 0; i < otherOrder.length; i++) {
        const h = secs.find(s => s.id === otherOrder[i])?.style?.height ?? SEC_H;
        if (draggedCenter < virtualY[otherOrder[i]] + h / 2) { insertIdx = i; break; }
      }
      const newOrder = [...otherOrder];
      newOrder.splice(insertIdx, 0, sectionId);
      if (!newOrder.every((id, i) => id === liveOrderRef.current[i])) {
        liveOrderRef.current = newOrder;
      }
      const targetY = {};
      let ty = 0;
      for (const id of liveOrderRef.current) {
        targetY[id] = ty;
        ty += (secs.find(s => s.id === id)?.style?.height ?? SEC_H) + SEC_GAP;
      }
      const draggedSec = secs.find(s => s.id === sectionId);
      const draggedDeltaY = draggedSec ? (newGraphY - draggedSec.position.y) : 0;
      return nds.map(n => {
        if (n.id === sectionId) return { ...n, position: { x: SEC_X, y: newGraphY } };
        if (n.type === 'section' && targetY[n.id] !== undefined)
          return { ...n, position: { x: SEC_X, y: targetY[n.id] } };
        if (n.type === 'condition' && n.data?.sectionId === sectionId) {
          return { ...n, position: { x: n.position.x, y: n.position.y + draggedDeltaY } };
        }
        if (n.type === 'condition' && n.data?.sectionId !== sectionId) {
          const par = secs.find(s => s.id === n.data?.sectionId);
          if (!par || targetY[par.id] === undefined) return n;
          return { ...n, position: { x: n.position.x, y: n.position.y + (targetY[par.id] - par.position.y) } };
        }
        return n;
      });
    });
  }, [setCanvasNodes]);

  const beginSectionDrag = useCallback((sectionId, startClientY) => {
    const zoom = rfRef.current?.getViewport()?.zoom ?? (rfTransform?.[2] || BASE_ZOOM);
    const sec = canvasNodesRef.current.find(n => n.id === sectionId);
    const startGraphY = sec?.position.y ?? 0;
    const sorted = canvasNodesRef.current.filter(n => n.type === 'section').sort((a,b) => a.position.y - b.position.y);
    liveOrderRef.current = sorted.map(s => s.id);
    dragStartRef.current = { sectionId };
    isDraggingRef.current = true;
    setIsDragging(true);
    setSliding(true);
    document.body.classList.add('tlc-dragging');
    setCanvasNodes(nds => nds.map(n => {
      if (n.id === sectionId) {
        return { ...n, zIndex: 9999, data: { ...n.data, dragging: true } };
      }
      if (n.type === 'condition' && n.data?.sectionId === sectionId) return { ...n, zIndex: 10000 };
      return n;
    }));

    let rafId = null;
    let pendingClientY = startClientY;

    const onPointerMove = (e) => {
      pendingClientY = e.clientY;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        applySectionDragY(sectionId, startGraphY, startClientY, pendingClientY, zoom);
      });
    };

    const endDrag = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      document.body.classList.remove('tlc-dragging');
      isDraggingRef.current = false;
      setIsDragging(false);
      dragStartRef.current = null;
      setCanvasNodes(nds => {
        const secs = nds.filter(n => n.type === 'section');
        const snapY = {};
        let y = 0;
        for (const id of liveOrderRef.current) {
          snapY[id] = y;
          y += (secs.find(s => s.id === id)?.style?.height ?? SEC_H) + SEC_GAP;
        }
        return nds.map(n => {
          if (n.type === 'section') {
            const dragging = n.id === sectionId;
            return {
              ...n,
              position: { x: SEC_X, y: snapY[n.id] ?? n.position.y },
              zIndex: -1,
              data: dragging ? { ...n.data, dragging: false } : n.data,
            };
          }
          if (n.type === 'condition') {
            const par = secs.find(s => s.id === n.data?.sectionId);
            if (!par) return { ...n, zIndex: 0 };
            const dy = (snapY[par.id] ?? par.position.y) - par.position.y;
            return { ...n, position: { x: n.position.x, y: n.position.y + dy }, zIndex: 0 };
          }
          return n;
        });
      });
      setTimeout(() => setSliding(false), 420);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }, [setCanvasNodes, rfTransform, applySectionDragY]);

  /** Wait for press-and-hold on grip — a quick click does not reorder. */
  const prepareSectionDrag = useCallback((sectionId, _startClientX, startClientY, pointerId) => {
    let activated = false;
    let holdTimer = null;

    const cleanupWait = () => {
      if (holdTimer != null) clearTimeout(holdTimer);
      window.removeEventListener('pointerup', onWaitUp);
      window.removeEventListener('pointercancel', onWaitUp);
    };

    const activate = () => {
      if (activated) return;
      activated = true;
      cleanupWait();
      beginSectionDrag(sectionId, startClientY);
    };

    const onWaitUp = (e) => {
      if (e.pointerId !== pointerId) return;
      cleanupWait();
    };

    holdTimer = setTimeout(activate, SECTION_DRAG_HOLD_MS);
    window.addEventListener('pointerup', onWaitUp);
    window.addEventListener('pointercancel', onWaitUp);
  }, [beginSectionDrag]);

  // Keep module-level callbacks current
  const onNodeDragStart = useCallback((_, node) => {
    if (node.type === 'condition') {
      const sectionId = node.data?.sectionId;
      const slot = node.data?.slot;
      setCanvasNodes(nds => nds.map(n => {
        if (n.id === node.id) return { ...n, zIndex: 9999 };
        if (n.id === sectionId && n.type === 'section') {
          const fs = (n.data.filledSlots || []).filter(s => s !== slot);
          return { ...n, data: { ...n.data, filledSlots: fs } };
        }
        return n;
      }));
      return;
    }
    if (node.type !== 'section') return;
    isDraggingRef.current = true; // sync — freezes separators immediately
    setIsDragging(true);
    setSliding(true);
    setCanvasNodes(nds => {
      const sorted = nds.filter(n => n.type === 'section').sort((a, b) => a.position.y - b.position.y);
      liveOrderRef.current = sorted.map(s => s.id);
      dragStartRef.current = { sectionId: node.id };
      return nds.map(n => n.id === node.id ? { ...n, zIndex: 9999 } : n);
    });
  }, [setCanvasNodes]);

  const onNodeDrag = useCallback((_, node) => {
    if (node.type !== 'section' || !dragStartRef.current) return;
    setCanvasNodes(nds => {
      const secs = nds.filter(n => n.type === 'section');
      const draggedH = secs.find(s => s.id === node.id)?.style?.height ?? SEC_H;
      const draggedCenter = node.position.y + draggedH / 2;
      const otherOrder = liveOrderRef.current.filter(id => id !== node.id);
      let vY = 0;
      const virtualY = {};
      for (const id of otherOrder) {
        virtualY[id] = vY;
        vY += (secs.find(s => s.id === id)?.style?.height ?? SEC_H) + SEC_GAP;
      }
      let insertIdx = otherOrder.length;
      for (let i = 0; i < otherOrder.length; i++) {
        const h = secs.find(s => s.id === otherOrder[i])?.style?.height ?? SEC_H;
        if (draggedCenter < virtualY[otherOrder[i]] + h / 2) { insertIdx = i; break; }
      }
      const newOrder = [...otherOrder];
      newOrder.splice(insertIdx, 0, node.id);
      if (newOrder.every((id, i) => id === liveOrderRef.current[i])) return nds;
      liveOrderRef.current = newOrder;
      const targetY = {};
      let ty = 0;
      for (const id of newOrder) {
        targetY[id] = ty;
        ty += (secs.find(s => s.id === id)?.style?.height ?? SEC_H) + SEC_GAP;
      }
      return nds.map(n => {
        if (n.id === node.id) return n;
        if (n.type === 'section' && targetY[n.id] !== undefined)
          return { ...n, position: { x: SEC_X, y: targetY[n.id] } };
        if (n.type === 'condition' && n.data?.sectionId !== node.id) {
          const sec = secs.find(s => s.id === n.data?.sectionId);
          if (!sec || targetY[sec.id] === undefined) return n;
          return { ...n, position: { x: n.position.x, y: n.position.y + (targetY[sec.id] - sec.position.y) } };
        }
        return n;
      });
    });
  }, [setCanvasNodes]);

  const onNodeDragStop = useCallback((_, node) => {
    if (node.type === 'condition') {
      setCanvasNodes(nds => {
        const cond = nds.find(n => n.id === node.id);
        if (!cond) return nds;
        const origSectionId = cond.data.sectionId;
        const dropCenterX = node.position.x + COND_W / 2;
        const dropCenterY = node.position.y + COND_H / 2;
        const sections = nds.filter(n => n.type === 'section');
        let targetSection = sections.find(s => {
          const h = s.style?.height ?? SEC_H;
          return dropCenterY >= s.position.y && dropCenterY < s.position.y + h;
        }) || sections.find(s => s.id === origSectionId);
        if (!targetSection) return nds.map(n => n.id === node.id ? { ...n, zIndex: undefined } : n);
        const slots = getSlotLocalPositions();
        let closest = -1, minDist = Infinity;
        for (let i = 0; i < slots.length; i++) {
          const slotCenterX = targetSection.position.x + slots[i].x + COND_W / 2;
          const dist = Math.abs(dropCenterX - slotCenterX);
          if (dist < minDist) { minDist = dist; closest = i; }
        }
        const currentSlot = cond.data.slot;
        if (targetSection.id === origSectionId && closest === currentSlot) {
          const restored = nds.map(n => {
            if (n.id === node.id) return { ...n, zIndex: undefined };
            if (n.id === origSectionId && n.type === 'section') {
              const fs = nds
                .filter(x => x.type === 'condition' && x.data?.sectionId === origSectionId)
                .map(x => x.data.slot)
                .sort((a,b)=>a-b);
              return { ...n, data: { ...n.data, condCount: fs.length, filledSlots: fs } };
            }
            return n;
          });
          return restackAll(restored);
        }
        const targetCond = nds.find(n =>
          n.type === 'condition' &&
          n.id !== node.id &&
          n.data?.sectionId === targetSection.id &&
          n.data?.slot === closest
        );
        let updated;
        if (targetCond) {
          updated = nds.map(n => {
            if (n.id === node.id) return { ...n, zIndex: undefined, data: { ...n.data, sectionId: targetSection.id, slot: closest, sectionColor: targetSection.data.ac } };
            if (n.id === targetCond.id) return { ...n, data: { ...n.data, sectionId: origSectionId, slot: currentSlot, sectionColor: nds.find(s=>s.id===origSectionId)?.data?.ac ?? n.data.sectionColor } };
            return n;
          });
        } else {
          updated = nds.map(n => {
            if (n.id === node.id) return { ...n, zIndex: undefined, data: { ...n.data, sectionId: targetSection.id, slot: closest, sectionColor: targetSection.data.ac } };
            return n;
          });
        }
        const recomputeFilled = (sid) => updated
          .filter(n => n.type === 'condition' && n.data?.sectionId === sid)
          .map(n => n.data.slot)
          .sort((a,b)=>a-b);
        updated = updated.map(n => {
          if (n.type !== 'section') return n;
          if (n.id === origSectionId || n.id === targetSection.id) {
            const fs = recomputeFilled(n.id);
            return { ...n, data: { ...n.data, condCount: fs.length, filledSlots: fs } };
          }
          return n;
        });
        return restackAll(updated);
      });
      return;
    }
    if (node.type !== 'section') return;
    isDraggingRef.current = false;
    dragStartRef.current = null;
    setIsDragging(false);
    setCanvasNodes(nds => {
      const secs = nds.filter(n => n.type === 'section');
      const snapY = {};
      let y = 0;
      for (const id of liveOrderRef.current) {
        snapY[id] = y;
        y += (secs.find(s => s.id === id)?.style?.height ?? SEC_H) + SEC_GAP;
      }
      return nds.map(n => {
        if (n.type === 'section') return { ...n, position: { x: SEC_X, y: snapY[n.id] ?? n.position.y }, zIndex: -1 };
        if (n.type === 'condition') {
          const sec = secs.find(s => s.id === n.data?.sectionId);
          if (!sec) return n;
          const dy = (snapY[sec.id] ?? sec.position.y) - sec.position.y;
          return { ...n, position: { x: n.position.x, y: n.position.y + dy } };
        }
        return n;
      });
    });
    setTimeout(() => setSliding(false), 350);
  }, [setCanvasNodes]);

  shortcutsRef.current = { undo: doUndo, redo: doRedo, del: deleteSelected, hasSel: selectedIds.length > 0 };
  useLayoutEffect(() => {
    _cvCb.addCondition = addConditionToSection;
    _cvCb.deleteCondition = deleteCondition;
    _cvCb.updateCondition = updateConditionData;
    _cvCb.deleteSection = doDeleteSection;
    _cvCb.insertSection = insertSectionAfter;
    _cvCb.renameSection = renameSection;
    _cvCb.resizeSection = resizeSectionLive;
    _cvCb.updateDesc = updateSectionDesc;
    _cvCb.setDescPanelOpen = setDescPanelOpen;
    _cvCb.startDrag = prepareSectionDrag;
    _cvCb.requestFitView = requestFitView;
    return () => {
      _cvCb.addCondition = null;
      _cvCb.deleteCondition = null;
      _cvCb.updateCondition = null;
      _cvCb.deleteSection = null;
      _cvCb.insertSection = null;
      _cvCb.renameSection = null;
      _cvCb.resizeSection = null;
      _cvCb.updateDesc = null;
      _cvCb.setDescPanelOpen = null;
      _cvCb.startDrag = null;
      _cvCb.requestFitView = null;
    };
  }, [
    addConditionToSection, deleteCondition, updateConditionData, doDeleteSection,
    insertSectionAfter, renameSection, resizeSectionLive, updateSectionDesc,
    setDescPanelOpen, prepareSectionDrag, requestFitView,
  ]);

  const sections = useMemo(() => canvasNodes.filter(n => n.type === 'section'), [canvasNodes]);
  const conditions = useMemo(() => canvasNodes.filter(n => n.type === 'condition'), [canvasNodes]);
  const outlineGroups = useMemo(() => {
    return canvasNodes
      .filter(n => n.type === 'section')
      .sort((a,b) => a.position.y - b.position.y)
      .map(sec => ({
        id: sec.id,
        label: sec.data?.label || 'Untitled Group',
        description: sec.data?.description || '',
        images: Array.isArray(sec.data?.images) ? sec.data.images : [],
        conditions: canvasNodes
          .filter(n => n.type === 'condition' && n.data?.sectionId === sec.id)
          .sort((a,b) => (a.data?.slot ?? 0) - (b.data?.slot ?? 0))
          .map(cond => ({
            id: cond.id,
            label: cond.data?.label || 'Untitled Condition',
            description: cond.data?.description || '',
            status: cond.data?.status || (cond.data?.mandatory === false ? 'optional' : 'mandatory'),
            images: Array.isArray(cond.data?.images) ? cond.data.images : [],
          })),
      }));
  }, [canvasNodes]);

  const displayNodes = useMemo(() => canvasNodes, [canvasNodes]);

  const { gapPositions, topEdge, botEdge, contentBotGraph } = useMemo(() => {
    // Use rfNodeInternals (React Flow's internal store) so separator overlays
    // update in the same render cycle as the node wrappers — no one-frame lag.
    const rfSecs = rfNodeInternals.size > 0
      ? [...rfNodeInternals.values()].filter(n => n.type === 'section')
      : canvasNodes.filter(n => n.type === 'section');
    const secs = rfSecs.sort((a,b) => a.position.y - b.position.y);
    const secH = (s) => s.height ?? s.style?.height ?? SEC_H;
    const gaps = secs.slice(0,-1).map(sec => ({
      id: sec.id,
      topY: sec.position.y + secH(sec),
      botY: sec.position.y + secH(sec) + SEC_GAP,
    }));
    const first = secs[0];
    const last  = secs[secs.length - 1];
    const lastBot = last ? last.position.y + secH(last) : 0;
    return {
      gapPositions: gaps,
      topEdge: first ? { topY: first.position.y - SEC_GAP, botY: first.position.y } : null,
      botEdge: last  ? { topY: lastBot, botY: lastBot + SEC_GAP } : null,
      contentBotGraph: lastBot + SEC_GAP,
    };
  }, [rfNodeInternals, canvasNodes]);

  // Always keep gap data current; freeze it during drag so separators don't move
  if (!isDraggingRef.current) gapDataRef.current = { gapPositions, topEdge, botEdge, contentBotGraph };
  const displayGapData = isDraggingRef.current && gapDataRef.current
    ? gapDataRef.current
    : { gapPositions, topEdge, botEdge, contentBotGraph };

  canvasNodesRef.current = canvasNodes;
  // Keep scroll values ref current so the wheel handler never has stale closures
  const contentWidthGraph = SEC_X + SEC_W;
  scrollValuesRef.current = { canvasH, canvasW, contentBotGraph, contentWidthGraph };

  // Non-passive wheel handler: vertical scroll; horizontal when trackpad shifts or deltaX dominates
  useEffect(() => {
    if (flowViewMode !== 'board') return;
    const el = canvasContainerRef.current;
    if (!el) return;
    const padX = 28;
    const onWheel = (e) => {
      e.preventDefault();
      if (!rfRef.current) return;
      const { canvasH: ch, canvasW: cw, contentBotGraph: cbg, contentWidthGraph: cwg } = scrollValuesRef.current;
      const { x, y, zoom } = rfRef.current.getViewport();
      const useHorizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (useHorizontal && cw && cwg * zoom > cw) {
        const maxVpX = padX - SEC_X * zoom;
        const minVpX = cw - padX - cwg * zoom;
        if (maxVpX - minVpX > 1) {
          const delta = e.shiftKey ? e.deltaY : e.deltaX;
          const newX = Math.min(maxVpX, Math.max(minVpX, x - delta * 0.8));
          rfRef.current.setViewport({ x: newX, y, zoom });
        }
        return;
      }
      const minY = ch - cbg * zoom;
      const maxY = SEC_GAP * zoom;
      if (minY >= maxY) return;
      const newY = Math.min(maxY, Math.max(minY, y - e.deltaY * 0.8));
      rfRef.current.setViewport({ x, y: newY, zoom });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [flowViewMode]);

  const topBarBtnStyle = (key) => ({
    display:'flex',alignItems:'center',justifyContent:'center',padding:'4px 9px',borderRadius:5,
    border:`1px solid ${btnHov===key?'var(--tlc-brh)':'transparent'}`,background:btnHov===key?'var(--tlc-hv)':'transparent',
    fontSize:11,color:'var(--tlc-ts)',cursor:'default',userSelect:'none',gap:4,fontFamily:F,whiteSpace:'nowrap'
  });

  const timeframeOpts = ['','1m','5m','15m','30m','1h','4h','1D','1W'];
  const outlineFieldBase = {
    width:'100%',boxSizing:'border-box',border:'1px solid #D6DCE8',borderRadius:0,
    background:'#FFFFFF',color:'#101828',fontFamily:F,outline:'none',
    transition:'border-color 0.14s, background 0.14s, box-shadow 0.14s'
  };
  const outlineInputStyle = {
    ...outlineFieldBase,height:34,padding:'0 10px',fontSize:14,fontWeight:850,
    letterSpacing:'0.03em',textTransform:'uppercase'
  };
  const outlineTextStyle = {
    ...outlineFieldBase,minHeight:82,resize:'vertical',padding:'10px 11px',
    fontSize:13,lineHeight:1.55,color:'#344054'
  };
  const outlineFocusStyle = (e) => {
    const edgeColor = e.currentTarget.dataset.edgeColor;
    e.currentTarget.style.borderColor = edgeColor || '#2643F7';
    e.currentTarget.style.background = '#FFFFFF';
    e.currentTarget.style.boxShadow = edgeColor
      ? `inset 3px 0 0 ${edgeColor}, 0 0 0 3px rgba(38,67,247,0.12), inset 0 -2px 0 rgba(38,67,247,0.35)`
      : '0 0 0 3px rgba(38,67,247,0.12), inset 0 -2px 0 rgba(38,67,247,0.35)';
  };
  const outlineBlurStyle = (e) => {
    const edgeColor = e.currentTarget.dataset.edgeColor;
    const borderColor = e.currentTarget.dataset.borderColor;
    e.currentTarget.style.borderColor = borderColor || '#D6DCE8';
    e.currentTarget.style.background = '#FFFFFF';
    e.currentTarget.style.boxShadow = edgeColor ? `inset 3px 0 0 ${edgeColor}` : 'none';
  };
  const outlineStatusOptions = [
    ['mandatory','Mandatory'],
    ['optional','Optional'],
    ['invalidate','Invalidate'],
  ];
  const outlineFlowColors = {
    group:'#C9A84C',
    mandatory:'#2643F7',
    optional:'#7C3AED',
    invalidate:'#EF4444',
  };
  const outlineStatusMeta = (status) => {
    if (status === 'invalidate') return { label:'Invalidate', color:outlineFlowColors.invalidate, soft:'#FEE2E2', border:'#FCA5A5' };
    if (status === 'optional') return { label:'Optional', color:outlineFlowColors.optional, soft:'#F3E8FF', border:'#C4B5FD' };
    return { label:'Mandatory', color:outlineFlowColors.mandatory, soft:'#EEF2FF', border:'#B8C4FF' };
  };
  const renderOutlineStatusIcon = (status, color, size=14) => {
    if (status === 'invalidate') {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
          <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.4"/>
          <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" stroke={color} strokeWidth="2.4" strokeLinecap="round"/>
        </svg>
      );
    }
    if (status === 'optional') {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
          <path d="M12 2l2.6 6.6L22 9l-5.5 4.6L18 21l-6-3.6L6 21l1.5-7.4L2 9l7.4-.4L12 2z" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
        </svg>
      );
    }
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
        <path d="M12 2l2.6 6.6L22 9l-5.5 4.6L18 21l-6-3.6L6 21l1.5-7.4L2 9l7.4-.4L12 2z" fill={color}/>
      </svg>
    );
  };
  const showOutlineTip = (text, el) => {
    const r = el?.getBoundingClientRect?.();
    if (!r) return;
    if (outlineTipTimerRef.current) clearTimeout(outlineTipTimerRef.current);
    outlineTipTimerRef.current = setTimeout(() => {
      setOutlineTip({ text, left:r.left + r.width / 2, top:r.bottom + 8 });
      outlineTipTimerRef.current = null;
    }, 700);
  };
  const hideOutlineTip = () => {
    if (outlineTipTimerRef.current) {
      clearTimeout(outlineTipTimerRef.current);
      outlineTipTimerRef.current = null;
    }
    setOutlineTip(null);
  };
  const handleOutlineImageFile = (nodeId, images, slot, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const next = Array.from({ length: 4 }, (_, i) => images?.[i] || null);
      next[slot] = { src: ev.target.result, name: file.name };
      updateNodeImages(nodeId, next);
    };
    reader.readAsDataURL(file);
  };
  const clearOutlineImage = (nodeId, images, slot) => {
    const next = Array.from({ length: 4 }, (_, i) => images?.[i] || null);
    next[slot] = null;
    updateNodeImages(nodeId, next);
  };
  const escPrint = (value) => String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const printOutlineDocument = () => {
    const docHeader = `<header class="doc-head"><div><div class="brand">Talaria Strategy Builder</div><h1 class="title">${escPrint(stratBName || 'Strategy Flow')}</h1></div><div class="meta">${outlineGroups.length} groups<br>${conditions.length} conditions</div></header>`;
    const htmlGroups = outlineGroups.length ? outlineGroups.map((group, gi) => {
      const groupImages = (group.images || []).filter(Boolean).map(img => `<figure><img src="${escPrint(img.src)}" alt=""><figcaption>${escPrint(img.name || 'Group image')}</figcaption></figure>`).join('');
      const conditions = group.conditions.map((cond, ci) => {
        const statusMeta = outlineStatusMeta(cond.status);
        const condImages = (cond.images || []).filter(Boolean).map(img => `<figure><img src="${escPrint(img.src)}" alt=""><figcaption>${escPrint(img.name || 'Condition image')}</figcaption></figure>`).join('');
        return `<article class="condition" style="border-left-color:${statusMeta.color}"><div class="condition-head"><h3 style="color:${statusMeta.color}">${gi + 1}.${ci + 1} ${escPrint(cond.label)}</h3><span style="color:${statusMeta.color}">${statusMeta.label}</span></div><p>${escPrint(cond.description || 'No description added.')}</p>${condImages ? `<div class="image-grid">${condImages}</div>` : ''}</article>`;
      }).join('');
      return `<section class="group"><div class="group-kicker">Group ${String(gi + 1).padStart(2, '0')}</div><h2>${escPrint(group.label)}</h2><p>${escPrint(group.description || 'No group description added.')}</p>${groupImages ? `<div class="image-grid">${groupImages}</div>` : ''}${conditions}</section>`;
    }).join('') : '<p>No strategy flow yet.</p>';
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><title>${escPrint(stratBName || 'Strategy Flow')}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#101828;font-family:${escPrint(F)},sans-serif;font-size:11pt;line-height:1.5}.doc{max-width:178mm;margin:0 auto}.doc-head{border-bottom:3px solid #C9A84C;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;gap:20px}.brand{font-size:10pt;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#2643F7}.title{margin:7px 0 0;font-size:24pt;line-height:1.1;color:#101828}.meta{font-size:9pt;color:#667085;text-align:right}.group{break-inside:auto;border-top:1px solid rgba(201,168,76,.55);padding-top:14px;margin-top:18px}.doc-head+.group{margin-top:0}.group-kicker{font-size:8pt;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#C9A84C}.group h2{margin:5px 0 8px;font-size:16pt;color:#101828;text-transform:uppercase}.group p,.condition p{margin:0 0 10px;color:#344054}.condition{break-inside:avoid;margin-top:13px;padding:10px 0 0 14px;border-left:3px solid #2643F7}.condition-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.condition h3{margin:0 0 6px;font-size:12pt;color:#101828;text-transform:uppercase}.condition span{font-size:8pt;font-weight:900;text-transform:uppercase;white-space:nowrap}.image-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:7px 0 9px}figure{margin:0;border:1px solid #D6DCE8;padding:5px;break-inside:avoid}img{width:100%;height:110px;object-fit:cover;display:block}figcaption{margin-top:4px;font-size:7.5pt;color:#667085;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media screen{body{padding:16px 0}}@media print{body{padding:0}.doc{max-width:none}}</style></head><body><main class="doc">${docHeader}${htmlGroups}</main><script>window.onload=()=>{window.focus();setTimeout(()=>window.print(),120);};<\/script></body></html>`);
    printWindow.document.close();
    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {}
    }, 300);
  };
  const renderOutlineImageSlots = (nodeId, images, accent = outlineFlowColors.group) => {
    const slots = Array.from({ length: 4 }, (_, i) => images?.[i] || null);
    return (
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>
          {slots.map((shot, slot) => {
            const slotKey = `outline-img-${nodeId}-${slot}`;
            const openKey = `outline-img-open-${nodeId}-${slot}`;
            const delKey = `outline-img-del-${nodeId}-${slot}`;
            const slotHot = btnHov === slotKey || btnHov === openKey || btnHov === delKey || outlinePress === slotKey || outlinePress === openKey || outlinePress === delKey;
            const slotDown = outlinePress === slotKey;
            return (
            <label
              key={slot}
              onMouseEnter={e=>{setBtnHov(slotKey);showOutlineTip(shot?.src ? 'Replace Image' : 'Add Image', e.currentTarget);}}
              onMouseLeave={()=>{setBtnHov(null);setOutlinePress(null);hideOutlineTip();}}
              onMouseDown={()=>setOutlinePress(slotKey)}
              onMouseUp={()=>setOutlinePress(null)}
              style={{height:74,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',border:`1px dashed ${slotHot ? accent : '#C7D0E0'}`,background:slotHot?'#FFFCF0':'#F8FAFC',cursor:'default',transform:slotDown?'translateY(1px) scale(0.985)':'translateY(0) scale(1)',boxShadow:slotHot?`0 8px 18px rgba(201,168,76,0.16), inset 0 -2px 0 ${accent}66`:'none',transition:'background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.08s'}}>
              {shot?.src ? (
                <>
                  <img src={shot.src} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                  {slotHot && (
                    <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.52)',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                      <button
                        type="button"
                        onClick={e=>{e.preventDefault();e.stopPropagation();setOutlineImagePreview({src:shot.src,name:shot.name || `Image ${slot+1}`,accent});}}
                        onMouseEnter={e=>{setBtnHov(openKey);showOutlineTip('Preview Image', e.currentTarget);}}
                        onMouseLeave={()=>{setBtnHov(slotKey);hideOutlineTip();}}
                        onMouseDown={e=>{e.preventDefault();e.stopPropagation();setOutlinePress(openKey);}}
                        onMouseUp={()=>setOutlinePress(null)}
                        style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:3,border:'none',background:outlinePress===openKey?'rgba(201,168,76,0.55)':btnHov===openKey?'rgba(201,168,76,0.28)':'transparent',cursor:'default',transform:outlinePress===openKey?'scale(0.90)':'scale(1)',transition:'background 0.1s, transform 0.08s'}}
                        aria-label="Preview image"
                      >
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#C9A84C" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="12" r="3" stroke="#C9A84C" strokeWidth="2.8"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={e=>{e.preventDefault();e.stopPropagation();clearOutlineImage(nodeId, images, slot);}}
                        onMouseEnter={e=>{setBtnHov(delKey);showOutlineTip('Remove Image', e.currentTarget);}}
                        onMouseLeave={()=>{setBtnHov(slotKey);hideOutlineTip();}}
                        onMouseDown={e=>{e.preventDefault();e.stopPropagation();setOutlinePress(delKey);}}
                        onMouseUp={()=>setOutlinePress(null)}
                        style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:3,border:'none',background:outlinePress===delKey?'rgba(255,80,104,0.55)':btnHov===delKey?'rgba(255,80,104,0.28)':'transparent',cursor:'default',transform:outlinePress===delKey?'scale(0.90)':'scale(1)',transition:'background 0.1s, transform 0.08s'}}
                        aria-label="Remove image"
                      >
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                          <polyline points="3 6 5 6 21 6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M19 6l-1 14H6L5 6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 11v6M14 11v6" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round"/>
                          <path d="M9 6V4h6v2" stroke="rgba(255,80,104,1)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  )}
                  <span style={{position:'absolute',left:6,right:32,bottom:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:9,color:'#FFFFFF',fontFamily:F,textShadow:'0 1px 4px rgba(0,0,0,0.8)'}}>
                    {shot.name || `Image ${slot+1}`}
                  </span>
                </>
              ) : (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5,color:'#98A2B3',opacity:0.95}}>
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="16" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="8.5" cy="9" r="1.5" fill="currentColor"/>
                    <path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{fontSize:10,fontFamily:F,fontWeight:800,letterSpacing:'0.04em',textTransform:'uppercase'}}>Add Image</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                style={{display:'none'}}
                onChange={e=>{handleOutlineImageFile(nodeId, images, slot, e.target.files?.[0]); e.target.value='';}}
              />
            </label>
            );
          })}
        </div>
      </div>
    );
  };
  const currentZoomPct = flowViewMode === 'board'
    ? Math.round((rfTransform?.[2] || BASE_ZOOM) * 100)
    : Math.round(outlineZoom * 100);
  const zoomButtonStyle = (key) => ({
    width:34,height:24,display:'flex',alignItems:'center',justifyContent:'center',
    border:'none',
    background:'transparent',
    color:btnHov===key?'#FFFFFF':'rgba(255,255,255,0.78)',
    cursor:'default',transform:outlinePress===key?'translateY(1px) scale(0.96)':'translateY(0) scale(1)',
    filter:btnHov===key?'drop-shadow(0 0 7px rgba(74,106,255,0.7))':'none',
    transition:'color 0.12s, filter 0.12s, transform 0.08s'
  });
  const zoomButtonHandlers = (key, action) => ({
    onClick: action,
    onMouseEnter: (e) => { setBtnHov(key); showOutlineTip(key === 'flow-zoom-in' ? 'Zoom In' : 'Zoom Out', e.currentTarget); },
    onMouseLeave: () => { setBtnHov(null); setOutlinePress(null); hideOutlineTip(); },
    onMouseDown: () => setOutlinePress(key),
    onMouseUp: () => setOutlinePress(null),
  });

  return (
    <div style={{
      flex:1,fontFamily:F,
      '--tlc-bg':c.bg,'--tlc-sf':c.sf,'--tlc-el':c.el,
      '--tlc-tx':c.tx,'--tlc-ts':c.ts,'--tlc-tm':c.tm,
      '--tlc-br':c.br,'--tlc-brh':c.brH,
      '--tlc-ac':c.ac,'--tlc-gn':c.gn,'--tlc-rd':c.rd,
      '--tlc-gold':c.gold,'--tlc-hv':c.hv,
      background:'var(--tlc-bg)',display:'flex',flexDirection:'column',overflow:'hidden'
    }}>
      {/* TopBar — slim status row, primary actions moved to wizard header */}
      <div role="toolbar" aria-label="Strategy flow tools" style={{height:32,flexShrink:0,display:'grid',gridTemplateColumns:'1fr auto',alignItems:'center',padding:'0 12px',borderBottom:`1px solid var(--tlc-brh)`,background:'var(--tlc-sf)'}}>
        <div style={{display:'flex',alignItems:'center',height:22,gap:12}}>
          {[
            ['board','Flow Board'],
            ['outline','Text Outline'],
          ].map(([mode,label]) => {
            const active = flowViewMode === mode;
            return (
              <button key={mode} type="button" aria-label={label} onClick={()=>setFlowViewMode(mode)}
                onMouseEnter={e=>{setBtnHov(`flow-mode-${mode}`);showOutlineTip(label, e.currentTarget);}} onMouseLeave={()=>{setBtnHov(null);hideOutlineTip();}}
                style={{height:22,width:24,padding:0,border:'none',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',cursor:'default',
                  background:'transparent',
                  borderRight:'none',
                  color:active?'var(--tlc-tx)':btnHov===`flow-mode-${mode}`?'var(--tlc-tx)':'var(--tlc-ts)',
                  filter:btnHov===`flow-mode-${mode}`?'drop-shadow(0 0 7px rgba(74,106,255,0.65))':'none',
                  transform:active?'translateY(0)':'translateY(0)',transition:'color 0.12s, filter 0.12s'}}>
                {mode === 'board' ? (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="5" width="16" height="5" stroke="currentColor" strokeWidth="2" />
                    <rect x="4" y="14" width="6" height="5" stroke="currentColor" strokeWidth="2" />
                    <rect x="14" y="14" width="6" height="5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                ) : (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <path d="M5 5h14M5 12h14M5 19h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                    <circle cx="3" cy="5" r="1.4" fill="currentColor"/>
                    <circle cx="3" cy="12" r="1.4" fill="currentColor"/>
                    <circle cx="3" cy="19" r="1.4" fill="currentColor"/>
                  </svg>
                )}
                {active&&<div style={{position:'absolute',bottom:-2,left:'10%',right:'10%',height:1.5,background:`linear-gradient(90deg,transparent,var(--tlc-ac),transparent)`,boxShadow:'0 0 5px rgba(74,106,255,0.45)'}}/>}
              </button>
            );
          })}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end'}}>
          {flowViewMode === 'outline' && (
            <button
              type="button"
              onClick={printOutlineDocument}
              onMouseEnter={e=>{setBtnHov('print-outline');showOutlineTip('Print PDF', e.currentTarget);}}
              onMouseLeave={()=>{setBtnHov(null);setOutlinePress(null);hideOutlineTip();}}
              onMouseDown={()=>setOutlinePress('print-outline')}
              onMouseUp={()=>setOutlinePress(null)}
              style={{width:28,height:22,display:'flex',alignItems:'center',justifyContent:'center',padding:0,marginRight:12,border:'none',background:outlinePress==='print-outline'?'rgba(255,255,255,0.14)':btnHov==='print-outline'?'rgba(255,255,255,0.08)':'transparent',color:btnHov==='print-outline'?'#FFFFFF':'var(--tlc-ts)',cursor:'default',transform:outlinePress==='print-outline'?'translateY(1px) scale(0.94)':'translateY(0) scale(1)',filter:'none',transition:'background 0.12s, color 0.12s, transform 0.08s'}}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                <path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 14h12v7H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <span aria-live="polite" style={{fontSize:10,color:'var(--tlc-tm)',fontFamily:F,fontVariantNumeric:'tabular-nums'}}>{sections.length} group{sections.length!==1?'s':''} · {conditions.length} condition{conditions.length!==1?'s':''}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,minHeight:0,display:'flex',overflow:'hidden',position:'relative'}}>
        <div style={{position:'absolute',right:8,bottom:18,zIndex:55,display:'flex',flexDirection:'column',alignItems:'center',background:'transparent',border:'none',boxShadow:'none',padding:'2px 0'}}>
          <button
            type="button"
            aria-label="Zoom in"
            {...zoomButtonHandlers('flow-zoom-in', ()=>flowViewMode==='board'?setBoardZoom(1):setOutlineZoomBy(1))}
            style={zoomButtonStyle('flow-zoom-in')}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.2"/>
              <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              <path d="M10.5 7.5v6M7.5 10.5h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
          <div style={{height:22,minWidth:40,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.72)',fontSize:10,fontWeight:900,fontFamily:F,fontVariantNumeric:'tabular-nums',letterSpacing:'0.02em',textShadow:'0 2px 8px rgba(0,0,0,0.7)'}}>
            {currentZoomPct}%
          </div>
          <button
            type="button"
            aria-label="Zoom out"
            {...zoomButtonHandlers('flow-zoom-out', ()=>flowViewMode==='board'?setBoardZoom(-1):setOutlineZoomBy(-1))}
            style={zoomButtonStyle('flow-zoom-out')}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.2"/>
              <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              <path d="M7.5 10.5h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Canvas Area */}
        {flowViewMode === 'board' ? (
        <div ref={canvasContainerRef} className={sliding?'tlc-sliding':''} style={{flex:1,position:'relative',background:'var(--tlc-bg)'}}>
          <div style={{position:'absolute',inset:0,zIndex:descPanelOpen?20:'auto'}}>
          <ReactFlow
            nodes={displayNodes}
            edges={canvasEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onPaneClick={onPaneClick}
            onInit={onInit}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={CANVAS_NODE_TYPES}
            edgeTypes={CANVAS_EDGE_TYPES}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type:'talEdge', markerEnd:{ type:MarkerType.ArrowClosed } }}
            style={{ width:'100%', height:'100%', background:'var(--tlc-bg)' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(140,160,255,0.06)"/>
          </ReactFlow>
          </div>
          <div
            style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden'}}
          >
            <CanvasScrollbar rfTransform={rfTransform} contentBotGraph={displayGapData.contentBotGraph} canvasH={canvasH} rfRef={rfRef} />
            <CanvasHScrollbar rfTransform={rfTransform} contentWidthGraph={contentWidthGraph} canvasW={canvasW} rfRef={rfRef} />
          </div>
          {rfNodesEl && createPortal(
            <>
              {displayGapData.topEdge && (
                <GraphSepLine topY={displayGapData.topEdge.topY} onInsert={insertSectionAtStart} />
              )}
              {displayGapData.gapPositions.map(gap => (
                <GraphSepLine key={gap.id} topY={gap.topY} onInsert={() => insertSectionAfter(gap.id)} />
              ))}
              {displayGapData.botEdge && (
                <GraphSepLine topY={displayGapData.botEdge.topY} onInsert={addSection} />
              )}
            </>,
            rfNodesEl
          )}
        </div>
        ) : (
        <div className="tlr-scroll" onScroll={hideOutlineTip} style={{flex:1,minHeight:0,overflowY:'auto',overflowX:'hidden',background:'linear-gradient(180deg,#090B13,#05060A)',padding:'28px 30px 42px'}}>
          <div style={{width:'min(920px,100%)',minHeight:'calc(100% - 8px)',margin:'0 auto',background:'#FFFFFF',color:'#101828',boxShadow:'0 34px 90px rgba(0,0,0,0.62),0 0 0 1px rgba(255,255,255,0.08)',display:'flex',flexDirection:'column',padding:'42px 48px 54px',fontFamily:F,zoom:outlineZoom}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,paddingBottom:18,marginBottom:18,borderBottom:`3px solid ${outlineFlowColors.group}`}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11,color:'#2643F7',fontWeight:900,letterSpacing:'0.14em',textTransform:'uppercase'}}>Talaria Strategy Builder</div>
                <div style={{marginTop:8,fontSize:30,lineHeight:1.1,color:'#101828',fontWeight:900,letterSpacing:0,textTransform:'uppercase'}}>{stratBName || 'Strategy Flow'}</div>
              </div>
              <div style={{fontSize:11,color:'#667085',lineHeight:1.6,textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>
                {sections.length} group{sections.length!==1?'s':''}<br/>
                {conditions.length} condition{conditions.length!==1?'s':''}
              </div>
            </div>
            {outlineGroups.length===0 ? (
              <div style={{height:180,display:'flex',alignItems:'center',justifyContent:'center',border:'1px dashed #C7D0E0',background:'#F8FAFC',color:'#667085',fontSize:13,fontFamily:F}}>
                No strategy flow yet.
              </div>
            ) : outlineGroups.map((group, gi) => (
              <section key={group.id} style={{position:'relative',padding:'18px 0 0',marginTop:gi===0?0:22,borderTop:`1px solid rgba(201,168,76,0.55)`,breakInside:'avoid'}}>
                <div style={{display:'grid',gridTemplateColumns:'68px minmax(0,1fr)',gap:20}}>
                  <div style={{borderRight:`2px solid rgba(201,168,76,0.42)`,paddingRight:14}}>
                    <div style={{fontSize:10,color:'#667085',fontFamily:F,fontWeight:900,letterSpacing:'0.12em',textTransform:'uppercase'}}>Group</div>
                    <div style={{marginTop:7,fontSize:30,lineHeight:1,color:outlineFlowColors.group,fontFamily:F,fontWeight:900,fontVariantNumeric:'tabular-nums'}}>
                      {String(gi+1).padStart(2,'0')}
                    </div>
                  </div>
                  <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:12}}>
                    <label style={{display:'flex',flexDirection:'column',gap:7}}>
                      <input
                        value={group.label}
                        onChange={e=>renameSection(group.id, e.target.value)}
                        onFocus={outlineFocusStyle}
                        onBlur={outlineBlurStyle}
                        onMouseEnter={e=>showOutlineTip('Group Name', e.currentTarget)}
                        onMouseLeave={hideOutlineTip}
                        placeholder="Group title"
                        style={outlineInputStyle}
                      />
                    </label>
                    <label style={{display:'flex',flexDirection:'column',gap:7}}>
                      <textarea
                        value={group.description}
                        onChange={e=>updateSectionDesc(group.id, e.target.value)}
                        onFocus={outlineFocusStyle}
                        onBlur={outlineBlurStyle}
                        onMouseEnter={e=>showOutlineTip('Group Description', e.currentTarget)}
                        onMouseLeave={hideOutlineTip}
                        placeholder="Describe this stage of the strategy..."
                        style={{...outlineTextStyle,minHeight:72}}
                      />
                    </label>
                    {renderOutlineImageSlots(group.id, group.images, outlineFlowColors.group)}
                  </div>
                </div>
                <div style={{padding:'18px 0 0 88px',display:'flex',flexDirection:'column',gap:14}}>
                  {group.conditions.length===0 ? (
                    <div style={{fontSize:12,color:'#667085',fontFamily:F,fontStyle:'italic'}}>No conditions in this group.</div>
                  ) : group.conditions.map((cond, ci) => {
                    const condMeta = outlineStatusMeta(cond.status);
                    return (
                      <article key={cond.id} style={{display:'grid',gridTemplateColumns:'38px minmax(0,1fr)',gap:13,padding:'0 0 15px',borderBottom:ci===group.conditions.length-1?'none':'1px solid #EEF2F7',breakInside:'avoid'}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:9,paddingTop:2}}>
                          <div style={{width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',border:`1px solid ${condMeta.border}`,background:condMeta.soft,color:condMeta.color,fontSize:11,fontWeight:900,fontFamily:F,fontVariantNumeric:'tabular-nums'}}>
                            {ci+1}
                          </div>
                          <div style={{width:1,flex:1,minHeight:72,background:`linear-gradient(180deg,${condMeta.color},transparent)`,opacity:0.58}}/>
                        </div>
                        <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:12}}>
                          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 138px',gap:12,alignItems:'end'}}>
                            <label style={{display:'flex',flexDirection:'column',gap:7,minWidth:0}}>
                              <input
                                value={cond.label}
                                onChange={e=>updateConditionData(cond.id, { label: e.target.value })}
                                onFocus={outlineFocusStyle}
                                onBlur={outlineBlurStyle}
                                onMouseEnter={e=>showOutlineTip('Condition Name', e.currentTarget)}
                                onMouseLeave={hideOutlineTip}
                                data-edge-color={condMeta.color}
                                data-border-color={condMeta.border}
                                placeholder="Condition title"
                                style={{...outlineInputStyle,fontSize:13,color:condMeta.color,borderColor:condMeta.border,boxShadow:`inset 3px 0 0 ${condMeta.color}`}}
                              />
                            </label>
                            <div style={{display:'flex',flexDirection:'column',gap:7}}>
                              <div
                                onClick={e=>{e.stopPropagation();setOutlineStatusOpen(outlineStatusOpen===cond.id?null:cond.id);}}
                                onMouseEnter={e=>{setBtnHov(`outline-status-select-${cond.id}`);showOutlineTip('Condition Type', e.currentTarget);}}
                                onMouseLeave={()=>{setBtnHov(null);setOutlinePress(null);hideOutlineTip();}}
                                onMouseDown={()=>setOutlinePress(`outline-status-select-${cond.id}`)}
                                onMouseUp={()=>setOutlinePress(null)}
                                style={{height:34,position:'relative',border:`1px solid ${btnHov===`outline-status-select-${cond.id}`||outlineStatusOpen===cond.id?condMeta.color:'#D6DCE8'}`,background:condMeta.soft,boxShadow:btnHov===`outline-status-select-${cond.id}`||outlineStatusOpen===cond.id?`inset 3px 0 0 ${condMeta.color}, 0 8px 18px ${condMeta.color}22`:`inset 3px 0 0 ${condMeta.color}`,transform:outlinePress===`outline-status-select-${cond.id}`?'translateY(1px)':'translateY(0)',transition:'border-color 0.12s, box-shadow 0.12s, transform 0.08s',cursor:'default'}}
                              >
                                <button
                                  type="button"
                                  style={{width:'100%',height:'100%',display:'flex',alignItems:'center',gap:7,border:0,outline:'none',background:'transparent',color:condMeta.color,fontFamily:F,fontSize:9,fontWeight:900,letterSpacing:'0.04em',textTransform:'uppercase',padding:'0 25px 0 9px',cursor:'default'}}
                                >
                                  {renderOutlineStatusIcon(cond.status, condMeta.color, 14)}
                                  <span style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{condMeta.label}</span>
                                </button>
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" style={{position:'absolute',right:8,top:'50%',transform:`translateY(-50%) rotate(${outlineStatusOpen===cond.id?180:0}deg)`,pointerEvents:'none',color:condMeta.color,transition:'transform 0.12s'}}>
                                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                {outlineStatusOpen===cond.id && (
                                  <div
                                    onClick={e=>e.stopPropagation()}
                                    style={{position:'absolute',top:38,right:0,width:158,zIndex:40,background:'#FFFFFF',border:'1px solid #D6DCE8',boxShadow:'0 14px 34px rgba(16,24,40,0.18), 0 0 0 1px rgba(38,67,247,0.05)',padding:'4px 0'}}
                                  >
                                    <div style={{height:2,background:`linear-gradient(90deg,transparent,${condMeta.color},transparent)`,marginBottom:3}}/>
                                    {outlineStatusOptions.map(([value,label]) => {
                                      const optMeta = outlineStatusMeta(value);
                                      const optKey = `outline-status-menu-${cond.id}-${value}`;
                                      const activeOpt = cond.status === value;
                                      const hotOpt = btnHov === optKey || outlinePress === optKey;
                                      return (
                                        <button
                                          key={value}
                                          type="button"
                                          onClick={()=>{updateConditionData(cond.id, { status:value, mandatory:value !== 'optional' });setOutlineStatusOpen(null);}}
                                          onMouseEnter={e=>{setBtnHov(optKey);showOutlineTip(label, e.currentTarget);}}
                                          onMouseLeave={()=>{setBtnHov(null);setOutlinePress(null);hideOutlineTip();}}
                                          onMouseDown={()=>setOutlinePress(optKey)}
                                          onMouseUp={()=>setOutlinePress(null)}
                                          style={{width:'100%',height:30,display:'flex',alignItems:'center',gap:8,border:0,background:activeOpt?optMeta.soft:hotOpt?'#F8FAFC':'#FFFFFF',color:activeOpt||hotOpt?optMeta.color:'#344054',fontFamily:F,fontSize:10,fontWeight:900,letterSpacing:'0.04em',textTransform:'uppercase',padding:'0 10px',cursor:'default',transform:outlinePress===optKey?'translateY(1px)':'translateY(0)',boxShadow:activeOpt?`inset 2px 0 0 ${optMeta.color}`:'none',transition:'background 0.12s, color 0.12s, transform 0.08s'}}
                                        >
                                          {renderOutlineStatusIcon(value, optMeta.color, 14)}
                                          <span>{label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <label style={{display:'flex',flexDirection:'column',gap:7}}>
                            <textarea
                              value={cond.description}
                              onChange={e=>updateConditionData(cond.id, { description: e.target.value })}
                              onFocus={outlineFocusStyle}
                              onBlur={outlineBlurStyle}
                              onMouseEnter={e=>showOutlineTip('Condition Description', e.currentTarget)}
                              onMouseLeave={hideOutlineTip}
                              placeholder="Entry rule, order placement, stop, target, or management detail..."
                              style={outlineTextStyle}
                            />
                          </label>
                          {renderOutlineImageSlots(cond.id, cond.images, condMeta.color)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
        )}

      </div>

      {/* Canvas step footer */}
      <div data-strategy-builder-footer="1" style={{flexShrink:0,height:56,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',borderTop:`1px solid var(--tlc-brh)`,background:'var(--tlc-el)'}}>
        <button type="button" onClick={goPrev} style={secondaryBtnStyle} onMouseEnter={onSecondaryEnter} onMouseLeave={onSecondaryLeave} onMouseDown={onSecondaryDown} onMouseUp={onSecondaryUp}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Back
        </button>
        <div style={{display:'flex',gap:5}}>
          {[1,2,3,4].map(d=>(<div key={d} style={{width:6,height:6,borderRadius:'50%',background:d===2?'var(--tlc-ac)':'var(--tlc-brh)'}}/>))}
        </div>
        <button type="button" onClick={goNext} style={primaryBtnStyle(true)} onMouseEnter={e=>onPrimaryEnter(e,true)} onMouseLeave={e=>onPrimaryLeave(e,true)} onMouseDown={e=>onPrimaryDown(e,true)} onMouseUp={e=>onPrimaryUp(e,true)}>
          Next
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>

      {outlineTip && createPortal(
        <div style={{position:'fixed',left:outlineTip.left,top:outlineTip.top,transform:'translate(-50%,0)',zIndex:100080,pointerEvents:'none',whiteSpace:'nowrap',background:'#000000',border:'1px solid rgba(140,160,255,0.22)',fontSize:11,fontWeight:500,color:'#FFFFFF',fontFamily:F,padding:'4px 9px 4px 12px',boxShadow:'0 4px 14px rgba(0,0,0,0.65)',textShadow:'0 1px 2px rgba(0,0,0,0.9)',letterSpacing:'0.02em'}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:2,background:'linear-gradient(180deg,transparent,var(--tlc-ac),transparent)',boxShadow:'0 0 8px rgba(74,106,255,0.9)'}}/>
          {outlineTip.text}
        </div>,
        document.body
      )}

      {outlineImagePreview && createPortal(
        <div
          onClick={()=>setOutlineImagePreview(null)}
          style={{position:'fixed',inset:0,zIndex:100090,background:'rgba(2,4,12,0.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}
        >
          <div
            onClick={e=>e.stopPropagation()}
            style={{width:'min(920px,92vw)',height:'min(680px,84vh)',background:'var(--tlc-bg)',border:'1px solid var(--tlc-brh)',boxShadow:'0 24px 80px rgba(0,0,0,0.72)',display:'flex',flexDirection:'column',overflow:'hidden'}}
          >
            <div style={{height:46,display:'flex',alignItems:'center',gap:10,padding:'0 14px',borderBottom:'1px solid var(--tlc-brh)',background:'var(--tlc-el)',fontFamily:F}}>
              <div style={{width:3,alignSelf:'stretch',background:outlineImagePreview.accent || outlineFlowColors.group,boxShadow:`0 0 10px ${outlineImagePreview.accent || outlineFlowColors.group}`}}/>
              <div style={{fontSize:12,fontWeight:800,color:'var(--tlc-tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{outlineImagePreview.name}</div>
              <button
                type="button"
                onClick={()=>setOutlineImagePreview(null)}
                onMouseEnter={()=>setBtnHov('outline-preview-close')}
                onMouseLeave={()=>setBtnHov(null)}
                onMouseDown={()=>setOutlinePress('outline-preview-close')}
                onMouseUp={()=>setOutlinePress(null)}
                style={{marginLeft:'auto',width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:btnHov==='outline-preview-close'?'rgba(255,255,255,0.08)':'transparent',color:'var(--tlc-tm)',cursor:'default',transform:outlinePress==='outline-preview-close'?'scale(0.92)':'scale(1)',transition:'background 0.1s, transform 0.08s'}}
                aria-label="Close preview"
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div style={{flex:1,minHeight:0,display:'flex',alignItems:'center',justifyContent:'center',padding:14,background:'#05070D'}}>
              <img src={outlineImagePreview.src} alt="" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',display:'block'}}/>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Template picker */}
      <TemplatePickerModal open={templatePickerOpen} c={c} F={F} hasExistingGroups={hasExistingGroups}
        onPick={loadTemplate} onCancel={()=>setTemplatePickerOpen(false)}/>

      {/* Toast */}
      {templateToast && createPortal(
        <div style={{position:'fixed',left:'50%',bottom:24,transform:'translateX(-50%)',zIndex:100040,
          background:c.sf,border:`1px solid ${c.acB}`,padding:'10px 16px',
          fontFamily:F,fontSize:11,fontWeight:600,color:c.tx,
          boxShadow:'0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(140,160,255,0.13)',
          display:'flex',alignItems:'center',gap:8,maxWidth:'92vw'}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:c.acL,boxShadow:`0 0 8px ${c.acL}`,flexShrink:0}}/>
          {templateToast}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Instrument data ─────────────────────────────────────────────────────────
const FOREX_INSTRUMENTS = [
  {id:'eurusd',label:'EUR/USD'},{id:'gbpusd',label:'GBP/USD'},{id:'usdjpy',label:'USD/JPY'},
  {id:'usdchf',label:'USD/CHF'},{id:'audusd',label:'AUD/USD'},{id:'nzdusd',label:'NZD/USD'},
  {id:'usdcad',label:'USD/CAD'},{id:'eurgbp',label:'EUR/GBP'},{id:'eurjpy',label:'EUR/JPY'},
  {id:'gbpjpy',label:'GBP/JPY'},{id:'audjpy',label:'AUD/JPY'},{id:'chfjpy',label:'CHF/JPY'},
  {id:'euraud',label:'EUR/AUD'},{id:'eurnzd',label:'EUR/NZD'},{id:'eurcad',label:'EUR/CAD'},
  {id:'gbpaud',label:'GBP/AUD'},{id:'gbpnzd',label:'GBP/NZD'},{id:'gbpcad',label:'GBP/CAD'},
  {id:'audnzd',label:'AUD/NZD'},{id:'audcad',label:'AUD/CAD'},{id:'cadjpy',label:'CAD/JPY'},
];
const COMMODITY_CFD_INSTRUMENTS = [
  {id:'xauusd',label:'Gold (XAU/USD)'},{id:'xagusd',label:'Silver (XAG/USD)'},
  {id:'usoil',label:'Oil WTI'},{id:'ukoil',label:'Oil Brent'},{id:'natgas',label:'Natural Gas'},
];
const FUTURES_INSTRUMENTS = [
  {id:'es',label:'ES – E-mini S&P 500'},{id:'nq',label:'NQ – E-mini NASDAQ'},
  {id:'ym',label:'YM – Mini Dow'},{id:'rty',label:'RTY – Russell 2000'},
  {id:'cl',label:'CL – Crude Oil'},{id:'gc',label:'GC – Gold'},{id:'si',label:'SI – Silver'},
  {id:'zb',label:'ZB – 30Y T-Bond'},{id:'zn',label:'ZN – 10Y T-Note'},
  {id:'6e',label:'6E – EUR/USD Futures'},{id:'6j',label:'6J – JPY Futures'},{id:'6b',label:'6B – GBP Futures'},
];
const CRYPTO_INSTRUMENTS = [
  {id:'btcusd',label:'BTC/USD'},{id:'ethusd',label:'ETH/USD'},{id:'solusd',label:'SOL/USD'},
  {id:'xrpusd',label:'XRP/USD'},{id:'bnbusd',label:'BNB/USD'},{id:'adausd',label:'ADA/USD'},
  {id:'maticusd',label:'MATIC/USD'},{id:'dogeusd',label:'DOGE/USD'},
];
const STOCKS_INSTRUMENTS = [
  {id:'aapl',label:'AAPL – Apple'},{id:'msft',label:'MSFT – Microsoft'},
  {id:'googl',label:'GOOGL – Alphabet'},{id:'amzn',label:'AMZN – Amazon'},
  {id:'nvda',label:'NVDA – Nvidia'},{id:'tsla',label:'TSLA – Tesla'},
  {id:'meta',label:'META – Meta'},{id:'jpm',label:'JPM – JPMorgan'},
  {id:'v',label:'V – Visa'},{id:'spy',label:'SPY – S&P 500 ETF'},
];
const MKT_CAT_OPTS = [
  {id:'forex',label:'Forex'},{id:'futures',label:'Futures'},{id:'crypto',label:'Crypto'},{id:'stocks',label:'Stocks'},
];
const ALL_INSTRUMENTS = [...FOREX_INSTRUMENTS,...COMMODITY_CFD_INSTRUMENTS,...FUTURES_INSTRUMENTS,...CRYPTO_INSTRUMENTS,...STOCKS_INSTRUMENTS];

const INST_SYM_DATA = {
  xauusd:{id:'XAUUSD'},xagusd:{id:'SI',col:'#B0BEC5',bg:'rgba(176,190,197,0.18)'},
  usoil:{id:'OIL',col:'#FF7043',bg:'rgba(255,112,67,0.18)'},ukoil:{id:'BRN',col:'#FF8A65',bg:'rgba(255,138,101,0.18)'},natgas:{id:'GAS',col:'#42A5F5',bg:'rgba(66,165,245,0.18)'},
  es:{id:'ES'},nq:{id:'NQ'},gc:{id:'GC'},
  ym:{id:'YM',col:'#66BB6A',bg:'rgba(102,187,106,0.18)'},rty:{id:'RTY',col:'#AB47BC',bg:'rgba(171,71,188,0.18)'},
  cl:{id:'CL',col:'#FF7043',bg:'rgba(255,112,67,0.18)'},si:{id:'SI',col:'#B0BEC5',bg:'rgba(176,190,197,0.18)'},
  zb:{id:'ZB',col:'#78909C',bg:'rgba(120,144,156,0.18)'},zn:{id:'ZN',col:'#546E7A',bg:'rgba(84,110,122,0.18)'},
};
const getInstSym = id => INST_SYM_DATA[id]||null;

const getAppZoom = () => parseFloat(document.querySelector('[style*="zoom"]')?.style?.zoom) || 1;
const dropPos = (ref, w, minBelow, flipMaxH, center=true) => {
  const r = ref.current?.getBoundingClientRect();
  if (!r) return null;
  const z = getAppZoom();
  const rb=r.bottom/z, rl=r.left/z, rt=r.top/z, rw=r.width/z;
  const safeH=window.innerHeight/z-60, safeW=window.innerWidth/z;
  const below=safeH-rb, above=rt-10, flip=below<minBelow;
  const top=flip?Math.max(8,rt-Math.min(flipMaxH,above)):rb;
  const maxH=flip?Math.min(flipMaxH,above):Math.max(80,below);
  const left=center?Math.max(8,Math.min(rl+rw/2-w/2,safeW-w-8)):Math.min(rl,safeW-w-8);
  return {top,left,maxH};
};

const getInstFlags = id => {
  if (id==='6e') return {base:'EUR',quote:'USD'};
  if (id==='6j') return {base:'JPY',quote:'USD'};
  if (id==='6b') return {base:'GBP',quote:'USD'};
  if (INST_SYM_DATA[id]) return null;
  if (STOCKS_INSTRUMENTS.some(s=>s.id===id)) return {single:'US'};
  const up=id.toUpperCase();
  if (up.length===6){const b=up.slice(0,3),q=up.slice(3,6);if(currencyCountry[b]&&currencyCountry[q])return{base:b,quote:q};}
  if (id.endsWith('usd')) return {single:'US'};
  return null;
};

function compressCoverImage(file, maxW, maxH, quality) {
  maxW = maxW||1200; maxH = maxH||630; quality = quality||0.82;
  return new Promise(function(resolve, reject) {
    if (!file.type.startsWith('image/')) { reject(new Error('Not an image')); return; }
    if (file.size > 12*1024*1024) { reject(new Error('Image too large (max 12 MB)')); return; }
    var reader = new FileReader();
    reader.onerror = function() { reject(new Error('Failed to read file')); };
    reader.onload = function(ev) {
      var img = new Image();
      img.onerror = function() { reject(new Error('Failed to decode image')); };
      img.onload = function() {
        var r = Math.min(1, maxW/img.naturalWidth, maxH/img.naturalHeight);
        var w = Math.round(img.naturalWidth*r), h = Math.round(img.naturalHeight*r);
        var cv = document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        var out = cv.toDataURL('image/jpeg', quality);
        resolve(out.length > 4*1024*1024 ? cv.toDataURL('image/jpeg', 0.6) : out);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function InstrumentMultiSelect({ c, F, selectedIds, onToggle, marketCategories }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const cats = (marketCategories||[]).map(x=>x.toLowerCase());
  const showAll = cats.length === 0;
  const showForex = showAll || cats.includes('forex');
  const showFutures = showAll || cats.includes('futures');
  const showCrypto = showAll || cats.includes('crypto');
  const sel = new Set(selectedIds||[]);

  React.useEffect(() => {
    if (!open) return;
    const fn = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const labels = (selectedIds||[]).map(id => (ALL_INSTRUMENTS.find(x=>x.id===id)||{label:id}).label);
  let summary = 'Select instruments…';
  if (labels.length===1) summary=labels[0];
  else if (labels.length===2) summary=labels[0]+', '+labels[1];
  else if (labels.length>2) summary=labels[0]+', '+labels[1]+' +'+String(labels.length-2)+' more';

  const SecBlock = ({title, opts}) => (
    <div style={{borderBottom:'1px solid var(--gi-br)'}}>
      <div style={{padding:'6px 12px 3px',fontSize:9,fontWeight:700,color:'var(--gi-tm)',letterSpacing:1,textTransform:'uppercase',fontFamily:F,position:'sticky',top:0,background:'var(--gi-el)',zIndex:1}}>{title}</div>
      <div style={{maxHeight:140,overflowY:'auto',padding:'2px 6px 6px'}} className="tlr-scroll">
        {opts.map(opt=>(
          <label key={opt.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 6px',borderRadius:4,cursor:'default',userSelect:'none',background:sel.has(opt.id)?'var(--gi-acD)':'transparent',transition:'background 0.1s'}}
            onMouseEnter={e=>{if(!sel.has(opt.id))e.currentTarget.style.background='var(--gi-hv)';}}
            onMouseLeave={e=>{if(!sel.has(opt.id))e.currentTarget.style.background='transparent';}}>
            <input type="checkbox" checked={sel.has(opt.id)} onChange={()=>onToggle(opt.id)}
              style={{accentColor:'var(--gi-ac)',width:12,height:12,cursor:'default',flexShrink:0}}/>
            <span style={{fontSize:12,color:'var(--gi-ts)',fontFamily:F}}>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} style={{position:'relative'}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,
          background:'var(--gi-sf)',border:'1px solid var(--gi-br)',padding:'9px 12px',
          fontSize:12,color:labels.length?'var(--gi-tx)':'var(--gi-tm)',fontFamily:F,cursor:'default',
          transition:'border-color 0.12s',boxSizing:'border-box',userSelect:'none'}}
        onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gi-tx)'}
        onMouseLeave={e=>e.currentTarget.style.borderColor='var(--gi-br)'}>
        <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{summary}</span>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{flexShrink:0,color:'var(--gi-tm)',transform:open?'rotate(180deg)':'rotate(0deg)',transition:'transform 0.2s'}}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      {open&&(
        <div style={{position:'absolute',left:0,right:0,top:'100%',zIndex:9500,marginTop:2,
          background:'var(--gi-el)',border:'1px solid var(--gi-br)',boxShadow:'0 16px 48px rgba(0,0,0,0.75)',
          maxHeight:'min(70vh,380px)',overflowY:'auto'}} className="tlr-scroll">
          {showForex&&<SecBlock title="Forex pairs" opts={FOREX_INSTRUMENTS}/>}
          {showForex&&<SecBlock title="Commodities (CFD)" opts={COMMODITY_CFD_INSTRUMENTS}/>}
          {showFutures&&<SecBlock title="Futures" opts={FUTURES_INSTRUMENTS}/>}
          {showCrypto&&<SecBlock title="Crypto" opts={CRYPTO_INSTRUMENTS}/>}
        </div>
      )}
    </div>
  );
}

function GeneralInfoStepContent({ c, F,
  stratBName, setStratBName,
  stratBDesc, setStratBDesc,
  stratBMarkets, setStratBMarkets,
  stratBTimeframes, setStratBTimeframes,
  stratBInstruments, setStratBInstruments,
  stratBSupportInst, setStratBSupportInst,
  stratBImages, setStratBImages,
  stratBLogoEmoji, setStratBLogoEmoji,
  stratBTags, setStratBTags,
  showRequiredHint=false,
  generalInfoMissingKeys=[],
  generalInfoMissingLabels=[],
}) {
  const tags = stratBTags || [];
  const MAX_TAGS = 10;
  const [tagInput, setTagInput] = React.useState('');
  const [tagHov, setTagHov] = React.useState(null);
  const [tagDropOpen, setTagDropOpen] = React.useState(false);
  const [tagDropPos, setTagDropPos] = React.useState({top:0,left:0,maxH:280});
  const [tagInputFocus, setTagInputFocus] = React.useState(false);
  const tagWrapRef = React.useRef(null);
  const tagMenuRef = React.useRef(null);
  React.useEffect(() => {
    if (!tagDropOpen) return;
    const h = (e) => {
      if (tagWrapRef.current && tagWrapRef.current.contains(e.target)) return;
      if (tagMenuRef.current && tagMenuRef.current.contains(e.target)) return;
      setTagDropOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [tagDropOpen]);
  const TAG_LIBRARY = [
    'Advanced','Algorithmic','Anti-Trend','Bearish','Beginner-friendly','Breakout','Bullish',
    'Carry Trade','Chart Patterns','Commodities','Counter-Trend','Crypto',
    'Day Trading','Divergence','Equity Trading','Event-Driven',
    'Fibonacci','Forex','Fundamental','Futures',
    'Gap Trading','Grid Trading','Harmonic Patterns','Hedging','High Frequency',
    'ICT/SMC','Indicators','Indices','Intermediate','Intraday',
    'Long-Term','Market Profile','Mean Reversion','Momentum','Multi-Timeframe',
    'News Trading','Options','Order Flow','Pair Trading','Position Trading',
    'Price Action','Range','Reversal','Scalping','Sentiment',
    'Session-based','Short-Term','Stocks','Support/Resistance','Swing Trading',
    'Trend Following','Volatility','Volume','Wyckoff',
  ].sort((a,b)=>a.localeCompare(b));
  const allTagOptions = Array.from(new Set([...TAG_LIBRARY, ...tags])).sort((a,b)=>a.localeCompare(b));
  const addTag = (t) => {
    const v = (t || '').trim();
    if (!v || tags.includes(v) || tags.length >= MAX_TAGS) return;
    setStratBTags && setStratBTags([...tags, v]);
  };
  const toggleTag = (t) => {
    if (tags.includes(t)) { setStratBTags && setStratBTags(tags.filter(x => x !== t)); }
    else { addTag(t); }
  };
  const removeTag = (t) => { setStratBTags && setStratBTags(tags.filter(x => x !== t)); };
  const fileRef  = React.useRef(null);
  const emojiRef = React.useRef(null);
  const [imgBusy, setImgBusy]         = React.useState(false);
  const [imgHovIdx, setImgHovIdx]     = React.useState(null);
  const [imgPreview, setImgPreview]   = React.useState(null);
  const [mktDropOpen, setMktDropOpen] = React.useState(false);
  const [mktDropPos, setMktDropPos]   = React.useState({top:0,left:0,maxH:200});
  const [mktHov, setMktHov]           = React.useState(null);
  const [trdPickOpen, setTrdPickOpen] = React.useState(false);
  const [trdPickPos, setTrdPickPos]   = React.useState({top:0,left:0,maxH:280});
  const [trdPickSearch, setTrdPickSearch] = React.useState('');
  const [trdPickHov, setTrdPickHov]   = React.useState(null);
  const [trdPickCat, setTrdPickCat]   = React.useState(null);
  const [supPickOpen, setSupPickOpen] = React.useState(false);
  const [supPickPos, setSupPickPos]   = React.useState({top:0,left:0,maxH:280});
  const [supPickSearch, setSupPickSearch] = React.useState('');
  const [supPickHov, setSupPickHov]   = React.useState(null);
  const [supPickCat, setSupPickCat]   = React.useState(null);
  const mktWrapRef = React.useRef(null);
  const trdWrapRef = React.useRef(null);
  const supWrapRef = React.useRef(null);
  const [tfPickOpen, setTfPickOpen] = React.useState(false);
  const [tfPickPos, setTfPickPos]   = React.useState({top:0,left:0,maxH:360});
  const [tfPickHov, setTfPickHov]   = React.useState(null);
  const [tfCustomVal, setTfCustomVal] = React.useState('');
  const [tfCustomUnit, setTfCustomUnit] = React.useState('m');
  const [sbTfCustom, setSbTfCustom] = React.useState([]);
  const [tfUnitOpen, setTfUnitOpen] = React.useState(false);
  const tfPickWrapRef = React.useRef(null);
  const [emojiOpen, setEmojiOpen]     = React.useState(false);
  const [emojiSearch, setEmojiSearch] = React.useState('');
  const [emojiCat, setEmojiCat]       = React.useState('finance');
  const [emojiPos, setEmojiPos]       = React.useState({top:0,left:0});
  const [emojiHov, setEmojiHov]       = React.useState(false);
  const emojiBtnRef = React.useRef(null);
  const emojiPickerRef = React.useRef(null);

  const STYLES     = [{id:'scalping',label:'Scalping'},{id:'intraday',label:'Intraday'},{id:'swing',label:'Swing'}];
  const DIRECTIONS = [{id:'both',label:'Both'},{id:'long',label:'Long Only'},{id:'short',label:'Short Only'}];
  const EMOJI_CATS = [
    { id:'finance',    ic:'📈', label:'Finance',    list:['📈','📉','💹','💰','💵','💸','🏦','🏧','💳','💲','🪙','🏛','📊','📋','📌','🎯','🏆','🥇','💡','🔑','🗝','⚡','🛡','⚔️','🎰','♟','🧩','🔮','🧲','🧭','🗺','🌐','🔍','🔎','📡','⚙','💎','👑','🎖','🏅','⭐','🌟','💫','✨'] },
    { id:'smileys',    ic:'😊', label:'Smileys',    list:['😀','😃','😄','😁','😆','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😋','😜','🤪','😝','🤑','🤗','🤔','😐','😑','😶','🙄','😬','😌','😔','😢','😭','😤','😡','😈','💀','☠️','👻','🤖','👽','👾','🤡','🥳','😎','🧐'] },
    { id:'people',     ic:'👋', label:'People',     list:['👋','🤚','🖐','✋','🖖','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','👏','🙌','🤝','🙏','💪','🦾','👀','👁','🧠','🦷','🦴','🦶','🦵','🧑','👨','👩','🧒','👧','👦','🧓','👴','👵'] },
    { id:'animals',    ic:'🐶', label:'Animals',    list:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦄','🐝','🦋','🐌','🐞','🐜','🦂','🐢','🐍','🦎','🐙','🦑','🐠','🐟','🐬','🐳','🦈','🦅','🦉','🦜','🐧','🦆','🦩','🕊','🦚'] },
    { id:'food',       ic:'🍔', label:'Food',       list:['🍎','🍊','🍋','🍇','🍓','🫐','🍉','🍒','🍌','🍍','🥭','🥝','🍅','🥥','🥑','🥦','🌽','🥕','🧄','🥔','🍠','🥐','🍞','🧀','🍳','🥚','🥞','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥗','🍜','🍣','🍱','🥟','🍤','🎂','🍰','🍩','🍪','☕','🧃','🍺','🥂','🍷','🥃','🍸'] },
    { id:'travel',     ic:'✈️', label:'Travel',     list:['🚗','🚕','🏎','🚓','🚑','🚒','🚁','🛸','🚀','✈️','🛩','🛳','⛴','🚢','⛵','🚤','🏕','🏖','🏝','🏔','🗻','🌋','🗽','🗼','🏰','🏯','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','🌌','🌠','🎇','🎆','🌈','⚡','❄️','☃️','⛄','🌊','🌀','🌍','🌎','🌏','🌐'] },
    { id:'activities', ic:'⚽', label:'Activity',   list:['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','⛷','🏂','🏋','🤸','🏊','🚣','🧗','🚴','🤺','🎯','🎣','🤿','🎭','🎬','🎤','🎧','🎸','🎹','🎺','🎻','🥁','🎮','🎲','♟','🎳','🎰','🎡','🎢','🎪','🏆','🥇','🥈','🥉','🎖','🏅','🎗'] },
    { id:'objects',    ic:'💡', label:'Objects',    list:['💡','🔦','🕯','💻','🖥','📱','☎','📞','📺','📻','🎙','📡','🔋','🔌','💎','🔑','🗝','🔒','🔓','🔨','⛏','⚒','🛠','⚙','🔧','🪛','🔩','🔗','🧲','🪜','🧰','🧪','🔬','🔭','🩺','📊','📈','📉','📋','📌','📍','✏','📝','📓','📚','📖','📁','📂','📦','🏷','🗑','📇','🗓','📅','🗃','🗄'] },
    { id:'symbols',    ic:'❤️', label:'Symbols',    list:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','☮','✝','☪','🕉','✡','⭐','🌟','💫','✨','🔥','💧','🌊','🌈','☀','🌙','⛅','🌀','❄','⛄','♾','💠','🔷','🔶','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','◼','◻','▪','▫','🔲','🔳','🏳','🏴','🚩'] },
  ];

  React.useEffect(() => {
    if (!emojiOpen) return;
    const h = e => {
      if (emojiRef.current?.contains(e.target)) return;
      if (emojiPickerRef.current?.contains(e.target)) return;
      setEmojiOpen(false); setEmojiSearch('');
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [emojiOpen]);

  const openEmoji = () => {
    if (emojiOpen) { setEmojiOpen(false); setEmojiSearch(''); return; }
    const r = emojiBtnRef.current?.getBoundingClientRect();
    if (r) setEmojiPos({ top: r.bottom + 4, left: r.left + r.width / 2 - 148 });
    setEmojiOpen(true); setEmojiSearch('');
  };

  const lbl  = {fontSize:9,fontWeight:700,color:c.tm,fontFamily:F,letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:7};
  const inp  = {background:c.sf,border:'1px solid '+c.brH,color:c.tx,fontFamily:F,fontSize:13,padding:'9px 12px',outline:'none',width:'100%',boxSizing:'border-box',transition:'border-color 0.12s'};
  const missingSet = React.useMemo(() => new Set(generalInfoMissingKeys || []), [generalInfoMissingKeys]);
  const requiredMissing = key => showRequiredHint && missingSet.has(key);
  const requiredBorder = key => requiredMissing(key) ? 'rgba(255,80,104,0.62)' : c.brH;
  const requiredGlow = key => requiredMissing(key) ? '0 0 0 1px rgba(255,80,104,0.35), 0 0 18px rgba(255,80,104,0.28)' : 'none';
  const tbtn = active => ({
    display:'inline-flex',alignItems:'center',justifyContent:'center',padding:'7px 16px',fontSize:12,fontWeight:active?600:500,fontFamily:F,cursor:'default',
    border:'1px solid '+(active?c.acL:c.brH),color:active?c.acL:c.tx,
    background:active?'rgba(38,67,247,0.18)':c.sf,transition:'all 0.12s',
    boxShadow:active?'0 0 12px rgba(38,67,247,0.22)':undefined,
  });

  const pickCover = async e => {
    const files = Array.from(e.target.files || []).slice(0, 1); e.target.value = '';
    if (!files.length) return;
    setImgBusy(true);
    try {
      const results = await Promise.all(files.map(f => compressCoverImage(f).catch(() => null)));
      setStratBImages(prev => {
        const next = [...(prev||[]), ...results.filter(Boolean)];
        return next.slice(0, 6);
      });
    }
    catch (err) { alert(err instanceof Error ? err.message : 'Could not process image'); }
    finally { setImgBusy(false); }
  };


  const toggleMkt  = id => { const cur=stratBMarkets||[]; setStratBMarkets(cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]); };
  React.useEffect(()=>{
    if(!mktDropOpen) return;
    const handler = e => { if(mktWrapRef.current && !mktWrapRef.current.contains(e.target)) setMktDropOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mktDropOpen]);
  React.useEffect(()=>{
    if(!trdPickOpen) return;
    const handler = e => { if(trdWrapRef.current && !trdWrapRef.current.contains(e.target)) setTrdPickOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [trdPickOpen]);
  React.useEffect(()=>{
    if(!supPickOpen) return;
    const handler = e => { if(supWrapRef.current && !supWrapRef.current.contains(e.target)) setSupPickOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [supPickOpen]);
  const toggleInst = id => { const cur=stratBInstruments||[]; if(!cur.includes(id)&&cur.length>=10)return; setStratBInstruments(cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]); };
  const tfs        = Array.isArray(stratBTimeframes)?stratBTimeframes:[stratBTimeframes].filter(Boolean);
  const toggleTf   = id => { if(!tfs.includes(id)&&tfs.length>=6)return; setStratBTimeframes(tfs.includes(id)?tfs.filter(x=>x!==id):[...tfs,id]); };

  const tfSortItems = items=>[...items].sort((a,b)=>{const nA=parseInt(a)||0,nB=parseInt(b)||0;return nA-nB;});
  const tfDefaults={minutes:["1m","5m","15m","30m"],hours:["1H","4H"],days:["1D"],weeks:["1W"],months:["1M"]};
  const tfCategories={
    minutes:{label:"Minutes",items:tfSortItems([...tfDefaults.minutes,...sbTfCustom.filter(x=>x.endsWith("m"))])},
    hours:{label:"Hours",items:tfSortItems([...tfDefaults.hours,...sbTfCustom.filter(x=>x.endsWith("H"))])},
    days:{label:"Days",items:tfSortItems([...tfDefaults.days,...sbTfCustom.filter(x=>x.endsWith("D"))])},
    weeks:{label:"Weeks",items:tfSortItems([...tfDefaults.weeks,...sbTfCustom.filter(x=>x.endsWith("W"))])},
    months:{label:"Months",items:tfSortItems([...tfDefaults.months,...sbTfCustom.filter(x=>x.endsWith("M")&&!x.endsWith("m"))])},
  };
  const addCustomTf=()=>{
    const val=parseInt(tfCustomVal);
    if(!val||val<=0)return;
    const key=`${val}${tfCustomUnit}`;
    const allDef=Object.values(tfDefaults).flat();
    if(sbTfCustom.includes(key)||allDef.includes(key))return;
    setSbTfCustom(prev=>[...prev,key]);
    setStratBTimeframes(prev=>(prev||[]).includes(key)?(prev||[]):[...(prev||[]),key]);
    setTfCustomVal('');
  };

  React.useEffect(()=>{
    if(!tfPickOpen)return;
    const h=e=>{if(tfPickWrapRef.current&&!tfPickWrapRef.current.contains(e.target))setTfPickOpen(false);};
    document.addEventListener('mousedown',h);
    return()=>document.removeEventListener('mousedown',h);
  },[tfPickOpen]);

  const ToggleRow = ({label,opts,value,onChange}) => (
    <div style={{marginBottom:22}}>
      <div style={lbl}>{label}</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        {opts.map(o=>(
          <div key={o.id} onClick={()=>onChange(o.id)} style={tbtn(value===o.id)}
            onMouseEnter={e=>{if(value!==o.id)e.currentTarget.style.borderColor=c.tx;}}
            onMouseLeave={e=>{if(value!==o.id)e.currentTarget.style.borderColor=c.brH;}}>
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{flex:1,padding:'24px 28px',overflowY:'auto',fontFamily:F}} className="tlr-scroll">
      <div style={{maxWidth:640,margin:'0 auto'}}>

        {/* ── Section: Strategy Name + Description ── */}
        <div style={{marginBottom:14,background:c.sf,border:`1px solid ${requiredBorder('name')}`,padding:'14px 16px',boxShadow:requiredGlow('name'),transition:'border-color 0.12s, box-shadow 0.12s'}}>
        {/* Strategy Name + emoji button — input left, button right, same row height via grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',columnGap:12,marginBottom:16}}>
          {/* Row 1: label | blank */}
          <div style={lbl}>Strategy Name <span style={{color:c.rd}}>*</span></div>
          <div/>
          {/* Row 2: input | button — same grid row = same height */}
          <input value={stratBName||''} onChange={e=>setStratBName(e.target.value)}
            placeholder="e.g. BB Squeeze Fade" style={{...inp,border:'1px solid '+requiredBorder('name')}} maxLength={80}
            aria-label="Strategy name"
            onFocus={e=>e.target.style.borderColor=c.acL}
            onBlur={e=>e.target.style.borderColor=requiredBorder('name')}/>
          <div ref={emojiRef} style={{display:'flex',position:'relative'}}>
            <div ref={emojiBtnRef} onClick={openEmoji}
              role="button" tabIndex={0}
              aria-label={stratBLogoEmoji ? 'Change strategy emoji' : 'Choose strategy emoji'}
              title={stratBLogoEmoji ? 'Change strategy emoji' : 'Choose strategy emoji'}
              style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
                aspectRatio:'1',background:c.sf,border:'1px solid '+(emojiHov||emojiOpen?c.acB:c.brH),
                cursor:'default',userSelect:'none',color:stratBLogoEmoji?'initial':(emojiHov||emojiOpen?c.acL:c.tm),
                fontSize:stratBLogoEmoji?20:13,lineHeight:1,transition:'border-color 0.12s, color 0.12s'}}
              onMouseEnter={e=>setEmojiHov(true)} onMouseLeave={e=>setEmojiHov(false)}>
              {stratBLogoEmoji ? stratBLogoEmoji : (
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={{display:'block'}}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
                  <circle cx="8.8" cy="10" r="1.15" fill="currentColor"/>
                  <circle cx="15.2" cy="10" r="1.15" fill="currentColor"/>
                  <path d="M7.8 14c1.1 1.7 2.5 2.4 4.2 2.4s3.1-.7 4.2-2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            {stratBLogoEmoji&&(
              <div onClick={e=>{e.stopPropagation();setStratBLogoEmoji('');setEmojiHov(false);}}
                role="button" tabIndex={0} aria-label="Remove strategy emoji" title="Remove emoji"
                style={{position:'absolute',top:-6,right:-6,width:16,height:16,display:'flex',
                  alignItems:'center',justifyContent:'center',
                  cursor:'default',zIndex:2,color:'rgba(255,255,255,0.85)',
                  background:'rgba(30,30,40,0.80)',transition:'background 0.12s',
                  userSelect:'none',pointerEvents:'all'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(220,40,60,0.90)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(30,30,40,0.80)'}>
                <svg width={8} height={8} viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <div style={{...lbl,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span>Description</span>
            <span style={{fontSize:9,fontWeight:600,color:(stratBDesc||'').length>=480?c.rd:c.tm,fontVariantNumeric:'tabular-nums'}}>{(stratBDesc||'').length}/500</span>
          </div>
          <textarea value={stratBDesc||''} onChange={e=>setStratBDesc(e.target.value)}
            placeholder="Core thesis, when it works, what to watch for…"
            rows={5} maxLength={500} aria-label="Strategy description"
            style={{...inp,resize:'none',lineHeight:1.55,minHeight:120}}
            onFocus={e=>e.target.style.borderColor=c.acL}
            onBlur={e=>e.target.style.borderColor=c.brH}/>
        </div>
        </div>

        {/* ── Section: Tags ── */}
        <div style={{marginBottom:14,background:c.sf,border:`1px solid ${c.brH}`,padding:'14px 16px'}}>
          <div style={lbl}>Tags</div>
          <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:6,rowGap:4}}>
            <div ref={tagWrapRef} style={{position:'relative',display:'inline-block',flexShrink:0}}>
              <div onClick={e=>{
                e.stopPropagation();
                if (tagDropOpen) { setTagDropOpen(false); return; }
                const r = tagWrapRef.current?.getBoundingClientRect();
                if (r) {
                  const w = 240;
                  const safeH = window.innerHeight - 16;
                  const below = safeH - r.bottom;
                  const above = r.top - 10;
                  const flip = below < 200 && above > below;
                  setTagDropPos({
                    top: flip ? Math.max(8, r.top - Math.min(320, above) - 6) : r.bottom + 4,
                    left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
                    maxH: flip ? Math.min(320, above) : Math.max(120, below - 8),
                  });
                }
                setTagDropOpen(true);
              }}
                style={{display:'flex',alignItems:'center',border:`1px solid ${tagDropOpen?c.acB:c.brH}`,background:c.el,padding:'0 26px 0 10px',height:30,minWidth:140,cursor:'default',userSelect:'none',position:'relative',transition:'border-color 0.12s'}}>
                <span style={{fontSize:11,fontWeight:600,fontFamily:F,color:c.ts}}>
                  {tags.length?`Tags · ${tags.length}/${MAX_TAGS}`:'Choose tags'}
                </span>
                <svg style={{position:'absolute',right:7,top:'50%',transform:`translateY(-50%) rotate(${tagDropOpen?180:0}deg)`,transition:'transform 0.15s',pointerEvents:'none'}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              {tagDropOpen && createPortal(
                <div ref={tagMenuRef} onClick={e=>e.stopPropagation()}
                  style={{position:'fixed',top:tagDropPos.top,left:tagDropPos.left,width:240,maxHeight:tagDropPos.maxH,display:'flex',flexDirection:'column',background:c.sf,border:'1px solid rgba(140,160,255,0.22)',boxShadow:'0 8px 28px rgba(0,0,0,0.7)',zIndex:100020,fontFamily:F}}>
                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                  <div className="tlr-scroll" style={{flex:1,overflowY:'auto',minHeight:0}}>
                    {allTagOptions.map(t => {
                      const checked = tags.includes(t);
                      const isH = tagHov === t;
                      const disabled = !checked && tags.length >= MAX_TAGS;
                      return (
                        <div key={t} onClick={()=>{ if(disabled) return; toggleTag(t); }}
                          onMouseEnter={()=>setTagHov(t)} onMouseLeave={()=>setTagHov(null)}
                          style={{position:'relative',display:'flex',alignItems:'center',padding:'5px 10px',gap:8,cursor:'default',
                            opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto',
                            background:checked?'rgba(38,67,247,0.06)':isH?'rgba(255,255,255,0.04)':'transparent',transition:'background 0.08s, opacity 0.12s'}}>
                          {checked && <div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                          <svg width={10} height={10} viewBox="0 0 10 10" style={{display:'block',overflow:'visible',flexShrink:0}}>
                            <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={checked?c.acL:isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                            <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={checked?c.acL:isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                            {!checked&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.ts} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.65}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.ts} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.65}/></>}
                            {checked&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill={c.acL}/></>}
                          </svg>
                          <span style={{fontSize:11,fontWeight:checked?600:400,color:checked&&isH?c.acL:c.ts,fontFamily:F}}>{t}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{flexShrink:0,borderTop:`1px solid ${c.brH}`,padding:'8px 10px',display:'flex',alignItems:'center',gap:6}}>
                    <div style={{flex:1,display:'flex',alignItems:'center',border:`1px solid ${tagInputFocus?c.acB:c.brH}`,background:c.el,height:24,padding:'0 8px',transition:'border-color 0.12s'}}>
                      <input value={tagInput} onChange={e=>setTagInput(e.target.value)}
                        onFocus={()=>setTagInputFocus(true)} onBlur={()=>setTagInputFocus(false)}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag(tagInput);setTagInput('');}}}
                        placeholder="Create custom tag…"
                        style={{flex:1,background:'transparent',border:'none',outline:'none',color:c.tx,fontSize:10,fontFamily:F,minWidth:0}}/>
                    </div>
                    <div onClick={()=>{if(tagInput.trim()){addTag(tagInput);setTagInput('');}}}
                      style={{display:'inline-flex',alignItems:'center',gap:3,padding:'0 10px',height:24,background:tagInput.trim()?`linear-gradient(135deg,${c.ac},${c.acL})`:'rgba(140,160,255,0.10)',border:`1px solid ${tagInput.trim()?'rgba(74,106,255,0.5)':'rgba(140,160,255,0.18)'}`,fontSize:9,fontWeight:700,color:tagInput.trim()?'#fff':c.tm,letterSpacing:'0.04em',cursor:'default',opacity:tagInput.trim()?1:0.55,transition:'background 0.12s',textTransform:'uppercase'}}>
                      <svg width={9} height={9} viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
                      Add
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
            {tags.map(t => (
              <div key={t} onClick={()=>removeTag(t)} onMouseEnter={()=>setTagHov(`sel-tag-${t}`)} onMouseLeave={()=>setTagHov(null)} style={{padding:'4px 6px',position:'relative',cursor:'default'}}>
                <span style={{fontSize:12,fontWeight:700,color:tagHov===`sel-tag-${t}`?c.acL:c.ts,fontFamily:F}}>{t}</span>
                <div style={{position:'absolute',bottom:-1,left:'10%',right:'10%',height:1.5,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 5px ${c.acG}`,pointerEvents:'none'}}/>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section: Markets ── */}
        <div style={{marginBottom:14,background:c.sf,border:`1px solid ${requiredBorder('markets')}`,padding:'14px 16px',boxShadow:requiredGlow('markets'),transition:'border-color 0.12s, box-shadow 0.12s'}}>
          <div style={lbl}>Markets <span style={{color:c.rd}}>*</span></div>
          <div ref={mktWrapRef} style={{position:'relative',display:'inline-block'}}>
            <div onClick={e=>{e.stopPropagation();if(mktDropOpen){setMktDropOpen(false);}else{const pos=dropPos(mktWrapRef,210,100,200,false);if(pos)setMktDropPos(pos);setMktDropOpen(true);}}}
              style={{display:'flex',alignItems:'center',border:`1px solid ${mktDropOpen?c.acB:requiredBorder('markets')}`,background:c.el,padding:'0 26px 0 10px',height:30,width:210,cursor:'default',userSelect:'none',position:'relative',transition:'border-color 0.12s'}}>
              {(()=>{
                const sel=stratBMarkets||[];
                const label=sel.length===0?'None':sel.length===MKT_CAT_OPTS.length?'All markets':sel.map(id=>MKT_CAT_OPTS.find(o=>o.id===id)?.label||id).join(', ');
                return <span style={{flex:1,fontSize:11,fontWeight:600,fontFamily:F,color:sel.length?c.tx:c.tm}}>{label}</span>;
              })()}
              <svg style={{position:'absolute',right:7,top:'50%',transform:`translateY(-50%) rotate(${mktDropOpen?180:0}deg)`,transition:'transform 0.15s',pointerEvents:'none'}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            {mktDropOpen&&(
              <div style={{position:'fixed',top:mktDropPos.top,left:mktDropPos.left,width:210,maxHeight:mktDropPos.maxH,overflowY:'auto',background:c.sf,border:'1px solid rgba(140,160,255,0.22)',boxShadow:'0 8px 28px rgba(0,0,0,0.7)',zIndex:100020,fontFamily:F}}>
                <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                {MKT_CAT_OPTS.map(o=>{
                  const checked=(stratBMarkets||[]).includes(o.id);
                  const isH=mktHov===o.id;
                  return(
                    <div key={o.id} onClick={e=>{e.stopPropagation();toggleMkt(o.id);}}
                      onMouseEnter={()=>setMktHov(o.id)} onMouseLeave={()=>setMktHov(null)}
                      style={{position:'relative',display:'flex',alignItems:'center',padding:'5px 10px',gap:8,cursor:'default',
                        background:checked?'rgba(38,67,247,0.06)':isH?'rgba(255,255,255,0.04)':'transparent',transition:'background 0.08s'}}>
                      {checked&&<div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                      <svg width={10} height={10} viewBox="0 0 10 10" style={{display:'block',overflow:'visible',flexShrink:0}}>
                        <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={checked?c.acL:isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                        <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={checked?c.acL:isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                        {!checked&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/></>}
                        {checked&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill={c.acL}/></>}
                      </svg>
                      <span style={{fontSize:11,fontWeight:checked?600:400,color:checked?c.acL:c.ts,fontFamily:F}}>{o.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Section: Trading + Supporting symbols ── */}
        <div style={{marginBottom:14,background:c.sf,border:`1px solid ${trdPickOpen||supPickOpen?c.acB:c.brH}`,transition:'border-color 0.12s'}}>
          {/* ── TRADING section ── */}
          <div style={{padding:'8px 10px 0'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:2,height:8,background:c.acL,flexShrink:0,boxShadow:`0 0 4px ${c.acG}`}}/>
                <span style={{fontSize:10,fontWeight:800,color:c.ts,letterSpacing:'0.1em',fontFamily:F}}>TRADING</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                {(stratBInstruments||[]).length>0&&(
                  <div onClick={e=>{e.stopPropagation();setStratBInstruments([]);}}
                    style={{display:'flex',alignItems:'center',cursor:'default',color:c.tm,transition:'color 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.color=c.rd}
                    onMouseLeave={e=>e.currentTarget.style.color=c.tm}>
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </div>
                )}
                <span style={{fontSize:10,fontWeight:700,color:c.tm,fontFamily:F}}>{(stratBInstruments||[]).length||'—'}</span>
              </div>
            </div>
          </div>
          <div style={{padding:'4px 8px 10px',display:'flex',gap:6,alignItems:'stretch'}}>
            <div ref={trdWrapRef} style={{position:'relative',flexShrink:0}}>
              <div
                onClick={e=>{e.stopPropagation();if(trdPickOpen){setTrdPickOpen(false);}else{const pos=dropPos(trdWrapRef,270,120,320,true);if(pos)setTrdPickPos(pos);setTrdPickSearch('');setTrdPickCat(null);setTrdPickOpen(true);setSupPickOpen(false);}}}

                style={{width:26,height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#1e38e8,#4A6AFF)',cursor:'default',transition:'filter 0.12s',boxShadow:'0 2px 8px rgba(38,67,247,0.35)'}}
                onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.12)'}
                onMouseLeave={e=>e.currentTarget.style.filter='brightness(1)'}>
                <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                  <line x1="6" y1="1" x2="6" y2="11" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                  <line x1="1" y1="6" x2="11" y2="6" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              {trdPickOpen&&(()=>{
                const cats=(stratBMarkets||[]).map(x=>x.toLowerCase());
                const showAll=cats.length===0;
                const sections=[
                  ...(showAll||cats.includes('forex')?[{cat:'forex',title:'Forex pairs',opts:FOREX_INSTRUMENTS},{cat:'forex',title:'Commodities (CFD)',opts:COMMODITY_CFD_INSTRUMENTS}]:[]),
                  ...(showAll||cats.includes('futures')?[{cat:'futures',title:'Futures',opts:FUTURES_INSTRUMENTS}]:[]),
                  ...(showAll||cats.includes('crypto')?[{cat:'crypto',title:'Crypto',opts:CRYPTO_INSTRUMENTS}]:[]),
                  ...(showAll||cats.includes('stocks')?[{cat:'stocks',title:'Stocks',opts:STOCKS_INSTRUMENTS}]:[]),
                ];
                const q=trdPickSearch.trim().toLowerCase();
                const availCats=[...new Set(sections.map(s=>s.cat))];
                const visSections=trdPickCat?sections.filter(s=>s.cat===trdPickCat):sections;
                const atTrdCap=(stratBInstruments||[]).length>=10;
                const mkRow=(opt,isChk,isH,onClick)=>{
                  const fl=getInstFlags(opt.id);
                  const sym=!fl?getInstSym(opt.id):null;
                  const isDisabled=atTrdCap&&!isChk;
                  return(
                  <div key={opt.id} onClick={isDisabled?undefined:onClick}
                    onMouseEnter={()=>setTrdPickHov('t_'+opt.id)} onMouseLeave={()=>setTrdPickHov(null)}
                    style={{position:'relative',display:'flex',alignItems:'center',padding:'5px 10px',gap:8,cursor:'default',
                      opacity:isDisabled?0.35:1,pointerEvents:isDisabled?'none':'auto',
                      background:isH&&!isChk?'rgba(255,255,255,0.04)':isChk?'rgba(38,67,247,0.06)':'transparent',transition:'background 0.08s'}}>
                    {isChk&&<div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                    <svg width={10} height={10} style={{display:'block',overflow:'visible',flexShrink:0}}>
                      <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={isChk?c.acL:isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                      <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={isChk?c.acL:isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                      {!isChk&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/></>}
                      {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill={c.acL}/></>}
                    </svg>
                    <div style={{width:27,height:12,flexShrink:0,position:'relative'}}>
                      {fl?(fl.single?<div style={{borderRadius:1,overflow:'hidden'}}><FlagSvg code={fl.single} w={27} h={12}/></div>:<><div style={{position:'absolute',left:0,top:0,borderRadius:1,overflow:'hidden',boxShadow:'0 2px 4px rgba(0,0,0,0.8)',zIndex:2}}><FlagSvg code={fl.base} w={18} h={12}/></div><div style={{position:'absolute',left:9,top:0,borderRadius:1,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.6)',zIndex:1}}><FlagSvg code={fl.quote} w={18} h={12}/></div></>):sym?<SymBadge sym={sym} w={27} h={12}/>:null}
                    </div>
                    <span style={{fontSize:11,color:isChk?c.acL:c.ts,fontWeight:isChk?600:400}}>{opt.label}</span>
                  </div>
                  );
                };
                return(
                  <div style={{position:'fixed',top:trdPickPos.top,left:trdPickPos.left,width:270,maxHeight:trdPickPos.maxH,display:'flex',flexDirection:'column',background:c.sf,border:'1px solid rgba(140,160,255,0.22)',boxShadow:'0 8px 28px rgba(0,0,0,0.7)',zIndex:100020,fontFamily:F}}>
                    <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                    <div style={{padding:'5px 8px',borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                      <input autoFocus value={trdPickSearch} onChange={e=>setTrdPickSearch(e.target.value)} placeholder="Search symbols…"
                        style={{width:'100%',background:'transparent',border:'none',outline:'none',color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0,boxSizing:'border-box'}}/>
                    </div>
                    {availCats.length>1&&(
                      <div style={{display:'flex',borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                        {[{id:null,label:'All'},...availCats.map(id=>({id,label:id.charAt(0).toUpperCase()+id.slice(1)}))].map(tab=>{
                          const active=trdPickCat===tab.id;
                          return(
                            <div key={tab.id||'all'} onClick={()=>setTrdPickCat(tab.id)}
                              style={{position:'relative',height:26,display:'flex',alignItems:'center',padding:'0 10px',cursor:'default',
                                color:active?c.acL:c.ts,background:active?c.acD:'transparent',
                                fontSize:9,fontWeight:800,letterSpacing:'0.07em',textTransform:'uppercase',fontFamily:F,transition:'background 0.12s,color 0.12s'}}
                              onMouseEnter={e=>{if(!active){e.currentTarget.style.background='rgba(255,255,255,0.06)';e.currentTarget.style.color=c.tx;}}}
                              onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color=c.ts;}}}>
                              {tab.label}
                              {active&&<div style={{position:'absolute',bottom:0,left:'10%',right:'10%',height:1.5,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`}}/>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="tlr-scroll" style={{overflowY:'auto',flex:1}}>
                      {visSections.map(sec=>{
                        const filtered=q?sec.opts.filter(o=>o.label.toLowerCase().includes(q)||o.id.includes(q)):sec.opts;
                        if(!filtered.length)return null;
                        return(<div key={sec.title} style={{borderBottom:'1px solid rgba(140,160,255,0.1)'}}>
                          <div style={{padding:'5px 10px 2px',fontSize:9,fontWeight:700,color:c.tm,letterSpacing:'0.08em',textTransform:'uppercase',position:'sticky',top:0,background:c.sf,zIndex:1}}>{sec.title}</div>
                          {filtered.map(opt=>{const isChk=(stratBInstruments||[]).includes(opt.id);const isH=trdPickHov==='t_'+opt.id;return mkRow(opt,isChk,isH,()=>toggleInst(opt.id));})}
                        </div>);
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div style={{flex:1,display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4,alignContent:'start',height:48,overflow:'hidden'}}>
              {(stratBInstruments||[]).length===0&&<span style={{fontSize:9,color:c.tm,fontFamily:F,lineHeight:'48px',gridColumn:'1/-1',textAlign:'center'}}>—</span>}
              {(stratBInstruments||[]).map(id=>{
                const inst=ALL_INSTRUMENTS.find(o=>o.id===id)||{label:id};
                const fl=getInstFlags(id);
                return(
                  <div key={id} style={{display:'flex',alignItems:'center',padding:'4px 5px 4px 6px',background:c.sf,border:`1px solid ${c.brH}`,gap:4,minWidth:0,justifyContent:'space-between'}}>
                    {(()=>{const sym2=!fl?getInstSym(id):null;return(<div style={{width:fl?fl.single?20:25:sym2?27:0,height:10,flexShrink:0,position:'relative'}}>{fl?(fl.single?<div style={{borderRadius:1,overflow:'hidden'}}><FlagSvg code={fl.single} w={20} h={10}/></div>:<><div style={{position:'absolute',left:0,top:0,borderRadius:1,overflow:'hidden',boxShadow:'0 2px 4px rgba(0,0,0,0.8)',zIndex:2}}><FlagSvg code={fl.base} w={16} h={10}/></div><div style={{position:'absolute',left:8,top:0,borderRadius:1,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.6)',zIndex:1}}><FlagSvg code={fl.quote} w={16} h={10}/></div></>):sym2?<SymBadge sym={sym2} w={27} h={10}/>:null}</div>);})()}
                    <span style={{fontSize:10,fontWeight:700,color:c.tx,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0,flex:1}}>{inst.label}</span>
                    <span onClick={e=>{e.stopPropagation();toggleInst(id);}} style={{fontSize:11,lineHeight:1,color:c.tm,cursor:'default',transition:'color 0.1s',flexShrink:0}}
                      onMouseEnter={e=>e.currentTarget.style.color=c.rd} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{height:1,background:c.brH}}/>

          {/* ── SUPPORTING section ── */}
          <div style={{padding:'8px 10px 0'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <div style={{width:2,height:8,background:'rgba(232,194,82,0.8)',flexShrink:0,boxShadow:'0 0 4px rgba(232,194,82,0.3)'}}/>
                <span style={{fontSize:10,fontWeight:800,color:c.ts,letterSpacing:'0.1em',fontFamily:F}}>SUPPORTING</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                {(stratBSupportInst||[]).length>0&&(
                  <div onClick={e=>{e.stopPropagation();setStratBSupportInst([]);}}
                    style={{display:'flex',alignItems:'center',cursor:'default',color:c.tm,transition:'color 0.1s'}}
                    onMouseEnter={e=>e.currentTarget.style.color=c.rd}
                    onMouseLeave={e=>e.currentTarget.style.color=c.tm}>
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </div>
                )}
                <span style={{fontSize:10,fontWeight:700,color:c.tm,fontFamily:F}}>{(stratBSupportInst||[]).length||'—'}</span>
              </div>
            </div>
          </div>
          <div style={{padding:'4px 8px 10px',display:'flex',gap:6,alignItems:'stretch'}}>
            <div ref={supWrapRef} style={{position:'relative',flexShrink:0}}>
              <div
                onClick={e=>{e.stopPropagation();if(supPickOpen){setSupPickOpen(false);}else{const pos=dropPos(supWrapRef,270,120,320,true);if(pos)setSupPickPos(pos);setSupPickSearch('');setSupPickCat(null);setSupPickOpen(true);setTrdPickOpen(false);}}}
                style={{width:26,height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#7A5A00,rgba(232,194,82,0.9))',cursor:'default',transition:'filter 0.12s',boxShadow:'0 2px 8px rgba(201,168,76,0.3)'}}
                onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.12)'}
                onMouseLeave={e=>e.currentTarget.style.filter='brightness(1)'}>
                <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                  <line x1="6" y1="1" x2="6" y2="11" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                  <line x1="1" y1="6" x2="11" y2="6" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              {supPickOpen&&(()=>{
                const cats=(stratBMarkets||[]).map(x=>x.toLowerCase());
                const showAll=cats.length===0;
                const sections=[
                  ...(showAll||cats.includes('forex')?[{cat:'forex',title:'Forex pairs',opts:FOREX_INSTRUMENTS},{cat:'forex',title:'Commodities (CFD)',opts:COMMODITY_CFD_INSTRUMENTS}]:[]),
                  ...(showAll||cats.includes('futures')?[{cat:'futures',title:'Futures',opts:FUTURES_INSTRUMENTS}]:[]),
                  ...(showAll||cats.includes('crypto')?[{cat:'crypto',title:'Crypto',opts:CRYPTO_INSTRUMENTS}]:[]),
                  ...(showAll||cats.includes('stocks')?[{cat:'stocks',title:'Stocks',opts:STOCKS_INSTRUMENTS}]:[]),
                ];
                const q=supPickSearch.trim().toLowerCase();
                const availCats=[...new Set(sections.map(s=>s.cat))];
                const visSections=supPickCat?sections.filter(s=>s.cat===supPickCat):sections;
                const atSupCap=(stratBSupportInst||[]).length>=10;
                const mkRow=(opt,isChk,isH,onClick)=>{
                  const fl=getInstFlags(opt.id);
                  const sym=!fl?getInstSym(opt.id):null;
                  const isDisabled=atSupCap&&!isChk;
                  return(
                  <div key={opt.id} onClick={isDisabled?undefined:onClick}
                    onMouseEnter={()=>setSupPickHov('s_'+opt.id)} onMouseLeave={()=>setSupPickHov(null)}
                    style={{position:'relative',display:'flex',alignItems:'center',padding:'5px 10px',gap:8,cursor:'default',
                      opacity:isDisabled?0.35:1,pointerEvents:isDisabled?'none':'auto',
                      background:isH&&!isChk?'rgba(255,255,255,0.04)':isChk?'rgba(201,168,76,0.08)':'transparent',transition:'background 0.08s'}}>
                    {isChk&&<div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:'linear-gradient(180deg,transparent,rgba(232,194,82,0.9),transparent)',boxShadow:'0 0 6px rgba(232,194,82,0.3)'}}/>}
                    <svg width={10} height={10} style={{display:'block',overflow:'visible',flexShrink:0}}>
                      <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={isChk?'rgba(232,194,82,0.9)':isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                      <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={isChk?'rgba(232,194,82,0.9)':isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                      {!isChk&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.9)" strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.9)" strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/></>}
                      {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.9)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.9)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill="rgba(232,194,82,0.9)" opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill="rgba(232,194,82,0.9)"/></>}
                    </svg>
                    <div style={{width:27,height:12,flexShrink:0,position:'relative'}}>
                      {fl?(fl.single?<div style={{borderRadius:1,overflow:'hidden'}}><FlagSvg code={fl.single} w={27} h={12}/></div>:<><div style={{position:'absolute',left:0,top:0,borderRadius:1,overflow:'hidden',boxShadow:'0 2px 4px rgba(0,0,0,0.8)',zIndex:2}}><FlagSvg code={fl.base} w={18} h={12}/></div><div style={{position:'absolute',left:9,top:0,borderRadius:1,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.6)',zIndex:1}}><FlagSvg code={fl.quote} w={18} h={12}/></div></>):sym?<SymBadge sym={sym} w={27} h={12}/>:null}
                    </div>
                    <span style={{fontSize:11,color:isChk?'rgba(232,194,82,0.9)':c.ts,fontWeight:isChk?600:400}}>{opt.label}</span>
                  </div>
                  );
                };
                return(
                  <div style={{position:'fixed',top:supPickPos.top,left:supPickPos.left,width:270,maxHeight:supPickPos.maxH,display:'flex',flexDirection:'column',background:c.sf,border:'1px solid rgba(140,160,255,0.22)',boxShadow:'0 8px 28px rgba(0,0,0,0.7)',zIndex:100020,fontFamily:F}}>
                    <div style={{height:2,background:'linear-gradient(90deg,rgba(201,168,76,0.3),rgba(232,194,82,0.8),rgba(201,168,76,0.3))',flexShrink:0}}/>
                    <div style={{padding:'5px 8px',borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                      <input autoFocus value={supPickSearch} onChange={e=>setSupPickSearch(e.target.value)} placeholder="Search symbols…"
                        style={{width:'100%',background:'transparent',border:'none',outline:'none',color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0,boxSizing:'border-box'}}/>
                    </div>
                    {availCats.length>1&&(
                      <div style={{display:'flex',borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                        {[{id:null,label:'All'},...availCats.map(id=>({id,label:id.charAt(0).toUpperCase()+id.slice(1)}))].map(tab=>{
                          const active=supPickCat===tab.id;
                          const gold='rgba(232,194,82,0.9)';
                          return(
                            <div key={tab.id||'all'} onClick={()=>setSupPickCat(tab.id)}
                              style={{position:'relative',height:26,display:'flex',alignItems:'center',padding:'0 10px',cursor:'default',
                                color:active?gold:c.ts,background:active?'rgba(201,168,76,0.10)':'transparent',
                                fontSize:9,fontWeight:800,letterSpacing:'0.07em',textTransform:'uppercase',fontFamily:F,transition:'background 0.12s,color 0.12s'}}
                              onMouseEnter={e=>{if(!active){e.currentTarget.style.background='rgba(255,255,255,0.06)';e.currentTarget.style.color=c.tx;}}}
                              onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color=c.ts;}}}>
                              {tab.label}
                              {active&&<div style={{position:'absolute',bottom:0,left:'10%',right:'10%',height:1.5,background:`linear-gradient(90deg,transparent,${gold},transparent)`,boxShadow:`0 0 4px rgba(232,194,82,0.5)`}}/>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="tlr-scroll" style={{overflowY:'auto',flex:1}}>
                      {visSections.map(sec=>{
                        const filtered=q?sec.opts.filter(o=>o.label.toLowerCase().includes(q)||o.id.includes(q)):sec.opts;
                        if(!filtered.length)return null;
                        return(<div key={sec.title} style={{borderBottom:'1px solid rgba(140,160,255,0.1)'}}>
                          <div style={{padding:'5px 10px 2px',fontSize:9,fontWeight:700,color:c.tm,letterSpacing:'0.08em',textTransform:'uppercase',position:'sticky',top:0,background:c.sf,zIndex:1}}>{sec.title}</div>
                          {filtered.map(opt=>{const isChk=(stratBSupportInst||[]).includes(opt.id);const isH=supPickHov==='s_'+opt.id;return mkRow(opt,isChk,isH,()=>setStratBSupportInst(prev=>{const c2=prev||[];if(!c2.includes(opt.id)&&c2.length>=10)return c2;return c2.includes(opt.id)?c2.filter(x=>x!==opt.id):[...c2,opt.id];}));})}
                        </div>);
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div style={{flex:1,display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4,alignContent:'start',height:48,overflow:'hidden'}}>
              {(stratBSupportInst||[]).length===0&&<span style={{fontSize:9,color:c.tm,fontFamily:F,lineHeight:'48px',gridColumn:'1/-1',textAlign:'center'}}>—</span>}
              {(stratBSupportInst||[]).map(id=>{
                const inst=ALL_INSTRUMENTS.find(o=>o.id===id)||{label:id};
                const fl=getInstFlags(id);
                return(
                  <div key={id} style={{display:'flex',alignItems:'center',padding:'4px 5px 4px 6px',background:c.sf,border:`1px solid ${c.brH}`,gap:4,minWidth:0,justifyContent:'space-between'}}>
                    {(()=>{const sym2=!fl?getInstSym(id):null;return(<div style={{width:fl?fl.single?20:25:sym2?27:0,height:10,flexShrink:0,position:'relative'}}>{fl?(fl.single?<div style={{borderRadius:1,overflow:'hidden'}}><FlagSvg code={fl.single} w={20} h={10}/></div>:<><div style={{position:'absolute',left:0,top:0,borderRadius:1,overflow:'hidden',boxShadow:'0 2px 4px rgba(0,0,0,0.8)',zIndex:2}}><FlagSvg code={fl.base} w={16} h={10}/></div><div style={{position:'absolute',left:8,top:0,borderRadius:1,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.6)',zIndex:1}}><FlagSvg code={fl.quote} w={16} h={10}/></div></>):sym2?<SymBadge sym={sym2} w={27} h={10}/>:null}</div>);})()}
                    <span style={{fontSize:10,fontWeight:700,color:c.tx,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0,flex:1}}>{inst.label}</span>
                    <span onClick={e=>{e.stopPropagation();setStratBSupportInst(prev=>(prev||[]).filter(x=>x!==id));}} style={{fontSize:11,lineHeight:1,color:c.tm,cursor:'default',transition:'color 0.1s',flexShrink:0}}
                      onMouseEnter={e=>e.currentTarget.style.color=c.rd} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Section: Timeframes ── */}
        <div style={{marginBottom:14,background:c.sf,border:`1px solid ${requiredBorder('timeframes')}`,padding:'14px 16px',boxShadow:requiredGlow('timeframes'),transition:'border-color 0.12s, box-shadow 0.12s'}}>
          <div style={lbl}>Timeframes to use <span style={{color:c.rd}}>*</span></div>
          <div style={{display:'flex',alignItems:'flex-start',gap:5,flexWrap:'wrap'}}>
            <div ref={tfPickWrapRef} style={{position:'relative',flexShrink:0}}>
              <div onClick={e=>{e.stopPropagation();if(tfPickOpen){setTfPickOpen(false);}else{const pos=dropPos(tfPickWrapRef,200,120,360,true);if(pos)setTfPickPos(pos);setTfPickOpen(true);}}}
                style={{width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#1e38e8,#4A6AFF)',cursor:'default',transition:'filter 0.12s',boxShadow:'0 2px 8px rgba(38,67,247,0.35)'}}
                onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.12)'}
                onMouseLeave={e=>e.currentTarget.style.filter='brightness(1)'}>
                <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                  <line x1="6" y1="1" x2="6" y2="11" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                  <line x1="1" y1="6" x2="11" y2="6" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              {tfPickOpen&&(
                <div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:tfPickPos.top,left:tfPickPos.left,width:200,maxHeight:tfPickPos.maxH,display:'flex',flexDirection:'column',background:c.sf,border:`1px solid ${c.brH}`,boxShadow:'0 8px 32px rgba(0,0,0,0.7)',zIndex:100020,fontFamily:F}}>
                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                  <div className="tlr-scroll" style={{overflowY:'auto',flex:1,padding:'4px 0'}}>
                    {Object.entries(tfCategories).map(([catId,{label,items}],ci)=>(
                      <div key={catId}>
                        {ci>0&&<div style={{height:1,margin:'3px 0',background:`linear-gradient(90deg,transparent,${c.br},transparent)`}}/>}
                        <div style={{padding:'4px 10px 2px',fontSize:9,fontWeight:700,color:c.tm,letterSpacing:'0.07em'}}>{label.toUpperCase()}</div>
                        {items.map(t=>{
                          const isChk=tfs.includes(t);
                          const isCustom=sbTfCustom.includes(t);
                          const isH=tfPickHov===`tf-${t}`;
                          const isDelH=tfPickHov===`tfdel-${t}`;
                          const isRowH=isH||isDelH;
                          return(
                            <div key={t} onClick={()=>toggleTf(t)} onMouseEnter={()=>setTfPickHov(`tf-${t}`)} onMouseLeave={()=>setTfPickHov(null)}
                              style={{display:'flex',alignItems:'center',padding:'3px 10px',gap:6,position:'relative',cursor:'default',
                                background:isChk?c.acD:isRowH?'rgba(255,255,255,0.025)':'transparent',transition:'background 0.1s'}}>
                              {isChk&&<div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                              <svg width={10} height={10} viewBox="0 0 10 10" style={{display:'block',overflow:'visible',flexShrink:0}}>
                                <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={isChk?c.acL:isRowH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={isChk?c.acL:isRowH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                {!isChk&&isRowH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.ts} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.65}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.ts} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.65}/></>}
                                {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill={c.acL}/></>}
                              </svg>
                              <span style={{flex:1,color:isChk&&isRowH?c.acL:c.ts,fontSize:13,fontWeight:isChk?700:500,fontFamily:F}}>{t}</span>
                              {isCustom&&(
                                <div onClick={e=>{e.stopPropagation();setSbTfCustom(prev=>prev.filter(x=>x!==t));setStratBTimeframes(prev=>(prev||[]).filter(x=>x!==t));}}
                                  onMouseEnter={()=>setTfPickHov(`tfdel-${t}`)} onMouseLeave={()=>setTfPickHov(`tf-${t}`)}
                                  style={{width:14,height:14,display:'flex',alignItems:'center',justifyContent:'center',cursor:'default',flexShrink:0,opacity:isDelH?1:isRowH?0.6:0,transition:'opacity 0.15s'}}>
                                  <svg width={8} height={8} viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke={isDelH?c.rd:c.ts} strokeWidth="3" strokeLinecap="round"/></svg>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div style={{height:1,background:`linear-gradient(90deg,transparent,${c.brH},transparent)`,flexShrink:0}}/>
                  <div style={{padding:'7px 10px 8px',display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                    <div style={{position:'relative',width:34,height:22,flexShrink:0}}>
                      <input type="text" inputMode="numeric" value={tfCustomVal}
                        onChange={e=>setTfCustomVal(e.target.value.replace(/[^0-9]/g,''))}
                        onKeyDown={e=>{if(e.key==='Enter')addCustomTf();}}
                        className="tlr-nospinner"
                        style={{width:34,height:22,background:c.hv,border:'1px solid rgba(140,160,255,0.22)',color:c.tx,fontSize:11,fontFamily:F,padding:'0 4px',outline:'none',textAlign:'center',boxSizing:'border-box',transition:'border-color 0.14s',caretColor:'transparent',position:'relative',zIndex:1}}/>
                      <div style={{position:'absolute',top:4,bottom:4,left:`calc(50% + ${tfCustomVal.length*3.3}px)`,width:1,background:'rgba(160,160,170,0.75)',animation:'tlrBlink 1.1s step-end infinite',zIndex:2,pointerEvents:'none'}}/>
                    </div>
                    {(()=>{
                      const unitLabels={m:'Minutes',H:'Hours',D:'Days',W:'Weeks',M:'Months'};
                      return(
                        <div style={{flex:1,position:'relative'}}>
                          <div onMouseEnter={()=>setTfPickHov('tf-unit-btn')} onMouseLeave={()=>setTfPickHov(null)}
                            onClick={e=>{e.stopPropagation();setTfUnitOpen(v=>!v);}}
                            style={{display:'flex',alignItems:'center',gap:4,padding:'0 6px',height:22,cursor:'default',
                              background:tfPickHov==='tf-unit-btn'||tfUnitOpen?'rgba(140,160,255,0.08)':'rgba(140,160,255,0.04)',
                              border:`1px solid ${tfPickHov==='tf-unit-btn'||tfUnitOpen?'rgba(140,160,255,0.22)':'rgba(140,160,255,0.10)'}`,transition:'all 0.12s'}}>
                            <span style={{flex:1,fontSize:11,color:c.ts,fontFamily:F,whiteSpace:'nowrap'}}>{unitLabels[tfCustomUnit]}</span>
                            <svg width={7} height={5} viewBox="0 0 7 5"><path d="M0,0 L3.5,4.5 L7,0" stroke={c.tm} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                          {tfUnitOpen&&(
                            <div onClick={e=>e.stopPropagation()}
                              style={{position:'absolute',top:'calc(100% + 3px)',left:0,right:0,zIndex:100030,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:'0 6px 20px rgba(0,0,0,0.6)'}}>
                              <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                              {[['m','Minutes'],['H','Hours'],['D','Days'],['W','Weeks'],['M','Months']].map(([u,lbl])=>{
                                const isU=tfCustomUnit===u;
                                const isHU=tfPickHov===`tf-unit-${u}`;
                                return(
                                  <div key={u} onMouseEnter={()=>setTfPickHov(`tf-unit-${u}`)} onMouseLeave={()=>setTfPickHov(null)}
                                    onClick={()=>{setTfCustomUnit(u);setTfUnitOpen(false);}}
                                    style={{padding:'4px 8px',cursor:'default',fontSize:11,fontFamily:F,position:'relative',
                                      color:isU?c.acL:isHU?c.tx:c.ts,background:isU?c.acD:isHU?'rgba(255,255,255,0.025)':'transparent',fontWeight:isU?700:500,transition:'background 0.1s'}}>
                                    {isU&&<div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                    {lbl}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div onClick={addCustomTf}
                      onMouseEnter={()=>setTfPickHov('tf-add')} onMouseLeave={()=>setTfPickHov(null)}
                      style={{width:22,height:22,position:'relative',boxSizing:'border-box',cursor:'default',padding:0,flexShrink:0,
                        background:tfPickHov==='tf-add'?'rgba(74,106,255,0.12)':'transparent',
                        border:`1px solid ${tfPickHov==='tf-add'?'rgba(74,106,255,0.55)':'rgba(140,160,255,0.28)'}`,
                        transition:'background 0.12s,border-color 0.12s'}}>
                      <svg width={7} height={7} viewBox="0 0 10 10" fill="none"
                        stroke={tfPickHov==='tf-add'?c.acL:'rgba(140,160,255,0.55)'}
                        strokeWidth={2.2} strokeLinecap="round"
                        style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',display:'block',pointerEvents:'none'}}>
                        <line x1={5} y1={1} x2={5} y2={9}/><line x1={1} y1={5} x2={9} y2={5}/>
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {tfs.length===0&&<span style={{fontSize:9,color:c.tm,fontFamily:F,lineHeight:'26px'}}>—</span>}
            {tfs.map(t=>(
              <div key={t} onClick={()=>toggleTf(t)} onMouseEnter={()=>setTfPickHov(`sel-tf-${t}`)} onMouseLeave={()=>setTfPickHov(null)} style={{padding:'4px 6px',position:'relative',cursor:'default'}}>
                <span style={{fontSize:12,fontWeight:700,color:tfPickHov===`sel-tf-${t}`?c.acL:c.ts,fontFamily:F}}>{t}</span>
                <div style={{position:'absolute',bottom:-1,left:'10%',right:'10%',height:1.5,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 5px ${c.acG}`,pointerEvents:'none'}}/>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section: Strategy Image ── */}
        <div style={{marginBottom:14,background:c.sf,border:`1px solid ${c.brH}`,padding:'14px 16px'}}>
          <div style={lbl}>Strategy Image</div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={pickCover}/>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {(stratBImages||[]).map((src,i)=>(
              <div key={i}
                style={{position:'relative',width:100,height:70,flexShrink:0}}
                onMouseEnter={()=>setImgHovIdx(i)}
                onMouseLeave={()=>setImgHovIdx(null)}>
                <img src={src} alt="" style={{width:'100%',height:'100%',objectFit:'cover',border:'1px solid '+c.brH}}/>
                {imgHovIdx===i&&(
                  <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1}}>
                    <div onClick={()=>setImgPreview(src)}
                      role="button" tabIndex={0} aria-label="Preview image" title="Preview image"
                      style={{display:'flex',alignItems:'center',justifyContent:'center',cursor:'default',color:'rgba(255,255,255,0.85)',transition:'color 0.15s'}}
                      onMouseEnter={e=>e.currentTarget.style.color='#F5C842'}
                      onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,0.85)'}>
                      <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    </div>
                  </div>
                )}
                <div onClick={()=>setStratBImages(prev=>(prev||[]).filter((_,j)=>j!==i))}
                  role="button" tabIndex={0} aria-label="Remove image" title="Remove image"
                  style={{position:'absolute',top:-6,right:-6,width:16,height:16,display:'flex',alignItems:'center',
                    justifyContent:'center',cursor:'default',zIndex:2,
                    color:'rgba(255,255,255,0.85)',background:'rgba(30,30,40,0.80)',
                    transition:'background 0.12s',userSelect:'none'}}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(220,40,60,0.90)'}
                  onMouseLeave={e=>e.currentTarget.style.background='rgba(30,30,40,0.80)'}>
                  <svg width={8} height={8} viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            ))}
            {(stratBImages||[]).length < 6 && (
              <div onClick={()=>!imgBusy&&fileRef.current?.click()}
                style={{width:100,height:70,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                  gap:4,border:'1px dashed '+c.brH,cursor:'default',color:c.tm,fontSize:10,fontFamily:F,
                  transition:'border-color 0.12s,color 0.12s',opacity:imgBusy?0.5:1}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=c.acL;e.currentTarget.style.color=c.acL;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=c.brH;e.currentTarget.style.color=c.tm;}}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                {imgBusy?'…':'Add'}
              </div>
            )}
          </div>
        </div>


      </div>


      {/* Trading symbols picker — now inline above */}
      {false&&(()=>{
        const cats=(stratBMarkets||[]).map(x=>x.toLowerCase());
        const showAll=cats.length===0;
        const sections=[
          ...(showAll||cats.includes('forex')?[{title:'Forex pairs',opts:FOREX_INSTRUMENTS},{title:'Commodities (CFD)',opts:COMMODITY_CFD_INSTRUMENTS}]:[]),
          ...(showAll||cats.includes('futures')?[{title:'Futures',opts:FUTURES_INSTRUMENTS}]:[]),
          ...(showAll||cats.includes('crypto')?[{title:'Crypto',opts:CRYPTO_INSTRUMENTS}]:[]),
        ];
        const q=trdPickSearch.trim().toLowerCase();
        const mkRow=(opt,isChk,isH,onClick)=>(
          <div key={opt.id} onClick={onClick}
            onMouseEnter={()=>setTrdPickHov('t_'+opt.id)} onMouseLeave={()=>setTrdPickHov(null)}
            style={{position:'relative',display:'flex',alignItems:'center',padding:'5px 10px',gap:8,cursor:'default',
              background:isH&&!isChk?'rgba(255,255,255,0.04)':isChk?'rgba(38,67,247,0.06)':'transparent',transition:'background 0.08s'}}>
            {isChk&&<div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
            <svg width={10} height={10} style={{display:'block',overflow:'visible',flexShrink:0}}>
              <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={isChk?c.acL:isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
              <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={isChk?c.acL:isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
              {!isChk&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/></>}
              {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill={c.acL}/></>}
            </svg>
            <span style={{fontSize:11,color:isChk?c.acL:c.ts,fontWeight:isChk?600:400}}>{opt.label}</span>
          </div>
        );
        return(
          <>
            <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setTrdPickOpen(false)}/>
            <div style={{position:'fixed',top:trdPickPos.top,left:trdPickPos.left,width:190,maxHeight:280,display:'flex',flexDirection:'column',background:c.sf,border:'1px solid rgba(140,160,255,0.22)',boxShadow:'0 8px 28px rgba(0,0,0,0.7)',zIndex:9999,fontFamily:F}}>
              <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
              <div style={{padding:'5px 8px',borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                <input autoFocus value={trdPickSearch} onChange={e=>setTrdPickSearch(e.target.value)} placeholder="Search symbols…"
                  style={{width:'100%',background:'transparent',border:'none',outline:'none',color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0,boxSizing:'border-box'}}/>
              </div>
              <div className="tlr-scroll" style={{overflowY:'auto',flex:1}}>
                {sections.map(sec=>{
                  const filtered=q?sec.opts.filter(o=>o.label.toLowerCase().includes(q)||o.id.includes(q)):sec.opts;
                  if(!filtered.length)return null;
                  return(<div key={sec.title} style={{borderBottom:'1px solid rgba(140,160,255,0.1)'}}>
                    <div style={{padding:'5px 10px 2px',fontSize:9,fontWeight:700,color:c.tm,letterSpacing:'0.08em',textTransform:'uppercase',position:'sticky',top:0,background:c.sf,zIndex:1}}>{sec.title}</div>
                    {filtered.map(opt=>{const isChk=(stratBInstruments||[]).includes(opt.id);const isH=trdPickHov==='t_'+opt.id;return mkRow(opt,isChk,isH,()=>toggleInst(opt.id));})}
                  </div>);
                })}
              </div>
            </div>
          </>
        );
      })()}

      {/* Supporting symbols picker — now inline above */}
      {false&&(()=>{
        const cats=(stratBMarkets||[]).map(x=>x.toLowerCase());
        const showAll=cats.length===0;
        const sections=[
          ...(showAll||cats.includes('forex')?[{title:'Forex pairs',opts:FOREX_INSTRUMENTS},{title:'Commodities (CFD)',opts:COMMODITY_CFD_INSTRUMENTS}]:[]),
          ...(showAll||cats.includes('futures')?[{title:'Futures',opts:FUTURES_INSTRUMENTS}]:[]),
          ...(showAll||cats.includes('crypto')?[{title:'Crypto',opts:CRYPTO_INSTRUMENTS}]:[]),
        ];
        const q=supPickSearch.trim().toLowerCase();
        const mkRow=(opt,isChk,isH,onClick)=>(
          <div key={opt.id} onClick={onClick}
            onMouseEnter={()=>setSupPickHov('s_'+opt.id)} onMouseLeave={()=>setSupPickHov(null)}
            style={{position:'relative',display:'flex',alignItems:'center',padding:'5px 10px',gap:8,cursor:'default',
              background:isH&&!isChk?'rgba(255,255,255,0.04)':isChk?'rgba(201,168,76,0.08)':'transparent',transition:'background 0.08s'}}>
            {isChk&&<div style={{position:'absolute',left:0,top:'15%',bottom:'15%',width:2,background:'linear-gradient(180deg,transparent,rgba(232,194,82,0.9),transparent)',boxShadow:'0 0 6px rgba(232,194,82,0.3)'}}/>}
            <svg width={10} height={10} style={{display:'block',overflow:'visible',flexShrink:0}}>
              <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={isChk?'rgba(232,194,82,0.9)':isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
              <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={isChk?'rgba(232,194,82,0.9)':isH?c.tx:c.ts} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
              {!isChk&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.9)" strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.9)" strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/></>}
              {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.9)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.9)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill="rgba(232,194,82,0.9)" opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill="rgba(232,194,82,0.9)"/></>}
            </svg>
            <span style={{fontSize:11,color:isChk?'rgba(232,194,82,0.9)':c.ts,fontWeight:isChk?600:400}}>{opt.label}</span>
          </div>
        );
        return(
          <>
            <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setSupPickOpen(false)}/>
            <div style={{position:'fixed',top:supPickPos.top,left:supPickPos.left,width:190,maxHeight:280,display:'flex',flexDirection:'column',background:c.sf,border:'1px solid rgba(140,160,255,0.22)',boxShadow:'0 8px 28px rgba(0,0,0,0.7)',zIndex:9999,fontFamily:F}}>
              <div style={{height:2,background:'linear-gradient(90deg,rgba(201,168,76,0.3),rgba(232,194,82,0.8),rgba(201,168,76,0.3))',flexShrink:0}}/>
              <div style={{padding:'5px 8px',borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                <input autoFocus value={supPickSearch} onChange={e=>setSupPickSearch(e.target.value)} placeholder="Search symbols…"
                  style={{width:'100%',background:'transparent',border:'none',outline:'none',color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0,boxSizing:'border-box'}}/>
              </div>
              <div className="tlr-scroll" style={{overflowY:'auto',flex:1}}>
                {sections.map(sec=>{
                  const filtered=q?sec.opts.filter(o=>o.label.toLowerCase().includes(q)||o.id.includes(q)):sec.opts;
                  if(!filtered.length)return null;
                  return(<div key={sec.title} style={{borderBottom:'1px solid rgba(140,160,255,0.1)'}}>
                    <div style={{padding:'5px 10px 2px',fontSize:9,fontWeight:700,color:c.tm,letterSpacing:'0.08em',textTransform:'uppercase',position:'sticky',top:0,background:c.sf,zIndex:1}}>{sec.title}</div>
                    {filtered.map(opt=>{const isChk=(stratBSupportInst||[]).includes(opt.id);const isH=supPickHov==='s_'+opt.id;return mkRow(opt,isChk,isH,()=>setStratBSupportInst(prev=>{const c2=prev||[];if(!c2.includes(opt.id)&&c2.length>=10)return c2;return c2.includes(opt.id)?c2.filter(x=>x!==opt.id):[...c2,opt.id];}));})}
                  </div>);
                })}
              </div>
            </div>
          </>
        );
      })()}

      {/* Image preview lightbox */}
      {imgPreview&&(
        <div style={{position:'fixed',inset:0,zIndex:200000,background:'rgba(0,0,0,0.87)',display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setImgPreview(null)}>
          <img src={imgPreview} alt="" style={{maxWidth:'90vw',maxHeight:'85vh',objectFit:'contain',border:'1px solid '+c.brH}}
            onClick={e=>e.stopPropagation()}/>
        </div>
      )}

      {/* Emoji picker — fixed, escapes overflow:auto clipping */}
      {emojiOpen&&(()=>{
        const searchTrim = emojiSearch.trim();
        const activeCat  = EMOJI_CATS.find(ct=>ct.id===emojiCat)||EMOJI_CATS[0];
        const allEmojis  = EMOJI_CATS.flatMap(ct=>ct.list).filter((em,i,a)=>a.indexOf(em)===i);
        const visibleList = searchTrim ? allEmojis.filter(em=>em.includes(searchTrim)) : activeCat.list;
        return (
          <div ref={emojiPickerRef}
            style={{position:'fixed',top:emojiPos.top,left:emojiPos.left,zIndex:100100,
              width:296,background:c.sf,border:'1px solid rgba(140,160,255,0.22)',
              boxShadow:'0 4px 16px rgba(0,0,0,0.5)',overflow:'hidden',fontFamily:F}}
            onClick={e=>e.stopPropagation()}>
            {/* Top accent bar */}
            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
            {/* Search */}
            <div style={{padding:'7px 7px 0'}}>
              <input autoFocus value={emojiSearch} onChange={e=>setEmojiSearch(e.target.value)}
                placeholder="Search emoji…"
                style={{width:'100%',boxSizing:'border-box',background:c.bg,border:'1px solid '+c.brH,
                  color:c.tx,fontFamily:F,fontSize:11,padding:'5px 9px',outline:'none'}}
                onFocus={e=>e.target.style.borderColor=c.acL}
                onBlur={e=>e.target.style.borderColor=c.brH}/>
            </div>
            {/* Category tabs */}
            {!searchTrim&&(
              <div style={{display:'flex',borderBottom:'1px solid rgba(140,160,255,0.14)',padding:'0 2px',overflowX:'auto',scrollbarWidth:'none'}}>
                {EMOJI_CATS.map(ct=>(
                  <div key={ct.id} onClick={()=>setEmojiCat(ct.id)}
                    style={{flexShrink:0,height:34,minWidth:30,display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:16,cursor:'default',position:'relative',
                      borderBottom:'2px solid '+(emojiCat===ct.id?c.acL:'transparent'),
                      opacity:emojiCat===ct.id?1:0.45,transition:'opacity 0.1s,border-color 0.1s'}}
                    title={ct.label}>
                    {ct.ic}
                  </div>
                ))}
              </div>
            )}
            {/* Emoji grid */}
            <div style={{height:186,overflowY:'auto',padding:'3px',
              display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,
              scrollbarWidth:'thin',scrollbarColor:'rgba(140,160,255,0.2) transparent'}}>
              {visibleList.map((em,i)=>(
                <div key={em+i} onClick={()=>{setStratBLogoEmoji(em);setEmojiOpen(false);setEmojiSearch('');}}
                  style={{height:34,display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:19,cursor:'default',
                    background:stratBLogoEmoji===em?c.acD:'transparent',
                    transition:'background 0.06s'}}
                  onMouseEnter={e=>{if(stratBLogoEmoji!==em)e.currentTarget.style.background='rgba(255,255,255,0.05)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background=stratBLogoEmoji===em?c.acD:'transparent';}}>
                  {em}
                </div>
              ))}
              {visibleList.length===0&&(
                <div style={{gridColumn:'1/-1',padding:'20px 0',textAlign:'center',fontSize:11,color:c.tm}}>No results</div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function VariablesStepContent({ c, F, stratBVariables, setStratBVariables }) {
  const vars = stratBVariables && stratBVariables.length > 0 ? stratBVariables : [{type:'divider',id:'div0'}];

  const divIdx = vars.findIndex(v=>v.type==='divider');
  const preLimit = divIdx < 0 ? vars.length : divIdx;
  const preVars = vars.filter((v,i)=>v.type==='variable'&&(v.timing==='pre'||i<preLimit));
  const postVars = vars.filter(v=>v.type==='variable'&&v.timing==='post');

  const preAccent = c.gold || '#C9A84C';
  const postAccent = '#A78BFA';
  const panel = c.sf || 'rgba(255,255,255,0.035)';
  const rowBg = c.el || 'rgba(255,255,255,0.025)';
  const sectionLbl = {fontSize:9,fontWeight:850,color:c.tm,fontFamily:F,letterSpacing:'0.08em',textTransform:'uppercase'};
  const fieldStyle = {
    height:34,width:'42ch',maxWidth:'100%',background:'rgba(2,4,13,0.42)',border:`1px solid ${c.brH}`,
    outline:'none',color:c.tx,fontFamily:F,fontSize:13,fontWeight:700,padding:'0 10px',
    boxSizing:'border-box',borderRadius:0
  };
  const MAX_TRADE_TAGS = 10;
  const MAX_TAG_VALUES = 10;
  const [openValueMenu, setOpenValueMenu] = React.useState(null);
  const [valueDrafts, setValueDrafts] = React.useState({});
  const [editingTagId, setEditingTagId] = React.useState(null);
  const valueMenuRef = React.useRef(null);
  React.useEffect(() => {
    if (!openValueMenu) return;
    const h = e => {
      if (valueMenuRef.current && valueMenuRef.current.contains(e.target)) return;
      setOpenValueMenu(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [openValueMenu]);
  const addTag = (timing) => {
    const count = timing==='pre' ? preVars.length : postVars.length;
    if(count >= MAX_TRADE_TAGS) return;
    const newVar = {
      id:'v'+Date.now()+timing[0],
      type:'variable',
      name:'',
      timing,
      vtype:'multi',
      options:[]
    };
    setStratBVariables(prev=>{
      const p = (prev&&prev.length)?prev:[{type:'divider',id:'div0'}];
      const arr = [...p];
      const di = arr.findIndex(v=>v.type==='divider');
      if(timing==='pre'){
        arr.splice(di<0?arr.length:di,0,newVar);
        if(di<0) arr.push({type:'divider',id:'div0'});
      }else{
        if(di<0) arr.push({type:'divider',id:'div0'});
        arr.push(newVar);
      }
      return arr;
    });
  };
  const updateVar = (id,field,val) => setStratBVariables(prev=>(prev||[]).map(v=>v.id===id?{...v,[field]:val}:v));
  const deleteVar = (id) => setStratBVariables(prev=>(prev||[]).filter(v=>v.id!==id));
  const addOptionValue = (id) => {
    const val = (valueDrafts[id]||'').trim().slice(0,30);
    if(!val) return;
    setStratBVariables(prev=>(prev||[]).map(v=>{
      if(v.id!==id) return v;
      if((v.options||[]).length >= MAX_TAG_VALUES) return v;
      return {...v,options:[...(v.options||[]),val]};
    }));
    setValueDrafts(prev=>({...prev,[id]:''}));
  };
  const deleteOptionField = (id, idx) => setStratBVariables(prev=>(prev||[]).map(v=>{
    if(v.id!==id) return v;
    const next = (v.options||[]).filter((_,i)=>i!==idx);
    return {...v, options:next};
  }));

  const iconBtn = {
    width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',
    border:'none',background:'transparent',color:c.tm,cursor:'default',padding:0,borderRadius:0,flexShrink:0
  };
  const plusButtonStyle = (accent) => ({
    width:24,height:24,display:'inline-flex',alignItems:'center',justifyContent:'center',
    border:`1px solid ${accent}`,background:accent,
    color:'rgba(255,255,255,0.96)',cursor:'default',borderRadius:0,padding:0,flexShrink:0,
    boxShadow:'none',
    transition:'filter 0.12s ease, opacity 0.12s ease, transform 0.12s ease'
  });

  const renderTagRow = (v, accent, number, isLast=false) => (
    <div style={{position:'relative',padding:'6px 0 10px',background:'transparent',border:'none',borderBottom:isLast?'none':`1px solid ${c.br}`,marginBottom:isLast?0:6,animation:'tlrSoftOpen 0.12s ease-out'}}>
      <div style={{display:'grid',gridTemplateColumns:v.vtype==='multi'?'32px calc(32ch + 36px) 34ch 28px':'32px calc(32ch + 36px) auto 28px',columnGap:8,rowGap:10,alignItems:'start',justifyContent:'center'}}>
        <div style={{height:34,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,fontFamily:F,color:accent,fontVariantNumeric:'tabular-nums'}}>
          {number}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 30px',gap:6,width:'calc(32ch + 36px)',maxWidth:'100%'}}>
          {editingTagId===v.id ? (
            <input value={v.name} onChange={e=>updateVar(v.id,'name',e.target.value)} placeholder="Tag name"
              maxLength={30} style={{...fieldStyle,width:'100%',color:c.tx,cursor:'text'}} />
          ) : (
            <div onDoubleClick={()=>setEditingTagId(v.id)}
              style={{height:34,display:'flex',alignItems:'center',padding:'0 10px',fontSize:13,fontWeight:700,fontFamily:F,color:v.name?c.ts:c.tm,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'default'}}>
              {v.name || 'Tag name'}
            </div>
          )}
          <button type="button" onClick={()=>setEditingTagId(editingTagId===v.id?null:v.id)}
            style={{width:30,height:34,display:'flex',alignItems:'center',justifyContent:'center',padding:0,border:'none',borderRadius:0,cursor:'default',
              color:c.tm,background:editingTagId===v.id?'rgba(38,67,247,0.20)':'transparent',transition:'background 0.15s,color 0.15s,transform 0.12s ease'}}
            onMouseEnter={e=>{e.currentTarget.style.background=editingTagId===v.id?'rgba(38,67,247,0.24)':'rgba(255,255,255,0.08)';e.currentTarget.style.color=c.tx;e.currentTarget.style.transform='translateY(-1px)';}}
            onMouseLeave={e=>{e.currentTarget.style.background=editingTagId===v.id?'rgba(38,67,247,0.20)':'transparent';e.currentTarget.style.color=c.tm;e.currentTarget.style.transform='translateY(0)';}}
            onMouseDown={e=>{e.currentTarget.style.transform='translateY(0) scale(0.96)';}}
            onMouseUp={e=>{e.currentTarget.style.transform='translateY(-1px) scale(1)';}}>
            {editingTagId===v.id ? (
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <polyline points="4 13 9 18 20 7" stroke="#2643F7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <path d="M4 20h4l10.5-10.5a2.828 2.828 0 0 0-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" style={{transition:'stroke 0.15s'}}/>
                <path d="M14.5 5.5l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{transition:'stroke 0.15s'}}/>
              </svg>
            )}
          </button>
        </div>
        {v.vtype==='multi'?(
          <div ref={openValueMenu===v.id?valueMenuRef:null} style={{position:'relative'}}>
            {(()=>{
              const values = (v.options||[]).map((opt,idx)=>({opt,idx})).filter(item=>String(item.opt||'').trim());
              const label = values.length ? values.map(item=>item.opt).join(', ') : 'None';
              return (
                <>
                  <button type="button" onClick={()=>setOpenValueMenu(openValueMenu===v.id?null:v.id)}
                    style={{...fieldStyle,height:34,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,textAlign:'left',color:values.length?c.ts:c.tm,cursor:'default'}}>
                    <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  {openValueMenu===v.id&&(
                    <div style={{position:'absolute',left:0,right:0,top:38,zIndex:40,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:'0 18px 42px rgba(0,0,0,0.72)',padding:8,animation:'tlrSoftOpen 0.11s ease-out'}}>
                      <div style={{display:'grid',gap:5,maxHeight:150,overflowY:'auto'}} className="tlr-scroll">
                        {values.length===0&&(
                          <div style={{padding:'8px 6px',fontSize:11,fontWeight:650,color:c.tm,fontFamily:F}}>No values yet</div>
                        )}
                        {values.map(item=>(
                          <div key={item.idx} style={{height:28,display:'grid',gridTemplateColumns:'minmax(0,1fr) 24px',alignItems:'center',gap:5,background:'rgba(255,255,255,0.035)',border:`1px solid ${c.br}`}}>
                            <div style={{padding:'0 8px',fontSize:12,fontWeight:700,color:c.ts,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.opt}</div>
                            <button type="button" onClick={()=>deleteOptionField(v.id,item.idx)} style={{...iconBtn,width:24,height:24}}
                              onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color=c.rd;}}
                              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=c.tm;}}>
                              <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 28px',gap:6,marginTop:8}}>
                        <input value={valueDrafts[v.id]||''} disabled={(v.options||[]).length>=MAX_TAG_VALUES} onChange={e=>setValueDrafts(prev=>({...prev,[v.id]:e.target.value.slice(0,30)}))}
                          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addOptionValue(v.id);}}}
                          placeholder={(v.options||[]).length>=MAX_TAG_VALUES?'10 values max':'New value'} maxLength={30} style={{...fieldStyle,height:30,fontSize:12,fontWeight:650,color:c.ts,opacity:(v.options||[]).length>=MAX_TAG_VALUES?0.45:1}} />
                        <button type="button" disabled={(v.options||[]).length>=MAX_TAG_VALUES} onClick={()=>addOptionValue(v.id)} style={{...iconBtn,width:28,height:30,background:'rgba(255,255,255,0.05)',border:`1px solid ${c.brH}`,color:accent,opacity:(v.options||[]).length>=MAX_TAG_VALUES?0.45:1}}
                          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.10)';e.currentTarget.style.color=c.tx;}}
                          onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.05)';e.currentTarget.style.color=accent;}}>
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ):(
          <div style={{height:34,display:'inline-flex',alignItems:'center',gap:6,justifyContent:'flex-end'}}>
            {['Yes','No'].map(ans=>(
              <span key={ans} style={{height:24,padding:'0 9px',display:'inline-flex',alignItems:'center',fontSize:10,fontWeight:800,fontFamily:F,color:c.ts,background:'rgba(255,255,255,0.05)',border:`1px solid ${c.br}`}}>
                {ans}
              </span>
            ))}
          </div>
        )}
        <button type="button" onClick={()=>deleteVar(v.id)} style={iconBtn}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color=c.rd;}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=c.tm;}}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 6l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M10 10v6M14 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );

  const renderSection = (title, timing, accent, items, children) => {
    return (
    <div style={{background:panel,border:`1px solid ${c.brH}`,padding:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:9}}>
          <span style={{width:8,height:8,background:accent,boxShadow:`0 0 8px ${accent}88`}} />
          <div style={sectionLbl}>{title}</div>
          <div style={{fontSize:10,fontWeight:800,color:accent,fontFamily:F,fontVariantNumeric:'tabular-nums'}}>{items.length}/{MAX_TRADE_TAGS}</div>
        </div>
        <button type="button" disabled={items.length>=MAX_TRADE_TAGS} onClick={()=>addTag(timing)} style={{...plusButtonStyle(accent),opacity:items.length>=MAX_TRADE_TAGS?0.45:1}}
          onMouseEnter={e=>{if(items.length<MAX_TRADE_TAGS){e.currentTarget.style.filter='brightness(1.12)';e.currentTarget.style.transform='translateY(-1px)';}}}
          onMouseLeave={e=>{e.currentTarget.style.filter='brightness(1)';e.currentTarget.style.transform='translateY(0)';}}
          onMouseDown={e=>{if(items.length<MAX_TRADE_TAGS){e.currentTarget.style.filter='brightness(0.88)';e.currentTarget.style.transform='translateY(0) scale(0.96)';}}}
          onMouseUp={e=>{if(items.length<MAX_TRADE_TAGS){e.currentTarget.style.filter='brightness(1.12)';e.currentTarget.style.transform='translateY(-1px) scale(1)';}}}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/></svg>
        </button>
      </div>
      {children}
      {items.length===0&&(
        <div style={{padding:'10px 12px',border:`1px dashed ${c.brH}`,background:'rgba(0,0,0,0.12)',color:c.tm,fontSize:11,fontWeight:600,fontFamily:F,textAlign:'center'}}>
          No tags yet.
        </div>
      )}
    </div>
    );
  };

  return (
    <div style={{flex:1,padding:'20px 18px',overflowY:'auto',fontFamily:F}} className="tlr-scroll">
      <div style={{width:'min(100%,760px)',margin:'0 auto',display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14}}>
          <div>
            <div style={{fontSize:22,fontWeight:900,color:c.tx,fontFamily:F}}>Trade Tags</div>
            <div style={{marginTop:5,fontSize:12,color:c.tm,fontFamily:F,lineHeight:1.45}}>
              Define the tag fields you want to track on every trade.
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,fontFamily:F}}>
            <span style={{fontSize:10,fontWeight:850,color:preAccent,letterSpacing:'0.06em',textTransform:'uppercase'}}>Pre {preVars.length}/{MAX_TRADE_TAGS}</span>
            <span style={{width:1,height:18,background:c.brH}} />
            <span style={{fontSize:10,fontWeight:850,color:postAccent,letterSpacing:'0.06em',textTransform:'uppercase'}}>Post {postVars.length}/{MAX_TRADE_TAGS}</span>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {renderSection('Pre-Trade Tags','pre',preAccent,preVars,preVars.map((v,i)=><React.Fragment key={v.id}>{renderTagRow(v,preAccent,i+1,i===preVars.length-1)}</React.Fragment>))}
          {renderSection('Post-Trade Tags','post',postAccent,postVars,postVars.map((v,i)=><React.Fragment key={v.id}>{renderTagRow(v,postAccent,i+1,i===postVars.length-1)}</React.Fragment>))}
        </div>
      </div>
    </div>
  );
}

function ReviewStepContent({ c, F, stratBName, stratBDesc, stratBMarkets, stratBTimeframes, stratBTags, stratBVariables, stratBInstruments, stratBSupportInst, stratBImages, stratBLogoEmoji, canvasNodes, sessions, stratEditId }) {
  const vars = stratBVariables||[];
  const divIdx = vars.findIndex(v=>v.type==='divider');
  const preLimit = divIdx < 0 ? vars.length : divIdx;
  const preTradeTags = vars.filter((v,i)=>v.type==='variable'&&(v.timing==='pre'||i<preLimit));
  const postTradeTags = vars.filter(v=>v.type==='variable'&&v.timing==='post');
  const preCount = preTradeTags.length;
  const postCount = postTradeTags.length;
  const groups = (canvasNodes||[])
    .filter(n=>n.type==='section')
    .sort((a,b)=>(a.position?.y||0)-(b.position?.y||0))
    .map(sec=>({
      id: sec.id,
      label: sec.data?.label || 'Group',
      description: sec.data?.description || '',
      color: sec.data?.ac || c.acL,
      images: Array.isArray(sec.data?.images) ? sec.data.images : [],
      conditions: (canvasNodes||[])
        .filter(n=>n.type==='condition'&&n.data?.sectionId===sec.id)
        .sort((a,b)=>(a.data?.slot??0)-(b.data?.slot??0)||(a.position?.x||0)-(b.position?.x||0))
        .map(cond=>({
          id: cond.id,
          label: cond.data?.label || 'Condition',
          description: cond.data?.description || '',
          status: cond.data?.status || 'mandatory',
          images: Array.isArray(cond.data?.images) ? cond.data.images : [],
        }))
    }));
  const conditionCount = groups.reduce((sum,g)=>sum+g.conditions.length,0);

  const preAccent = c.gold || '#C9A84C';
  const postAccent = '#A78BFA';
  const sectionLbl = {fontSize:9,fontWeight:850,color:c.tm,fontFamily:F,letterSpacing:'0.08em',textTransform:'uppercase'};
  const panelStyle = {background:c.sf,border:`1px solid ${c.brH}`,padding:12};
  const reviewGlowLine = (color=c.acL, width='100%') => ({
    position:'absolute',
    left:'50%',
    transform:'translateX(-50%)',
    bottom:2,
    width,
    height:1,
    background:`linear-gradient(90deg,transparent,${color},transparent)`,
    boxShadow:`0 0 6px ${color}88`,
    pointerEvents:'none',
  });
  const glowLabel = (text, col=c.ts, key=text) => (
    <span key={key} style={{position:'relative',display:'inline-flex',alignItems:'center',minHeight:22,padding:'0 2px 7px',fontSize:11,fontWeight:750,fontFamily:F,color:col,background:'transparent',border:'none',boxSizing:'border-box'}}>
      {text}
      <span style={reviewGlowLine(col,'100%')}/>
    </span>
  );
  const emptyText = {fontSize:12,fontWeight:600,color:c.tm,fontFamily:F,padding:'10px 0'};
  const chipList = (items, color=c.ts, bg='rgba(255,255,255,0.045)') => (
    <div style={{display:'flex',flexWrap:'wrap',columnGap:14,rowGap:8}}>
      {(items||[]).map(item=>glowLabel(item,color,item))}
    </div>
  );
  const marketLabel = id => (MKT_CAT_OPTS.find(x=>x.id===id)?.label || id);
  const instrumentLabel = id => (ALL_INSTRUMENTS.find(x=>x.id===id)?.label || id);
  const scopeGroup = (title, items, accent=c.acL, empty='None selected') => (
    <div style={{minWidth:0,padding:'0 0 12px',borderBottom:`1px solid ${c.br}`}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
        <div style={sectionLbl}>{title}</div>
      </div>
      <div style={{marginTop:8,minHeight:24}}>
        {items.length ? chipList(items, accent) : <div style={{...emptyText,padding:'2px 0'}}>{empty}</div>}
      </div>
    </div>
  );
  const stat = (label,value,accent=c.acL) => (
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{fontSize:18,fontWeight:900,color:accent,fontFamily:F,fontVariantNumeric:'tabular-nums',lineHeight:1}}>{value}</span>
      <span style={{fontSize:9,fontWeight:850,color:c.tm,fontFamily:F,letterSpacing:'0.08em',textTransform:'uppercase'}}>{label}</span>
    </div>
  );
  const imageStrip = (images) => {
    const urls = (images||[]).slice(0,6).map(item => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item.src) return String(item.src);
      return '';
    }).filter(Boolean);
    return urls.length ? (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(112px,1fr))',gap:8,marginTop:10}}>
      {urls.map((url,i)=>(
        <div key={`${i}-${url.slice(0,32)}`} style={{height:72,border:`1px solid ${c.brH}`,background:c.el,overflow:'hidden'}}>
          <img src={url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
        </div>
      ))}
    </div>
  ) : null;
  };
  const renderTradeTagRows = (items, accent) => (
    <div style={{display:'grid',gap:0}}>
      {items.length===0 ? <div style={emptyText}>No tags defined.</div> : items.map((v,i)=>{
        const values = (v.options||[]).filter(Boolean);
        return (
          <div key={v.id||i} style={{display:'grid',gridTemplateColumns:'32px minmax(180px,1fr) minmax(180px,1.2fr)',gap:10,alignItems:'center',padding:'8px 0',borderBottom:i===items.length-1?'none':`1px solid ${c.br}`}}>
            <div style={{fontSize:11,fontWeight:900,color:accent,fontFamily:F,fontVariantNumeric:'tabular-nums',textAlign:'center'}}>{i+1}</div>
            <div style={{fontSize:12,fontWeight:750,color:v.name?c.ts:c.tm,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {v.name||'Unnamed tag'}
            </div>
            <div style={{fontSize:11,fontWeight:650,color:values.length?c.tm:c.tm,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {values.length?values.join(', '):'None'}
            </div>
          </div>
        );
      })}
    </div>
  );
  const statusColor = status => status==='optional' ? postAccent : (status==='invalidate'||status==='invalidator') ? c.rd : c.acL;
  const normalizeStrategyName = value => String(value||'')
    .replace(/\s*\((my version|copy)\)\s*/ig,' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
  const activeStrategyKey = normalizeStrategyName(stratBName);
  const linkedSessions = (sessions||[])
    .filter(sess=>{
      const sessKey = normalizeStrategyName(sess.strategyName);
      if (!activeStrategyKey || !sessKey) return false;
      const nameMatches = sessKey===activeStrategyKey || sessKey.includes(activeStrategyKey) || activeStrategyKey.includes(sessKey);
      const hasBeenUsed = (sess.progress||0)>0 || (sess.trades||0)>0 || sess.pnl!=null || sess.winRate!=null;
      return nameMatches && hasBeenUsed;
    })
    .sort((a,b)=>new Date(b.createdAt||b.endDate||0)-new Date(a.createdAt||a.endDate||0));
  const fmtDate = value => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  };
  const fmtMoney = value => value==null ? '—' : `${value>=0?'+':'-'}$${Math.abs(value).toLocaleString()}`;
  const usageTrades = linkedSessions.reduce((sum,s)=>sum+(s.trades||0),0);
  const usagePnlKnown = linkedSessions.filter(s=>s.pnl!=null);
  const usagePnl = usagePnlKnown.length ? usagePnlKnown.reduce((sum,s)=>sum+(s.pnl||0),0) : null;
  const usageWinKnown = linkedSessions.filter(s=>s.winRate!=null);
  const usageWinRate = usageWinKnown.length ? Math.round(usageWinKnown.reduce((sum,s)=>sum+s.winRate,0)/usageWinKnown.length) : null;
  const progressColor = sess => sess.progress===100 ? c.gn : ((sess.progress||0)>0 ? c.gold : c.tm);
  const usageMetric = (label, value, accent=c.acL) => (
    <div style={{minWidth:0}}>
      <div style={{fontSize:9,fontWeight:850,color:c.tm,fontFamily:F,letterSpacing:'0.08em',textTransform:'uppercase'}}>{label}</div>
      <div style={{display:'inline-flex',marginTop:7,fontSize:14,fontWeight:900,color:accent,fontFamily:F,fontVariantNumeric:'tabular-nums',lineHeight:1}}>
        {value}
      </div>
    </div>
  );
  const readyItems = [
    {label:'General Info', ready:!!(stratBName||'').trim(), detail:(stratBName||'').trim()?'Name added':'Name required'},
    {label:'Market Scope', ready:(stratBMarkets||[]).length>0 && (stratBTimeframes||[]).length>0, detail:`${(stratBMarkets||[]).length} markets · ${(stratBTimeframes||[]).length} timeframes`},
    {label:'Strategy Flow', ready:groups.length>0 && conditionCount>0, detail:`${groups.length} groups · ${conditionCount} conditions`},
    {label:'Trade Tags', ready:preCount+postCount>0, detail:`${preCount} pre · ${postCount} post`},
  ];
  const statusPill = ready => ready ? null : (
    <span style={{height:22,padding:'0 8px',display:'inline-flex',alignItems:'center',fontSize:9,fontWeight:850,fontFamily:F,letterSpacing:'0.06em',textTransform:'uppercase',color:c.gold,background:'rgba(201,168,76,0.10)',border:'1px solid rgba(201,168,76,0.25)'}}>
      Review
    </span>
  );
  const reviewBlock = (step, title, ready, children, accent=c.acL) => (
    <section style={{...panelStyle,padding:0,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderBottom:`1px solid ${c.brH}`}}>
        <div style={{fontSize:12,fontWeight:850,color:c.tx,fontFamily:F,letterSpacing:'0.04em',textTransform:'uppercase',flex:1}}>{title}</div>
        {statusPill(ready)}
      </div>
      <div style={{padding:12}}>{children}</div>
    </section>
  );
  return (
    <div style={{flex:1,padding:'20px 18px',overflowY:'auto',fontFamily:F}} className="tlr-scroll">
      <div style={{width:'min(100%,980px)',margin:'0 auto',display:'flex',flexDirection:'column',gap:12}}>

        {linkedSessions.length>0&&(
          <section style={{...panelStyle,padding:0,overflow:'hidden'}}>
            <div style={{height:2,background:c.acL,boxShadow:`0 0 6px ${c.acG}`}}/>
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderBottom:`1px solid ${c.brH}`}}>
              <div style={{fontSize:12,fontWeight:850,color:c.tx,fontFamily:F,letterSpacing:'0.04em',textTransform:'uppercase',flex:1}}>Backtested Sessions</div>
              <span style={{display:'inline-flex',alignItems:'center',height:22,fontSize:10,fontWeight:900,fontFamily:F,letterSpacing:'0.07em',textTransform:'uppercase',color:c.acL,whiteSpace:'nowrap'}}>
                {linkedSessions.length} session{linkedSessions.length===1?'':'s'}
              </span>
            </div>
            <div style={{padding:12}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',columnGap:18,rowGap:12,marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${c.brH}`}}>
                {usageMetric('Trades',usageTrades.toLocaleString(),c.acL)}
                {usageMetric('Net P&L',fmtMoney(usagePnl),usagePnl==null?c.tm:(usagePnl>=0?c.gn:c.rd))}
                {usageMetric('Avg Win Rate',usageWinRate==null?'—':`${usageWinRate}%`,usageWinRate==null?c.tm:(usageWinRate>=50?c.gn:c.rd))}
              </div>
              <div style={{display:'grid',gap:0}}>
                {linkedSessions.map((sess,i)=>{
                  const col = progressColor(sess);
                  const pnlCol = sess.pnl==null ? c.tm : (sess.pnl>=0?c.gn:c.rd);
                  return (
                    <div key={sess.id||`${sess.name}-${i}`} style={{display:'grid',gridTemplateColumns:'minmax(220px,1.4fr) repeat(4,minmax(86px,0.7fr))',gap:12,alignItems:'center',padding:'10px 0 11px',borderTop:i===0?'none':`1px solid ${c.br}`,boxShadow:i===0?'none':`inset 0 1px 0 rgba(74,106,255,0.04)`}}>
                      <div style={{minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:850,color:c.tx,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sess.name||'Untitled Session'}</div>
                        </div>
                        <div style={{marginTop:5,fontSize:10,fontWeight:650,color:c.tm,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {fmtDate(sess.startDate)} - {fmtDate(sess.endDate)} · {sess.timeframe||'—'} · {(sess.assetClasses||[]).join(', ')||'No market'}
                        </div>
                      </div>
                      {usageMetric('Trades',(sess.trades||0).toLocaleString(),c.acL)}
                      {usageMetric('P&L',fmtMoney(sess.pnl),pnlCol)}
                      {usageMetric('Win Rate',sess.winRate==null?'—':`${sess.winRate}%`,sess.winRate==null?c.tm:(sess.winRate>=50?c.gn:c.rd))}
                      {usageMetric('Progress',`${sess.progress||0}%`,col)}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {reviewBlock('01','General Info',readyItems[0].ready,
          <div style={{display:'grid',gap:12}}>
            <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:12,alignItems:'start'}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  {stratBLogoEmoji&&<div style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,background:c.el,border:`1px solid ${c.brH}`}}>{stratBLogoEmoji}</div>}
                  <div style={{fontSize:18,fontWeight:900,color:stratBName?c.tx:c.tm,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {stratBName||'Untitled Strategy'}
                  </div>
                </div>
                <div style={{marginTop:8,fontSize:12,color:stratBDesc?c.ts:c.tm,fontFamily:F,lineHeight:1.5}}>
                  {stratBDesc||'No description added.'}
                </div>
              </div>
            </div>
            {imageStrip(stratBImages||[])}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:12}}>
              <div>
                <div style={{...sectionLbl,marginBottom:8}}>Strategy Tags</div>
                {(stratBTags||[]).length ? chipList(stratBTags,c.acL,'rgba(38,67,247,0.10)') : <div style={emptyText}>No strategy tags selected.</div>}
              </div>
              <div>
                <div style={{...sectionLbl,marginBottom:8}}>Images</div>
                <div style={{fontSize:12,fontWeight:650,color:(stratBImages||[]).length?c.ts:c.tm,fontFamily:F}}>{(stratBImages||[]).length} image{(stratBImages||[]).length===1?'':'s'} added</div>
              </div>
            </div>
          </div>
        )}

        {reviewBlock('02','Market Scope',readyItems[1].ready,
          <div style={{display:'grid',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',columnGap:20,rowGap:14}}>
              {scopeGroup('Markets',(stratBMarkets||[]).map(marketLabel),c.acL,'No markets selected.')}
              {scopeGroup('Timeframes',stratBTimeframes||[],c.ts,'No timeframes selected.')}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',columnGap:20,rowGap:14}}>
              {scopeGroup('Trading Instruments',(stratBInstruments||[]).map(instrumentLabel),c.ts,'No trading instruments selected.')}
              {scopeGroup('Supporting Instruments',(stratBSupportInst||[]).map(instrumentLabel),c.ts,'No supporting instruments selected.')}
            </div>
          </div>
        )}

        {reviewBlock('03','Strategy Flow',readyItems[2].ready,
          <div>
            <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:10}}>
              {stat('Groups',groups.length,c.gold)}
              {stat('Conditions',conditionCount,c.acL)}
            </div>
            {groups.length===0 ? <div style={emptyText}>No flow groups defined.</div> : (
              <div style={{display:'grid',gap:12}}>
                {groups.map((group,gi)=>(
                  <div key={group.id} style={{borderTop:gi===0?'none':`1px solid ${c.brH}`,paddingTop:gi===0?0:10}}>
                  <div style={{display:'grid',gridTemplateColumns:'32px minmax(0,1fr)',gap:10,alignItems:'start'}}>
                    <div style={{fontSize:11,fontWeight:900,color:c.gold,fontFamily:F,fontVariantNumeric:'tabular-nums',textAlign:'center'}}>{gi+1}</div>
                    <div>
                      <div style={{fontSize:13,fontWeight:850,color:c.gold,fontFamily:F,textTransform:'uppercase'}}>{group.label}</div>
                      <div style={{marginTop:4,fontSize:12,color:group.description?c.ts:c.tm,fontFamily:F,lineHeight:1.45}}>
                        {group.description||'No group description added.'}
                      </div>
                      {imageStrip(group.images)}
                      <div style={{display:'grid',gap:8,marginTop:10}}>
                        {group.conditions.length===0 ? <div style={emptyText}>No conditions in this group.</div> : group.conditions.map((cond,ci)=>{
                          const col = statusColor(cond.status);
                          return (
                            <div key={cond.id} style={{display:'grid',gridTemplateColumns:'44px minmax(0,1fr)',gap:10,padding:'8px 0',borderTop:`1px solid ${c.br}`}}>
                              <div style={{fontSize:11,fontWeight:900,color:col,fontFamily:F,fontVariantNumeric:'tabular-nums',textAlign:'center'}}>{gi+1}.{ci+1}</div>
                              <div>
                                <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                                  <div style={{fontSize:12,fontWeight:850,color:col,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cond.label}</div>
                                  <span style={{fontSize:9,fontWeight:850,color:col,fontFamily:F,letterSpacing:'0.06em',textTransform:'uppercase',marginLeft:'auto'}}>{cond.status}</span>
                                </div>
                                <div style={{marginTop:4,fontSize:12,color:cond.description?c.ts:c.tm,fontFamily:F,lineHeight:1.45}}>
                                  {cond.description||'No condition description added.'}
                                </div>
                                {imageStrip(cond.images)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {reviewBlock('04','Trade Tags',readyItems[3].ready,
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:12}}>
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{width:8,height:8,background:preAccent,boxShadow:`0 0 8px ${preAccent}88`}} />
                  <div style={sectionLbl}>Pre-Trade Tags</div>
                </div>
                <div style={{fontSize:10,fontWeight:850,color:preAccent,fontFamily:F,fontVariantNumeric:'tabular-nums'}}>{preCount}/10</div>
              </div>
              {renderTradeTagRows(preTradeTags,preAccent)}
            </div>
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{width:8,height:8,background:postAccent,boxShadow:`0 0 8px ${postAccent}88`}} />
                  <div style={sectionLbl}>Post-Trade Tags</div>
                </div>
                <div style={{fontSize:10,fontWeight:850,color:postAccent,fontFamily:F,fontVariantNumeric:'tabular-nums'}}>{postCount}/10</div>
              </div>
              {renderTradeTagRows(postTradeTags,postAccent)}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function BuilderSaveSpinner({ size = 14, color = '#fff' }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${color}44`,
        borderTopColor: color,
        display: 'inline-block',
        flexShrink: 0,
        animation: 'tlrBuilderSpin 0.65s linear infinite',
      }}
    />
  );
}

function StrategyBuilderModal(props) {
  const { c, F, stratWizardStep, setStratWizardStep, stratBName, setStratBName, stratEditId, onSave, onClose, onOpenTemplates, builderSavePhase } = props;
  const isSaving = builderSavePhase === 'saving';
  const isSaveSuccess = builderSavePhase === 'success';
  const saveBusy = isSaving || isSaveSuccess;
  const [tplBtnHov, setTplBtnHov] = React.useState(false);
  const [showGeneralInfoRequired, setShowGeneralInfoRequired] = React.useState(false);

  const STEPS = [
    { id:1, label:'General Info', hint:'Name your strategy, choose markets and timeframes.' },
    { id:2, label:'Strategy Flow', hint:'Build your entry and exit logic on the visual canvas.' },
    { id:3, label:'Trade Tags', hint:'Add pre and post-trade tags for analytics.' },
    { id:4, label:'Review', hint:'Confirm your strategy before saving.' },
  ];

  const generalInfoIssues = React.useMemo(() => {
    const issues = [];
    if (!(stratBName || '').trim()) issues.push({key:'name', label:'strategy name'});
    if (!(props.stratBMarkets || []).length) issues.push({key:'markets', label:'markets'});
    if (!(props.stratBTimeframes || []).length) issues.push({key:'timeframes', label:'time frames'});
    return issues;
  }, [stratBName, props.stratBMarkets, props.stratBTimeframes]);
  const generalInfoReady = generalInfoIssues.length === 0;
  React.useEffect(() => {
    if (generalInfoReady) setShowGeneralInfoRequired(false);
  }, [generalInfoReady]);
  const requireGeneralInfo = () => {
    if (generalInfoReady) return true;
    setShowGeneralInfoRequired(true);
    setStratWizardStep(1);
    return false;
  };
  const stepComplete = step => step===1 ? generalInfoReady : true;
  const canNext = stepComplete(stratWizardStep);
  const canGoTo = id => { for(let i=1;i<id;i++){if(!stepComplete(i))return false;} return true; };

  const goNext = () => {
    if (stratWizardStep >= 1 && !requireGeneralInfo()) return;
    setStratWizardStep(s => Math.min(4, s + 1));
  };
  const goPrev = () => setStratWizardStep(s => Math.max(1, s - 1));
  const goToStep = id => {
    if (id > 1 && !requireGeneralInfo()) return;
    if (id <= stratWizardStep || canGoTo(id)) setStratWizardStep(id);
  };
  const secondaryBtnStyle = {
    height:32,minWidth:86,padding:'0 14px',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,
    fontSize:11,fontWeight:700,letterSpacing:'0.04em',fontFamily:F,borderRadius:0,textTransform:'uppercase',
    color:c.ts,border:'1px solid rgba(140,160,255,0.22)',background:'rgba(140,160,255,0.04)',
    boxShadow:'none',cursor:'default',appearance:'none',boxSizing:'border-box',lineHeight:1,outline:'none',
    userSelect:'none',transition:'background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.08s ease'
  };
  const primaryBtnStyle = (enabled=true) => ({
    height:32,minWidth:86,padding:'0 16px',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,
    fontSize:11,fontWeight:800,letterSpacing:'0.06em',fontFamily:F,borderRadius:0,textTransform:'uppercase',
    color:enabled?'rgba(255,255,255,0.96)':c.tm,
    background:enabled?`linear-gradient(135deg,${c.ac},${c.acL})`:'rgba(140,160,255,0.10)',
    border:`1px solid ${enabled?'rgba(74,106,255,0.55)':'rgba(140,160,255,0.18)'}`,
    boxShadow:enabled?'0 2px 8px rgba(38,67,247,0.25)':'none',
    cursor:'default',opacity:enabled?1:0.55,appearance:'none',boxSizing:'border-box',lineHeight:1,outline:'none',
    userSelect:'none',
    transition:'background 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease, transform 0.08s ease'
  });
  const onSecondaryEnter = e => { e.currentTarget.style.background='rgba(140,160,255,0.07)'; e.currentTarget.style.borderColor='rgba(140,160,255,0.40)'; e.currentTarget.style.color=c.tx; };
  const onSecondaryLeave = e => { e.currentTarget.style.background='rgba(140,160,255,0.04)'; e.currentTarget.style.borderColor='rgba(140,160,255,0.22)'; e.currentTarget.style.color=c.ts; e.currentTarget.style.transform='scale(1)'; };
  const onSecondaryDown = e => { e.currentTarget.style.transform='scale(0.97)'; };
  const onSecondaryUp = e => { e.currentTarget.style.transform='scale(1)'; };
  const onPrimaryEnter = (e, enabled=true) => { if(enabled){ e.currentTarget.style.background=`linear-gradient(135deg,${c.acL},#6A8AFF)`; e.currentTarget.style.boxShadow='0 2px 14px rgba(38,67,247,0.5)'; } };
  const onPrimaryLeave = (e, enabled=true) => { if(enabled){ e.currentTarget.style.background=`linear-gradient(135deg,${c.ac},${c.acL})`; e.currentTarget.style.boxShadow='0 2px 8px rgba(38,67,247,0.25)'; e.currentTarget.style.filter='brightness(1)'; e.currentTarget.style.transform='scale(1)'; } };
  const onPrimaryDown = (e, enabled=true) => { if(enabled){ e.currentTarget.style.filter='brightness(0.9)'; e.currentTarget.style.transform='scale(0.97)'; } };
  const onPrimaryUp = (e, enabled=true) => { if(enabled){ e.currentTarget.style.filter='brightness(1)'; e.currentTarget.style.transform='scale(1)'; } };

  const saveClickLockRef = React.useRef(false);
  const handleSaveClick = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!stratBName.trim() || saveBusy || saveClickLockRef.current) return;
    saveClickLockRef.current = true;
    void Promise.resolve(onSave?.());
  };
  React.useEffect(() => {
    if (!builderSavePhase) saveClickLockRef.current = false;
  }, [builderSavePhase]);

  return (
    <ReactFlowProvider>
      <style>{'@keyframes tlrBuilderSpin{to{transform:rotate(360deg)}}'}</style>
      {/* Backdrop — clicks on it are intentionally ignored; use the close button to dismiss */}
      <div style={{position:'fixed',inset:0,zIndex:100010,background:'rgba(4,5,15,0.80)',
        display:'flex',alignItems:'center',justifyContent:'center',padding:'clamp(12px, 2vh, 24px) clamp(12px, 2vw, 28px)',boxSizing:'border-box'}}>
        {/* Modal — responsive; flow canvas auto-fits inside */}
        <div style={{width:'min(1120px, calc(100vw - 96px))',height:'min(82vh, 780px)',maxHeight:'calc(100vh - 24px)',
          display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',
          background:c.bg,
          border:`1px solid ${c.brH}`,
          boxShadow:'0 32px 96px rgba(0,0,0,0.9), 0 0 0 1px rgba(140,160,255,0.13)'}}
          onClick={e=>e.stopPropagation()}>

          {saveBusy && (
            <div
              role="status"
              aria-live="polite"
              aria-busy={isSaving}
              style={{
                position:'absolute',inset:0,zIndex:40,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,
                background:isSaveSuccess?'rgba(4,8,20,0.88)':'rgba(4,8,20,0.72)',backdropFilter:'blur(2px)',
              }}>
              {isSaving ? (
                <>
                  <BuilderSaveSpinner size={36} color={c.acL} />
                  <div style={{fontSize:14,fontWeight:800,color:c.tx,fontFamily:F,letterSpacing:'0.04em'}}>Saving strategy…</div>
                  <div style={{fontSize:11,fontWeight:600,color:c.tm,fontFamily:F,maxWidth:280,textAlign:'center',lineHeight:1.5}}>
                    Uploading your strategy. Large images can take a moment — please wait.
                  </div>
                </>
              ) : (
                <>
                  <div style={{width:52,height:52,borderRadius:'50%',background:`linear-gradient(135deg,#00A882,${c.gn})`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 24px rgba(0,212,161,0.35)'}}>
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/></svg>
                  </div>
                  <div style={{fontSize:15,fontWeight:800,color:c.gn,fontFamily:F,letterSpacing:'0.04em'}}>Strategy saved</div>
                </>
              )}
            </div>
          )}

          {/* Top accent */}
          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>

          {/* ── Wizard Header (step tabs) ── */}
          <div style={{flexShrink:0,borderBottom:`1px solid ${c.brH}`,background:c.bg}}>
            {/* Top row: title + close */}
            <div style={{height:44,display:'flex',alignItems:'center',gap:12,padding:'0 18px'}}>
              <img src="/LOGO-07.png" alt="Talaria" style={{width:26,height:26,objectFit:'contain',flexShrink:0}}/>
              <div style={{fontSize:13,fontWeight:800,color:c.tx,fontFamily:F,flex:1}}>
                {stratEditId?'Edit Strategy':'Strategy Builder'}
                <span style={{color:c.acL,fontWeight:600,marginLeft:8}}>— Step {stratWizardStep} of 4</span>
              </div>
              <div style={{flex:1}}/>
              {/* Templates button — opens the strategy template picker */}
              {onOpenTemplates && (
                <button onClick={onOpenTemplates} aria-label="Open strategy templates" title="Browse strategy templates"
                  onMouseEnter={()=>setTplBtnHov(true)} onMouseLeave={e=>{setTplBtnHov(false);e.currentTarget.style.transform='scale(1)';}}
                  style={{height:28,padding:'0 12px',marginRight:6,display:'inline-flex',alignItems:'center',gap:6,
                    fontSize:11,fontWeight:700,letterSpacing:'0.04em',fontFamily:F,
                    color:tplBtnHov?c.acL:c.ts,
                    background:tplBtnHov?'rgba(140,160,255,0.06)':c.hv2,
                    border:`1px solid ${tplBtnHov?c.acB:'rgba(140,160,255,0.22)'}`,
                    cursor:'default',transition:'background 0.12s ease, color 0.12s ease, border-color 0.12s ease, transform 0.08s ease'}}
                  onMouseDown={e=>{e.currentTarget.style.transform='scale(0.97)';}}
                  onMouseUp={e=>{e.currentTarget.style.transform='scale(1)';}}>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="8" height="8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                    <rect x="13" y="3" width="8" height="8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                    <rect x="3" y="13" width="8" height="8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                    <rect x="13" y="13" width="8" height="8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  </svg>
                  TEMPLATES
                </button>
              )}
              {/* Close button */}
              <div onClick={()=>{ if (!saveBusy) onClose?.(); }}
                style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',
                  cursor:saveBusy?'not-allowed':'default',color:c.tm,borderRadius:0,transition:'color 0.12s, background 0.12s, transform 0.08s',opacity:saveBusy?0.35:1}}
                onMouseEnter={e=>{e.currentTarget.style.color=c.rd;e.currentTarget.style.background='rgba(255,80,104,0.08)';}}
                onMouseLeave={e=>{e.currentTarget.style.color=c.tm;e.currentTarget.style.background='transparent';e.currentTarget.style.transform='scale(1)';}}
                onMouseDown={e=>{e.currentTarget.style.transform='scale(0.92)';}}
                onMouseUp={e=>{e.currentTarget.style.transform='scale(1)';}}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            {/* Step tabs */}
            <div style={{display:'flex',borderTop:`1px solid ${c.brH}`}}>
              {STEPS.map(s=>{
                const isActive = stratWizardStep===s.id;
                const isDone = stratWizardStep>s.id;
                return (
                  <div key={s.id}
                    onClick={()=>goToStep(s.id)}
                    style={{flex:1,height:36,display:'flex',alignItems:'center',justifyContent:'center',gap:7,
                      cursor:'default',position:'relative',transition:'background 0.12s',
                      background:isActive?c.acD:'transparent'}}
                    onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=c.hv;}}
                    onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
                    <div style={{width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',
                      background:isActive?c.acL:isDone?c.gn:'rgba(255,255,255,0.1)',
                      flexShrink:0,transition:'background 0.15s'}}>
                      {isDone
                        ?<svg width={10} height={10} viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="rgba(4,5,15,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        :<span style={{fontSize:9,fontWeight:900,color:isActive?'#fff':'rgba(255,255,255,0.4)',fontFamily:F}}>{s.id}</span>
                      }
                    </div>
                    <span style={{fontSize:11,fontWeight:isActive?700:500,color:isActive?c.acL:isDone?c.gn:c.tm,fontFamily:F}}>{s.label}</span>
                    {isActive&&<div style={{position:'absolute',bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Content area ── */}
          <div style={{flex:1,overflow:stratWizardStep===2?'hidden':'auto',display:'flex',flexDirection:'column',minHeight:0}}
            className={stratWizardStep!==2?'tlr-scroll':undefined}>

            {/* Step 1: General Info */}
            {stratWizardStep===1&&<GeneralInfoStepContent c={c} F={F} stratBName={props.stratBName} setStratBName={props.setStratBName} stratBDesc={props.stratBDesc} setStratBDesc={props.setStratBDesc} stratBMarkets={props.stratBMarkets} setStratBMarkets={props.setStratBMarkets} stratBTimeframes={props.stratBTimeframes} setStratBTimeframes={props.setStratBTimeframes} stratBInstruments={props.stratBInstruments} setStratBInstruments={props.setStratBInstruments} stratBSupportInst={props.stratBSupportInst} setStratBSupportInst={props.setStratBSupportInst} stratBImages={props.stratBImages} setStratBImages={props.setStratBImages} stratBLogoEmoji={props.stratBLogoEmoji} setStratBLogoEmoji={props.setStratBLogoEmoji} stratBTags={props.stratBTags} setStratBTags={props.setStratBTags} showRequiredHint={showGeneralInfoRequired} generalInfoMissingKeys={generalInfoIssues.map(issue=>issue.key)} generalInfoMissingLabels={generalInfoIssues.map(issue=>issue.label)} />}

            {/* Step 2: Canvas */}
            {stratWizardStep===2&&<StrategyCanvasWorkspaceInner {...props} step={2} goPrev={goPrev} goNext={goNext} secondaryBtnStyle={secondaryBtnStyle} primaryBtnStyle={primaryBtnStyle} onSecondaryEnter={onSecondaryEnter} onSecondaryLeave={onSecondaryLeave} onSecondaryDown={onSecondaryDown} onSecondaryUp={onSecondaryUp} onPrimaryEnter={onPrimaryEnter} onPrimaryLeave={onPrimaryLeave} onPrimaryDown={onPrimaryDown} onPrimaryUp={onPrimaryUp} />}

            {/* Step 3: Trade Tags */}
            {stratWizardStep===3&&<VariablesStepContent c={c} F={F} stratBVariables={props.stratBVariables} setStratBVariables={props.setStratBVariables} />}

            {/* Step 4: Review */}
            {stratWizardStep===4&&<ReviewStepContent c={c} F={F} stratBName={props.stratBName} stratBDesc={props.stratBDesc} stratBMarkets={props.stratBMarkets} stratBTimeframes={props.stratBTimeframes} stratBTags={props.stratBTags} stratBVariables={props.stratBVariables} stratBInstruments={props.stratBInstruments} stratBSupportInst={props.stratBSupportInst} stratBImages={props.stratBImages} stratBLogoEmoji={props.stratBLogoEmoji} canvasNodes={props.canvasNodes} sessions={props.sessions} stratEditId={props.stratEditId} />}
          </div>

          {/* ── Footer (only for steps 1, 3, 4 — step 2 has its own canvas footer) ── */}
          {stratWizardStep!==2&&(
            <div data-strategy-builder-footer="1" style={{flexShrink:0,height:56,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',borderTop:`1px solid ${c.brH}`,background:c.el,pointerEvents:saveBusy?'none':'auto'}}>
              {/* Cancel / Back */}
              <button onClick={saveBusy?undefined:(stratWizardStep===1?onClose:goPrev)} disabled={saveBusy}
                style={{...secondaryBtnStyle,opacity:saveBusy?0.45:1,cursor:saveBusy?'not-allowed':'default'}}
                onMouseEnter={onSecondaryEnter}
                onMouseLeave={onSecondaryLeave}
                onMouseDown={onSecondaryDown}
                onMouseUp={onSecondaryUp}>
                {stratWizardStep>1&&<svg width={11} height={11} viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
                {stratWizardStep===1?'Cancel':'Back'}
              </button>
              {/* Step dots */}
              <div style={{display:'flex',gap:5,alignItems:'center'}}>
                {[1,2,3,4].map(d=>(
                  <div key={d} style={{width:6,height:6,borderRadius:'50%',background:stratWizardStep===d?c.acL:c.brH,transition:'background 0.15s'}} />
                ))}
              </div>
              {/* Next / Save */}
              {stratWizardStep<4?(
                <button onClick={goNext}
                  style={primaryBtnStyle(stratWizardStep===1?true:canNext)}
                  onMouseEnter={e=>onPrimaryEnter(e,stratWizardStep===1?true:canNext)}
                  onMouseLeave={e=>onPrimaryLeave(e,stratWizardStep===1?true:canNext)}
                  onMouseDown={e=>onPrimaryDown(e,stratWizardStep===1?true:canNext)}
                  onMouseUp={e=>onPrimaryUp(e,stratWizardStep===1?true:canNext)}>
                  Next
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              ):(
                <button type="button" onClick={handleSaveClick} disabled={!stratBName.trim()||saveBusy} aria-busy={isSaving} aria-disabled={!stratBName.trim()||saveBusy}
                  style={{height:30,padding:'0 14px',minWidth:148,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,
                    fontSize:12,fontWeight:700,letterSpacing:'0.02em',fontFamily:F,borderRadius:0,
                    color:stratBName.trim()&&!saveBusy?'#fff':c.tm,
                    background:stratBName.trim()&&!saveBusy?`linear-gradient(135deg,#00A882,${c.gn})`:'rgba(140,160,255,0.10)',
                    border:`1px solid ${stratBName.trim()&&!saveBusy?'rgba(0,212,161,0.5)':'rgba(140,160,255,0.18)'}`,
                    boxShadow:stratBName.trim()&&!saveBusy?'0 2px 8px rgba(0,212,161,0.25)':'none',
                    cursor:saveBusy?'wait':'default',opacity:stratBName.trim()?saveBusy?0.85:1:0.55,
                    transition:'background 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease, transform 0.08s ease'}}
                  onMouseEnter={e=>{if(stratBName.trim()&&!saveBusy){e.currentTarget.style.background=`linear-gradient(135deg,#00C499,#11E4B5)`;e.currentTarget.style.boxShadow='0 2px 14px rgba(0,212,161,0.5)';}}}
                  onMouseLeave={e=>{if(stratBName.trim()&&!saveBusy){e.currentTarget.style.background=`linear-gradient(135deg,#00A882,${c.gn})`;e.currentTarget.style.boxShadow='0 2px 8px rgba(0,212,161,0.25)';e.currentTarget.style.filter='brightness(1)';e.currentTarget.style.transform='scale(1)';}}}
                  onMouseDown={e=>{if(stratBName.trim()&&!saveBusy){e.currentTarget.style.filter='brightness(0.9)';e.currentTarget.style.transform='scale(0.97)';}}}
                  onMouseUp={e=>{if(stratBName.trim()&&!saveBusy){e.currentTarget.style.filter='brightness(1)';e.currentTarget.style.transform='scale(1)';}}}>
                  {isSaving ? (
                    <>
                      <BuilderSaveSpinner size={13} />
                      Saving…
                    </>
                  ) : isSaveSuccess ? (
                    <>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
                      Saved
                    </>
                  ) : (
                    <>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
                      {stratEditId?'Save Changes':'Create Strategy'}
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

export { STRATEGY_TEMPLATES, buildNodesFromTemplate, buildInitialSections, TemplatePickerModal, StrategyBuilderModal, MKT_CAT_OPTS };
