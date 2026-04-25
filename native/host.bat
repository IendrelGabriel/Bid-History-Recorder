@echo off
setlocal
REM Native messaging host wrapper for Python.
REM Uses the Python launcher if available; otherwise tries python.exe on PATH.

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0host.py"
  exit /b %errorlevel%
)

where python >nul 2>nul
if %errorlevel%==0 (
  python "%~dp0host.py"
  exit /b %errorlevel%
)

echo Python not found. Install Python 3 and ensure it is on PATH. 1>&2
exit /b 1

