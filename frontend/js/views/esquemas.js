import { apiListarEsquemas } from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { setEsquema } from '../state.js';

const html = `
<div class="contenedor">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Esquemas</h1>
    <p class="subtitulo">Elige un esquema para ver sus tablas</p>

    <div class="resultado" id="resultado"></div>

    <div class="fila-encabezado">
        <label>Esquemas disponibles</label>
        <button class="btn-recargar" id="btnRecargar">⟳ Recargar</button>
    </div>

    <div id="lista" class="lista"></div>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a la extensión</button>
    </div>
</div>
`;

function montar(contenedor) {
    const resultado = crearResultado(contenedor);
    const lista = contenedor.querySelector('#lista');
    const btnRecargar = contenedor.querySelector('#btnRecargar');

    async function cargar() {
        resultado.mostrar('Cargando esquemas...', true);

        try {
            const json = await apiListarEsquemas();

            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }

            resultado.ocultar();
            lista.innerHTML = '';

            if (json.esquemas.length === 0) {
                lista.innerHTML = '<p class="vacio">No hay esquemas para mostrar.</p>';
                return;
            }

            json.esquemas.forEach((esquema) => {
                const boton = document.createElement('button');
                boton.className = 'lista-item';
                boton.textContent = esquema;
                boton.addEventListener('click', () => {
                    setEsquema(esquema);
                    navegar('tablas');
                });
                lista.appendChild(boton);
            });
        } catch {
            resultado.mostrar(
                '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
                false
            );
        }
    }

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
        navegar('extension');
    });

    cargar();
}

export default { html, montar };
