from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["chart"])


@router.get("/chart/index.html", response_class=HTMLResponse)
def chart_index():
    return """<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Chart</title></head><body style='font-family:system-ui;margin:40px;'><h1>Chart</h1><p>This is a placeholder chart page.</p></body></html>"""


@router.get("/chart/backtesting.html", response_class=HTMLResponse)
def backtesting():
    return """<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Backtesting</title></head><body style='font-family:system-ui;margin:40px;'><h1>Backtesting</h1><p>This is a placeholder backtesting page.</p></body></html>"""


@router.get("/chart/propfirm-backtest.html", response_class=HTMLResponse)
def propfirm_backtest():
    return """<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Propfirm Backtest</title></head><body style='font-family:system-ui;margin:40px;'><h1>Propfirm Backtest</h1><p>This is a placeholder propfirm backtest page.</p></body></html>"""
