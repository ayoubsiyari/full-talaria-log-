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

export { parseColor, rgbToHsv, hsvToRgb, toHex2, cpBuildColor };
