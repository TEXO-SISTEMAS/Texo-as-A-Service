# Importar todos los modelos para que Alembic los detecte al generar migraciones
from .usuario import Usuario
from .sesion import Sesion
from .archivo_subido import ArchivoSubido
from .entidad import Entidad
from .match_cruzado import MatchCruzado
from .match_global import MatchGlobal
from .conversacion import Conversacion
from .mensaje import Mensaje
from .datos_erp import DatoERP
from .datos_dnit import DatoDNIT
from .datos_marketing import DatoMarketing
