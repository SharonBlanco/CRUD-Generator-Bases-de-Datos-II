import { registrarRuta, iniciarRouter } from './router.js';
import vistaConexion from './views/conexion.js';
import vistaExtension from './views/extension.js';
import vistaEsquemas from './views/esquemas.js';
import vistaTablas from './views/tablas.js';
import vistaTabla from './views/tabla.js';
import vistaGenerador from './views/generador.js';

registrarRuta('conexion', vistaConexion, { porDefecto: true });
registrarRuta('extension', vistaExtension);
registrarRuta('esquemas', vistaEsquemas);
registrarRuta('tablas', vistaTablas);
registrarRuta('tabla', vistaTabla);
registrarRuta('generador', vistaGenerador);

iniciarRouter();
