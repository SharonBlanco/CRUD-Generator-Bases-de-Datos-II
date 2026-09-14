const API_URL = 'http://localhost:5000/api';

/**
 * Envía los datos de conexión al backend.
 * Retorna el JSON de respuesta.
 */
export async function apiConectar(datos) {
    const respuesta = await fetch(`${API_URL}/conectar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    });
    return await respuesta.json();
}

/**
 * Consulta si hay una conexión activa.
 */
export async function apiEstado() {
    const respuesta = await fetch(`${API_URL}/estado`);
    return await respuesta.json();
}

/**
 * Verifica si la extensión crud_generator está instalada en la BD conectada.
 */
export async function apiVerificarExtension() {
    const respuesta = await fetch(`${API_URL}/extension`);
    return await respuesta.json();
}

/**
 * Instala (CREATE EXTENSION) crud_generator en la BD conectada.
 */
export async function apiInstalarExtension() {
    const respuesta = await fetch(`${API_URL}/extension/instalar`, { method: 'POST' });
    return await respuesta.json();
}

/**
 * Aplica el parche de versión más reciente (ALTER EXTENSION ... UPDATE).
 */
export async function apiActualizarExtension() {
    const respuesta = await fetch(`${API_URL}/extension/actualizar`, { method: 'POST' });
    return await respuesta.json();
}
