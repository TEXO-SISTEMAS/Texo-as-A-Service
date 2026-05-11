# Salud Financiera Dashboard — POAS

Dashboard financiero por agencia con PostgreSQL en Render.

---

## Deploy en Render

### 1. Crear el repositorio
Subí esta carpeta a GitHub (o GitLab).

### 2. Crear el servicio Web en Render
- **Environment:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`

### 3. Crear la base de datos PostgreSQL en Render
- Render Dashboard → **New → PostgreSQL**
- Nombre: `salud-financiera-db`
- Plan: Free o Starter

### 4. Conectar la DB al servicio
- En el servicio web → **Environment → Add Environment Variable**
- Clave: `DATABASE_URL`
- Valor: copiar la **Internal Database URL** de la DB creada

### 5. Deploy
Render detecta el repo y despliega automáticamente.  
La tabla se crea sola al primer inicio.

---

## Uso

1. Abrí la URL de tu app en Render
2. Hacé clic en **"Cargar Excel"** y subí el archivo `.xlsx`
3. El dashboard se genera automáticamente
4. El historial queda guardado en PostgreSQL
5. Usá **"Actualizar"** para recargar los datos más recientes
6. Podés cargar múltiples versiones (distintos cortes) y navegar entre ellas desde el sidebar

---

## Variables de entorno requeridas

| Variable       | Descripción                        |
|----------------|------------------------------------|
| `DATABASE_URL` | Connection string de PostgreSQL    |
| `PORT`         | Puerto (Render lo setea solo)      |
| `NODE_ENV`     | `production` en Render             |

---

## Stack
- **Backend:** Node.js + Express + pg
- **Frontend:** HTML/CSS/JS vanilla + Chart.js
- **Parser Excel:** xlsx (SheetJS)
- **DB:** PostgreSQL
