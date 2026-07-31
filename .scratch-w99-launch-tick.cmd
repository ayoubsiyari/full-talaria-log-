@echo off
REM W99: tick mode under CONF-01, profiled for the first time (ruling 606defe033, closing item).
REM Same instrument as the candle decay hunt so the two are directly comparable.
cd /d "c:\Users\user\Desktop\talaria1\full-talaria-log--main"
node --max-old-space-size=1536 scripts/replay-decay-hunt.mjs --minutes=16 --speed=60 --mode=tick --out="_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0140.json" 1> "_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0140.out" 2> "_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0140.log"
echo EXIT=%ERRORLEVEL% >> "_evidence\manager-C\REPLAY-DECAY-HUNT-TICKMODE-20260731-0140.log"
REM Test 1 variant: select the mode AFTER play has started (the drain path uses restartPlayback:false).
node --max-old-space-size=1536 scripts/replay-mode-truth.mjs --minutes=6 --speed=60 --indicators=2 --select-after-play --out="_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0200.json" 1> "_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0200.out" 2> "_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0200.log"
echo EXIT=%ERRORLEVEL% >> "_evidence\manager-C\REPLAY-MODE-TRUTH-AFTERPLAY-20260731-0200.log"
