@echo off
REM W99: INDICATOR-DECAY-AB-V1 - test 4 of the tick-animation branch (ruling 606defe033).
REM Two arms of 15 min: two indicators per chart, then zero. Single attempt, no supervisor.
cd /d "c:\Users\user\Desktop\talaria1\full-talaria-log--main"
node --max-old-space-size=1536 scripts/indicator-decay-ab.mjs --minutes=15 --speed=60 --mode=candle --out="_evidence\manager-C\INDICATOR-DECAY-AB-V1-20260731-0100.json" 1> "_evidence\manager-C\INDICATOR-DECAY-AB-V1-20260731-0100.out" 2> "_evidence\manager-C\INDICATOR-DECAY-AB-V1-20260731-0100.log"
echo EXIT=%ERRORLEVEL% >> "_evidence\manager-C\INDICATOR-DECAY-AB-V1-20260731-0100.log"
