import pandas as pd
import os

CARPETA = r'C:\Users\Usuario\Desktop\texo_as_a_service\erp'
SALIDA  = r'C:\Users\Usuario\Desktop\texo_as_a_service\erp\ERP_2023_2025.xlsx'

archivos = [
    os.path.join(CARPETA, f)
    for f in os.listdir(CARPETA)
    if f.endswith('.xlsx')
]

print(f"Archivos encontrados: {len(archivos)}")

dfs = []
for archivo in archivos:
    try:
        df = pd.read_excel(archivo)
        print(f"OK: {os.path.basename(archivo)} — {len(df)} filas")
        dfs.append(df)
    except Exception as e:
        print(f"ERROR: {os.path.basename(archivo)} — {e}")

df_total = pd.concat(dfs, ignore_index=True)
df_total['FECHA DE FACT.'] = pd.to_datetime(df_total['FECHA DE FACT.'], errors='coerce')
años = sorted(df_total['FECHA DE FACT.'].dt.year.dropna().unique().astype(int).tolist())

print(f"\nTotal filas: {len(df_total)}")
print(f"Años detectados: {años}")

df_total.to_excel(SALIDA, index=False)
print(f"Guardado: {SALIDA}")