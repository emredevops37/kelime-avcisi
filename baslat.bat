@echo off
rem Kelime Avcisi'ni bu bilgisayarda ve ayni Wi-Fi'daki telefonda acmak icin sunucuyu baslatir.
rem Telefonda acilacak adres bu pencerede yazar. Kapatmak icin pencereyi kapat.
chcp 65001 >nul
cd /d "%~dp0"
title Kelime Avcisi
python serve.py %*
if errorlevel 1 pause
