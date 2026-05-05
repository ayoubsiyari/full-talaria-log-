import React from 'react';

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

export default Toggle;
