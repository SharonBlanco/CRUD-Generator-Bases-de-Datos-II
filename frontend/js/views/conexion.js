import { apiConectar } from '../api.js';
import { crearResultado } from '../components/resultado.js';
import { setConexion } from '../state.js';
import { navegar } from '../router.js';

const html = `
<div class="contenedor">
    <h1 class="titulo">Conexión PostgreSQL</h1>
    <p class="subtitulo">CRUD Generator — Bases de Datos II</p>

    <div class="fila-doble">
        <div class="campo">
            <label for="servidor">Servidor</label>
            <input type="text" id="servidor" placeholder="localhost" value="localhost">
        </div>
        <div class="campo">
            <label for="puerto">Puerto</label>
            <input type="number" id="puerto" placeholder="5432" value="5432">
        </div>
    </div>

    <div class="campo">
        <label for="base_datos">Base de datos</label>
        <input type="text" id="base_datos" placeholder="nombre_bd">
    </div>

    <div class="campo">
        <label for="usuario">Usuario</label>
        <input type="text" id="usuario" placeholder="postgres">
    </div>

    <div class="campo">
        <label for="contrasena">Contraseña</label>
        <input type="password" id="contrasena" placeholder="••••••••">
    </div>

    <button class="btn-conectar" id="btnConectar">Conectar</button>

    <div class="resultado" id="resultado"></div>
</div>
`;

function obtenerDatosConexion(contenedor) {
    return {
        servidor:   contenedor.querySelector('#servidor').value.trim(),
        puerto:     contenedor.querySelector('#puerto').value.trim(),
        base_datos: contenedor.querySelector('#base_datos').value.trim(),
        usuario:    contenedor.querySelector('#usuario').value.trim(),
        contrasena: contenedor.querySelector('#contrasena').value
    };
}

function validarCampos(datos) {
    for (const [campo, valor] of Object.entries(datos)) {
        if (!valor) return campo;
    }
    return null;
}

function montar(contenedor) {
    const resultado = crearResultado(contenedor);
    const btn = contenedor.querySelector('#btnConectar');

    async function conectar() {
        const datos = obtenerDatosConexion(contenedor);

        const campoVacio = validarCampos(datos);
        if (campoVacio) {
            resultado.mostrar(`El campo "${campoVacio}" no puede estar vacío.`, false);
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Conectando...';
        resultado.ocultar();

        try {
            const json = await apiConectar(datos);

            if (json.exito) {
                resultado.mostrar(`✓ ${json.mensaje}\n${json.version}`, true);
                setConexion(datos);
                navegar('extension');
            } else {
                resultado.mostrar(`✗ ${json.mensaje}`, false);
            }
        } catch {
            resultado.mostrar(
                '✗ No se pudo conectar con el backend. ¿Está corriendo el servidor Flask?',
                false
            );
        } finally {
            btn.disabled = false;
            btn.textContent = 'Conectar';
        }
    }

    btn.addEventListener('click', conectar);
    contenedor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') conectar();
    });
}

export default { html, montar };
