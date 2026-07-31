@echo off
REM W99: REPLAY-MODE-TRUTH-V1 - tests 1/2/3 of the tick-animation branch (ruling 606defe033).
REM Single attempt, no supervisor loop.
cd /d "c:\Users\user\Desktop\talaria1\full-talaria-log--main"
node --max-old-space-size=1536 scripts/replay-mode-truth.mjs --minutes=16 --speed=60 --indicators=2 --out="_evidence\manager-C\REPLAY-MODE-TRUTH-V1-20260731-0040.json" 1> "_evidence\manager-C\REPLAY-MODE-TRUTH-V1-20260731-0040.out" 2> "_evidence\manager-C\REPLAY-MODE-TRUTH-V1-20260731-0040.log"
echo EXIT=%ERRORLEVEL% >> "_evidence\manager-C\REPLAY-MODE-TRUTH-V1-20260731-0040.log"
