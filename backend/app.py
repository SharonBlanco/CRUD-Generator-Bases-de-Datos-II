import os

from flask import Flask, request, jsonify
from flask_cors import CORS
from db import conectar, esta_conectado
from extension import verificar_extension, instalar_extension, actualizar_extension
from esquemas import listar_esquemas, listar_tablas, analizar_tabla
from generador import (
    listar_operaciones,
    generar_codigo,
    crear_procedimiento,
    listar_procedimientos,
)

# El backend sirve también el frontend, para levantar todo con un solo
# comando y desde un solo puerto.
CARPETA_FRONTEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')

app = Flask(__name__, static_folder=CARPETA_FRONTEND, static_url_path='')
CORS(app)


@app.route('/')
def ruta_inicio():
    return app.send_static_file('index.html')


@app.route('/api/conectar', methods=['POST'])
def ruta_conectar():
    datos = request.get_json()

    campos = ['servidor', 'puerto', 'base_datos', 'usuario', 'contrasena']
    for campo in campos:
        if not datos.get(campo):
            return jsonify({
                'exito': False,
                'mensaje': f'El campo "{campo}" es obligatorio.'
            }), 400

    resultado = conectar(
        datos['servidor'],
        datos['puerto'],
        datos['base_datos'],
        datos['usuario'],
        datos['contrasena']
    )

    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/estado', methods=['GET'])
def ruta_estado():
    return jsonify({'conectado': esta_conectado()})


@app.route('/api/extension', methods=['GET'])
def ruta_verificar_extension():
    resultado = verificar_extension()
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/extension/instalar', methods=['POST'])
def ruta_instalar_extension():
    resultado = instalar_extension()
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/extension/actualizar', methods=['POST'])
def ruta_actualizar_extension():
    resultado = actualizar_extension()
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/esquemas', methods=['GET'])
def ruta_listar_esquemas():
    resultado = listar_esquemas()
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/esquemas/<esquema>/tablas', methods=['GET'])
def ruta_listar_tablas(esquema):
    resultado = listar_tablas(esquema)
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/esquemas/<esquema>/tablas/<tabla>', methods=['GET'])
def ruta_analizar_tabla(esquema, tabla):
    resultado = analizar_tabla(esquema, tabla)
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/generador/operaciones', methods=['GET'])
def ruta_listar_operaciones():
    resultado = listar_operaciones()
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/generador/codigo', methods=['POST'])
def ruta_generar_codigo():
    datos = request.get_json()
    resultado = generar_codigo(
        datos.get('esquema'),
        datos.get('tabla'),
        datos.get('operacion')
    )
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/generador/crear', methods=['POST'])
def ruta_crear_procedimiento():
    datos = request.get_json()
    resultado = crear_procedimiento(
        datos.get('esquema'),
        datos.get('tabla'),
        datos.get('operacion')
    )
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


@app.route('/api/generador/<esquema>/<tabla>/procedimientos', methods=['GET'])
def ruta_listar_procedimientos(esquema, tabla):
    resultado = listar_procedimientos(esquema, tabla)
    status = 200 if resultado['exito'] else 500
    return jsonify(resultado), status


if __name__ == '__main__':
    app.run(debug=True, port=5000)
