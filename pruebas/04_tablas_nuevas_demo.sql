-- =====================================================================
-- Tablas "nuevas" para demostrar que la solución funciona con tablas que
-- no se usaron durante el desarrollo (punto 10 del video).
-- Tipos y casos distintos a los de "tienda": boolean, date, char(13),
-- DEFAULT current_date / true, una columna con nombre reservado
-- ("comment"), una llave foránea y una clave primaria de TRES columnas.
--
-- Uso:
--   Get-Content pruebas\04_tablas_nuevas_demo.sql | docker exec -i crud_generator_db psql -U postgres -d crud_test
-- (o pegarlo en pgAdmin / psql durante el video)
-- =====================================================================

DROP SCHEMA IF EXISTS biblioteca CASCADE;
CREATE SCHEMA biblioteca;

CREATE TABLE biblioteca.libro (
    id_libro  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    titulo    varchar(150) NOT NULL,
    isbn      char(13) UNIQUE,
    precio    numeric(8,2),
    activo    boolean DEFAULT true
);

CREATE TABLE biblioteca.prestamo (
    id_libro        integer NOT NULL REFERENCES biblioteca.libro,
    carne_socio     varchar(10) NOT NULL,
    fecha_prestamo  date NOT NULL DEFAULT current_date,
    devuelto        boolean NOT NULL DEFAULT false,
    "comment"       text,
    PRIMARY KEY (id_libro, carne_socio, fecha_prestamo)
);
