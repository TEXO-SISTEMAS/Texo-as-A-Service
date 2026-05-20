from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.utils.database import Base


class DatoAdlensBase(Base):
    __tablename__ = "datos_adlens_base"

    id         = Column(Integer, primary_key=True, index=True)
    sesion_id  = Column(Integer, ForeignKey("sesiones.id"), nullable=False, index=True)
    archivo_id = Column(Integer, ForeignKey("archivos_subidos.id"), nullable=False)

    # ── Identificación ────────────────────────────────────────
    anunciante               = Column(String, nullable=False, index=True)
    rubro_principal          = Column(String, nullable=True)
    central_de_medios        = Column(String, nullable=True)
    nombre_gerente_marketing = Column(String, nullable=True)
    nombre_dueno             = Column(String, nullable=True)
    sitio_web                = Column(String, nullable=True)

    # ── Perfil de empresa ─────────────────────────────────────
    tipo_empresa             = Column(String, nullable=True)
    tamano_empresa           = Column(String, nullable=True)
    tipo_marca               = Column(String, nullable=True)
    marcas                   = Column(String, nullable=True)

    # ── Estructura organizacional ─────────────────────────────
    tiene_depto_compras      = Column(String, nullable=True)
    tiene_depto_marketing    = Column(String, nullable=True)
    tiene_presupuesto_anual  = Column(String, nullable=True)
    modalidad_proyectos      = Column(String, nullable=True)
    decisiones_autonomas     = Column(String, nullable=True)
    aprobacion_decisiones    = Column(String, nullable=True)
    contacto_externo         = Column(String, nullable=True)
    tamano_equipo_marketing  = Column(String, nullable=True)

    # ── Marca y posicionamiento ───────────────────────────────
    estadio_brand_funnel     = Column(String, nullable=True)
    market_share             = Column(String, nullable=True)
    medios_principales       = Column(String, nullable=True)
    afinidad_servicios       = Column(String, nullable=True)
    busca_innovacion         = Column(String, nullable=True)
    perfil_empresa           = Column(String, nullable=True)
    trabaja_construccion_marca = Column(String, nullable=True)

    # ── Cultura y RSE ─────────────────────────────────────────
    tiene_cultura_org        = Column(String, nullable=True)
    tiene_rse                = Column(String, nullable=True)
    rse_alineado_marca       = Column(String, nullable=True)

    # ── Digital ───────────────────────────────────────────────
    interlocutor_digital          = Column(String, nullable=True)
    invierte_marketing_digital    = Column(String, nullable=True)
    impacto_pandemia_digital      = Column(String, nullable=True)
    tiene_depto_digital           = Column(String, nullable=True)
    tiene_estrategia_digital      = Column(String, nullable=True)
    foco_pauta_digital            = Column(String, nullable=True)
    plataforma_digital_principal  = Column(String, nullable=True)

    # ── Datos y CRM ───────────────────────────────────────────
    trabaja_datos_clientes   = Column(String, nullable=True)
    tipo_sistema             = Column(String, nullable=True)
    tiene_crm                = Column(String, nullable=True)
    crm_integrado            = Column(String, nullable=True)
    tiene_programa_fidelidad = Column(String, nullable=True)

    # ── Innovación e investigación ────────────────────────────
    ultima_innovacion        = Column(String, nullable=True)
    invierte_research        = Column(String, nullable=True)
    invierte_pdv             = Column(String, nullable=True)
    invierte_investigacion   = Column(String, nullable=True)
    nivel_desconfianza       = Column(String, nullable=True)

    # ── Inversión por medio (miles USD) ──────────────────────
    inv_tv_abierta_usd       = Column(Float, nullable=True)
    inv_radio_usd            = Column(Float, nullable=True)
    inv_cable_usd            = Column(Float, nullable=True)
    inv_revistas_usd         = Column(Float, nullable=True)
    inv_diarios_usd          = Column(Float, nullable=True)
    inv_pdv_usd              = Column(Float, nullable=True)
    rango_inversion          = Column(Float, nullable=True)
    inversion_en_medios      = Column(Float, nullable=True)

    # ── Scores numéricos (versión cuantitativa del cuestionario) ─
    score_perfil_empresa          = Column(Float, nullable=True)
    score_construccion_marca      = Column(Float, nullable=True)
    score_horizonte_plazo         = Column(Float, nullable=True)
    score_importancia_estrategia  = Column(Float, nullable=True)
    score_presupuesto_anual       = Column(Float, nullable=True)
    score_decisiones_autonomas    = Column(Float, nullable=True)
    score_importancia_diseno      = Column(Float, nullable=True)
    score_innovacion_publicidad   = Column(Float, nullable=True)
    score_desconfianza            = Column(Float, nullable=True)
    score_afinidad_servicios      = Column(Float, nullable=True)
    score_depto_compras           = Column(Float, nullable=True)
    score_area_marketing          = Column(Float, nullable=True)
    score_tamano_equipo           = Column(Float, nullable=True)
    score_tamano_empresa          = Column(Float, nullable=True)
    score_depto_digital           = Column(Float, nullable=True)
    score_marcas                  = Column(Float, nullable=True)
    score_brand_funnel            = Column(Float, nullable=True)
    score_market_share            = Column(Float, nullable=True)
    score_invierte_digital        = Column(Float, nullable=True)
    score_invierte_research       = Column(Float, nullable=True)
    score_invierte_pdv            = Column(Float, nullable=True)
    score_invierte_investigacion  = Column(Float, nullable=True)

    # ── Métricas de madurez (resultado del modelo) ────────────
    puntaje_total    = Column(Float, nullable=True)
    cluster          = Column(Float, nullable=True)
    tipo_cluster     = Column(Float, nullable=True)
    cultura          = Column(Float, nullable=True)
    ejecucion        = Column(Float, nullable=True)
    estructura       = Column(Float, nullable=True)
    competitividad   = Column(Float, nullable=True)
    inversion        = Column(Float, nullable=True)
    z_cultura        = Column(Float, nullable=True)
    z_ejecucion      = Column(Float, nullable=True)
    z_estructura     = Column(Float, nullable=True)
    z_competitividad = Column(Float, nullable=True)
    z_inversion      = Column(Float, nullable=True)
    formula_pc1      = Column(Float, nullable=True)
    formula_pc2      = Column(Float, nullable=True)
