@echo off
echo Deteniendo PostgreSQL local...
net stop postgresql-x64-17 2>nul
echo Levantando backend...
cd C:\Users\Usuario\Desktop\texo_as_a_service\backend
call venv\Scripts\activate
start cmd /k "uvicorn app.main:app --timeout-keep-alive 120"
echo Levantando frontend...
cd C:\Users\Usuario\Desktop\texo_as_a_service\frontend
start cmd /k "npm run dev"
echo Listo. Abre http://localhost:3000
