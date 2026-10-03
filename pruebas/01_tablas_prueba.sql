-- =====================================================================
-- Tablas de prueba para los casos que pide el enunciado.
--
-- Se crean en un esquema aparte ("tienda") para demostrar también la
-- selección de esquema. Se puede ejecutar varias veces: borra y vuelve
-- a crear el esquema.
--
-- OJO: como borra y recrea el esquema, los roles pierden su USAGE
-- sobre "tienda". La app lo vuelve a conceder al aplicar privilegios,
-- pero si usás psql directo, corré también 02_roles_prueba.sql.
--
-- Uso (desde la carpeta del proyecto):
--   PowerShell:
--     Get-Content pruebas\01_tablas_prueba.sql | docker exec -i crud_generator_db psql -U postgres -d crud_test
-- =====================================================================

DROP SCHEMA IF EXISTS tienda CASCADE;
CREATE SCHEMA tienda;


-- Caso 1: clave primaria SIMPLE (y no autogenerada: la cédula la da el usuario)
CREATE TABLE tienda.cliente (
    cedula   varchar(20)  PRIMARY KEY,
    nombre   varchar(100) NOT NULL,
    correo   varchar(150)
);


-- Caso 2: clave primaria COMPUESTA (factura + número de línea)
CREATE TABLE tienda.detalle_factura (
    id_factura  integer      NOT NULL,
    linea       smallint     NOT NULL,
    producto    varchar(100) NOT NULL,
    cantidad    integer      NOT NULL CHECK (cantidad > 0),
    PRIMARY KEY (id_factura, linea)
);


-- Caso 3: columnas AUTOGENERADAS de varios tipos
CREATE TABLE tienda.producto (
    id_producto  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- identity
    nombre       varchar(100)  NOT NULL,
    precio       numeric(10,2) NOT NULL,
    codigo       text GENERATED ALWAYS AS (upper(left(nombre, 3))) STORED, -- columna calculada
    creado_en    timestamp     DEFAULT now()                         -- default común
);


-- Extra: tabla SIN clave primaria (actualizar/eliminar deberían rechazarla)
CREATE TABLE tienda.bitacora (
    mensaje  text NOT NULL,
    fecha    timestamptz DEFAULT now()
);


-- Extra: nombres reservados y con mayúsculas (prueba de format('%I'))
CREATE TABLE tienda."Order" (
    id      serial PRIMARY KEY,   -- serial = secuencia
    "user"  varchar(50) NOT NULL,
    "desc"  text
);


INSERT INTO tienda.cliente VALUES
    ('101110111', 'Ana Mora', 'ana@correo.com'),
    ('202220222', 'Luis Vargas', NULL);

INSERT INTO tienda.detalle_factura VALUES
    (1, 1, 'Teclado', 2),
    (1, 2, 'Mouse', 1),
    (2, 1, 'Monitor', 1);

INSERT INTO tienda.producto (nombre, precio) VALUES
    ('Teclado', 15000),
    ('Mouse', 8000);
