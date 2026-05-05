import React from 'react';
import { hsvToRgb, cpBuildColor } from '../utils/colorUtils';

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

export default ColorPickerPopup;
