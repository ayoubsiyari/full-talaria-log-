/* settings-panel-ext.js  Part 2: Project + Leverage + Symbol + Commissions */
(function(){
    function init(){
        var H=window._spH, B=window._spB, W=window._spW, P=window._spPanels;
        if(!H||!B||!W||!P){ setTimeout(init,150); return; }

        var sec=B.sec, st=B.st, chk=B.chk, irow=B.irow, sel=B.sel, clr=B.clr, rng=B.rng, savebtn=B.savebtn, cancelbtn=B.cancelbtn;
        var wChk=W.wChk, wSel=W.wSel, wNum=W.wNum, wRng=W.wRng, wClr=W.wClr;
        var ch=H.ch, apply=H.apply, set=H.set, sess=H.sess, saveSess=H.saveSess;

        /* ════════════════════════════════════════════
           PROJECT SETTINGS
        ════════════════════════════════════════════ */
        P['project'] = {
            title: 'Project Settings',
            build: function(){
                var s=sess();
                var TZ=[
                    ['(UTC-12) Etc/GMT+12','UTC-12'],['(UTC-11) Etc/GMT+11','UTC-11'],
                    ['(UTC-10) Honolulu','UTC-10 Honolulu'],['(UTC-8) Los Angeles','UTC-8 Los Angeles'],
                    ['(UTC-7) Denver','UTC-7 Denver'],['(UTC-6) Chicago','UTC-6 Chicago'],
                    ['(UTC-5) Toronto','UTC-5 Toronto (ET)'],['(UTC-4) Halifax','UTC-4 Halifax'],
                    ['(UTC-3) Buenos Aires','UTC-3 Buenos Aires'],['(UTC-1) Azores','UTC-1 Azores'],
                    ['(UTC+0) London','UTC+0 London'],['(UTC+1) Amsterdam','UTC+1 Amsterdam'],
                    ['(UTC+2) Cairo','UTC+2 Cairo'],['(UTC+3) Moscow','UTC+3 Moscow'],
                    ['(UTC+4) Dubai','UTC+4 Dubai'],['(UTC+5:30) Mumbai','UTC+5:30 Mumbai'],
                    ['(UTC+7) Bangkok','UTC+7 Bangkok'],['(UTC+8) Shanghai','UTC+8 Shanghai'],
                    ['(UTC+9) Tokyo','UTC+9 Tokyo'],['(UTC+10) Sydney','UTC+10 Sydney'],
                    ['(UTC+12) Auckland','UTC+12 Auckland']
                ];
                return sec(st('Timezone')+
                    sel('Timezone','tz',TZ,s.timezone||'(UTC-5) Toronto')+
                    sel('Daylight saving','dst',[['none','None DST'],['us','US DST'],['eu','EU DST'],['auto','Auto']],s.daylightSaving||'none'))+
                sec(st('Session')+
                    sel('Session close time','closeTime',[['never','Never'],['00:00','00:00'],['17:00','17:00 (NY Close)'],['21:00','21:00 (London)'],['23:59','23:59']],s.sessionCloseTime||'never'))+
                sec(st('Account')+
                    irow('Initial balance ($)','balance',s.initialBalance||s.balance||10000,100,10000000,100)+
                    savebtn('saveBalance','Save Balance'));
            },
            wire: function(){
                wSel('tz',function(v){ var s=sess(); s.timezone=v; saveSess(s); if(window.timezoneManager&&window.timezoneManager.setTimezone) window.timezoneManager.setTimezone(v); });
                wSel('dst',function(v){ var s=sess(); s.daylightSaving=v; saveSess(s); });
                wSel('closeTime',function(v){ var s=sess(); s.sessionCloseTime=v; saveSess(s); });
                var sb=document.getElementById('saveBalance');
                if(sb) sb.addEventListener('click',function(){
                    var inp=document.getElementById('nr_balance');
                    var val=inp?(parseFloat(inp.value)||10000):10000;
                    var s=sess(); s.initialBalance=val; s.balance=val; saveSess(s);
                    document.querySelectorAll('#accountBalance,#currentBalance,.balance-value').forEach(function(el){
                        el.textContent='$'+val.toLocaleString('en-US',{minimumFractionDigits:2});
                    });
                    this.textContent='Saved ✓'; this.style.background='#089981';
                    var self=this; setTimeout(function(){self.textContent='Save Balance'; self.style.background='#2962ff';},1800);
                });
            }
        };

        /* ════════════════════════════════════════════
           LEVERAGE
        ════════════════════════════════════════════ */
        P['leverage'] = {
            title: 'Leverage',
            build: function(){
                var lev=parseInt(sess().leverage||100,10);
                return sec(st('Account Leverage')+
                    '<p style="color:#787b86;font-size:12px;line-height:1.5;margin:0 0 14px;">Sets the multiplier for position sizing during backtesting. Higher leverage increases both potential profit and risk.</p>'+
                    rng('Leverage (1 : x)','lev',lev,1,500)+
                    irow('Enter value','levVal',lev,1,500))+
                '<div style="display:flex;gap:8px;margin-top:4px;">'+
                savebtn('saveLev','Save').replace('width:100%','flex:1')+
                cancelbtn('cancelLev','Cancel').replace('width:100%','flex:1')+'</div>';
            },
            wire: function(){
                var rnEl=document.getElementById('rng_lev'), nmEl=document.getElementById('nr_levVal');
                if(rnEl&&nmEl){
                    rnEl.addEventListener('input', function(){ nmEl.value=this.value; document.getElementById('rv_lev').textContent=this.value; });
                    nmEl.addEventListener('change',function(){ var v=Math.max(1,Math.min(500,parseInt(this.value)||1)); rnEl.value=v; document.getElementById('rv_lev').textContent=v; });
                }
                var savB=document.getElementById('saveLev');
                if(savB) savB.addEventListener('click',function(){
                    var v=parseInt((nmEl?nmEl.value:rnEl?rnEl.value:100))||100;
                    var s=sess(); s.leverage=v; saveSess(s);
                    document.querySelectorAll('#challengeLeverage,.leverage-value').forEach(function(el){ el.textContent='1:'+v; });
                    this.textContent='Saved ✓'; this.style.background='#089981';
                    var self=this; setTimeout(function(){self.textContent='Save'; self.style.background='#2962ff';},1800);
                });
                var canB=document.getElementById('cancelLev');
                if(canB) canB.addEventListener('click',function(){ if(window._spPanels&&window._spPanels.leverage) { var c=document.getElementById('settingsPanelContent'); if(c){c.innerHTML=B.hdr('Leverage')+P['leverage'].build(); var bk=document.getElementById('spBack'); if(bk) bk.addEventListener('click',function(){ if(window._spShowRoot) window._spShowRoot(); }); P['leverage'].wire(); } } });
            }
        };

        /* ════════════════════════════════════════════
           SYMBOL PROPERTIES
        ════════════════════════════════════════════ */
        P['symbol'] = {
            title: 'Symbol Properties',
            build: function(){
                var cs=(ch()&&ch().chartSettings)||{};
                return sec(st('Symbol Title')+
                    chk('Show symbol title','symTitle',cs.symbolTitle!==false)+
                    sel('Title format','symFmt',[['Description','Description'],['Ticker','Ticker'],['Ticker and description','Ticker + Description']],cs.symbolTitleFormat||'Description')+
                    clr('Title text color','symText',cs.symbolTextColor||'#d1d4dc'))+
                sec(st('OHLC Data')+
                    chk('Show chart values (OHLC bar)','showVals',cs.showChartValues!==false)+
                    chk('Show bar change % values','showBar',cs.showBarChangeValues!==false))+
                sec(st('Indicators Legend')+
                    chk('Show indicator titles','indTitles',cs.showIndicatorTitles!==false)+
                    chk('Show indicator arguments','indArgs',cs.showIndicatorArguments!==false)+
                    chk('Show indicator values','indVals',cs.showIndicatorValues!==false)+
                    chk('Show indicator background','indBg',cs.showIndicatorBackground!==false)+
                    rng('Legend background opacity','indBgOp',cs.indicatorBackgroundOpacity||50,0,100));
            },
            wire: function(){
                wChk('symTitle', function(v){ set('symbolTitle',v); });
                wSel('symFmt',   function(v){ set('symbolTitleFormat',v); });
                wClr('symText',  function(v){ set('symbolTextColor',v); });
                wChk('showVals', function(v){ set('showChartValues',v); });
                wChk('showBar',  function(v){ set('showBarChangeValues',v); });
                wChk('indTitles',function(v){ set('showIndicatorTitles',v); });
                wChk('indArgs',  function(v){ set('showIndicatorArguments',v); });
                wChk('indVals',  function(v){ set('showIndicatorValues',v); });
                wChk('indBg',    function(v){ set('showIndicatorBackground',v); });
                wRng('indBgOp',  function(v){ set('indicatorBackgroundOpacity',v); });
            }
        };

        /* ════════════════════════════════════════════
           COMMISSIONS
        ════════════════════════════════════════════ */
        P['commissions'] = {
            title: 'Commissions',
            build: function(){
                var s=sess(), inclSwap=!!s.includeSwap;
                return sec(st('Trading Costs')+
                    irow('Average spread (pips)','spread',s.averageSpread||0,0,100,0.1)+
                    irow('Slippage (pips)','slip',s.slippage||0,0,100,0.1))+
                sec(st('Commission')+
                    sel('Commission type','commType',[['none','None'],['per_trade','Per trade (fixed)'],['per_lot','Per lot'],['percent','% of trade value']],s.commissionType||'none')+
                    irow('Commission value','commVal',s.commissionValue||0,0,1000,0.01))+
                sec(st('Overnight Swap')+
                    chk('Include swap costs','inclSwap',inclSwap)+
                    '<div id="swapFields"'+(inclSwap?'':' style="display:none;"')+'>'+
                    irow('Swap long (per night)','swapLong',s.swapLong||0,-1000,1000,0.001)+
                    irow('Swap short (per night)','swapShort',s.swapShort||0,-1000,1000,0.001)+
                    '</div>')+
                '<div style="display:flex;gap:8px;margin-top:4px;">'+
                savebtn('saveComm','Save').replace('width:100%','flex:1')+
                cancelbtn('cancelComm','Cancel').replace('width:100%','flex:1')+'</div>';
            },
            wire: function(){
                wChk('inclSwap',function(v){
                    var sf=document.getElementById('swapFields');
                    if(sf) sf.style.display=v?'':'none';
                });
                var saveC=document.getElementById('saveComm');
                if(saveC) saveC.addEventListener('click',function(){
                    var s=sess();
                    function nv(id){ var el=document.getElementById('nr_'+id); return el?parseFloat(el.value)||0:0; }
                    function sv(id){ var el=document.getElementById('sl_'+id); return el?el.value:'none'; }
                    function cv(id){ return document.getElementById('ck_'+id)&&document.getElementById('ck_'+id).classList.contains('checked'); }
                    s.averageSpread   = nv('spread');
                    s.slippage        = nv('slip');
                    s.commissionType  = sv('commType');
                    s.commissionValue = nv('commVal');
                    s.includeSwap     = cv('inclSwap');
                    s.swapLong        = nv('swapLong');
                    s.swapShort       = nv('swapShort');
                    saveSess(s);
                    this.textContent='Saved ✓'; this.style.background='#089981';
                    var self=this; setTimeout(function(){self.textContent='Save'; self.style.background='#2962ff';},1800);
                });
                var canC=document.getElementById('cancelComm');
                if(canC) canC.addEventListener('click',function(){
                    var c=document.getElementById('settingsPanelContent');
                    if(c){ c.innerHTML=B.hdr('Commissions')+P['commissions'].build(); var bk=document.getElementById('spBack'); if(bk) bk.addEventListener('click',function(){ document.querySelector('.settings-panel-menu').style.display=''; c.style.display='none'; c.innerHTML=''; }); P['commissions'].wire(); }
                });
            }
        };

        /* ── Apply backtesting session settings to chart on startup ── */
        function applySession(){
            var c=ch(); if(!c) return;
            var s=sess(); if(!Object.keys(s).length) return;
            c.chartSettings=c.chartSettings||{};
            if(s.leverage){ document.querySelectorAll('#challengeLeverage,.leverage-value').forEach(function(el){el.textContent='1:'+s.leverage;}); }
            if(c.applyChartSettings) c.applyChartSettings();
        }
        if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(applySession,1000);});
        else setTimeout(applySession,1000);
    }

    init();
})();
