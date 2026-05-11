# Salud Financiera Dashboard — POAS

Dashboard financiero con Google Drive como almacenamiento.

## Variables de entorno en Render

| Variable | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT` | Contenido completo del JSON de la Service Account (en una sola línea) |
| `DRIVE_FOLDER_ID` | `1ySHv_JrWU3wCLWgWtypi52vhU4ztp4I` |
| `NODE_ENV` | `production` |

## Deploy en Render

1. Subí este repo a GitHub
2. Render → **New Web Service** → conectá el repo
   - Build: `npm install`
   - Start: `npm start`
3. Agregá las variables de entorno arriba
4. Deploy ✓

## Cómo convertir el JSON de Service Account a una línea

En la terminal:
```bash
cat tastexo-c74870b0b58b.json | tr -d '\n'
```
O en PowerShell:
```powershell
(Get-Content tastexo-c74870b0b58b.json -Raw) -replace "`n",""
```
Ese resultado va en la variable `GOOGLE_SERVICE_ACCOUNT`.
