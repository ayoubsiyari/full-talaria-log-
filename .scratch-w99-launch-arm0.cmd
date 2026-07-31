@echo off
REM W99: the zero-indicator arm alone (arm 1 already landed; its boot hung on the window claim).
REM Then tick mode under CONF-01, then the select-after-play mode variant.
cd /d "c:\Users\user\Desktop\talaria1\full-talaria-log--main"
node --max-old-space-size=1536 scripts/indicator-decay-ab.mjs --arm=0 --minutes=15 --speed=60 --mode=candle --out="_evidence\manager-C\INDICATOR-DECAY-AB-ARM0-20260731-0130.json" 1> "_evidence\manager-C\INDICATOR-DECAY-AB-ARM0-20260731-0130.out" 2> "_evidence\manager-C\INDICATOR-DECAY-AB-ARM0-20260731-0130.log"
echo EXIT=%ERRORLEVEL% >> "_evidence\manager-C\INDICATOR-DECAY-AB-ARM0-20260731-0130.log"
node --max-old-space-size=1536 scripts/replay-decay-hunt.mjs --minutes=16 --speed=60 --mode=tick --out="_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0155.json" 1> "_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0155.out" 2> "_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0155.log"
echo EXIT=%ERRORLEVEL% >> "_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0155.log"
node --max-old-space-size=1536 scripts/replay-mode-truth.mjs --minutes=6 --speed=60 --indicators=2 --select-after-play --out="_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0215.json" 1> "_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0215.out" 2> "_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0215.log"
echo EXIT=%ERRORLEVEL% >> "_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0215.log"
