/**
 * Estado global de la app (compartido entre vistas).
 * Vive solo en memoria mientras la SPA está cargada.
 */
const estado = {
    conectado: false,
    datosConexion: null
};

export function setConexion(datos) {
    estado.conectado = true;
    estado.datosConexion = datos;
}

export function limpiarConexion() {
    estado.conectado = false;
    estado.datosConexion = null;
}

export function obtenerEstado() {
    return estado;
}
