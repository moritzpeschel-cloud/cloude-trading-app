@echo off
REM Cloude Trading - MT5-Bruecke (nur Demo). Werte unten eintragen, dann doppelklicken.
set CT_URL=https://cloude-trading.onrender.com
set CT_TOKEN=HIER_API_TOKEN_EINTRAGEN
REM Falls ein Symbol nicht gefunden wird, z. B.:  set SYMBOL_MAP={"US500":"US500.cash"}
pip install -q -r "%~dp0requirements.txt"
python "%~dp0bridge.py"
pause
