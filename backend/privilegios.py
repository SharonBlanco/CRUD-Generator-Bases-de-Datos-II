"""
Administración de privilegios sobre los procedimientos CRUD generados.

Traduce una matriz "rol x operación" a GRANT / REVOKE de PostgreSQL.

Reglas de seguridad que sigue este módulo:
  * Los nombres de roles y procedimientos NUNCA se concatenan tal como
    llegan del navegador. Primero se buscan en el catálogo (pg_roles,
    pg_proc) y solo se usan si existen.
  * Los roles se citan con psycopg2.sql.Identifier.
  * Los procedimientos se referencian con oid::regprocedure, que es el
    propio PostgreSQL quien lo escribe (ya citado y con la firma exacta
    de parámetros, así no hay ambigüedad entre sobrecargas).
  * Todo se aplica en una sola transacción: o se aplica la matriz
    completa, o no se aplica nada.

Las operaciones (insertar, consultar, ...) no están fijas aquí: se leen
de crud_operaciones() de la extensión, igual que en generador.py. Cuando
la extensión aprenda una operación nueva, aparece sola en la matriz.
"""
import psycopg2
from psycopg2 import sql

from db import obtener_conexion


SIN_CONEXION = {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}


def _mensaje_error(e):
    """Saca el mensaje que levantó PostgreSQL, sin el ruido del driver."""
    if isinstance(e, psycopg2.Error) and e.diag and e.diag.message_primary:
        return e.diag.message_primary
    return str(e)


# ---------------------------------------------------------------------
# Consultas al catálogo
# ---------------------------------------------------------------------

def _roles(cursor):
    """Roles de la base, sin los internos de PostgreSQL (pg_*)."""
    cursor.execute("""
        SELECT oid, rolname, rolsuper, rolcanlogin
        FROM pg_catalog.pg_roles
        WHERE rolname !~ '^pg_'
        ORDER BY rolsuper, rolname;
    """)
    return [
        {'oid': oid, 'nombre': nombre, 'superusuario': su, 'puede_login': login}
        for oid, nombre, su, login in cursor.fetchall()
    ]


def _operaciones(cursor):
    cursor.execute('SELECT codigo, etiqueta FROM crud_operaciones();')
    return [{'codigo': c, 'etiqueta': e} for c, e in cursor.fetchall()]


def _procedimientos(cursor, esquema, tabla, operaciones):
    """
    Busca en pg_proc el procedimiento generado para cada operación
    (<tabla>_<operacion>). Devuelve {codigo_operacion: info} solo para
    los que existen.
    """
    nombres = [f'{tabla}_{op["codigo"]}' for op in operaciones]

    cursor.execute("""
        SELECT p.oid,
               p.proname,
               p.oid::regprocedure::text,
               p.prokind,
               p.prosecdef,
               pg_catalog.pg_get_userbyid(p.proowner),
               ARRAY(
                   SELECT pg_catalog.format_type(t, NULL)
                   FROM unnest(p.proargtypes) WITH ORDINALITY AS a(t, i)
                   ORDER BY i
               )
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = %s
          AND p.proname = ANY(%s);
    """, (esquema, nombres))

    por_nombre = {}
    for oid, nombre, firma, kind, secdef, dueno, tipos in cursor.fetchall():
        por_nombre[nombre] = {
            'oid': oid,
            'nombre': nombre,
            'firma': firma,
            'clase': 'procedimiento' if kind == 'p' else 'función',
            'security': 'DEFINER' if secdef else 'INVOKER',
            'dueno': dueno,
            'tipos_parametros': tipos,
        }

    resultado = {}
    for op in operaciones:
        info = por_nombre.get(f'{tabla}_{op["codigo"]}')
        if info:
            resultado[op['codigo']] = info
    return resultado


# ---------------------------------------------------------------------
# API pública del módulo
# ---------------------------------------------------------------------

def obtener_matriz(esquema, tabla):
    """
    Devuelve todo lo que la pantalla necesita para dibujar la matriz:
    roles, operaciones, qué procedimientos existen y quién puede
    ejecutar qué en este momento (has_function_privilege).
    """
    conexion = obtener_conexion()
    if conexion is None:
        return SIN_CONEXION

    try:
        cursor = conexion.cursor()
        roles = _roles(cursor)
        operaciones = _operaciones(cursor)
        procs = _procedimientos(cursor, esquema, tabla, operaciones)

        # Privilegio actual de cada rol sobre cada procedimiento existente.
        for rol in roles:
            rol['permisos'] = {}
            for codigo, proc in procs.items():
                cursor.execute(
                    'SELECT pg_catalog.has_function_privilege(%s, %s, %s);',
                    (rol['oid'], proc['oid'], 'EXECUTE')
                )
                rol['permisos'][codigo] = cursor.fetchone()[0]

        # ¿Algún procedimiento todavía lo puede ejecutar cualquiera (PUBLIC)?
        publicos = []
        for codigo, proc in procs.items():
            cursor.execute("""
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_proc p,
                         LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                    WHERE p.oid = %s AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
                );
            """, (proc['oid'],))
            if cursor.fetchone()[0]:
                publicos.append(codigo)

        cursor.close()
        conexion.rollback()   # solo lectura: no dejar la transacción abierta

        for rol in roles:
            del rol['oid']
        for proc in procs.values():
            del proc['oid']

        return {
            'exito': True,
            'roles': roles,
            'operaciones': operaciones,
            'procedimientos': procs,
            'ejecutables_por_public': publicos,
        }

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al consultar privilegios: {_mensaje_error(e)}'}


def aplicar_matriz(esquema, tabla, matriz):
    """
    Aplica la matriz de privilegios.

    matriz = { "vendedor": ["insertar", "consultar"], "supervisor": [...], ... }

    Para cada procedimiento generado de la tabla:
      1. REVOKE EXECUTE ... FROM PUBLIC  (por defecto PostgreSQL deja
         que cualquiera ejecute una función o procedimiento nuevo).
      2. GRANT EXECUTE al rol si la casilla está marcada, REVOKE si no.

    Los roles que no vienen en la matriz no se tocan. Los superusuarios
    se ignoran: PostgreSQL nunca les niega nada, así que darles o
    quitarles permisos no tendría efecto.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return SIN_CONEXION

    if not isinstance(matriz, dict) or not matriz:
        return {'exito': False, 'mensaje': 'No se recibió ninguna asignación de privilegios.'}

    try:
        cursor = conexion.cursor()

        roles_existentes = {r['nombre']: r for r in _roles(cursor)}
        operaciones = _operaciones(cursor)
        codigos_validos = {op['codigo'] for op in operaciones}
        procs = _procedimientos(cursor, esquema, tabla, operaciones)

        if not procs:
            return {
                'exito': False,
                'mensaje': f'La tabla {esquema}.{tabla} no tiene procedimientos generados todavía.'
            }

        # Validar todo antes de ejecutar nada.
        for rol, ops in matriz.items():
            if rol not in roles_existentes:
                return {'exito': False, 'mensaje': f'El rol "{rol}" no existe.'}
            if not isinstance(ops, list) or any(op not in codigos_validos for op in ops):
                return {'exito': False, 'mensaje': f'Operaciones inválidas para el rol "{rol}".'}

        sentencias = []

        def ejecutar(consulta):
            cursor.execute(consulta)
            sentencias.append(consulta.as_string(conexion) + ';')

        for codigo, proc in procs.items():
            rutina = sql.SQL(proc['firma'])   # escrito por PostgreSQL (regprocedure)

            ejecutar(sql.SQL('REVOKE EXECUTE ON ROUTINE {} FROM PUBLIC').format(rutina))

            for rol, ops in matriz.items():
                if roles_existentes[rol]['superusuario']:
                    continue
                plantilla = (
                    'GRANT EXECUTE ON ROUTINE {} TO {}' if codigo in ops
                    else 'REVOKE EXECUTE ON ROUTINE {} FROM {}'
                )
                ejecutar(sql.SQL(plantilla).format(rutina, sql.Identifier(rol)))

        conexion.commit()
        cursor.close()

        return {
            'exito': True,
            'mensaje': f'Privilegios aplicados ({len(sentencias)} sentencias).',
            'sentencias': sentencias,
        }

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al aplicar privilegios: {_mensaje_error(e)}'}


def probar_matriz(esquema, tabla):
    """
    Comprueba los privilegios EJECUTANDO de verdad cada procedimiento
    como cada rol (SET LOCAL ROLE), y luego deshace todo con ROLLBACK,
    así la prueba nunca deja datos en la tabla.

    Se llama con todos los parámetros en NULL. Eso basta para saber si
    PostgreSQL deja entrar: el chequeo de EXECUTE ocurre antes de correr
    el cuerpo. Posibles resultados por casilla:
      permitido     -> se ejecutó (o falló por los datos NULL, lo cual
                       ya prueba que el permiso pasó).
      denegado      -> "permission denied for function/procedure".
      sin_tabla     -> tenía EXECUTE, pero el procedimiento es SECURITY
                       INVOKER y el rol no tiene permiso sobre la tabla.
    """
    conexion = obtener_conexion()
    if conexion is None:
        return SIN_CONEXION

    try:
        cursor = conexion.cursor()
        roles = [r for r in _roles(cursor) if not r['superusuario']]
        operaciones = _operaciones(cursor)
        procs = _procedimientos(cursor, esquema, tabla, operaciones)
        conexion.rollback()

        resultados = {}
        for rol in roles:
            resultados[rol['nombre']] = {}
            for codigo, proc in procs.items():
                resultados[rol['nombre']][codigo] = _probar_una(conexion, esquema, rol['nombre'], proc)

        return {'exito': True, 'resultados': resultados}

    except Exception as e:
        conexion.rollback()
        return {'exito': False, 'mensaje': f'Error al probar privilegios: {_mensaje_error(e)}'}


def _probar_una(conexion, esquema, rol, proc):
    nulos = sql.SQL(', ').join(
        sql.SQL('NULL::{}').format(sql.SQL(t)) for t in proc['tipos_parametros']
    )
    rutina = sql.Identifier(esquema, proc['nombre'])

    if proc['clase'] == 'procedimiento':
        llamada = sql.SQL('CALL {}({})').format(rutina, nulos)
    else:
        llamada = sql.SQL('SELECT 1 FROM {}({}) LIMIT 1').format(rutina, nulos)

    cursor = conexion.cursor()
    try:
        cursor.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(rol)))
        cursor.execute(llamada)
        return {'estado': 'permitido', 'detalle': 'Se ejecutó correctamente.'}

    except psycopg2.Error as e:
        mensaje = _mensaje_error(e)
        if e.pgcode == '42501':   # insufficient_privilege
            # ¿Lo frenó el EXECUTE o algo de adentro (la tabla)? Se
            # pregunta al catálogo en vez de leer el texto del error,
            # que cambia según el idioma del servidor.
            conexion.rollback()
            cursor.execute(
                'SELECT pg_catalog.has_function_privilege(%s, %s, %s);',
                (rol, proc['oid'], 'EXECUTE')
            )
            if not cursor.fetchone()[0]:
                return {'estado': 'denegado', 'detalle': mensaje}
            return {
                'estado': 'sin_tabla',
                'detalle': f'Tiene EXECUTE, pero el procedimiento es SECURITY INVOKER '
                           f'y el rol no tiene permiso sobre la tabla ({mensaje}).'
            }
        # Cualquier otro error (NOT NULL, etc.) ocurre DENTRO del cuerpo:
        # el permiso de ejecución ya fue concedido.
        return {
            'estado': 'permitido',
            'detalle': f'Tuvo acceso; falló por los datos de prueba en NULL ({mensaje}).'
        }

    finally:
        cursor.close()
        conexion.rollback()
