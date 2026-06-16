import React from 'react';
import FlagSvg from '../../components/FlagSvg';
import SymBadge from '../../components/SymBadge';
import Toggle from '../../components/Toggle';
import ColorPickerPopup from '../../components/ColorPickerPopup';
import { SYMBOLS_DATA, EMOJI_CATS } from '../../data/constants';

export function renderSessionsView(ctx, shared) {
  const { loading, setLoading, loadFading, setLoadFading, loadPhase, setLoadPhase, loadDots, setLoadDots, loadQuote, setLoadQuote, typedQuote, setTypedQuote, sessionPage, setSessionPage, sessPageFading, setSessPageFading, sessions, setSessions, newSessName, setNewSessName, newSessSymbol, setNewSessSymbol, newSessTf, setNewSessTf, newSessStart, setNewSessStart, newSessEnd, setNewSessEnd, newSessCapital, setNewSessCapital, sessHov, setSessHov, stratPopup, setStratPopup, symPopup, setSymPopup, sessView, setSessView, dashSessId, setDashSessId, dashHov, setDashHov, sessSelected, setSessSelected, sessSearchQ, setSessSearchQ, sessFilter, setSessFilter, sessActMenu, setSessActMenu, sessSortBy, setSessSortBy, sessSortDir, setSessSortDir, sessSortOpen, setSessSortOpen, sessSearchOpen, setSessSearchOpen, sessLayoutMode, setSessLayoutMode, cardSortOpen, setCardSortOpen, newSessCurrency, setNewSessCurrency, sessDateMode, setSessDateMode, sessNBars, setSessNBars, sessQuickDate, setSessQuickDate, sessRiskMode, setSessRiskMode, sessRiskVal, setSessRiskVal, sessLeverage, setSessLeverage, sessCommission, setSessCommission, sessCommissionVal, setSessCommissionVal, sessSlippage, setSessSlippage, sessTradingMode, setSessTradingMode, sessPropCat, setSessPropCat, sessPropFirm, setSessPropFirm, sessNumPhases, setSessNumPhases, sessChallengeType, setSessChallengeType, sessP1DailyLossPct, setSessP1DailyLossPct, sessP1TotalDDPct, setSessP1TotalDDPct, sessP1ProfitTargetPct, setSessP1ProfitTargetPct, sessP1MinDays, setSessP1MinDays, sessP1MinDaysEnabled, setSessP1MinDaysEnabled, sessP2DailyLossPct, setSessP2DailyLossPct, sessP2TotalDDPct, setSessP2TotalDDPct, sessP2ProfitTargetPct, setSessP2ProfitTargetPct, sessP2MinDays, setSessP2MinDays, sessP2MinDaysEnabled, setSessP2MinDaysEnabled, sessMaxLotSize, setSessMaxLotSize, sessMaxPosUnit, setSessMaxPosUnit, sessMaxPosEnabled, setSessMaxPosEnabled, sessConsistencyRule, setSessConsistencyRule, sessConsistencyPct, setSessConsistencyPct, sessWeekendHold, setSessWeekendHold, sessTrailingDrawdown, setSessTrailingDrawdown, sessDailyLossEnabled, setSessDailyLossEnabled, sessFutMinDays, setSessFutMinDays, sessFutMinDaysEnabled, setSessFutMinDaysEnabled, sessP1DailyLossAmt, setSessP1DailyLossAmt, sessP1MaxDDAmt, setSessP1MaxDDAmt, sessP1ProfitTargetAmt, setSessP1ProfitTargetAmt, sessP2DailyLossAmt, setSessP2DailyLossAmt, sessP2MaxDDAmt, setSessP2MaxDDAmt, sessP2ProfitTargetAmt, setSessP2ProfitTargetAmt, sessMaxContracts, setSessMaxContracts, sessMaxContractsEnabled, setSessMaxContractsEnabled, sessReplaySpeed, setSessReplaySpeed, sessReplayMode, setSessReplayMode, newSessTimezone, setNewSessTimezone, newSessDST, setNewSessDST, newSessDescription, setNewSessDescription, newSessPlaybook, setNewSessPlaybook, newSessFiles, setNewSessFiles, newSessMarginCall, setNewSessMarginCall, newSessStopOut, setNewSessStopOut, newSessMaxRisk, setNewSessMaxRisk, newSessProtect, setNewSessProtect, newSessNavEnabled, setNewSessNavEnabled, newSessFilePickerOpen, setNewSessFilePickerOpen, newSessOpen, setNewSessOpen, editSessId, setEditSessId, newSessTickers, setNewSessTickers, newSessTickerInput, setNewSessTickerInput, newSessTickerFocus, setNewSessTickerFocus, newSessAssetClass, setNewSessAssetClass, newSessAdvancedOrder, setNewSessAdvancedOrder, newSessRollback, setNewSessRollback, newSessTradingStyle, setNewSessTradingStyle, newSessStratDropOpen, setNewSessStratDropOpen, newSessStratHov, setNewSessStratHov, newSessSymDropOpen, setNewSessSymDropOpen, newSessAssetDropOpen, setNewSessAssetDropOpen, newSessAssetHov, setNewSessAssetHov, newSessMarketOpen, setNewSessMarketOpen, newSessSupportTickers, setNewSessSupportTickers, newSessSupportAssetClass, setNewSessSupportAssetClass, newSessSupportInput, setNewSessSupportInput, newSessSupportFocus, setNewSessSupportFocus, newSessSupportDropOpen, setNewSessSupportDropOpen, newSessInfoHov, setNewSessInfoHov, newSessSupportEnabled, setNewSessSupportEnabled, newSessCalOpen, setNewSessCalOpen, newSessCalTarget, setNewSessCalTarget, newSessCalPos, setNewSessCalPos, newSessCalViewY, setNewSessCalViewY, newSessCalViewM, setNewSessCalViewM, newSessCalMode, setNewSessCalMode, newSessCalYearBase, setNewSessCalYearBase, newSessStartInput, setNewSessStartInput, newSessEndInput, setNewSessEndInput, newSessRandomCount, setNewSessRandomCount, newSessRandRangeVal, setNewSessRandRangeVal, newSessRandRangeUnit, setNewSessRandRangeUnit, newSessActivePreset, setNewSessActivePreset, newSessSymPickerOpen, setNewSessSymPickerOpen, newSessSymPickerSearch, setNewSessSymPickerSearch, newSessSymPickerPos, setNewSessSymPickerPos, newSessSupPickerOpen, setNewSessSupPickerOpen, newSessSupPickerSearch, setNewSessSupPickerSearch, newSessSupPickerPos, setNewSessSupPickerPos, newSessSupPickerCat, setNewSessSupPickerCat, newSessTradingCostsEnabled, setNewSessTradingCostsEnabled, newSessCosts, setNewSessCosts, newSessSymbolSpreads, setNewSessSymbolSpreads, newSessFuturesData, setNewSessFuturesData, stratTab, setStratTab, stratSearch, setStratSearch, stratSort, setStratSort, stratSortDir, setStratSortDir, stratStyleFilter, setStratStyleFilter, stratBuilderOpen, setStratBuilderOpen, stratEditId, setStratEditId, savedCommunityIds, setSavedCommunityIds, myStrategies, setMyStrategies, stratBName, setStratBName, stratBStyle, setStratBStyle, stratBDesc, setStratBDesc, stratBInstruments, setStratBInstruments, stratBInstInput, setStratBInstInput, stratBTimeframes, setStratBTimeframes, stratBTagInput, setStratBTagInput, stratBTags, setStratBTags, stratBComplexity, setStratBComplexity, stratCardHov, setStratCardHov, tool, setTool, hov, setHov, btnPressed, setBtnPressed, dropdown, setDropdown, ddAnchor, setDdAnchor, toolPinned, setToolPinned, dialog, setDialog, dlgTab, setDlgTab, tickCandle, setTickCandle, playing, setPlaying, speed, setSpeed, buySell, setBuySell, orderType, setOrderType, btmTab, setBtmTab, btmIndPos, setBtmIndPos, tblSort, setTblSort, btmTabBarRef, tradeCard, setTradeCard, tradeCardPreTags, setTradeCardPreTags, tradeCardPostTags, setTradeCardPostTags, tradeCardNotes, setTradeCardNotes, tradeActPopup, setTradeActPopup, tapJournal, setTapJournal, tapStrategy, setTapStrategy, tapTags, setTapTags, tapScreenshots, setTapScreenshots, viewingScreenshot, setViewingScreenshot, tapFileSlot, setTapFileSlot, tapTagInput, setTapTagInput, tradeTagOverrides, setTradeTagOverrides, tagEditInput, setTagEditInput, selRow, setSelRow, tagDrop, setTagDrop, tagDropPos, setTagDropPos, btmOpen, setBtmOpen, btmHeight, setBtmHeight, btmResizing, setBtmResizing, btmDragRef, btmPanelRef, tf, setTf, sizeMode, setSizeMode, riskVal, setRiskVal, riskBasis, setRiskBasis, slEnabled, setSlEnabled, entryRows, setEntryRows, entryScrollRef, slPrice, setSlPrice, slRows, setSlRows, slScrollRef, tpRows, setTpRows, tpScrollRef, tagDefs, postTagDefs, tagSels, setTagSels, tagDropOpen, setTagDropOpen, tagsOpen, setTagsOpen, notesText, setNotesText, notesOpen, setNotesOpen, tradeNotes, setTradeNotes, tradeScreenshots, setTradeScreenshots, screenshots, setScreenshots, ssOpen, setSsOpen, replaceTargetId, setReplaceTargetId, fileInputRef, replaceInputRef, tipTimerRef, tipData, setTipData, panelRef, tapFileRef, tcFileRef, tcSsSlot, setTcSsSlot, accountBalance, accountEquity, slAdvMode, setSlAdvMode, slAdvDrop, setSlAdvDrop, slBeUnit, setSlBeUnit, slBeUnitDrop, setSlBeUnitDrop, slBeTrigger, setSlBeTrigger, slBeOffset, setSlBeOffset, slTslUnit, setSlTslUnit, slTslUnitDrop, setSlTslUnitDrop, slTslActivation, setSlTslActivation, slTslTrail, setSlTslTrail, slTslStep, setSlTslStep, logoMenu, setLogoMenu, replayOpts, setReplayOpts, replayMode, setReplayMode, replayInterval, setReplayInterval, rollback, setRollback, rollbackLineX, setRollbackLineX, rbDragging, setRbDragging, rbPressed, setRbPressed, rbPressTimer, gotoOpen, setGotoOpen, gotoItems, setGotoItems, gotoAddType, setGotoAddType, gotoTab, setGotoTab, gotoNewDate, setGotoNewDate, gotoNewTime, setGotoNewTime, gotoNewRepeat, setGotoNewRepeat, gotoNewPrice, setGotoNewPrice, gotoNewName, setGotoNewName, gotoNewColor, setGotoNewColor, gotoCalOpen, setGotoCalOpen, gotoCalPos, setGotoCalPos, gotoTimeOpen, setGotoTimeOpen, gotoTimePos, setGotoTimePos, gotoCalViewY, setGotoCalViewY, gotoCalViewM, setGotoCalViewM, gotoCalMode, setGotoCalMode, gotoCalYearBase, setGotoCalYearBase, gotoDateInput, setGotoDateInput, gotoTimeInput, setGotoTimeInput, gotoPresets, setGotoPresets, ddPos, setDdPos, symbolOpen, setSymbolOpen, symbol, setSymbol, symbolSearch, setSymbolSearch, chartTypeOpen, setChartTypeOpen, chartType, setChartType, chartTypeDropL, setChartTypeDropL, tfOpen, setTfOpen, tfCat, setTfCat, tfPinned, setTfPinned, tfCustomVal, setTfCustomVal, tfEditMode, setTfEditMode, tfDefaults, tfCustomItems, setTfCustomItems, tfSortItems, tfCategories, tfCustomUnit, setTfCustomUnit, tfUnitOpen, setTfUnitOpen, tfIndPos, setTfIndPos, tfBarRef, chartCanvasRef, rollbackLineRef, rollbackOverlayRef, tlBarRef, tlBarDropRef, pinnedBarRef, cpBarAnchorRef, closingDropdownKey, canvasDims, setCanvasDims, settingsOpen, setSettingsOpen, profileOpen, setProfileOpen, profileTab, setProfileTab, profileLang, setProfileLang, profileCat, setProfileCat, profilePos, setProfilePos, profileName, setProfileName, profileAvatar, setProfileAvatar, profileNameEdit, setProfileNameEdit, profilePwOpen, setProfilePwOpen, profileCurPw, setProfileCurPw, profileNewPw, setProfileNewPw, profileConfirmPw, setProfileConfirmPw, darkMode, setDarkMode, faqOpen, setFaqOpen, faqCat, setFaqCat, faqPos, setFaqPos, emojiPanelOpen, setEmojiPanelOpen, emojiPanelPos, setEmojiPanelPos, emojiCat, setEmojiCat, emojiSearch, setEmojiSearch, faqExpand, setFaqExpand, screenshotOpen, setScreenshotOpen, scLinkOpen, setScLinkOpen, scLinkSearch, setScLinkSearch, scLinkedTrade, setScLinkedTrade, scLinkPhase, setScLinkPhase, isFullscreen, setIsFullscreen, pinnedBarOpen, setPinnedBarOpen, pinnedBarPos, setPinnedBarPos, groupSelected, setGroupSelected, tlBarPos, setTlBarPos, tlSettOpen, setTlSettOpen, tlSettPos, setTlSettPos, tlName, setTlName, tlNameEditing, setTlNameEditing, tlSettTab, setTlSettTab, tlLocked, setTlLocked, rrStyle, setRrStyle, rrInputs, setRrInputs, vwapLocked, setVwapLocked, vpLocked, setVpLocked, avLocked, setAvLocked, txtLocked, setTxtLocked, tlStyleDrop, setTlStyleDrop, tlInfoDropUp, setTlInfoDropUp, tlInfoDropAnchor, setTlInfoDropAnchor, tlStyleDropUp, setTlStyleDropUp, tlBarDrop, setTlBarDrop, tlTemplates, setTlTemplates, tlBarDropAnchor, setTlBarDropAnchor, tlLastBarDropRef, tlSaveAsMode, setTlSaveAsMode, tlNewTplName, setTlNewTplName, tlSettTplDrop, setTlSettTplDrop, tlStyle, setTlStyle, txtSettOpen, setTxtSettOpen, txtSettPos, setTxtSettPos, txtSettTab, setTxtSettTab, txtName, setTxtName, txtNameEditing, setTxtNameEditing, txtSizeOpen, setTxtSizeOpen, txtBarSizeOpen, setTxtBarSizeOpen, txtBarDrop, setTxtBarDrop, txtTemplates, setTxtTemplates, txtSaveAsMode, setTxtSaveAsMode, txtNewTplName, setTxtNewTplName, txtStyle, setTxtStyle, vwapSettOpen, setVwapSettOpen, vwapSettPos, setVwapSettPos, vwapSettTab, setVwapSettTab, vwapStyleDrop, setVwapStyleDrop, vwapBarPos, setVwapBarPos, vwapBarDrop, setVwapBarDrop, vwapStyle, setVwapStyle, vpSettOpen, setVpSettOpen, vpSettPos, setVpSettPos, vpSettTab, setVpSettTab, vpStyleDrop, setVpStyleDrop, vpBarPos, setVpBarPos, vpBarDrop, setVpBarDrop, vpStyle, setVpStyle, avSettOpen, setAvSettOpen, avSettPos, setAvSettPos, avSettTab, setAvSettTab, avStyleDrop, setAvStyleDrop, avBarPos, setAvBarPos, avBarDrop, setAvBarDrop, avStyle, setAvStyle, screenshotFlash, setScreenshotFlash, orderPanelOpen, setOrderPanelOpen, opSymOpen, setOpSymOpen, opSymSearch, setOpSymSearch, opSymPos, setOpSymPos, opSizeOpen, setOpSizeOpen, opSizePos, setOpSizePos, opTplOpen, setOpTplOpen, opTplPos, setOpTplPos, activeTemplate, setActiveTemplate, opSaveAsMode, setOpSaveAsMode, opNewTplName, setOpNewTplName, opSavedTemplates, setOpSavedTemplates, opDotsOpen, setOpDotsOpen, opDotsPos, setOpDotsPos, panelDetached, setPanelDetached, detachPos, setDetachPos, detachSize, setDetachSize, panelMode, setPanelMode, isWide, opTemplates, rightPanel, setRightPanel, screenshotPos, setScreenshotPos, layersOpen, setLayersOpen, layersPos, setLayersPos, layersCat, setLayersCat, layersItems, setLayersItems, layersVis, setLayersVis, layersSearch, setLayersSearch, newsOpen, setNewsOpen, newsPos, setNewsPos, newsTab, setNewsTab, newsSearch, setNewsSearch, newsImpact, setNewsImpact, newsSymbolOnly, setNewsSymbolOnly, newsFilterOpen, setNewsFilterOpen, newsFilterClosing, setNewsFilterClosing, newsCntSel, setNewsCntSel, layoutOpen, setLayoutOpen, layoutPos, setLayoutPos, layoutPanels, setLayoutPanels, layoutSync, setLayoutSync, layoutTab, setLayoutTab, settingsTab, setSettingsTab, balVis, setBalVis, sDrop, setSDrop, colorPicker, setColorPicker, cpPos, setCpPos, swHov, setSwHov, settDrop, setSettDrop, settDropPos, setSettDropPos, customTemplates, setCustomTemplates, tplNameInput, setTplNameInput, settHdrTplDrop, setSettHdrTplDrop, settHdrSaveAs, setSettHdrSaveAs, settHdrTplName, setSettHdrTplName, cpH, setCpH, cpS, setCpS, cpV, setCpV, cpA, setCpA, cpHex, setCpHex, cpDragging, setCpDragging, cpDragRect, setCpDragRect, settings, setSettings, indOpen, setIndOpen, indPinned, setIndPinned, indActive, setIndActive, indSelected, setIndSelected, indSearch, setIndSearch, indPos, setIndPos, indCat, setIndCat, indTplOpen, setIndTplOpen, indTplSaveMode, setIndTplSaveMode, indTplName, setIndTplName, indTemplates, setIndTemplates, dragging, setDragging, settingsPos, setSettingsPos, closing, setClosing, animClose, closePopup, closeTlBarDrop, closeTlSett, closeTxtSett, closeVwapSett, closeVpSett, closeAvSett, closeDropdown, closeFontSizeDrop, closeTlInfoDrop, closeTlSettTplDrop, closeCP, c, chromeBr, F, allSymbols, currentSymbol, chartTypeMap, currentChartType, gotoNextId, tlSubTool, tlSubToolRef, txtSubTool, txtSubToolRef, isFibTool, isGannTool, isElliottTool, isPatternTool, isRRTool, rollbackOverlayCallbackRef, catColors, tplWatchKeys, updateSetting, defaultTemplateMap, applyTemplate, saveCustomTemplate, Chk, TlChk, Z, cpW, CP_H, posFromRect, sdPos, openCP, openGotoCP, cpApply, indicatorData, indFiltered, I, B, Sel, MiniIn, toolGroups, actionTools, priceLabels, timeLabels, priceAxisWidth, closeWindows, launchSession, startNewSession, saveNewSession, deleteSession, duplicateSession, openEditSession, closeAll, showTip, hideTip, renderTB, getDdItems, ddItems } = ctx;
  const { sep, lbl, secH, inp, closeNewSess, sessInfoDone, sessSettingsDone, lockedBox, activeBox, goNew, availFiles, instrDefaults, instrRows, autoAsset, dateRangeHint, isValid2, playbookOpts, protectPresets, diamondChk, navPanel } = shared;
  const modalOnly = !!shared.modalOnly;

  return (
          <div style={{position:"fixed",inset:0,zIndex:99998,background:c.bg,fontFamily:F,display:"flex",flexDirection:"column",opacity:sessPageFading?0:1,transition:sessPageFading?"opacity 0.28s ease":"none",visibility:modalOnly?"hidden":"visible"}}>
            {/* Header */}
            <div style={{height:64,flexShrink:0,display:"flex",alignItems:"center",gap:0,background:c.el,boxShadow:"0 2px 18px rgba(0,0,0,0.5)",zIndex:2}}>
              {/* Logo slot — aligns with nav panel */}
              <div style={{width:64,flexShrink:0,height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <img src="/LOGO-07.png" style={{width:52,height:52,objectFit:"contain"}} alt=""/>
              </div>
              {/* Title */}
              <div style={{display:"flex",alignItems:"center",flexShrink:0,padding:"0 12px 0 0"}}>
                <div style={{fontSize:17,fontWeight:700,color:c.tx,letterSpacing:"0.04em",fontFamily:F,marginRight:14}}>Talaria-Log</div>
                <div style={{width:1.5,height:36,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acL}`,marginRight:14}}/>
                <div style={{fontSize:13,fontWeight:700,color:c.ts,letterSpacing:"0.06em",fontFamily:F,position:"relative",top:2}}>Backtesting Sessions</div>
              </div>
              <div style={{flex:1}}/>
              {/* New Session */}
              <div onClick={goNew} style={{display:"flex",alignItems:"center",gap:7,height:36,padding:"0 20px",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:13,fontWeight:800,color:"rgba(255,255,255,0.96)",letterSpacing:"0.08em",boxShadow:"0 2px 10px rgba(38,67,247,0.35)",flexShrink:0,transition:"filter 0.12s",fontFamily:F,marginRight:20}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none"><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                New Session
              </div>
            </div>

            {/* ── Body: left nav + right content ── */}
            <div style={{flex:1,display:"flex",overflow:"hidden"}}>
            {navPanel}
            {/* Right content */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

            {/* Session list — filter row and column headers sticky inside */}
            <div style={{flex:1,overflow:"auto",scrollbarGutter:"stable"}} className="tlr-scroll">
              {/* ── Sessions Dashboard ── */}
              {(()=>{
                // ── Compute stats ──
                const withPnl=sessions.filter(s=>s.pnl!=null);
                const completed=sessions.filter(s=>s.progress===100).length;
                const active=sessions.filter(s=>s.progress>0&&s.progress<100).length;
                const notStarted=sessions.filter(s=>s.progress===0).length;
                const propSess=sessions.filter(s=>s.tradingMode==="prop");
                const stdSess=sessions.filter(s=>s.tradingMode!=="prop");
                const propCompleted=propSess.filter(s=>s.progress===100).length;
                const propActive=propSess.filter(s=>s.progress>0&&s.progress<100).length;
                const stdCompleted=stdSess.filter(s=>s.progress===100).length;
                const stdActive=stdSess.filter(s=>s.progress>0&&s.progress<100).length;
                const totalTrades=sessions.reduce((a,s)=>a+(s.trades||0),0);
                const profSess=withPnl.filter(s=>s.pnl>0).length;
                const profPct=withPnl.length?Math.round(profSess/withPnl.length*100):0;
                const totalDays=sessions.reduce((a,s)=>{
                  if(!s.startDate||!s.endDate)return a;
                  return a+Math.max(0,Math.round((new Date(s.endDate)-new Date(s.startDate))/86400000));
                },0);
                const tickerFreq={};
                sessions.forEach(s=>(s.tickers||[]).forEach(t=>{tickerFreq[t]=(tickerFreq[t]||0)+1;}));
                const uniqueTickers=Object.keys(tickerFreq).length;
                const topTickers=Object.entries(tickerFreq).sort((a,b)=>b[1]-a[1]).slice(0,7);
                const tkMax=topTickers[0]?.[1]||1;
                // ── Profitable arc ──
                const PR=46,PC=2*Math.PI*PR;
                const profLen=(profPct/100)*PC;
                // ── Trades bars ──
                const trBars=[...sessions].sort((a,b)=>(b.trades||0)-(a.trades||0));
                const trMax=trBars[0]?.trades||1;
                // ── Days dots ──
                const dotsN=Math.min(Math.ceil(totalDays/30),56);
                return(
                  <div style={{width:"fit-content",minWidth:1288,margin:"0 auto",padding:"16px 32px 12px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"260px 1fr 185px 165px 200px",gap:8,alignItems:"stretch",width:1288}}>

                      {/* ── TILE 1: Sessions & Mode stacked bars ── */}
                      <div style={{background:c.sf,border:`1px solid ${c.brH}`,overflow:"hidden",position:"relative",padding:"10px 12px",display:"flex",flexDirection:"column"}}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${c.acL},${c.gold})`,opacity:0.6,pointerEvents:"none"}}/>
                        {/* Header row */}
                        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:10}}>
                          <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",color:c.tm,fontFamily:F,textTransform:"uppercase"}}>Sessions & Mode</div>
                          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                            <span style={{fontSize:18,fontWeight:800,color:c.tx,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{sessions.length}</span>
                            <span style={{fontSize:8,color:c.tm,fontFamily:F}}>total</span>
                          </div>
                        </div>
                        {/* Two mode rows */}
                        <div style={{display:"flex",flexDirection:"column",gap:8,flex:1,justifyContent:"center"}}>
                          {[
                            {label:"Standard",count:stdSess.length,done:stdCompleted,act:stdActive,col:c.acL},
                            {label:"Prop Firm",count:propSess.length,done:propCompleted,act:propActive,col:c.gold},
                          ].map(({label,count,done,act,col})=>{
                            const pending=count-done-act;
                            const pct=n=>count?`${(n/count)*100}%`:"0%";
                            return(
                              <div key={label}>
                                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                                  <div style={{width:5,height:5,background:col,flexShrink:0,transform:"rotate(45deg)"}}/>
                                  <span style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F,flex:1}}>{label}</span>
                                  <span style={{fontSize:16,fontWeight:800,color:col,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{count}</span>
                                </div>
                                {/* Stacked bar */}
                                <div style={{height:6,display:"flex",gap:1,overflow:"hidden"}}>
                                  <div style={{width:pct(done),background:c.gn,flexShrink:0,transition:"width 0.3s ease"}}/>
                                  <div style={{width:pct(act),background:c.acL,flexShrink:0,transition:"width 0.3s ease"}}/>
                                  <div style={{width:pct(pending),background:"rgba(255,255,255,0.09)",flexShrink:0,transition:"width 0.3s ease"}}/>
                                </div>
                                <div style={{display:"flex",gap:8,marginTop:3}}>
                                  <span style={{fontSize:8,fontWeight:600,color:c.gn,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{done} done</span>
                                  <span style={{fontSize:8,fontWeight:600,color:c.acL,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{act} active</span>
                                  <span style={{fontSize:8,color:c.tm,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{pending} pending</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── TILE 2: Total Trades bar chart ── */}
                      <div style={{background:c.sf,border:`1px solid ${c.brH}`,overflow:"hidden",position:"relative",padding:"10px 12px",display:"flex",flexDirection:"column"}}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,pointerEvents:"none"}}/>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                          <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",color:c.tm,fontFamily:F,textTransform:"uppercase"}}>Total Trades</div>
                          <div style={{fontSize:18,fontWeight:800,color:c.tx,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{totalTrades.toLocaleString()}</div>
                        </div>
                        <div style={{flex:1}}/>
                        {/* Fixed tooltip */}
                        {hov&&hov.type==="trbar"&&(
                          <div style={{position:"fixed",left:hov.bx,top:hov.by+6,transform:"translateX(-50%)",zIndex:99999,pointerEvents:"none",background:c.el,border:`1px solid ${c.brH}`,boxShadow:"0 8px 24px rgba(0,0,0,0.6)",overflow:"hidden",minWidth:200}}>
                            <div style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:hov.col}}/>
                            <div style={{padding:"8px 12px 8px 16px"}}>
                              {/* Name */}
                              <div style={{fontSize:10,fontWeight:800,color:c.tx,fontFamily:F,marginBottom:6,maxWidth:188,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{hov.sess.name}</div>
                              {/* Divider */}
                              <div style={{height:1,background:c.brH,marginBottom:6}}/>
                              {/* Stats grid */}
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 16px"}}>
                                {[
                                  ["Trades",(hov.sess.trades||0).toLocaleString(),c.tx],
                                  ["Mode",hov.sess.tradingMode==="prop"?"Prop Firm":"Standard",hov.col],
                                  ["Strategy",hov.sess.strategyName||"—",c.ts],
                                  ["Progress",`${hov.sess.progress}%`,c.ts],
                                  ["Starting Balance",`$${(hov.sess.capital||0).toLocaleString()}`,c.ts],
                                  ["Net P&L",hov.sess.pnl!=null?`${hov.sess.pnl>=0?"+":""}$${hov.sess.pnl.toLocaleString()}`:"—",hov.sess.pnl!=null?(hov.sess.pnl>=0?c.gn:c.rd):c.tm],
                                  ["Win Rate",hov.sess.winRate!=null?`${hov.sess.winRate}%`:"—",hov.sess.winRate!=null?(hov.sess.winRate>=50?c.gn:c.rd):c.tm],
                                  ["Avg R:R",hov.sess.avgRR!=null?`1:${hov.sess.avgRR.toFixed(1)}`:"—",c.ts],
                                ].map(([label,val,valCol])=>(
                                  <div key={label} style={{display:"flex",flexDirection:"column",gap:1}}>
                                    <span style={{fontSize:7,color:c.tm,fontFamily:F,letterSpacing:"0.04em"}}>{label}</span>
                                    <span style={{fontSize:9,fontWeight:700,color:valCol,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{val}</span>
                                  </div>
                                ))}
                              </div>
                              {/* Date range */}
                              {(hov.sess.startDate||hov.sess.endDate)&&(
                                <div style={{marginTop:6,paddingTop:5,borderTop:`1px solid ${c.brH}`,fontSize:7.5,color:c.tm,fontFamily:F}}>
                                  {hov.sess.startDate} → {hov.sess.endDate}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {(()=>{
                          const svgW=422,maxH=96,barGap=2;
                          const barsN=trBars.length||1;
                          const barW=Math.max(2,Math.floor((svgW-barGap*(barsN-1))/barsN));
                          const usedW=barsN*barW+barGap*(barsN-1);
                          const ox=Math.floor((svgW-usedW)/2);
                          return(
                            <svg width={svgW} height={maxH} style={{display:"block",flex:"none",marginBottom:2}}>
                              {trBars.map((s,i)=>{
                                const h=s.trades?Math.max(3,Math.round((s.trades/trMax)*maxH)):2;
                                const col=s.tradingMode==="prop"?c.gold:c.acL;
                                const isH=hov&&hov.type==="trbar"&&hov.sess&&hov.sess.id===s.id;
                                return(
                                  <rect key={s.id}
                                    x={ox+i*(barW+barGap)} y={maxH-h} width={barW} height={h}
                                    fill={col}
                                    style={{cursor:"default",transition:"opacity 0.12s,filter 0.12s",filter:isH?"brightness(1.6)":"none",opacity:isH?1:0.82}}
                                    onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setHov({type:"trbar",sess:s,col,bx:r.left+r.width/2,by:r.bottom});}}
                                    onMouseLeave={()=>setHov(null)}/>
                                );
                              })}
                            </svg>
                          );
                        })()}
                        <div style={{display:"flex",gap:12,marginTop:5}}>
                          {[{l:"Standard",col:c.acL},{l:"Prop Firm",col:c.gold}].map(({l,col})=>(
                            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                              <div style={{width:8,height:2,background:col}}/>
                              <span style={{fontSize:8,color:c.tm,fontFamily:F}}>{l}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── TILE 3: Profitable sessions arc gauge ── */}
                      <div style={{background:c.sf,border:`1px solid ${c.brH}`,overflow:"hidden",position:"relative",padding:"10px 12px",display:"flex",flexDirection:"column"}}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${profPct>=50?c.gn:c.rd},transparent)`,pointerEvents:"none"}}/>
                        <div style={{display:"flex",alignItems:"flex-end",marginBottom:6,minHeight:22}}>
                          <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",color:c.tm,fontFamily:F,textTransform:"uppercase"}}>Profitable Sessions</div>
                        </div>
                        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <svg width={90} height={90} viewBox="0 0 120 120">
                            {withPnl.length===0&&<circle cx={60} cy={60} r={PR} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10}/>}
                            {withPnl.length>0&&<circle cx={60} cy={60} r={PR} fill="none"
                              stroke={c.rd} strokeWidth={10}
                              strokeDasharray={`${PC-profLen} ${PC}`}
                              transform={`rotate(${-90+profPct/100*360},60,60)`}
                              strokeLinecap="butt"/>}
                            {withPnl.length>0&&<circle cx={60} cy={60} r={PR} fill="none"
                              stroke={c.gn} strokeWidth={10}
                              strokeDasharray={`${profLen} ${PC}`}
                              transform="rotate(-90,60,60)"
                              strokeLinecap="butt"/>}
                            <text x={60} y={55} textAnchor="middle" style={{fontSize:22,fontWeight:800,fill:profPct>=50?c.gn:c.rd,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{profPct}%</text>
                            <text x={60} y={70} textAnchor="middle" style={{fontSize:8,fontWeight:600,fill:c.tm,fontFamily:F,letterSpacing:"0.06em"}}>PROFITABLE</text>
                          </svg>
                        </div>
                        <div style={{display:"flex",gap:14,marginTop:2,justifyContent:"center"}}>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <div style={{width:6,height:6,background:c.gn,transform:"rotate(45deg)"}}/>
                            <span style={{fontSize:9,fontWeight:700,color:c.gn,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{profSess}</span>
                            <span style={{fontSize:8,color:c.gn,fontFamily:F}}>profitable</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <div style={{width:6,height:6,background:c.rd,transform:"rotate(45deg)"}}/>
                            <span style={{fontSize:9,fontWeight:700,color:c.rd,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{withPnl.length-profSess}</span>
                            <span style={{fontSize:8,color:c.rd,fontFamily:F}}>unprofitable</span>
                          </div>
                        </div>
                      </div>

                      {/* ── TILE 4: Total Days Tested dot grid ── */}
                      <div style={{background:c.sf,border:`1px solid ${c.brH}`,overflow:"hidden",position:"relative",padding:"10px 12px",display:"flex",flexDirection:"column"}}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,pointerEvents:"none"}}/>
                        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:4}}>
                          <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",color:c.tm,fontFamily:F,textTransform:"uppercase"}}>Days Tested</div>
                          <div style={{fontSize:18,fontWeight:800,color:c.tx,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{totalDays.toLocaleString()}</div>
                        </div>
                        <div style={{fontSize:8,color:c.tm,fontFamily:F}}>{(totalDays/365).toFixed(1)} yrs equivalent</div>
                        <div style={{flex:1}}/>
                        {(()=>{
                          const dcols=20,ds=5,dg=2,step=ds+dg;
                          const rows=Math.ceil(dotsN/dcols);
                          const svgW=dcols*step-dg, svgH=rows*step-dg;
                          return(
                            <svg width={svgW} height={svgH} style={{display:"block",margin:"0 auto 64px"}}>
                              {Array.from({length:dotsN}).map((_,i)=>(
                                <rect key={i} x={(i%dcols)*step} y={Math.floor(i/dcols)*step}
                                  width={ds} height={ds} fill={c.acL} opacity={0.75}/>
                              ))}
                            </svg>
                          );
                        })()}
                        <div style={{fontSize:8,color:c.tm,fontFamily:F,marginTop:4}}>each square ≈ 1 month</div>
                      </div>

                      {/* ── TILE 5: Tickers Tested ── */}
                      <div style={{background:c.sf,border:`1px solid ${c.brH}`,overflow:"hidden",position:"relative",padding:"10px 12px",display:"flex",flexDirection:"column"}}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,pointerEvents:"none"}}/>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                          <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",color:c.tm,fontFamily:F,textTransform:"uppercase"}}>Tickers Tested</div>
                          <div style={{fontSize:18,fontWeight:800,color:c.tx,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{uniqueTickers}</div>
                        </div>
                        <div style={{flex:1,display:"flex",flexDirection:"column",gap:3,justifyContent:"center"}}>
                          {topTickers.map(([ticker,count])=>(
                            <div key={ticker} style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:8,fontWeight:700,color:c.ts,fontFamily:F,width:52,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{ticker}</span>
                              <div style={{flex:1,height:4,background:"rgba(255,255,255,0.07)",position:"relative",overflow:"hidden"}}>
                                <div style={{position:"absolute",inset:0,right:`${100-(count/tkMax)*100}%`,background:`linear-gradient(90deg,${c.acL}88,${c.acL})`,transition:"right 0.3s ease"}}/>
                              </div>
                              <span style={{fontSize:8,color:c.tm,fontFamily:F,width:16,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{count}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{fontSize:8,color:c.tm,fontFamily:F,marginTop:4}}>top {topTickers.length} by sessions used in</div>
                      </div>


                    </div>
                  </div>
                );
              })()}
              <div style={{position:"sticky",top:0,zIndex:5,background:c.bg,padding:"0 32px",width:"fit-content",minWidth:1288,margin:"0 auto",display:"flex",alignItems:"flex-end",height:40,gap:5}}>
                <div style={{position:"absolute",bottom:0,left:32,right:32,height:1,background:c.brH,pointerEvents:"none"}}/>
                {(()=>{
                  const getCount=v=>v==="all"?sessions.length:sessions.filter(s=>v==="not-started"?s.progress===0:v==="active"?(s.progress>0&&s.progress<100):v==="completed"?s.progress===100:v==="standard"?s.tradingMode!=="prop":v==="prop"?s.tradingMode==="prop":true).length;
                  return[["all","All"],["not-started","Not Started"],["active","Active"],["completed","Completed"],["standard","Standard"],["prop","Prop Firm"]].map(([v,l])=>{
                    const isA=sessFilter===v;
                    const isPropTab=v==="prop";
                    const tabCol=isA?(isPropTab?c.gold:c.acL):c.ts;
                    const tabBg=isA?(isPropTab?"rgba(201,168,76,0.10)":c.acD):"transparent";
                    const badgeBg=isA?(isPropTab?"rgba(201,168,76,0.18)":"rgba(74,106,255,0.2)"):"rgba(255,255,255,0.07)";
                    return(
                      <div key={v} onClick={()=>setSessFilter(v)}
                        style={{position:"relative",height:26,display:"flex",alignItems:"center",gap:5,padding:"0 12px",cursor:"default",
                          color:tabCol,background:tabBg,
                          fontSize:9,fontWeight:800,letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:F,
                          transition:"background 0.12s, color 0.12s",flexShrink:0}}
                        onMouseEnter={e=>{if(!isA){e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color=c.tx;}}}
                        onMouseLeave={e=>{if(!isA){e.currentTarget.style.background="transparent";e.currentTarget.style.color=c.ts;}}}>
                        {l}
                        <span style={{fontSize:8,fontWeight:700,background:badgeBg,color:tabCol,padding:"1px 5px",transition:"all 0.12s"}}>{getCount(v)}</span>
                        {isA&&<div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:1.5,background:`linear-gradient(90deg,transparent,${isPropTab?c.gold:c.acL},transparent)`,boxShadow:isPropTab?`0 0 4px ${c.gold}88`:undefined}}/>}
                      </div>
                    );
                  });
                })()}
                {/* Layout controls + Search — right side of category row */}
                <div style={{marginLeft:"auto",alignSelf:"center",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  {/* Sort button — cards mode only, LEFT of toggles */}
                  {sessLayoutMode==="cards"&&(()=>{
                    const sortOpts=[["name","Name"],["strategy","Strategy"],["date","Date Range"],["capital","Balance"],["pnl","Net P&L"],["winRate","Win Rate"],["avgRR","Avg R:R"],["trades","Trades"],["progress","Progress"]];
                    const activeLabel=sessSortBy?(sortOpts.find(([k])=>k===sessSortBy)||["",""])[1]:"Recent";
                    const isBH=hov==="cardSortBtn";
                    return(
                      <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                        <div onClick={()=>setCardSortOpen(v=>!v)}
                          onMouseEnter={()=>setHov("cardSortBtn")} onMouseLeave={()=>setHov(null)}
                          style={{height:28,padding:"0 8px",display:"flex",alignItems:"center",gap:5,position:"relative",cursor:"default",
                            background:cardSortOpen?"rgba(74,106,255,0.08)":isBH?"rgba(255,255,255,0.05)":"transparent",
                            color:cardSortOpen?c.acL:isBH?c.tx:c.ts,
                            fontSize:9,fontWeight:700,fontFamily:F,transition:"background 0.12s,color 0.12s",whiteSpace:"nowrap"}}>
                          <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><line x1="1" y1="3" x2="11" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="5" y1="9" x2="7" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          {activeLabel}
                          <svg width={6} height={6} viewBox="0 0 8 8" style={{opacity:0.55,flexShrink:0}}><polygon points={cardSortOpen?"4,1 7,6 1,6":"4,7 7,2 1,2"} fill="currentColor"/></svg>
                          {cardSortOpen&&<div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:"70%",height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acL}`,pointerEvents:"none"}}/>}
                          {!cardSortOpen&&isBH&&<div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:"50%",height:1,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)`,pointerEvents:"none"}}/>}
                        </div>
                        {cardSortOpen&&(
                          <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,background:c.sf,border:`1px solid rgba(140,160,255,0.22)`,boxShadow:"0 4px 16px rgba(0,0,0,0.5)",zIndex:300,minWidth:148,overflow:"hidden"}}>
                            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                            {sortOpts.map(([key,label])=>{
                              const isAct=sessSortBy===key;
                              const isIH=hov==="csort_"+key;
                              return(
                                <div key={key}
                                  onMouseEnter={()=>setHov("csort_"+key)} onMouseLeave={()=>setHov(null)}
                                  onClick={()=>{if(sessSortBy===key){setSessSortDir(d=>d==="asc"?"desc":"asc");}else{setSessSortBy(key);setSessSortDir("asc");}setCardSortOpen(false);}}
                                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 12px",cursor:"default",position:"relative",
                                    background:isAct?c.acD:isIH?"rgba(255,255,255,0.03)":"transparent",
                                    transition:"background 0.1s"}}>
                                  {isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acL}`}}/>}
                                  <span style={{fontSize:9,fontWeight:isAct?700:500,color:isAct?c.acL:isIH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                  {isAct&&(sessSortDir==="asc"
                                    ?<svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,0 7,7 0,7" fill={c.acL}/></svg>
                                    :<svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,7 7,0 0,0" fill={c.acL}/></svg>)}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* Card / Row toggle buttons — canonical no-border style, gap:4 */}
                  <div style={{display:"flex",gap:4}}>
                    {[
                      {mode:"cards", icon:(
                        <svg width={13} height={13} viewBox="0 0 14 14" fill="none">
                          <rect x="0" y="0" width="6" height="6" rx="0.5" fill="currentColor"/>
                          <rect x="8" y="0" width="6" height="6" rx="0.5" fill="currentColor"/>
                          <rect x="0" y="8" width="6" height="6" rx="0.5" fill="currentColor"/>
                          <rect x="8" y="8" width="6" height="6" rx="0.5" fill="currentColor"/>
                        </svg>
                      )},
                      {mode:"rows", icon:(
                        <svg width={13} height={13} viewBox="0 0 14 14" fill="none">
                          <rect x="0" y="0" width="14" height="3" rx="0.5" fill="currentColor"/>
                          <rect x="0" y="5" width="14" height="3" rx="0.5" fill="currentColor"/>
                          <rect x="0" y="10" width="14" height="3" rx="0.5" fill="currentColor"/>
                        </svg>
                      )},
                    ].map(({mode,icon})=>{
                      const isA=sessLayoutMode===mode;
                      const isH=hov==="lm_"+mode;
                      return(
                        <div key={mode}
                          onClick={()=>{setSessLayoutMode(mode);setCardSortOpen(false);}}
                          onMouseEnter={()=>setHov("lm_"+mode)} onMouseLeave={()=>setHov(null)}
                          style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",cursor:"default",
                            background:isA?"rgba(74,106,255,0.08)":isH?"rgba(255,255,255,0.05)":"transparent",
                            color:isA?c.acL:isH?c.tx:c.ts,transition:"background 0.12s,color 0.12s"}}>
                          {icon}
                          {isA&&<div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:"70%",height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acL}`,pointerEvents:"none"}}/>}
                          {!isA&&isH&&<div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:"50%",height:1,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)`,pointerEvents:"none"}}/>}
                        </div>
                      );
                    })}
                  </div>
                  {/* Search field */}
                  <div style={{display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${c.brH}`,padding:"0 10px",width:200,height:26,boxSizing:"border-box"}}>
                    <I n="search" s={11} cl={c.tm}/>
                    <input value={sessSearchQ} onChange={e=>setSessSearchQ(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Escape")setSessSearchQ("");}}
                      placeholder="Search…"
                      style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0}}/>
                    {sessSearchQ&&<div onClick={()=>setSessSearchQ("")} style={{cursor:"default",fontSize:14,color:c.tm,lineHeight:1,flexShrink:0}}>×</div>}
                  </div>
                </div>
              </div>
              {/* Sticky column headers */}
              {sessions.length>0&&sessLayoutMode==="rows"&&(
                <div style={{position:"sticky",top:40,zIndex:4,background:c.bg,padding:"0 32px",width:"fit-content",minWidth:1288,margin:"0 auto",display:"flex",alignItems:"center",height:26}}>
                  <div style={{position:"absolute",bottom:0,left:32,right:32,height:1,background:c.brH,pointerEvents:"none"}}/>
                  <div style={{width:96,flexShrink:0}}></div>
                  {[["Session",110,"name"],["Strategy",100,"strategy"],["Mode",74,"mode"],["Asset",90,"asset"],["Symbols",120,"symbol"],["Date Range",134,"date"],["Options",102,null],["Starting Bal.",88,"capital"],["Net P&L",80,"pnl"],["Win %",60,"winRate"],["Avg R:R",62,"avgRR"],["Trades",56,"trades"],["Progress",66,"progress"],["",50,null]].map(([label,w,sk])=>{
                    const isActive=sk&&sessSortBy===sk;
                    const isHov=hov===("ch_"+label);
                    return(
                      <div key={label||"_act"} onClick={sk?()=>{if(sessSortBy===sk){if(sessSortDir==="asc")setSessSortDir("desc");else{setSessSortBy(null);setSessSortDir("asc");}}else{setSessSortBy(sk);setSessSortDir("asc");}}:undefined}
                        onMouseEnter={()=>{if(sk)setHov("ch_"+label);}}
                        onMouseLeave={()=>{if(sk)setHov(null);}}
                        style={{width:w,flexShrink:0,fontSize:8,fontWeight:800,color:isActive?c.acL:isHov?c.ts:c.tm,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap",fontFamily:F,textAlign:"center",cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",gap:3,userSelect:"none",transition:"color 0.12s",background:isHov&&!isActive?"rgba(255,255,255,0.04)":"transparent"}}>
                        {label}
                        {sk&&(isActive?(
                          sessSortDir==="asc"
                            ?<svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,0 7,7 0,7" fill="currentColor"/></svg>
                            :<svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,7 7,0 0,0" fill="currentColor"/></svg>
                        ):(
                          isHov&&<svg width={7} height={10} viewBox="0 0 7 10"><polygon points="3.5,0 7,4 0,4" fill="currentColor" opacity={0.7}/><polygon points="3.5,10 7,6 0,6" fill="currentColor" opacity={0.7}/></svg>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{padding:"0 32px 24px"}}>
              {sessions.length===0?(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh",textAlign:"center"}}>
                  <svg width={56} height={56} viewBox="0 0 24 24" fill="none" style={{marginBottom:18,color:c.tm,opacity:0.5}}><rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><line x1="7" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="7" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="7" y1="16" x2="15" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  <div style={{fontSize:16,fontWeight:700,color:c.ts,marginBottom:8}}>No saved sessions yet</div>
                  <div style={{fontSize:13,color:c.tm,marginBottom:24}}>Create your first backtesting session to get started</div>
                  <div onClick={goNew} style={{display:"flex",alignItems:"center",gap:8,height:38,padding:"0 22px",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:12,fontWeight:800,color:"rgba(255,255,255,0.96)",letterSpacing:"0.08em",boxShadow:"0 4px 18px rgba(38,67,247,0.4)",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%)"}}>
                    <span style={{fontSize:17,lineHeight:1}}>+</span> Create New Session
                  </div>
                </div>
              ):sessLayoutMode==="cards"?(()=>{
                const _applyFilter=(s)=>{if(sessFilter==="not-started")return s.progress===0;if(sessFilter==="active")return s.progress>0&&s.progress<100;if(sessFilter==="completed")return s.progress===100;if(sessFilter==="standard")return s.tradingMode!=="prop";if(sessFilter==="prop")return s.tradingMode==="prop";return true;};
                const _fss=[...sessions].filter(s=>{if(!sessSearchQ)return true;const q=sessSearchQ.toLowerCase();return s.name.toLowerCase().includes(q)||(s.strategyName||"").toLowerCase().includes(q)||(s.tickers||[]).some(t=>t.toLowerCase().includes(q));}).filter(_applyFilter).sort((a,b)=>{if(!sessSortBy)return new Date(b.createdAt||0)-new Date(a.createdAt||0);const dir=sessSortDir==="asc"?1:-1;let cmp=0;if(sessSortBy==="name")cmp=a.name.localeCompare(b.name);else if(sessSortBy==="strategy")cmp=(a.strategyName||"").localeCompare(b.strategyName||"");else if(sessSortBy==="mode")cmp=(a.tradingMode||"").localeCompare(b.tradingMode||"");else if(sessSortBy==="asset")cmp=((a.assetClasses||[])[0]||"").localeCompare((b.assetClasses||[])[0]||"");else if(sessSortBy==="symbol")cmp=(a.tickers?.[0]||"").localeCompare(b.tickers?.[0]||"");else if(sessSortBy==="date")cmp=new Date(a.startDate||0)-new Date(b.startDate||0);else if(sessSortBy==="capital")cmp=(a.capital||0)-(b.capital||0);else if(sessSortBy==="pnl")cmp=(a.pnl??-Infinity)-(b.pnl??-Infinity);else if(sessSortBy==="winRate")cmp=(a.winRate??-1)-(b.winRate??-1);else if(sessSortBy==="avgRR")cmp=(a.avgRR??-1)-(b.avgRR??-1);else if(sessSortBy==="trades")cmp=(a.trades||0)-(b.trades||0);else if(sessSortBy==="progress")cmp=(a.progress||0)-(b.progress||0);return cmp*dir;});
                return(
                <div style={{width:1288,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,padding:"4px 0 24px"}}>
                  {_fss.map(sess=>{
                    const isH=sessHov===sess.id;
                    const isProp=sess.tradingMode==="prop";
                    const hasPnl=sess.pnl!=null;
                    const pnlPos=hasPnl&&sess.pnl>=0;
                    const stripeCol=isProp?c.gold:c.acL;
                    const createdStr=sess.createdAt?new Date(sess.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
                    const progress=sess.progress??0;
                    const pnlCol=hasPnl?(pnlPos?c.gn:c.rd):c.tm;
                    const pnlVal=hasPnl?`${pnlPos?"+":""}$${sess.pnl.toLocaleString()}`:"—";
                    const optLines=[{label:"Rollback",on:!!sess.rollbackAllowed},{label:"Costs",on:!!(sess.commission&&sess.commission!=="None")}];
                    return(
                      <div key={sess.id}
                        onMouseEnter={()=>setSessHov(sess.id)} onMouseLeave={()=>setSessHov(null)}
                        onClick={e=>{const btn=e.currentTarget.querySelector(".sess-act-btn");if(btn){const r=btn.getBoundingClientRect();setSessActMenu(sessActMenu?.id===sess.id?null:{id:sess.id,x:(r.left+r.right)/2/Z,y:r.bottom/Z});}else{const r=e.currentTarget.getBoundingClientRect();setSessActMenu(sessActMenu?.id===sess.id?null:{id:sess.id,x:r.right/Z-20,y:r.bottom/Z});}}}
                        style={{borderTop:`3px solid ${stripeCol}`,borderRight:`1px solid ${isH?(isProp?"rgba(201,168,76,0.35)":c.acB):c.brH}`,borderBottom:`1px solid ${isH?(isProp?"rgba(201,168,76,0.35)":c.acB):c.brH}`,borderLeft:`1px solid ${isH?(isProp?"rgba(201,168,76,0.35)":c.acB):c.brH}`,background:c.sf,cursor:"default",transition:"box-shadow 0.15s,border-color 0.15s",boxShadow:isH?(isProp?`0 0 0 1px rgba(201,168,76,0.2),0 4px 24px rgba(0,0,0,0.6),0 0 18px rgba(201,168,76,0.12)`:`0 0 0 1px ${c.acB},0 4px 24px rgba(0,0,0,0.6),0 0 18px rgba(38,67,247,0.15)`):"0 3px 12px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

                        {/* Row 1: Resume + Dashboard buttons | session name + created | ⋯ */}
                        <div style={{display:"flex",alignItems:"center",gap:0,padding:"10px 10px 0",borderBottom:`1px solid ${c.brH}`,paddingBottom:8}}>
                          {/* Resume */}
                          <div onClick={e=>{e.stopPropagation();launchSession();}}
                            onMouseEnter={()=>setHov("rs_"+sess.id)} onMouseLeave={()=>setHov(null)}
                            style={{width:26,height:26,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",transition:"filter 0.12s",filter:hov==="rs_"+sess.id?"brightness(1.2)":"brightness(1)",boxShadow:"0 2px 8px rgba(38,67,247,0.35)"}}>
                            <svg width={9} height={9} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="rgba(255,255,255,0.95)"/></svg>
                          </div>
                          {/* Dashboard */}
                          <div onClick={e=>{e.stopPropagation();setDashSessId(sess.id);setSessView("dashboard");}}
                            onMouseEnter={()=>setHov("db_"+sess.id)} onMouseLeave={()=>setHov(null)}
                            style={{width:26,height:26,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:hov==="db_"+sess.id?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.07)",border:`1px solid ${hov==="db_"+sess.id?c.brH:c.br}`,cursor:"default",transition:"background 0.12s,border-color 0.12s",marginLeft:5}}>
                            <svg width={11} height={11} viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" fill={hov==="db_"+sess.id?c.tx:c.ts}/><rect x="11" y="1" width="8" height="8" fill={hov==="db_"+sess.id?c.tx:c.ts}/><rect x="1" y="11" width="8" height="8" fill={hov==="db_"+sess.id?c.tx:c.ts}/><rect x="11" y="11" width="8" height="8" fill={hov==="db_"+sess.id?c.tx:c.ts}/></svg>
                          </div>
                          {/* Session name + created */}
                          <div style={{flex:1,minWidth:0,padding:"0 8px",display:"flex",flexDirection:"column",gap:2}}>
                            <div style={{fontSize:(sess.name||"").length>22?9:(sess.name||"").length>15?10:11,fontWeight:700,color:c.ts,lineHeight:1.3,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sess.name||"—"}</div>
                            <div style={{fontSize:8,fontWeight:500,color:c.tm,fontFamily:F,whiteSpace:"nowrap"}}>{createdStr}</div>
                          </div>
                          {/* ⋯ */}
                          <div className="sess-act-btn" onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSessActMenu(sessActMenu?.id===sess.id?null:{id:sess.id,x:(r.left+r.right)/2/Z,y:r.bottom/Z});}}
                            style={{width:28,height:28,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:sessActMenu?.id===sess.id?c.acL:c.ts,background:sessActMenu?.id===sess.id?"rgba(255,255,255,0.08)":"transparent",transition:"all 0.12s"}}
                            onMouseEnter={e=>{if(sessActMenu?.id!==sess.id){e.currentTarget.style.color=c.tx;e.currentTarget.style.background="rgba(255,255,255,0.08)";}}}
                            onMouseLeave={e=>{if(sessActMenu?.id!==sess.id){e.currentTarget.style.color=c.ts;e.currentTarget.style.background="transparent";}}}>
                            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>
                          </div>
                        </div>

                        {/* Row 2: Strategy name + info btn */}
                        <div style={{padding:"7px 10px",display:"flex",alignItems:"center",gap:5,borderBottom:`1px solid ${c.brH}`}}>
                          <div style={{fontSize:(sess.strategyName||"").length>22?10:(sess.strategyName||"").length>15?11:12,fontWeight:600,color:c.ts,lineHeight:1.3,fontFamily:F,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sess.strategyName||"—"}</div>
                          {sess.strategyDesc&&(
                            <div onClick={e=>e.stopPropagation()}
                              onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setHov("info_"+sess.id);setStratPopup({id:sess.id,x:r.right/Z+6,y:r.top/Z,desc:sess.strategyDesc,name:sess.strategyName});}}
                              onMouseLeave={()=>{setHov(null);setStratPopup(null);}}
                              style={{width:14,height:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:hov===("info_"+sess.id)?c.acL:c.ts,transition:"color 0.12s"}}>
                              <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/><line x1="8" y1="7" x2="8" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="5" r="0.8" fill="currentColor"/></svg>
                            </div>
                          )}
                        </div>

                        {/* Row 3: Mode | Asset | Symbols */}
                        <div style={{padding:"7px 10px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${c.brH}`}}>
                          <div style={{fontSize:10,fontWeight:700,color:isProp?c.gold:c.acL,fontFamily:F,flexShrink:0}}>{isProp?"Prop Firm":"Standard"}</div>
                          <div style={{width:1,height:12,background:c.brH,flexShrink:0}}/>
                          <div style={{fontSize:10,fontWeight:600,color:c.ts,fontFamily:F,flexShrink:0}}>{(sess.assetClasses||[])[0]||"—"}</div>
                          <div style={{width:1,height:12,background:c.brH,flexShrink:0}}/>
                          {/* Symbols — same 2-col grid */}
                          <div style={{flex:1,overflow:"hidden"}}>
                            {(sess.tickers||[]).length===0?(
                              <span style={{fontSize:9,color:c.tm,fontFamily:F}}>—</span>
                            ):(
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1px 4px"}}>
                                {sess.tickers.map((t,i)=>(
                                  <span key={i} style={{fontSize:9,fontWeight:600,color:c.ts,letterSpacing:"0.04em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F,lineHeight:1.5}}>{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Row 4: Date range mini timeline */}
                        <div style={{padding:"7px 10px",borderBottom:`1px solid ${c.brH}`}}>
                          {sess.startDate&&sess.endDate?(()=>{
                            const parse=d=>{const[y,mo,day]=d.split("-");return{y,mo:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+mo-1],day:Number(day)};};
                            const sd=parse(sess.startDate),ed=parse(sess.endDate);
                            const durMs=new Date(sess.endDate)-new Date(sess.startDate);
                            const durMo=Math.round(durMs/1000/60/60/24/30.44);
                            const durLabel=durMo>=12?`${Math.round(durMo/12)}y`:`${durMo}mo`;
                            return(
                              <div style={{display:"flex",flexDirection:"column",gap:3,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>
                                <div style={{display:"flex",justifyContent:"space-between"}}>
                                  <span style={{fontSize:10,fontWeight:700,color:c.ts}}>{sd.mo} {sd.day}</span>
                                  <span style={{fontSize:10,fontWeight:700,color:c.ts}}>{ed.mo} {ed.day}</span>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:9,fontWeight:600,color:c.tm}}>{sd.y}</span>
                                  <div style={{flex:1,position:"relative",height:1,background:`linear-gradient(90deg,${c.tm},${c.acL},${c.tm})`}}>
                                    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:c.bg,padding:"0 4px",fontSize:12,fontWeight:800,color:c.acL,letterSpacing:"0.04em",lineHeight:1.2,whiteSpace:"nowrap"}}>{durLabel}</div>
                                  </div>
                                  <span style={{fontSize:9,fontWeight:600,color:c.tm}}>{ed.y}</span>
                                </div>
                              </div>
                            );
                          })():(
                            <span style={{fontSize:9,color:c.tm,fontFamily:F}}>—</span>
                          )}
                        </div>

                        {/* Row 5: Options (Rollback + Costs) */}
                        <div style={{padding:"6px 10px",display:"flex",alignItems:"center",gap:14,borderBottom:`1px solid ${c.brH}`}}>
                          {optLines.map(({label,on},i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:5,fontFamily:F}}>
                              <div style={{width:5,height:5,borderRadius:"50%",background:on?c.gn:c.rd,flexShrink:0,boxShadow:on?`0 0 4px ${c.gn}88`:`0 0 4px ${c.rd}88`}}/>
                              <div style={{fontSize:10,fontWeight:600,color:on?c.gn:c.rd,whiteSpace:"nowrap"}}>{label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Row 6: Stats — Starting Bal | Net P&L | Win % | Avg R:R | Trades */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",borderBottom:`1px solid ${c.brH}`}}>
                          {[
                            ["Bal.",`$${(sess.capital||0).toLocaleString()}`,c.ts],
                            ["P&L",pnlVal,pnlCol],
                            ["Win%",sess.winRate!=null?`${sess.winRate}%`:"—",sess.winRate!=null?(sess.winRate>=50?c.gn:c.rd):c.tm],
                            ["R:R",sess.avgRR!=null?`1:${sess.avgRR.toFixed(1)}`:"—",c.ts],
                            ["Trades",sess.trades!=null?String(sess.trades):"—",c.ts],
                          ].map(([l,v,col],i)=>(
                            <div key={l} style={{padding:"6px 6px",display:"flex",flexDirection:"column",gap:2,borderRight:i<4?`1px solid ${c.brH}`:"none",alignItems:"center"}}>
                              <div style={{fontSize:7,fontWeight:700,color:c.tm,textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:F}}>{l}</div>
                              <div style={{fontSize:10,fontWeight:800,color:col,fontVariantNumeric:"tabular-nums",fontFamily:F,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{v}</div>
                            </div>
                          ))}
                        </div>

                        {/* Row 7: Progress */}
                        <div style={{padding:"6px 10px 8px",display:"flex",alignItems:"center",gap:8}}>
                          <div style={{flex:1,height:2,background:"rgba(255,255,255,0.07)",overflow:"hidden"}}>
                            <div style={{width:`${Math.min(progress,100)}%`,height:"100%",background:progress>=100?(isProp?(pnlPos?c.gn:c.rd):c.gn):c.acL,transition:"width 0.3s ease"}}/>
                          </div>
                          <span style={{fontSize:10,fontWeight:800,color:progress>=100?(isProp?(pnlPos?c.gn:c.rd):c.gn):progress>0?c.acL:c.tm,fontVariantNumeric:"tabular-nums",fontFamily:F,flexShrink:0}}>{progress>=100?(isProp?(pnlPos?"Passed":"Lost"):"Done"):`${progress}%`}</span>
                        </div>

                      </div>
                    );
                  })}
                </div>
                );
              })():(
              <div style={{width:"fit-content",margin:"0 auto",display:"flex",flexDirection:"column"}}>
              {[...sessions].filter(s=>{if(!sessSearchQ)return true;const q=sessSearchQ.toLowerCase();return s.name.toLowerCase().includes(q)||(s.strategyName||"").toLowerCase().includes(q)||(s.tickers||[]).some(t=>t.toLowerCase().includes(q));}).filter(s=>{if(sessFilter==="not-started")return s.progress===0;if(sessFilter==="active")return s.progress>0&&s.progress<100;if(sessFilter==="completed")return s.progress===100;if(sessFilter==="standard")return s.tradingMode!=="prop";if(sessFilter==="prop")return s.tradingMode==="prop";return true;}).sort((a,b)=>{
                  if(!sessSortBy) return new Date(b.createdAt||0)-new Date(a.createdAt||0);
                  const dir=sessSortDir==="asc"?1:-1;
                  let cmp=0;
                  if(sessSortBy==="name")cmp=a.name.localeCompare(b.name);
                  else if(sessSortBy==="strategy")cmp=(a.strategyName||"").localeCompare(b.strategyName||"");
                  else if(sessSortBy==="mode")cmp=(a.tradingMode||"").localeCompare(b.tradingMode||"");
                  else if(sessSortBy==="asset")cmp=((a.assetClasses||[])[0]||"").localeCompare((b.assetClasses||[])[0]||"");
                  else if(sessSortBy==="symbol")cmp=(a.tickers?.[0]||"").localeCompare(b.tickers?.[0]||"");
                  else if(sessSortBy==="date")cmp=new Date(a.startDate||0)-new Date(b.startDate||0);
                  else if(sessSortBy==="capital")cmp=(a.capital||0)-(b.capital||0);
                  else if(sessSortBy==="pnl")cmp=(a.pnl??-Infinity)-(b.pnl??-Infinity);
                  else if(sessSortBy==="winRate")cmp=(a.winRate??-1)-(b.winRate??-1);
                  else if(sessSortBy==="avgRR")cmp=(a.avgRR??-1)-(b.avgRR??-1);
                  else if(sessSortBy==="trades")cmp=(a.trades||0)-(b.trades||0);
                  else if(sessSortBy==="progress")cmp=(a.progress||0)-(b.progress||0);
                  return cmp*dir;
                }).map((sess,idx,arr)=>{
                  const isH=sessHov===sess.id;
                  const isProp=sess.tradingMode==="prop";
                  const hasPnl=sess.pnl!=null;
                  const pnlPos=hasPnl&&sess.pnl>=0;
                  const stripeCol=isProp?c.gold:c.acL;
                  const createdStr=sess.createdAt?new Date(sess.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
                  const progress=sess.progress??0;
                  const hasStarted=progress>0;
                  const pnlCol=hasPnl?(pnlPos?c.gn:c.rd):c.tm;
                  const fmtD=d=>{if(!d)return"—";const[y,mo,day]=d.split("-");return["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+mo-1]+" "+Number(day)+", "+y;};
                  const pnlVal=hasPnl?`${pnlPos?"+":""}$${sess.pnl.toLocaleString()}`:"—";
                  const colCell=(label,val,w,valCol=c.ts)=>(
                    <div style={{width:w,flexShrink:0,padding:"0 10px",display:"flex",alignItems:"center",justifyContent:"center",borderRight:"none",overflow:"hidden"}}>
                      <div style={{fontSize:10,fontWeight:700,color:valCol,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontVariantNumeric:"tabular-nums",fontFamily:F,textAlign:"center"}}>{val}</div>
                    </div>
                  );
                  const optLines=[
                    {label:"Rollback", on:!!sess.rollbackAllowed},
                    {label:"Costs", on:!!(sess.commission&&sess.commission!=="None")},
                  ];
                  return(
                    <React.Fragment key={sess.id}>
                    <div onMouseEnter={()=>setSessHov(sess.id)} onMouseLeave={()=>setSessHov(null)}
                      onClick={e=>{const btn=e.currentTarget.querySelector(".sess-act-btn");if(btn){const r=btn.getBoundingClientRect();setSessActMenu(sessActMenu?.id===sess.id?null:{id:sess.id,x:(r.left+r.right)/2/Z,y:r.bottom/Z});}else{const r=e.currentTarget.getBoundingClientRect();setSessActMenu(sessActMenu?.id===sess.id?null:{id:sess.id,x:r.right/Z-35,y:r.bottom/Z});}}}
                      style={{borderTop:`1px solid ${isH?(isProp?"rgba(201,168,76,0.35)":c.acB):c.brH}`,borderRight:`1px solid ${isH?(isProp?"rgba(201,168,76,0.35)":c.acB):c.brH}`,borderBottom:`1px solid ${isH?(isProp?"rgba(201,168,76,0.35)":c.acB):c.brH}`,borderLeft:`3px solid ${stripeCol}`,background:c.sf,cursor:"default",transition:"box-shadow 0.15s ease, border-color 0.15s ease",boxShadow:isH?(isProp?`0 0 0 1px rgba(201,168,76,0.2), 0 4px 24px rgba(0,0,0,0.6), 0 0 18px rgba(201,168,76,0.12)`:`0 0 0 1px ${c.acB}, 0 4px 24px rgba(0,0,0,0.6), 0 0 18px rgba(38,67,247,0.15)`):"0 3px 12px rgba(0,0,0,0.5)",position:"relative",display:"flex",flexDirection:"column",height:80,overflow:"hidden",marginBottom:6}}>

                      {/* Content row */}
                      <div style={{display:"flex",alignItems:"stretch",flex:1}}>

                        {/* Resume | Dashboard — icon-only squares side by side */}
                        <div style={{width:96,flexShrink:0,display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6,padding:"0 10px",borderRight:"none"}}>
                          <div onClick={e=>{e.stopPropagation();launchSession();}}
                            onMouseEnter={()=>setHov("rs_"+sess.id)} onMouseLeave={()=>setHov(null)}
                            style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",transition:"filter 0.12s",filter:hov==="rs_"+sess.id?"brightness(1.2)":"brightness(1)",boxShadow:"0 2px 8px rgba(38,67,247,0.35)",flexShrink:0}}>
                            <svg width={10} height={10} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="rgba(255,255,255,0.95)"/></svg>
                          </div>
                          <div onClick={e=>{e.stopPropagation();setDashSessId(sess.id);setSessView("dashboard");}}
                            onMouseEnter={()=>setHov("db_"+sess.id)} onMouseLeave={()=>setHov(null)}
                            style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",background:hov==="db_"+sess.id?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.07)",border:`1px solid ${hov==="db_"+sess.id?c.brH:c.br}`,cursor:"default",transition:"background 0.12s,border-color 0.12s",flexShrink:0}}>
                            <svg width={12} height={12} viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" fill={hov==="db_"+sess.id?c.tx:c.ts}/><rect x="11" y="1" width="8" height="8" fill={hov==="db_"+sess.id?c.tx:c.ts}/><rect x="1" y="11" width="8" height="8" fill={hov==="db_"+sess.id?c.tx:c.ts}/><rect x="11" y="11" width="8" height="8" fill={hov==="db_"+sess.id?c.tx:c.ts}/></svg>
                          </div>
                        </div>

                        {/* Session name + created date */}
                        <div style={{width:110,flexShrink:0,padding:"0 10px",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"flex-start",gap:4,borderRight:"none"}}>
                          <div style={{fontSize:(sess.name||"").length>24?8:(sess.name||"").length>16?9:10,fontWeight:700,color:c.ts,lineHeight:1.3,wordBreak:"break-word",fontFamily:F}}>{sess.name||"—"}</div>
                          <div style={{fontSize:7,fontWeight:500,color:c.tm,fontFamily:F,whiteSpace:"nowrap"}}>{createdStr}</div>
                        </div>

                        {/* Strategy name + info button */}
                        <div style={{width:100,flexShrink:0,padding:"0 8px 0 10px",display:"flex",alignItems:"center",gap:4,borderRight:"none"}}>
                          <div style={{fontSize:(sess.strategyName||"").length>20?9:(sess.strategyName||"").length>13?10:11,fontWeight:600,color:c.ts,lineHeight:1.35,wordBreak:"break-word",fontFamily:F,flex:1}}>{sess.strategyName||"—"}</div>
                          {sess.strategyDesc&&(
                            <div
                              onClick={e=>e.stopPropagation()}
                              onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setHov("info_"+sess.id);setStratPopup({id:sess.id,x:r.right/Z+6,y:r.top/Z,desc:sess.strategyDesc,name:sess.strategyName});}}
                              onMouseLeave={()=>{setHov(null);setStratPopup(null);}}
                              style={{width:14,height:14,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:hov===("info_"+sess.id)?c.acL:c.ts,transition:"color 0.12s"}}>
                              <svg width={12} height={12} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/><line x1="8" y1="7" x2="8" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="5" r="0.8" fill="currentColor"/></svg>
                            </div>
                          )}
                        </div>

                        {/* Mode */}
                        {colCell("Mode",isProp?"Prop Firm":"Standard",74,isProp?c.gold:c.acL)}

                        {/* Asset class — one per session */}
                        {colCell("Asset",(sess.assetClasses||[])[0]||"—",90)}

                        {/* Symbols — 2-column grid */}
                        <div style={{width:120,flexShrink:0,padding:"0 8px",display:"flex",alignItems:"center",justifyContent:"center",borderRight:"none",overflow:"hidden",cursor:"default"}}>
                          {(sess.tickers||[]).length===0?(
                            <span style={{fontSize:10,color:c.tm,fontFamily:F}}>—</span>
                          ):(
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1px 4px",width:"100%"}}>
                              {sess.tickers.map((t,i)=>(
                                <span key={i} style={{fontSize:8,fontWeight:600,color:c.ts,letterSpacing:"0.04em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F,lineHeight:1.55,textAlign:"center"}}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Date range — mini timeline */}
                        <div style={{width:134,flexShrink:0,padding:"0 10px",display:"flex",alignItems:"center",justifyContent:"center",borderRight:"none"}}>
                          {sess.startDate&&sess.endDate?(()=>{
                            const parse=d=>{const[y,mo,day]=d.split("-");return{y,mo:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+mo-1],day:Number(day)};};
                            const s=parse(sess.startDate),e=parse(sess.endDate);
                            const durMs=new Date(sess.endDate)-new Date(sess.startDate);
                            const durMo=Math.round(durMs/1000/60/60/24/30.44);
                            const durLabel=durMo>=12?`${Math.round(durMo/12)}y`:`${durMo}mo`;
                            return(
                              <div style={{display:"flex",flexDirection:"column",gap:3,width:"100%",fontFamily:F,fontVariantNumeric:"tabular-nums"}}>
                                <div style={{display:"flex",justifyContent:"space-between"}}>
                                  <span style={{fontSize:9,fontWeight:700,color:c.ts}}>{s.mo} {s.day}</span>
                                  <span style={{fontSize:9,fontWeight:700,color:c.ts}}>{e.mo} {e.day}</span>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:8,fontWeight:600,color:c.tm}}>{s.y}</span>
                                  <div style={{flex:1,position:"relative",height:1,background:`linear-gradient(90deg,${c.tm},${c.acL},${c.tm})`}}>
                                    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:c.bg,padding:"0 3px",fontSize:10,fontWeight:800,color:c.acL,letterSpacing:"0.04em",lineHeight:1.2,whiteSpace:"nowrap"}}>{durLabel}</div>
                                  </div>
                                  <span style={{fontSize:8,fontWeight:600,color:c.tm}}>{e.y}</span>
                                </div>
                              </div>
                            );
                          })():(
                            <span style={{fontSize:9,color:c.tm,fontFamily:F}}>—</span>
                          )}
                        </div>

                        {/* Session options */}
                        <div style={{width:102,flexShrink:0,padding:"0 12px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,borderRight:"none",overflow:"hidden"}}>
                          {optLines.map(({label,on},i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:5,fontFamily:F}}>
                              <div style={{width:5,height:5,borderRadius:"50%",background:on?c.gn:c.rd,flexShrink:0,boxShadow:on?`0 0 4px ${c.gn}88`:`0 0 4px ${c.rd}88`}}/>
                              <div style={{fontSize:10,fontWeight:600,color:on?c.gn:c.rd,whiteSpace:"nowrap"}}>{label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Account size */}
                        {colCell("Starting Bal.",`$${(sess.capital||0).toLocaleString()}`,88)}

                        {/* Net P&L */}
                        {colCell("Net P&L",pnlVal,80,pnlCol)}

                        {/* Win rate */}
                        {colCell("Win %",sess.winRate!=null?`${sess.winRate}%`:"—",60,sess.winRate!=null?(sess.winRate>=50?c.gn:c.rd):c.tm)}

                        {/* Avg R:R */}
                        {colCell("Avg R:R",sess.avgRR!=null?`1:${sess.avgRR.toFixed(1)}`:"—",62)}

                        {/* # Trades */}
                        {colCell("Trades",sess.trades!=null?String(sess.trades):"—",56)}

                        {/* Progress */}
                        <div style={{width:66,flexShrink:0,padding:"0 8px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,borderRight:"none",overflow:"hidden"}}>
                          <span style={{fontSize:10,fontWeight:800,color:progress>=100?(isProp?(pnlPos?c.gn:c.rd):c.gn):progress>0?c.acL:c.tm,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{progress>=100?(isProp?(pnlPos?"Passed":"Lost"):"Done"):`${progress}%`}</span>
                          <div style={{width:"100%",height:2,background:"rgba(255,255,255,0.07)",overflow:"hidden"}}>
                            <div style={{width:`${Math.min(progress,100)}%`,height:"100%",background:progress>=100?(isProp?(pnlPos?c.gn:c.rd):c.gn):c.acL,transition:"width 0.3s ease"}}/>
                          </div>
                        </div>

                        {/* Action menu trigger */}
                        <div style={{width:50,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <div className="sess-act-btn" onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSessActMenu(sessActMenu?.id===sess.id?null:{id:sess.id,x:(r.left+r.right)/2/Z,y:r.bottom/Z});}}
                            style={{width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:sessActMenu?.id===sess.id?c.acL:c.ts,background:sessActMenu?.id===sess.id?"rgba(255,255,255,0.08)":"transparent",transition:"all 0.12s"}}
                            onMouseEnter={e=>{if(sessActMenu?.id!==sess.id){e.currentTarget.style.color=c.tx;e.currentTarget.style.background="rgba(255,255,255,0.08)";}}}
                            onMouseLeave={e=>{if(sessActMenu?.id!==sess.id){e.currentTarget.style.color=c.ts;e.currentTarget.style.background="transparent";}}}>
                            <svg width={18} height={18} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>
                          </div>
                        </div>

                      </div>{/* end content row */}


                    </div>
                    </React.Fragment>
                  );
                })
              }
              </div>
              )}
              </div>
            </div>
            </div>{/* end right content */}
            </div>{/* end body */}

{/* ── Session action dropdown ── */}
            {sessActMenu&&(()=>{
              const ms=sessions.find(s=>s.id===sessActMenu.id);
              if(!ms)return null;
              const hasStarted=ms.progress>0;
              return(<>
                <div style={{position:"fixed",inset:0,zIndex:99997}} onClick={e=>{e.stopPropagation();setSessActMenu(null);}}/>
                <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:sessActMenu.y+6,left:sessActMenu.x-80,zIndex:99998,width:160,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:"0 12px 40px rgba(0,0,0,0.8)",fontFamily:F}}>
                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                  {[
                    {label:ms.progress===0?"Start":"Resume", handler:()=>{launchSession();setSessActMenu(null);}, col:c.acL, disabled:false, danger:false,
                      icon:<svg width={14} height={14} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>},
                    {label:"Dashboard", handler:()=>{setDashSessId(ms.id);setSessView("dashboard");setSessActMenu(null);}, col:c.ts, disabled:false, danger:false,
                      icon:<svg width={14} height={14} viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" fill="currentColor"/><rect x="11" y="1" width="8" height="8" fill="currentColor"/><rect x="1" y="11" width="8" height="8" fill="currentColor"/><rect x="11" y="11" width="8" height="8" fill="currentColor"/></svg>},
                    {label:"divider"},
                    {label:"Edit",      handler:e=>{openEditSession(e,ms);setSessActMenu(null);}, col:hasStarted?"rgba(255,255,255,0.3)":c.ts, disabled:hasStarted, sub:hasStarted?"started":null, danger:false,
                      icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><path d="M4 20h4l11-11-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>},
                    {label:"Duplicate", handler:e=>{duplicateSession(e,ms);setSessActMenu(null);}, col:c.ts, disabled:false, danger:false,
                      icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" stroke="currentColor" strokeWidth="1.7"/><path d="M3 16V3h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>},
                    {label:"Delete",    handler:e=>{deleteSession(e,ms.id);setSessActMenu(null);}, col:c.rd, disabled:false, danger:true,
                      icon:<svg width={14} height={14} viewBox="0 0 24 24" fill="none"><polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M19,6l-1,14H6L5,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M10,11v6M14,11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M9,6V4h6v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>},
                  ].map(({label,handler,col,disabled,sub,danger,icon})=>{
                    if(label==="divider")return<div key="div" style={{height:1,background:c.br,margin:"2px 0"}}/>;
                    return(
                    <div key={label} onClick={disabled?undefined:handler}
                      style={{position:"relative",padding:"8px 12px",fontSize:10,fontWeight:600,color:disabled?"rgba(255,255,255,0.28)":col,cursor:disabled?"default":"default",transition:"background 0.1s",display:"flex",alignItems:"center",gap:8,fontFamily:F}}
                      onMouseEnter={e=>{if(!disabled){e.currentTarget.style.background=danger?"rgba(255,80,104,0.09)":"rgba(255,255,255,0.04)";}const s=e.currentTarget.querySelector(".am-stripe");if(s&&!disabled)s.style.opacity="1";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="transparent";const s=e.currentTarget.querySelector(".am-stripe");if(s)s.style.opacity="0";}}>
                      <div className="am-stripe" style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,opacity:0,background:`linear-gradient(180deg,transparent,${disabled?c.tm:col},transparent)`,transition:"opacity 0.1s"}}/>
                      <span style={{opacity:disabled?0.3:1,flexShrink:0,display:"flex"}}>{icon}</span>
                      {label}
                      {sub&&<span style={{fontSize:8,color:c.tm,marginLeft:"auto"}}>{sub}</span>}
                    </div>
                    );
                  })}
                </div>
              </>);
            })()}

{/* ── Strategy info popup ── */}
            {stratPopup&&(
              <div style={{position:"fixed",top:stratPopup.y,left:stratPopup.x,zIndex:9999,width:260,background:c.el,border:`1px solid ${c.brH}`,boxShadow:"0 8px 28px rgba(0,0,0,0.7)",pointerEvents:"none",fontFamily:F}}>
                <div style={{height:2,background:`linear-gradient(90deg,${c.acL},${c.ac})`}}/>
                <div style={{padding:"10px 12px"}}>
                  <div style={{fontSize:9,fontWeight:800,color:c.acL,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:5}}>{stratPopup.name}</div>
                  <div style={{fontSize:10,fontWeight:500,color:c.ts,lineHeight:1.6}}>{stratPopup.desc}</div>
                </div>
              </div>
            )}

            {/* ── NEW SESSION MODAL overlay ── */}
            {newSessOpen&&(
              <div style={{position:"fixed",inset:0,zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",visibility:"visible"}} onClick={closeNewSess}>
                {/* Backdrop */}
                <div style={{position:"absolute",inset:0,background:"rgba(4,5,10,0.72)",backdropFilter:"blur(3px)"}}/>
                {/* Panel */}
                <div onClick={e=>e.stopPropagation()}
                  style={{position:"relative",width:"min(680px,90vw)",height:"min(88vh,660px)",background:c.sf,border:`1px solid ${c.brH}`,display:"flex",flexDirection:"column",animation:"tlrPopIn 0.18s ease",boxShadow:"0 24px 72px rgba(0,0,0,0.9)",fontFamily:F}}>
                  {/* Top accent */}
                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                  {/* Modal header */}
                  <div style={{height:44,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",borderBottom:`1px solid ${c.br}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <img src="/LOGO-07.png" style={{width:22,height:22,objectFit:"contain"}} alt=""/>
                      <div style={{fontSize:12,fontWeight:700,color:c.tx,letterSpacing:"0.04em",fontFamily:F}}>{editSessId?"Edit Session":"New Backtest Session"}</div>
                    </div>
                    <div onClick={closeNewSess}
                      onMouseEnter={()=>setHov("newSessX")} onMouseLeave={()=>setHov(null)}
                      style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",background:hov==="newSessX"?"rgba(255,80,80,0.07)":"transparent",transition:"background 0.12s"}}>
                      <I n="x" s={18} cl={hov==="newSessX"?c.rd:c.ts}/>
                    </div>
                  </div>

                  {/* Scrollable form body */}
                  <div style={{flex:1,overflowY:"auto",padding:"16px 20px 68px"}} className="tlr-scroll" onScroll={()=>{setNewSessCalOpen(false);setNewSessStratDropOpen(false);setNewSessSymPickerOpen(false);setNewSessSupPickerOpen(false);setDropdown(null);setDdAnchor(null);}} onClick={()=>{setNewSessStratDropOpen(false);setNewSessSymDropOpen(false);setNewSessAssetDropOpen(false);setNewSessCalOpen(false);setNewSessSymPickerOpen(false);setNewSessSupPickerOpen(false);setDropdown(null);setDdAnchor(null);}}>
                    <div style={{maxWidth:"100%",display:"flex",flexDirection:"column",gap:8}}>

                      {/* § Session Info */}
                      <div style={{border:`1px solid ${c.brH}`,padding:"12px 14px"}}>
                      {secH("Session Info")}
                      {(()=>{
                        const myStrats=["EMA Crossover","London Breakout","VWAP Scalp","Golden Cross Trend","Volume Breakout"];
                        const commStrats=["Momentum Surge","ICT Model A","SMC Liquidity Grab"];
                        const allGroups=[["My Strategies",myStrats],["Saved Strategies",commStrats]];
                        return(<>
                          {/* Session name + strategy: left 50% column, New Strategy button beside it */}
                          <div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:10}}>
                            {/* 50% container — session name and strategy dropdown both full width here */}
                            <div style={{width:"50%",flexShrink:0,display:"flex",flexDirection:"column",gap:8}}>
                              {/* Row 1: session name */}
                              <div>
                                {lbl("Session name *")}
                                <input value={newSessName} onChange={e=>setNewSessName(e.target.value)} placeholder="e.g. EURUSD Test" style={{...inp()}}/>
                              </div>
                              {/* Row 2: strategy dropdown – same full width */}
                              <div style={{position:"relative"}}>
                                {lbl("Strategy")}
                                <div onClick={(e)=>{e.stopPropagation();if(newSessStratDropOpen){setNewSessStratDropOpen(false);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+3,left:r.left/Z,width:r.width/Z});setNewSessStratDropOpen(true);setDropdown(null);}}}
                                  style={{...inp({padding:"0 24px 0 8px",cursor:"default"}),display:"flex",alignItems:"center",border:`1px solid ${newSessStratDropOpen?c.acB:c.brH}`,position:"relative",userSelect:"none"}}>
                                  <span style={{flex:1,color:newSessPlaybook?c.tx:c.tm,fontSize:11,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {newSessPlaybook||"— None —"}
                                  </span>
                                  <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${newSessStratDropOpen?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                {newSessStratDropOpen&&ddAnchor&&(
                                  <><div style={{position:"fixed",inset:0,zIndex:199}} onClick={()=>{setNewSessStratDropOpen(false);setDdAnchor(null);}}/><div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:200}}>
                                    <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                                    {(()=>{const isAct=newSessPlaybook==="";const isH=newSessStratHov==="__none";return(
                                      <div onClick={()=>{setNewSessPlaybook("");setNewSessStratDropOpen(false);}} onMouseEnter={()=>setNewSessStratHov("__none")} onMouseLeave={()=>setNewSessStratHov(null)}
                                        style={{display:"flex",alignItems:"center",padding:"5px 10px",cursor:"default",position:"relative",background:isAct?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                        {isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                        <span style={{fontSize:11,fontWeight:isAct?700:400,color:isAct?c.acL:isH?c.tx:c.tm,fontFamily:F,fontStyle:"italic"}}>— None —</span>
                                      </div>
                                    );})()}
                                    {allGroups.map(([groupLabel,items])=>(
                                      <div key={groupLabel}>
                                        <div style={{padding:"5px 10px 3px",fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.08em",textTransform:"uppercase",borderTop:"1px solid rgba(140,160,255,0.08)"}}>{groupLabel}</div>
                                        {items.map(s=>{const isAct=newSessPlaybook===s;const isH=newSessStratHov===s;return(
                                          <div key={s} onClick={()=>{setNewSessPlaybook(s);setNewSessStratDropOpen(false);}} onMouseEnter={()=>setNewSessStratHov(s)} onMouseLeave={()=>setNewSessStratHov(null)}
                                            style={{display:"flex",alignItems:"center",padding:"5px 10px 5px 14px",cursor:"default",position:"relative",background:isAct?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                            {isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                            <span style={{fontSize:11,fontWeight:isAct?700:500,color:isAct?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{s}</span>
                                          </div>
                                        );})}
                                      </div>
                                    ))}
                                  </div></>
                                )}
                              </div>
                            </div>
                            {/* New Strategy button – bottom-aligned beside the 50% block */}
                            <div style={{flexShrink:0,height:27,width:110,justifyContent:"center",display:"flex",alignItems:"center",gap:5,background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.96)",letterSpacing:"0.05em",boxShadow:"0 2px 8px rgba(38,67,247,0.35)",fontFamily:F,whiteSpace:"nowrap",transition:"filter 0.12s"}}
                              onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"}
                              onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                              <svg width={8} height={8} viewBox="0 0 12 12" fill="none"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                              New Strategy
                            </div>
                          </div>
                          {/* Row 2: description */}
                          {lbl("Description")}
                          <textarea value={newSessDescription} onChange={e=>setNewSessDescription(e.target.value)}
                            placeholder="Optional notes about this session"
                            style={{...inp({height:"auto",padding:"5px 8px",resize:"vertical",minHeight:40,lineHeight:1.5})}}/>
                        </>);
                      })()}
                      </div>

                      {/* § Session Settings — compact trigger + sub-window */}
                      <div style={{border:`1px solid ${sessInfoDone?c.brH:c.br}`,padding:"12px 14px",transition:"opacity 0.2s,border-color 0.2s",...(sessInfoDone?activeBox:lockedBox)}}>
                      {secH("Session Settings")}
                      {(()=>{
                        const allSymbols=sessionDatasetSymbols;
                        const catMap={"Forex":"Forex","Futures":"Futures","Crypto":"Crypto","Stocks":"Equities"};
                        const marketOptions=["Forex","Futures","Crypto","Stocks"].filter(a=>{const catKey=catMap[a]||a;return allSymbols.some(s=>s.cat===catKey);});
                        const catOf=sym=>allSymbols.find(s=>s.sym===sym)?.cat||"";
                        const assetLabel=cat=>({"Forex":"Forex","Futures":"Futures","Crypto":"Crypto","Equities":"Stocks"}[cat]||cat);
                        const totalSelected=newSessTickers.length+newSessSupportTickers.length;
                        const pairInfo=sym=>{if(sym.length===6){const b=sym.slice(0,3),q=sym.slice(3,6);if(currencyCountry[b]&&currencyCountry[q])return{b,q};}return null;};
                        const mkFlags=(sym,sz=11)=>{
                          const pr=pairInfo(sym);const fw=Math.round(sz*15/11),fh=sz;
                          if(pr){return(<div style={{position:"relative",width:Math.round(sz*22/11),height:fh,flexShrink:0}}><div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.7)",zIndex:2}}><FlagSvg code={pr.b} w={fw} h={fh}/></div><div style={{position:"absolute",left:Math.round(sz*7/11),top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 2px rgba(0,0,0,0.5)",zIndex:1}}><FlagSvg code={pr.q} w={fw} h={fh}/></div></div>);}
                          const metalMap={XAUUSD:{bg:"#2B2200",fg:"#FFD700",label:"Au"},XAGUSD:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},GC:{bg:"#2B2200",fg:"#FFD700",label:"Au"},SI:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},CL:{bg:"#0D1A12",fg:"#4CAF50",label:"CL"},NG:{bg:"#0A1020",fg:"#64B5F6",label:"NG"}};
                          if(metalMap[sym]){const m=metalMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:1,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} fill={m.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={m.fg} fontSize={fh*0.52} fontWeight="800" fontFamily="'Exo 2',sans-serif">{m.label}</text></svg>);}
                          const cryptoMap={BTCUSD:{bg:"#E8820C",fg:"#fff",label:"₿"},ETHUSD:{bg:"#3D4FC4",fg:"#fff",label:"Ξ"},BNBUSD:{bg:"#C99800",fg:"#000",label:"B"},SOLUSD:{bg:"#7B3FBE",fg:"#fff",label:"S"},ADAUSD:{bg:"#0033AD",fg:"#fff",label:"A"}};
                          if(cryptoMap[sym]){const cr=cryptoMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35),boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill={cr.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={cr.fg} fontSize={fh*0.58} fontWeight="900" fontFamily="'Exo 2',sans-serif">{cr.label}</text></svg>);}
                          return(<div style={{borderRadius:1,overflow:"hidden",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><FlagSvg code="US" w={fw} h={fh}/></div>);
                        };
                        const mkCell=(t,onDel)=>(<div key={t} style={{display:"flex",alignItems:"center",padding:"2px 4px 2px 3px",background:c.sf,border:`1px solid ${c.brH}`,gap:3,minWidth:0}}>{mkFlags(t,10)}<span style={{fontSize:10,fontWeight:700,color:c.tx,fontFamily:F,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t}</span><span onClick={onDel} style={{fontSize:13,lineHeight:1,color:c.tm,cursor:"default",flexShrink:0,marginLeft:5,transition:"color 0.1s"}} onMouseEnter={e=>e.currentTarget.style.color=c.rd} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</span></div>);
                        /* ── date helpers (shared with grid below) ── */
                        const MON_D=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                        const MONS_D=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
                        const fmtD=iso=>{if(!iso)return "";const d=new Date(iso.split("T")[0]+"T00:00:00");return `${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;};
                        const applyD=(raw,setter)=>{
                          const s=raw.trim();
                          const todayIso=new Date().toISOString().slice(0,10);
                          const minIso="1990-01-01";
                          const clamp=iso=>iso<minIso?minIso:iso>todayIso?todayIso:iso;
                          // DD-Mon-YYYY
                          const m1=s.match(/^(\d{1,2})-([a-zA-Z]{3})-(\d{1,4})$/);
                          if(m1){const moIdx=MONS_D.indexOf(m1[2].toLowerCase());if(moIdx<0)return;const y=parseInt(m1[3]),dy=Math.min(parseInt(m1[1]),new Date(y,moIdx+1,0).getDate());if(y<1990||y>new Date().getFullYear())return;setter(clamp(`${y}-${String(moIdx+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                          // YYYY-MM-DD
                          const m2=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                          if(m2){const y=parseInt(m2[1]),mo=parseInt(m2[2])-1,dy=Math.min(parseInt(m2[3]),new Date(y,mo+1,0).getDate());if(mo<0||mo>11||y<1990||y>new Date().getFullYear())return;setter(clamp(`${y}-${String(mo+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                          // MM/DD/YYYY
                          const m3=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                          if(m3){const y=parseInt(m3[3]),mo=parseInt(m3[1])-1,dy=Math.min(parseInt(m3[2]),new Date(y,mo+1,0).getDate());if(mo<0||mo>11||y<1990||y>new Date().getFullYear())return;setter(clamp(`${y}-${String(mo+1).padStart(2,"0")}-${String(dy).padStart(2,"0")}`));return;}
                        };;
                        const openCal=(e,target,currentIso)=>{const r=e.currentTarget.parentElement.getBoundingClientRect();const w=r.width/Z,calH=260;const rawL=r.left/Z,rawB=r.bottom/Z,rawTop=r.top/Z;const spaceBelow=window.innerHeight/Z-rawB-calH-8;const top=spaceBelow>=0?rawB+4:Math.max(8,rawTop-calH-4);setNewSessCalPos({top,left:Math.max(8,Math.min(rawL,window.innerWidth/Z-w-8)),width:w});setNewSessCalTarget(target);const d=currentIso?new Date(currentIso.split("T")[0]+"T00:00:00"):new Date(2020,0,1);setNewSessCalViewY(d.getFullYear());setNewSessCalViewM(d.getMonth());setNewSessCalMode("days");setNewSessCalOpen(true);};
                        const inpSx={flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:12,fontWeight:600,padding:"5px 7px",fontFamily:F,fontVariantNumeric:"tabular-nums",cursor:"text",minWidth:0};
                        const chvSx={padding:"0 6px",cursor:"default",display:"flex",alignItems:"center",color:c.ts,borderLeft:`1px solid ${c.br}`,alignSelf:"stretch"};
                        const ChevD=({open})=>(<svg width={8} height={8} viewBox="0 0 8 8" fill="none"><path d={open?"M1,5 L4,2 L7,5":"M1,3 L4,6 L7,3"} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/></svg>);
                        const applyPreset=(months,years)=>{const end=new Date(),start=new Date();if(months)start.setMonth(start.getMonth()-months);if(years)start.setFullYear(start.getFullYear()-years);const fi=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const fd=d=>`${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;setNewSessStart(fi(start));setNewSessStartInput(fd(start));setNewSessEnd(fi(end));setNewSessEndInput(fd(end));};
                        const presets=[{l:"1M",months:1},{l:"3M",months:3},{l:"6M",months:6},{l:"1Y",years:1},{l:"2Y",years:2},{l:"3Y",years:3},{l:"5Y",years:5},{l:"10Y",years:10}];
                        const unitMax={D:3650,M:120,Y:10};
                        const randomRange=()=>{const today=new Date();today.setHours(0,0,0,0);let lenDays=newSessRandRangeUnit==="D"?newSessRandRangeVal:newSessRandRangeUnit==="M"?Math.round(newSessRandRangeVal*30.4375):Math.round(newSessRandRangeVal*365.25);const earliest=new Date(today);earliest.setFullYear(earliest.getFullYear()-20);const latest=new Date(today.getTime()-lenDays*86400000);if(latest<=earliest)return;const s=new Date(earliest.getTime()+Math.random()*(latest.getTime()-earliest.getTime()));const e2=new Date(s.getTime()+lenDays*86400000);const fi=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const fd=d=>`${String(d.getDate()).padStart(2,"0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;setNewSessStart(fi(s));setNewSessStartInput(fd(s));setNewSessEnd(fi(e2));setNewSessEndInput(fd(e2));setNewSessActivePreset(null);};
                        return(<>
                          {/* ─── Market + Random row ─── */}
                          <div style={{marginBottom:8,display:"flex",alignItems:"flex-end",gap:8}}>
                            {/* Market dropdown — width matches Strategy */}
                            <div style={{width:"50%",flexShrink:0}}>
                              {lbl("Markets & Instruments *")}
                              {sessionFilesLoading&&(
                                <div style={{fontSize:9,color:c.tm,fontFamily:F,marginBottom:6}}>Loading datasets…</div>
                              )}
                              {!sessionFilesLoading&&allSymbols.length===0&&(
                                <div style={{fontSize:9,color:c.rd,fontFamily:F,marginBottom:6,lineHeight:1.4}}>No session-ready datasets. Add healthy datasets in Admin first.</div>
                              )}
                              <div style={{position:"relative"}}>
                                <div onClick={e=>{e.stopPropagation();if(newSessAssetDropOpen){setNewSessAssetDropOpen(false);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+3,left:r.left/Z,width:r.width/Z});setNewSessAssetDropOpen(true);setDropdown(null);setNewSessStratDropOpen(false);}}}
                                  style={{...inp({padding:"0 24px 0 8px",cursor:"default"}),display:"flex",alignItems:"center",border:`1px solid ${newSessAssetDropOpen?c.acB:c.brH}`,position:"relative",userSelect:"none"}}>
                                  <span style={{flex:1,fontSize:11,fontWeight:600,color:c.tx,fontFamily:F}}>{newSessAssetClass}</span>
                                  <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${newSessAssetDropOpen?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                {newSessAssetDropOpen&&ddAnchor&&(<>
                                  <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setNewSessAssetDropOpen(false);setDdAnchor(null);}}/>
                                  <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:9999}}>
                                    <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                    {marketOptions.map(a=>{
                                      const isA=newSessAssetClass===a;const hk="asDrop_"+a;const isH=hov===hk;
                                      return(
                                        <div key={a} onClick={()=>{setNewSessAssetClass(a);setNewSessTickerInput("");setNewSessTickers([]);setNewSessAssetDropOpen(false);setDdAnchor(null);if(a==="Stocks"||a==="Crypto")setSessTradingMode("standard");if(a==="Futures"&&sessTradingMode==="prop"){setNewSessCapital("50000");setSessP1DailyLossAmt("1000");setSessP1MaxDDAmt("2000");setSessP1ProfitTargetAmt("3000");}}}
                                          onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                          style={{display:"flex",alignItems:"center",padding:"5px 12px",cursor:"default",position:"relative",background:isA?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                          {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                          <span style={{fontSize:11,fontWeight:isA?700:500,color:isA?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{a}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>)}
                              </div>
                            </div>
                            {/* Random button — aligned to bottom of Market button */}
                            <div style={{display:"flex",alignItems:"center",gap:4,paddingBottom:1}}>
                              <div onClick={()=>{
                                  if(!marketOptions.length||!allSymbols.length)return;
                                  const randomCat=marketOptions[Math.floor(Math.random()*marketOptions.length)];
                                  const catKey=catMap[randomCat]||randomCat;
                                  const pool=allSymbols.filter(s=>s.cat===catKey);
                                  if(!pool.length)return;
                                  const picks=[...pool].sort(()=>Math.random()-0.5).slice(0,Math.min(newSessRandomCount,10)).map(s=>s.sym);
                                  setNewSessAssetClass(randomCat);
                                  if(randomCat==="Stocks"||randomCat==="Crypto")setSessTradingMode("standard");
                                  setNewSessTickers(picks);
                                }}
                                onMouseEnter={()=>setHov("rndBtnTop")} onMouseLeave={()=>setHov(null)}
                                style={{padding:"0 10px",height:27,display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${hov==="rndBtnTop"?c.acB:c.brH}`,cursor:"default",fontSize:10,fontWeight:700,color:hov==="rndBtnTop"?c.acL:c.ts,letterSpacing:"0.06em",fontFamily:F,flexShrink:0,whiteSpace:"nowrap",transition:"color 0.12s,border-color 0.12s"}}>
                                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
                                  <polyline points="16,3 21,3 21,8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                  <polyline points="21,16 21,21 16,21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                  <line x1="4" y1="20" x2="21" y2="3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                  <line x1="4" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                  <line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                </svg>
                                Random
                              </div>
                              <div style={{position:"relative",width:49,height:27,background:c.el,border:`1px solid ${c.brH}`,boxSizing:"border-box",flexShrink:0}}>
                                <input type="number" min={1} max={10} value={newSessRandomCount}
                                  onChange={e=>setNewSessRandomCount(Math.min(10,Math.max(1,parseInt(e.target.value)||1)))}
                                  onClick={e=>e.stopPropagation()}
                                  className="tlr-nospinner"
                                  style={{position:"absolute",left:0,right:18,top:0,bottom:0,width:"calc(100% - 18px)",height:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:11,fontWeight:600,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"center",padding:0,boxSizing:"border-box"}}/>
                                <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                  {[[1,"▲"],[-1,"▼"]].map(([delta,chr],i)=>(
                                    <button key={i} onClick={e=>{e.stopPropagation();setNewSessRandomCount(v=>Math.min(10,Math.max(1,v+delta)));}}
                                      onMouseEnter={e=>e.currentTarget.style.color=c.acL} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                      style={{flex:1,width:18,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,borderBottom:i===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                      {chr}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* ─── Instruments + Date Range ─── */}
                          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:4}}>
                            {/* ── Full-width symbol display rectangle ── */}
                            <div style={{background:c.el,border:`1px solid ${newSessMarketOpen?c.acB:c.brH}`,display:"flex",flexDirection:"column",cursor:"default",transition:"border-color 0.12s",width:"100%",boxSizing:"border-box"}}
                              onClick={()=>setNewSessMarketOpen(true)}>
                              {/* TRADING section */}
                              <div style={{padding:"5px 10px 0"}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    <div style={{width:2,height:8,background:c.acL,flexShrink:0,boxShadow:`0 0 4px ${c.acG}`}}/>
                                    <span style={{fontSize:10,fontWeight:800,color:c.ts,letterSpacing:"0.1em",fontFamily:F}}>TRADING</span>
                                    <div style={{position:"relative",display:"inline-flex",alignItems:"center"}}
                                      onMouseEnter={e=>{e.stopPropagation();setNewSessInfoHov("trading");}}
                                      onMouseLeave={()=>setNewSessInfoHov(null)}
                                      onClick={e=>e.stopPropagation()}>
                                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block",cursor:"default",flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                      {newSessInfoHov==="trading"&&(
                                        <div style={{position:"absolute",left:0,bottom:"calc(100% + 6px)",background:c.el,border:`1px solid ${c.br}`,zIndex:10,whiteSpace:"nowrap",pointerEvents:"none"}}>
                                          <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                          <div style={{padding:"5px 10px",fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>Instruments you will actively trade in this session</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    {newSessTickers.length>0&&(
                                      <div onClick={e=>{e.stopPropagation();setNewSessTickers([]);}}
                                        onMouseEnter={e=>{e.stopPropagation();setHov("prvTrdClr");}} onMouseLeave={()=>setHov(null)}
                                        style={{display:"flex",alignItems:"center",cursor:"default",color:hov==="prvTrdClr"?c.rd:c.tm,transition:"color 0.1s"}}>
                                        <I n="trashDraw" s={10} cl={hov==="prvTrdClr"?c.rd:c.tm}/>
                                      </div>
                                    )}
                                    <span style={{fontSize:10,fontWeight:700,color:c.tm,fontFamily:F}}>{newSessTickers.length||"—"}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{padding:"4px 8px 6px",display:"flex",gap:5,alignItems:"flex-start"}}>
                                {/* Plus button — tall (2 tag rows) */}
                                <div style={{position:"relative",flexShrink:0}}>
                                  <div onClick={e=>{e.stopPropagation();if(newSessSymPickerOpen){setNewSessSymPickerOpen(false);}else{const r=e.currentTarget.getBoundingClientRect();setNewSessSymPickerPos({top:r.bottom/Z+2,left:r.left/Z});setNewSessSymPickerSearch("");setNewSessSymPickerOpen(true);}}}
                                    onMouseEnter={e=>{e.stopPropagation();setHov("symPickBtn");e.currentTarget.style.filter="brightness(1.12)";}}
                                    onMouseLeave={e=>{setHov(null);e.currentTarget.style.filter="brightness(1)";}}
                                    style={{width:26,height:40,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e38e8,#4A6AFF)",cursor:"default",transition:"filter 0.12s",flexShrink:0,boxShadow:"0 2px 8px rgba(38,67,247,0.35)"}}>
                                    <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                                      <line x1="6" y1="1" x2="6" y2="11" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                                      <line x1="1" y1="6" x2="11" y2="6" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                                    </svg>
                                  </div>
                                  {newSessSymPickerOpen&&(<>
                                    <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setNewSessSymPickerOpen(false);}}/>
                                    <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:newSessSymPickerPos.top,left:newSessSymPickerPos.left,width:160,maxHeight:240,display:"flex",flexDirection:"column",background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:9999}}>
                                      <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                                      <div style={{padding:"5px 8px",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                                        <input autoFocus value={newSessSymPickerSearch} onChange={e=>setNewSessSymPickerSearch(e.target.value)}
                                          placeholder="Search symbols…"
                                          style={{width:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0,boxSizing:"border-box"}}/>
                                      </div>
                                      <div className="tlr-scroll" style={{overflowY:"auto",flex:1}}>
                                        {(()=>{
                                          const catKey=catMap[newSessAssetClass]||newSessAssetClass;
                                          const pool=allSymbols.filter(s=>s.cat===catKey&&(!newSessSymPickerSearch||s.sym.toLowerCase().includes(newSessSymPickerSearch.toLowerCase())));
                                          if(pool.length===0)return <div style={{padding:"8px 10px",fontSize:10,color:c.tm,fontFamily:F}}>No results</div>;
                                          return pool.map(s=>{
                                            const isChk=newSessTickers.includes(s.sym);
                                            const hk="spick_"+s.sym;const isH=hov===hk;
                                            const bCol=isChk?c.acL:isH?c.tx:c.ts;
                                            return(
                                              <div key={s.sym} onClick={()=>{if(isChk){setNewSessTickers(p=>p.filter(x=>x!==s.sym));}else if(newSessTickers.length<10){setNewSessTickers(p=>[...p,s.sym]);}}}
                                                onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                                style={{display:"flex",alignItems:"center",padding:"4px 8px",gap:6,cursor:"default",opacity:!isChk&&newSessTickers.length>=10?0.35:1,background:isH&&(isChk||newSessTickers.length<10)?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.08s,opacity 0.1s"}}>
                                                {/* TlChk-style bracket checkbox */}
                                                <svg width={10} height={10} style={{display:"block",overflow:"visible",flexShrink:0}}>
                                                  <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  {!isChk&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1} fill="none" strokeLinecap="square" opacity={0.5}/></>}
                                                  {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill={c.acL}/></>}
                                                </svg>
                                                {mkFlags(s.sym,10)}
                                                <span style={{fontSize:10,fontWeight:isChk?700:500,color:isChk?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{s.sym}</span>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    </div>
                                  </>)}
                                </div>
                                {/* Tags — 5 per row, max 2 rows (10 symbols) */}
                                <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,alignContent:"flex-start"}}>
                                  {newSessTickers.length>0
                                    ?newSessTickers.slice(0,10).map(t=>mkCell(t,e=>{e.stopPropagation();setNewSessTickers(p=>p.filter(x=>x!==t));}))
                                    :<span style={{fontSize:9,color:c.tm,fontFamily:F,gridColumn:"1/-1",lineHeight:"40px"}}>—</span>
                                  }
                                </div>
                              </div>
                              {/* Divider */}
                              <div style={{height:1,background:c.brH}}/>
                              {/* SUPPORTING section */}
                              <div style={{padding:"5px 10px 0"}}>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    <div style={{width:2,height:8,background:"rgba(232,194,82,0.8)",flexShrink:0,boxShadow:`0 0 4px rgba(232,194,82,0.3)`}}/>
                                    <div onClick={e=>{e.stopPropagation();setNewSessSupportEnabled(v=>!v);}}>
                                      {TlChk(newSessSupportEnabled,"supEnabledChk","",()=>{},"rgba(232,194,82,0.9)")}
                                    </div>
                                    <span style={{fontSize:10,fontWeight:800,color:c.ts,letterSpacing:"0.1em",fontFamily:F}}>SUPPORTING</span>
                                    <div style={{position:"relative",display:"inline-flex",alignItems:"center"}}
                                      onMouseEnter={e=>{e.stopPropagation();setNewSessInfoHov("supporting");}}
                                      onMouseLeave={()=>setNewSessInfoHov(null)}
                                      onClick={e=>e.stopPropagation()}>
                                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block",cursor:"default",flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                      {newSessInfoHov==="supporting"&&(
                                        <div style={{position:"absolute",left:0,top:"calc(100% + 6px)",background:c.el,border:`1px solid ${c.br}`,zIndex:10,whiteSpace:"nowrap",pointerEvents:"none"}}>
                                          <div style={{height:2,background:`linear-gradient(90deg,rgba(232,194,82,0.3),rgba(232,194,82,0.8),rgba(232,194,82,0.3))`}}/>
                                          <div style={{padding:"5px 10px",fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>View-only instruments for analysis — not tradeable</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                                    {newSessSupportTickers.length>0&&(
                                      <div onClick={e=>{e.stopPropagation();setNewSessSupportTickers([]);}}
                                        onMouseEnter={e=>{e.stopPropagation();setHov("prvSupClr");}} onMouseLeave={()=>setHov(null)}
                                        style={{display:"flex",alignItems:"center",cursor:"default",color:hov==="prvSupClr"?c.rd:c.tm,transition:"color 0.1s"}}>
                                        <I n="trashDraw" s={10} cl={hov==="prvSupClr"?c.rd:c.tm}/>
                                      </div>
                                    )}
                                    <span style={{fontSize:10,fontWeight:700,color:c.tm,fontFamily:F}}>{newSessSupportTickers.length||"—"}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{padding:"4px 8px 6px",display:"flex",gap:5,alignItems:"flex-start",opacity:newSessSupportEnabled?1:0.35,pointerEvents:newSessSupportEnabled?"auto":"none",transition:"opacity 0.15s"}}>
                                {/* Plus button — tall (2 tag rows) */}
                                <div style={{position:"relative",flexShrink:0}}>
                                  <div onClick={e=>{e.stopPropagation();if(newSessSupPickerOpen){setNewSessSupPickerOpen(false);}else{const r=e.currentTarget.getBoundingClientRect();setNewSessSupPickerPos({top:r.bottom/Z+2,left:r.left/Z});setNewSessSupPickerSearch("");setNewSessSymPickerOpen(false);setNewSessSupPickerOpen(true);}}}
                                    onMouseEnter={e=>{e.stopPropagation();e.currentTarget.style.filter="brightness(1.12)";}} onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";}}
                                    style={{width:26,height:40,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#a07000,#e8c252)",cursor:"default",transition:"filter 0.12s",flexShrink:0,boxShadow:"0 2px 8px rgba(200,150,0,0.35)"}}>
                                    <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                                      <line x1="6" y1="1" x2="6" y2="11" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                                      <line x1="1" y1="6" x2="11" y2="6" stroke="rgba(255,255,255,0.96)" strokeWidth="1.8" strokeLinecap="round"/>
                                    </svg>
                                  </div>
                                  {newSessSupPickerOpen&&(<>
                                    <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setNewSessSupPickerOpen(false);}}/>
                                    <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:newSessSupPickerPos.top,left:newSessSupPickerPos.left,width:170,maxHeight:280,display:"flex",flexDirection:"column",background:c.sf,border:"1px solid rgba(232,194,82,0.22)",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:9999}}>
                                      <div style={{height:2,background:"linear-gradient(90deg,rgba(232,194,82,0.3),rgba(232,194,82,0.8),rgba(232,194,82,0.3))",flexShrink:0}}/>
                                      {/* Category tabs */}
                                      <div style={{display:"flex",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                                        {["Forex","Futures","Crypto","Stocks"].map(cat=>{
                                          const isA=newSessSupPickerCat===cat;
                                          const hk="supCatTab_"+cat;const isH=hov===hk;
                                          return(
                                            <div key={cat} onClick={()=>{setNewSessSupPickerCat(cat);setNewSessSupPickerSearch("");}}
                                              onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                              style={{flex:1,padding:"4px 0",textAlign:"center",fontSize:8,fontWeight:isA?700:500,color:isA?"rgba(232,194,82,0.9)":isH?c.tx:c.tm,cursor:"default",transition:"color 0.1s",position:"relative",fontFamily:F,letterSpacing:"0.04em"}}>
                                              {cat}
                                              {isA&&<div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:1,background:"linear-gradient(90deg,transparent,rgba(232,194,82,0.8),transparent)"}}/>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div style={{padding:"5px 8px",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                                        <input autoFocus value={newSessSupPickerSearch} onChange={e=>setNewSessSupPickerSearch(e.target.value)}
                                          placeholder="Search symbols…"
                                          style={{width:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0,boxSizing:"border-box"}}/>
                                      </div>
                                      <div className="tlr-scroll" style={{overflowY:"auto",flex:1}}>
                                        {(()=>{
                                          const catKey=catMap[newSessSupPickerCat]||newSessSupPickerCat;
                                          const pool=allSymbols.filter(s=>s.cat===catKey&&(!newSessSupPickerSearch||s.sym.toLowerCase().includes(newSessSupPickerSearch.toLowerCase())));
                                          if(pool.length===0)return <div style={{padding:"8px 10px",fontSize:10,color:c.tm,fontFamily:F}}>No results</div>;
                                          return pool.map(s=>{
                                            const isChk=newSessSupportTickers.includes(s.sym);
                                            const hk="suppick_"+s.sym;const isH=hov===hk;
                                            const bCol=isChk?"rgba(232,194,82,0.9)":isH?c.tx:c.ts;
                                            return(
                                              <div key={s.sym} onClick={()=>{if(isChk){setNewSessSupportTickers(p=>p.filter(x=>x!==s.sym));}else if(newSessSupportTickers.length<10){setNewSessSupportTickers(p=>[...p,s.sym]);}}}
                                                onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                                style={{display:"flex",alignItems:"center",padding:"4px 8px",gap:6,cursor:"default",opacity:!isChk&&newSessSupportTickers.length>=10?0.35:1,background:isH&&(isChk||newSessSupportTickers.length<10)?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.08s,opacity 0.1s"}}>
                                                <svg width={10} height={10} style={{display:"block",overflow:"visible",flexShrink:0}}>
                                                  <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  {!isChk&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.5)" strokeWidth={1} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.5)" strokeWidth={1} fill="none" strokeLinecap="square"/></>}
                                                  {isChk&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.9)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.9)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill="rgba(232,194,82,0.85)" opacity={0.15}/><circle cx={5} cy={5} r={1.6} fill="rgba(232,194,82,0.85)"/></>}
                                                </svg>
                                                {mkFlags(s.sym,10)}
                                                <span style={{fontSize:10,fontWeight:isChk?700:500,color:isChk?"rgba(232,194,82,0.9)":isH?c.tx:c.ts,fontFamily:F}}>{s.sym}</span>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    </div>
                                  </>)}
                                </div>
                                {/* Tags — 5 per row, max 2 rows (10 symbols) */}
                                <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:3,alignContent:"flex-start"}}>
                                  {newSessSupportTickers.length>0
                                    ?newSessSupportTickers.slice(0,10).map(t=>mkCell(t,e=>{e.stopPropagation();setNewSessSupportTickers(p=>p.filter(x=>x!==t));}))
                                    :<span style={{fontSize:9,color:c.tm,fontFamily:F,gridColumn:"1/-1",lineHeight:"40px"}}>—</span>
                                  }
                                </div>
                              </div>
                            </div>
                            {/* ── Date Range row ── */}
                            <div>
                              {lbl("Date Range *")}
                              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                                {/* Date inputs — 50% width matches market dropdown above */}
                                <div style={{width:"50%",flexShrink:0,display:"flex",gap:6}}>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:9,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4,fontFamily:F}}>Start</div>
                                    <div style={{display:"flex",alignItems:"center",background:c.well,border:`1px solid ${newSessCalOpen&&newSessCalTarget==="start"?c.acL:c.brH}`,transition:"border-color 0.12s"}}>
                                      <input value={newSessStartInput} placeholder="DD-Mon-YYYY" onClick={e=>e.stopPropagation()}
                                        onChange={e=>{setNewSessStartInput(e.target.value);applyD(e.target.value,setNewSessStart);setNewSessActivePreset(null);}}
                                        onBlur={()=>{if(newSessStart)setNewSessStartInput(fmtD(newSessStart));}}
                                        style={inpSx}/>
                                      <div onClick={e=>{e.stopPropagation();if(newSessCalOpen&&newSessCalTarget==="start"){setNewSessCalOpen(false);}else{openCal(e,"start",newSessStart);}}} style={chvSx}>
                                        <ChevD open={newSessCalOpen&&newSessCalTarget==="start"}/>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:9,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4,fontFamily:F}}>End</div>
                                    <div style={{display:"flex",alignItems:"center",background:c.well,border:`1px solid ${newSessCalOpen&&newSessCalTarget==="end"?c.acL:(newSessEnd&&newSessStart&&newSessEnd<newSessStart?c.rd:c.brH)}`,transition:"border-color 0.12s"}}>
                                      <input value={newSessEndInput} placeholder="DD-Mon-YYYY" onClick={e=>e.stopPropagation()}
                                        onChange={e=>{setNewSessEndInput(e.target.value);applyD(e.target.value,v=>{if(!newSessStart||v>=newSessStart)setNewSessEnd(v);});setNewSessActivePreset(null);}}
                                        onBlur={()=>{if(newSessEnd&&newSessStart&&newSessEnd<newSessStart){setNewSessEnd("");setNewSessEndInput("");}else if(newSessEnd){setNewSessEndInput(fmtD(newSessEnd));}}}
                                        style={inpSx}/>
                                      <div onClick={e=>{e.stopPropagation();if(newSessCalOpen&&newSessCalTarget==="end"){setNewSessCalOpen(false);}else{openCal(e,"end",newSessEnd);}}} style={chvSx}>
                                        <ChevD open={newSessCalOpen&&newSessCalTarget==="end"}/>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {/* Right section aligned with Markets row right section */}
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  {/* Date Random button */}
                                  <div onClick={e=>{e.stopPropagation();randomRange();}}
                                    onMouseEnter={()=>setHov("drndBtn")} onMouseLeave={()=>setHov(null)}
                                    style={{padding:"0 10px",height:27,display:"flex",alignItems:"center",gap:6,background:c.el,border:`1px solid ${hov==="drndBtn"?c.acB:c.brH}`,cursor:"default",fontSize:10,fontWeight:700,color:hov==="drndBtn"?c.acL:c.ts,letterSpacing:"0.06em",fontFamily:F,flexShrink:0,whiteSpace:"nowrap",transition:"color 0.12s,border-color 0.12s"}}>
                                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
                                      <polyline points="16,3 21,3 21,8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                      <polyline points="21,16 21,21 16,21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                      <line x1="4" y1="20" x2="21" y2="3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                      <line x1="4" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                      <line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                                    </svg>
                                    Random
                                  </div>
                                  {/* Range count spinner */}
                                  <div style={{position:"relative",width:49,height:27,background:c.el,border:`1px solid ${c.brH}`,boxSizing:"border-box",flexShrink:0}}>
                                    <input type="number" min={1} max={unitMax[newSessRandRangeUnit]} value={newSessRandRangeVal}
                                      onChange={e=>setNewSessRandRangeVal(Math.min(unitMax[newSessRandRangeUnit],Math.max(1,parseInt(e.target.value)||1)))}
                                      onClick={e=>e.stopPropagation()}
                                      className="tlr-nospinner"
                                      style={{position:"absolute",left:0,right:18,top:0,bottom:0,width:"calc(100% - 18px)",height:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:11,fontWeight:600,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"center",padding:0,boxSizing:"border-box"}}/>
                                    <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                      {[[1,"▲"],[-1,"▼"]].map(([delta,chr],i)=>(
                                        <button key={i} onClick={e=>{e.stopPropagation();setNewSessRandRangeVal(v=>Math.min(unitMax[newSessRandRangeUnit],Math.max(1,v+delta)));}}
                                          onMouseEnter={e=>e.currentTarget.style.color=c.acL} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                          style={{flex:1,width:18,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,borderBottom:i===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                          {chr}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {/* Unit dropdown — Days / Months / Years */}
                                  {(()=>{
                                    const UNITS=[["D","Days"],["M","Months"],["Y","Years"]];
                                    const curLabel=UNITS.find(([u])=>u===newSessRandRangeUnit)?.[1]||"Months";
                                    const ddKey="randUnitDrop";
                                    return(
                                      <div style={{position:"relative",width:88,flexShrink:0}}>
                                        <div onClick={e=>{e.stopPropagation();if(dropdown===ddKey){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown(ddKey);}}}
                                          style={{height:27,display:"flex",alignItems:"center",padding:"0 22px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown===ddKey?c.acB:c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                          <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>{curLabel}</span>
                                          <svg style={{position:"absolute",right:6,top:"50%",transform:`translateY(-50%) rotate(${dropdown===ddKey?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        </div>
                                        {dropdown===ddKey&&ddAnchor&&(<>
                                          <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
                                            <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                            {UNITS.map(([u,label])=>{
                                              const isA=newSessRandRangeUnit===u;const isH=hov==="ruOpt_"+u;
                                              return(
                                                <div key={u} onClick={e=>{e.stopPropagation();setNewSessRandRangeUnit(u);setNewSessRandRangeVal(v=>Math.min(unitMax[u],Math.max(1,v)));setDropdown(null);setDdAnchor(null);}}
                                                  onMouseEnter={()=>setHov("ruOpt_"+u)} onMouseLeave={()=>setHov(null)}
                                                  style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isA?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                                  {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                                  <span style={{fontSize:10,fontWeight:isA?700:500,color:isA?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </>)}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>{/* end date range wrapper */}

                            {/* ── Preset chips ── */}
                            <div style={{display:"flex",gap:4}}>
                              {presets.map(p=>{
                                const isA=newSessActivePreset===p.l;const hk="preset_"+p.l;const isH=hov===hk;
                                return(
                                  <div key={p.l} onClick={e=>{e.stopPropagation();applyPreset(p.months,p.years);setNewSessCalOpen(false);setNewSessActivePreset(p.l);}}
                                    onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                    style={{height:27,padding:"0 10px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",
                                      fontSize:10,fontWeight:isA?700:600,letterSpacing:"0.03em",fontFamily:F,
                                      color:isA?c.acL:isH?c.tx:c.ts,
                                      background:isA?"rgba(74,106,255,0.08)":isH?"rgba(255,255,255,0.05)":"transparent",
                                      cursor:"default",transition:"background 0.12s,color 0.12s"}}>
                                    {p.l}
                                    {isA&&<div style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:2,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`,pointerEvents:"none"}}/>}
                                    {!isA&&isH&&<div style={{position:"absolute",bottom:0,left:"25%",right:"25%",height:1,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)`,pointerEvents:"none"}}/>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {/* ── Market sub-window ── */}
                            {newSessMarketOpen&&(
                              <div style={{position:"fixed",inset:0,zIndex:100001,display:"flex",alignItems:"center",justifyContent:"center"}}
                                onClick={()=>setNewSessMarketOpen(false)}>
                                <div onClick={e=>e.stopPropagation()}
                                  style={{position:"relative",width:860,height:480,background:c.sf,border:`1px solid ${c.brH}`,display:"flex",flexDirection:"column",animation:"tlrPopIn 0.18s ease",boxShadow:"0 24px 80px rgba(0,0,0,0.92)",fontFamily:F,overflow:"hidden"}}>
                                  {/* Top accent */}
                                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,flexShrink:0}}/>
                                  {/* Header */}
                                  <div style={{display:"flex",alignItems:"center",padding:"9px 14px",flexShrink:0}}>
                                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{marginRight:8,flexShrink:0}}><rect x="3" y="3" width="7" height="18" rx="0.8" stroke={c.acL} strokeWidth="1.5"/><rect x="14" y="8" width="7" height="13" rx="0.8" stroke={c.acL} strokeWidth="1.5"/><line x1="3" y1="12" x2="10" y2="12" stroke={c.acL} strokeWidth="1" opacity="0.45"/><line x1="14" y1="15" x2="21" y2="15" stroke={c.acL} strokeWidth="1" opacity="0.45"/></svg>
                                    <span style={{fontSize:12,fontWeight:700,color:c.tx,flex:1}}>Configure Markets</span>
                                    <div onClick={()=>setNewSessMarketOpen(false)}
                                      onMouseEnter={()=>setHov("mktCfgX")} onMouseLeave={()=>setHov(null)}
                                      style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",background:hov==="mktCfgX"?"rgba(255,80,80,0.07)":"transparent",transition:"background 0.12s"}}>
                                      <I n="x" s={18} cl={hov==="mktCfgX"?c.rd:c.ts}/>
                                    </div>
                                  </div>
                                  <div style={{height:1,background:c.br,flexShrink:0}}/>
                                  {/* Body: two columns side by side */}
                                  <div style={{flex:1,display:"flex",overflow:"hidden"}}>

                                    {/* ── LEFT: TRADING ── */}
                                    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                                      {/* Column header */}
                                      <div style={{height:34,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",borderBottom:`1px solid ${c.br}`}}>
                                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                                          <div style={{width:2,height:11,background:c.acL,boxShadow:`0 0 5px ${c.acG}`}}/>
                                          <span style={{fontSize:9,fontWeight:800,color:c.acL,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:F}}>Trading</span>
                                          <div style={{position:"relative",display:"inline-flex",alignItems:"center"}}
                                            onMouseEnter={()=>setNewSessInfoHov("cfg-trading")}
                                            onMouseLeave={()=>setNewSessInfoHov(null)}>
                                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block",cursor:"default",flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                            {newSessInfoHov==="cfg-trading"&&(
                                              <div style={{position:"absolute",left:0,top:"calc(100% + 6px)",background:c.el,border:`1px solid ${c.br}`,zIndex:200,whiteSpace:"nowrap",pointerEvents:"none"}}>
                                                <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                                <div style={{padding:"5px 10px",fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>Instruments you will actively trade — orders and P&L are tracked</div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                                          {newSessTickers.length>0&&(
                                            <div onClick={()=>setNewSessTickers([])}
                                              onMouseEnter={()=>setHov("mktTrdClr")} onMouseLeave={()=>setHov(null)}
                                              style={{display:"flex",alignItems:"center",gap:3,cursor:"default",color:hov==="mktTrdClr"?c.rd:c.tm,transition:"color 0.1s"}}>
                                              <I n="trashDraw" s={11} cl={hov==="mktTrdClr"?c.rd:c.tm}/>
                                            </div>
                                          )}
                                          <span style={{fontSize:10,fontWeight:700,color:c.acL,fontFamily:F}}>{newSessTickers.length}<span style={{color:c.tm,fontWeight:500}}>/10</span></span>
                                        </div>
                                      </div>
                                      {/* Selected chips strip — TRADING */}
                                      <div style={{height:80,flexShrink:0,borderBottom:`1px solid ${c.br}`,padding:"6px 14px",display:"flex",flexWrap:"wrap",alignItems:"flex-start",alignContent:"flex-start",gap:4,overflow:"hidden"}}>
                                        {newSessTickers.length===0?(
                                          <span style={{fontSize:9,color:c.tm,fontFamily:F,fontStyle:"italic",whiteSpace:"nowrap"}}>No trading symbols selected</span>
                                        ):newSessTickers.map(sym=>(
                                          <div key={sym} style={{width:90,display:"flex",alignItems:"center",gap:3,padding:"2px 5px",background:"transparent",border:`1px solid rgba(140,160,255,0.28)`,flexShrink:0,overflow:"hidden"}}>
                                            <div style={{flexShrink:0}}>{mkFlags(sym,10)}</div>
                                            <span style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sym}</span>
                                            <span onClick={()=>setNewSessTickers(p=>p.filter(x=>x!==sym))} style={{fontSize:12,lineHeight:1,color:c.tm,cursor:"default",transition:"color 0.1s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.color=c.rd} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</span>
                                          </div>
                                        ))}
                                      </div>
                                      {/* Category tabs — locked to selected market */}
                                      {(()=>{
                                        const mktTabs=["Forex","Futures","Crypto","Stocks"];
                                        const mktIdx=mktTabs.indexOf(newSessAssetClass);
                                        return(
                                          <div style={{position:"relative",display:"flex",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                                            {mktTabs.map(a=>{
                                              const isAct=newSessAssetClass===a;
                                              const isLocked=!isAct;
                                              return(
                                                <div key={a}
                                                  style={{flex:1,height:30,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:isAct?700:500,color:isAct?c.acL:"rgba(255,255,255,0.2)",cursor:"not-allowed",background:"transparent",transition:"color 0.12s",userSelect:"none",opacity:isLocked?0.45:1}}>
                                                  {a}
                                                </div>
                                              );
                                            })}
                                            <div style={{position:"absolute",bottom:0,height:1.5,width:"25%",left:`${mktIdx*25}%`,background:`linear-gradient(90deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`,pointerEvents:"none"}}/>
                                          </div>
                                        );
                                      })()}
                                      {/* Search */}
                                      <div style={{padding:"7px 14px",flexShrink:0,borderBottom:`1px solid ${c.br}`}}>
                                        <div style={{display:"flex",alignItems:"center",background:c.el,border:`1px solid ${newSessTickerFocus?c.acB:c.brH}`,height:25,padding:"0 8px",gap:5,transition:"border-color 0.12s"}}>
                                          <svg width={9} height={9} viewBox="0 0 16 16" fill="none" style={{flexShrink:0,opacity:0.4}}><circle cx="7" cy="7" r="5" stroke={c.ts} strokeWidth="1.6"/><line x1="11" y1="11" x2="14" y2="14" stroke={c.ts} strokeWidth="1.6" strokeLinecap="round"/></svg>
                                          <input value={newSessTickerInput} onChange={e=>setNewSessTickerInput(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g,""))}
                                            onFocus={()=>setNewSessTickerFocus(true)} onBlur={()=>setNewSessTickerFocus(false)}
                                            placeholder="Search…"
                                            style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0}}/>
                                          {newSessTickerInput&&<div onClick={()=>setNewSessTickerInput("")} style={{fontSize:13,color:c.tm,cursor:"default",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=c.ts} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</div>}
                                        </div>
                                      </div>
                                      {/* Symbol list */}
                                      {(()=>{
                                        const primCat=catMap[newSessAssetClass]||newSessAssetClass;
                                        const primList=allSymbols.filter(s=>s.cat===primCat&&(newSessTickerInput.trim()?s.sym.includes(newSessTickerInput.trim()):true));
                                        return(
                                          <div style={{flex:1,overflowY:"auto"}} className="tlr-scroll">
                                            {primList.length===0?<div style={{padding:"20px",fontSize:11,color:c.tm,textAlign:"center",fontFamily:F}}>No results</div>:primList.map(({sym})=>{
                                              const isSel=newSessTickers.includes(sym);
                                              const isOther=newSessSupportTickers.includes(sym);
                                              const isMax=!isSel&&newSessTickers.length>=10;
                                              const blocked=isOther||isMax;
                                              return(
                                                <div key={sym} onClick={()=>{if(blocked)return;if(isSel)setNewSessTickers(p=>p.filter(x=>x!==sym));else setNewSessTickers(p=>[...p,sym]);}}
                                                  style={{display:"flex",alignItems:"center",padding:"5px 14px",cursor:blocked?"not-allowed":"default",position:"relative",background:"transparent",opacity:isOther?0.35:isMax?0.5:1,transition:"background 0.1s"}}
                                                  onMouseEnter={e=>{if(!blocked)e.currentTarget.style.background="rgba(255,255,255,0.04)";}}
                                                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                                                  {isSel&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                                  <div style={{width:10,height:10,flexShrink:0,marginRight:8}}>
                                                    <svg width={10} height={10} style={{display:"block",overflow:"visible",flexShrink:0}}>
                                                      <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={isSel?c.acL:"rgba(140,160,255,0.22)"} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                      <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={isSel?c.acL:"rgba(140,160,255,0.22)"} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                      {isSel&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke={c.acL} strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill={c.acL} opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill={c.acL}/></>}
                                                    </svg>
                                                  </div>
                                                  <div style={{marginRight:8,flexShrink:0}}>{mkFlags(sym,12)}</div>
                                                  <span style={{flex:1,fontSize:11,fontWeight:isSel?700:500,color:isSel?c.acL:c.ts,fontFamily:F}}>{sym}</span>
                                                  {isOther&&<span style={{fontSize:8,fontWeight:700,color:"rgba(232,194,82,0.65)",fontFamily:F,flexShrink:0}}>SUPPORTING</span>}
                                                  {isMax&&!isOther&&<span style={{fontSize:8,fontWeight:600,color:c.tm,fontFamily:F,flexShrink:0}}>MAX</span>}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    {/* Vertical divider */}
                                    <div style={{width:1,flexShrink:0,background:`linear-gradient(180deg,transparent,${c.br} 12%,${c.br} 88%,transparent)`}}/>

                                    {/* ── RIGHT: SUPPORTING ── */}
                                    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                                      {/* Column header */}
                                      <div style={{height:34,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",borderBottom:`1px solid ${c.br}`}}>
                                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                                          <div style={{width:2,height:11,background:newSessSupportEnabled?"rgba(232,194,82,0.85)":"rgba(140,160,255,0.15)",boxShadow:newSessSupportEnabled?`0 0 5px rgba(232,194,82,0.35)`:"none",transition:"background 0.15s"}}/>
                                          {/* Enable/disable checkbox */}
                                          {(()=>{
                                            const isH=hov==="mktSupEnable";
                                            const on=newSessSupportEnabled;
                                            const bCol=on?"rgba(232,194,82,0.85)":isH?c.ts:"rgba(140,160,255,0.22)";
                                            return(
                                              <div onClick={()=>setNewSessSupportEnabled(v=>!v)}
                                                onMouseEnter={()=>setHov("mktSupEnable")} onMouseLeave={()=>setHov(null)}
                                                style={{width:10,height:10,flexShrink:0,cursor:"default"}}>
                                                <svg width={10} height={10} style={{display:"block",overflow:"visible"}}>
                                                  <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={bCol} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                  {!on&&isH&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.35)" strokeWidth={1} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.35)" strokeWidth={1} fill="none" strokeLinecap="square"/></>}
                                                  {on&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.85)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.85)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill="rgba(232,194,82,0.85)" opacity={0.15}/><circle cx={5} cy={5} r={1.6} fill="rgba(232,194,82,0.85)"/></>}
                                                </svg>
                                              </div>
                                            );
                                          })()}
                                          <span style={{fontSize:9,fontWeight:800,color:newSessSupportEnabled?"rgba(232,194,82,0.9)":c.tm,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:F,transition:"color 0.15s"}}>Supporting</span>
                                          <div style={{position:"relative",display:"inline-flex",alignItems:"center"}}
                                            onMouseEnter={()=>setNewSessInfoHov("cfg-supporting")}
                                            onMouseLeave={()=>setNewSessInfoHov(null)}>
                                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block",cursor:"default",flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                            {newSessInfoHov==="cfg-supporting"&&(
                                              <div style={{position:"absolute",left:0,top:"calc(100% + 6px)",background:c.el,border:`1px solid ${c.br}`,zIndex:200,whiteSpace:"nowrap",pointerEvents:"none"}}>
                                                <div style={{height:2,background:`linear-gradient(90deg,rgba(232,194,82,0.3),rgba(232,194,82,0.8),rgba(232,194,82,0.3))`}}/>
                                                <div style={{padding:"5px 10px",fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>View-only instruments for context — no orders, no P&L tracking</div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                                          {newSessSupportTickers.length>0&&(
                                            <div onClick={()=>setNewSessSupportTickers([])}
                                              onMouseEnter={()=>setHov("mktSupClr")} onMouseLeave={()=>setHov(null)}
                                              style={{display:"flex",alignItems:"center",gap:3,cursor:"default",color:hov==="mktSupClr"?c.rd:c.tm,transition:"color 0.1s"}}>
                                              <I n="trashDraw" s={11} cl={hov==="mktSupClr"?c.rd:c.tm}/>
                                            </div>
                                          )}
                                          <span style={{fontSize:10,fontWeight:700,color:"rgba(232,194,82,0.9)",fontFamily:F}}>{newSessSupportTickers.length}<span style={{color:c.tm,fontWeight:500}}>/10</span></span>
                                        </div>
                                      </div>
                                      {/* Column body — dimmed when supporting disabled */}
                                      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",opacity:newSessSupportEnabled?1:0.3,pointerEvents:newSessSupportEnabled?"auto":"none",transition:"opacity 0.18s"}}>
                                      {/* Selected chips strip — SUPPORTING */}
                                      <div style={{height:80,flexShrink:0,borderBottom:`1px solid ${c.br}`,padding:"6px 14px",display:"flex",flexWrap:"wrap",alignItems:"flex-start",alignContent:"flex-start",gap:4,overflow:"hidden"}}>
                                        {newSessSupportTickers.length===0?(
                                          <span style={{fontSize:9,color:c.tm,fontFamily:F,fontStyle:"italic",whiteSpace:"nowrap"}}>No supporting symbols selected</span>
                                        ):newSessSupportTickers.map(sym=>(
                                          <div key={sym} style={{width:90,display:"flex",alignItems:"center",gap:3,padding:"2px 5px",background:"transparent",border:`1px solid rgba(232,194,82,0.3)`,flexShrink:0,overflow:"hidden"}}>
                                            <div style={{flexShrink:0}}>{mkFlags(sym,10)}</div>
                                            <span style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sym}</span>
                                            <span onClick={()=>setNewSessSupportTickers(p=>p.filter(x=>x!==sym))} style={{fontSize:12,lineHeight:1,color:c.tm,cursor:"default",transition:"color 0.1s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.color=c.rd} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</span>
                                          </div>
                                        ))}
                                      </div>
                                      {/* Category tabs — gold accent */}
                                      {(()=>{
                                        const supTabs=["Forex","Futures","Crypto","Stocks"];
                                        const supIdx=supTabs.indexOf(newSessSupportAssetClass);
                                        return(
                                          <div style={{position:"relative",display:"flex",borderBottom:`1px solid ${c.br}`,flexShrink:0}}>
                                            {supTabs.map(a=>{
                                              const isAct=newSessSupportAssetClass===a;
                                              const hk=`mktSupTab-${a}`;
                                              const isH=hov===hk;
                                              return(
                                                <div key={a} onClick={()=>{setNewSessSupportAssetClass(a);setNewSessSupportInput("");}}
                                                  onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                                  style={{flex:1,height:30,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:isAct?700:500,color:isAct?"rgba(232,194,82,0.9)":isH?c.tx:c.ts,cursor:"default",background:isH&&!isAct?"rgba(255,255,255,0.04)":"transparent",transition:"color 0.12s,background 0.12s"}}>
                                                  {a}
                                                </div>
                                              );
                                            })}
                                            <div style={{position:"absolute",bottom:0,height:1.5,width:"25%",left:`${supIdx*25}%`,transition:"left 0.22s cubic-bezier(0.4,0,0.2,1)",background:`linear-gradient(90deg,transparent,rgba(232,194,82,0.85),transparent)`,boxShadow:`0 0 6px rgba(232,194,82,0.4)`,pointerEvents:"none"}}/>
                                          </div>
                                        );
                                      })()}
                                      {/* Search */}
                                      <div style={{padding:"7px 14px",flexShrink:0,borderBottom:`1px solid ${c.br}`}}>
                                        <div style={{display:"flex",alignItems:"center",background:c.el,border:`1px solid ${newSessSupportFocus?"rgba(232,194,82,0.5)":c.brH}`,height:25,padding:"0 8px",gap:5,transition:"border-color 0.12s"}}>
                                          <svg width={9} height={9} viewBox="0 0 16 16" fill="none" style={{flexShrink:0,opacity:0.4}}><circle cx="7" cy="7" r="5" stroke={c.ts} strokeWidth="1.6"/><line x1="11" y1="11" x2="14" y2="14" stroke={c.ts} strokeWidth="1.6" strokeLinecap="round"/></svg>
                                          <input value={newSessSupportInput} onChange={e=>setNewSessSupportInput(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g,""))}
                                            onFocus={()=>setNewSessSupportFocus(true)} onBlur={()=>setNewSessSupportFocus(false)}
                                            placeholder="Search…"
                                            style={{flex:1,background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:600,fontFamily:F,padding:0}}/>
                                          {newSessSupportInput&&<div onClick={()=>setNewSessSupportInput("")} style={{fontSize:13,color:c.tm,cursor:"default",lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=c.ts} onMouseLeave={e=>e.currentTarget.style.color=c.tm}>×</div>}
                                        </div>
                                      </div>
                                      {/* Symbol list */}
                                      {(()=>{
                                        const suppCat=catMap[newSessSupportAssetClass]||newSessSupportAssetClass;
                                        const suppList=allSymbols.filter(s=>s.cat===suppCat&&(newSessSupportInput.trim()?s.sym.includes(newSessSupportInput.trim()):true));
                                        return(
                                          <div style={{flex:1,overflowY:"auto"}} className="tlr-scroll">
                                            {suppList.length===0?<div style={{padding:"20px",fontSize:11,color:c.tm,textAlign:"center",fontFamily:F}}>No results</div>:suppList.map(({sym})=>{
                                              const isSel=newSessSupportTickers.includes(sym);
                                              const isOther=newSessTickers.includes(sym);
                                              const isMax=!isSel&&newSessSupportTickers.length>=10;
                                              const blocked=isOther||isMax;
                                              return(
                                                <div key={sym} onClick={()=>{if(blocked)return;if(isSel)setNewSessSupportTickers(p=>p.filter(x=>x!==sym));else setNewSessSupportTickers(p=>[...p,sym]);}}
                                                  style={{display:"flex",alignItems:"center",padding:"5px 14px",cursor:blocked?"not-allowed":"default",position:"relative",background:"transparent",opacity:isOther?0.35:isMax?0.5:1,transition:"background 0.1s"}}
                                                  onMouseEnter={e=>{if(!blocked)e.currentTarget.style.background="rgba(255,255,255,0.04)";}}
                                                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                                                  {isSel&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,rgba(232,194,82,0.8),transparent)`,boxShadow:`0 0 6px rgba(232,194,82,0.4)`}}/>}
                                                  <div style={{width:10,height:10,flexShrink:0,marginRight:8}}>
                                                    <svg width={10} height={10} style={{display:"block",overflow:"visible",flexShrink:0}}>
                                                      <path d="M0.8,4 L0.8,0.8 L4,0.8" stroke={isSel?"rgba(232,194,82,0.85)":"rgba(140,160,255,0.22)"} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                      <path d="M6,9.2 L9.2,9.2 L9.2,6" stroke={isSel?"rgba(232,194,82,0.85)":"rgba(140,160,255,0.22)"} strokeWidth={1.3} fill="none" strokeLinecap="square"/>
                                                      {isSel&&<><path d="M6,0.8 L9.2,0.8 L9.2,4" stroke="rgba(232,194,82,0.85)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><path d="M0.8,6 L0.8,9.2 L4,9.2" stroke="rgba(232,194,82,0.85)" strokeWidth={1.3} fill="none" strokeLinecap="square"/><circle cx={5} cy={5} r={2.8} fill="rgba(232,194,82,0.85)" opacity={0.12}/><circle cx={5} cy={5} r={1.6} fill="rgba(232,194,82,0.85)"/></>}
                                                    </svg>
                                                  </div>
                                                  <div style={{marginRight:8,flexShrink:0}}>{mkFlags(sym,12)}</div>
                                                  <span style={{flex:1,fontSize:11,fontWeight:isSel?700:500,color:isSel?"rgba(232,194,82,0.9)":c.ts,fontFamily:F}}>{sym}</span>
                                                  {isOther&&<span style={{fontSize:8,fontWeight:700,color:c.acL,fontFamily:F,flexShrink:0,opacity:0.7}}>TRADING</span>}
                                                  {isMax&&!isOther&&<span style={{fontSize:8,fontWeight:600,color:c.tm,fontFamily:F,flexShrink:0}}>MAX</span>}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}
                                      </div>{/* end body wrapper */}
                                    </div>
                                  </div>

                                  {/* Bottom bar */}
                                  <div style={{height:42,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",borderTop:`1px solid ${c.br}`,background:c.el}}>
                                    <span style={{fontSize:10,color:c.tm,fontFamily:F}}>
                                      {(newSessTickers.length+newSessSupportTickers.length)===0?"No markets selected":`${newSessTickers.length}/10 trading · ${newSessSupportTickers.length}/10 supporting`}
                                    </span>
                                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                                      <div onClick={()=>setNewSessMarketOpen(false)}
                                        onMouseEnter={()=>setHov("mktCfgCancel")} onMouseLeave={()=>setHov(null)}
                                        style={{height:27,padding:"0 14px",display:"flex",alignItems:"center",background:hov==="mktCfgCancel"?"rgba(255,255,255,0.07)":"transparent",border:`1px solid ${c.brH}`,cursor:"default",fontSize:10,fontWeight:600,color:hov==="mktCfgCancel"?c.tx:c.ts,letterSpacing:"0.04em",fontFamily:F,transition:"all 0.12s"}}>
                                        Cancel
                                      </div>
                                      <div onClick={()=>setNewSessMarketOpen(false)}
                                        onMouseEnter={()=>setHov("mktCfgDone")} onMouseLeave={()=>setHov(null)}
                                        style={{height:27,padding:"0 16px",display:"flex",alignItems:"center",gap:5,background:`linear-gradient(135deg,${c.ac},${c.acL})`,cursor:"default",fontSize:10,fontWeight:700,color:"#fff",letterSpacing:"0.05em",fontFamily:F,boxShadow:"0 2px 10px rgba(38,67,247,0.35)",filter:hov==="mktCfgDone"?"brightness(1.15)":"brightness(1)",transition:"filter 0.12s"}}>
                                        <svg width={11} height={11} viewBox="0 0 12 12" fill="none"><path d="M1.5,6 L4.5,9.5 L10.5,2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Done
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          {/* ─── Timezone row ─── */}
                          {(()=>{
                            const TZ_OPTS=[
                              {val:"UTC",          label:"UTC / GMT"},
                              {val:"America/New_York",   label:"New York (ET)"},
                              {val:"America/Chicago",    label:"Chicago (CT)"},
                              {val:"America/Los_Angeles",label:"Los Angeles (PT)"},
                              {val:"Europe/London",      label:"London (GMT/BST)"},
                              {val:"Europe/Berlin",      label:"Frankfurt (CET/CEST)"},
                              {val:"Asia/Tokyo",         label:"Tokyo (JST)"},
                              {val:"Asia/Shanghai",      label:"Shanghai (CST)"},
                              {val:"Australia/Sydney",   label:"Sydney (AEST/AEDT)"},
                              {val:"Pacific/Auckland",   label:"Auckland (NZST/NZDT)"},
                            ];
                            const tzLabel=TZ_OPTS.find(o=>o.val===newSessTimezone)?.label||newSessTimezone;
                            const tzDdKey="sessTimezDrop";
                            return(
                              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                                {/* Timezone row */}
                                <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                                  <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130}}>Time Zone</span>
                                  <div style={{position:"relative",width:170}}>
                                    <div onClick={e=>{e.stopPropagation();if(dropdown===tzDdKey){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:Math.max(r.width/Z,200)});setDropdown(tzDdKey);}}}
                                      style={{height:27,display:"flex",alignItems:"center",padding:"0 24px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown===tzDdKey?c.acB:c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                      <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tzLabel}</span>
                                      <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown===tzDdKey?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </div>
                                    {dropdown===tzDdKey&&ddAnchor&&(<>
                                      <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                      <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:"0 8px 28px rgba(0,0,0,0.7)"}}>
                                        <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                        {TZ_OPTS.map(({val,label})=>{
                                          const isA=newSessTimezone===val;const isH=hov==="tzOpt_"+val;
                                          return(
                                            <div key={val} onClick={e=>{e.stopPropagation();setNewSessTimezone(val);setDropdown(null);setDdAnchor(null);}}
                                              onMouseEnter={()=>setHov("tzOpt_"+val)} onMouseLeave={()=>setHov(null)}
                                              style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isA?c.acD:isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>
                                              {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}
                                              <span style={{fontSize:10,fontWeight:isA?700:500,color:isA?c.acL:isH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </>)}
                                  </div>
                                </div>
                                {/* DST toggle */}
                                <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessDST(v=>!v)}>
                                  {TlChk(newSessDST,"chk_dst","",null)}
                                  <span style={{fontSize:10,fontWeight:600,color:newSessDST?c.ts:c.tm,fontFamily:F,transition:"color 0.12s",whiteSpace:"nowrap"}}>Daylight Saving</span>
                                </div>
                              </div>
                            );
                          })()}
                        </>);
                      })()}
                      </div>

                      {/* § Options */}
                      <div style={{border:`1px solid ${sessSettingsDone?c.brH:c.br}`,padding:"12px 14px",transition:"opacity 0.2s,border-color 0.2s",...(sessSettingsDone?activeBox:lockedBox)}}>
                      {secH("Options")}
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessAdvancedOrder(v=>!v)}>
                          {TlChk(newSessAdvancedOrder,"chk_advOrd","",null)}
                          <span style={{fontSize:10,fontWeight:600,color:newSessAdvancedOrder?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>Advanced order</span>
                          <span style={{fontSize:9,color:c.tm,fontFamily:F}}>— multiple entries, auto move-to-BE, trailing stop</span>
                        </div>
                        <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessRollback(v=>!v)}>
                          {TlChk(newSessRollback,"chk_rollback","",null)}
                          <span style={{fontSize:10,fontWeight:600,color:newSessRollback?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>Roll back</span>
                          <span style={{fontSize:9,color:c.tm,fontFamily:F}}>— step backward through bars during replay</span>
                        </div>
                        <div>
                          <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setNewSessTradingCostsEnabled(v=>!v)}>
                            {TlChk(newSessTradingCostsEnabled,"tcToggle2","",null)}
                            <span style={{fontSize:10,fontWeight:600,color:newSessTradingCostsEnabled?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>Real-World Trading Costs</span>
                            <span style={{fontSize:9,color:c.tm,fontFamily:F}}>— spreads & commissions</span>
                            <div style={{position:"relative",flexShrink:0}} onMouseEnter={()=>setHov("tcInfo2")} onMouseLeave={()=>setHov(null)}>
                              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={hov==="tcInfo2"?c.acL:c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:"block",cursor:"default",transition:"stroke 0.12s"}}>
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                              </svg>
                              {hov==="tcInfo2"&&(
                                <div style={{position:"absolute",left:"calc(100% + 8px)",top:"50%",transform:"translateY(-50%)",width:260,background:c.el,border:`1px solid ${c.br}`,zIndex:9999,pointerEvents:"none",whiteSpace:"normal"}}>
                                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                  <div style={{padding:"7px 10px",display:"flex",flexDirection:"column",gap:4}}>
                                    <span style={{fontSize:9,fontWeight:600,color:c.tx,fontFamily:F,lineHeight:1.45}}>Applies spread, commission, and leverage to every simulated trade.</span>
                                    <span style={{fontSize:9,color:c.ts,fontFamily:F,lineHeight:1.5}}>Values are typical — real spreads during high-impact news can be wider than configured.</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          {newSessTradingCostsEnabled&&(()=>{
                            const symCat={EURUSD:"Forex",GBPUSD:"Forex",USDJPY:"Forex",USDCHF:"Forex",AUDUSD:"Forex",NZDUSD:"Forex",USDCAD:"Forex",EURGBP:"Forex",EURJPY:"Forex",GBPJPY:"Forex",XAUUSD:"Forex",XAGUSD:"Forex",USDSEK:"Forex",USDNOK:"Forex",NQ:"Futures",ES:"Futures",YM:"Futures",RTY:"Futures",CL:"Futures",GC:"Futures",SI:"Futures",NG:"Futures",MNQ:"Futures",MES:"Futures",MYM:"Futures",M2K:"Futures",MGC:"Futures",MCL:"Futures",BTCUSD:"Crypto",ETHUSD:"Crypto",BNBUSD:"Crypto",SOLUSD:"Crypto",ADAUSD:"Crypto",AAPL:"Stocks",TSLA:"Stocks",NVDA:"Stocks",MSFT:"Stocks",AMZN:"Stocks",GOOG:"Stocks"};
                            const assetOf=cat=>({"Equities":"Stocks"}[cat]||cat);
                            const catOf2=sym=>assetOf(symCat[sym]||"");
                            const pairInfo2=sym=>{if(sym.length===6){const b=sym.slice(0,3),q=sym.slice(3,6);if(currencyCountry[b]&&currencyCountry[q])return{b,q};}return null;};
                            const mkFlags2=sym=>{
                              const sz=10,fw=Math.round(sz*15/11),fh=sz;
                              const pr=pairInfo2(sym);
                              if(pr)return(<div style={{position:"relative",width:Math.round(sz*22/11),height:fh,flexShrink:0}}><div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.7)",zIndex:2}}><FlagSvg code={pr.b} w={fw} h={fh}/></div><div style={{position:"absolute",left:Math.round(sz*7/11),top:0,borderRadius:1,overflow:"hidden",boxShadow:"0 1px 2px rgba(0,0,0,0.5)",zIndex:1}}><FlagSvg code={pr.q} w={fw} h={fh}/></div></div>);
                              const metalMap={XAUUSD:{bg:"#2B2200",fg:"#FFD700",label:"Au"},XAGUSD:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},GC:{bg:"#2B2200",fg:"#FFD700",label:"GC"},SI:{bg:"#1C2028",fg:"#C8D4E0",label:"SI"},CL:{bg:"#0D1A12",fg:"#4CAF50",label:"CL"},NG:{bg:"#0A1020",fg:"#64B5F6",label:"NG"},MGC:{bg:"#1A1200",fg:"#FFBA00",label:"mGC"},MCL:{bg:"#071510",fg:"#33CC66",label:"mCL"}};
                              if(metalMap[sym]){const m=metalMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:1,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} fill={m.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={m.fg} fontSize={fh*0.52} fontWeight="800" fontFamily={F}>{m.label}</text></svg>);}
                              const cryptoMap={BTCUSD:{bg:"#E8820C",fg:"#fff",label:"₿"},ETHUSD:{bg:"#3D4FC4",fg:"#fff",label:"Ξ"},BNBUSD:{bg:"#C99800",fg:"#000",label:"B"},SOLUSD:{bg:"#7B3FBE",fg:"#fff",label:"S"},ADAUSD:{bg:"#0033AD",fg:"#fff",label:"A"}};
                              if(cryptoMap[sym]){const cr=cryptoMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35),boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill={cr.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={cr.fg} fontSize={fh*0.58} fontWeight="900" fontFamily={F}>{cr.label}</text></svg>);}
                              return(<div style={{borderRadius:1,overflow:"hidden",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,0.6)"}}><FlagSvg code="US" w={fw} h={fh}/></div>);
                            };
                            const tcStepDecimals=(step)=>{const s=Number(step);if(!Number.isFinite(s)||s<=0)return 2;const p=String(s).split(".");return p[1]?p[1].length:0;};
                            const tcBumpNum=(val,step,dir)=>{const d=tcStepDecimals(step);const cur=parseFloat(val);const base=Number.isFinite(cur)?cur:0;return Math.max(0,base+dir*step).toFixed(d);};
                            const tcStepW=18;
                            const mkArrows=(onUp,onDown)=>(
                              <div style={{position:"absolute",right:0,top:0,bottom:0,width:tcStepW,display:"flex",flexDirection:"column",gap:2,padding:"1px 1px 1px 0",boxSizing:"border-box",borderLeft:`1px solid ${c.br}`}}>
                                {[[onUp,"▲","#22c55e","up"],[onDown,"▼","#ef4444","down"]].map(([fn,ch,accent,key])=>(
                                  <button key={key} type="button"
                                    onClick={e=>{e.stopPropagation();e.preventDefault();fn(e);}}
                                    onMouseDown={e=>{e.stopPropagation();e.currentTarget.style.background=accent;e.currentTarget.style.borderColor=accent;e.currentTarget.style.color="#fff";}}
                                    onMouseUp={e=>{e.currentTarget.style.background=c.el;e.currentTarget.style.borderColor=c.br;e.currentTarget.style.color=c.tm;}}
                                    onMouseLeave={e=>{e.currentTarget.style.background=c.el;e.currentTarget.style.borderColor=c.br;e.currentTarget.style.color=c.tm;}}
                                    style={{flex:1,width:"100%",minHeight:0,background:c.el,border:`1px solid ${c.br}`,borderRadius:2,color:c.tm,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,transition:"background 0.1s,color 0.1s,border-color 0.1s"}}>
                                    {ch}
                                  </button>
                                ))}
                              </div>
                            );
                            const numCell=(val,onChange,step,w=52)=>(
                              <div style={{position:"relative",width:w,height:22,flexShrink:0,background:c.bg,border:`1px solid ${c.brH}`,boxSizing:"border-box"}}>
                                <input type="number" min={0} step={step} value={val} onChange={onChange} onClick={e=>e.stopPropagation()} className="tlr-nospinner"
                                  style={{position:"absolute",left:0,right:tcStepW,top:0,bottom:0,width:`calc(100% - ${tcStepW}px)`,height:"100%",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"center",padding:0,boxSizing:"border-box"}}/>
                                {mkArrows(
                                  ()=>onChange({target:{value:tcBumpNum(val,step,1)}}),
                                  ()=>onChange({target:{value:tcBumpNum(val,step,-1)}})
                                )}
                              </div>
                            );
                            const costMeta={
                              Forex:   {color:c.ts,label:"FOREX",   spreadUnit:"pips",   commUnit:"$/lot RT",commLabel:"Commission",spreadStep:0.1, commStep:0.01, levOpts:["1:1","1:10","1:30","1:50","1:100","1:200","1:500"],defLev:"1:500",perSymComm:false},
                              Futures: {color:c.ts,label:"FUTURES",spreadUnit:"ticks",  commUnit:"$/RT",   commLabel:"Commission",spreadStep:1,   commStep:0.01, levOpts:[],                                                 defLev:"1:20", perSymComm:true, hideLev:true},
                              Stocks:  {color:c.ts,label:"STOCKS", spreadUnit:"$/share",commUnit:"$/share",commLabel:"Commission",spreadStep:0.01,commStep:0.001,levOpts:["1:1","1:2","1:3","1:5","1:10"],                   defLev:"1:5",  perSymComm:false,hideLev:true},
                              Crypto:  {color:c.ts,label:"CRYPTO", spreadUnit:"%",      commUnit:"%",      commLabel:"Taker Fee",  spreadStep:0.001,commStep:0.01,levOpts:["1:1","1:2","1:5","1:10","1:20","1:25","1:50","1:75","1:100","1:125"],defLev:"1:20",perSymComm:false},
                            };
                            const defaultComms={Forex:"7.00",Futures:"2.10",Stocks:"0.005",Crypto:"0.05"};
                            const defaultLevs={Forex:"1:500",Futures:"1:20",Stocks:"1:5",Crypto:"1:20"};
                            const defFut={NQ:{commission:"2.10",dayMargin:"1000",overnightMargin:"20680"},ES:{commission:"2.10",dayMargin:"500",overnightMargin:"13970"},YM:{commission:"2.10",dayMargin:"500",overnightMargin:"9075"},RTY:{commission:"2.10",dayMargin:"500",overnightMargin:"6600"},CL:{commission:"2.10",dayMargin:"1000",overnightMargin:"6000"},GC:{commission:"2.10",dayMargin:"1500",overnightMargin:"10000"},SI:{commission:"2.10",dayMargin:"2000",overnightMargin:"14000"},NG:{commission:"2.10",dayMargin:"500",overnightMargin:"2000"},MNQ:{commission:"2.10",dayMargin:"100",overnightMargin:"2068"},MES:{commission:"2.10",dayMargin:"50",overnightMargin:"1397"},MYM:{commission:"2.10",dayMargin:"50",overnightMargin:"908"},M2K:{commission:"2.10",dayMargin:"50",overnightMargin:"660"},MGC:{commission:"2.10",dayMargin:"150",overnightMargin:"1000"},MCL:{commission:"2.10",dayMargin:"100",overnightMargin:"600"}};
                            const getFd=sym=>({...(defFut[sym]||{commission:"2.10",dayMargin:"500",overnightMargin:"5000"}),...(newSessFuturesData[sym]||{})});
                            const setFd=(sym,key,val)=>setNewSessFuturesData(p=>({...p,[sym]:{...getFd(sym),[key]:val}}));
                            const tickSpec={NQ:{sz:"0.25 pt",val:"$5.00"},ES:{sz:"0.25 pt",val:"$12.50"},YM:{sz:"1 pt",val:"$5.00"},RTY:{sz:"0.10 pt",val:"$5.00"},CL:{sz:"$0.01",val:"$10.00"},GC:{sz:"$0.10",val:"$10.00"},SI:{sz:"$0.005",val:"$25.00"},NG:{sz:"$0.001",val:"$10.00"},MNQ:{sz:"0.25 pt",val:"$0.50"},MES:{sz:"0.25 pt",val:"$1.25"},MYM:{sz:"1 pt",val:"$0.50"},M2K:{sz:"0.10 pt",val:"$0.50"},MGC:{sz:"$0.10",val:"$1.00"},MCL:{sz:"$0.01",val:"$1.00"}};
                            const catOrder=["Forex","Futures","Stocks","Crypto"];
                            const activeCostCats=[...new Set([...newSessTickers.map(catOf2),...newSessSupportTickers.map(catOf2)])].filter(a=>costMeta[a]).sort((a,b)=>catOrder.indexOf(a)-catOrder.indexOf(b));
                            const defaultSpread={EURUSD:"0.8",GBPUSD:"1.0",USDJPY:"0.8",USDCHF:"1.1",AUDUSD:"0.8",NZDUSD:"1.2",USDCAD:"1.1",EURGBP:"1.1",EURJPY:"1.3",GBPJPY:"1.9",XAUUSD:"0.30",XAGUSD:"0.03",USDSEK:"3.0",USDNOK:"3.5",NQ:"1",ES:"1",YM:"1",RTY:"1",CL:"1",GC:"1",SI:"1",NG:"1",MNQ:"1",MES:"1",MYM:"1",M2K:"1",MGC:"1",MCL:"1",AAPL:"0.01",TSLA:"0.01",NVDA:"0.01",MSFT:"0.01",AMZN:"0.01",GOOG:"0.02",BTCUSD:"0.01",ETHUSD:"0.01",BNBUSD:"0.03",SOLUSD:"0.04",ADAUSD:"0.08"};
                            const getSpread=sym=>newSessSymbolSpreads[sym]??defaultSpread[sym]??"0";
                            const setSpread=(sym,val)=>setNewSessSymbolSpreads(p=>({...p,[sym]:val}));
                            if(activeCostCats.length===0){return(<div style={{background:c.el,border:`1px solid ${c.br}`,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c.tm} strokeWidth="1.5"/><line x1="12" y1="8" x2="12" y2="12" stroke={c.tm} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="16" r="1" fill={c.tm}/></svg><span style={{fontSize:9,color:c.tm,fontFamily:F}}>Select instruments above to configure trading costs</span></div>);}
                            return(
                              <div style={{background:c.el,border:`1px solid ${c.br}`}}>
                                <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                {activeCostCats.map((asset,i)=>{
                                  const meta=costMeta[asset];
                                  const row=newSessCosts[asset]||{commission:defaultComms[asset],leverage:meta.defLev};
                                  const setComm=val=>setNewSessCosts(p=>({...p,[asset]:{...p[asset],commission:val}}));
                                  const setLev=val=>setNewSessCosts(p=>({...p,[asset]:{...p[asset],leverage:val}}));
                                  const assetSyms=[...new Set([...newSessTickers.filter(t=>catOf2(t)===asset),...newSessSupportTickers.filter(t=>catOf2(t)===asset)])];
                                  const showCommRow=!meta.perSymComm||!meta.hideLev;
                                  return(
                                    <div key={asset} style={{padding:"8px 12px",borderBottom:i<activeCostCats.length-1?`1px solid ${c.br}`:"none"}}>
                                      <div style={{display:"flex",alignItems:"center",marginBottom:showCommRow?5:assetSyms.length>0?6:0}}>
                                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                                          <div style={{width:2,height:9,background:c.acL,flexShrink:0,boxShadow:`0 0 4px ${c.acG}`}}/>
                                          <span style={{fontSize:10,fontWeight:800,color:c.acL,letterSpacing:"0.09em",fontFamily:F}}>{meta.label}</span>
                                        </div>
                                        <div onClick={e=>{e.stopPropagation();setComm(defaultComms[asset]);setLev(defaultLevs[asset]);setNewSessSymbolSpreads(p=>{const n={...p};assetSyms.forEach(s=>delete n[s]);return n;});if(asset==="Futures")setNewSessFuturesData(p=>{const n={...p};assetSyms.forEach(s=>delete n[s]);return n;});}}
                                          onMouseEnter={()=>setHov("tcReset_"+asset)} onMouseLeave={()=>setHov(null)}
                                          onMouseDown={e=>{e.currentTarget.style.transform="scale(0.88)";e.currentTarget.style.opacity="0.6";}}
                                          onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.opacity="1";}}
                                          style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,cursor:"default",color:hov==="tcReset_"+asset?c.acL:c.tm,transition:"color 0.12s,opacity 0.1s",padding:"1px 4px"}}>
                                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                          <span style={{fontSize:9,fontWeight:600,fontFamily:F,letterSpacing:"0.03em"}}>Reset defaults</span>
                                        </div>
                                      </div>
                                      {showCommRow&&(
                                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:assetSyms.length>0?6:0,flexWrap:"wrap"}}>
                                          {!meta.perSymComm&&(<><span style={{fontSize:10,color:c.tm,fontFamily:F,whiteSpace:"nowrap"}}>{meta.commLabel}:</span>{numCell(row.commission,e=>setComm(e.target.value),meta.commStep,58)}<span style={{fontSize:10,color:c.tm,fontFamily:F,whiteSpace:"nowrap",marginLeft:-4}}>{meta.commUnit}</span></>)}
                                          {!meta.hideLev&&(<><span style={{fontSize:10,color:c.tm,fontFamily:F,whiteSpace:"nowrap"}}>Leverage:</span>
                                            <div style={{position:"relative",width:62,height:22,flexShrink:0}}>
                                              <div onClick={e=>{e.stopPropagation();if(dropdown==="lev_"+asset){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,minWidth:r.width/Z});setDropdown("lev_"+asset);setNewSessStratDropOpen(false);}}}
                                                style={{height:22,display:"flex",alignItems:"center",padding:"0 18px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown==="lev_"+asset?c.acB:c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                                <span style={{fontSize:10,fontWeight:700,color:c.tx,fontFamily:F}}>{row.leverage||meta.defLev}</span>
                                                <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown==="lev_"+asset?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                              </div>
                                              {dropdown==="lev_"+asset&&ddAnchor&&(
                                                <><div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                                <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,minWidth:ddAnchor.minWidth,zIndex:9999,background:c.sf,border:"1px solid rgba(140,160,255,0.22)",boxShadow:"0 4px 16px rgba(0,0,0,0.5)"}}>
                                                  <div style={{height:2,background:`linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`}}/>
                                                  {meta.levOpts.map(v=>{const isAct=v===(row.leverage||meta.defLev);const isHv=hov==="levOpt_"+asset+"_"+v;return(<div key={v} onClick={e=>{e.stopPropagation();setLev(v);setDropdown(null);setDdAnchor(null);}} onMouseEnter={()=>setHov("levOpt_"+asset+"_"+v)} onMouseLeave={()=>setHov(null)} style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isAct?c.acD:isHv?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>{isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.acL},transparent)`,boxShadow:`0 0 6px ${c.acG}`}}/>}<span style={{fontSize:10,fontWeight:isAct?700:500,color:isAct?c.acL:isHv?c.tx:c.ts,fontFamily:F}}>{v}</span></div>);})}
                                                </div></>
                                              )}
                                            </div>
                                          </>)}
                                        </div>
                                      )}
                                      {asset==="Futures"?(
                                        <div>
                                          <div style={{display:"grid",gridTemplateColumns:"52px 52px 52px 50px 54px 62px 72px",gap:7,paddingBottom:4,marginBottom:4,borderBottom:`1px solid ${c.br}`}}>
                                            {[["Symbol","","left"],["Tick","size","center"],["Tick","value","center"],["Spread","ticks","center"],["Comm","$/RT","center"],["Day","margin","center"],["Night","margin","center"]].map(([h,u,k])=>(<div key={h+u} style={{textAlign:k,lineHeight:1.2}}><div style={{fontSize:9,fontWeight:700,color:c.tm,fontFamily:F,letterSpacing:"0.03em",whiteSpace:"nowrap"}}>{h}{u&&<span style={{fontSize:8,fontWeight:500,fontStyle:"italic",opacity:0.75,marginLeft:2}}>{u}</span>}</div></div>))}
                                          </div>
                                          {assetSyms.map(sym=>{const fd=getFd(sym);const spd=getSpread(sym);const ts=tickSpec[sym]||{sz:"—",val:"—"};return(<div key={sym} style={{display:"grid",gridTemplateColumns:"52px 52px 52px 50px 54px 62px 72px",gap:7,marginBottom:4,alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:4}}>{mkFlags2(sym)}<span style={{fontSize:10,fontWeight:700,color:c.ts,fontFamily:F}}>{sym}</span></div><div style={{textAlign:"center",fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{ts.sz}</div><div style={{textAlign:"center",fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,fontVariantNumeric:"tabular-nums"}}>{ts.val}</div>{numCell(spd,e=>setSpread(sym,e.target.value),meta.spreadStep,50)}{numCell(fd.commission,e=>setFd(sym,"commission",e.target.value),0.01,54)}{numCell(fd.dayMargin,e=>setFd(sym,"dayMargin",e.target.value),50,62)}{numCell(fd.overnightMargin,e=>setFd(sym,"overnightMargin",e.target.value),50,72)}</div>);})}
                                        </div>
                                      ):(assetSyms.length>0&&(
                                        <div>
                                          <div style={{marginBottom:5,paddingBottom:4,borderBottom:`1px solid ${c.br}`}}><span style={{fontSize:9,fontWeight:700,color:c.tm,fontFamily:F,letterSpacing:"0.03em"}}>SPREAD</span><span style={{fontSize:8,fontWeight:500,fontStyle:"italic",color:c.tm,opacity:0.75,marginLeft:4,fontFamily:F}}>{meta.spreadUnit}</span></div>
                                          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
                                            {assetSyms.map(sym=>(<div key={sym} style={{display:"grid",gridTemplateColumns:"14px 1fr 48px",alignItems:"center",columnGap:3,background:c.bg,padding:"2px 5px",border:`1px solid ${c.br}`,height:24,boxSizing:"border-box",minWidth:0}}>{(()=>{const sz=8,fw=Math.round(sz*15/11),fh=sz;const pr=pairInfo2(sym);if(pr)return(<div style={{position:"relative",width:Math.round(sz*22/11),height:fh,flexShrink:0}}><div style={{position:"absolute",left:0,top:0,borderRadius:1,overflow:"hidden",zIndex:2}}><FlagSvg code={pr.b} w={fw} h={fh}/></div><div style={{position:"absolute",left:Math.round(sz*7/11),top:0,borderRadius:1,overflow:"hidden",zIndex:1}}><FlagSvg code={pr.q} w={fw} h={fh}/></div></div>);const metalMap={XAUUSD:{bg:"#2B2200",fg:"#FFD700",label:"Au"},XAGUSD:{bg:"#1C2028",fg:"#C8D4E0",label:"Ag"},GC:{bg:"#2B2200",fg:"#FFD700",label:"GC"},SI:{bg:"#1C2028",fg:"#C8D4E0",label:"SI"},CL:{bg:"#0D1A12",fg:"#4CAF50",label:"CL"},NG:{bg:"#0A1020",fg:"#64B5F6",label:"NG"},MGC:{bg:"#1A1200",fg:"#FFBA00",label:"mGC"},MCL:{bg:"#071510",fg:"#33CC66",label:"mCL"}};if(metalMap[sym]){const m=metalMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:1}}><rect width={fw} height={fh} fill={m.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={m.fg} fontSize={fh*0.52} fontWeight="800" fontFamily={F}>{m.label}</text></svg>);}const cryptoMap={BTCUSD:{bg:"#E8820C",fg:"#fff",label:"₿"},ETHUSD:{bg:"#3D4FC4",fg:"#fff",label:"Ξ"},BNBUSD:{bg:"#C99800",fg:"#000",label:"B"},SOLUSD:{bg:"#7B3FBE",fg:"#fff",label:"S"},ADAUSD:{bg:"#0033AD",fg:"#fff",label:"A"}};if(cryptoMap[sym]){const cr=cryptoMap[sym];return(<svg width={fw} height={fh} viewBox={`0 0 ${fw} ${fh}`} style={{display:"block",flexShrink:0,borderRadius:Math.round(fh*0.35)}}><rect width={fw} height={fh} rx={Math.round(fh*0.35)} fill={cr.bg}/><text x={fw/2} y={fh*0.73} textAnchor="middle" fill={cr.fg} fontSize={fh*0.58} fontWeight="900" fontFamily={F}>{cr.label}</text></svg>);}return(<div style={{borderRadius:1,overflow:"hidden",flexShrink:0}}><FlagSvg code="US" w={fw} h={fh}/></div>);})()}<span style={{fontSize:9,fontWeight:700,color:c.ts,fontFamily:F,letterSpacing:"0.02em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{sym}</span>{numCell(getSpread(sym),e=>setSpread(sym,e.target.value),meta.spreadStep,48)}</div>))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      </div>

                      {/* § Account Settings */}
                      <div style={{border:`1px solid ${sessSettingsDone?c.brH:c.br}`,padding:"12px 14px",transition:"opacity 0.2s,border-color 0.2s",...(sessSettingsDone?activeBox:lockedBox)}}>
                      {secH("Account Settings")}

                      {/* Standard / Prop Firm mode toggle — standard tab style */}
                      {(()=>{
                        const propUnavailable=newSessAssetClass==="Stocks"||newSessAssetClass==="Crypto";
                        return(
                          <div style={{display:"flex",gap:0,marginBottom:14,borderBottom:`1px solid ${c.br}`}}>
                            {[["standard","Standard","Free backtest — Trade your personal account",false],["prop","Prop Firm","Trade under prop firm challenge rules",true]].map(([v,l,desc,isPropTab])=>{
                              const disabled=isPropTab&&propUnavailable;
                              const isA=sessTradingMode===v&&!disabled;const hk="sessMode_"+v;const isH=hov===hk&&!disabled;
                              const acColor=isPropTab?c.gold:c.acL;const acGlow=isPropTab?"rgba(200,150,0,0.4)":c.acG;
                              return(
                                <div key={v}
                                  onClick={disabled?undefined:()=>{setSessTradingMode(v);if(v==="prop"&&newSessAssetClass==="Futures"){setNewSessCapital("50000");setSessP1DailyLossAmt("1000");setSessP1MaxDDAmt("2000");setSessP1ProfitTargetAmt("3000");}}}
                                  onMouseEnter={disabled?undefined:()=>setHov(hk)} onMouseLeave={disabled?undefined:()=>setHov(null)}
                                  style={{flex:1,padding:"6px 10px 8px",display:"flex",flexDirection:"column",gap:2,
                                    cursor:"default",transition:"all 0.15s",position:"relative",textAlign:"center",
                                    opacity:disabled?0.35:1,
                                    background:isA?(isPropTab?"rgba(200,150,0,0.07)":"rgba(74,106,255,0.07)"):isH?"rgba(255,255,255,0.03)":"transparent"}}>
                                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                                    <span style={{fontSize:11,fontWeight:700,color:isA?acColor:isH?c.tx:c.ts,fontFamily:F,transition:"color 0.12s"}}>{l}</span>
                                    {isPropTab&&(
                                      <div style={{position:"relative",flexShrink:0}}
                                        onMouseEnter={e=>{e.stopPropagation();setHov("propInfoTip");}} onMouseLeave={()=>setHov(null)}>
                                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                                          stroke={hov==="propInfoTip"?c.gold:c.tm} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                          style={{display:"block",cursor:"default",transition:"stroke 0.12s"}}>
                                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                                        </svg>
                                        {hov==="propInfoTip"&&(
                                          <div style={{position:"absolute",bottom:"calc(100% + 7px)",left:"50%",transform:"translateX(-50%)",width:180,background:c.el,border:`1px solid ${c.brH}`,zIndex:9999,pointerEvents:"none",whiteSpace:"normal"}}>
                                            <div style={{height:2,background:`linear-gradient(90deg,${c.gold},rgba(232,194,82,0.4),${c.gold})`}}/>
                                            <div style={{padding:"6px 9px",fontSize:10,fontWeight:600,color:c.ts,fontFamily:F,lineHeight:1.45,textAlign:"left",textTransform:"none",letterSpacing:0}}>
                                              Available for <b style={{color:c.acL}}>Forex</b> and <b style={{color:c.acL}}>Futures</b> only
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <span style={{fontSize:9,color:isA?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>{desc}</span>
                                  {isA&&<div style={{position:"absolute",bottom:-1,left:"15%",right:"15%",height:2,background:`linear-gradient(90deg,transparent,${acColor},transparent)`,boxShadow:`0 0 6px ${acGlow}`,pointerEvents:"none"}}/>}
                                  {!isA&&isH&&<div style={{position:"absolute",bottom:-1,left:"25%",right:"25%",height:1,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)`,pointerEvents:"none"}}/>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Starting balance / Account size */}
                      <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130,display:"flex",alignItems:"center",gap:4}}>
                          {sessTradingMode==="prop"?"Account size":"Starting balance"}
                          <span style={{width:4,height:4,borderRadius:"50%",background:"rgba(255,80,104,0.9)",flexShrink:0,display:"inline-block"}}/>
                        </span>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <div style={{position:"relative",width:130,flexShrink:0}}>
                            <span style={{position:"absolute",left:0,top:0,bottom:0,width:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:c.ts,fontWeight:700,borderRight:`1px solid ${c.br}`,pointerEvents:"none",fontFamily:F}}>
                              {{"USD":"$","EUR":"€","GBP":"£","JPY":"¥","CHF":"₣","AUD":"A$","CAD":"C$"}[newSessCurrency]||"$"}
                            </span>
                            <input type="number" value={newSessCapital} onChange={e=>setNewSessCapital(e.target.value)} className="tlr-nospinner" style={{...inp({fontSize:11,fontWeight:800,paddingLeft:26,fontVariantNumeric:"tabular-nums"})}}/>
                          </div>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            {(()=>{
                              const ftmoSizes=[["5K","5000"],["10K","10000"],["25K","25000"],["50K","50000"],["100K","100000"],["200K","200000"],["300K","300000"]];
                              const futuresSizes=[["25K","25000"],["50K","50000"],["100K","100000"],["150K","150000"]];
                              const genericSizes=[["5K","5000"],["10K","10000"],["25K","25000"],["50K","50000"],["100K","100000"],["200K","200000"],["300K","300000"]];
                              const chips=sessTradingMode==="prop"?(newSessAssetClass==="Futures"?futuresSizes:ftmoSizes):genericSizes;
                              const isProp=sessTradingMode==="prop";
                              const chipAc=isProp?c.gold:c.acL;
                              const chipGlow=isProp?"rgba(200,150,0,0.4)":c.acG;
                              const chipBg=isProp?"rgba(200,150,0,0.08)":"rgba(74,106,255,0.08)";
                              const futPresetsMap={"25000":{dl:"500",dd:"1000",pt:"1500"},"50000":{dl:"1000",dd:"2000",pt:"3000"},"100000":{dl:"1500",dd:"3000",pt:"6000"},"150000":{dl:"2250",dd:"4500",pt:"9000"}};
                              return chips.map(([label,val])=>{
                                const isA=newSessCapital===val;const hk="bal_"+val;const isH=hov===hk;
                                return(
                                  <div key={label} onClick={()=>{setNewSessCapital(val);if(newSessAssetClass==="Futures"&&sessTradingMode==="prop"&&futPresetsMap[val]){const p=futPresetsMap[val];setSessP1DailyLossAmt(p.dl);setSessP1MaxDDAmt(p.dd);setSessP1ProfitTargetAmt(p.pt);}}}
                                    onMouseEnter={()=>setHov(hk)} onMouseLeave={()=>setHov(null)}
                                    style={{padding:"4px 9px",fontSize:10,fontWeight:isA?700:500,color:isA?chipAc:isH?c.tx:c.ts,background:isA?chipBg:isH?"rgba(255,255,255,0.05)":"transparent",cursor:"default",transition:"background 0.12s,color 0.12s",position:"relative",fontFamily:F,fontVariantNumeric:"tabular-nums"}}>
                                    {label}
                                    {isA&&<div style={{position:"absolute",bottom:0,left:"15%",right:"15%",height:2,background:`linear-gradient(90deg,transparent,${chipAc},transparent)`,boxShadow:`0 0 6px ${chipGlow}`,pointerEvents:"none"}}/>}
                                    {!isA&&isH&&<div style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:1,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)`,pointerEvents:"none"}}/>}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Challenge Type row — only in prop mode */}
                      {sessTradingMode==="prop"&&newSessAssetClass!=="Futures"&&(
                        <div style={{height:27,display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                          <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130}}>Challenge Type</span>
                          <div style={{position:"relative",width:130,flexShrink:0}}>
                            <div onClick={e=>{e.stopPropagation();if(dropdown==="challTypeDrop"){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown("challTypeDrop");}}}
                              style={{height:27,display:"flex",alignItems:"center",padding:"0 24px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown==="challTypeDrop"?"rgba(232,194,82,0.5)":c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                              <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>{sessNumPhases===1?"1 Phase":"2 Phase"}</span>
                              <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown==="challTypeDrop"?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                            {dropdown==="challTypeDrop"&&ddAnchor&&(<>
                              <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                              <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid rgba(232,194,82,0.2)`,boxShadow:"0 4px 20px rgba(0,0,0,0.6)"}}>
                                <div style={{height:2,background:`linear-gradient(90deg,transparent,${c.gold},transparent)`}}/>
                                {[[1,"1 Phase"],[2,"2 Phase"]].map(([val,label])=>{
                                  const isA=sessNumPhases===val;const isH=hov==="ctOpt_"+val;
                                  return(
                                    <div key={val} onClick={e=>{e.stopPropagation();setSessNumPhases(val);setDropdown(null);setDdAnchor(null);}}
                                      onMouseEnter={()=>setHov("ctOpt_"+val)} onMouseLeave={()=>setHov(null)}
                                      style={{display:"flex",alignItems:"center",padding:"5px 10px",cursor:"default",position:"relative",background:isA?"rgba(232,194,82,0.08)":isH?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.1s"}}>
                                      {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.gold},transparent)`,boxShadow:"0 0 6px rgba(232,194,82,0.4)"}}/>}
                                      <span style={{fontSize:10,fontWeight:isA?700:500,color:isA?c.gold:isH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </>)}
                          </div>
                        </div>
                      )}

                      {/* Prop Firm rules — only shown in prop mode */}
                      {sessTradingMode==="prop"&&(()=>{
                        const cap=parseFloat(newSessCapital)||10000;
                        const fieldLbl=(text)=><div style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,marginBottom:3}}>{text}</div>;
                        const pctArrows=(val,setter,step=0.1)=>(
                          <div style={{position:"absolute",right:0,top:0,bottom:0,width:14,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                            {[[()=>setter(v=>String(Math.min(100,Math.round(((parseFloat(v)||0)+step)*10)/10))),"▲"],[()=>setter(v=>String(Math.max(0,Math.round(((parseFloat(v)||0)-step)*10)/10))),"▼"]].map(([fn,ch],ii)=>(
                              <button key={ii} onClick={fn}
                                onMouseEnter={e=>e.currentTarget.style.color=c.gold} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                {ch}
                              </button>
                            ))}
                          </div>
                        );
                        const mkPctCell=(val,setter,color,cap2)=>{
                          const amt=Math.round(cap2*(parseFloat(val)||0)/100);
                          return(
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <div style={{position:"relative",width:60,height:27,background:c.el,border:`1px solid ${c.brH}`,flexShrink:0}}>
                                <input type="number" min={0} max={100} step={0.5} value={val} onChange={e=>setter(e.target.value)} className="tlr-nospinner"
                                  style={{position:"absolute",left:0,top:0,bottom:0,width:"calc(100% - 14px)",background:"transparent",border:"none",outline:"none",color,fontSize:11,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 4px",boxSizing:"border-box"}}/>
                                <span style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,pointerEvents:"none"}}>%</span>
                                {pctArrows(val,setter)}
                              </div>
                              <span style={{fontSize:8,color:c.tm,fontFamily:F,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>≈ ${amt.toLocaleString()}</span>
                            </div>
                          );
                        };
                        const mkMinDaysCell=(val,setter,enabled,setEnabled,hkey)=>(
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <div style={{position:"relative",width:44,height:24,background:c.well,border:`1px solid ${c.brH}`,flexShrink:0,opacity:enabled?1:0.4}}>
                              <input type="number" min={1} value={val} onChange={e=>setter(e.target.value)} disabled={!enabled} className="tlr-nospinner"
                                style={{position:"absolute",left:0,top:0,bottom:0,width:"calc(100% - 14px)",background:"transparent",border:"none",outline:"none",color:c.tx,fontSize:10,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"right",padding:"0 3px 0 4px",boxSizing:"border-box",cursor:enabled?"text":"not-allowed"}}/>
                              <div style={{position:"absolute",right:0,top:0,bottom:0,width:14,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                {[[()=>setter(v=>String(Math.max(1,parseInt(v||1)+1))),"▲"],[()=>setter(v=>String(Math.max(1,parseInt(v||1)-1))),"▼"]].map(([fn,ch],ii)=>(
                                  <button key={ii} onClick={enabled?fn:undefined}
                                    onMouseEnter={e=>{if(enabled)e.currentTarget.style.color=c.acL;}} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                    style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:enabled?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                    {ch}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:3,cursor:"default"}} onClick={()=>setEnabled(v=>!v)}>
                              {TlChk(enabled,hkey,"",()=>setEnabled(v=>!v))}
                              <span style={{fontSize:8,color:enabled?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>enabled</span>
                            </div>
                          </div>
                        );
                        const mkPhaseRow=(phLabel,dlPct,setDl,ddPct,setDd,ptPct,setPt)=>(
                          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:14,flexShrink:0}}>
                              <span style={{fontSize:7,fontWeight:800,color:c.gold,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:F,writingMode:"vertical-rl",transform:"rotate(180deg)",whiteSpace:"nowrap"}}>{phLabel}</span>
                            </div>
                            <div style={{width:1,alignSelf:"stretch",background:`linear-gradient(180deg,transparent,rgba(232,194,82,0.4),transparent)`,flexShrink:0}}/>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(3,130px)",gap:8,alignItems:"center"}}>
                              {mkPctCell(dlPct,setDl,c.rd,cap)}
                              {mkPctCell(ddPct,setDd,c.rd,cap)}
                              {mkPctCell(ptPct,setPt,c.gn,cap)}
                            </div>
                          </div>
                        );
                        const isFutures=newSessAssetClass==="Futures";
                        const intArrows=(val,setter,min=0,max=999999,enabled=true)=>(
                          <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                            {[[()=>setter(v=>String(Math.min(max,parseInt(v||min)+1))),"▲"],[()=>setter(v=>String(Math.max(min,parseInt(v||min)-1))),"▼"]].map(([fn,ch],ii)=>(
                              <button key={ii} onClick={enabled?fn:undefined}
                                onMouseEnter={e=>{if(enabled)e.currentTarget.style.color=c.gold;}} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                {ch}
                              </button>
                            ))}
                          </div>
                        );
                        const chkRowCommon=(checked,hkey,setter,label)=>(
                          <div style={{height:27,display:"flex",alignItems:"center",gap:8,cursor:"default"}} onClick={()=>setter(v=>!v)}>
                            {TlChk(checked,hkey,"",null,"rgba(232,194,82,0.9)")}
                            <span style={{fontSize:9,fontWeight:600,color:checked?c.ts:c.tm,fontFamily:F,transition:"color 0.12s"}}>{label}</span>
                          </div>
                        );
                        const commonMinDaysRow=(
                          <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessP1MinDaysEnabled(v=>!v)}>
                              {TlChk(sessP1MinDaysEnabled,"chk_minDays","",null,"rgba(232,194,82,0.9)")}
                              <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Min trading days</span>
                            </div>
                            <div style={{position:"relative",width:50,flexShrink:0,opacity:sessP1MinDaysEnabled?1:0.45}}>
                              <input type="number" min={1} value={sessP1MinDays} onChange={e=>setSessP1MinDays(e.target.value)} disabled={!sessP1MinDaysEnabled} className="tlr-nospinner"
                                style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",cursor:sessP1MinDaysEnabled?"text":"not-allowed",width:"100%"})}}/>
                              {intArrows(sessP1MinDays,setSessP1MinDays,1,999,sessP1MinDaysEnabled)}
                            </div>
                            <span style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F}}>days</span>
                          </div>
                        );
                        const commonConsistencyRow=(
                          <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessConsistencyRule(v=>!v)}>
                              {TlChk(sessConsistencyRule,"chk_consistency","",null,"rgba(232,194,82,0.9)")}
                              <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Consistency rules</span>
                            </div>
                            <div style={{position:"relative",width:50,flexShrink:0,opacity:sessConsistencyRule?1:0.4}}>
                              <input type="number" min={0} max={100} value={sessConsistencyPct} onChange={e=>setSessConsistencyPct(e.target.value)} disabled={!sessConsistencyRule} className="tlr-nospinner"
                                style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",cursor:sessConsistencyRule?"text":"not-allowed",width:"100%"})}}/>
                              {intArrows(sessConsistencyPct,setSessConsistencyPct,0,100,sessConsistencyRule)}
                            </div>
                            <span style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,opacity:sessConsistencyRule?1:0.4}}>%</span>
                          </div>
                        );
                        if(isFutures){
                          const mkAmtCell=(val,setter,color)=>(
                            <div style={{position:"relative",width:100,height:27,background:c.el,border:`1px solid ${c.brH}`,flexShrink:0}}>
                              <span style={{position:"absolute",left:6,top:"50%",transform:"translateY(-50%)",fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,pointerEvents:"none"}}>$</span>
                              <input type="number" min={0} step={100} value={val} onChange={e=>setter(e.target.value)} className="tlr-nospinner"
                                style={{position:"absolute",left:14,top:0,bottom:0,width:"calc(100% - 32px)",background:"transparent",border:"none",outline:"none",color,fontSize:11,fontWeight:700,fontFamily:F,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:0,boxSizing:"border-box"}}/>
                              <div style={{position:"absolute",right:0,top:0,bottom:0,width:18,display:"flex",flexDirection:"column",borderLeft:`1px solid ${c.br}`}}>
                                {[[()=>setter(v=>String(Math.max(0,parseInt(v||0)+100))),"▲"],[()=>setter(v=>String(Math.max(0,parseInt(v||0)-100))),"▼"]].map(([fn,ch],ii)=>(
                                  <button key={ii} onClick={fn}
                                    onMouseEnter={e=>e.currentTarget.style.color=c.acL} onMouseLeave={e=>e.currentTarget.style.color=c.ts}
                                    style={{flex:1,background:"transparent",border:"none",color:c.ts,cursor:"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,lineHeight:1,fontFamily:F,padding:0,borderBottom:ii===0?`1px solid ${c.br}`:"none",transition:"color 0.1s"}}>
                                    {ch}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                          const mkFutPhaseRow=(phLabel,dlAmt,setDl,ddAmt,setDd,ptAmt,setPt)=>(
                            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:14,flexShrink:0}}>
                                <span style={{fontSize:7,fontWeight:800,color:c.gold,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:F,writingMode:"vertical-rl",transform:"rotate(180deg)",whiteSpace:"nowrap"}}>{phLabel}</span>
                              </div>
                              <div style={{width:1,alignSelf:"stretch",background:`linear-gradient(180deg,transparent,rgba(232,194,82,0.4),transparent)`,flexShrink:0}}/>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(3,100px)",gap:8,alignItems:"center"}}>
                                {mkAmtCell(dlAmt,setDl,c.rd)}
                                {mkAmtCell(ddAmt,setDd,c.rd)}
                                {mkAmtCell(ptAmt,setPt,c.gn)}
                              </div>
                            </div>
                          );
                          const futMinDaysRow=(
                            <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessFutMinDaysEnabled(v=>!v)}>
                                {TlChk(sessFutMinDaysEnabled,"chk_futMinDays","",null,"rgba(232,194,82,0.9)")}
                                <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Min trading days</span>
                              </div>
                              <div style={{position:"relative",width:50,flexShrink:0,opacity:sessFutMinDaysEnabled?1:0.45}}>
                                <input type="number" min={1} value={sessFutMinDays} onChange={e=>setSessFutMinDays(e.target.value)} disabled={!sessFutMinDaysEnabled} className="tlr-nospinner"
                                  style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",cursor:sessFutMinDaysEnabled?"text":"not-allowed",width:"100%"})}}/>
                                {intArrows(sessFutMinDays,setSessFutMinDays,1,999,sessFutMinDaysEnabled)}
                              </div>
                              <span style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F}}>days</span>
                            </div>
                          );
                          return(<>
                            {/* Drawdown type dropdown */}
                            <div style={{height:27,display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                              <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130}}>Drawdown Type</span>
                              <div style={{position:"relative",width:130,flexShrink:0}}>
                                <div onClick={e=>{e.stopPropagation();if(dropdown==="ddTypeDrop"){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown("ddTypeDrop");}}}
                                  style={{height:27,display:"flex",alignItems:"center",padding:"0 24px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown==="ddTypeDrop"?"rgba(232,194,82,0.5)":c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s"}}>
                                  <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>{sessTrailingDrawdown?"Trailing":"EOD"}</span>
                                  <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown==="ddTypeDrop"?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                {dropdown==="ddTypeDrop"&&ddAnchor&&(<>
                                  <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                  <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid rgba(232,194,82,0.2)`,boxShadow:"0 4px 20px rgba(0,0,0,0.6)"}}>
                                    <div style={{height:2,background:`linear-gradient(90deg,transparent,${c.gold},transparent)`}}/>
                                    {[[true,"Trailing"],[false,"EOD"]].map(([val,label])=>{
                                      const isA=sessTrailingDrawdown===val;const isH=hov==="ddtOpt_"+label;
                                      return(
                                        <div key={label} onClick={e=>{e.stopPropagation();setSessTrailingDrawdown(val);setDropdown(null);setDdAnchor(null);}}
                                          onMouseEnter={()=>setHov("ddtOpt_"+label)} onMouseLeave={()=>setHov(null)}
                                          style={{display:"flex",alignItems:"center",padding:"5px 10px",cursor:"default",position:"relative",background:isA?"rgba(232,194,82,0.08)":isH?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.1s"}}>
                                          {isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.gold},transparent)`,boxShadow:"0 0 6px rgba(232,194,82,0.4)"}}/>}
                                          <span style={{fontSize:10,fontWeight:isA?700:500,color:isA?c.gold:isH?c.tx:c.ts,fontFamily:F}}>{label}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>)}
                              </div>
                            </div>
                            {/* Column headers — daily loss has gold checkbox to enable/disable it */}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(3,100px)",gap:8,marginBottom:8}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,cursor:"default",marginTop:3}} onClick={()=>setSessDailyLossEnabled(v=>!v)}>
                                {TlChk(sessDailyLossEnabled,"chk_futDl","",null,"rgba(232,194,82,0.9)")}
                                <span style={{fontSize:8,fontWeight:700,color:sessDailyLossEnabled?c.ts:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",transition:"color 0.12s"}}>Daily loss</span>
                              </div>
                              {["Max drawdown","Profit target"].map(t=>(
                                <div key={t} style={{paddingLeft:16}}><span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>{t}</span></div>
                              ))}
                            </div>
                            {/* Single phase row — no phase label */}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(3,100px)",gap:8,marginBottom:12}}>
                              <div style={{opacity:sessDailyLossEnabled?1:0.4,transition:"opacity 0.12s",pointerEvents:sessDailyLossEnabled?"auto":"none"}}>
                                {mkAmtCell(sessP1DailyLossAmt,setSessP1DailyLossAmt,c.rd)}
                              </div>
                              {mkAmtCell(sessP1MaxDDAmt,setSessP1MaxDDAmt,c.rd)}
                              {mkAmtCell(sessP1ProfitTargetAmt,setSessP1ProfitTargetAmt,c.gn)}
                            </div>
                            {/* Futures common rules */}
                            <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:16,marginBottom:14}}>
                              {/* Max contracts */}
                              <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                                <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessMaxContractsEnabled(v=>!v)}>
                                  {TlChk(sessMaxContractsEnabled,"chk_maxCon","",null,"rgba(232,194,82,0.9)")}
                                  <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Max contracts</span>
                                </div>
                                <div style={{position:"relative",width:50,flexShrink:0,opacity:sessMaxContractsEnabled?1:0.4}}>
                                  <input type="number" min={1} step={1} value={sessMaxContracts} onChange={e=>setSessMaxContracts(e.target.value)} disabled={!sessMaxContractsEnabled} className="tlr-nospinner"
                                    style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",width:"100%",cursor:sessMaxContractsEnabled?"text":"not-allowed"})}}/>
                                  {intArrows(sessMaxContracts,setSessMaxContracts,1,999,sessMaxContractsEnabled)}
                                </div>
                                <span style={{fontSize:9,fontWeight:600,color:c.tm,fontFamily:F,opacity:sessMaxContractsEnabled?1:0.4}}>contracts</span>
                              </div>
                              {futMinDaysRow}
                              {commonConsistencyRow}
                            </div>
                            {sep}
                          </>);
                        }
                        return(<>
                          {/* Column headers — shown once */}
                          <div style={{display:"grid",gridTemplateColumns:"repeat(3,130px)",gap:8,marginBottom:8,paddingLeft:31}}>
                            {["Daily loss","Max drawdown","Profit target"].map(t=>(
                              <div key={t}>
                                <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>{t}</span>
                              </div>
                            ))}
                          </div>
                          {/* Phase rows */}
                          {mkPhaseRow(
                            sessNumPhases===2?"PHASE 1":"",
                            sessP1DailyLossPct,setSessP1DailyLossPct,
                            sessP1TotalDDPct,setSessP1TotalDDPct,
                            sessP1ProfitTargetPct,setSessP1ProfitTargetPct
                          )}
                          {sessNumPhases===2&&mkPhaseRow(
                            "PHASE 2",
                            sessP2DailyLossPct,setSessP2DailyLossPct,
                            sessP2TotalDDPct,setSessP2TotalDDPct,
                            sessP2ProfitTargetPct,setSessP2ProfitTargetPct
                          )}
                          {/* Common rules — settings rows */}
                          <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:16,marginBottom:14}}>
                            {/* Leverage — custom dropdown */}
                            <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap",flexShrink:0,width:130}}>Leverage</span>
                              <div style={{position:"relative",width:130,flexShrink:0}}>
                                <div onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();if(dropdown==="sessLevDrop"){setDropdown(null);setDdAnchor(null);}else{setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown("sessLevDrop");}}}
                                  style={{...inp({padding:"0 24px 0 8px"}),display:"flex",alignItems:"center",border:`1px solid ${dropdown==="sessLevDrop"?"rgba(232,194,82,0.5)":c.brH}`,cursor:"default",userSelect:"none",position:"relative",transition:"border-color 0.12s",boxSizing:"border-box"}}>
                                  <span style={{fontSize:11,fontWeight:700,color:c.tx,fontFamily:F}}>{sessLeverage}</span>
                                  <svg style={{position:"absolute",right:7,top:"50%",transform:`translateY(-50%) rotate(${dropdown==="sessLevDrop"?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                {dropdown==="sessLevDrop"&&ddAnchor&&(
                                  <><div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                  <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:"1px solid rgba(232,194,82,0.2)",boxShadow:"0 4px 20px rgba(0,0,0,0.6)"}}>
                                    <div style={{height:2,background:`linear-gradient(90deg,transparent,${c.gold},transparent)`}}/>
                                    {["1:1","1:2","1:5","1:10","1:20","1:30","1:50","1:100","1:200","1:500"].map(v=>{
                                      const isAct=v===sessLeverage;const isHv=hov==="levOpt_"+v;
                                      return(
                                        <div key={v} onClick={e=>{e.stopPropagation();setSessLeverage(v);setDropdown(null);setDdAnchor(null);}}
                                          onMouseEnter={()=>setHov("levOpt_"+v)} onMouseLeave={()=>setHov(null)}
                                          style={{display:"flex",alignItems:"center",padding:"4px 10px",cursor:"default",position:"relative",background:isAct?"rgba(232,194,82,0.08)":isHv?"rgba(255,255,255,0.04)":"transparent",transition:"background 0.1s"}}>
                                          {isAct&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,${c.gold},transparent)`,boxShadow:"0 0 6px rgba(232,194,82,0.4)"}}/>}
                                          <span style={{fontSize:11,fontWeight:isAct?700:500,color:isAct?c.gold:isHv?c.tx:c.ts,fontFamily:F}}>{v}</span>
                                        </div>
                                      );
                                    })}
                                  </div></>
                                )}
                              </div>
                            </div>
                            {/* Max position with Lots/% toggle */}
                            <div style={{height:27,display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:130,flexShrink:0,display:"flex",alignItems:"center",gap:6,cursor:"default"}} onClick={()=>setSessMaxPosEnabled(v=>!v)}>
                                {TlChk(sessMaxPosEnabled,"chk_maxPos","",null,"rgba(232,194,82,0.9)")}
                                <span style={{fontSize:8,fontWeight:700,color:c.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:F,whiteSpace:"nowrap"}}>Max position</span>
                              </div>
                              <div style={{position:"relative",width:50,flexShrink:0,opacity:sessMaxPosEnabled?1:0.4}}>
                                <input type="number" min={0} step={1} value={sessMaxLotSize} onChange={e=>setSessMaxLotSize(e.target.value)} disabled={!sessMaxPosEnabled} placeholder="—" className="tlr-nospinner"
                                  style={{...inp({fontWeight:700,fontVariantNumeric:"tabular-nums",textAlign:"left",padding:"0 0 0 6px",width:"100%",cursor:sessMaxPosEnabled?"text":"not-allowed"})}}/>
                                {intArrows(sessMaxLotSize,setSessMaxLotSize,0,999,sessMaxPosEnabled)}
                              </div>
                              {(()=>{
                                const mpuKey="maxPosUnitDrop";
                                const MPU_OPTS=[["lots","Lots"],["%","%"]];
                                return(
                                  <div style={{position:"relative",width:72,flexShrink:0}}>
                                    <div onClick={e=>{e.stopPropagation();if(dropdown===mpuKey){setDropdown(null);setDdAnchor(null);}else{const r=e.currentTarget.getBoundingClientRect();setDdAnchor({top:r.bottom/Z+2,left:r.left/Z,width:r.width/Z});setDropdown(mpuKey);}}}
                                      style={{height:27,display:"flex",alignItems:"center",padding:"0 22px 0 8px",position:"relative",background:c.el,border:`1px solid ${dropdown===mpuKey?"rgba(232,194,82,0.5)":c.brH}`,cursor:"default",userSelect:"none",boxSizing:"border-box",transition:"border-color 0.12s",opacity:sessMaxPosEnabled?1:0.4}}>
                                      <span style={{fontSize:10,fontWeight:600,color:c.tx,fontFamily:F}}>{MPU_OPTS.find(([u])=>u===sessMaxPosUnit)?.[1]||"Lots"}</span>
                                      <svg style={{position:"absolute",right:6,top:"50%",transform:`translateY(-50%) rotate(${dropdown===mpuKey?180:0}deg)`,transition:"transform 0.15s",pointerEvents:"none"}} width={8} height={8} viewBox="0 0 10 10" fill="none"><polyline points="1,3 5,7 9,3" stroke={c.tm} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </div>
                                    {dropdown===mpuKey&&ddAnchor&&sessMaxPosEnabled&&(<>
                                      <div style={{position:"fixed",inset:0,zIndex:9998}} onClick={e=>{e.stopPropagation();setDropdown(null);setDdAnchor(null);}}/>
                                      <div onClick={e=>e.stopPropagation()} style={{position:"fixed",top:ddAnchor.top,left:ddAnchor.left,width:ddAnchor.width,zIndex:9999,background:c.sf,border:`1px solid ${c.brH}`,boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
                                        <div style={{height:2,background:`linear-gradient(90deg,rgba(232,194,82,0.4),rgba(232,194,82,0.9),rgba(232,194,82,0.4))`}}/>
                                        {MPU_OPTS.map(([u,ulbl])=>{const isA=sessMaxPosUnit===u;const isH=hov==="mpuOpt_"+u;return(<div key={u} onClick={e=>{e.stopPropagation();setSessMaxPosUnit(u);setDropdown(null);setDdAnchor(null);}} onMouseEnter={()=>setHov("mpuOpt_"+u)} onMouseLeave={()=>setHov(null)} style={{display:"flex",alignItems:"center",padding:"5px 10px",cursor:"default",position:"relative",background:isA?"rgba(232,194,82,0.08)":isH?"rgba(255,255,255,0.03)":"transparent",transition:"background 0.1s"}}>{isA&&<div style={{position:"absolute",left:0,top:"15%",bottom:"15%",width:2,background:`linear-gradient(180deg,transparent,rgba(232,194,82,0.9),transparent)`,boxShadow:"0 0 6px rgba(232,194,82,0.4)"}}/>}<span style={{fontSize:10,fontWeight:isA?700:500,color:isA?"rgba(232,194,82,0.9)":isH?c.tx:c.ts,fontFamily:F}}>{ulbl}</span></div>);})}
                                      </div>
                                    </>)}
                                  </div>
                                );
                              })()}
                            </div>
                            {commonMinDaysRow}
                            {commonConsistencyRow}
                            {chkRowCommon(sessWeekendHold,"chk_weekendHold",setSessWeekendHold,"Hold positions over weekends")}
                          </div>
                        </>);
                      })()}
                      </div>

                    </div>
                  </div>
                  {/* Sticky bottom bar */}
                  <div style={{height:46,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",borderTop:`1px solid ${c.brH}`,background:c.el,gap:10,boxShadow:"0 -4px 20px rgba(0,0,0,0.5)"}}>
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:0,overflow:"hidden",fontFamily:F}}>
                      {[
                        [newSessAssetClass||"—",c.ts],
                        [sessTradingMode==="prop"?"Prop Firm":"Standard",sessTradingMode==="prop"?c.gold:c.ts],
                        [(()=>{const sym={"USD":"$","EUR":"€","GBP":"£","JPY":"¥"};return`${sym[newSessCurrency]||"$"}${(parseFloat(newSessCapital)||0).toLocaleString()}`;})(),c.ts],
                        [newSessStart&&newSessEnd?`${newSessStart.split("T")[0]} → ${newSessEnd.split("T")[0]}`:"No date set",newSessStart&&newSessEnd?c.ts:c.tm],
                      ].map(([val,col],i,arr)=>(
                        <span key={i} style={{display:"flex",alignItems:"center",gap:0,overflow:"hidden",minWidth:0,flexShrink:i===arr.length-1?1:0}}>
                          <b style={{fontSize:10,fontWeight:700,color:col,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{val}</b>
                          {i<arr.length-1&&<span style={{fontSize:10,color:c.tm,margin:"0 6px",flexShrink:0}}>·</span>}
                        </span>
                      ))}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                      <div onClick={closeNewSess}
                        onMouseEnter={()=>setHov("sessCancel")} onMouseLeave={()=>setHov(null)}
                        style={{height:27,padding:"0 14px",display:"flex",alignItems:"center",border:`1px solid ${hov==="sessCancel"?c.brH:c.br}`,background:"transparent",cursor:"default",fontSize:10,fontWeight:600,color:hov==="sessCancel"?c.tx:c.ts,letterSpacing:"0.04em",fontFamily:F,transition:"all 0.12s"}}>
                        Cancel
                      </div>
                      <div onClick={isValid2?saveNewSession:undefined}
                        onMouseEnter={()=>setHov("sessSave")} onMouseLeave={()=>setHov(null)}
                        style={{height:27,padding:"0 14px",display:"flex",alignItems:"center",gap:5,border:`1px solid ${isValid2?(hov==="sessSave"?c.brH:c.br):"rgba(255,255,255,0.06)"}`,background:"transparent",cursor:isValid2?"default":"not-allowed",fontSize:10,fontWeight:600,color:isValid2?(hov==="sessSave"?c.tx:c.ts):"rgba(255,255,255,0.2)",letterSpacing:"0.04em",fontFamily:F,transition:"all 0.12s"}}>
                        <svg width={10} height={10} viewBox="0 0 20 20" fill="none"><path d="M4 2h9l3 3v13H4V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><rect x="7" y="2" width="6" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><rect x="6" y="12" width="8" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.3"/></svg>
                        Save
                      </div>
                      <div onClick={isValid2?()=>{closeNewSess();startNewSession();}:undefined}
                        onMouseEnter={()=>setHov("sessStart")} onMouseLeave={()=>setHov(null)}
                        style={{height:27,padding:"0 16px",display:"flex",alignItems:"center",gap:6,background:isValid2?`linear-gradient(135deg,${c.ac},${c.acL})`:"rgba(38,67,247,0.15)",cursor:isValid2?"default":"not-allowed",fontSize:10,fontWeight:700,color:isValid2?"#fff":"rgba(255,255,255,0.25)",letterSpacing:"0.05em",boxShadow:isValid2?"0 2px 10px rgba(38,67,247,0.35)":"none",filter:hov==="sessStart"&&isValid2?"brightness(1.12)":"brightness(1)",transition:"all 0.12s",flexShrink:0,fontFamily:F}}>
                        <svg width={8} height={8} viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
                        Start Session
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
  );
}
