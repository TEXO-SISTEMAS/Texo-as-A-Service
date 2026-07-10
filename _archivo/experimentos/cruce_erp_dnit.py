"""
CRUCE ERP vs DNIT - Metodología correcta
=========================================
Este script documenta exactamente cómo se cruzan los datos
y qué errores comunes hay que evitar.
"""

import pandas as pd
from rapidfuzz import process, fuzz
import re


# ══════════════════════════════════════════════════════════════
# PASO 1: CARGAR ARCHIVOS
# ══════════════════════════════════════════════════════════════

erp = pd.read_excel('erp_2024.xlsx')
dnit = pd.read_excel('POSICIONAMIENTO_DE_CLIENTES.xlsx')

dnit.columns = ['RANKING_DNIT', 'RUC', 'DNIT_NOMBRE', 'APORTE_GS', 'INGRESO_ESTIMADO_GS']


# ══════════════════════════════════════════════════════════════
# PASO 2: FILTRAR ESTADOS VÁLIDOS DEL ERP
# ══════════════════════════════════════════════════════════════
# ERROR COMÚN: incluir todos los estados sin filtrar.
# Las REVERSIONES son anulaciones — no son facturación real.
# Si las sumás como positivas, el total se infla o distorsiona.
#
# ESTADOS QUE SÍ cuentan como facturación real:
ESTADOS_VALIDOS = [
    'FACTURADO',
    'FACTURA',
    'FACTURADO ',   # con espacio (dato sucio en el archivo)
    'FACTURA ',     # con espacio
    'Facturado ',   # mayúscula/minúscula mixta
    'fACTURA',      # otro caso de dato sucio
]
#
# ESTADOS QUE NO deben incluirse:
# - REVERSION, REVERSION_2023, REVERSION 2023 → anulaciones
# - PENDIENTE, PENDIENTES → aún no facturado
# - NOTA DE CREDITO → descuento/devolución
# - APROBADO, FCOE → estados intermedios

erp_filtrado = erp[erp['ESTADO'].isin(ESTADOS_VALIDOS)].copy()

print(f"Registros totales ERP:    {len(erp)}")
print(f"Registros tras filtro:    {len(erp_filtrado)}")
print(f"Registros excluidos:      {len(erp) - len(erp_filtrado)}")


# ══════════════════════════════════════════════════════════════
# PASO 3: AGRUPAR POR CLIENTE
# ══════════════════════════════════════════════════════════════
# Se agrupa DESPUÉS de filtrar, no antes.

erp_por_cliente = erp_filtrado.groupby('CLIENTE').agg(
    FACTURACION=('FACTURACION', 'sum'),
    COSTO=('COSTO', 'sum'),
    REVENUE=('REVENUE', 'sum'),
    N_FACTURAS=('FACT. N°', 'count'),
    EMPRESA=('EMPRESA', lambda x: ', '.join(x.dropna().unique())),
).reset_index()

erp_por_cliente = erp_por_cliente.sort_values('FACTURACION', ascending=False)

print(f"\nClientes únicos en ERP (facturados): {len(erp_por_cliente)}")
print(f"Facturación total: Gs. {erp_por_cliente['FACTURACION'].sum():,.0f}")


# ══════════════════════════════════════════════════════════════
# PASO 4: NORMALIZAR NOMBRES PARA EL CRUCE
# ══════════════════════════════════════════════════════════════
# ERROR COMÚN: hacer join exacto por nombre (==).
# "CERVEPAR S.A." != "CERVEPAR SA" != "CERVEPAR S.A" → no matchea.
# La solución es normalizar ambas fuentes antes de comparar.

def normalizar(nombre):
    """
    Limpia un nombre de empresa para comparación:
    - Convierte a mayúsculas
    - Elimina formas jurídicas (SA, SRL, LTDA, etc.)
    - Elimina puntos, comas y caracteres especiales
    - Colapsa espacios múltiples
    """
    if pd.isna(nombre):
        return ''
    nombre = str(nombre).upper().strip()
    # Eliminar formas jurídicas comunes
    nombre = re.sub(
        r'\b(SA|SRL|LTDA|S\.A\.|S\.R\.L\.|SOCIEDAD ANONIMA|SOCIEDAD ANÓNIMA|'
        r'S\.A|SACI|SAECA|S\.A\.E\.C\.A\.|SAE|EMISORA DE CAPITAL ABIERTO)\b',
        '', nombre
    )
    # Eliminar caracteres no alfanuméricos
    nombre = re.sub(r'[^\w\s]', ' ', nombre)
    # Colapsar espacios
    nombre = re.sub(r'\s+', ' ', nombre).strip()
    return nombre

# Crear mapas: nombre_normalizado → nombre_original
erp_norm_map  = {normalizar(c): c for c in erp_por_cliente['CLIENTE'].tolist()}
dnit_norm_map = {normalizar(c): c for c in dnit['DNIT_NOMBRE'].tolist()}


# ══════════════════════════════════════════════════════════════
# PASO 5: FUZZY MATCHING
# ══════════════════════════════════════════════════════════════
# ERROR COMÚN: usar umbral muy bajo (ej: 50%) → matchea empresas
# que no tienen nada que ver. Con 50% podés cruzar
# "BANCO BASA" con "BANCO PARA LA COMERCIALIZACION" y
# reportar 112 matches en vez de 49 reales.
#
# Umbrales recomendados:
# - >= 90%: match casi exacto, muy confiable
# - 75-89%: match bueno, revisar casos dudosos
# - < 75%:  demasiado impreciso, mejor no incluir

UMBRAL_MINIMO = 75

def mejor_match(query_norm, choices_norm_map, umbral=UMBRAL_MINIMO):
    """
    Busca el nombre más similar usando token_sort_ratio.
    token_sort_ratio ordena las palabras antes de comparar,
    lo que ayuda con "PARAGUAY REFRESCOS" vs "REFRESCOS PARAGUAY".
    Retorna (nombre_original_matched, score) o (None, 0).
    """
    resultado = process.extractOne(
        query_norm,
        choices_norm_map.keys(),
        scorer=fuzz.token_sort_ratio
    )
    if resultado and resultado[1] >= umbral:
        return choices_norm_map[resultado[0]], resultado[1]
    return None, 0


# ══════════════════════════════════════════════════════════════
# PASO 6: CONSTRUIR TABLA CRUZADA
# ══════════════════════════════════════════════════════════════

filas = []
for _, erp_row in erp_por_cliente.iterrows():
    cliente = erp_row['CLIENTE']
    query_norm = normalizar(cliente)

    dnit_match, dnit_score = mejor_match(query_norm, dnit_norm_map)

    fila = {
        'CLIENTE_ERP':   cliente,
        'FACTURACION_GS': erp_row['FACTURACION'],
        'COSTO_GS':       erp_row['COSTO'],
        'REVENUE_GS':     erp_row['REVENUE'],
        'EMPRESA':        erp_row['EMPRESA'],
    }

    if dnit_match:
        dn = dnit[dnit['DNIT_NOMBRE'] == dnit_match].iloc[0]
        fila.update({
            'DNIT_MATCH':          dnit_match,
            'CONFIANZA_MATCH_PCT': dnit_score,
            'RANKING_DNIT':        dn['RANKING_DNIT'],
            'INGRESO_ESTIMADO_GS': dn['INGRESO_ESTIMADO_GS'],
            'APORTE_GS':           dn['APORTE_GS'],
        })
    else:
        fila.update({
            'DNIT_MATCH':          None,
            'CONFIANZA_MATCH_PCT': 0,
            'RANKING_DNIT':        None,
            'INGRESO_ESTIMADO_GS': None,
            'APORTE_GS':           None,
        })

    filas.append(fila)

df_cruzado = pd.DataFrame(filas)
con_dnit = df_cruzado[df_cruzado['RANKING_DNIT'].notna()]
sin_dnit = df_cruzado[df_cruzado['RANKING_DNIT'].isna()]

print(f"\nClientes ERP con match DNIT:    {len(con_dnit)}")
print(f"Clientes ERP sin match DNIT:    {len(sin_dnit)}")
print(f"% facturación cubierta por DNIT: {con_dnit['FACTURACION_GS'].sum() / df_cruzado['FACTURACION_GS'].sum() * 100:.1f}%")


# ══════════════════════════════════════════════════════════════
# PASO 7: EXPORTAR
# ══════════════════════════════════════════════════════════════

df_cruzado.to_excel('resultado_cruce_erp_dnit.xlsx', index=False)
print("\nArchivo exportado: resultado_cruce_erp_dnit.xlsx")


# ══════════════════════════════════════════════════════════════
# RESUMEN DE ERRORES EN LA APP Y CÓMO CORREGIRLOS
# ══════════════════════════════════════════════════════════════
"""
ERROR 1: "112 empresas coinciden entre ambas fuentes"
─────────────────────────────────────────────────────
CAUSA:   Umbral de similitud demasiado bajo (probablemente 50% o menos).
         Con un umbral bajo, "BANCO BASA" matchea con cualquier empresa
         que contenga la palabra BANCO aunque no tenga nada que ver.
CORRECCIÓN: Usar umbral mínimo de 75%. El resultado correcto es 49 matches.


ERROR 2: "Cervepar y Paraguay Refrescos no aparecen en el ERP"
──────────────────────────────────────────────────────────────
CAUSA:   Join exacto por nombre (==) sin normalizar.
         "CERVEPAR S.A." (ERP) != "CERVEPAR S.A." (DNIT) por diferencias
         de puntos, espacios o tildes.
CORRECCIÓN: Normalizar ambos nombres antes de comparar (ver función
            normalizar() arriba) y usar fuzzy matching.


ERROR 3: "AISANI representa el 78% de la facturación"
──────────────────────────────────────────────────────
CAUSA:   No se filtran los estados del ERP antes de sumar.
         Las REVERSIONES son valores positivos en el campo FACTURACION
         pero representan anulaciones. Si se suman sin filtrar,
         el total y la distribución por cliente quedan completamente
         distorsionados.
CORRECCIÓN: Filtrar SOLO los estados FACTURADO y FACTURA antes de
            agrupar y sumar. El cliente con mayor facturación real
            es CERVEPAR con Gs. 26.650 MM, no AISANI.


ERROR 4: Cervepar aparece en "top del DNIT que NO son mis clientes"
────────────────────────────────────────────────────────────────────
CAUSA:   Consecuencia del error 2. Si no se matchea Cervepar del ERP
         con Cervepar del DNIT, el sistema lo clasifica como "no cliente"
         cuando en realidad es el cliente más grande.
CORRECCIÓN: Igual que error 2 — normalizar y usar fuzzy matching.


VALORES CORRECTOS DE REFERENCIA
────────────────────────────────
- Clientes únicos ERP (facturados): 204
- Facturación total neta:           Gs. 123.553.091.602
- Clientes cruzados con DNIT:       49 (24% de los clientes)
- % facturación cubierta por DNIT:  57.5%
- Cliente con mayor facturación:    CERVEPAR S.A. con Gs. 26.650 MM
- Cliente con mayor revenue:        PARAGUAY REFRESCOS con Gs. 1.990 MM
"""
