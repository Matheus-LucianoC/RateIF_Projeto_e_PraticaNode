@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo RateIF - Backend Node.js
echo ========================================
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao foi encontrado no PATH.
  echo Instale Node.js 20 ou superior e tente novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias do backend...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 (
  echo.
  echo O backend foi encerrado com erro.
  pause
)
endlocal
