import React from 'react';

export function renderLoadingScreen(ctx) {
  const { loading, loadFading, loadPhase, loadDots, typedQuote, loadQuote } = ctx;
  if (!loading) return null;
  return (
        <div style={{
          position:"fixed", inset:0, zIndex:99999,
          background:"#07080E",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          fontFamily:"'Exo 2',sans-serif",
          opacity: loadFading ? 0 : 1,
          transition: loadFading ? "opacity 0.3s ease" : "none",
          animation:"tlrLoadFadeIn 0.5s ease forwards",
        }}>
          {/* Stars field */}
          {(()=>{
            // c:0=white, 1=blue-bright, 2=blue-mid, 3=blue-dim
            const starData=[
              {x:8,y:12,s:1.5,d:2.1,del:0,c:1},{x:18,y:5,s:1,d:3.4,del:0.8,c:0},{x:32,y:22,s:2,d:2.8,del:0.3,c:2},
              {x:45,y:8,s:1.2,d:4.1,del:1.2,c:1},{x:57,y:18,s:1.8,d:2.5,del:0.6,c:0},{x:68,y:4,s:1,d:3.8,del:0.1,c:2},
              {x:78,y:14,s:1.4,d:2.2,del:1.5,c:1},{x:88,y:7,s:1.7,d:3.0,del:0.9,c:2},{x:93,y:25,s:1,d:4.4,del:0.4,c:0},
              {x:5,y:38,s:1.3,d:2.7,del:1.1,c:1},{x:14,y:50,s:2,d:3.3,del:0.2,c:2},{x:25,y:35,s:1,d:2.0,del:1.7,c:0},
              {x:38,y:44,s:1.6,d:4.0,del:0.5,c:1},{x:50,y:32,s:1.1,d:2.9,del:1.3,c:2},{x:62,y:48,s:1.8,d:3.6,del:0.7,c:1},
              {x:74,y:38,s:1,d:2.3,del:0.0,c:0},{x:84,y:52,s:1.5,d:3.1,del:1.6,c:2},{x:95,y:42,s:1.2,d:4.2,del:0.3,c:1},
              {x:10,y:68,s:1.7,d:2.6,del:0.8,c:2},{x:22,y:75,s:1,d:3.5,del:1.4,c:1},{x:35,y:62,s:2,d:2.2,del:0.6,c:0},
              {x:48,y:80,s:1.3,d:4.3,del:0.1,c:1},{x:60,y:65,s:1.5,d:2.8,del:1.2,c:2},{x:72,y:78,s:1,d:3.0,del:0.4,c:1},
              {x:82,y:60,s:1.8,d:2.4,del:0.9,c:0},{x:92,y:72,s:1.2,d:3.9,del:1.5,c:2},{x:6,y:85,s:1,d:2.1,del:0.2,c:1},
              {x:16,y:90,s:1.6,d:3.7,del:1.0,c:2},{x:28,y:88,s:1.1,d:2.6,del:0.3,c:0},{x:42,y:92,s:1.4,d:4.1,del:1.3,c:1},
              {x:55,y:85,s:1,d:3.2,del:0.7,c:2},{x:65,y:93,s:1.7,d:2.0,del:0.0,c:1},{x:77,y:88,s:1.2,d:3.4,del:1.1,c:0},
              {x:88,y:82,s:1,d:2.7,del:0.5,c:2},{x:98,y:90,s:1.5,d:3.9,del:1.4,c:1},{x:3,y:55,s:1.3,d:2.5,del:0.6,c:0},
              {x:52,y:14,s:1,d:3.8,del:0.8,c:2},{x:71,y:28,s:1.6,d:2.3,del:0.2,c:1},{x:87,y:35,s:1,d:4.0,del:1.0,c:2},
              {x:12,y:28,s:1.2,d:3.1,del:0.5,c:1},{x:29,y:15,s:1.8,d:2.4,del:1.3,c:2},{x:43,y:30,s:1,d:4.2,del:0.0,c:1},
              {x:63,y:10,s:1.5,d:2.7,del:0.9,c:0},{x:75,y:22,s:1.1,d:3.6,del:1.6,c:2},{x:91,y:16,s:1.3,d:2.2,del:0.4,c:1},
              {x:7,y:72,s:1.7,d:3.9,del:1.2,c:2},{x:20,y:60,s:1,d:2.5,del:0.1,c:0},{x:34,y:78,s:1.4,d:4.3,del:0.7,c:1},
              {x:47,y:55,s:1.6,d:3.0,del:1.4,c:2},{x:58,y:72,s:1,d:2.1,del:0.3,c:1},{x:70,y:58,s:1.8,d:3.7,del:1.0,c:0},
              {x:80,y:75,s:1.2,d:2.8,del:0.6,c:2},{x:90,y:58,s:1,d:4.1,del:1.5,c:1},{x:97,y:68,s:1.5,d:2.3,del:0.2,c:2},
              {x:2,y:20,s:1.1,d:3.5,del:0.8,c:1},{x:15,y:42,s:1.4,d:2.6,del:1.1,c:0},{x:27,y:50,s:1.7,d:4.0,del:0.4,c:2},
              {x:40,y:18,s:1,d:3.2,del:1.7,c:1},{x:53,y:40,s:1.3,d:2.4,del:0.6,c:2},{x:66,y:35,s:1.8,d:3.8,del:1.3,c:1},
              {x:79,y:46,s:1,d:2.1,del:0.2,c:0},{x:85,y:28,s:1.5,d:4.4,del:0.9,c:2},{x:4,y:94,s:1.2,d:3.3,del:1.6,c:1},
              {x:30,y:96,s:1,d:2.7,del:0.3,c:2},{x:50,y:98,s:1.6,d:3.6,del:0.7,c:1},{x:70,y:95,s:1.1,d:2.2,del:1.4,c:0},
              {x:90,y:97,s:1.8,d:4.1,del:0.5,c:2},{x:44,y:60,s:2,d:2.5,del:1.0,c:1},{x:56,y:55,s:1.3,d:3.4,del:0.1,c:2},
            ];
            const starColors=["rgba(255,255,255,0.9)","rgba(110,153,255,1)","rgba(74,106,255,0.85)","rgba(150,180,255,0.7)"];
            return(
              <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
                {starData.map((st,i)=>(
                  <div key={i} style={{
                    position:"absolute",left:`${st.x}%`,top:`${st.y}%`,
                    width:st.s,height:st.s,borderRadius:"50%",
                    background:starColors[st.c||0],
                    boxShadow:st.c>0?`0 0 ${st.s*2}px ${starColors[st.c||0]}`:"none",
                    animation:`tlrStarTwinkle ${st.d}s ease-in-out infinite ${st.del}s`,
                  }}/>
                ))}
              </div>
            );
          })()}
          {/* Logo mark */}
          <div style={{position:"relative",marginBottom:16}}>
            <img src="/LOGO-07.png" alt="Talaria" style={{
              width:440, height:440, objectFit:"contain", display:"block", position:"relative",
              filter:"brightness(1.05)",
              animation:"tlrLoadPulse 8s ease-in-out infinite",
            }}/>
          </div>
          {/* Wordmark */}
          <div style={{fontSize:28,fontWeight:800,color:"rgba(255,255,255,0.92)",letterSpacing:"0.24em",marginBottom:10}}>Talaria-Log</div>
          {/* Loading phase label */}
          <div style={{marginTop:36,fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.28)",letterSpacing:"0.14em",textTransform:"uppercase",minWidth:120,textAlign:"center"}}>
            {loadPhase === "chart" ? "Loading Chart" : "Loading Tickers"}<span style={{display:"inline-block",minWidth:22}}>{loadDots}</span>
          </div>
          {/* Progress bar */}
          <div style={{marginTop:10,width:540,height:6,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden",position:"relative"}}>
            <div style={{
              position:"absolute",left:0,top:0,bottom:0,
              background:"linear-gradient(90deg,#2643F7,#4A6AFF,#6A8AFF)",
              borderRadius:2,
              animation:"tlrLoadBar 10s linear forwards",
              boxShadow:"0 0 8px rgba(74,106,255,0.7)",
            }}/>
          </div>
          {/* Quote — typewriter */}
          <div style={{marginTop:36,maxWidth:500,textAlign:"center",padding:"0 32px"}}>
            <div style={{fontSize:14,fontStyle:"italic",color:"rgba(255,255,255,0.42)",lineHeight:1.65,marginBottom:12,minHeight:46}}>
              "{typedQuote}<span style={{animation:"tlrTypeCursor 0.7s ease-in-out infinite",opacity:typedQuote.length>=loadQuote[0].length?0:1}}>|</span>"
            </div>
            <div style={{fontSize:11,fontWeight:700,color:typedQuote.length>=loadQuote[0].length?"rgba(255,255,255,0.55)":"transparent",letterSpacing:"0.16em",textTransform:"uppercase",transition:"color 0.4s ease"}}>— {loadQuote[1]}</div>
          </div>
          {/* Website */}
          <div style={{position:"absolute",bottom:24,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em"}}>www.talaria-log.com</div>
          </div>
        </div>
  );
}
