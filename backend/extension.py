from db import obtener_conexion

NOMBRE_EXTENSION = 'crud_generator'


def verificar_extension():
    """Verifica si la extensión crud_generator está instalada en la BD conectada."""
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
        cursor.execute(
            'SELECT extversion FROM pg_extension WHERE extname = %s;',
            (NOMBRE_EXTENSION,)
        )
        fila = cursor.fetchone()
        cursor.close()

        if fila:
            return {'exito': True, 'instalada': True, 'version': fila[0]}
        return {'exito': True, 'instalada': False}

    except Exception as e:
        return {'exito': False, 'mensaje': f'Error al verificar la extensión: {str(e)}'}


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
