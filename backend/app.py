from flask import Flask, request, jsonify
from flask_cors import CORS
from db import conectar, esta_conectado
from extension import verificar_extension, instalar_extension, actualizar_extension

app = Flask(__name__)
CORS(app)


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


if __name__ == '__main__':
    app.run(debug=True, port=5000)
