@echo off
title RFPilot Server
echo Starting RFPilot Server on http://localhost:8000 ...
start http://localhost:8000
.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
pause
