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

    var currentType = 'appearance';

    function openPanel() {
        panel.classList.add('open');
        loadTab(currentType);
        var c = ch();
        if (c) { c.priceAxisLeft = true; c.margin.l = 60; c.margin.r = 0; if (c.scheduleRender) c.scheduleRender(); }
    }
    function closePanel() {
        panel.classList.remove('open');
        var c = ch();
        if (c) { c.priceAxisLeft = false; c.margin.l = 0; c.margin.r = 60; if (c.scheduleRender) c.scheduleRender(); }
    }

    window._spLoadTab = function(tab, el) {
        panel.querySelectorAll('.sp-tab-btn').forEach(function(n){ n.classList.remove('active'); });
        if (el) el.classList.add('active');
        loadTab(tab);
    };

    window._spLoad = function(type, el) {
        var tabMap = {
            'general': 'appearance',
            'chart': 'chart',
            'symbol': 'chart',
            'statusline': 'chart',
            'canvas': 'appearance',
            'template': 'templates',
            'trading': 'trading'
        };
        var tab = tabMap[type] || 'appearance';
        loadTab(tab);
    };

    if (closeB) closeB.addEventListener('click', function(e){ e.stopPropagation(); if(window.closePanel)window.closePanel(); else panel.classList.remove('open'); });

    function loadTab(tab) {
        console.log('[SP] loadTab:', tab);
        currentType = tab;
        panel.querySelectorAll('.sp-tab-btn').forEach(function(n){
            n.classList.toggle('active', n.dataset.tab === tab);
        });
        var el = document.getElementById('settingsPanelContent');
        if (!el) { console.warn('[SP] settingsPanelContent not found'); return; }
        try {
            var p = window._spPanels[tab];
            el.innerHTML = p ? p.build() : '<p style="color:#787b86;padding:20px 0;">Coming soon — <b>'+tab+'</b></p>';
        } catch(e) {
            el.innerHTML = '<p style="color:#f23645;padding:20px;">Build error: '+e.message+'</p>';
            console.error('[SP] build error:', e);
        }
        try {
            var p2 = window._spPanels[tab];
            if (p2 && p2.wire) p2.wire();
        } catch(e) { console.error('[SP] wire error:', e); }
    }

    function loadSection(type) {
        var tabMap = {
            'general': 'appearance',
            'chart': 'chart',
            'symbol': 'chart',
            'statusline': 'chart',
            'canvas': 'appearance',
            'template': 'templates',
            'trading': 'trading'
        };
        var tab = tabMap[type] || 'appearance';
        loadTab(tab);
    }

    function openSub(type){ loadSection(type); }

    /* ── HTML builders (exposed for Part 2) ── */
    var CSV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';

    function hdr(t){ return ''; /* title now lives in sp-content-header */ }
    function sec(c){ return '<div class="settings-section">'+c+'</div>'; }
    function st(t) { return '<div class="settings-section-title" style="margin-top:4px;">'+t+'</div>'; }
    function chk(label,id,on){ return '<div class="settings-checkbox-item'+(on?' checked':'')+'" id="ck_'+id+'" style="cursor:pointer;"><div class="settings-checkbox">'+CSV+'</div><span class="settings-checkbox-label">'+label+'</span></div>'; }
    function irow(label,id,val,mn,mx,step){ return '<div class="settings-input-row"><span class="settings-input-label">'+label+'</span><input type="number" id="nr_'+id+'" class="settings-input" value="'+val+'" min="'+mn+'" max="'+mx+'" step="'+(step||1)+'"></div>'; }
    function sel(label,id,opts,cur){ var o=opts.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===String(cur)?' selected':'')+'>'+x[1]+'</option>';}).join(''); return '<div class="settings-input-row"><span class="settings-input-label">'+label+'</span><select id="sl_'+id+'" class="settings-select" style="margin-left:auto;max-width:168px;">'+o+'</select></div>'; }
    function clr(label,id,val){ var h=toHex(val); return '<div class="settings-input-row"><span class="settings-input-label">'+label+'</span><label style="cursor:pointer;display:flex;align-items:center;"><div id="sw_'+id+'" style="width:28px;height:28px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);background:'+val+';transition:transform .12s,box-shadow .12s;" onmouseover="this.style.transform=\'scale(1.1)\';this.style.boxShadow=\'0 0 0 2px rgba(var(--sp-accent-rgb),0.45)\'" onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'"></div><input type="color" id="cp_'+id+'" value="'+h+'" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;"></label></div>'; }
    function rng(label,id,val,mn,mx){ return '<div class="settings-slider-group"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><div class="settings-slider-label" style="margin:0;">'+label+'</div><span id="rv_'+id+'" style="color:var(--sp-accent);font-size:12px;font-weight:600;">'+val+'</span></div><input type="range" class="settings-slider" id="rng_'+id+'" min="'+mn+'" max="'+mx+'" value="'+val+'"><div style="display:flex;justify-content:space-between;font-size:11px;color:#787b86;margin-top:5px;"><span>'+mn+'</span><span>'+mx+'</span></div></div>'; }
    function savebtn(id,label){ return '<button id="'+id+'" style="width:100%;padding:10px;background:var(--sp-accent);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;margin-top:12px;">'+label+'</button>'; }
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
       APPEARANCE TAB
    ════════════════════════════════════════════ */
    window._spPanels['appearance'] = {
        title: 'Appearance',
        build: function(){
            var c=ch(), cs=(c&&c.chartSettings)||{};
            var g=gLoad();
            return sec(st('THEME')+
                '<div style="margin-bottom:16px;">' +
                '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
                '<button style="flex:1;padding:12px;background:rgba(var(--sp-accent-rgb),0.15);border:2px solid var(--sp-accent);border-radius:8px;color:#fff;font-weight:600;cursor:pointer;">Custom</button>' +
                '</div>' +
                '<div style="font-size:12px;color:#787b86;margin-bottom:8px;">Full theme preset</div>' +
                '</div>')+
            sec(st('CANVAS')+
                clr('Background','bg',cs.backgroundColor||'#050028')+
                clr('Grid lines','gridClr',cs.gridColor||'rgba(42,46,57,0.6)')+
                clr('Crosshair','crossClr',cs.crosshairColor||'rgba(120,123,134,0.4)'))+
            sec(st('SCALES')+
                clr('Scale text','scaleText',cs.scaleTextColor||'#ffffff')+
                irow('Scale text','scaleFont',g.scaleFontSize||12,10,20,1)+
                clr('Scale lines','scaleLines',cs.gridColor||'rgba(42,46,57,0.6)')+
                irow('Right margin (bars)','rightOff',(c&&c.timeScale)?(c.timeScale.rightOffset||50):50,0,500));
        },
        wire: function(){
            wClr('bg', function(v){ var c=ch(); if(!c)return; c.chartSettings.backgroundColor=v; if(c.canvas)c.canvas.style.backgroundColor=v; var el=document.querySelector('.chart-container'); if(el)el.style.backgroundColor=v; apply(); });
            wClr('gridClr', function(v){ set('gridColor',v); });
            wClr('crossClr', function(v){ set('crosshairColor',v); });
            wClr('scaleText', function(v){ set('scaleTextColor',v); set('symbolTextColor',v); });
            wNum('scaleFont',function(v){ gSave({scaleFontSize:v}); set('scaleFontSize',v); set('scaleAxisFontSize',v); });
            wClr('scaleLines', function(v){ set('gridColor',v); });
            wNum('rightOff', function(v){ var c=ch(); if(!c)return; c.timeScale=c.timeScale||{}; c.timeScale.rightOffset=v; apply(); });
        }
    };

    /* ════════════════════════════════════════════
       GENERAL SETTINGS (Legacy support)
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
       CHART TAB
    ════════════════════════════════════════════ */
    window._spPanels['chart'] = {
        title: 'Chart',
        build: function(){
            var c=ch(), cs=(c&&c.chartSettings)||{};
            var pm=(c&&c.priceScale)?(c.priceScale.mode||'linear'):'linear';
            return sec(st('CHART TYPE')+
                '<div style="margin-bottom:12px;">' +
                '<select id="sl_chartType" class="settings-select" style="width:100%;padding:10px;background:#1e222d;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e0e3ea;font-size:13px;">' +
                '<option value="candles"'+(cs.chartType==='candles'?' selected':'')+'>Candlestick</option>' +
                '<option value="hollow"'+(cs.chartType==='hollow'?' selected':'')+'>Hollow Candles</option>' +
                '<option value="heikinashi"'+(cs.chartType==='heikinashi'?' selected':'')+'>Heikin Ashi</option>' +
                '<option value="bars"'+(cs.chartType==='bars'?' selected':'')+'>Bar</option>' +
                '<option value="line"'+(cs.chartType==='line'?' selected':'')+'>Line</option>' +
                '<option value="area"'+(cs.chartType==='area'?' selected':'')+'>Area</option>' +
                '<option value="baseline"'+(cs.chartType==='baseline'?' selected':'')+'>Baseline</option>' +
                '</select>' +
                '</div>'+
                irow('Precision','precision',cs.precision||0.00,0,8,0.01)+
                '<div style="margin-bottom:12px;">' +
                '<div style="font-size:12px;color:#787b86;margin-bottom:8px;">Timezone</div>' +
                '<select id="sl_timezone" class="settings-select" style="width:100%;padding:10px;background:#1e222d;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e0e3ea;font-size:13px;">' +
                '<option value="UTC" selected>UTC</option>' +
                '</select>' +
                '</div>')+
            sec(st('CANDLE COLORS')+
                '<div style="background:#1e222d;border-radius:8px;padding:16px;margin-bottom:12px;">' +
                '<div style="color:#26a69a;font-size:11px;font-weight:700;margin-bottom:12px;letter-spacing:0.5px;">BULLISH</div>' +
                clr('Body','bodyUp',cs.bodyUpColor||'#089981')+
                clr('Border','bdrUp',cs.borderUpColor||'#089981')+
                clr('Wick','wickUp',cs.wickUpColor||'#089981')+
                '</div>'+
                '<div style="background:#1e222d;border-radius:8px;padding:16px;margin-bottom:12px;">' +
                '<div style="color:#ef5350;font-size:11px;font-weight:700;margin-bottom:12px;letter-spacing:0.5px;">BEARISH</div>' +
                clr('Body','bodyDown',cs.bodyDownColor||'#f23645')+
                clr('Border','bdrDown',cs.borderDownColor||'#f23645')+
                clr('Wick','wickDown',cs.wickDownColor||'#f23645')+
                '</div>'+
                '<div style="display:flex;align-items:center;gap:12px;">' +
                '<span style="flex:1;font-size:13px;color:#e0e3ea;">Unified bar color</span>' +
                clr('','unifiedBar',cs.unifiedBarColor||'#2962ff')+
                '</div>')+
            sec(st('STATUS LINE')+
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">' +
                '<span style="font-size:13px;color:#e0e3ea;">Show OHLC values</span>' +
                '<label style="position:relative;display:inline-block;width:44px;height:24px;">' +
                '<input type="checkbox" id="ck_showOHLC" checked style="opacity:0;width:0;height:0;">' +
                '<span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#2962ff;border-radius:24px;transition:0.2s;"></span>' +
                '</label>' +
                '</div>'+
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">' +
                '<span style="font-size:13px;color:#e0e3ea;">Show bar change %</span>' +
                '<label style="position:relative;display:inline-block;width:44px;height:24px;">' +
                '<input type="checkbox" id="ck_showBarChange" checked style="opacity:0;width:0;height:0;">' +
                '<span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#2962ff;border-radius:24px;transition:0.2s;"></span>' +
                '</label>' +
                '</div>'+
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">' +
                '<span style="font-size:13px;color:#e0e3ea;">Show symbol name</span>' +
                '<label style="position:relative;display:inline-block;width:44px;height:24px;">' +
                '<input type="checkbox" id="ck_showSymbol" checked style="opacity:0;width:0;height:0;">' +
                '<span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#2962ff;border-radius:24px;transition:0.2s;"></span>' +
                '</label>' +
                '</div>'+
                '<div style="margin-top:12px;">' +
                '<div style="font-size:12px;color:#787b86;margin-bottom:8px;">Label format</div>' +
                '<select id="sl_labelFormat" class="settings-select" style="width:100%;padding:10px;background:#1e222d;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e0e3ea;font-size:13px;">' +
                '<option value="description" selected>Description</option>' +
                '</select>' +
                '</div>'+
                clr('Label color','labelColor',cs.labelColor||'#f0b90b')+
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">' +
                '<span style="font-size:13px;color:#e0e3ea;">Show price line</span>' +
                '<label style="position:relative;display:inline-block;width:44px;height:24px;">' +
                '<input type="checkbox" id="ck_showPriceLine" checked style="opacity:0;width:0;height:0;">' +
                '<span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#2962ff;border-radius:24px;transition:0.2s;"></span>' +
                '</label>' +
                '</div>');
        },
        wire: function(){
            wSel('chartType', function(v){ set('chartType',v); if(window._syncChartTypeUI) window._syncChartTypeUI(v); });
            wClr('bodyUp', function(v){ set('bodyUpColor',v); set('candleUpColor',v); });
            wClr('bodyDown', function(v){ set('bodyDownColor',v); set('candleDownColor',v); });
            wClr('bdrUp', function(v){ set('borderUpColor',v); });
            wClr('bdrDown', function(v){ set('borderDownColor',v); });
            wClr('wickUp', function(v){ set('wickUpColor',v); });
            wClr('wickDown', function(v){ set('wickDownColor',v); });
            wClr('unifiedBar', function(v){ set('unifiedBarColor',v); });
            wClr('labelColor', function(v){ set('labelColor',v); });
        }
    };

    /* ════════════════════════════════════════════
       TRADING TAB
    ════════════════════════════════════════════ */
    window._spPanels['trading'] = {
        title: 'Trading',
        build: function(){
            var g=gLoad(), mode=g.orderPlacementMode||'instant';
            return sec(st('ORDER PLACEMENT')+
                '<div style="display:flex;gap:12px;margin-bottom:16px;">' +
                '<div id="rad_instant" style="flex:1;padding:16px;background:'+(mode==='instant'?'rgba(var(--sp-accent-rgb),0.15)':'#1e222d')+';border:2px solid '+(mode==='instant'?'var(--sp-accent)':'rgba(255,255,255,0.1)')+';border-radius:8px;cursor:pointer;">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
                '<div style="width:16px;height:16px;border-radius:50%;border:2px solid '+(mode==='instant'?'var(--sp-accent)':'#787b86')+';display:flex;align-items:center;justify-content:center;">' +
                (mode==='instant'?'<div style="width:8px;height:8px;border-radius:50%;background:var(--sp-accent);"></div>':'')+
                '</div>' +
                '<span style="font-weight:600;color:#e0e3ea;font-size:14px;">Instant</span>' +
                '</div>' +
                '<p style="margin:0;font-size:12px;color:#787b86;">Execute at market</p>' +
                '</div>' +
                '<div id="rad_confirm" style="flex:1;padding:16px;background:'+(mode==='confirmation'?'rgba(var(--sp-accent-rgb),0.15)':'#1e222d')+';border:2px solid '+(mode==='confirmation'?'var(--sp-accent)':'rgba(255,255,255,0.1)')+';border-radius:8px;cursor:pointer;">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
                '<div style="width:16px;height:16px;border-radius:50%;border:2px solid '+(mode==='confirmation'?'var(--sp-accent)':'#787b86')+';display:flex;align-items:center;justify-content:center;">' +
                (mode==='confirmation'?'<div style="width:8px;height:8px;border-radius:50%;background:var(--sp-accent);"></div>':'')+
                '</div>' +
                '<span style="font-weight:600;color:#e0e3ea;font-size:14px;">Confirm</span>' +
                '</div>' +
                '<p style="margin:0;font-size:12px;color:#787b86;">Show modal first</p>' +
                '</div>' +
                '</div>')+
            sec(st('CHART OVERLAYS')+
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">' +
                '<span style="font-size:13px;color:#e0e3ea;">Show order history</span>' +
                '<label style="position:relative;display:inline-block;width:44px;height:24px;">' +
                '<input type="checkbox" id="ck_orderHist" '+(g.showOrderHistory!==false?'checked':'')+' style="opacity:0;width:0;height:0;">' +
                '<span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:'+(g.showOrderHistory!==false?'var(--sp-accent)':'#787b86')+';border-radius:24px;transition:0.2s;"></span>' +
                '</label>' +
                '</div>'+
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">' +
                '<span style="font-size:13px;color:#e0e3ea;">Show open orders</span>' +
                '<label style="position:relative;display:inline-block;width:44px;height:24px;">' +
                '<input type="checkbox" id="ck_openOrders" '+(g.showOpenOrders!==false?'checked':'')+' style="opacity:0;width:0;height:0;">' +
                '<span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:'+(g.showOpenOrders!==false?'var(--sp-accent)':'#787b86')+';border-radius:24px;transition:0.2s;"></span>' +
                '</label>' +
                '</div>')+
            sec(st('LEVERAGE')+
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
                '<span style="font-size:13px;color:#e0e3ea;">Leverage (1:X)</span>' +
                '<span style="color:var(--sp-accent);font-size:14px;font-weight:600;" id="rv_leverage">100</span>' +
                '</div>'+
                '<input type="range" class="settings-slider" id="rng_leverage" min="1" max="500" value="100" style="width:100%;">' +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:#787b86;margin-top:5px;">' +
                '<span>1</span><span>500</span>' +
                '</div>')+
            sec(st('COMMISSIONS')+
                irow('Avg spread (pips)','avgSpread',0,0,100,0.1)+
                irow('Slippage (pips)','slippage',0,0,100,0.1)+
                '<div style="margin-top:12px;">' +
                '<div style="font-size:12px;color:#787b86;margin-bottom:8px;">Commission type</div>' +
                '<select id="sl_commType" class="settings-select" style="width:100%;padding:10px;background:#1e222d;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e0e3ea;font-size:13px;">' +
                '<option value="none" selected>None</option>' +
                '</select>' +
                '</div>'+
                irow('Commission value','commValue',0,0,1000,0.01))+
            '<button id="btn_saveTradingSettings" style="width:100%;padding:12px;background:var(--sp-accent);color:#131722;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;margin-top:12px;">Save Trading Settings</button>';
        },
        wire: function(){
            ['instant','confirm'].forEach(function(v){
                var el=document.getElementById('rad_'+v); if(!el) return;
                el.addEventListener('click',function(){
                    var mode=v==='instant'?'instant':'confirmation';
                    gSave({orderPlacementMode:mode}); window.orderPlacementMode=mode;
                    var c=ch(); if(c&&c.orderManager) c.orderManager.placementMode=mode;
                    loadTab('trading');
                });
            });
            var orderHistCk = document.getElementById('ck_orderHist');
            if(orderHistCk) {
                orderHistCk.addEventListener('change', function(){
                    var v = this.checked;
                    gSave({showOrderHistory:v}); set('showOrderHistory',v);
                    var slider = this.nextElementSibling;
                    if(slider) slider.style.background = v ? 'var(--sp-accent)' : '#787b86';
                });
            }
            var openOrdersCk = document.getElementById('ck_openOrders');
            if(openOrdersCk) {
                openOrdersCk.addEventListener('change', function(){
                    var v = this.checked;
                    gSave({showOpenOrders:v}); set('showOpenOrders',v);
                    var slider = this.nextElementSibling;
                    if(slider) slider.style.background = v ? 'var(--sp-accent)' : '#787b86';
                });
            }
            wRng('leverage', function(v){ var s=sess(); s.leverage=v; saveSess(s); });
            wNum('avgSpread', function(v){ var s=sess(); s.avgSpread=v; saveSess(s); });
            wNum('slippage', function(v){ var s=sess(); s.slippage=v; saveSess(s); });
            wNum('commValue', function(v){ var s=sess(); s.commissionValue=v; saveSess(s); });
            var saveBtn = document.getElementById('btn_saveTradingSettings');
            if(saveBtn) saveBtn.addEventListener('click', function(){ alert('Trading settings saved!'); });
        }
    };

    /* ════════════════════════════════════════════
       TEMPLATES TAB
    ════════════════════════════════════════════ */
    window._spPanels['templates'] = {
        title: 'Templates',
        build: function(){
            return sec(st('APPLY A TEMPLATE')+
                '<p style="font-size:12px;color:#787b86;margin-bottom:16px;">Choose a preset to quickly update colors.</p>'+
                '<div style="display:flex;flex-direction:column;gap:12px;">' +
                '<div style="display:flex;align-items:center;gap:12px;padding:16px;background:#1e222d;border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;" id="tpl_chartColors">' +
                '<div style="width:40px;height:40px;background:#2962ff;border-radius:8px;display:flex;align-items:center;justify-content:center;">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' +
                '</div>' +
                '<div style="flex:1;">' +
                '<div style="font-weight:600;color:#e0e3ea;margin-bottom:4px;">Chart Colors</div>' +
                '<div style="font-size:12px;color:#787b86;">Candles, grid, crosshair only</div>' +
                '</div>' +
                '<button style="padding:6px 16px;background:transparent;border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#787b86;font-size:12px;cursor:pointer;">— Select —</button>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:12px;padding:16px;background:#1e222d;border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;" id="tpl_fullTheme">' +
                '<div style="width:40px;height:40px;background:var(--sp-accent);border-radius:8px;display:flex;align-items:center;justify-content:center;">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="#131722" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24"/></svg>' +
                '</div>' +
                '<div style="flex:1;">' +
                '<div style="font-weight:600;color:#e0e3ea;margin-bottom:4px;">Talaria Full Theme</div>' +
                '<div style="font-size:12px;color:#787b86;">Chart + panel + sidebar</div>' +
                '</div>' +
                '<button style="padding:6px 16px;background:transparent;border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#787b86;font-size:12px;cursor:pointer;">— Select —</button>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:12px;padding:16px;background:#1e222d;border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;" id="tpl_panelSidebar">' +
                '<div style="width:40px;height:40px;background:#9c27b0;border-radius:8px;display:flex;align-items:center;justify-content:center;">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>' +
                '</div>' +
                '<div style="flex:1;">' +
                '<div style="font-weight:600;color:#e0e3ea;margin-bottom:4px;">Panel & Sidebar</div>' +
                '<div style="font-size:12px;color:#787b86;">UI chrome only, chart untouched</div>' +
                '</div>' +
                '<button style="padding:6px 16px;background:transparent;border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#787b86;font-size:12px;cursor:pointer;">— Select —</button>' +
                '</div>' +
                '</div>')+
            '<div style="text-align:center;margin-top:24px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);">' +
            '<div style="font-size:12px;color:#787b86;margin-bottom:8px;">OR</div>' +
            '</div>'+
            sec(st('RESET')+
                '<button id="btn_resetTheme" style="width:100%;padding:12px;background:#1e222d;color:#e0e3ea;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">Reset to Default Theme</button>');
        },
        wire: function(){
            var resetBtn = document.getElementById('btn_resetTheme');
            if(resetBtn) resetBtn.addEventListener('click', function(){ 
                if(confirm('Reset all theme settings to default?')) {
                    alert('Theme reset to defaults!');
                }
            });
        }
    };

    /* ════════════════════════════════════════════
       OLD CHART SETTINGS (Legacy support)
    ════════════════════════════════════════════ */
    window._spPanels['chartOld'] = {
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
            wSel('chartType', function(v){ set('chartType',v); if(window._syncChartTypeUI) window._syncChartTypeUI(v); });
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

    /* ════════════════════════════════════════════
       ALERTS
    ════════════════════════════════════════════ */
    window._spPanels['alerts'] = {
        title: 'Alerts',
        build: function(){
            var src = document.getElementById('alertsContent');
            return src ? src.innerHTML : '<p style="color:#787b86;padding:20px 0;">No alerts yet.</p>';
        },
        wire: function(){
            var ctx = document.getElementById('settingsPanelContent');
            if (!ctx) return;
            var newList = ctx.querySelector('#alertsList');
            var addBtn  = ctx.querySelector('#addAlertBtn');
            if (window.alertSystem) {
                if (newList) { window.alertSystem.alertsList = newList; window.alertSystem.refreshAlertsList(); }
                if (addBtn)  { addBtn.onclick = function(){ window.alertSystem.showCreateAlertModal(); }; }
            }
        }
    };

    /* ════════════════════════════════════════════
       HELP
    ════════════════════════════════════════════ */
    window._spPanels['help'] = {
        title: 'Help',
        build: function(){
            var src = document.querySelector('#helpPanel .side-panel-body');
            return src ? src.innerHTML : '';
        },
        wire: function(){
            var ctx = document.getElementById('settingsPanelContent');
            if (!ctx) return;
            var c = ctx.querySelector('#helpContactSupport');
            if (c) c.onclick = function(){ window.open('mailto:support@talaria.com','_blank'); };
            var k = ctx.querySelector('#helpKeyboardShortcuts');
            if (k) k.onclick = function(){ if (window.toggleKeyboardShortcuts) window.toggleKeyboardShortcuts(); };
            var f = ctx.querySelector('#helpFAQ');
            if (f) f.onclick = function(){};
            var e = ctx.querySelector('#helpEducation');
            if (e) e.onclick = function(){};
        }
    };

    /* ════════════════════════════════════════════
       PROFILE
    ════════════════════════════════════════════ */
    window._spPanels['profile'] = {
        title: 'Profile',
        build: function(){
            var src = document.querySelector('#profilePanel .side-panel-body');
            return src ? src.innerHTML : '';
        },
        wire: function(){
            var ctx = document.getElementById('settingsPanelContent');
            if (!ctx) return;
            var t = ctx.querySelector('#profileTheme2');
            if (t) t.onclick = function(){
                document.body.classList.toggle('light-mode');
                var isDark = !document.body.classList.contains('light-mode');
                var v = ctx.querySelector('#profileThemeValue2');
                if (v) v.textContent = isDark ? 'Dark' : 'Light';
            };
            var a = ctx.querySelector('#profileAccount2');
            if (a) a.onclick = function(){ window.location.href = '/profile'; };
            var l = ctx.querySelector('#profileLogout2');
            if (l) l.onclick = function(){ window.location.href = '/logout'; };
        }
    };

    /* ── _spOpen: open panel on a specific section ── */
    window._spOpen = function(section) {
        if (!panel) return;
        panel.querySelectorAll('.sp-nav-item').forEach(function(n){ n.classList.remove('active'); });
        var navItem = panel.querySelector('.sp-nav-item[data-settings="'+section+'"]');
        if (navItem) navItem.classList.add('active');
        if (panel.classList.contains('open')) {
            loadSection(section);
        } else {
            currentType = section;
            openPanel();
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
