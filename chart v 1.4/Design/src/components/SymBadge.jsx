import React from 'react';

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

export default SymBadge;
