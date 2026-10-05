import { apiDescribirProcedimientos, apiEjecutarProcedimiento } from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado } from '../state.js';

/**
 * Probar procedimientos: ejecutar los procedimientos generados con datos
 * reales, como el usuario conectado o como otro rol, y ver el resultado.
 * El formulario se arma solo con los parámetros que tiene cada
 * procedimiento en la base (nada está fijo para ninguna tabla).
 */
const html = `
<div class="contenedor contenedor-ancho contenedor-matriz">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Probar procedimientos</h1>
    <p class="subtitulo" id="subtitulo"></p>

    <div class="fila-campos">
        <div class="campo">
            <label for="selTabla">Tabla</label>
            <select id="selTabla" class="selector"></select>
        </div>
        <div class="campo">
            <label for="selOperacion">Operación</label>
            <select id="selOperacion" class="selector"></select>
        </div>
        <div class="campo">
            <label for="selRol">Ejecutar como</label>
            <select id="selRol" class="selector"></select>
        </div>
    </div>

    <div id="firma" class="nota"></div>
    <form id="formulario" class="formulario-parametros" autocomplete="off"></form>

    <button class="btn-conectar" id="btnEjecutar" style="margin-top: 16px">Ejecutar</button>

    <div class="resultado" id="resultado"></div>

    <div id="bloqueSentencia" hidden>
        <div class="fila-encabezado"><label>Sentencia ejecutada</label></div>
        <pre class="codigo codigo-ajustado" id="sentencia"></pre>
    </div>

    <div id="bloqueFilas" hidden>
        <div class="fila-encabezado"><label id="tituloFilas">Filas devueltas</label></div>
        <div id="filas"></div>
    </div>

    <div id="bloqueEstado" hidden>
        <div class="fila-encabezado"><label id="tituloEstado">Estado actual de la tabla</label></div>
        <div id="estado"></div>
    </div>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a privilegios</button>
    </div>
</div>
`;

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

/** Pista para el campo, según la operación y si el parámetro es opcional. */
function pista(operacion, parametro) {
    if (!parametro.opcional) return 'obligatorio';
    if (operacion === 'consultar') return 'vacío = no filtra';
    if (operacion === 'actualizar') return 'vacío = no cambia';
    if (operacion === 'insertar') return 'vacío = valor por defecto';
    return 'opcional';
}

function tablaHtml(datos) {
    if (!datos || datos.filas.length === 0) {
        return '<p class="vacio">Sin filas.</p>';
    }
    const cabecera = datos.columnas.map((c) => `<th>${escapar(c)}</th>`).join('');
    const cuerpo = datos.filas.map((fila) =>
        `<tr>${fila.map((v) => `<td>${v === null ? '<span class="celda-sub">NULL</span>' : escapar(v)}</td>`).join('')}</tr>`
    ).join('');
    return `
        <div class="scroll-horizontal">
            <table class="tabla-columnas">
                <thead><tr>${cabecera}</tr></thead>
                <tbody>${cuerpo}</tbody>
            </table>
        </div>`;
}

function montar(contenedor) {
    const { esquema, tablas } = obtenerEstado();

    if (!esquema || tablas.length === 0) {
        navegar(esquema ? 'tablas' : 'esquemas');
        return;
    }

    const resultado = crearResultado(contenedor);
    const selTabla = contenedor.querySelector('#selTabla');
    const selOperacion = contenedor.querySelector('#selOperacion');
    const selRol = contenedor.querySelector('#selRol');
    const firma = contenedor.querySelector('#firma');
    const formulario = contenedor.querySelector('#formulario');
    const btnEjecutar = contenedor.querySelector('#btnEjecutar');
    const bloqueSentencia = contenedor.querySelector('#bloqueSentencia');
    const bloqueFilas = contenedor.querySelector('#bloqueFilas');
    const bloqueEstado = contenedor.querySelector('#bloqueEstado');

    let descripcion = null;   // respuesta de GET /api/ejecutor/<esquema>/<tabla>

    contenedor.querySelector('#subtitulo').textContent =
        `${esquema} — ejecutá los procedimientos generados con datos reales`;

    selTabla.innerHTML = tablas
        .map((t) => `<option value="${escapar(t)}">${escapar(t)}</option>`).join('');

    function errorDeRed() {
        resultado.mostrar(
            '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
            false
        );
    }

    function limpiarResultados() {
        resultado.ocultar();
        bloqueSentencia.hidden = true;
        bloqueFilas.hidden = true;
        bloqueEstado.hidden = true;
    }

    function dibujarFormulario() {
        limpiarResultados();
        const proc = descripcion?.procedimientos[selOperacion.value];
        if (!proc) {
            formulario.innerHTML = '';
            firma.textContent = '';
            btnEjecutar.disabled = true;
            return;
        }
        btnEjecutar.disabled = false;
        firma.innerHTML = `Va a ejecutar <code>${escapar(esquema)}.${escapar(proc.nombre)}</code> (${escapar(proc.clase)})`;

        if (proc.parametros.length === 0) {
            formulario.innerHTML = '<p class="vacio">Este procedimiento no recibe parámetros.</p>';
            return;
        }

        formulario.innerHTML = proc.parametros.map((p) => `
            <div class="campo">
                <label for="par_${escapar(p.nombre)}">
                    ${escapar(p.nombre)} <span class="celda-sub">${escapar(p.tipo)}</span>
                    ${p.opcional ? '' : '<span class="insignia insignia-requerida">obligatorio</span>'}
                </label>
                <input type="text" id="par_${escapar(p.nombre)}" data-parametro="${escapar(p.nombre)}"
                       placeholder="${escapar(pista(selOperacion.value, p))}">
            </div>`).join('');
    }

    async function cargarTabla() {
        limpiarResultados();
        formulario.innerHTML = '';
        try {
            const json = await apiDescribirProcedimientos(esquema, selTabla.value);
            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }
            descripcion = json;

            const rolPrevio = selRol.value;
            selRol.innerHTML =
                `<option value="">${escapar(json.usuario_actual)} (usuario conectado)</option>` +
                json.roles
                    .filter((r) => r.nombre !== json.usuario_actual)
                    .map((r) => `<option value="${escapar(r.nombre)}">${escapar(r.nombre)}${r.superusuario ? ' (superusuario)' : ''}</option>`)
                    .join('');
            if ([...selRol.options].some((o) => o.value === rolPrevio)) selRol.value = rolPrevio;

            const opPrevia = selOperacion.value;
            const disponibles = json.operaciones.filter((op) => json.procedimientos[op.codigo]);
            selOperacion.innerHTML = disponibles.length === 0
                ? '<option value="">(no hay procedimientos generados)</option>'
                : disponibles.map((op) => `<option value="${escapar(op.codigo)}">${escapar(op.etiqueta)}</option>`).join('');
            if (disponibles.some((op) => op.codigo === opPrevia)) selOperacion.value = opPrevia;

            dibujarFormulario();
        } catch {
            errorDeRed();
        }
    }

    async function ejecutar() {
        const valores = {};
        formulario.querySelectorAll('input[data-parametro]').forEach((input) => {
            valores[input.dataset.parametro] = input.value;
        });

        btnEjecutar.disabled = true;
        btnEjecutar.textContent = 'Ejecutando...';
        limpiarResultados();

        try {
            const json = await apiEjecutarProcedimiento(
                esquema, selTabla.value, selOperacion.value, selRol.value, valores
            );

            if (json.sentencia) {
                contenedor.querySelector('#sentencia').textContent = json.sentencia;
                bloqueSentencia.hidden = false;
            }

            if (!json.exito) {
                const prefijo = json.denegado ? '✗ Permiso denegado: ' : '✗ ';
                resultado.mostrar(prefijo + json.mensaje, false);
                return;
            }

            resultado.mostrar(`✓ ${json.mensaje}`, true);

            if (json.resultado) {
                contenedor.querySelector('#tituloFilas').textContent =
                    `Filas devueltas (${json.resultado.filas.length})`;
                contenedor.querySelector('#filas').innerHTML = tablaHtml(json.resultado);
                bloqueFilas.hidden = false;
            }

            contenedor.querySelector('#tituloEstado').textContent =
                `Estado actual de ${esquema}.${selTabla.value}` +
                (json.estado_tabla.filas.length === 100 ? ' (primeras 100 filas)' : '');
            contenedor.querySelector('#estado').innerHTML = tablaHtml(json.estado_tabla);
            bloqueEstado.hidden = false;
        } catch {
            errorDeRed();
        } finally {
            btnEjecutar.disabled = false;
            btnEjecutar.textContent = 'Ejecutar';
        }
    }

    selTabla.addEventListener('change', cargarTabla);
    selOperacion.addEventListener('change', dibujarFormulario);
    selRol.addEventListener('change', limpiarResultados);
    btnEjecutar.addEventListener('click', ejecutar);
    formulario.addEventListener('submit', (e) => { e.preventDefault(); ejecutar(); });

    contenedor.querySelector('#btnCambiarConexion').addEventListener('click', () => {
        navegar('conexion');
    });

    contenedor.querySelector('#btnVolver').addEventListener('click', () => {
        navegar('privilegios');
    });

    cargarTabla();
}

export default { html, montar };
