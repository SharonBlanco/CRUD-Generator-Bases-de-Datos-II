/**
 * Componente de banner de resultado (éxito/error).
 * Reutilizable por cualquier vista que tenga un <div class="resultado">.
 */
export function crearResultado(contenedor, selector = '#resultado') {
    const div = contenedor.querySelector(selector);

    return {
        mostrar(mensaje, exito) {
            div.textContent = mensaje;
            div.className = 'resultado ' + (exito ? 'exito' : 'error');
            div.style.display = '';
        },
        ocultar() {
            div.style.display = 'none';
        }
    };
}
