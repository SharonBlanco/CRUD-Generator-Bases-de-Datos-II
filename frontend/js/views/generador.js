import {
    apiListarOperaciones,
    apiGenerarCodigo,
    apiCrearLote,
    apiListarProcedimientos
} from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado } from '../state.js';

/**
 * Generación de procedimientos: varias tablas x varias operaciones.
 * Las operaciones disponibles las dice la extensión (crud_operaciones()).
 */
const html = `
<div class="contenedor contenedor-ancho contenedor-matriz">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Generar procedimientos</h1>
    <p class="subtitulo" id="subtitulo"></p>

    <div class="resultado" id="resultado"></div>

    <div class="fila-encabezado">
        <label>Operaciones a generar</label>
    </div>
    <div id="listaOperaciones" class="lista-horizontal"></div>

    <button class="btn-conectar" id="btnGenerar" style="margin-top: 16px">Generar procedimientos</button>

    <div id="bloqueResultados" hidden>
        <div class="fila-encabezado">
            <label>Resultado de la generación</label>
        </div>
        <div id="resultados"></div>
    </div>

    <div class="fila-encabezado">
        <label>Procedimientos existentes de estas tablas</label>
        <button class="btn-recargar" id="btnRecargar">⟳ Recargar</button>
    </div>
    <div id="listaProcedimientos"></div>

    <details class="vista-previa">
        <summary>Ver el código que genera la extensión (sin ejecutarlo)</summary>
        <div class="fila-acciones">
            <select id="selTabla" class="selector"></select>
            <select id="selOperacion" class="selector"></select>
            <button class="btn-recargar" id="btnVerCodigo">Ver código</button>
        </div>
        <pre class="codigo" id="codigo" hidden></pre>
    </details>

    <button class="btn-conectar" id="btnPrivilegios" style="margin-top: 20px">Asignar privilegios →</button>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a la estructura</button>
    </div>
</div>
`;

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

function montar(contenedor) {
    const { esquema, tablas } = obtenerEstado();

    if (!esquema || tablas.length === 0) {
        navegar(esquema ? 'tablas' : 'esquemas');
        return;
    }

    const resultado = crearResultado(contenedor);
    const listaOperaciones = contenedor.querySelector('#listaOperaciones');
    const btnGenerar = contenedor.querySelector('#btnGenerar');
    const bloqueResultados = contenedor.querySelector('#bloqueResultados');
    const divResultados = contenedor.querySelector('#resultados');
    const listaProcedimientos = contenedor.querySelector('#listaProcedimientos');
    const btnRecargar = contenedor.querySelector('#btnRecargar');
    const selTabla = contenedor.querySelector('#selTabla');
    const selOperacion = contenedor.querySelector('#selOperacion');
    const codigo = contenedor.querySelector('#codigo');

    let operaciones = [];

    contenedor.querySelector('#subtitulo').textContent =
        `${esquema} — ${tablas.join(', ')}`;

    selTabla.innerHTML = tablas
        .map((t) => `<option value="${escapar(t)}">${escapar(t)}</option>`).join('');

    function errorDeRed() {
        resultado.mostrar(
            '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
            false
        );
    }

    function operacionesMarcadas() {
        return [...listaOperaciones.querySelectorAll('input:checked')].map((c) => c.value);
    }

    async function cargarOperaciones() {
        try {
            const json = await apiListarOperaciones();
            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }
            operaciones = json.operaciones;

            listaOperaciones.innerHTML = operaciones.map((op) => `
                <label class="lista-item lista-item-casilla activo">
                    <input type="checkbox" class="casilla" value="${escapar(op.codigo)}" checked>
                    <span>${escapar(op.etiqueta)}</span>
                </label>`).join('');

            listaOperaciones.querySelectorAll('input').forEach((c) => {
                c.addEventListener('change', () => {
                    c.closest('label').classList.toggle('activo', c.checked);
                    btnGenerar.disabled = operacionesMarcadas().length === 0;
                });
            });

            selOperacion.innerHTML = operaciones
                .map((op) => `<option value="${escapar(op.codigo)}">${escapar(op.etiqueta)}</option>`)
                .join('');
        } catch {
            errorDeRed();
        }
    }

    function dibujarResultados(json) {
        const usadas = operaciones.filter((op) => json.resultados.some((r) => r.operacion === op.codigo));
        const porClave = {};
        json.resultados.forEach((r) => { porClave[`${r.tabla}|${r.operacion}`] = r; });

        const filas = tablas.map((t) => {
            const celdas = usadas.map((op) => {
                const r = porClave[`${t}|${op.codigo}`];
                return r.exito
                    ? '<td class="celda-centro"><span class="estado estado-ok">✓ creado</span></td>'
                    : `<td class="celda-centro"><span class="estado estado-no" title="${escapar(r.mensaje)}">✗ error</span></td>`;
            }).join('');
            return `<tr><td class="celda-nombre">${escapar(t)}</td>${celdas}</tr>`;
        }).join('');

        const errores = json.resultados.filter((r) => !r.exito).map((r) =>
            `<li><b>${escapar(r.tabla)} / ${escapar(r.operacion)}:</b> ${escapar(r.mensaje)}</li>`
        ).join('');

        divResultados.innerHTML = `
            <div class="scroll-horizontal">
                <table class="tabla-columnas">
                    <thead><tr><th>Tabla</th>${usadas.map((o) => `<th class="celda-centro">${escapar(o.etiqueta)}</th>`).join('')}</tr></thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>
            ${errores ? `<ul class="lista-errores">${errores}</ul>` : ''}`;
        bloqueResultados.hidden = false;
    }

    async function cargarProcedimientos() {
        try {
            const respuestas = await Promise.all(tablas.map((t) => apiListarProcedimientos(esquema, t)));
            const filas = [];
            respuestas.forEach((json, i) => {
                if (!json.exito) return;
                json.procedimientos.forEach((p) => {
                    filas.push(`
                        <tr>
                            <td>${escapar(tablas[i])}</td>
                            <td class="celda-nombre">${escapar(p.nombre)}</td>
                            <td class="celda-tipo">${escapar(p.clase)}</td>
                            <td><code>(${escapar(p.argumentos)})</code></td>
                        </tr>`);
                });
            });

            listaProcedimientos.innerHTML = filas.length === 0
                ? '<p class="vacio">Todavía no hay procedimientos generados para estas tablas.</p>'
                : `<div class="scroll-horizontal">
                       <table class="tabla-columnas">
                           <thead><tr><th>Tabla</th><th>Nombre</th><th>Tipo</th><th>Parámetros</th></tr></thead>
                           <tbody>${filas.join('')}</tbody>
                       </table>
                   </div>`;
        } catch {
            errorDeRed();
        }
    }

    btnGenerar.addEventListener('click', async () => {
        const ops = operacionesMarcadas();
        if (ops.length === 0) return;

        btnGenerar.disabled = true;
        btnGenerar.textContent = 'Generando...';
        try {
            const json = await apiCrearLote(esquema, tablas, ops);
            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }
            const todoBien = json.resultados.every((r) => r.exito);
            resultado.mostrar(`${todoBien ? '✓' : '⚠'} ${json.mensaje}`, todoBien);
            dibujarResultados(json);
            await cargarProcedimientos();
        } catch {
            errorDeRed();
        } finally {
            btnGenerar.disabled = false;
            btnGenerar.textContent = 'Generar procedimientos';
        }
    });

    contenedor.querySelector('#btnVerCodigo').addEventListener('click', async () => {
        try {
            const json = await apiGenerarCodigo(esquema, selTabla.value, selOperacion.value);
            codigo.hidden = false;
            codigo.textContent = json.exito ? json.codigo : `-- ✗ ${json.mensaje}`;
        } catch {
            errorDeRed();
        }
    });

    btnRecargar.addEventListener('click', async () => {
        btnRecargar.disabled = true;
        btnRecargar.textContent = 'Recargando...';
        try {
            await cargarProcedimientos();
        } finally {
            btnRecargar.disabled = false;
            btnRecargar.textContent = '⟳ Recargar';
        }
    });

    contenedor.querySelector('#btnCambiarConexion').addEventListener('click', () => {
        navegar('conexion');
    });

    contenedor.querySelector('#btnVolver').addEventListener('click', () => {
        navegar('tabla');
    });

    contenedor.querySelector('#btnPrivilegios').addEventListener('click', () => {
        navegar('privilegios');
    });

    cargarOperaciones();
    cargarProcedimientos();
}

export default { html, montar };
