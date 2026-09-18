import {
    apiListarOperaciones,
    apiGenerarCodigo,
    apiCrearProcedimiento,
    apiListarProcedimientos
} from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { navegar } from '../router.js';
import { obtenerEstado } from '../state.js';

const html = `
<div class="contenedor contenedor-ancho">
    <button class="btn-enlace" id="btnCambiarConexion">← Cambiar conexión</button>

    <h1 class="titulo">Generar procedimientos</h1>
    <p class="subtitulo" id="subtitulo"></p>

    <div class="resultado" id="resultado"></div>

    <div class="fila-encabezado">
        <label>Operación</label>
    </div>
    <div id="listaOperaciones" class="lista"></div>

    <div id="vistaPrevia" hidden>
        <div class="fila-encabezado">
            <label>Código generado</label>
            <button class="btn-recargar" id="btnCrear">Crear en la base de datos</button>
        </div>
        <pre class="codigo" id="codigo"></pre>
    </div>

    <div class="fila-encabezado">
        <label>Ya generados para esta tabla</label>
        <button class="btn-recargar" id="btnRecargar">⟳ Recargar</button>
    </div>
    <div id="listaProcedimientos"></div>

    <div class="pie-navegacion">
        <button class="btn-enlace" id="btnVolver">← Volver a la estructura</button>
    </div>
</div>
`;

function montar(contenedor) {
    const { esquema, tabla } = obtenerEstado();

    if (!esquema || !tabla) {
        navegar(esquema ? 'tablas' : 'esquemas');
        return;
    }

    const resultado = crearResultado(contenedor);
    const listaOperaciones = contenedor.querySelector('#listaOperaciones');
    const listaProcedimientos = contenedor.querySelector('#listaProcedimientos');
    const vistaPrevia = contenedor.querySelector('#vistaPrevia');
    const codigo = contenedor.querySelector('#codigo');
    const btnCrear = contenedor.querySelector('#btnCrear');
    const btnRecargar = contenedor.querySelector('#btnRecargar');

    let operacionActual = null;

    contenedor.querySelector('#subtitulo').textContent = `${esquema}.${tabla}`;

    function errorDeRed() {
        resultado.mostrar(
            '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
            false
        );
    }

    async function cargarOperaciones() {
        resultado.mostrar('Cargando operaciones...', true);

        try {
            const json = await apiListarOperaciones();

            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }

            resultado.ocultar();
            listaOperaciones.innerHTML = '';

            json.operaciones.forEach((op) => {
                const boton = document.createElement('button');
                boton.className = 'lista-item';
                boton.textContent = op.etiqueta;
                boton.addEventListener('click', () => seleccionarOperacion(op, boton));
                listaOperaciones.appendChild(boton);
            });
        } catch {
            errorDeRed();
        }
    }

    async function seleccionarOperacion(operacion, boton) {
        operacionActual = operacion.codigo;
        listaOperaciones.querySelectorAll('.lista-item')
            .forEach((b) => b.classList.toggle('activo', b === boton));

        resultado.mostrar('Generando código...', true);
        vistaPrevia.hidden = true;

        try {
            const json = await apiGenerarCodigo(esquema, tabla, operacion.codigo);

            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }

            resultado.ocultar();
            codigo.textContent = json.codigo;
            vistaPrevia.hidden = false;
        } catch {
            errorDeRed();
        }
    }

    async function cargarProcedimientos() {
        try {
            const json = await apiListarProcedimientos(esquema, tabla);

            if (!json.exito) {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
                return;
            }

            if (json.procedimientos.length === 0) {
                listaProcedimientos.innerHTML =
                    '<p class="vacio">Todavía no hay procedimientos generados.</p>';
                return;
            }

            const filas = json.procedimientos.map((p) => `
                <tr>
                    <td class="celda-nombre">${p.nombre}</td>
                    <td class="celda-tipo">${p.clase}</td>
                    <td><code>(${p.argumentos})</code></td>
                </tr>
            `).join('');

            listaProcedimientos.innerHTML = `
                <div class="scroll-horizontal">
                    <table class="tabla-columnas">
                        <thead>
                            <tr><th>Nombre</th><th>Tipo</th><th>Parámetros</th></tr>
                        </thead>
                        <tbody>${filas}</tbody>
                    </table>
                </div>
            `;
        } catch {
            errorDeRed();
        }
    }

    btnCrear.addEventListener('click', async () => {
        if (!operacionActual) return;

        btnCrear.disabled = true;
        btnCrear.textContent = 'Creando...';

        try {
            const json = await apiCrearProcedimiento(esquema, tabla, operacionActual);

            if (json.exito) {
                resultado.mostrar(`✓ ${json.mensaje}`, true);
                await cargarProcedimientos();
            } else {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
            }
        } catch {
            errorDeRed();
        } finally {
            btnCrear.disabled = false;
            btnCrear.textContent = 'Crear en la base de datos';
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

    cargarOperaciones();
    cargarProcedimientos();
}

export default { html, montar };
