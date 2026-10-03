from db import obtener_conexion

NOMBRE_EXTENSION = 'crud_generator'


# Funciones de la extensión que la aplicación llama directamente.
FUNCIONES_CLAVE = ['crud_operaciones', 'crud_analizar_tabla',
                   'crud_generar_codigo', 'crud_generar_procedimiento']


def verificar_extension():
    """
    Verifica la extensión crud_generator preguntándole TODO al servidor
    (no se asume nada por tener los archivos en la máquina del cliente).

    Devuelve "estado" con uno de estos valores:
      instalada      -> instalada y el usuario conectado puede usarla.
      no_instalada   -> el servidor tiene los archivos, pero falta
                        CREATE EXTENSION en esta base de datos.
      no_disponible  -> el servidor ni siquiera tiene los archivos.
      sin_acceso     -> instalada, pero el usuario conectado no puede
                        usarla (le falta USAGE en el esquema o EXECUTE
                        en las funciones).
      error          -> falló la consulta.
    y "pasos": la lista de revisiones hechas, para mostrarlas en pantalla.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'estado': 'error',
                'pasos': [{'ok': False, 'texto': 'No se pudo hablar con el servidor PostgreSQL'}],
                'mensaje': 'No hay una conexión activa con PostgreSQL (¿se detuvo el servidor?). '
                           'Volvé a conectar desde "Cambiar conexión".'}

    pasos = []

    def paso(ok, texto):
        pasos.append({'ok': ok, 'texto': texto})

    try:
        cursor = conexion.cursor()

        cursor.execute('SELECT current_user, current_database(), '
                       '(SELECT rolsuper FROM pg_roles WHERE rolname = current_user);')
        usuario, base, es_super = cursor.fetchone()
        paso(True, f'Conectado a "{base}" como "{usuario}"' + (' (superusuario)' if es_super else ''))

        # 1. ¿El SERVIDOR tiene los archivos (.control y .sql)?
        cursor.execute(
            'SELECT default_version FROM pg_available_extensions WHERE name = %s;',
            (NOMBRE_EXTENSION,)
        )
        fila = cursor.fetchone()
        version_disponible = fila[0] if fila else None

        if version_disponible is None:
            paso(False, 'El servidor PostgreSQL no tiene los archivos de la extensión')
            conexion.rollback()
            return {
                'exito': True, 'estado': 'no_disponible', 'instalada': False, 'pasos': pasos,
                'mensaje': 'El servidor no tiene instalados los archivos de crud_generator '
                           '(.control y .sql en su carpeta de extensiones). No basta con que '
                           'estén en la computadora donde corre la aplicación.'
            }
        paso(True, f'Archivos de la extensión presentes en el servidor (versión {version_disponible})')

        # 2. ¿Está instalada en ESTA base de datos?
        cursor.execute("""
            SELECT e.oid, e.extversion, n.nspname
            FROM pg_catalog.pg_extension e
            JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
            WHERE e.extname = %s;
        """, (NOMBRE_EXTENSION,))
        fila = cursor.fetchone()

        if fila is None:
            paso(False, f'No está instalada en la base de datos "{base}"')
            conexion.rollback()
            return {
                'exito': True, 'estado': 'no_instalada', 'instalada': False, 'pasos': pasos,
                'version_disponible': version_disponible,
                'puede_instalar': bool(es_super),
                'mensaje': 'La extensión no está instalada en esta base de datos.' +
                           ('' if es_super else ' Para instalarla se necesita un superusuario.')
            }

        oid_ext, version, esquema = fila
        paso(True, f'Instalada en "{base}" (versión {version}, esquema "{esquema}")')

        # 3. ¿El usuario conectado puede USARLA?
        cursor.execute('SELECT has_schema_privilege(current_user, %s, %s);', (esquema, 'USAGE'))
        tiene_usage = cursor.fetchone()[0]

        cursor.execute("""
            SELECT p.proname, p.oid::regprocedure::text,
                   has_function_privilege(current_user, p.oid, 'EXECUTE')
            FROM pg_catalog.pg_depend d
            JOIN pg_catalog.pg_proc p ON p.oid = d.objid
            WHERE d.classid = 'pg_catalog.pg_proc'::regclass
              AND d.refclassid = 'pg_catalog.pg_extension'::regclass
              AND d.refobjid = %s
              AND d.deptype = 'e';
        """, (oid_ext,))
        funciones = cursor.fetchall()
        nombres = {f[0] for f in funciones}
        faltan_funciones = [f for f in FUNCIONES_CLAVE if f not in nombres]
        sin_execute = [firma for nombre, firma, puede in funciones if not puede]

        conexion.rollback()
        cursor.close()

        if faltan_funciones:
            paso(False, 'Faltan funciones de la extensión: ' + ', '.join(faltan_funciones))
            return {
                'exito': True, 'estado': 'error', 'instalada': True, 'version': version,
                'pasos': pasos,
                'mensaje': f'La versión {version} instalada está incompleta: faltan '
                           + ', '.join(faltan_funciones) + '. Probá actualizarla.'
            }

        problemas = []
        if not tiene_usage:
            problemas.append(f'USAGE sobre el esquema "{esquema}"')
            paso(False, f'El usuario no tiene USAGE sobre el esquema "{esquema}"')
        if sin_execute:
            problemas.append('EXECUTE sobre: ' + ', '.join(sin_execute))
            paso(False, f'El usuario no puede ejecutar {len(sin_execute)} función(es) de la extensión')

        if problemas:
            return {
                'exito': True, 'estado': 'sin_acceso', 'instalada': True, 'version': version,
                'pasos': pasos,
                'mensaje': f'La extensión está instalada, pero el usuario "{usuario}" no puede '
                           'usarla. Le falta: ' + '; '.join(problemas) + '.'
            }

        paso(True, f'El usuario "{usuario}" puede usar las {len(funciones)} funciones de la extensión')

        return {
            'exito': True, 'estado': 'instalada', 'instalada': True, 'pasos': pasos,
            'version': version,
            'version_disponible': version_disponible,
            'actualizacion_disponible': version != version_disponible,
        }

    except Exception as e:
        conexion.rollback()
        mensaje = e.diag.message_primary if getattr(e, 'diag', None) and e.diag.message_primary else str(e)
        paso(False, 'La consulta falló')
        return {'exito': False, 'estado': 'error', 'pasos': pasos,
                'mensaje': f'Error al verificar la extensión: {mensaje}'}


def instalar_extension():
    """Instala (CREATE EXTENSION) crud_generator en la BD conectada."""
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        cursor.execute(f'CREATE EXTENSION IF NOT EXISTS {NOMBRE_EXTENSION};')
        conexion.commit()
        cursor.close()
        return {'exito': True, 'mensaje': 'Extensión instalada correctamente.'}

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al instalar la extensión: {str(e)}'}


def actualizar_extension():
    """
    Copia los archivos nuevos y aplica el parche (ALTER EXTENSION ... UPDATE).

    La copia se hace con "COPY ... TO PROGRAM", que ejecuta el comando
    dentro del propio servidor de Postgres (adentro del contenedor), usando
    la misma conexión SQL que ya está abierta. Así no depende de que la
    máquina donde corre el backend tenga el comando "docker" disponible.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()

        comando_copia = (
            f'cp /extension-custom/{NOMBRE_EXTENSION}* '
            '/usr/share/postgresql/16/extension/'
        )
        cursor.execute(f"COPY (SELECT 1) TO PROGRAM '{comando_copia}';")

        cursor.execute(f'ALTER EXTENSION {NOMBRE_EXTENSION} UPDATE;')
        conexion.commit()

        cursor.execute(
            'SELECT extversion FROM pg_extension WHERE extname = %s;',
            (NOMBRE_EXTENSION,)
        )
        version = cursor.fetchone()[0]
        cursor.close()

        return {'exito': True, 'mensaje': 'Extensión actualizada correctamente.', 'version': version}

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al actualizar la extensión: {str(e)}'}
