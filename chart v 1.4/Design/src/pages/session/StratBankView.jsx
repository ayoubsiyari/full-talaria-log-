import React from 'react';
import SymBadge from '../../components/SymBadge';

export function renderStratBankView(ctx, shared) {
  const { loading, setLoading, loadFading, setLoadFading, loadPhase, setLoadPhase, loadDots, setLoadDots, loadQuote, setLoadQuote, typedQuote, setTypedQuote, sessionPage, setSessionPage, sessPageFading, setSessPageFading, sessions, setSessions, newSessName, setNewSessName, newSessSymbol, setNewSessSymbol, newSessTf, setNewSessTf, newSessStart, setNewSessStart, newSessEnd, setNewSessEnd, newSessCapital, setNewSessCapital, sessHov, setSessHov, stratPopup, setStratPopup, symPopup, setSymPopup, sessView, setSessView, dashSessId, setDashSessId, dashHov, setDashHov, sessSelected, setSessSelected, sessSearchQ, setSessSearchQ, sessFilter, setSessFilter, sessActMenu, setSessActMenu, sessSortBy, setSessSortBy, sessSortDir, setSessSortDir, sessSortOpen, setSessSortOpen, sessSearchOpen, setSessSearchOpen, sessLayoutMode, setSessLayoutMode, cardSortOpen, setCardSortOpen, newSessCurrency, setNewSessCurrency, sessDateMode, setSessDateMode, sessNBars, setSessNBars, sessQuickDate, setSessQuickDate, sessRiskMode, setSessRiskMode, sessRiskVal, setSessRiskVal, sessLeverage, setSessLeverage, sessCommission, setSessCommission, sessCommissionVal, setSessCommissionVal, sessSlippage, setSessSlippage, sessTradingMode, setSessTradingMode, sessPropCat, setSessPropCat, sessPropFirm, setSessPropFirm, sessNumPhases, setSessNumPhases, sessChallengeType, setSessChallengeType, sessP1DailyLossPct, setSessP1DailyLossPct, sessP1TotalDDPct, setSessP1TotalDDPct, sessP1ProfitTargetPct, setSessP1ProfitTargetPct, sessP1MinDays, setSessP1MinDays, sessP1MinDaysEnabled, setSessP1MinDaysEnabled, sessP2DailyLossPct, setSessP2DailyLossPct, sessP2TotalDDPct, setSessP2TotalDDPct, sessP2ProfitTargetPct, setSessP2ProfitTargetPct, sessP2MinDays, setSessP2MinDays, sessP2MinDaysEnabled, setSessP2MinDaysEnabled, sessMaxLotSize, setSessMaxLotSize, sessMaxPosUnit, setSessMaxPosUnit, sessMaxPosEnabled, setSessMaxPosEnabled, sessConsistencyRule, setSessConsistencyRule, sessConsistencyPct, setSessConsistencyPct, sessWeekendHold, setSessWeekendHold, sessTrailingDrawdown, setSessTrailingDrawdown, sessDailyLossEnabled, setSessDailyLossEnabled, sessFutMinDays, setSessFutMinDays, sessFutMinDaysEnabled, setSessFutMinDaysEnabled, sessP1DailyLossAmt, setSessP1DailyLossAmt, sessP1MaxDDAmt, setSessP1MaxDDAmt, sessP1ProfitTargetAmt, setSessP1ProfitTargetAmt, sessP2DailyLossAmt, setSessP2DailyLossAmt, sessP2MaxDDAmt, setSessP2MaxDDAmt, sessP2ProfitTargetAmt, setSessP2ProfitTargetAmt, sessMaxContracts, setSessMaxContracts, sessMaxContractsEnabled, setSessMaxContractsEnabled, sessReplaySpeed, setSessReplaySpeed, sessReplayMode, setSessReplayMode, newSessTimezone, setNewSessTimezone, newSessDST, setNewSessDST, newSessDescription, setNewSessDescription, newSessPlaybook, setNewSessPlaybook, newSessFiles, setNewSessFiles, newSessMarginCall, setNewSessMarginCall, newSessStopOut, setNewSessStopOut, newSessMaxRisk, setNewSessMaxRisk, newSessProtect, setNewSessProtect, newSessNavEnabled, setNewSessNavEnabled, newSessFilePickerOpen, setNewSessFilePickerOpen, newSessOpen, setNewSessOpen, editSessId, setEditSessId, newSessTickers, setNewSessTickers, newSessTickerInput, setNewSessTickerInput, newSessTickerFocus, setNewSessTickerFocus, newSessAssetClass, setNewSessAssetClass, newSessAdvancedOrder, setNewSessAdvancedOrder, newSessRollback, setNewSessRollback, newSessTradingStyle, setNewSessTradingStyle, newSessStratDropOpen, setNewSessStratDropOpen, newSessStratHov, setNewSessStratHov, newSessSymDropOpen, setNewSessSymDropOpen, newSessAssetDropOpen, setNewSessAssetDropOpen, newSessAssetHov, setNewSessAssetHov, newSessMarketOpen, setNewSessMarketOpen, newSessSupportTickers, setNewSessSupportTickers, newSessSupportAssetClass, setNewSessSupportAssetClass, newSessSupportInput, setNewSessSupportInput, newSessSupportFocus, setNewSessSupportFocus, newSessSupportDropOpen, setNewSessSupportDropOpen, newSessInfoHov, setNewSessInfoHov, newSessSupportEnabled, setNewSessSupportEnabled, newSessCalOpen, setNewSessCalOpen, newSessCalTarget, setNewSessCalTarget, newSessCalPos, setNewSessCalPos, newSessCalViewY, setNewSessCalViewY, newSessCalViewM, setNewSessCalViewM, newSessCalMode, setNewSessCalMode, newSessCalYearBase, setNewSessCalYearBase, newSessStartInput, setNewSessStartInput, newSessEndInput, setNewSessEndInput, newSessRandomCount, setNewSessRandomCount, newSessRandRangeVal, setNewSessRandRangeVal, newSessRandRangeUnit, setNewSessRandRangeUnit, newSessActivePreset, setNewSessActivePreset, newSessSymPickerOpen, setNewSessSymPickerOpen, newSessSymPickerSearch, setNewSessSymPickerSearch, newSessSymPickerPos, setNewSessSymPickerPos, newSessSupPickerOpen, setNewSessSupPickerOpen, newSessSupPickerSearch, setNewSessSupPickerSearch, newSessSupPickerPos, setNewSessSupPickerPos, newSessSupPickerCat, setNewSessSupPickerCat, newSessTradingCostsEnabled, setNewSessTradingCostsEnabled, newSessCosts, setNewSessCosts, newSessSymbolSpreads, setNewSessSymbolSpreads, newSessFuturesData, setNewSessFuturesData, stratTab, setStratTab, stratSearch, setStratSearch, stratSort, setStratSort, stratSortDir, setStratSortDir, stratStyleFilter, setStratStyleFilter, stratBuilderOpen, setStratBuilderOpen, stratEditId, setStratEditId, savedCommunityIds, setSavedCommunityIds, myStrategies, setMyStrategies, stratBName, setStratBName, stratBStyle, setStratBStyle, stratBDesc, setStratBDesc, stratBInstruments, setStratBInstruments, stratBInstInput, setStratBInstInput, stratBTimeframes, setStratBTimeframes, stratBTagInput, setStratBTagInput, stratBTags, setStratBTags, stratBComplexity, setStratBComplexity, stratCardHov, setStratCardHov, tool, setTool, hov, setHov, btnPressed, setBtnPressed, dropdown, setDropdown, ddAnchor, setDdAnchor, toolPinned, setToolPinned, dialog, setDialog, dlgTab, setDlgTab, tickCandle, setTickCandle, playing, setPlaying, speed, setSpeed, buySell, setBuySell, orderType, setOrderType, btmTab, setBtmTab, btmIndPos, setBtmIndPos, tblSort, setTblSort, btmTabBarRef, tradeCard, setTradeCard, tradeCardPreTags, setTradeCardPreTags, tradeCardPostTags, setTradeCardPostTags, tradeCardNotes, setTradeCardNotes, tradeActPopup, setTradeActPopup, tapJournal, setTapJournal, tapStrategy, setTapStrategy, tapTags, setTapTags, tapScreenshots, setTapScreenshots, viewingScreenshot, setViewingScreenshot, tapFileSlot, setTapFileSlot, tapTagInput, setTapTagInput, tradeTagOverrides, setTradeTagOverrides, tagEditInput, setTagEditInput, selRow, setSelRow, tagDrop, setTagDrop, tagDropPos, setTagDropPos, btmOpen, setBtmOpen, btmHeight, setBtmHeight, btmResizing, setBtmResizing, btmDragRef, btmPanelRef, tf, setTf, sizeMode, setSizeMode, riskVal, setRiskVal, riskBasis, setRiskBasis, slEnabled, setSlEnabled, entryRows, setEntryRows, entryScrollRef, slPrice, setSlPrice, slRows, setSlRows, slScrollRef, tpRows, setTpRows, tpScrollRef, tagDefs, postTagDefs, tagSels, setTagSels, tagDropOpen, setTagDropOpen, tagsOpen, setTagsOpen, notesText, setNotesText, notesOpen, setNotesOpen, tradeNotes, setTradeNotes, tradeScreenshots, setTradeScreenshots, screenshots, setScreenshots, ssOpen, setSsOpen, replaceTargetId, setReplaceTargetId, fileInputRef, replaceInputRef, tipTimerRef, tipData, setTipData, panelRef, tapFileRef, tcFileRef, tcSsSlot, setTcSsSlot, accountBalance, accountEquity, slAdvMode, setSlAdvMode, slAdvDrop, setSlAdvDrop, slBeUnit, setSlBeUnit, slBeUnitDrop, setSlBeUnitDrop, slBeTrigger, setSlBeTrigger, slBeOffset, setSlBeOffset, slTslUnit, setSlTslUnit, slTslUnitDrop, setSlTslUnitDrop, slTslActivation, setSlTslActivation, slTslTrail, setSlTslTrail, slTslStep, setSlTslStep, logoMenu, setLogoMenu, replayOpts, setReplayOpts, replayMode, setReplayMode, replayInterval, setReplayInterval, rollback, setRollback, rollbackLineX, setRollbackLineX, rbDragging, setRbDragging, rbPressed, setRbPressed, rbPressTimer, gotoOpen, setGotoOpen, gotoItems, setGotoItems, gotoAddType, setGotoAddType, gotoTab, setGotoTab, gotoNewDate, setGotoNewDate, gotoNewTime, setGotoNewTime, gotoNewRepeat, setGotoNewRepeat, gotoNewPrice, setGotoNewPrice, gotoNewName, setGotoNewName, gotoNewColor, setGotoNewColor, gotoCalOpen, setGotoCalOpen, gotoCalPos, setGotoCalPos, gotoTimeOpen, setGotoTimeOpen, gotoTimePos, setGotoTimePos, gotoCalViewY, setGotoCalViewY, gotoCalViewM, setGotoCalViewM, gotoCalMode, setGotoCalMode, gotoCalYearBase, setGotoCalYearBase, gotoDateInput, setGotoDateInput, gotoTimeInput, setGotoTimeInput, gotoPresets, setGotoPresets, ddPos, setDdPos, symbolOpen, setSymbolOpen, symbol, setSymbol, symbolSearch, setSymbolSearch, chartTypeOpen, setChartTypeOpen, chartType, setChartType, chartTypeDropL, setChartTypeDropL, tfOpen, setTfOpen, tfCat, setTfCat, tfPinned, setTfPinned, tfCustomVal, setTfCustomVal, tfEditMode, setTfEditMode, tfDefaults, tfCustomItems, setTfCustomItems, tfSortItems, tfCategories, tfCustomUnit, setTfCustomUnit, tfUnitOpen, setTfUnitOpen, tfIndPos, setTfIndPos, tfBarRef, chartCanvasRef, rollbackLineRef, rollbackOverlayRef, tlBarRef, tlBarDropRef, pinnedBarRef, cpBarAnchorRef, closingDropdownKey, canvasDims, setCanvasDims, settingsOpen, setSettingsOpen, profileOpen, setProfileOpen, profileTab, setProfileTab, profileLang, setProfileLang, profileCat, setProfileCat, profilePos, setProfilePos, profileName, setProfileName, profileAvatar, setProfileAvatar, profileNameEdit, setProfileNameEdit, profilePwOpen, setProfilePwOpen, profileCurPw, setProfileCurPw, profileNewPw, setProfileNewPw, profileConfirmPw, setProfileConfirmPw, darkMode, setDarkMode, faqOpen, setFaqOpen, faqCat, setFaqCat, faqPos, setFaqPos, emojiPanelOpen, setEmojiPanelOpen, emojiPanelPos, setEmojiPanelPos, emojiCat, setEmojiCat, emojiSearch, setEmojiSearch, faqExpand, setFaqExpand, screenshotOpen, setScreenshotOpen, scLinkOpen, setScLinkOpen, scLinkSearch, setScLinkSearch, scLinkedTrade, setScLinkedTrade, scLinkPhase, setScLinkPhase, isFullscreen, setIsFullscreen, pinnedBarOpen, setPinnedBarOpen, pinnedBarPos, setPinnedBarPos, groupSelected, setGroupSelected, tlBarPos, setTlBarPos, tlSettOpen, setTlSettOpen, tlSettPos, setTlSettPos, tlName, setTlName, tlNameEditing, setTlNameEditing, tlSettTab, setTlSettTab, tlLocked, setTlLocked, rrStyle, setRrStyle, rrInputs, setRrInputs, vwapLocked, setVwapLocked, vpLocked, setVpLocked, avLocked, setAvLocked, txtLocked, setTxtLocked, tlStyleDrop, setTlStyleDrop, tlInfoDropUp, setTlInfoDropUp, tlInfoDropAnchor, setTlInfoDropAnchor, tlStyleDropUp, setTlStyleDropUp, tlBarDrop, setTlBarDrop, tlTemplates, setTlTemplates, tlBarDropAnchor, setTlBarDropAnchor, tlLastBarDropRef, tlSaveAsMode, setTlSaveAsMode, tlNewTplName, setTlNewTplName, tlSettTplDrop, setTlSettTplDrop, tlStyle, setTlStyle, txtSettOpen, setTxtSettOpen, txtSettPos, setTxtSettPos, txtSettTab, setTxtSettTab, txtName, setTxtName, txtNameEditing, setTxtNameEditing, txtSizeOpen, setTxtSizeOpen, txtBarSizeOpen, setTxtBarSizeOpen, txtBarDrop, setTxtBarDrop, txtTemplates, setTxtTemplates, txtSaveAsMode, setTxtSaveAsMode, txtNewTplName, setTxtNewTplName, txtStyle, setTxtStyle, vwapSettOpen, setVwapSettOpen, vwapSettPos, setVwapSettPos, vwapSettTab, setVwapSettTab, vwapStyleDrop, setVwapStyleDrop, vwapBarPos, setVwapBarPos, vwapBarDrop, setVwapBarDrop, vwapStyle, setVwapStyle, vpSettOpen, setVpSettOpen, vpSettPos, setVpSettPos, vpSettTab, setVpSettTab, vpStyleDrop, setVpStyleDrop, vpBarPos, setVpBarPos, vpBarDrop, setVpBarDrop, vpStyle, setVpStyle, avSettOpen, setAvSettOpen, avSettPos, setAvSettPos, avSettTab, setAvSettTab, avStyleDrop, setAvStyleDrop, avBarPos, setAvBarPos, avBarDrop, setAvBarDrop, avStyle, setAvStyle, screenshotFlash, setScreenshotFlash, orderPanelOpen, setOrderPanelOpen, opSymOpen, setOpSymOpen, opSymSearch, setOpSymSearch, opSymPos, setOpSymPos, opSizeOpen, setOpSizeOpen, opSizePos, setOpSizePos, opTplOpen, setOpTplOpen, opTplPos, setOpTplPos, activeTemplate, setActiveTemplate, opSaveAsMode, setOpSaveAsMode, opNewTplName, setOpNewTplName, opSavedTemplates, setOpSavedTemplates, opDotsOpen, setOpDotsOpen, opDotsPos, setOpDotsPos, panelDetached, setPanelDetached, detachPos, setDetachPos, detachSize, setDetachSize, panelMode, setPanelMode, isWide, opTemplates, rightPanel, setRightPanel, screenshotPos, setScreenshotPos, layersOpen, setLayersOpen, layersPos, setLayersPos, layersCat, setLayersCat, layersItems, setLayersItems, layersVis, setLayersVis, layersSearch, setLayersSearch, newsOpen, setNewsOpen, newsPos, setNewsPos, newsTab, setNewsTab, newsSearch, setNewsSearch, newsImpact, setNewsImpact, newsSymbolOnly, setNewsSymbolOnly, newsFilterOpen, setNewsFilterOpen, newsFilterClosing, setNewsFilterClosing, newsCntSel, setNewsCntSel, layoutOpen, setLayoutOpen, layoutPos, setLayoutPos, layoutPanels, setLayoutPanels, layoutSync, setLayoutSync, layoutTab, setLayoutTab, settingsTab, setSettingsTab, balVis, setBalVis, sDrop, setSDrop, colorPicker, setColorPicker, cpPos, setCpPos, swHov, setSwHov, settDrop, setSettDrop, settDropPos, setSettDropPos, customTemplates, setCustomTemplates, tplNameInput, setTplNameInput, settHdrTplDrop, setSettHdrTplDrop, settHdrSaveAs, setSettHdrSaveAs, settHdrTplName, setSettHdrTplName, cpH, setCpH, cpS, setCpS, cpV, setCpV, cpA, setCpA, cpHex, setCpHex, cpDragging, setCpDragging, cpDragRect, setCpDragRect, settings, setSettings, indOpen, setIndOpen, indPinned, setIndPinned, indActive, setIndActive, indSelected, setIndSelected, indSearch, setIndSearch, indPos, setIndPos, indCat, setIndCat, indTplOpen, setIndTplOpen, indTplSaveMode, setIndTplSaveMode, indTplName, setIndTplName, indTemplates, setIndTemplates, dragging, setDragging, settingsPos, setSettingsPos, closing, setClosing, animClose, closePopup, closeTlBarDrop, closeTlSett, closeTxtSett, closeVwapSett, closeVpSett, closeAvSett, closeDropdown, closeFontSizeDrop, closeTlInfoDrop, closeTlSettTplDrop, closeCP, c, chromeBr, F, allSymbols, currentSymbol, chartTypeMap, currentChartType, gotoNextId, tlSubTool, tlSubToolRef, txtSubTool, txtSubToolRef, isFibTool, isGannTool, isElliottTool, isPatternTool, isRRTool, rollbackOverlayCallbackRef, catColors, tplWatchKeys, updateSetting, defaultTemplateMap, applyTemplate, saveCustomTemplate, Chk, TlChk, Z, cpW, CP_H, posFromRect, sdPos, openCP, openGotoCP, cpApply, indicatorData, indFiltered, I, B, Sel, MiniIn, toolGroups, actionTools, priceLabels, timeLabels, priceAxisWidth, closeWindows, launchSession, startNewSession, saveNewSession, deleteSession, duplicateSession, openEditSession, closeAll, showTip, hideTip, renderTB, getDdItems, ddItems } = ctx;
  const { sep, lbl, secH, navPanel } = shared;

          const STYLES = ["All","Trend Following","Mean Reversion","Scalping","Breakout","Price Action","Swing","Algorithmic","News Trading","Other"];
          const TFS = ["1m","2m","3m","5m","10m","15m","30m","1H","2H","4H","1D","1W"];
          const complexityColor={Easy:c.gn,Medium:c.gold,Hard:c.rd};

          /* ─── Community pool ─── */
          const communityPool = [
            {id:"c1",author:"TraderMike",authorBadge:"Pro",name:"Momentum Breakout",style:"Trend Following",instruments:["NQ","ES","YM"],timeframes:["5m","15m"],winRate:58,rr:2.1,trades:214,pnl:8340,complexity:"Medium",tags:["Breakout","Momentum","Volume"],saves:412,desc:"Trades NQ momentum breakouts on the 5m chart using volume confirmation and ATR-based stops."},
            {id:"c2",author:"FXAlchemist",authorBadge:"",name:"EMA Mean Reversion",style:"Mean Reversion",instruments:["ES","SPY","QQQ"],timeframes:["15m","1H"],winRate:44,rr:1.4,trades:87,pnl:-1220,complexity:"Easy",tags:["EMA","Pullback","Counter-trend"],saves:87,desc:"Fades extended moves using EMA distance bands. Entries on pullback candles after price stretches >1.5 ATR."},
            {id:"c3",author:"LondonLion",authorBadge:"Verified",name:"London Session Scalp",style:"Scalping",instruments:["EURUSD","GBPUSD","USDJPY"],timeframes:["1m","5m","15m"],winRate:65,rr:1.8,trades:312,pnl:6750,complexity:"Hard",tags:["Forex","Session","Scalp"],saves:631,desc:"Scalps during the London open using key S/R levels. Targets 10–20 pips with tight 5-pip stops."},
            {id:"c4",author:"OilTrader99",authorBadge:"",name:"Volume Breakout",style:"Breakout",instruments:["CL","NG","HO"],timeframes:["1H","4H"],winRate:52,rr:2.6,trades:48,pnl:2840,complexity:"Medium",tags:["Volume","Energy","Futures"],saves:203,desc:"Trades range breakouts on crude oil with volume confirmation. Requires 150% avg volume on the breakout candle."},
            {id:"c5",author:"GoldDigger",authorBadge:"Pro",name:"Golden Cross Trend",style:"Trend Following",instruments:["GC","SI","PL"],timeframes:["4H","1D"],winRate:71,rr:2.6,trades:52,pnl:12480,complexity:"Easy",tags:["Gold","SMA","Long-term"],saves:889,desc:"Long-only trend strategy using the 50/200 EMA golden cross on gold and silver."},
            {id:"c6",author:"VWAPmaster",authorBadge:"",name:"VWAP Intraday",style:"Scalping",instruments:["ES","NQ","SPY"],timeframes:["1m","5m"],winRate:60,rr:1.5,trades:440,pnl:4210,complexity:"Medium",tags:["VWAP","Intraday","Scalp"],saves:344,desc:"Bounces off VWAP during regular trading hours. Uses 1-min confirmation candles with a volume spike filter."},
            {id:"c7",author:"ZoneHunter",authorBadge:"Verified",name:"Supply & Demand Zones",style:"Swing",instruments:["EURUSD","GBPJPY","XAUUSD"],timeframes:["1H","4H","1D"],winRate:55,rr:3.2,trades:67,pnl:7650,complexity:"Hard",tags:["Zones","Price Action","Swing"],saves:521,desc:"Identifies major S&D zones on the 4H chart; takes precision entries on the 15m chart. Minimum 1:3 R:R."},
            {id:"c8",author:"ICT_Trader",authorBadge:"Pro",name:"ICT SMC Framework",style:"Price Action",instruments:["NQ","ES","DX"],timeframes:["5m","15m","1H"],winRate:62,rr:2.8,trades:130,pnl:9200,complexity:"Hard",tags:["ICT","SMC","Liquidity"],saves:1204,desc:"Applies ICT methodology: Order Blocks, Fair Value Gaps, and liquidity sweeps. Only enters after confirmed displacement."},
            {id:"c9",author:"AsianEdge",authorBadge:"",name:"Asian Range Breakout",style:"Breakout",instruments:["GBPUSD","AUDUSD","USDJPY"],timeframes:["15m","1H"],winRate:55,rr:1.9,trades:58,pnl:1890,complexity:"Medium",tags:["Session","Range","Forex"],saves:167,desc:"Breaks out of the Asian session range during the London open on GBP pairs. Min R:R of 1.8 required."},
            {id:"c10",author:"MacroBot",authorBadge:"Verified",name:"News Trading Catalyst",style:"News Trading",instruments:["EURUSD","XAUUSD","USDJPY"],timeframes:["1H","4H"],winRate:61,rr:2.0,trades:22,pnl:7200,complexity:"Hard",tags:["News","NFP","FOMC"],saves:278,desc:"Trades high-impact news events (NFP, CPI, FOMC) with breakout entries and wide initial stops."},
            {id:"c11",author:"GridKing",authorBadge:"",name:"EUR/USD Grid System",style:"Algorithmic",instruments:["EURUSD","EURGBP","EURJPY"],timeframes:["1H","4H"],winRate:62,rr:1.2,trades:388,pnl:2210,complexity:"Medium",tags:["Grid","Algorithmic","Forex"],saves:95,desc:"Places a grid of buy/sell orders every 20 pips around a central price level. Profits from oscillating price action."},
            {id:"c12",author:"YieldCurveZ",authorBadge:"Pro",name:"Treasury Bond Yield Curve",style:"Swing",instruments:["ZB","ZN","ZF","TLT"],timeframes:["1H","1D"],winRate:61,rr:2.5,trades:33,pnl:7200,complexity:"Hard",tags:["Bonds","Yield","Macro"],saves:312,desc:"Trades the yield curve by going long ZB and short ZN/ZF during inversion periods."},
          ];

          /* ─── Filter + sort community ─── */
          const filteredCommunity = communityPool
            .filter(s => {
              const q = stratSearch.toLowerCase();
              const matchQ = !q || s.name.toLowerCase().includes(q) || s.author.toLowerCase().includes(q) || s.tags.some(t=>t.toLowerCase().includes(q));
              const matchStyle = stratStyleFilter==="All" || s.style===stratStyleFilter;
              return matchQ && matchStyle;
            })
            .sort((a,b)=>{
              let av=a[stratSort]??0, bv=b[stratSort]??0;
              if(stratSort==="name"||stratSort==="author"){av=av.toLowerCase();bv=bv.toLowerCase();}
              if(av<bv) return stratSortDir==="asc"?-1:1;
              if(av>bv) return stratSortDir==="asc"?1:-1;
              return 0;
            });

          /* ─── Filter + sort my strategies ─── */
          const filteredMine = myStrategies
            .filter(s=>{
              const q=stratSearch.toLowerCase();
              return !q||s.name.toLowerCase().includes(q)||s.tags.some(t=>t.toLowerCase().includes(q));
            })
            .filter(s=>stratStyleFilter==="All"||s.style===stratStyleFilter);

          /* ─── Strategy card (shared) ─── */
          const StratCard = ({strat,isMine,onEdit,onDelete,onSave,isSaved}) => {
            const isH=stratCardHov===strat.id;
            const pnlPos=(strat.pnl??0)>=0;
            const pnlCol=pnlPos?c.gn:c.rd;
            const hasStats=strat.winRate!=null;
            return (
              <div onMouseEnter={()=>setStratCardHov(strat.id)} onMouseLeave={()=>setStratCardHov(null)}
                style={{background:c.el,border:`1px solid ${isH?c.acB:c.brH}`,cursor:"default",transition:"border-color 0.15s,box-shadow 0.15s",boxShadow:isH?"0 4px 24px rgba(74,106,255,0.10)":"none",display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>
                {/* top accent line */}
                <div style={{height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`}}/>
                <div style={{padding:"14px 16px 12px",flex:1,display:"flex",flexDirection:"column",gap:9}}>
                  {/* row 1: name + badge */}
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:800,color:c.tx,marginBottom:2,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{strat.name}</div>
                      <div style={{fontSize:8,fontWeight:700,color:c.acL,letterSpacing:"0.07em",fontFamily:F}}>{strat.style}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                      {strat.complexity&&<div style={{fontSize:7,fontWeight:800,color:complexityColor[strat.complexity]||c.ts,border:`1px solid ${(complexityColor[strat.complexity]||c.ts)}44`,padding:"2px 7px",fontFamily:F}}>{strat.complexity.toUpperCase()}</div>}
                      {!isMine&&strat.authorBadge==="Pro"&&<div style={{fontSize:7,fontWeight:800,color:c.gold,border:`1px solid ${c.gold}44`,padding:"2px 7px",fontFamily:F}}>PRO</div>}
                      {!isMine&&strat.authorBadge==="Verified"&&<div style={{fontSize:7,fontWeight:800,color:c.acL,border:`1px solid ${c.acB}`,padding:"2px 7px",fontFamily:F}}>✓ VERIFIED</div>}
                    </div>
                  </div>
                  {/* author row (community only) */}
                  {!isMine&&<div style={{fontSize:8,fontWeight:600,color:c.tm,fontFamily:F}}>by {strat.author} · {strat.saves} saves</div>}
                  {/* description */}
                  {strat.desc&&<div style={{fontSize:9,fontWeight:500,color:c.ts,fontFamily:F,lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{strat.desc}</div>}
                  {/* stats grid */}
                  {hasStats&&(
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0,border:`1px solid ${c.brL}`}}>
                      {[["Win Rate",`${strat.winRate}%`,strat.winRate>=50?c.gn:c.rd],["Avg R:R",`1:${strat.rr}`,c.ts],["Trades",String(strat.trades),c.ts],["Net P&L",`${pnlPos?"+":""}$${(strat.pnl||0).toLocaleString()}`,pnlCol]].map(([l,v,col],i)=>(
                        <div key={l} style={{padding:"7px 8px",borderRight:i<3?`1px solid ${c.brL}`:"none",display:"flex",flexDirection:"column",gap:2}}>
                          <div style={{fontSize:7,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F}}>{l}</div>
                          <div style={{fontSize:11,fontWeight:800,color:col,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* instruments + timeframes */}
                  {(strat.instruments?.length>0||strat.timeframes?.length>0)&&(
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {(strat.instruments||[]).map(ins=>(
                        <div key={ins} style={{fontSize:8,fontWeight:700,color:c.ts,background:c.sf,border:`1px solid ${c.br}`,padding:"2px 7px",fontFamily:F}}>{ins}</div>
                      ))}
                      {(strat.timeframes||[]).map(tf=>(
                        <div key={tf} style={{fontSize:8,fontWeight:700,color:c.acL,background:c.acD,border:`1px solid ${c.acB}`,padding:"2px 7px",fontFamily:F}}>{tf}</div>
                      ))}
                    </div>
                  )}
                  {/* tags */}
                  {strat.tags?.length>0&&(
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {strat.tags.map(tag=>(
                        <div key={tag} style={{fontSize:7,fontWeight:600,color:c.tm,letterSpacing:"0.05em",fontFamily:F}}>#{tag}</div>
                      ))}
                    </div>
                  )}
                </div>
                {/* action bar */}
                <div style={{display:"flex",gap:0,borderTop:`1px solid ${c.brL}`,flexShrink:0}}>
                  {isMine?(
                    <>
                      <div onClick={()=>{onEdit&&onEdit(strat);}}
                        style={{flex:1,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:c.sf,cursor:"default",fontSize:9,fontWeight:700,color:c.ts,transition:"filter 0.12s",borderRight:`1px solid ${c.brL}`,fontFamily:F,gap:5}}
                        onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.15)"}
                        onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        Edit
                      </div>
                      <div onClick={()=>{onDelete&&onDelete(strat.id);}}
                        style={{width:44,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:c.sf,cursor:"default",fontSize:9,fontWeight:700,color:c.rd,transition:"filter 0.12s",fontFamily:F}}
                        onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.2)"}
                        onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </div>
                    </>
                  ):(
                    <>
                      <div onClick={()=>{onSave&&onSave(strat);}}
                        style={{flex:1,height:32,display:"flex",alignItems:"center",justifyContent:"center",gap:5,background:isSaved?"rgba(74,106,255,0.12)":c.sf,cursor:"default",fontSize:9,fontWeight:700,color:isSaved?c.acL:c.ts,transition:"filter 0.12s, background 0.15s",borderRight:`1px solid ${c.brL}`,fontFamily:F,border:isSaved?`1px solid ${c.acB}`:"none"}}
                        onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                        onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill={isSaved?c.acL:"none"} stroke={isSaved?c.acL:c.ts} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                        {isSaved?"Saved":"Save"}
                      </div>
                      <div style={{flex:1,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.96)",letterSpacing:"0.06em",transition:"filter 0.12s",fontFamily:F}}
                        onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                        onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                        Use Strategy
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          };

          /* ─── Builder modal open/close helper ─── */
          const openBuilder = (editStrat=null) => {
            if(editStrat){
              setStratEditId(editStrat.id);
              setStratBName(editStrat.name);
              setStratBStyle(editStrat.style||"Trend Following");
              setStratBDesc(editStrat.desc||"");
              setStratBInstruments(editStrat.instruments||[]);
              setStratBTimeframes(editStrat.timeframes||[]);
              setStratBTags(editStrat.tags||[]);
              setStratBComplexity(editStrat.complexity||"Medium");
            } else {
              setStratEditId(null);
              setStratBName(""); setStratBStyle("Trend Following"); setStratBDesc("");
              setStratBInstruments([]); setStratBTimeframes([]); setStratBTags([]);
              setStratBComplexity("Medium");
            }
            setStratBInstInput(""); setStratBTagInput("");
            setStratBuilderOpen(true);
          };

          const saveBuilder = () => {
            const strat = {
              id: stratEditId || `m${Date.now()}`,
              name: stratBName.trim()||"Untitled Strategy",
              style: stratBStyle,
              desc: stratBDesc.trim(),
              instruments: stratBInstruments,
              timeframes: stratBTimeframes,
              tags: stratBTags,
              complexity: stratBComplexity,
              createdAt: stratEditId ? (myStrategies.find(s=>s.id===stratEditId)?.createdAt||new Date().toISOString()) : new Date().toISOString(),
            };
            if(stratEditId){
              setMyStrategies(prev=>prev.map(s=>s.id===stratEditId?strat:s));
            } else {
              setMyStrategies(prev=>[strat,...prev]);
            }
            setStratBuilderOpen(false);
          };

          const saveCommunity = (strat) => {
            const already = savedCommunityIds.has(strat.id);
            if(already){
              setSavedCommunityIds(prev=>{const n=new Set(prev);n.delete(strat.id);return n;});
              setMyStrategies(prev=>prev.filter(s=>s.id!==strat.id));
            } else {
              setSavedCommunityIds(prev=>new Set([...prev,strat.id]));
              const copy={...strat,id:strat.id,savedFromCommunity:true};
              setMyStrategies(prev=>[copy,...prev.filter(s=>s.id!==strat.id)]);
            }
          };

          const SORT_OPTIONS=[{k:"name",l:"Name"},{k:"winRate",l:"Win Rate"},{k:"rr",l:"Avg R:R"},{k:"saves",l:"Most Saved"},{k:"pnl",l:"Net P&L"}];

          return (
            <div style={{position:"fixed",inset:0,zIndex:99998,background:c.bg,fontFamily:F,display:"flex",flexDirection:"column"}} onClick={()=>{}}>
              {/* ─ Header ─ */}
              <div style={{height:64,flexShrink:0,display:"flex",alignItems:"center",gap:0,background:c.el,boxShadow:"0 2px 18px rgba(0,0,0,0.5)",zIndex:2}}>
                <div style={{width:64,flexShrink:0,height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <img src="/LOGO-07.png" style={{width:52,height:52,objectFit:"contain"}} alt=""/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 0 0 4px",flexShrink:0}}>
                  <div style={{fontSize:17,fontWeight:700,color:c.tx,letterSpacing:"0.04em",fontFamily:F}}>Talaria-Log</div>
                  <div style={{width:1.5,height:36,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acL}`}}/>
                  <div style={{fontSize:13,fontWeight:700,color:c.ts,letterSpacing:"0.06em",fontFamily:F,position:"relative",top:2}}>Strategy Bank</div>
                </div>
                <div style={{flex:1}}/>
                {/* Tab switcher */}
                <div style={{display:"flex",alignItems:"flex-end",height:"100%",gap:2,padding:"0 24px 0 0"}}>
                  {[{k:"mine",l:"My Strategies",ct:myStrategies.length},{k:"community",l:"Community",ct:communityPool.length}].map(({k,l,ct})=>{
                    const isA=stratTab===k;
                    return(
                      <div key={k} onClick={()=>setStratTab(k)}
                        style={{height:48,padding:"0 16px",display:"flex",alignItems:"center",gap:6,cursor:"default",position:"relative",transition:"color 0.12s"}}>
                        <div style={{fontSize:10,fontWeight:isA?800:600,color:isA?c.tx:c.tm,fontFamily:F,letterSpacing:"0.04em"}}>{l}</div>
                        <div style={{fontSize:8,fontWeight:700,color:isA?c.acL:c.tm,background:isA?c.acD:"rgba(255,255,255,0.06)",border:`1px solid ${isA?c.acB:c.br}`,padding:"1px 6px",fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{ct}</div>
                        {isA&&<div style={{position:"absolute",bottom:0,left:"15%",right:"15%",height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acL}88`}}/>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ─ Filter/search bar ─ */}
              <div style={{flexShrink:0,background:c.bg,borderBottom:`1px solid ${c.brH}`,padding:"0 32px 0 80px"}}>
                <div style={{display:"flex",alignItems:"center",height:44,gap:10}}>
                  {/* style filter pills */}
                  <div style={{display:"flex",gap:4,alignItems:"center",flex:1,overflowX:"auto"}}>
                    {["All","Trend Following","Mean Reversion","Scalping","Breakout","Price Action","Swing","Algorithmic","News Trading"].map(f=>{
                      const isA=stratStyleFilter===f;
                      return(
                        <div key={f} onClick={()=>setStratStyleFilter(f)}
                          style={{padding:"3px 10px",fontSize:8,fontWeight:isA?800:600,color:isA?c.acL:c.tm,background:isA?c.acD:"transparent",border:`1px solid ${isA?c.acB:c.br}`,cursor:"default",transition:"all 0.12s",flexShrink:0,fontFamily:F,letterSpacing:"0.04em"}}
                          onMouseEnter={e=>{if(!isA){e.currentTarget.style.color=c.ts;e.currentTarget.style.borderColor=c.brH;}}}
                          onMouseLeave={e=>{if(!isA){e.currentTarget.style.color=c.tm;e.currentTarget.style.borderColor=c.br;}}}>
                          {f}
                        </div>
                      );
                    })}
                  </div>
                  {/* search */}
                  <div style={{display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${c.brH}`,padding:"0 10px",width:200,height:28,boxSizing:"border-box",flexShrink:0}}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{color:c.tm,flexShrink:0}}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    <input value={stratSearch} onChange={e=>setStratSearch(e.target.value)} placeholder={stratTab==="mine"?"Search my strategies…":"Search community…"}
                      style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9,fontWeight:600,fontFamily:F,padding:0}}/>
                    {stratSearch&&<div onClick={()=>setStratSearch("")} style={{color:c.tm,cursor:"default",fontSize:11,lineHeight:1}}>×</div>}
                  </div>
                  {/* sort dropdown (community only) */}
                  {stratTab==="community"&&(
                    <div style={{position:"relative",flexShrink:0}}>
                      <div onClick={e=>{e.stopPropagation();setSessSortOpen(p=>!p);}}
                        style={{display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${c.brH}`,padding:"0 10px",height:28,cursor:"default",fontFamily:F}}>
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{color:c.tm}}><path d="M3 6h18M6 12h12M9 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        <span style={{fontSize:9,fontWeight:600,color:c.ts}}>{SORT_OPTIONS.find(o=>o.k===stratSort)?.l||"Sort"}</span>
                        <svg width={8} height={8} viewBox="0 0 24 24" fill="none" style={{color:c.tm}}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </div>
                      {sessSortOpen&&(
                        <>
                          <div style={{position:"fixed",inset:0,zIndex:99990}} onClick={()=>setSessSortOpen(false)}/>
                          <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,zIndex:99991,width:160,background:c.el,border:`1px solid ${c.brH}`,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                            {SORT_OPTIONS.map(o=>{
                              const isA=stratSort===o.k;
                              return(
                                <div key={o.k} onClick={()=>{if(isA)setStratSortDir(d=>d==="asc"?"desc":"asc");else{setStratSort(o.k);setStratSortDir("desc");}setSessSortOpen(false);}}
                                  style={{padding:"8px 12px",fontSize:10,fontWeight:isA?700:500,color:isA?c.tx:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"space-between",borderLeft:isA?`2px solid ${c.acL}`:"2px solid transparent",transition:"background 0.1s",fontFamily:F}}
                                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  {o.l}
                                  {isA&&<span style={{fontSize:9,color:c.acL}}>{stratSortDir==="asc"?"↑":"↓"}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {/* Build Strategy button (My tab only) */}
                  {stratTab==="mine"&&(
                    <div onClick={()=>openBuilder()}
                      style={{display:"flex",alignItems:"center",gap:6,height:28,padding:"0 14px",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontFamily:F,flexShrink:0,transition:"filter 0.12s"}}
                      onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                      onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round"/></svg>
                      <span style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.95)",letterSpacing:"0.06em"}}>Build Strategy</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ─ Body ─ */}
              <div style={{flex:1,display:"flex",overflow:"hidden"}}>
                {navPanel}
                <div style={{flex:1,overflowY:"auto",padding:"24px 32px"}} className="tlr-scroll">

                  {/* MY STRATEGIES */}
                  {stratTab==="mine"&&(
                    filteredMine.length===0?(
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,height:340}}>
                        <svg width={52} height={52} viewBox="0 0 24 24" fill="none" style={{color:c.tm,opacity:0.5}}><rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                        <div style={{fontSize:13,fontWeight:700,color:c.ts,fontFamily:F}}>{stratSearch||stratStyleFilter!=="All"?"No strategies match":"No strategies yet"}</div>
                        <div style={{fontSize:10,color:c.tm,fontFamily:F,textAlign:"center",maxWidth:320}}>{stratSearch||stratStyleFilter!=="All"?"Try adjusting your search or filters.":"Build your first strategy to keep track of your trading rules, instruments, and tags."}</div>
                        {!stratSearch&&stratStyleFilter==="All"&&(
                          <div onClick={()=>openBuilder()}
                            style={{display:"flex",alignItems:"center",gap:6,height:32,padding:"0 18px",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontFamily:F,marginTop:4,transition:"filter 0.12s"}}
                            onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                            onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                            <svg width={10} height={10} viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round"/></svg>
                            <span style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.95)",letterSpacing:"0.06em"}}>Build Strategy</span>
                          </div>
                        )}
                      </div>
                    ):(
                      <div style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:16}}>
                        {filteredMine.map(strat=>(
                          <StratCard key={strat.id} strat={strat} isMine={true}
                            onEdit={s=>openBuilder(s)}
                            onDelete={id=>setMyStrategies(prev=>prev.filter(s=>s.id!==id))}/>
                        ))}
                      </div>
                    )
                  )}

                  {/* COMMUNITY */}
                  {stratTab==="community"&&(
                    filteredCommunity.length===0?(
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,height:340}}>
                        <svg width={48} height={48} viewBox="0 0 24 24" fill="none" style={{color:c.tm,opacity:0.5}}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                        <div style={{fontSize:13,fontWeight:700,color:c.ts,fontFamily:F}}>No results</div>
                        <div style={{fontSize:10,color:c.tm,fontFamily:F}}>Try adjusting your search or filters.</div>
                      </div>
                    ):(
                      <div style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:16}}>
                        {filteredCommunity.map(strat=>(
                          <StratCard key={strat.id} strat={strat} isMine={false}
                            isSaved={savedCommunityIds.has(strat.id)}
                            onSave={s=>saveCommunity(s)}/>
                        ))}
                      </div>
                    )
                  )}

                </div>
              </div>{/* end body */}

              {/* ─ Strategy Builder Modal ─ */}
              {stratBuilderOpen&&(
                <div style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(5,7,20,0.82)",display:"flex",alignItems:"center",justifyContent:"center"}}
                  onClick={e=>{if(e.target===e.currentTarget)setStratBuilderOpen(false);}}>
                  <div style={{width:600,maxHeight:"85vh",background:c.el,border:`1px solid ${c.brH}`,boxShadow:"0 20px 60px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",overflowY:"auto"}} className="tlr-scroll" onClick={e=>e.stopPropagation()}>
                    {/* modal header */}
                    <div style={{height:52,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",borderBottom:`1px solid ${c.brH}`}}>
                      <div style={{fontSize:13,fontWeight:800,color:c.tx,fontFamily:F}}>{stratEditId?"Edit Strategy":"Build Strategy"}</div>
                      <div onClick={()=>setStratBuilderOpen(false)} style={{width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:c.tm,transition:"color 0.12s"}}
                        onMouseEnter={e=>e.currentTarget.style.color=c.tx} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</div>
                    </div>
                    {/* form body */}
                    <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:18}}>

                      {/* Name */}
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F}}>Strategy Name</div>
                        <input value={stratBName} onChange={e=>setStratBName(e.target.value)} placeholder="e.g. London Session Scalp"
                          style={{height:34,background:c.sf,border:`1px solid ${c.brH}`,outline:"none",padding:"0 12px",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,width:"100%",boxSizing:"border-box"}}/>
                      </div>

                      {/* Style + Complexity row */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F}}>Trading Style</div>
                          <select value={stratBStyle} onChange={e=>setStratBStyle(e.target.value)}
                            style={{height:34,background:c.sf,border:`1px solid ${c.brH}`,outline:"none",padding:"0 10px",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,appearance:"none",cursor:"default"}}>
                            {STYLES.filter(s=>s!=="All").map(s=><option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F}}>Complexity</div>
                          <div style={{display:"flex",gap:6,height:34,alignItems:"center"}}>
                            {["Easy","Medium","Hard"].map(lv=>{
                              const isA=stratBComplexity===lv;
                              return(
                                <div key={lv} onClick={()=>setStratBComplexity(lv)}
                                  style={{flex:1,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:isA?(complexityColor[lv]||c.ts):c.tm,border:`1px solid ${isA?(complexityColor[lv]||c.acB):c.br}`,background:isA?"rgba(255,255,255,0.04)":"transparent",cursor:"default",transition:"all 0.12s",fontFamily:F,letterSpacing:"0.05em"}}>
                                  {lv}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F}}>Description</div>
                        <textarea value={stratBDesc} onChange={e=>setStratBDesc(e.target.value)} rows={3}
                          placeholder="Describe your entry/exit rules, filters, and key conditions…"
                          style={{background:c.sf,border:`1px solid ${c.brH}`,outline:"none",padding:"10px 12px",color:c.tx,fontSize:9,fontWeight:500,fontFamily:F,resize:"vertical",lineHeight:1.6,width:"100%",boxSizing:"border-box"}}/>
                      </div>

                      {/* Instruments */}
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F}}>Instruments</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,background:c.sf,border:`1px solid ${c.brH}`,padding:"8px 10px",minHeight:36,alignItems:"center"}}>
                          {stratBInstruments.map(ins=>(
                            <div key={ins} style={{display:"flex",alignItems:"center",gap:4,background:c.bg,border:`1px solid ${c.br}`,padding:"2px 8px",fontFamily:F}}>
                              <span style={{fontSize:9,fontWeight:700,color:c.ts}}>{ins}</span>
                              <span onClick={()=>setStratBInstruments(p=>p.filter(x=>x!==ins))} style={{fontSize:11,color:c.tm,cursor:"default",lineHeight:1}}>×</span>
                            </div>
                          ))}
                          <input value={stratBInstInput} onChange={e=>setStratBInstInput(e.target.value)}
                            onKeyDown={e=>{if((e.key==="Enter"||e.key===","||e.key===" ")&&stratBInstInput.trim()){const v=stratBInstInput.trim().toUpperCase().replace(",","");if(v&&!stratBInstruments.includes(v))setStratBInstruments(p=>[...p,v]);setStratBInstInput("");}if(e.key==="Backspace"&&!stratBInstInput&&stratBInstruments.length>0)setStratBInstruments(p=>p.slice(0,-1));}}
                            placeholder={stratBInstruments.length===0?"Add symbols (Enter to add)":""}
                            style={{flex:1,minWidth:80,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9,fontWeight:600,fontFamily:F,padding:0}}/>
                        </div>
                        <div style={{fontSize:7,color:c.tm,fontFamily:F}}>Press Enter or Space to add each symbol</div>
                      </div>

                      {/* Timeframes */}
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F}}>Timeframes</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {TFS.map(tf=>{
                            const isA=stratBTimeframes.includes(tf);
                            return(
                              <div key={tf} onClick={()=>setStratBTimeframes(p=>isA?p.filter(x=>x!==tf):[...p,tf])}
                                style={{padding:"4px 10px",fontSize:9,fontWeight:isA?800:600,color:isA?c.acL:c.tm,background:isA?c.acD:"transparent",border:`1px solid ${isA?c.acB:c.br}`,cursor:"default",transition:"all 0.12s",fontFamily:F}}>
                                {tf}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Tags */}
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:F}}>Tags</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,background:c.sf,border:`1px solid ${c.brH}`,padding:"8px 10px",minHeight:36,alignItems:"center"}}>
                          {stratBTags.map(tag=>(
                            <div key={tag} style={{display:"flex",alignItems:"center",gap:4,background:c.bg,border:`1px solid ${c.br}`,padding:"2px 8px",fontFamily:F}}>
                              <span style={{fontSize:8,fontWeight:600,color:c.tm}}>#{tag}</span>
                              <span onClick={()=>setStratBTags(p=>p.filter(x=>x!==tag))} style={{fontSize:11,color:c.tm,cursor:"default",lineHeight:1}}>×</span>
                            </div>
                          ))}
                          <input value={stratBTagInput} onChange={e=>setStratBTagInput(e.target.value)}
                            onKeyDown={e=>{if((e.key==="Enter"||e.key===","||e.key===" ")&&stratBTagInput.trim()){const v=stratBTagInput.trim().replace(/[,#]/g,"");if(v&&!stratBTags.includes(v))setStratBTags(p=>[...p,v]);setStratBTagInput("");}if(e.key==="Backspace"&&!stratBTagInput&&stratBTags.length>0)setStratBTags(p=>p.slice(0,-1));}}
                            placeholder={stratBTags.length===0?"Add tags (e.g. Breakout, VWAP)":""}
                            style={{flex:1,minWidth:80,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:9,fontWeight:600,fontFamily:F,padding:0}}/>
                        </div>
                        <div style={{fontSize:7,color:c.tm,fontFamily:F}}>Press Enter or Space to add each tag</div>
                      </div>

                    </div>
                    {/* modal footer */}
                    <div style={{flexShrink:0,borderTop:`1px solid ${c.brH}`,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,padding:"12px 20px"}}>
                      <div onClick={()=>setStratBuilderOpen(false)}
                        style={{padding:"0 16px",height:32,display:"flex",alignItems:"center",fontSize:9,fontWeight:700,color:c.ts,border:`1px solid ${c.br}`,cursor:"default",fontFamily:F,transition:"all 0.12s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=c.brH;e.currentTarget.style.color=c.tx;}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=c.br;e.currentTarget.style.color=c.ts;}}>
                        Cancel
                      </div>
                      <div onClick={saveBuilder}
                        style={{padding:"0 20px",height:32,display:"flex",alignItems:"center",fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.95)",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontFamily:F,letterSpacing:"0.05em",transition:"filter 0.12s"}}
                        onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                        onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                        {stratEditId?"Save Changes":"Create Strategy"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
}
