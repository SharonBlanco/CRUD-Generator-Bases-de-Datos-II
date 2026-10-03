import { apiAnalizarTabla } from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado } from '../state.js';

/**
 * Estructura de las tablas seleccionadas. El análisis lo hace la
 * extensión (crud_analizar_tabla): es lo mismo que usan los generadores.
 */
const html = `
<div class="contenedor contenedor-ancho">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Estructura</h1>
    <p class="subtitulo" id="subtitulo"></p>

    <div class="resultado" id="resultado"></div>

    <div class="fila-encabezado">
        <label>Columnas de cada tabla</label>
        <button class="btn-recargar" id="btnRecargar">⟳ Recargar</button>
    </div>

    <div id="detalle"></div>

    <button class="btn-conectar" id="btnGenerar" style="margin-top: 20px">
        Generar procedimientos CRUD →
    </button>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a tablas</button>
    </div>
</div>
`;

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

function etiquetas(col) {
    const insignias = [];
    if (col.es_llave_primaria) insignias.push('<span class="insignia insignia-pk">🔑 PK</span>');
    if (col.autogenerada) insignias.push('<span class="insignia">autogenerada</span>');
    else if (col.valor_defecto) {
        insignias.push(`<span class="insignia" title="DEFAULT ${escapar(col.valor_defecto)}">default</span>`);
    }
    insignias.push(
        col.permite_nulos
            ? '<span class="insignia">acepta nulos</span>'
            : '<span class="insignia insignia-requerida">obligatoria</span>'
    );
    return insignias.join(' ');
}

function seccionTabla(tabla, json) {
    if (!json.exito) {
        return `
            <h2 class="titulo-seccion">${escapar(tabla)}</h2>
            <div class="resultado error" style="display:block">✗ ${escapar(json.mensaje)}</div>`;
    }

    const pk = json.columnas.filter((c) => c.es_llave_primaria).map((c) => c.nombre);
    const resumenPk = pk.length === 0
        ? '<span class="insignia insignia-requerida">sin clave primaria</span>'
        : `<span class="insignia insignia-pk">PK ${pk.length > 1 ? 'compuesta' : 'simple'}: ${escapar(pk.join(', '))}</span>`;

    const aviso = pk.length === 0
        ? `<div class="aviso">Esta tabla no tiene clave primaria: se podrán generar
           <b>insertar</b> y <b>consultar</b>, pero no <b>actualizar</b> ni <b>eliminar</b>
           (no hay forma segura de identificar un solo registro).</div>`
        : '';

    const filas = json.columnas.map((col) => `
        <tr>
            <td class="celda-nombre">${escapar(col.nombre)}</td>
            <td class="celda-tipo">${escapar(col.tipo)}</td>
            <td>${etiquetas(col)}</td>
        </tr>`).join('');

    return `
        <h2 class="titulo-seccion">${escapar(tabla)} ${resumenPk}</h2>
        ${aviso}
        <div class="scroll-horizontal">
            <table class="tabla-columnas">
                <thead><tr><th>Columna</th><th>Tipo</th><th>Atributos</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>
        </div>`;
}

function montar(contenedor) {
    const { esquema, tablas } = obtenerEstado();

    // Si se entra directo a #tabla sin haber elegido tablas, se regresa al paso previo.
    if (!esquema || tablas.length === 0) {
        navegar(esquema ? 'tablas' : 'esquemas');
        return;
    }

    const resultado = crearResultado(contenedor);
    const detalle = contenedor.querySelector('#detalle');
    const btnRecargar = contenedor.querySelector('#btnRecargar');

    contenedor.querySelector('#subtitulo').textContent =
        `${esquema} — ${tablas.length} ${tablas.length === 1 ? 'tabla' : 'tablas'}`;

    async function cargar() {
        resultado.mostrar('Analizando estructura...', true);

        try {
            const respuestas = await Promise.all(tablas.map((t) => apiAnalizarTabla(esquema, t)));
            resultado.ocultar();
            detalle.innerHTML = tablas.map((t, i) => seccionTabla(t, respuestas[i])).join('');
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
