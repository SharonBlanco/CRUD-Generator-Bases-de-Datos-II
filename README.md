# CRUD Generator — Bases de Datos II

Generador automático de procedimientos CRUD para PostgreSQL.

## Estructura

```
Proyecto/
├── backend/                  # API Flask (también sirve el frontend)
│   ├── app.py                # Rutas
│   ├── db.py                 # Conexión a PostgreSQL
│   ├── extension.py          # Verificar / instalar / actualizar la extensión
│   ├── esquemas.py           # Listar esquemas, tablas y columnas
│   ├── generador.py          # Puente hacia la extensión (generar/crear procedimientos)
│   └── privilegios.py        # Matriz rol x operación: GRANT/REVOKE y prueba real
├── frontend/                 # Interfaz web (SPA sin framework)
│   ├── index.html            # Shell: solo <div id="app">
│   ├── css/estilos.css
│   └── js/
│       ├── main.js           # Registra las vistas y arranca el router
│       ├── router.js         # Router por hash (#conexion, #extension, #tablas)
│       ├── state.js          # Estado compartido entre vistas
│       ├── api.js            # Llamadas al backend
│       ├── components/       # Piezas reutilizables
│       └── views/            # Una pantalla por archivo
├── extension/                # Extensión PostgreSQL
│   ├── crud_generator.control
│   ├── crud_generator--1.0.sql
│   └── crud_generator--X--Y.sql   # Parches de versión
├── pruebas/                  # Tablas (3 casos) y 3 roles para la demo
├── Dockerfile                # Imagen de Postgres con la extensión incluida
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## Requisitos

- Python 3.12+
- Docker + Docker Compose

## Instalación

```bash
python3 -m venv venv
source venv/bin/activate      # en Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Ejecución

**1. Levantar PostgreSQL** (el `--build` es necesario: la imagen incluye la extensión):

```bash
docker compose up -d --build
```

**2. Levantar la aplicación** (el backend sirve también el frontend):

```bash
python3 backend/app.py
```

**3. Abrir** `http://localhost:5000` en el navegador y conectar con:

| Campo          | Valor        |
|----------------|--------------|
| Servidor       | `localhost`  |
| Puerto         | `5434`       |
| Base de datos  | `crud_test`  |
| Usuario        | `postgres`   |
| Contraseña     | `postgres`   |

> El puerto es **5434**, no 5432: así lo mapea `docker-compose.yml` para no chocar con un Postgres instalado localmente.

## Actualizar la extensión a una versión nueva

1. Subir `default_version` en `extension/crud_generator.control` (ej. a `'1.2'`).
2. Crear el parche `extension/crud_generator--1.1--1.2.sql` (nombre exacto:
   `crud_generator--VERSION_ANTERIOR--VERSION_NUEVA.sql`) con **solo** los
   cambios nuevos, sin repetir lo de la versión anterior.
3. En la app, pantalla "Extensión crud_generator" → botón **Actualizar extensión**.
   El backend copia el archivo dentro del contenedor y aplica
   `ALTER EXTENSION ... UPDATE` automáticamente.

## Flujo de la aplicación

Conexión → Extensión → Esquema → **Tablas** (una, varias o todas) → Estructura
(análisis hecho por la extensión) → **Generar** (varias operaciones a la vez;
cada procedimiento en su propia transacción, así un error no frena a los demás)
→ **Privilegios** (la misma matriz para todas las tablas seleccionadas) → Probar.

> El servidor Flask corre con `threaded=False` porque usa una sola conexión a
> PostgreSQL: atiende las peticiones una por una para que sus transacciones no
> se mezclen.

## Privilegios

Pantalla **Generar procedimientos → Asignar privilegios**.

- Muestra una matriz **rol × operación** con lo que cada rol puede ejecutar *hoy*
  (leído del catálogo con `has_function_privilege`).
- **Aplicar privilegios**: revoca el permiso por defecto a `PUBLIC` y hace
  `GRANT` / `REVOKE EXECUTE ON ROUTINE` según las casillas. Muestra las
  sentencias ejecutadas.
- **Probar con cada rol**: ejecuta de verdad cada procedimiento como cada rol
  (`SET LOCAL ROLE`) con parámetros `NULL` y hace `ROLLBACK`, así que no deja
  datos. Resultado: permitido / denegado / sin permiso en la tabla / sin acceso
  al esquema.
- A los roles que reciben al menos una operación se les concede también
  `USAGE` sobre el esquema (necesario para llamar rutinas del esquema; no da
  acceso a las tablas).

> Si se vuelve a generar un procedimiento (DROP + CREATE), PostgreSQL le
> devuelve el permiso a `PUBLIC`: hay que volver a aplicar los privilegios.

### Datos de prueba

```powershell
Get-Content pruebas\01_tablas_prueba.sql | docker exec -i crud_generator_db psql -U postgres -d crud_test
Get-Content pruebas\02_roles_prueba.sql  | docker exec -i crud_generator_db psql -U postgres -d crud_test
```

Crea el esquema `tienda` (PK simple, PK compuesta, columnas autogeneradas,
tabla sin PK y nombres reservados) y los roles `vendedor`, `supervisor` y
`administrador` (contraseña = nombre), sin permisos sobre las tablas.

## Versiones de la extensión

| Versión | Contenido |
|---|---|
| 1.0 | Base vacía |
| 1.1 | Análisis de tablas desde el catálogo, `insertar` y `consultar` |
| 1.2 | `actualizar` y `eliminar` por clave primaria (simple o compuesta; error si la tabla no tiene PK), procedimientos `SECURITY DEFINER` con `search_path` fijo y sin permiso para `PUBLIC`, columnas con `DEFAULT` opcionales en `insertar`, y borrado de versiones previas al regenerar |

Procedimientos que genera la 1.2 para una tabla `t`:

| Procedimiento | Parámetros |
|---|---|
| `t_insertar` | Columnas no autogeneradas. Las que tienen `DEFAULT` son opcionales (NULL = usar el default) |
| `t_consultar` (función) | Todas las columnas, opcionales: cada una es un filtro (NULL = no filtra) |
| `t_actualizar` | Columnas de la PK (obligatorias) + resto de columnas opcionales (NULL = no cambiar) |
| `t_eliminar` | Columnas de la PK |

Ejemplos:

```sql
CALL tienda.producto_insertar('Parlante', 12500);
SELECT * FROM tienda.producto_consultar(p_nombre => 'Parlante');
CALL tienda.producto_actualizar(1, p_precio => 14000);
CALL tienda.detalle_factura_eliminar(2, 1::smallint);   -- PK compuesta
```
