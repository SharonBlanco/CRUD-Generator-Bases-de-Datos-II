import { apiListarTablas } from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado, setTabla } from '../state.js';

const html = `
<div class="contenedor">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Tablas</h1>
    <p class="subtitulo" id="subtitulo">Elige una tabla para ver su estructura</p>

    <div class="resultado" id="resultado"></div>

    <div class="fila-encabezado">
        <label>Tablas del esquema</label>
        <button class="btn-recargar" id="btnRecargar">⟳ Recargar</button>
    </div>

    <div id="lista" class="lista"></div>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a esquemas</button>
    </div>
</div>
`;

function montar(contenedor) {
    const { esquema } = obtenerEstado();

    // Si se entra directo a #tablas sin haber elegido esquema (por ejemplo al
    // recargar la página), se regresa al paso anterior.
    if (!esquema) {
        navegar('esquemas');
        return;
    }

    const resultado = crearResultado(contenedor);
    const lista = contenedor.querySelector('#lista');
    const btnRecargar = contenedor.querySelector('#btnRecargar');

    contenedor.querySelector('#subtitulo').textContent =
        `Esquema "${esquema}" — elige una tabla para ver su estructura`;

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
                return;
            }

            json.tablas.forEach((tabla) => {
                const boton = document.createElement('button');
                boton.className = 'lista-item';
                boton.textContent = tabla;
                boton.addEventListener('click', () => {
                    setTabla(tabla);
                    navegar('tabla');
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
        navegar('esquemas');
    });

    cargar();
}

export default { html, montar };
