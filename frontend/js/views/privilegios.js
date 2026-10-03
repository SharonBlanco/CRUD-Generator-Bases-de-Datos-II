import {
    apiObtenerPrivilegios,
    apiAplicarPrivilegiosLote,
    apiProbarPrivilegios
} from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado } from '../state.js';

/**
 * Pantalla de privilegios: matriz rol x operación para los
 * procedimientos generados de las tablas seleccionadas.
 *
 *   La misma matriz se aplica a todas las tablas seleccionadas.
 *   Aplicar  -> GRANT / REVOKE EXECUTE (lo hace el backend, en una sola
 *               transacción para todas las tablas).
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
    <p class="nota" id="notaMatriz"></p>

    <div class="fila-acciones">
        <button class="btn-conectar" id="btnAplicar">Aplicar privilegios</button>
        <button class="btn-recargar" id="btnProbar">Probar con cada rol</button>
    </div>

    <div id="bloqueSentencias" hidden>
        <div class="fila-encabezado">
            <label>Sentencias ejecutadas</label>
        </div>
        <pre class="codigo codigo-ajustado" id="sentencias"></pre>
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
    const avisos = contenedor.querySelector('#avisos');
    const matriz = contenedor.querySelector('#matriz');
    const notaMatriz = contenedor.querySelector('#notaMatriz');
    const btnAplicar = contenedor.querySelector('#btnAplicar');
    const btnProbar = contenedor.querySelector('#btnProbar');
    const btnRecargar = contenedor.querySelector('#btnRecargar');
    const bloqueSentencias = contenedor.querySelector('#bloqueSentencias');
    const sentencias = contenedor.querySelector('#sentencias');
    const bloquePrueba = contenedor.querySelector('#bloquePrueba');
    const prueba = contenedor.querySelector('#prueba');

    // porTabla[tabla] = respuesta de GET /api/privilegios/<esquema>/<tabla>
    let porTabla = {};
    let roles = [];
    let operaciones = [];

    contenedor.querySelector('#subtitulo').textContent =
        `${esquema} — ${tablas.join(', ')}`;

    function errorDeRed() {
        resultado.mostrar(
            '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
            false
        );
    }

    /** Tablas (de las seleccionadas) que tienen generado el procedimiento de esa operación. */
    function tablasCon(codigo) {
        return tablas.filter((t) => porTabla[t]?.exito && porTabla[t].procedimientos[codigo]);
    }

    /** ¿En cuántas de esas tablas el rol puede ejecutar la operación? */
    function conPermiso(rolNombre, codigo) {
        return tablasCon(codigo).filter((t) => {
            const rol = porTabla[t].roles.find((r) => r.nombre === rolNombre);
            return rol && rol.permisos[codigo];
        }).length;
    }

    function dibujarAvisos() {
        const lista = [];

        const conInvoker = tablas.filter((t) => porTabla[t]?.exito &&
            Object.values(porTabla[t].procedimientos).some((p) => p.security === 'INVOKER'));
        if (conInvoker.length > 0) {
            lista.push(
                `Hay procedimientos <b>SECURITY INVOKER</b> (en: ${escapar(conInvoker.join(', '))}). ` +
                'Corren con los permisos de quien los llama, así que un rol con EXECUTE igual va a ' +
                'fallar si no tiene permiso directo sobre la tabla. Regeneralos con la extensión 1.2 ' +
                'para que sean <b>SECURITY DEFINER</b>.'
            );
        }

        const publicos = [];
        tablas.forEach((t) => {
            if (!porTabla[t]?.exito) return;
            porTabla[t].ejecutables_por_public.forEach((c) => publicos.push(porTabla[t].procedimientos[c].nombre));
        });
        if (publicos.length > 0) {
            lista.push(
                `Hoy <b>cualquier usuario</b> (PUBLIC) puede ejecutar: ${escapar(publicos.join(', '))}. ` +
                'Al aplicar se revoca.'
            );
        }

        const sinProcs = tablas.filter((t) => porTabla[t]?.exito &&
            Object.keys(porTabla[t].procedimientos).length === 0);
        if (sinProcs.length > 0) {
            lista.push(
                `Sin procedimientos generados (se van a saltar): ${escapar(sinProcs.join(', '))}.`
            );
        }

        const conError = tablas.filter((t) => !porTabla[t]?.exito);
        conError.forEach((t) => {
            lista.push(`✗ ${escapar(t)}: ${escapar(porTabla[t]?.mensaje || 'error al consultar')}`);
        });

        avisos.innerHTML = lista.map((t) => `<div class="aviso">${t}</div>`).join('');
    }

    function dibujarMatriz() {
        const hayAlguno = operaciones.some((op) => tablasCon(op.codigo).length > 0);

        if (!hayAlguno) {
            matriz.innerHTML =
                '<p class="vacio">Ninguna de las tablas seleccionadas tiene procedimientos generados. ' +
                'Generalos primero en la pantalla anterior.</p>';
            notaMatriz.textContent = '';
            btnAplicar.disabled = true;
            btnProbar.disabled = true;
            return;
        }
        btnAplicar.disabled = false;
        btnProbar.disabled = false;

        const encabezados = operaciones.map((op) => {
            const n = tablasCon(op.codigo).length;
            const sub = n === 0 ? 'no generado' : `en ${n} de ${tablas.length} ${tablas.length === 1 ? 'tabla' : 'tablas'}`;
            return `<th class="celda-centro">${escapar(op.etiqueta)}<div class="celda-sub">${sub}</div></th>`;
        }).join('');

        const filas = roles.map((rol) => {
            const insignias = [
                rol.superusuario ? '<span class="insignia insignia-pk">superusuario</span>' : '',
                rol.puede_login ? '' : '<span class="insignia">sin login</span>'
            ].join('');

            const celdas = operaciones.map((op) => {
                const total = tablasCon(op.codigo).length;
                if (total === 0) {
                    return '<td class="celda-centro celda-sub">—</td>';
                }
                const cuantas = conPermiso(rol.nombre, op.codigo);
                const marcado = cuantas === total ? 'checked' : '';
                const mixto = cuantas > 0 && cuantas < total ? 'data-mixto="1"' : '';
                const bloqueado = rol.superusuario
                    ? 'disabled title="Un superusuario siempre puede ejecutar todo"'
                    : '';
                return `
                    <td class="celda-centro">
                        <input type="checkbox" class="casilla"
                               data-rol="${escapar(rol.nombre)}"
                               data-op="${escapar(op.codigo)}" ${marcado} ${mixto} ${bloqueado}>
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

        // Casillas "mixtas": el rol tiene el permiso solo en algunas tablas.
        const mixtas = matriz.querySelectorAll('input[data-mixto]');
        mixtas.forEach((c) => {
            c.indeterminate = true;
            c.addEventListener('change', () => { c.indeterminate = false; }, { once: true });
        });

        notaMatriz.textContent = tablas.length > 1
            ? 'La matriz se aplica igual a todas las tablas seleccionadas.' +
              (mixtas.length > 0
                  ? ' Las casillas con guion tienen el permiso solo en algunas tablas; ' +
                    'si no las tocás, al aplicar quedan desmarcadas en todas.'
                  : '')
            : '';
    }

    async function cargar() {
        resultado.mostrar('Cargando roles y privilegios...', true);
        try {
            const respuestas = await Promise.all(tablas.map((t) => apiObtenerPrivilegios(esquema, t)));
            porTabla = {};
            tablas.forEach((t, i) => { porTabla[t] = respuestas[i]; });

            const primera = respuestas.find((r) => r.exito);
            if (!primera) {
                resultado.mostrar(`✗ ${respuestas[0].mensaje}`, false);
                return;
            }
            roles = primera.roles;
            operaciones = primera.operaciones;

            resultado.ocultar();
            dibujarAvisos();
            dibujarMatriz();
        } catch {
            errorDeRed();
        }
    }

    function leerMatriz() {
        // { rol: [operaciones marcadas] } solo para roles que no son superusuario.
        const resultadoMatriz = {};
        roles.filter((r) => !r.superusuario).forEach((r) => { resultadoMatriz[r.nombre] = []; });

        matriz.querySelectorAll('.casilla:not(:disabled)').forEach((casilla) => {
            if (casilla.checked && !casilla.indeterminate) {
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
            const json = await apiAplicarPrivilegiosLote(esquema, tablas, leerMatriz());
            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }
            sentencias.textContent = json.sentencias.join('\n');
            bloqueSentencias.hidden = false;

            // Volver a leer del catálogo para mostrar el estado REAL.
            await cargar();
            resultado.mostrar(`✓ ${json.mensaje}`, true);
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
            const conProcs = tablas.filter((t) => operaciones.some((op) => porTabla[t]?.procedimientos?.[op.codigo]));
            const respuestas = await Promise.all(conProcs.map((t) => apiProbarPrivilegios(esquema, t)));
            const fallida = respuestas.find((r) => !r.exito);
            if (fallida) {
                resultado.mostrar(`✗ ${fallida.mensaje}`, false);
                return;
            }
            dibujarPrueba(conProcs, respuestas);
        } catch {
            errorDeRed();
        } finally {
            btnProbar.disabled = false;
            btnProbar.textContent = 'Probar con cada rol';
        }
    });

    function dibujarPrueba(tablasProbadas, respuestas) {
        const simbolos = {
            permitido: '<span class="estado estado-ok">✓ permitido</span>',
            denegado: '<span class="estado estado-no">✗ denegado</span>',
            sin_tabla: '<span class="estado estado-medio">⚠ sin permiso en la tabla</span>',
            sin_esquema: '<span class="estado estado-medio">⚠ sin acceso al esquema</span>'
        };

        const secciones = tablasProbadas.map((tabla, i) => {
            const ops = operaciones.filter((op) => porTabla[tabla].procedimientos[op.codigo]);
            const filas = Object.entries(respuestas[i].resultados).map(([rol, porOp]) => {
                const celdas = ops.map((op) => {
                    const r = porOp[op.codigo];
                    return `<td class="celda-centro" title="${escapar(r.detalle)}">${simbolos[r.estado]}</td>`;
                }).join('');
                return `<tr><td class="celda-nombre">${escapar(rol)}</td>${celdas}</tr>`;
            }).join('');

            return `
                ${tablasProbadas.length > 1 ? `<h2 class="titulo-seccion">${escapar(tabla)}</h2>` : ''}
                <div class="scroll-horizontal">
                    <table class="tabla-columnas">
                        <thead><tr><th>Rol</th>${ops.map((o) => `<th class="celda-centro">${escapar(o.etiqueta)}</th>`).join('')}</tr></thead>
                        <tbody>${filas}</tbody>
                    </table>
                </div>`;
        }).join('');

        prueba.innerHTML = `
            ${secciones}
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
