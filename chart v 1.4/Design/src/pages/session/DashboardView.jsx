import React from 'react';
import FlagSvg from '../../components/FlagSvg';
import SymBadge from '../../components/SymBadge';

export function renderDashboardView(ctx, shared) {
  const { loading, setLoading, loadFading, setLoadFading, loadPhase, setLoadPhase, loadDots, setLoadDots, loadQuote, setLoadQuote, typedQuote, setTypedQuote, sessionPage, setSessionPage, sessPageFading, setSessPageFading, sessions, setSessions, newSessName, setNewSessName, newSessSymbol, setNewSessSymbol, newSessTf, setNewSessTf, newSessStart, setNewSessStart, newSessEnd, setNewSessEnd, newSessCapital, setNewSessCapital, sessHov, setSessHov, stratPopup, setStratPopup, symPopup, setSymPopup, sessView, setSessView, dashSessId, setDashSessId, dashHov, setDashHov, sessSelected, setSessSelected, sessSearchQ, setSessSearchQ, sessFilter, setSessFilter, sessActMenu, setSessActMenu, sessSortBy, setSessSortBy, sessSortDir, setSessSortDir, sessSortOpen, setSessSortOpen, sessSearchOpen, setSessSearchOpen, sessLayoutMode, setSessLayoutMode, cardSortOpen, setCardSortOpen, newSessCurrency, setNewSessCurrency, sessDateMode, setSessDateMode, sessNBars, setSessNBars, sessQuickDate, setSessQuickDate, sessRiskMode, setSessRiskMode, sessRiskVal, setSessRiskVal, sessLeverage, setSessLeverage, sessCommission, setSessCommission, sessCommissionVal, setSessCommissionVal, sessSlippage, setSessSlippage, sessTradingMode, setSessTradingMode, sessPropCat, setSessPropCat, sessPropFirm, setSessPropFirm, sessNumPhases, setSessNumPhases, sessChallengeType, setSessChallengeType, sessP1DailyLossPct, setSessP1DailyLossPct, sessP1TotalDDPct, setSessP1TotalDDPct, sessP1ProfitTargetPct, setSessP1ProfitTargetPct, sessP1MinDays, setSessP1MinDays, sessP1MinDaysEnabled, setSessP1MinDaysEnabled, sessP2DailyLossPct, setSessP2DailyLossPct, sessP2TotalDDPct, setSessP2TotalDDPct, sessP2ProfitTargetPct, setSessP2ProfitTargetPct, sessP2MinDays, setSessP2MinDays, sessP2MinDaysEnabled, setSessP2MinDaysEnabled, sessMaxLotSize, setSessMaxLotSize, sessMaxPosUnit, setSessMaxPosUnit, sessMaxPosEnabled, setSessMaxPosEnabled, sessConsistencyRule, setSessConsistencyRule, sessConsistencyPct, setSessConsistencyPct, sessWeekendHold, setSessWeekendHold, sessTrailingDrawdown, setSessTrailingDrawdown, sessDailyLossEnabled, setSessDailyLossEnabled, sessFutMinDays, setSessFutMinDays, sessFutMinDaysEnabled, setSessFutMinDaysEnabled, sessP1DailyLossAmt, setSessP1DailyLossAmt, sessP1MaxDDAmt, setSessP1MaxDDAmt, sessP1ProfitTargetAmt, setSessP1ProfitTargetAmt, sessP2DailyLossAmt, setSessP2DailyLossAmt, sessP2MaxDDAmt, setSessP2MaxDDAmt, sessP2ProfitTargetAmt, setSessP2ProfitTargetAmt, sessMaxContracts, setSessMaxContracts, sessMaxContractsEnabled, setSessMaxContractsEnabled, sessReplaySpeed, setSessReplaySpeed, sessReplayMode, setSessReplayMode, newSessTimezone, setNewSessTimezone, newSessDST, setNewSessDST, newSessDescription, setNewSessDescription, newSessPlaybook, setNewSessPlaybook, newSessFiles, setNewSessFiles, newSessMarginCall, setNewSessMarginCall, newSessStopOut, setNewSessStopOut, newSessMaxRisk, setNewSessMaxRisk, newSessProtect, setNewSessProtect, newSessNavEnabled, setNewSessNavEnabled, newSessFilePickerOpen, setNewSessFilePickerOpen, newSessOpen, setNewSessOpen, editSessId, setEditSessId, newSessTickers, setNewSessTickers, newSessTickerInput, setNewSessTickerInput, newSessTickerFocus, setNewSessTickerFocus, newSessAssetClass, setNewSessAssetClass, newSessAdvancedOrder, setNewSessAdvancedOrder, newSessRollback, setNewSessRollback, newSessTradingStyle, setNewSessTradingStyle, newSessStratDropOpen, setNewSessStratDropOpen, newSessStratHov, setNewSessStratHov, newSessSymDropOpen, setNewSessSymDropOpen, newSessAssetDropOpen, setNewSessAssetDropOpen, newSessAssetHov, setNewSessAssetHov, newSessMarketOpen, setNewSessMarketOpen, newSessSupportTickers, setNewSessSupportTickers, newSessSupportAssetClass, setNewSessSupportAssetClass, newSessSupportInput, setNewSessSupportInput, newSessSupportFocus, setNewSessSupportFocus, newSessSupportDropOpen, setNewSessSupportDropOpen, newSessInfoHov, setNewSessInfoHov, newSessSupportEnabled, setNewSessSupportEnabled, newSessCalOpen, setNewSessCalOpen, newSessCalTarget, setNewSessCalTarget, newSessCalPos, setNewSessCalPos, newSessCalViewY, setNewSessCalViewY, newSessCalViewM, setNewSessCalViewM, newSessCalMode, setNewSessCalMode, newSessCalYearBase, setNewSessCalYearBase, newSessStartInput, setNewSessStartInput, newSessEndInput, setNewSessEndInput, newSessRandomCount, setNewSessRandomCount, newSessRandRangeVal, setNewSessRandRangeVal, newSessRandRangeUnit, setNewSessRandRangeUnit, newSessActivePreset, setNewSessActivePreset, newSessSymPickerOpen, setNewSessSymPickerOpen, newSessSymPickerSearch, setNewSessSymPickerSearch, newSessSymPickerPos, setNewSessSymPickerPos, newSessSupPickerOpen, setNewSessSupPickerOpen, newSessSupPickerSearch, setNewSessSupPickerSearch, newSessSupPickerPos, setNewSessSupPickerPos, newSessSupPickerCat, setNewSessSupPickerCat, newSessTradingCostsEnabled, setNewSessTradingCostsEnabled, newSessCosts, setNewSessCosts, newSessSymbolSpreads, setNewSessSymbolSpreads, newSessFuturesData, setNewSessFuturesData, stratTab, setStratTab, stratSearch, setStratSearch, stratSort, setStratSort, stratSortDir, setStratSortDir, stratStyleFilter, setStratStyleFilter, stratBuilderOpen, setStratBuilderOpen, stratEditId, setStratEditId, savedCommunityIds, setSavedCommunityIds, myStrategies, setMyStrategies, stratBName, setStratBName, stratBStyle, setStratBStyle, stratBDesc, setStratBDesc, stratBInstruments, setStratBInstruments, stratBInstInput, setStratBInstInput, stratBTimeframes, setStratBTimeframes, stratBTagInput, setStratBTagInput, stratBTags, setStratBTags, stratBComplexity, setStratBComplexity, stratCardHov, setStratCardHov, tool, setTool, hov, setHov, btnPressed, setBtnPressed, dropdown, setDropdown, ddAnchor, setDdAnchor, toolPinned, setToolPinned, dialog, setDialog, dlgTab, setDlgTab, tickCandle, setTickCandle, playing, setPlaying, speed, setSpeed, buySell, setBuySell, orderType, setOrderType, btmTab, setBtmTab, btmIndPos, setBtmIndPos, tblSort, setTblSort, btmTabBarRef, tradeCard, setTradeCard, tradeCardPreTags, setTradeCardPreTags, tradeCardPostTags, setTradeCardPostTags, tradeCardNotes, setTradeCardNotes, tradeActPopup, setTradeActPopup, tapJournal, setTapJournal, tapStrategy, setTapStrategy, tapTags, setTapTags, tapScreenshots, setTapScreenshots, viewingScreenshot, setViewingScreenshot, tapFileSlot, setTapFileSlot, tapTagInput, setTapTagInput, tradeTagOverrides, setTradeTagOverrides, tagEditInput, setTagEditInput, selRow, setSelRow, tagDrop, setTagDrop, tagDropPos, setTagDropPos, btmOpen, setBtmOpen, btmHeight, setBtmHeight, btmResizing, setBtmResizing, btmDragRef, btmPanelRef, tf, setTf, sizeMode, setSizeMode, riskVal, setRiskVal, riskBasis, setRiskBasis, slEnabled, setSlEnabled, entryRows, setEntryRows, entryScrollRef, slPrice, setSlPrice, slRows, setSlRows, slScrollRef, tpRows, setTpRows, tpScrollRef, tagDefs, postTagDefs, tagSels, setTagSels, tagDropOpen, setTagDropOpen, tagsOpen, setTagsOpen, notesText, setNotesText, notesOpen, setNotesOpen, tradeNotes, setTradeNotes, tradeScreenshots, setTradeScreenshots, screenshots, setScreenshots, ssOpen, setSsOpen, replaceTargetId, setReplaceTargetId, fileInputRef, replaceInputRef, tipTimerRef, tipData, setTipData, panelRef, tapFileRef, tcFileRef, tcSsSlot, setTcSsSlot, accountBalance, accountEquity, slAdvMode, setSlAdvMode, slAdvDrop, setSlAdvDrop, slBeUnit, setSlBeUnit, slBeUnitDrop, setSlBeUnitDrop, slBeTrigger, setSlBeTrigger, slBeOffset, setSlBeOffset, slTslUnit, setSlTslUnit, slTslUnitDrop, setSlTslUnitDrop, slTslActivation, setSlTslActivation, slTslTrail, setSlTslTrail, slTslStep, setSlTslStep, logoMenu, setLogoMenu, replayOpts, setReplayOpts, replayMode, setReplayMode, replayInterval, setReplayInterval, rollback, setRollback, rollbackLineX, setRollbackLineX, rbDragging, setRbDragging, rbPressed, setRbPressed, rbPressTimer, gotoOpen, setGotoOpen, gotoItems, setGotoItems, gotoAddType, setGotoAddType, gotoTab, setGotoTab, gotoNewDate, setGotoNewDate, gotoNewTime, setGotoNewTime, gotoNewRepeat, setGotoNewRepeat, gotoNewPrice, setGotoNewPrice, gotoNewName, setGotoNewName, gotoNewColor, setGotoNewColor, gotoCalOpen, setGotoCalOpen, gotoCalPos, setGotoCalPos, gotoTimeOpen, setGotoTimeOpen, gotoTimePos, setGotoTimePos, gotoCalViewY, setGotoCalViewY, gotoCalViewM, setGotoCalViewM, gotoCalMode, setGotoCalMode, gotoCalYearBase, setGotoCalYearBase, gotoDateInput, setGotoDateInput, gotoTimeInput, setGotoTimeInput, gotoPresets, setGotoPresets, ddPos, setDdPos, symbolOpen, setSymbolOpen, symbol, setSymbol, symbolSearch, setSymbolSearch, chartTypeOpen, setChartTypeOpen, chartType, setChartType, chartTypeDropL, setChartTypeDropL, tfOpen, setTfOpen, tfCat, setTfCat, tfPinned, setTfPinned, tfCustomVal, setTfCustomVal, tfEditMode, setTfEditMode, tfDefaults, tfCustomItems, setTfCustomItems, tfSortItems, tfCategories, tfCustomUnit, setTfCustomUnit, tfUnitOpen, setTfUnitOpen, tfIndPos, setTfIndPos, tfBarRef, chartCanvasRef, rollbackLineRef, rollbackOverlayRef, tlBarRef, tlBarDropRef, pinnedBarRef, cpBarAnchorRef, closingDropdownKey, canvasDims, setCanvasDims, settingsOpen, setSettingsOpen, profileOpen, setProfileOpen, profileTab, setProfileTab, profileLang, setProfileLang, profileCat, setProfileCat, profilePos, setProfilePos, profileName, setProfileName, profileAvatar, setProfileAvatar, profileNameEdit, setProfileNameEdit, profilePwOpen, setProfilePwOpen, profileCurPw, setProfileCurPw, profileNewPw, setProfileNewPw, profileConfirmPw, setProfileConfirmPw, darkMode, setDarkMode, faqOpen, setFaqOpen, faqCat, setFaqCat, faqPos, setFaqPos, emojiPanelOpen, setEmojiPanelOpen, emojiPanelPos, setEmojiPanelPos, emojiCat, setEmojiCat, emojiSearch, setEmojiSearch, faqExpand, setFaqExpand, screenshotOpen, setScreenshotOpen, scLinkOpen, setScLinkOpen, scLinkSearch, setScLinkSearch, scLinkedTrade, setScLinkedTrade, scLinkPhase, setScLinkPhase, isFullscreen, setIsFullscreen, pinnedBarOpen, setPinnedBarOpen, pinnedBarPos, setPinnedBarPos, groupSelected, setGroupSelected, tlBarPos, setTlBarPos, tlSettOpen, setTlSettOpen, tlSettPos, setTlSettPos, tlName, setTlName, tlNameEditing, setTlNameEditing, tlSettTab, setTlSettTab, tlLocked, setTlLocked, rrStyle, setRrStyle, rrInputs, setRrInputs, vwapLocked, setVwapLocked, vpLocked, setVpLocked, avLocked, setAvLocked, txtLocked, setTxtLocked, tlStyleDrop, setTlStyleDrop, tlInfoDropUp, setTlInfoDropUp, tlInfoDropAnchor, setTlInfoDropAnchor, tlStyleDropUp, setTlStyleDropUp, tlBarDrop, setTlBarDrop, tlTemplates, setTlTemplates, tlBarDropAnchor, setTlBarDropAnchor, tlLastBarDropRef, tlSaveAsMode, setTlSaveAsMode, tlNewTplName, setTlNewTplName, tlSettTplDrop, setTlSettTplDrop, tlStyle, setTlStyle, txtSettOpen, setTxtSettOpen, txtSettPos, setTxtSettPos, txtSettTab, setTxtSettTab, txtName, setTxtName, txtNameEditing, setTxtNameEditing, txtSizeOpen, setTxtSizeOpen, txtBarSizeOpen, setTxtBarSizeOpen, txtBarDrop, setTxtBarDrop, txtTemplates, setTxtTemplates, txtSaveAsMode, setTxtSaveAsMode, txtNewTplName, setTxtNewTplName, txtStyle, setTxtStyle, vwapSettOpen, setVwapSettOpen, vwapSettPos, setVwapSettPos, vwapSettTab, setVwapSettTab, vwapStyleDrop, setVwapStyleDrop, vwapBarPos, setVwapBarPos, vwapBarDrop, setVwapBarDrop, vwapStyle, setVwapStyle, vpSettOpen, setVpSettOpen, vpSettPos, setVpSettPos, vpSettTab, setVpSettTab, vpStyleDrop, setVpStyleDrop, vpBarPos, setVpBarPos, vpBarDrop, setVpBarDrop, vpStyle, setVpStyle, avSettOpen, setAvSettOpen, avSettPos, setAvSettPos, avSettTab, setAvSettTab, avStyleDrop, setAvStyleDrop, avBarPos, setAvBarPos, avBarDrop, setAvBarDrop, avStyle, setAvStyle, screenshotFlash, setScreenshotFlash, orderPanelOpen, setOrderPanelOpen, opSymOpen, setOpSymOpen, opSymSearch, setOpSymSearch, opSymPos, setOpSymPos, opSizeOpen, setOpSizeOpen, opSizePos, setOpSizePos, opTplOpen, setOpTplOpen, opTplPos, setOpTplPos, activeTemplate, setActiveTemplate, opSaveAsMode, setOpSaveAsMode, opNewTplName, setOpNewTplName, opSavedTemplates, setOpSavedTemplates, opDotsOpen, setOpDotsOpen, opDotsPos, setOpDotsPos, panelDetached, setPanelDetached, detachPos, setDetachPos, detachSize, setDetachSize, panelMode, setPanelMode, isWide, opTemplates, rightPanel, setRightPanel, screenshotPos, setScreenshotPos, layersOpen, setLayersOpen, layersPos, setLayersPos, layersCat, setLayersCat, layersItems, setLayersItems, layersVis, setLayersVis, layersSearch, setLayersSearch, newsOpen, setNewsOpen, newsPos, setNewsPos, newsTab, setNewsTab, newsSearch, setNewsSearch, newsImpact, setNewsImpact, newsSymbolOnly, setNewsSymbolOnly, newsFilterOpen, setNewsFilterOpen, newsFilterClosing, setNewsFilterClosing, newsCntSel, setNewsCntSel, layoutOpen, setLayoutOpen, layoutPos, setLayoutPos, layoutPanels, setLayoutPanels, layoutSync, setLayoutSync, layoutTab, setLayoutTab, settingsTab, setSettingsTab, balVis, setBalVis, sDrop, setSDrop, colorPicker, setColorPicker, cpPos, setCpPos, swHov, setSwHov, settDrop, setSettDrop, settDropPos, setSettDropPos, customTemplates, setCustomTemplates, tplNameInput, setTplNameInput, settHdrTplDrop, setSettHdrTplDrop, settHdrSaveAs, setSettHdrSaveAs, settHdrTplName, setSettHdrTplName, cpH, setCpH, cpS, setCpS, cpV, setCpV, cpA, setCpA, cpHex, setCpHex, cpDragging, setCpDragging, cpDragRect, setCpDragRect, settings, setSettings, indOpen, setIndOpen, indPinned, setIndPinned, indActive, setIndActive, indSelected, setIndSelected, indSearch, setIndSearch, indPos, setIndPos, indCat, setIndCat, indTplOpen, setIndTplOpen, indTplSaveMode, setIndTplSaveMode, indTplName, setIndTplName, indTemplates, setIndTemplates, dragging, setDragging, settingsPos, setSettingsPos, closing, setClosing, animClose, closePopup, closeTlBarDrop, closeTlSett, closeTxtSett, closeVwapSett, closeVpSett, closeAvSett, closeDropdown, closeFontSizeDrop, closeTlInfoDrop, closeTlSettTplDrop, closeCP, c, chromeBr, F, allSymbols, currentSymbol, chartTypeMap, currentChartType, gotoNextId, tlSubTool, tlSubToolRef, txtSubTool, txtSubToolRef, isFibTool, isGannTool, isElliottTool, isPatternTool, isRRTool, rollbackOverlayCallbackRef, catColors, tplWatchKeys, updateSetting, defaultTemplateMap, applyTemplate, saveCustomTemplate, Chk, TlChk, Z, cpW, CP_H, posFromRect, sdPos, openCP, openGotoCP, cpApply, indicatorData, indFiltered, I, B, Sel, MiniIn, toolGroups, actionTools, priceLabels, timeLabels, priceAxisWidth, closeWindows, launchSession, startNewSession, saveNewSession, deleteSession, duplicateSession, openEditSession, closeAll, showTip, hideTip, renderTB, getDdItems, ddItems } = ctx;
  const { sep, lbl, secH, navPanel } = shared;

          const ds = sessions.find(s=>s.id===dashSessId) || sessions[0];
          if (!ds) { setSessView("sessions"); return null; }
          const isPropD = ds.tradingMode==="prop";
          const stripeC = isPropD?c.gold:c.acL;
          const hasPnlD = ds.pnl!=null;
          const pnlPosD = hasPnlD&&ds.pnl>=0;
          const pnlColD = hasPnlD?(pnlPosD?c.gn:c.rd):c.tm;
          // Dummy sparkline points
          const sparkPts = (()=>{const pts=[];let v=ds.capital||10000;const sign=pnlPosD?1:-1;for(let i=0;i<40;i++){v+=sign*(Math.random()*400-160)+sign*100;pts.push(Math.max(v,1));}return pts;})();
          const spMin=Math.min(...sparkPts),spMax=Math.max(...sparkPts),spRange=spMax-spMin||1;
          const spPath=sparkPts.map((p,i)=>`${i===0?"M":"L"}${(i/(sparkPts.length-1))*520},${80-((p-spMin)/spRange)*70}`).join(" ");
          // Monthly returns dummy
          const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const mRet=(()=>months.map((_,i)=>({m:months[i],v:Math.round((Math.random()-0.42)*1200)})))();
          const maxAbs=Math.max(...mRet.map(r=>Math.abs(r.v)),1);
          // Trade distribution
          const distData=[{l:"0–30 min",v:18},{l:"30–2h",v:34},{l:"2–8h",v:28},{l:"8h+",v:20}];
          const distMax=Math.max(...distData.map(d=>d.v));
          // Win/Loss streak
          const streakBars=(()=>{const b=[];for(let i=0;i<30;i++)b.push(Math.random()>(pnlPosD?0.38:0.52)?1:-1);return b;})();
          // Risk metrics
          const sharpe=(ds.winRate?(ds.winRate/20-1.5).toFixed(2):"—");
          const maxDD=hasPnlD?Math.abs(Math.round(ds.capital*0.082)):0;
          const profFactor=ds.avgRR?((ds.winRate||50)/100*ds.avgRR/((1-(ds.winRate||50)/100))).toFixed(2):"—";
          const expVal=ds.avgRR?((ds.winRate||50)/100*ds.avgRR-((100-(ds.winRate||50))/100)).toFixed(2):"—";

          const kpiCard=(label,val,sub,col=c.ts)=>(
            <div style={{background:c.el,border:`1px solid ${c.brH}`,padding:"16px 18px",display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:8,fontWeight:800,color:c.tm,textTransform:"uppercase",letterSpacing:"0.09em"}}>{label}</div>
              <div style={{fontSize:22,fontWeight:800,color:col,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{val}</div>
              {sub&&<div style={{fontSize:9,color:c.tm,fontFamily:F}}>{sub}</div>}
            </div>
          );

          return (
            <div style={{position:"fixed",inset:0,zIndex:99998,background:c.bg,fontFamily:F,display:"flex",flexDirection:"column"}}>
              {/* Header */}
              <div style={{height:64,flexShrink:0,display:"flex",alignItems:"center",gap:0,background:c.el,boxShadow:"0 2px 18px rgba(0,0,0,0.5)",zIndex:2}}>
                {/* Logo slot */}
                <div style={{width:64,flexShrink:0,height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <img src="/LOGO-07.png" style={{width:52,height:52,objectFit:"contain"}} alt=""/>
                </div>
                <div style={{width:7,height:7,borderRadius:"50%",background:stripeC,boxShadow:`0 0 8px ${stripeC}`,flexShrink:0,marginLeft:16}}/>
                <div style={{fontSize:15,fontWeight:700,color:c.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,fontFamily:F,marginLeft:10}}>{ds.name}</div>
                <div style={{fontSize:9,fontWeight:800,color:stripeC,letterSpacing:"0.1em",border:`1px solid ${stripeC}44`,padding:"3px 10px",flexShrink:0,fontFamily:F}}>{isPropD?"PROP FIRM":"STANDARD"}</div>
                <div style={{display:"flex",alignItems:"center",gap:2,flexShrink:0,padding:"0 14px"}}>
                  {[["person",c.tm],["settings",c.tm]].map(([n,col],i)=>(
                    <div key={i} style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",cursor:"default",color:col,transition:"color 0.12s"}}
                      onMouseEnter={e=>e.currentTarget.style.color=c.tx} onMouseLeave={e=>e.currentTarget.style.color=col}><I n={n} s={16}/></div>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div style={{flex:1,display:"flex",overflow:"hidden"}}>
              {navPanel}
              {/* Content */}
              <div style={{flex:1,overflowY:"auto",padding:"24px 32px"}} className="tlr-scroll">
                <div style={{maxWidth:1100,margin:"0 auto",display:"flex",flexDirection:"column",gap:20}}>

                  {/* KPI row */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
                    {kpiCard("Net P&L", hasPnlD?`${pnlPosD?"+":""}$${ds.pnl.toLocaleString()}`:"—", `Starting: $${(ds.capital||0).toLocaleString()}`, pnlColD)}
                    {kpiCard("Win Rate", ds.winRate!=null?`${ds.winRate}%`:"—", `${ds.trades||0} total trades`, ds.winRate>=50?c.gn:c.rd)}
                    {kpiCard("Avg R:R", ds.avgRR?`1 : ${ds.avgRR.toFixed(1)}`:"—", "Risk-to-reward ratio")}
                    {kpiCard("Sharpe Ratio", sharpe, "Risk-adjusted return")}
                    {kpiCard("Max Drawdown", maxDD?`$${maxDD.toLocaleString()}`:"—", `${maxDD&&ds.capital?((maxDD/ds.capital)*100).toFixed(1)+"% of capital":"—"}`, c.rd)}
                    {kpiCard("Profit Factor", profFactor, `Exp. value: ${expVal}R`)}
                  </div>

                  {/* Equity curve + Monthly returns */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:16}}>
                    {/* Equity curve */}
                    <div style={{background:c.el,border:`1px solid ${c.brH}`,padding:"18px"}}>
                      <div style={{fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:14,fontFamily:F}}>Equity Curve</div>
                      <svg width="100%" height={100} viewBox="0 0 520 80" preserveAspectRatio="none" style={{display:"block"}}>
                        <defs>
                          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={pnlPosD?c.gn:c.rd} stopOpacity="0.18"/>
                            <stop offset="100%" stopColor={pnlPosD?c.gn:c.rd} stopOpacity="0"/>
                          </linearGradient>
                        </defs>
                        <path d={spPath+" L520,80 L0,80 Z"} fill="url(#eqFill)"/>
                        <path d={spPath} fill="none" stroke={pnlPosD?c.gn:c.rd} strokeWidth="1.6" strokeLinejoin="round"/>
                      </svg>
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                        <span style={{fontSize:8,color:c.tm,fontFamily:F}}>{ds.startDate?ds.startDate.split("-").reverse().map((v,i)=>i===0?v:i===1?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+v-1]:v).join(" "):"—"}</span>
                        <span style={{fontSize:8,color:c.tm,fontFamily:F}}>{ds.endDate?ds.endDate.split("-").reverse().map((v,i)=>i===0?v:i===1?["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+v-1]:v).join(" "):"—"}</span>
                      </div>
                    </div>
                    {/* Monthly returns */}
                    <div style={{background:c.el,border:`1px solid ${c.brH}`,padding:"18px"}}>
                      <div style={{fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:14,fontFamily:F}}>Monthly Returns</div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {mRet.map(({m,v})=>{
                          const pct=v/maxAbs;
                          const col=v>=0?c.gn:c.rd;
                          return(
                            <div key={m} style={{display:"flex",alignItems:"center",gap:6}}>
                              <div style={{width:28,fontSize:8,fontWeight:700,color:c.tm,flexShrink:0,fontFamily:F}}>{m}</div>
                              <div style={{flex:1,height:8,background:c.trk,position:"relative"}}>
                                <div style={{position:"absolute",[v>=0?"left":"right"]:0,top:0,bottom:0,width:`${Math.abs(pct)*100/2}%`,background:col,opacity:0.7}}/>
                              </div>
                              <div style={{width:52,textAlign:"right",fontSize:9,fontWeight:700,color:col,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{v>=0?"+":""}{v}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Win/Loss streak + Trade distribution + Risk */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                    {/* Win/Loss streak */}
                    <div style={{background:c.el,border:`1px solid ${c.brH}`,padding:"18px"}}>
                      <div style={{fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:14,fontFamily:F}}>Win / Loss Streak</div>
                      <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                        {streakBars.map((v,i)=>(
                          <div key={i} style={{width:14,height:20,background:v===1?c.gn:c.rd,opacity:0.75}}/>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:12,marginTop:12}}>
                        <div style={{fontSize:9,color:c.tm,fontFamily:F}}><span style={{color:c.gn,fontWeight:700}}>{streakBars.filter(v=>v===1).length}</span> wins</div>
                        <div style={{fontSize:9,color:c.tm,fontFamily:F}}><span style={{color:c.rd,fontWeight:700}}>{streakBars.filter(v=>v===-1).length}</span> losses</div>
                      </div>
                    </div>
                    {/* Trade duration */}
                    <div style={{background:c.el,border:`1px solid ${c.brH}`,padding:"18px"}}>
                      <div style={{fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:14,fontFamily:F}}>Trade Duration</div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {distData.map(({l,v})=>(
                          <div key={l} style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:56,fontSize:8,color:c.tm,flexShrink:0,fontFamily:F}}>{l}</div>
                            <div style={{flex:1,height:10,background:c.trk,position:"relative"}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${(v/distMax)*100}%`,background:stripeC,opacity:0.7}}/>
                            </div>
                            <div style={{width:28,textAlign:"right",fontSize:9,fontWeight:700,color:c.ts,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{v}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Risk breakdown */}
                    <div style={{background:c.el,border:`1px solid ${c.brH}`,padding:"18px"}}>
                      <div style={{fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:14,fontFamily:F}}>Risk Breakdown</div>
                      {[
                        ["Avg Win", ds.avgRR?`$${Math.round((ds.avgRR||1)*180)}`:"-", c.gn],
                        ["Avg Loss", "-$180", c.rd],
                        ["Largest Win", ds.pnl?`$${Math.round(Math.abs(ds.pnl)*0.31)}`:"-", c.gn],
                        ["Largest Loss", ds.capital?`-$${Math.round(ds.capital*0.028)}`:"-", c.rd],
                        ["Consec. Wins", String(Math.floor(Math.random()*7)+2), c.ts],
                        ["Consec. Losses", String(Math.floor(Math.random()*5)+1), c.ts],
                      ].map(([lbl,val,col])=>(
                        <div key={lbl} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:`1px solid ${c.br}`}}>
                          <span style={{fontSize:9,color:c.tm,fontFamily:F}}>{lbl}</span>
                          <span style={{fontSize:10,fontWeight:700,color:col,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trade log table */}
                  <div style={{background:c.el,border:`1px solid ${c.brH}`,padding:"18px"}}>
                    <div style={{fontSize:9,fontWeight:800,color:c.tm,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:12,fontFamily:F}}>Recent Trades</div>
                    <div style={{display:"grid",gridTemplateColumns:"40px 70px 70px 80px 80px 80px 80px 1fr",borderBottom:`1px solid ${c.brH}`}}>
                      {["#","Date","Symbol","Side","Entry","Exit","P&L","Duration"].map(h=>(
                        <div key={h} style={{padding:"5px 8px",fontSize:8,fontWeight:800,color:c.tm,letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:F}}>{h}</div>
                      ))}
                    </div>
                    {(()=>{
                      const tickers2=(ds.tickers||["NQ"]);
                      const rows=[];
                      let cumPnl=0;
                      for(let i=0;i<8;i++){
                        const side=Math.random()>0.5?"BUY":"SELL";
                        const pnl=Math.round((Math.random()-0.4)*800);
                        cumPnl+=pnl;
                        const tick=tickers2[i%tickers2.length];
                        rows.push({n:i+1,date:"2024-0"+(i%9+1)+"-"+(i*3+1<10?"0":"")+(i*3+1),sym:tick,side,entry:(14000+Math.random()*200).toFixed(2),exit:(14000+Math.random()*200).toFixed(2),pnl,dur:["12m","45m","2h","4h","8h","1d"][i%6]});
                      }
                      return rows.map(r=>(
                        <div key={r.n} style={{display:"grid",gridTemplateColumns:"40px 70px 70px 80px 80px 80px 80px 1fr",borderBottom:`1px solid ${c.br}`,transition:"background 0.1s"}}
                          onMouseEnter={e=>e.currentTarget.style.background=c.hv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{padding:"6px 8px",fontSize:10,color:c.tm,fontFamily:F}}>{r.n}</div>
                          <div style={{padding:"6px 8px",fontSize:9,color:c.ts,fontFamily:F}}>{r.date}</div>
                          <div style={{padding:"6px 8px",fontSize:10,fontWeight:700,color:c.tx,fontFamily:F}}>{r.sym}</div>
                          <div style={{padding:"6px 8px",fontSize:9,fontWeight:700,color:r.side==="BUY"?c.gn:c.rd,fontFamily:F}}>{r.side}</div>
                          <div style={{padding:"6px 8px",fontSize:9,color:c.ts,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{r.entry}</div>
                          <div style={{padding:"6px 8px",fontSize:9,color:c.ts,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{r.exit}</div>
                          <div style={{padding:"6px 8px",fontSize:10,fontWeight:700,color:r.pnl>=0?c.gn:c.rd,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{r.pnl>=0?"+":""}{r.pnl}</div>
                          <div style={{padding:"6px 8px",fontSize:9,color:c.tm,fontFamily:F}}>{r.dur}</div>
                        </div>
                      ));
                    })()}
                  </div>

                </div>
              </div>

              {/* Bottom bar */}
              <div style={{height:52,flexShrink:0,display:"flex",alignItems:"center",gap:12,padding:"0 28px",borderTop:`1px solid ${c.br}`,background:c.sf}}>
                <div style={{flex:1,fontSize:9,color:c.tm,fontFamily:F,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  <b style={{color:c.ts,fontFamily:F}}>{(ds.tickers||[]).join(", ")||"—"}</b>{" · "}<b style={{color:c.ts,fontFamily:F}}>{ds.timeframe}</b>{" · "}{ds.startDate||"—"}{" → "}{ds.endDate||"—"}{" · $"}<b style={{color:c.ts,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{(ds.capital||0).toLocaleString()}</b>
                </div>
                <div onClick={()=>launchSession()} style={{height:32,padding:"0 20px",display:"flex",alignItems:"center",gap:7,background:isPropD?"linear-gradient(135deg,#B8860B,#E8C252)":`linear-gradient(135deg,${c.gn}BB,${c.gn})`,cursor:"default",fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.95)",letterSpacing:"0.08em",boxShadow:isPropD?"0 2px 8px rgba(232,194,82,0.28)":`0 2px 8px ${c.gn}55`,transition:"filter 0.12s",fontFamily:F}}
                  onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.12)"} onMouseLeave={e=>e.currentTarget.style.filter="brightness(1)"}>
                  <svg width={7} height={7} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
                  {(ds.progress||0)===0?"START":"RESUME"}
                </div>
              </div>
              </div>{/* end body */}
            </div>
          );
}
