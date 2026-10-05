"""
Puente hacia las funciones de generación de la extensión crud_generator.

La lógica de generación vive en la extensión, no aquí: este módulo solo
pasa el esquema, la tabla y la operación como parámetros. Por eso no hay
ningún nombre de tabla ni SQL específico de una tabla en este archivo.
"""
import psycopg2

from db import obtener_conexion


def _mensaje_error(e):
    """Saca el mensaje que levantó PostgreSQL, sin el ruido del driver."""
    if isinstance(e, psycopg2.Error) and e.diag and e.diag.message_primary:
        return e.diag.message_primary
    return str(e)


def listar_operaciones():
    """Operaciones CRUD que la extensión sabe generar."""
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        cursor.execute('SELECT codigo, etiqueta FROM crud_operaciones();')
        operaciones = [{'codigo': fila[0], 'etiqueta': fila[1]} for fila in cursor.fetchall()]
        cursor.close()

        return {'exito': True, 'operaciones': operaciones}

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al consultar las operaciones: {_mensaje_error(e)}'}


def generar_codigo(esquema, tabla, operacion):
    """Vista previa: devuelve el SQL generado sin ejecutarlo."""
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        cursor.execute(
            'SELECT crud_generar_codigo(%s, %s, %s);',
            (esquema, tabla, operacion)
        )
        codigo = cursor.fetchone()[0]
        cursor.close()

        return {'exito': True, 'codigo': codigo}

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al generar el código: {_mensaje_error(e)}'}


def crear_procedimiento(esquema, tabla, operacion):
    """Genera el procedimiento y lo crea en la base de datos."""
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        cursor.execute(
            'CALL crud_generar_procedimiento(%s, %s, %s);',
            (esquema, tabla, operacion)
        )
        conexion.commit()
        cursor.close()

        return {'exito': True, 'mensaje': 'Procedimiento creado correctamente.'}

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al crear el procedimiento: {_mensaje_error(e)}'}


def listar_procedimientos(esquema, tabla):
    """Procedimientos y funciones ya generados para una tabla."""
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        # Nombres exactos <tabla>_<operacion>, con las operaciones que
        # conoce la extensión. (Con LIKE 'tabla_%' una tabla "cliente"
        # también agarraría los de otra tabla llamada "cliente_vip".)
        cursor.execute("""
            SELECT p.proname,
                   pg_catalog.pg_get_function_identity_arguments(p.oid),
                   CASE p.prokind WHEN 'p' THEN 'procedimiento' ELSE 'función' END
            FROM pg_catalog.pg_proc p
            JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = %s
              AND p.proname IN (SELECT %s || '_' || codigo FROM crud_operaciones())
            ORDER BY p.proname;
        """, (esquema, tabla))

        procedimientos = [
            {'nombre': fila[0], 'argumentos': fila[1], 'clase': fila[2]}
            for fila in cursor.fetchall()
        ]
        cursor.close()

        return {'exito': True, 'procedimientos': procedimientos}

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al listar procedimientos: {_mensaje_error(e)}'}


def crear_lote(esquema, tablas, operaciones):
    """
    Genera varias tablas x varias operaciones de una vez.

    Cada procedimiento va en su propia transacción: si uno falla (por
    ejemplo "eliminar" en una tabla sin clave primaria), los demás se
    crean igual, y se reporta el error de ese solo.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    if not tablas or not operaciones:
        return {'exito': False, 'mensaje': 'Seleccioná al menos una tabla y una operación.'}

    resultados = []
    for tabla in tablas:
        for operacion in operaciones:
            try:
                cursor = conexion.cursor()
                cursor.execute(
                    'CALL crud_generar_procedimiento(%s, %s, %s);',
                    (esquema, tabla, operacion)
                )
                conexion.commit()
                cursor.close()
                resultados.append({'tabla': tabla, 'operacion': operacion, 'exito': True,
                                   'mensaje': 'Creado.'})
            except Exception as e:
                conexion.rollback()
                resultados.append({'tabla': tabla, 'operacion': operacion, 'exito': False,
                                   'mensaje': _mensaje_error(e)})

    creados = sum(1 for r in resultados if r['exito'])
    return {
        'exito': True,
        'mensaje': f'{creados} de {len(resultados)} procedimientos creados.',
        'resultados': resultados,
    }
