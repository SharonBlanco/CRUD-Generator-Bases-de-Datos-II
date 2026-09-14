import psycopg2

# Conexión activa
_conexion = None


def conectar(servidor, puerto, base_datos, usuario, contrasena):
    """Intenta conectar a PostgreSQL. Retorna dict con resultado."""
    global _conexion

    # Cerrar conexión previa si existe
    if _conexion and not _conexion.closed:
        _conexion.close()

    try:
        _conexion = psycopg2.connect(
            host=servidor,
            port=puerto,
            dbname=base_datos,
            user=usuario,
            password=contrasena
        )

        cursor = _conexion.cursor()
        cursor.execute('SELECT version();')
        version = cursor.fetchone()[0]
        cursor.close()

        return {
            'exito': True,
            'mensaje': 'Conexión exitosa.',
            'version': version
        }

    except psycopg2.OperationalError as e:
        return {
            'exito': False,
            'mensaje': f'Error de conexión: {str(e)}'
        }

    except Exception as e:
        return {
            'exito': False,
            'mensaje': f'Error inesperado: {str(e)}'
        }


def obtener_conexion():
    """Retorna la conexión activa o None."""
    if _conexion and not _conexion.closed:
        return _conexion
    return None


def esta_conectado():
    """Verifica si hay una conexión activa."""
    return _conexion is not None and not _conexion.closed
