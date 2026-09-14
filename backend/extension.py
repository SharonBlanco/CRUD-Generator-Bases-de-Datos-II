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
    """Aplica el parche de versión más reciente (ALTER EXTENSION ... UPDATE)."""
    conexion = obtener_conexion()
    if conexion is None:
        return {'exito': False, 'mensaje': 'No hay una conexión activa a la base de datos.'}

    try:
        cursor = conexion.cursor()
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
