import { useState, useEffect } from "react";

interface ClienteTop10 {
  CLIENTE: string;
  FACTURACION: number;
  REVENUE: number;
  COSTO: number;
}

interface PorEmpresa {
  empresa: string;
  facturacion: number;
  revenue: number;
}

interface EvolucionTop5 {
  [cliente: string]: {
    [ano: string]: {
      facturacion_gs: number;
      revenue_gs: number;
    };
  };
}

interface NoCliente {
  ranking_dnit: number;
  nombre: string;
  ingreso_estimado_gs: number;
}

interface ClienteConDnit {
  cliente_erp: string;
  ranking_dnit: number;
  facturacion_gs: number;
}

interface ClusterMarketing {
  tipodecluster: string;
  n_clientes: number;
  facturacion_total: number;
}

interface TopInversionMedios {
  cliente: string;
  inv_total_gs: number;
  facturacion_gs: number;
}

export interface AgenciaEjecutiva {
  nombre: string;
  revenue: number;
  facturacion: number;
  margen_pct: number;
  cliente_top: string;
  concentracion_pct: number;
  estado: string;
  estado_tipo: "sana" | "dependencia" | "alerta" | "critico";
}

export interface CuatroPregunta {
  pregunta: string;
  respuesta: string;
  detalle: string;
}

export interface Insight {
  tipo: "riesgo" | "tension" | "oportunidad" | "anomalia" | "insight" | "prioridad";
  titulo: string;
  texto: string;
}

export interface SaludEjecutiva {
  score_grupal: number;
  veredicto: string;
  agencias: AgenciaEjecutiva[];
  cuatro_preguntas: {
    salud: CuatroPregunta;
    riesgo: CuatroPregunta;
    potencial: CuatroPregunta;
    intervencion: CuatroPregunta;
  };
  insights: Insight[];
}

interface DashboardData {
  erp: {
    facturacion_total_gs: number;
    revenue_total_gs: number;
    anos_disponibles: number[];
    clientes_por_ano: Record<string, number>;
    top10_clientes: ClienteTop10[];
    por_empresa: PorEmpresa[];
    evolucion_top5: EvolucionTop5;
  };
  dnit: {
    total_en_ranking: number;
    top10_no_clientes: NoCliente[];
    clientes_con_dnit: ClienteConDnit[];
  };
  marketing: {
    total_con_madurez: number;
    por_cluster: ClusterMarketing[];
    top_inversion_medios: TopInversionMedios[];
  };
  salud_ejecutiva?: SaludEjecutiva;
}

interface UseDashboardReturn {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
}

export function useDashboard(sesionId: number | string | null): UseDashboardReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sesionId) {
      setData(null);
      return;
    }

    const fetchDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/dashboard/sesion/${sesionId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: token ? `Bearer ${token}` : "",
            },
            credentials: "include",
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("No autorizado. Por favor, inicia sesión nuevamente.");
          }
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al cargar el dashboard";
        setError(message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [sesionId]);

  return { data, loading, error };
}
