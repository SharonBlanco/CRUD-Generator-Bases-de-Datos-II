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
    "Lista las tablas de un esquema"
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        cursor.execute(
            'SELECT table_name FROM information_schema.tables WHERE table_schema = %s;',
            (esquema,)
        )
        tablas = [fila[0] for fila in cursor.fetchall()]
        cursor.close()

        return {'exito': True, 'tablas': tablas}

    except Exception as e:
        return {'exito': False, 'mensaje': f'Error al listar tablas: {str(e)}'}


def analizar_tabla(esquema, tabla):
    """
    Analiza la estructura de una tabla: columnas, tipos, si aceptan nulos,
    cuáles son autogeneradas, y cuál es la llave primaria.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()

        cursor.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position;
        """, (esquema, tabla))
        filas_columnas = cursor.fetchall()

        cursor.execute("""
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = %s
                AND tc.table_name = %s;
        """, (esquema, tabla))
        llaves_primarias = {fila[0] for fila in cursor.fetchall()}
        cursor.close()

        columnas = [
            {
                'nombre': nombre,
                'tipo': tipo,
                'permite_nulos': permite_nulos == 'YES',
                'autogenerada': valor_default is not None and 'nextval' in valor_default,
                'es_llave_primaria': nombre in llaves_primarias
            }
            for nombre, tipo, permite_nulos, valor_default in filas_columnas
        ]

        return {'exito': True, 'columnas': columnas}

    except Exception as e:
        return {'exito': False, 'mensaje': f'Error al analizar tabla: {str(e)}'}
