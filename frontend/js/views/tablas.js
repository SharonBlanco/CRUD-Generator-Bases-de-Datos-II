import { apiListarTablas } from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado, setTablas } from '../state.js';

/**
 * Selección de tablas: una, varias o todas (casillas + "Seleccionar todas").
 */
const html = `
<div class="contenedor">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Tablas</h1>
    <p class="subtitulo" id="subtitulo"></p>

    <div class="resultado" id="resultado"></div>

    <div class="fila-encabezado">
        <label class="casilla-etiqueta">
            <input type="checkbox" class="casilla" id="chkTodas"> Seleccionar todas
        </label>
        <button class="btn-recargar" id="btnRecargar">⟳ Recargar</button>
    </div>

    <div id="lista" class="lista"></div>

    <button class="btn-conectar" id="btnContinuar" style="margin-top: 16px" disabled>
        Analizar estructura →
    </button>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a esquemas</button>
    </div>
</div>
`;

function montar(contenedor) {
    const { esquema, tablas: seleccionPrevia } = obtenerEstado();

    // Si se entra directo a #tablas sin haber elegido esquema (por ejemplo al
    // recargar la página), se regresa al paso anterior.
    if (!esquema) {
        navegar('esquemas');
        return;
    }

    const resultado = crearResultado(contenedor);
    const lista = contenedor.querySelector('#lista');
    const chkTodas = contenedor.querySelector('#chkTodas');
    const btnContinuar = contenedor.querySelector('#btnContinuar');
    const btnRecargar = contenedor.querySelector('#btnRecargar');

    contenedor.querySelector('#subtitulo').textContent =
        `Esquema "${esquema}" — elegí una, varias o todas las tablas`;

    function casillas() {
        return [...lista.querySelectorAll('input.casilla-tabla')];
    }

    function seleccionadas() {
        return casillas().filter((c) => c.checked).map((c) => c.value);
    }

    function actualizarControles() {
        const todas = casillas();
        const marcadas = seleccionadas().length;

        chkTodas.checked = todas.length > 0 && marcadas === todas.length;
        chkTodas.indeterminate = marcadas > 0 && marcadas < todas.length;

        btnContinuar.disabled = marcadas === 0;
        btnContinuar.textContent = marcadas === 0
            ? 'Analizar estructura →'
            : `Analizar estructura (${marcadas} ${marcadas === 1 ? 'tabla' : 'tablas'}) →`;
    }

    async function cargar() {
        resultado.mostrar('Cargando tablas...', true);

        try {
            const json = await apiListarTablas(esquema);

            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }

            resultado.ocultar();
            lista.innerHTML = '';

            if (json.tablas.length === 0) {
                lista.innerHTML = '<p class="vacio">Este esquema no tiene tablas.</p>';
                actualizarControles();
                return;
            }

            json.tablas.forEach((tabla) => {
                const fila = document.createElement('label');
                fila.className = 'lista-item lista-item-casilla';

                const casilla = document.createElement('input');
                casilla.type = 'checkbox';
                casilla.className = 'casilla casilla-tabla';
                casilla.value = tabla;
                casilla.checked = seleccionPrevia.includes(tabla);
                casilla.addEventListener('change', () => {
                    fila.classList.toggle('activo', casilla.checked);
                    actualizarControles();
                });

                const nombre = document.createElement('span');
                nombre.textContent = tabla;

                fila.classList.toggle('activo', casilla.checked);
                fila.append(casilla, nombre);
                lista.appendChild(fila);
            });

            actualizarControles();
        } catch {
            resultado.mostrar(
                '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
                false
            );
        }
    }

    chkTodas.addEventListener('change', () => {
        casillas().forEach((c) => {
            c.checked = chkTodas.checked;
            c.closest('label').classList.toggle('activo', c.checked);
        });
        actualizarControles();
    });

    btnContinuar.addEventListener('click', () => {
        setTablas(seleccionadas());
        navegar('tabla');
    });

    btnRecargar.addEventListener('click', async () => {
        btnRecargar.disabled = true;
        btnRecargar.textContent = 'Recargando...';
        try {
            await cargar();
        } finally {
            btnRecargar.disabled = false;
            btnRecargar.textContent = '⟳ Recargar';
        }
    });

    contenedor.querySelector('#btnCambiarConexion').addEventListener('click', () => {
        navegar('conexion');
    });

    contenedor.querySelector('#btnVolver').addEventListener('click', () => {
        navegar('esquemas');
    });

    cargar();
}

export default { html, montar };
