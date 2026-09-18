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

/**
 * Lista los esquemas disponibles en la BD conectada.
 */
export async function apiListarEsquemas() {
    const respuesta = await fetch(`${API_URL}/esquemas`);
    return await respuesta.json();
}

/**
 * Lista las tablas de un esquema.
 */
export async function apiListarTablas(esquema) {
    const respuesta = await fetch(`${API_URL}/esquemas/${encodeURIComponent(esquema)}/tablas`);
    return await respuesta.json();
}

/**
 * Analiza la estructura de una tabla (columnas, tipos, llave primaria).
 */
export async function apiAnalizarTabla(esquema, tabla) {
    const respuesta = await fetch(
        `${API_URL}/esquemas/${encodeURIComponent(esquema)}/tablas/${encodeURIComponent(tabla)}`
    );
    return await respuesta.json();
}

/**
 * Operaciones CRUD que la extensión sabe generar.
 */
export async function apiListarOperaciones() {
    const respuesta = await fetch(`${API_URL}/generador/operaciones`);
    return await respuesta.json();
}

/**
 * Vista previa del código generado, sin ejecutarlo.
 */
export async function apiGenerarCodigo(esquema, tabla, operacion) {
    const respuesta = await fetch(`${API_URL}/generador/codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esquema, tabla, operacion })
    });
    return await respuesta.json();
}

/**
 * Crea el procedimiento generado en la base de datos.
 */
export async function apiCrearProcedimiento(esquema, tabla, operacion) {
    const respuesta = await fetch(`${API_URL}/generador/crear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esquema, tabla, operacion })
    });
    return await respuesta.json();
}

/**
 * Lista los procedimientos ya generados para una tabla.
 */
export async function apiListarProcedimientos(esquema, tabla) {
    const respuesta = await fetch(
        `${API_URL}/generador/${encodeURIComponent(esquema)}/${encodeURIComponent(tabla)}/procedimientos`
    );
    return await respuesta.json();
}
