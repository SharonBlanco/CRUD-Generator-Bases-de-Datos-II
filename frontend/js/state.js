/**
 * Estado global de la app (compartido entre vistas).
 * Vive solo en memoria mientras la SPA está cargada.
 */
const estado = {
    conectado: false,
    datosConexion: null,
    esquema: null,
    tablas: []      // tablas seleccionadas del esquema (una, varias o todas)
};

export function setConexion(datos) {
    estado.conectado = true;
    estado.datosConexion = datos;
}

export function limpiarConexion() {
    estado.conectado = false;
    estado.datosConexion = null;
    estado.esquema = null;
    estado.tablas = [];
}

export function setEsquema(esquema) {
    if (estado.esquema !== esquema) {
        estado.tablas = [];
    }
    estado.esquema = esquema;
}

export function setTablas(tablas) {
    estado.tablas = [...tablas];
}

export function obtenerEstado() {
    return estado;
}
