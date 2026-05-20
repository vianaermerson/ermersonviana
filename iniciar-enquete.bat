@echo off
title Iniciador da Enquete do Chá Revelação
color 0A

echo ========================================
echo    🎀 CHÁ REVELAÇÃO - INICIADOR 🎀
echo ========================================
echo.
echo Iniciando servidor Node.js...
echo.

REM Abrir servidor Node.js em uma nova janela
start "Servidor Node.js" cmd /k "cd /d C:\Users\User\Documents\Ermerson\cha-revelacao && npm start"

REM Aguardar 3 segundos para o servidor iniciar
timeout /t 3 /nobreak > nul

echo Iniciando Ngrok...
echo.

REM Abrir Ngrok em uma nova janela
start "Ngrok Tunnel" cmd /k "cd /d C:\Users\User\Documents\Ermerson\cha-revelacao && ngrok http 3000"

echo.
echo ========================================
echo   ✅ AMBOS OS SERVIÇOS INICIADOS! ✅
echo ========================================
echo.
echo 📱 Site: http://localhost:3000
echo 🔗 Link público: (aguardar ngrok carregar)
echo 🔐 Painel admin: http://localhost:3000/admin.html
echo 📄 Senha admin: chaadmin2024
echo.
echo ========================================
echo   Pressione qualquer tecla para fechar
echo   Os serviços continuarão rodando!
echo ========================================

pause > nul