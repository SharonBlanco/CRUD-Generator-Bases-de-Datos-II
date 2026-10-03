"""
Ejecutar los procedimientos generados desde la aplicación, opcionalmente
"como" otro rol (SET LOCAL ROLE), para demostrar que los privilegios se
cumplen con datos reales.

Igual que el resto del backend, no conoce ninguna tabla: los parámetros
de cada procedimiento se leen de pg_proc, y la llamada se arma con:
  * sql.Identifier para esquema, procedimiento y nombres de parámetros,
  * los valores como parámetros de psycopg2 (%s), nunca concatenados,
  * un cast ::tipo con el tipo que escribe PostgreSQL (format_type).
"""
import datetime
import decimal

import psycopg2
from psycopg2 import sql

from db import obtener_conexion


SIN_CONEXION = {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}


def _mensaje_error(e):
    if isinstance(e, psycopg2.Error) and e.diag and e.diag.message_primary:
        return e.diag.message_primary
    return str(e)


def _a_json(valor):
    """Convierte lo que devuelve psycopg2 a algo que jsonify entienda."""
    if valor is None or isinstance(valor, (bool, int, float, str)):
        return valor
    if isinstance(valor, decimal.Decimal):
        return str(valor)
    if isinstance(valor, (datetime.date, datetime.datetime, datetime.time)):
        return valor.isoformat(sep=' ') if isinstance(valor, datetime.datetime) else valor.isoformat()
    return str(valor)


def _procedimientos(cursor, esquema, tabla):
    """
    {operacion: {nombre, clase, parametros: [{nombre, tipo, opcional}]}}
    para los procedimientos generados de la tabla que existen.
    Los últimos `pronargdefaults` parámetros son los que tienen DEFAULT.
    """
    cursor.execute("""
        SELECT o.codigo,
               p.proname,
               p.prokind,
               p.pronargs,
               p.pronargdefaults,
               p.proargnames,
               ARRAY(
                   SELECT pg_catalog.format_type(t, NULL)
                   FROM unnest(p.proargtypes) WITH ORDINALITY AS a(t, i)
                   ORDER BY i
               )
        FROM crud_operaciones() o
        JOIN pg_catalog.pg_proc p ON p.proname = %s || '_' || o.codigo
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = %s;
    """, (tabla, esquema))

    resultado = {}
    for codigo, nombre, kind, nargs, ndefaults, nombres, tipos in cursor.fetchall():
        nombres = nombres or [f'${i + 1}' for i in range(nargs)]
        primero_opcional = nargs - ndefaults
        resultado[codigo] = {
            'nombre': nombre,
            'clase': 'procedimiento' if kind == 'p' else 'función',
            'parametros': [
                {'nombre': nombres[i], 'tipo': tipos[i], 'opcional': i >= primero_opcional}
                for i in range(nargs)
            ],
        }
    return resultado


def describir(esquema, tabla):
    """Roles disponibles y los procedimientos (con sus parámetros) de la tabla."""
    conexion = obtener_conexion()
    if conexion is None:
        return SIN_CONEXION

    try:
        cursor = conexion.cursor()
        cursor.execute("""
            SELECT rolname, rolsuper
            FROM pg_catalog.pg_roles
            WHERE rolname !~ '^pg_'
            ORDER BY rolsuper, rolname;
        """)
        roles = [{'nombre': n, 'superusuario': s} for n, s in cursor.fetchall()]

        cursor.execute('SELECT codigo, etiqueta FROM crud_operaciones();')
        operaciones = [{'codigo': c, 'etiqueta': e} for c, e in cursor.fetchall()]

        procs = _procedimientos(cursor, esquema, tabla)
        cursor.execute('SELECT current_user;')
        usuario_actual = cursor.fetchone()[0]

        cursor.close()
        conexion.rollback()

        return {
            'exito': True,
            'roles': roles,
            'usuario_actual': usuario_actual,
            'operaciones': operaciones,
            'procedimientos': procs,
        }

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al leer los procedimientos: {_mensaje_error(e)}'}


def _filas(cursor):
    columnas = [d.name for d in cursor.description]
    filas = [[_a_json(v) for v in fila] for fila in cursor.fetchall()]
    return {'columnas': columnas, 'filas': filas}


def ejecutar(esquema, tabla, operacion, rol, valores):
    """
    Ejecuta <tabla>_<operacion> con los valores dados.

    valores = {"p_cedula": "101", "p_nombre": "Ana", "p_correo": ""}
      * Texto vacío en un parámetro opcional  -> no se envía (usa su DEFAULT).
      * Texto vacío en un parámetro obligatorio -> se envía NULL.

    rol: si viene, se ejecuta con SET LOCAL ROLE (solo dura la transacción).
    Si la ejecución funciona, se hace COMMIT: los cambios quedan guardados.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return SIN_CONEXION

    valores = valores or {}
    sentencia = ''
    if not isinstance(valores, dict):
        return {'exito': False, 'mensaje': 'Valores inválidos.'}

    try:
        cursor = conexion.cursor()

        procs = _procedimientos(cursor, esquema, tabla)
        proc = procs.get(operacion)
        if proc is None:
            conexion.rollback()
            return {'exito': False,
                    'mensaje': f'La tabla {esquema}.{tabla} no tiene generado el procedimiento "{operacion}".'}

        if rol:
            cursor.execute('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = %s;', (rol,))
            if cursor.fetchone() is None:
                conexion.rollback()
                return {'exito': False, 'mensaje': f'El rol "{rol}" no existe.'}

        # Armar argumentos con notación nombrada: p_x => %s::tipo
        argumentos = []
        parametros = []
        for p in proc['parametros']:
            texto = valores.get(p['nombre'])
            vacio = texto is None or str(texto).strip() == ''
            if vacio and p['opcional']:
                continue
            argumentos.append(sql.SQL('{} => %s::{}').format(
                sql.Identifier(p['nombre']), sql.SQL(p['tipo'])))
            parametros.append(None if vacio else str(texto))

        rutina = sql.Identifier(esquema, proc['nombre'])
        lista = sql.SQL(', ').join(argumentos)
        if proc['clase'] == 'procedimiento':
            llamada = sql.SQL('CALL {}({})').format(rutina, lista)
        else:
            llamada = sql.SQL('SELECT * FROM {}({})').format(rutina, lista)

        sentencia = cursor.mogrify(llamada, parametros).decode()

        if rol:
            cursor.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(rol)))

        cursor.execute(llamada, parametros)
        resultado_consulta = _filas(cursor) if proc['clase'] == 'función' else None

        conexion.commit()

        # Estado de la tabla después de ejecutar (con el usuario conectado,
        # no con el rol de prueba), para ver el efecto de la operación.
        cursor.execute(sql.SQL('SELECT * FROM {} LIMIT 100').format(sql.Identifier(esquema, tabla)))
        estado_tabla = _filas(cursor)
        conexion.rollback()
        cursor.close()

        return {
            'exito': True,
            'mensaje': 'Ejecutado correctamente' + (f' como "{rol}".' if rol else '.'),
            'sentencia': sentencia + ';',
            'resultado': resultado_consulta,
            'estado_tabla': estado_tabla,
        }

    except psycopg2.Error as e:
        conexion.rollback()
        return {
            'exito': False,
            'denegado': e.pgcode == '42501',
            'mensaje': _mensaje_error(e),
            'sentencia': sentencia + ';' if sentencia else '',
        }
    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al ejecutar: {_mensaje_error(e)}'}
