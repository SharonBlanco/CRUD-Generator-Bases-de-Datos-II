import {
    apiObtenerPrivilegios,
    apiAplicarPrivilegios,
    apiProbarPrivilegios
} from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado } from '../state.js';

/**
 * Pantalla de privilegios: matriz rol x operación para los
 * procedimientos generados de la tabla seleccionada.
 *
 *   Aplicar  -> GRANT / REVOKE EXECUTE (lo hace el backend).
 *   Probar   -> ejecuta cada procedimiento como cada rol y muestra
 *               si PostgreSQL lo dejó o no (todo con ROLLBACK).
 */
const html = `
<div class="contenedor contenedor-ancho contenedor-matriz">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Privilegios</h1>
    <p class="subtitulo" id="subtitulo"></p>

    <div class="resultado" id="resultado"></div>
    <div id="avisos"></div>

    <div class="fila-encabezado">
        <label>¿Qué puede ejecutar cada rol?</label>
        <button class="btn-recargar" id="btnRecargar">⟳ Recargar</button>
    </div>
    <div id="matriz"></div>

    <div class="fila-acciones">
        <button class="btn-conectar" id="btnAplicar">Aplicar privilegios</button>
        <button class="btn-recargar" id="btnProbar">Probar con cada rol</button>
    </div>

    <div id="bloqueSentencias" hidden>
        <div class="fila-encabezado">
            <label>Sentencias ejecutadas</label>
        </div>
        <pre class="codigo" id="sentencias"></pre>
    </div>

    <div id="bloquePrueba" hidden>
        <div class="fila-encabezado">
            <label>Resultado de la prueba (ejecución real, sin guardar cambios)</label>
        </div>
        <div id="prueba"></div>
    </div>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a generar procedimientos</button>
    </div>
</div>
`;

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto);
    return div.innerHTML;
}

function montar(contenedor) {
    const { esquema, tabla } = obtenerEstado();

    if (!esquema || !tabla) {
        navegar(esquema ? 'tablas' : 'esquemas');
        return;
    }

    const resultado = crearResultado(contenedor);
    const avisos = contenedor.querySelector('#avisos');
    const matriz = contenedor.querySelector('#matriz');
    const btnAplicar = contenedor.querySelector('#btnAplicar');
    const btnProbar = contenedor.querySelector('#btnProbar');
    const btnRecargar = contenedor.querySelector('#btnRecargar');
    const bloqueSentencias = contenedor.querySelector('#bloqueSentencias');
    const sentencias = contenedor.querySelector('#sentencias');
    const bloquePrueba = contenedor.querySelector('#bloquePrueba');
    const prueba = contenedor.querySelector('#prueba');

    let datos = null;   // última respuesta de /api/privilegios

    contenedor.querySelector('#subtitulo').textContent = `${esquema}.${tabla}`;

    function errorDeRed() {
        resultado.mostrar(
            '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
            false
        );
    }

    function dibujarAvisos() {
        const lista = [];
        const procs = Object.values(datos.procedimientos);

        if (procs.some((p) => p.security === 'INVOKER')) {
            lista.push(
                'Los procedimientos de esta tabla son <b>SECURITY INVOKER</b>: corren con los ' +
                'permisos de quien los llama. Un rol con EXECUTE igual va a fallar si no tiene ' +
                'permiso directo sobre la tabla. Con <b>SECURITY DEFINER</b>, el EXECUTE basta.'
            );
        }
        if (datos.ejecutables_por_public.length > 0) {
            const nombres = datos.ejecutables_por_public
                .map((c) => escapar(datos.procedimientos[c].nombre)).join(', ');
            lista.push(
                `Hoy <b>cualquier usuario</b> (PUBLIC) puede ejecutar: ${nombres}. ` +
                'Es el comportamiento por defecto de PostgreSQL; al aplicar se revoca.'
            );
        }

        avisos.innerHTML = lista.map((t) => `<div class="aviso">${t}</div>`).join('');
    }

    function dibujarMatriz() {
        const { roles, operaciones, procedimientos } = datos;

        if (Object.keys(procedimientos).length === 0) {
            matriz.innerHTML =
                '<p class="vacio">Esta tabla todavía no tiene procedimientos generados. ' +
                'Generalos primero en la pantalla anterior.</p>';
            btnAplicar.disabled = true;
            btnProbar.disabled = true;
            return;
        }
        btnAplicar.disabled = false;
        btnProbar.disabled = false;

        const encabezados = operaciones.map((op) => {
            const proc = procedimientos[op.codigo];
            const sub = proc
                ? `<div class="celda-sub">${escapar(proc.nombre)}</div>`
                : '<div class="celda-sub">no generado</div>';
            return `<th class="celda-centro">${escapar(op.etiqueta)}${sub}</th>`;
        }).join('');

        const filas = roles.map((rol) => {
            const insignias = [
                rol.superusuario ? '<span class="insignia insignia-pk">superusuario</span>' : '',
                rol.puede_login ? '' : '<span class="insignia">sin login</span>'
            ].join('');

            const celdas = operaciones.map((op) => {
                if (!procedimientos[op.codigo]) {
                    return '<td class="celda-centro celda-sub">—</td>';
                }
                const marcado = rol.permisos[op.codigo] ? 'checked' : '';
                const bloqueado = rol.superusuario
                    ? 'disabled title="Un superusuario siempre puede ejecutar todo"'
                    : '';
                return `
                    <td class="celda-centro">
                        <input type="checkbox" class="casilla"
                               data-rol="${escapar(rol.nombre)}"
                               data-op="${escapar(op.codigo)}" ${marcado} ${bloqueado}>
                    </td>`;
            }).join('');

            return `
                <tr>
                    <td class="celda-nombre">${escapar(rol.nombre)} ${insignias}</td>
                    ${celdas}
                </tr>`;
        }).join('');

        matriz.innerHTML = `
            <div class="scroll-horizontal">
                <table class="tabla-columnas">
                    <thead><tr><th>Usuario / Rol</th>${encabezados}</tr></thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>`;
    }

    async function cargar() {
        resultado.mostrar('Cargando roles y privilegios...', true);
        try {
            const json = await apiObtenerPrivilegios(esquema, tabla);
            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }
            resultado.ocultar();
            datos = json;
            dibujarAvisos();
            dibujarMatriz();
        } catch {
            errorDeRed();
        }
    }

    function leerMatriz() {
        // { rol: [operaciones marcadas] } solo para roles que no son superusuario.
        const resultadoMatriz = {};
        datos.roles
            .filter((r) => !r.superusuario)
            .forEach((r) => { resultadoMatriz[r.nombre] = []; });

        matriz.querySelectorAll('.casilla:not(:disabled)').forEach((casilla) => {
            if (casilla.checked) {
                resultadoMatriz[casilla.dataset.rol].push(casilla.dataset.op);
            }
        });
        return resultadoMatriz;
    }

    btnAplicar.addEventListener('click', async () => {
        btnAplicar.disabled = true;
        btnAplicar.textContent = 'Aplicando...';
        bloquePrueba.hidden = true;
        try {
            const json = await apiAplicarPrivilegios(esquema, tabla, leerMatriz());
            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }
            resultado.mostrar(`✓ ${json.mensaje}`, true);
            sentencias.textContent = json.sentencias.join('\n');
            bloqueSentencias.hidden = false;

            // Volver a leer del catálogo para mostrar el estado REAL.
            const recargado = await apiObtenerPrivilegios(esquema, tabla);
            if (recargado.exito) {
                datos = recargado;
                dibujarAvisos();
                dibujarMatriz();
            }
        } catch {
            errorDeRed();
        } finally {
            btnAplicar.disabled = false;
            btnAplicar.textContent = 'Aplicar privilegios';
        }
    });

    btnProbar.addEventListener('click', async () => {
        btnProbar.disabled = true;
        btnProbar.textContent = 'Probando...';
        try {
            const json = await apiProbarPrivilegios(esquema, tabla);
            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }
            dibujarPrueba(json.resultados);
        } catch {
            errorDeRed();
        } finally {
            btnProbar.disabled = false;
            btnProbar.textContent = 'Probar con cada rol';
        }
    });

    function dibujarPrueba(resultados) {
        const ops = datos.operaciones.filter((op) => datos.procedimientos[op.codigo]);
        const simbolos = {
            permitido: '<span class="estado estado-ok">✓ permitido</span>',
            denegado: '<span class="estado estado-no">✗ denegado</span>',
            sin_tabla: '<span class="estado estado-medio">⚠ sin permiso en la tabla</span>'
        };

        const filas = Object.entries(resultados).map(([rol, porOp]) => {
            const celdas = ops.map((op) => {
                const r = porOp[op.codigo];
                return `<td class="celda-centro" title="${escapar(r.detalle)}">${simbolos[r.estado]}</td>`;
            }).join('');
            return `<tr><td class="celda-nombre">${escapar(rol)}</td>${celdas}</tr>`;
        }).join('');

        prueba.innerHTML = `
            <div class="scroll-horizontal">
                <table class="tabla-columnas">
                    <thead><tr><th>Rol</th>${ops.map((o) => `<th class="celda-centro">${escapar(o.etiqueta)}</th>`).join('')}</tr></thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>
            <p class="nota">Pasá el mouse sobre cada resultado para ver el mensaje de PostgreSQL.
            Los superusuarios no se prueban porque PostgreSQL nunca les niega nada.</p>`;
        bloquePrueba.hidden = false;
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
        navegar('generador');
    });

    cargar();
}

export default { html, montar };
