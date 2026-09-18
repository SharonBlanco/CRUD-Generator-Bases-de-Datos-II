import { apiAnalizarTabla } from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado } from '../state.js';

const html = `
<div class="contenedor contenedor-ancho">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Estructura de la tabla</h1>
    <p class="subtitulo" id="subtitulo"></p>

    <div class="resultado" id="resultado"></div>

    <div class="fila-encabezado">
        <label>Columnas</label>
        <button class="btn-recargar" id="btnRecargar">⟳ Recargar</button>
    </div>

    <div id="detalle" class="scroll-horizontal"></div>

    <button class="btn-conectar" id="btnGenerar">Generar procedimientos CRUD</button>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a tablas</button>
    </div>
</div>
`;

function etiquetas(col) {
    const insignias = [];
    if (col.es_llave_primaria) insignias.push('<span class="insignia insignia-pk">🔑 PK</span>');
    if (col.autogenerada) insignias.push('<span class="insignia">auto</span>');
    insignias.push(
        col.permite_nulos
            ? '<span class="insignia">acepta nulos</span>'
            : '<span class="insignia insignia-requerida">obligatoria</span>'
    );
    return insignias.join(' ');
}

function montar(contenedor) {
    const { esquema, tabla } = obtenerEstado();

    // Si se entra directo a #tabla sin haber elegido tabla, se regresa al paso previo.
    if (!esquema || !tabla) {
        navegar(esquema ? 'tablas' : 'esquemas');
        return;
    }

    const resultado = crearResultado(contenedor);
    const detalle = contenedor.querySelector('#detalle');
    const btnRecargar = contenedor.querySelector('#btnRecargar');

    contenedor.querySelector('#subtitulo').textContent = `${esquema}.${tabla}`;

    async function cargar() {
        resultado.mostrar('Cargando estructura...', true);

        try {
            const json = await apiAnalizarTabla(esquema, tabla);

            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }

            resultado.ocultar();

            if (json.columnas.length === 0) {
                detalle.innerHTML = '<p class="vacio">Esta tabla no tiene columnas.</p>';
                return;
            }

            const filas = json.columnas.map((col) => `
                <tr>
                    <td class="celda-nombre">${col.nombre}</td>
                    <td class="celda-tipo">${col.tipo}</td>
                    <td>${etiquetas(col)}</td>
                </tr>
            `).join('');

            detalle.innerHTML = `
                <table class="tabla-columnas">
                    <thead>
                        <tr>
                            <th>Columna</th>
                            <th>Tipo</th>
                            <th>Atributos</th>
                        </tr>
                    </thead>
                    <tbody>${filas}</tbody>
                </table>
            `;
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

    contenedor.querySelector('#btnGenerar').addEventListener('click', () => {
        navegar('generador');
    });

    contenedor.querySelector('#btnVolver').addEventListener('click', () => {
        navegar('tablas');
    });

    cargar();
}

export default { html, montar };
