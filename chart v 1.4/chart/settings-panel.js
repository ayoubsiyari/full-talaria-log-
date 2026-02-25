/* settings-panel.js – two-column layout, nav items switch content directly */
window._spPanels = {};

(function () {
    function init() {
    /* ── core helpers ── */
    function ch()      { return window.chart || window.mainChart || null; }
    function apply()   { var c=ch(); if(!c) return; if(c.applyChartSettings) c.applyChartSettings(); if(c.scheduleRender) c.scheduleRender(); else if(c.render) c.render(); try{if(c.saveSettings)c.saveSettings();}catch(e){} }
    function set(k,v)  { var c=ch(); if(!c) return; c.chartSettings=c.chartSettings||{}; c.chartSettings[k]=v; apply(); }
    function sess()    { try{return window.backtestingSession||JSON.parse(localStorage.getItem('backtestingSession')||'{}')||{};}catch(e){return{};} }
    function saveSess(s){ window.backtestingSession=s; try{localStorage.setItem('backtestingSession',JSON.stringify(s));}catch(e){} var c=ch(); if(c) c.backtestingSession=s; }
    function gLoad()   { try{return JSON.parse(localStorage.getItem('talaria_general_settings')||'{}');}catch(e){return{};} }
    function gSave(p)  { var c=Object.assign({},gLoad(),p); try{localStorage.setItem('talaria_general_settings',JSON.stringify(c));}catch(e){} window.generalSettings=c; return c; }

    /* expose to Part 2 */
    window._spH = { ch:ch, apply:apply, set:set, sess:sess, saveSess:saveSess, gLoad:gLoad, gSave:gSave };

    /* ── DOM setup ── */
    var btn    = document.getElementById('settingsBtn');
    var panel  = document.getElementById('settingsPanel');
    var closeB = document.getElementById('settingsPanelClose');
    var contEl = document.getElementById('settingsPanelContent');
    var titleEl= document.getElementById('spContentTitle');
    if (!panel) { console.warn('[SP] settingsPanel not found'); return; }

    var currentType = 'general';

    function openPanel() {
        panel.classList.add('open');
        loadSection(currentType);
        var c = ch();
        if (c) { c.priceAxisLeft = true; c.margin.l = 60; c.margin.r = 0; if (c.scheduleRender) c.scheduleRender(); }
    }
    function closePanel() {
        panel.classList.remove('open');
        var c = ch();
        if (c) { c.priceAxisLeft = false; c.margin.l = 0; c.margin.r = 60; if (c.scheduleRender) c.scheduleRender(); }
    }

    window._spToggle = function() { panel.classList.contains('open') ? closePanel() : openPanel(); };
    window._spLoad = function(type, el) {
        /* update active state */
        panel.querySelectorAll('.sp-nav-item').forEach(function(n){ n.classList.remove('active'); });
        if (el) el.classList.add('active');
        loadSection(type);
    };

    if (btn)    btn.addEventListener('click', function(e){ e.stopPropagation(); window._spToggle(); });
    if (closeB) closeB.addEventListener('click', function(e){ e.stopPropagation(); closePanel(); });

    /* nav item clicks */
    panel.querySelectorAll('.sp-nav-item[data-settings]').forEach(function(item){
        item.addEventListener('click', function(e){
            e.stopPropagation();
            var type = this.dataset.settings;
            panel.querySelectorAll('.sp-nav-item').forEach(function(n){ n.classList.remove('active'); });
            this.classList.add('active');
            loadSection(type);
        });
    });

    function loadSection(type) {
        console.log('[SP] loadSection:', type, '| panel registered:', !!window._spPanels[type], '| contEl:', !!contEl);
        currentType = type;
        var titles = { general:'General Settings', chart:'Chart Settings', project:'Project Settings', leverage:'Leverage', symbol:'Symbol Properties', commissions:'Commissions' };
        if (titleEl) titleEl.textContent = titles[type] || type;
        panel.querySelectorAll('.sp-nav-item').forEach(function(n){
            n.classList.toggle('active', n.dataset.settings === type);
        });
        /* re-query contEl in case DOM changed */
        var el = document.getElementById('settingsPanelContent');
        if (!el) { console.warn('[SP] settingsPanelContent not found'); return; }
        try {
            var p = window._spPanels[type];
            el.innerHTML = p ? p.build() : '<p style="color:#787b86;padding:20px 0;">Coming soon — <b>'+type+'</b></p>';
            console.log('[SP] content set, length:', el.innerHTML.length);
        } catch(e) {
            el.innerHTML = '<p style="color:#f23645;padding:20px;">Build error: '+e.message+'</p>';
            console.error('[SP] build error:', e);
        }
        try {
            var p2 = window._spPanels[type];
            if (p2 && p2.wire) p2.wire();
        } catch(e) { console.error('[SP] wire error:', e); }
    }

    /* keep openSub alias for any legacy calls */
    function openSub(type){ loadSection(type); }

    /* ── HTML builders (exposed for Part 2) ── */
    var CSV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';

    function hdr(t){ return ''; /* title now lives in sp-content-header */ }
    function sec(c){ return '<div class="settings-section">'+c+'</div>'; }
    function st(t) { return '<div class="settings-section-title" style="margin-top:4px;">'+t+'</div>'; }
    function chk(label,id,on){ return '<div class="settings-checkbox-item'+(on?' checked':'')+'" id="ck_'+id+'" style="cursor:pointer;"><div class="settings-checkbox">'+CSV+'</div><span class="settings-checkbox-label">'+label+'</span></div>'; }
    function irow(label,id,val,mn,mx,step){ return '<div class="settings-input-row"><span class="settings-input-label">'+label+'</span><input type="number" id="nr_'+id+'" class="settings-input" value="'+val+'" min="'+mn+'" max="'+mx+'" step="'+(step||1)+'"></div>'; }
    function sel(label,id,opts,cur){ var o=opts.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===String(cur)?' selected':'')+'>'+x[1]+'</option>';}).join(''); return '<div class="settings-input-row"><span class="settings-input-label">'+label+'</span><select id="sl_'+id+'" class="settings-select" style="margin-left:auto;max-width:168px;">'+o+'</select></div>'; }
    function clr(label,id,val){ var h=toHex(val); return '<div class="settings-input-row"><span class="settings-input-label">'+label+'</span><label style="cursor:pointer;display:flex;align-items:center;"><div id="sw_'+id+'" style="width:28px;height:28px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);background:'+val+';transition:transform .12s,box-shadow .12s;" onmouseover="this.style.transform=\'scale(1.1)\';this.style.boxShadow=\'0 0 0 2px rgba(41,98,255,0.45)\'" onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'"></div><input type="color" id="cp_'+id+'" value="'+h+'" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;"></label></div>'; }
    function rng(label,id,val,mn,mx){ return '<div class="settings-slider-group"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><div class="settings-slider-label" style="margin:0;">'+label+'</div><span id="rv_'+id+'" style="color:#2962ff;font-size:12px;font-weight:600;">'+val+'</span></div><input type="range" class="settings-slider" id="rng_'+id+'" min="'+mn+'" max="'+mx+'" value="'+val+'"><div style="display:flex;justify-content:space-between;font-size:11px;color:#787b86;margin-top:5px;"><span>'+mn+'</span><span>'+mx+'</span></div></div>'; }
    function savebtn(id,label){ return '<button id="'+id+'" style="width:100%;padding:10px;background:#2962ff;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;margin-top:12px;">'+label+'</button>'; }
    function cancelbtn(id,label){ return '<button id="'+id+'" style="width:100%;padding:10px;background:transparent;color:#787b86;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;margin-top:6px;">'+label+'</button>'; }

    function toHex(c){
        if(!c) return '#000000';
        if(/^#[0-9a-f]{6}$/i.test(c)) return c;
        var m=String(c).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
        if(m) return '#'+[m[1],m[2],m[3]].map(function(n){return('0'+parseInt(n).toString(16)).slice(-2);}).join('');
        return '#000000';
    }

    window._spB = { hdr:hdr, sec:sec, st:st, chk:chk, irow:irow, sel:sel, clr:clr, rng:rng, savebtn:savebtn, cancelbtn:cancelbtn };

    /* ── wire helpers (exposed for Part 2) ── */
    function wChk(id,fn){ var el=document.getElementById('ck_'+id); if(el) el.addEventListener('click',function(){this.classList.toggle('checked'); fn(this.classList.contains('checked'));}); }
    function wSel(id,fn){ var el=document.getElementById('sl_'+id); if(el) el.addEventListener('change',function(){fn(this.value);}); }
    function wNum(id,fn){ var el=document.getElementById('nr_'+id); if(el) el.addEventListener('change',function(){fn(parseFloat(this.value)||0);}); }
    function wRng(id,fn){ var el=document.getElementById('rng_'+id),rv=document.getElementById('rv_'+id); if(el) el.addEventListener('input',function(){if(rv)rv.textContent=this.value; fn(parseFloat(this.value));}); }
    function wClr(id,fn){
        var sw=document.getElementById('sw_'+id), cp=document.getElementById('cp_'+id);
        if(!sw||!cp) return;
        sw.addEventListener('click',function(){cp.style.pointerEvents='auto'; cp.click(); setTimeout(function(){cp.style.pointerEvents='none';},100);});
        cp.addEventListener('input', function(){sw.style.background=this.value;});
        cp.addEventListener('change',function(){sw.style.background=this.value; fn(this.value);});
    }

    window._spW = { wChk:wChk, wSel:wSel, wNum:wNum, wRng:wRng, wClr:wClr };

    /* ── panel router ── */
    function buildSub(type){ var p=window._spPanels[type]; return p?(hdr(p.title||type)+p.build()):(hdr(type)+'<p style="color:#787b86;padding:20px 0;">Coming soon.</p>'); }
    function wireSub(type) { var p=window._spPanels[type]; if(p&&p.wire) p.wire(); }

    /* ════════════════════════════════════════════
       GENERAL SETTINGS
    ════════════════════════════════════════════ */
    window._spPanels['general'] = {
        title: 'General Settings',
        build: function(){
            var g=gLoad(), mode=g.orderPlacementMode||'instant';
            return sec(st('Order Placement')+
                '<div class="settings-radio-group">'+
                '<div class="settings-radio-item'+(mode==='instant'?' selected':'')+'" id="rad_instant" style="cursor:pointer;"><div class="settings-radio-circle"></div><div class="settings-radio-content"><h4>Instant</h4><p>Orders placed immediately at market price</p></div></div>'+
                '<div class="settings-radio-item'+(mode==='confirmation'?' selected':'')+'" id="rad_confirm" style="cursor:pointer;"><div class="settings-radio-circle"></div><div class="settings-radio-content"><h4>Confirmation</h4><p>Show a modal before each order is placed</p></div></div>'+
                '</div>')+
            sec(st('Chart Overlays')+
                chk('Show order history on chart','orderHist',g.showOrderHistory!==false)+
                chk('Show open orders on chart','openOrders',g.showOpenOrders!==false))+
            sec(st('Sound')+
                chk('Play sound on order execution','playSound',g.playSound!==false)+
                rng('Volume','vol',g.volume!==undefined?g.volume:100,0,100))+
            sec(st('Navigation')+
                rng('Scroll speed','scroll',g.scrollSpeed||5,1,10))+
            sec(st('Drawing & Interaction')+
                irow('Mouse line sensitivity','mouseSens',g.mouseSensitivity||10,1,50)+
                irow('Magnet bar sensitivity','magSens',g.magnetSensitivity||5,1,20)+
                chk('Magnet crosshair to OHLC','magnet',g.magnetCrosshair!==false))+
            sec(st('Scale')+
                sel('Font size','scaleFont',[['10','10px'],['11','11px'],['12','12px'],['14','14px'],['16','16px']],String(g.scaleFontSize||'12')));
        },
        wire: function(){
            ['instant','confirm'].forEach(function(v){
                var el=document.getElementById('rad_'+v); if(!el) return;
                el.addEventListener('click',function(){
                    ['instant','confirm'].forEach(function(x){var r=document.getElementById('rad_'+x);if(r)r.classList.remove('selected');});
                    this.classList.add('selected');
                    var mode=v==='instant'?'instant':'confirmation';
                    gSave({orderPlacementMode:mode}); window.orderPlacementMode=mode;
                    var c=ch(); if(c&&c.orderManager) c.orderManager.placementMode=mode;
                });
            });
            wChk('orderHist', function(v){ gSave({showOrderHistory:v}); set('showOrderHistory',v); });
            wChk('openOrders', function(v){ gSave({showOpenOrders:v}); set('showOpenOrders',v); });
            wChk('playSound',  function(v){ gSave({playSound:v}); window.playSoundEnabled=v; });
            wRng('vol',    function(v){ gSave({volume:v}); window.soundVolume=v/100; });
            wRng('scroll', function(v){ gSave({scrollSpeed:v}); var c=ch(); if(!c)return; c.chartSettings=c.chartSettings||{}; c.chartSettings.scrollSpeed=v; if(c.movement)c.movement.sensitivity=v/5; if(c.inertia)c.inertia.friction=0.85+v*0.007; });
            wNum('mouseSens',function(v){ gSave({mouseSensitivity:v}); var c=ch(); if(!c)return; c.chartSettings=c.chartSettings||{}; c.chartSettings.mouseSensitivity=v; if(c.drawingManager)c.drawingManager.hitDistance=v; });
            wNum('magSens',  function(v){ gSave({magnetSensitivity:v}); var c=ch(); if(!c)return; c.chartSettings=c.chartSettings||{}; c.chartSettings.magnetSensitivity=v; if(c.drawingManager)c.drawingManager.magnetDistance=v; });
            wChk('magnet',   function(v){ gSave({magnetCrosshair:v}); var c=ch(); if(!c)return; c.magnetMode=v?'on':'off'; c.chartSettings=c.chartSettings||{}; c.chartSettings.magnetToOHLC=v; });
            wSel('scaleFont',function(v){ var n=parseInt(v); gSave({scaleFontSize:n}); set('scaleFontSize',n); set('scaleAxisFontSize',n); });
        }
    };

    /* ════════════════════════════════════════════
       CHART SETTINGS
    ════════════════════════════════════════════ */
    window._spPanels['chart'] = {
        title: 'Chart Settings',
        build: function(){
            var c=ch(), cs=(c&&c.chartSettings)||{};
            var ro=(c&&c.timeScale)?(c.timeScale.rightOffset||50):50;
            var pm=(c&&c.priceScale)?(c.priceScale.mode||'linear'):'linear';
            return sec(st('Style')+
                sel('Chart type','chartType',[['candles','Candlestick'],['hollow','Hollow Candles'],['heikinashi','Heikin Ashi'],['bars','Bar'],['line','Line'],['area','Area'],['baseline','Baseline']],cs.chartType||'candles')+
                sel('Price scale','priceMode',[['linear','Normal (linear)'],['log','Logarithmic'],['percent','Percentage']],pm))+
            sec(st('Canvas')+
                clr('Background','bg',cs.backgroundColor||'#050028'))+
            sec(st('Grid')+
                chk('Show grid lines','showGrid',cs.showGrid!==false)+
                clr('Grid color','gridClr',cs.gridColor||'rgba(42,46,57,0.6)'))+
            sec(st('Crosshair')+
                chk('Show crosshair','showCross',cs.showCrosshair!==false)+
                clr('Crosshair color','crossClr',cs.crosshairColor||'rgba(120,123,134,0.4)'))+
            sec(st('Candle Colors')+
                clr('Body – up',   'bodyUp',  cs.bodyUpColor  ||'#089981')+
                clr('Body – down', 'bodyDown',cs.bodyDownColor||'#f23645')+
                clr('Border – up', 'bdrUp',   cs.borderUpColor  ||'#089981')+
                clr('Border – down','bdrDown', cs.borderDownColor||'#f23645')+
                clr('Wick – up',   'wickUp',  cs.wickUpColor  ||'#089981')+
                clr('Wick – down', 'wickDown',cs.wickDownColor||'#f23645'))+
            sec(st('Candle Visibility')+
                chk('Show body',   'showBody',cs.showCandleBody    !==false)+
                chk('Show borders','showBdr', cs.showCandleBorders !==false)+
                chk('Show wicks',  'showWick',cs.showCandleWick    !==false))+
            sec(st('Volume')+
                clr('Volume up',  'volUp',  cs.volumeUpColor  ||'rgba(8,153,129,0.5)')+
                clr('Volume down','volDown',cs.volumeDownColor||'rgba(242,54,69,0.5)'))+
            sec(st('Scale & Layout')+
                clr('Scale text color','scaleText',cs.scaleTextColor||'#ffffff')+
                irow('Right offset (px)','rightOff',ro,0,500));
        },
        wire: function(){
            wSel('chartType', function(v){ set('chartType',v); });
            wSel('priceMode', function(v){ var c=ch(); if(!c)return; c.priceScale=c.priceScale||{}; c.priceScale.mode=v; set('priceScaleMode',v); });
            wClr('bg', function(v){ var c=ch(); if(!c)return; c.chartSettings.backgroundColor=v; if(c.canvas)c.canvas.style.backgroundColor=v; var el=document.querySelector('.chart-container'); if(el)el.style.backgroundColor=v; apply(); });
            wChk('showGrid',  function(v){ set('showGrid',v); });
            wClr('gridClr',   function(v){ set('gridColor',v); });
            wChk('showCross', function(v){ set('showCrosshair',v); });
            wClr('crossClr',  function(v){ set('crosshairColor',v); });
            wClr('bodyUp',    function(v){ set('bodyUpColor',v);   set('candleUpColor',v); });
            wClr('bodyDown',  function(v){ set('bodyDownColor',v); set('candleDownColor',v); });
            wClr('bdrUp',     function(v){ set('borderUpColor',v); });
            wClr('bdrDown',   function(v){ set('borderDownColor',v); });
            wClr('wickUp',    function(v){ set('wickUpColor',v); });
            wClr('wickDown',  function(v){ set('wickDownColor',v); });
            wChk('showBody',  function(v){ set('showCandleBody',v); });
            wChk('showBdr',   function(v){ set('showCandleBorders',v); });
            wChk('showWick',  function(v){ set('showCandleWick',v); });
            wClr('volUp',     function(v){ set('volumeUpColor',v); });
            wClr('volDown',   function(v){ set('volumeDownColor',v); });
            wClr('scaleText', function(v){ set('scaleTextColor',v); set('symbolTextColor',v); });
            wNum('rightOff',  function(v){ var c=ch(); if(!c)return; c.timeScale=c.timeScale||{}; c.timeScale.rightOffset=v; apply(); });
        }
    };

    /* ── Apply persisted General Settings on startup ── */
    function applyStartup(){
        var c=ch(); if(!c) return;
        var g=gLoad(); if(!Object.keys(g).length) return;
        c.chartSettings=c.chartSettings||{};
        if(g.showOrderHistory!==undefined) c.chartSettings.showOrderHistory=g.showOrderHistory;
        if(g.showOpenOrders!==undefined)   c.chartSettings.showOpenOrders=g.showOpenOrders;
        if(g.scaleFontSize){ c.chartSettings.scaleFontSize=g.scaleFontSize; c.chartSettings.scaleAxisFontSize=g.scaleFontSize; }
        if(g.mouseSensitivity&&c.drawingManager) c.drawingManager.hitDistance=g.mouseSensitivity;
        if(g.magnetSensitivity&&c.drawingManager) c.drawingManager.magnetDistance=g.magnetSensitivity;
        if(g.magnetCrosshair!==undefined){ c.magnetMode=g.magnetCrosshair?'on':'off'; c.chartSettings.magnetToOHLC=g.magnetCrosshair; }
        if(g.scrollSpeed&&c.movement) c.movement.sensitivity=g.scrollSpeed/5;
        if(g.orderPlacementMode) window.orderPlacementMode=g.orderPlacementMode;
        if(g.playSound!==undefined) window.playSoundEnabled=g.playSound;
        if(g.volume!==undefined) window.soundVolume=g.volume/100;
        if(c.applyChartSettings) c.applyChartSettings();
        if(c.scheduleRender) c.scheduleRender();
    }

    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(applyStartup,800);});
    else setTimeout(applyStartup,800);
    setTimeout(applyStartup,2500);

    console.log('[SP] Settings panel initialized. settingsBtn found:', !!document.getElementById('settingsBtn'));
    } // end init

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){ try{ init(); }catch(e){ console.error('[SP] init error:', e); } });
    } else {
        try{ init(); }catch(e){ console.error('[SP] init error:', e); }
    }

})();
