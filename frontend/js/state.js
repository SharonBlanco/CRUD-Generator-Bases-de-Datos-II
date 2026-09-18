/**
 * Estado global de la app (compartido entre vistas).
 * Vive solo en memoria mientras la SPA está cargada.
 */
const estado = {
    conectado: false,
    datosConexion: null,
    esquema: null,
    tabla: null
};

export function setConexion(datos) {
    estado.conectado = true;
    estado.datosConexion = datos;
}

export function limpiarConexion() {
    estado.conectado = false;
    estado.datosConexion = null;
    estado.esquema = null;
    estado.tabla = null;
}

export function setEsquema(esquema) {
    estado.esquema = esquema;
    estado.tabla = null;
}

export function setTabla(tabla) {
    estado.tabla = tabla;
}

export function obtenerEstado() {
    return estado;
}
