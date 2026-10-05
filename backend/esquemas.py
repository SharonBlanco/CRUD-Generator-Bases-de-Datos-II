from db import obtener_conexion


def listar_esquemas():
    "Lista los esquemas disponibles"
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}
    try:
        cursor = conexion.cursor()
        cursor.execute("""
            SELECT schema_name FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast');
        """)
        filas = cursor.fetchall()
        cursor.close()

        esquemas = [fila[0] for fila in filas]
        return {'exito': True, 'esquemas': esquemas}

    except Exception as e:
        return {'exito': False, 'mensaje': f'Error al listar esquemas: {str(e)}'}


def listar_tablas(esquema):
    """
    Lista las tablas base de un esquema (sin vistas), leyendo pg_class.
    information_schema.tables también devuelve vistas, y a una vista no
    se le pueden generar procedimientos CRUD.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        cursor.execute("""
            SELECT c.relname
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = %s
              AND c.relkind IN ('r', 'p')      -- tabla normal o particionada
              AND NOT c.relispartition         -- no listar cada partición suelta
            ORDER BY c.relname;
        """, (esquema,))
        tablas = [fila[0] for fila in cursor.fetchall()]
        cursor.close()
        conexion.rollback()

        return {'exito': True, 'tablas': tablas}

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al listar tablas: {str(e)}'}


def analizar_tabla(esquema, tabla):
    """
    Estructura de una tabla, obtenida de la EXTENSIÓN (crud_analizar_tabla),
    que es la misma función que usan los generadores. Así la pantalla
    muestra exactamente lo que la extensión va a usar para generar, y la
    lógica estructural no se duplica en Python.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        cursor.execute("""
            SELECT columna, tipo, acepta_nulos, autogenerada, es_pk, valor_defecto
            FROM crud_analizar_tabla(%s, %s)
            ORDER BY posicion;
        """, (esquema, tabla))
        filas = cursor.fetchall()
        cursor.close()
        conexion.rollback()

        columnas = [
            {
                'nombre': nombre,
                'tipo': tipo,
                'permite_nulos': nulos,
                'autogenerada': auto,
                'es_llave_primaria': pk,
                'valor_defecto': defecto,
            }
            for nombre, tipo, nulos, auto, pk, defecto in filas
        ]

        return {
            'exito': True,
            'columnas': columnas,
            'tiene_pk': any(c['es_llave_primaria'] for c in columnas),
        }

    except Exception as e:
        conexion.rollback()
        mensaje = e.diag.message_primary if getattr(e, 'diag', None) and e.diag.message_primary else str(e)
        return {'exito': False, 'mensaje': f'Error al analizar tabla: {mensaje}'}
