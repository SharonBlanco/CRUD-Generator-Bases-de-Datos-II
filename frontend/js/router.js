/**
 * Router mínimo basado en hash (#vista).
 * Cada vista es un objeto { html, montar(contenedor) }.
 */
const rutas = {};
let rutaPorDefecto = null;

export function registrarRuta(nombre, vista, { porDefecto = false } = {}) {
    rutas[nombre] = vista;
    if (porDefecto) rutaPorDefecto = nombre;
}

export function navegar(nombre) {
    window.location.hash = nombre;
}

function render() {
    const nombre = window.location.hash.replace('#', '') || rutaPorDefecto;
    const vista = rutas[nombre];
    const app = document.getElementById('app');

    if (!vista) {
        app.innerHTML = `<p>Vista "${nombre}" no encontrada.</p>`;
        return;
    }

    app.innerHTML = vista.html;
    if (vista.montar) vista.montar(app);
}

export function iniciarRouter() {
    window.addEventListener('hashchange', render);
    render();
}
