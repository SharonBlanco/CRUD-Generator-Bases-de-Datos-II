-- =====================================================================
-- crud_generator: 1.0 -> 1.1
--
-- Generación dinámica de procedimientos CRUD a partir del catálogo de
-- PostgreSQL. Toda la lógica estructural vive aquí (en la extensión),
-- no en la aplicación cliente.
--
-- Operaciones implementadas en esta versión:
--   insertar  (CREATE)
--   consultar (READ)
--
-- Los identificadores se construyen siempre con format(%I) para citar
-- correctamente nombres reservados o con mayúsculas/espacios.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Operaciones que la extensión sabe generar.
-- La aplicación consulta esta función en vez de tener la lista fija,
-- así al agregar una operación nueva no hay que tocar el cliente.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_operaciones()
RETURNS TABLE (codigo text, etiqueta text)
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT *
    FROM (VALUES
        ('insertar',  'Insertar (CREATE)'),
        ('consultar', 'Consultar (READ)')
    ) AS t(codigo, etiqueta);
$fn$;


-- ---------------------------------------------------------------------
-- Análisis estructural de una tabla, leído del catálogo del sistema.
-- Devuelve orden, tipo completo (con longitud/precisión), clave
-- primaria (simple o compuesta), columnas autogeneradas y defaults.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_analizar_tabla(p_esquema name, p_tabla name)
RETURNS TABLE (
    posicion      smallint,
    columna       name,
    tipo          text,
    es_pk         boolean,
    autogenerada  boolean,
    valor_defecto text,
    acepta_nulos  boolean
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_oid oid;
BEGIN
    SELECT c.oid INTO v_oid
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = p_esquema
      AND c.relname = p_tabla
      AND c.relkind IN ('r', 'p');

    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'La tabla %.% no existe o no es una tabla base', p_esquema, p_tabla
            USING ERRCODE = 'undefined_table';
    END IF;

    RETURN QUERY
    SELECT
        a.attnum,
        a.attname,
        pg_catalog.format_type(a.atttypid, a.atttypmod),
        EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint con
            WHERE con.conrelid = v_oid
              AND con.contype = 'p'
              AND a.attnum = ANY (con.conkey)
        ),
        -- Autogenerada: IDENTITY, GENERATED ... o un default de secuencia (serial).
        a.attidentity <> ''
            OR a.attgenerated <> ''
            OR COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '') LIKE 'nextval(%',
        pg_catalog.pg_get_expr(d.adbin, d.adrelid),
        NOT a.attnotnull
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
        ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = v_oid
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum;
END;
$fn$;


-- ---------------------------------------------------------------------
-- Columnas que conforman la clave primaria (en orden).
-- Vacío si la tabla no tiene clave primaria.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_columnas_pk(p_esquema name, p_tabla name)
RETURNS name[]
LANGUAGE sql
AS $fn$
    SELECT COALESCE(array_agg(columna ORDER BY posicion), '{}'::name[])
    FROM crud_analizar_tabla(p_esquema, p_tabla)
    WHERE es_pk;
$fn$;


-- ---------------------------------------------------------------------
-- INSERTAR (CREATE): genera el código de <tabla>_insertar.
-- Las columnas autogeneradas se excluyen: las llena PostgreSQL.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_codigo_insertar(p_esquema name, p_tabla name)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
    r          record;
    v_params   text := '';
    v_columnas text := '';
    v_valores  text := '';
    v_tipos    text := '';
    v_nombre   text;
BEGIN
    v_nombre := p_tabla || '_insertar';

    FOR r IN
        SELECT * FROM crud_analizar_tabla(p_esquema, p_tabla)
        WHERE NOT autogenerada
        ORDER BY posicion
    LOOP
        v_params   := v_params   || format(E',\n    %I %s', 'p_' || r.columna, r.tipo);
        v_columnas := v_columnas || format(', %I', r.columna);
        v_valores  := v_valores  || format(', %I', 'p_' || r.columna);
        v_tipos    := v_tipos    || format(', %s', r.tipo);
    END LOOP;

    IF v_columnas = '' THEN
        RAISE EXCEPTION 'La tabla %.% no tiene columnas insertables (todas son autogeneradas)',
            p_esquema, p_tabla;
    END IF;

    -- Quitar el separador inicial de cada lista.
    v_params   := substr(v_params, 2);
    v_columnas := substr(v_columnas, 3);
    v_valores  := substr(v_valores, 3);
    v_tipos    := substr(v_tipos, 3);

    RETURN format(
        E'DROP PROCEDURE IF EXISTS %I.%I(%s);\n\nCREATE OR REPLACE PROCEDURE %I.%I(%s\n)\nLANGUAGE plpgsql\nSECURITY INVOKER\nAS $BODY$\nBEGIN\n    INSERT INTO %I.%I (%s)\n    VALUES (%s);\nEND;\n$BODY$;',
        p_esquema, v_nombre, v_tipos,
        p_esquema, v_nombre, v_params,
        p_esquema, p_tabla, v_columnas,
        v_valores
    );
END;
$fn$;


-- ---------------------------------------------------------------------
-- CONSULTAR (READ): genera el código de <tabla>_consultar.
-- Cada columna es un filtro opcional (NULL = no filtra).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_codigo_consultar(p_esquema name, p_tabla name)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
    r             record;
    v_params      text := '';
    v_condiciones text := '';
    v_tipos       text := '';
    v_nombre      text;
BEGIN
    v_nombre := p_tabla || '_consultar';

    FOR r IN
        SELECT * FROM crud_analizar_tabla(p_esquema, p_tabla)
        ORDER BY posicion
    LOOP
        v_params := v_params
            || format(E',\n    %I %s DEFAULT NULL', 'p_' || r.columna, r.tipo);

        v_condiciones := v_condiciones
            || format(E'\n      AND (%I IS NULL OR %I = %I)',
                      'p_' || r.columna, r.columna, 'p_' || r.columna);

        v_tipos := v_tipos || format(', %s', r.tipo);
    END LOOP;

    IF v_params = '' THEN
        RAISE EXCEPTION 'La tabla %.% no tiene columnas', p_esquema, p_tabla;
    END IF;

    v_params := substr(v_params, 2);
    v_tipos  := substr(v_tipos, 3);

    RETURN format(
        E'DROP FUNCTION IF EXISTS %I.%I(%s);\n\nCREATE OR REPLACE FUNCTION %I.%I(%s\n)\nRETURNS SETOF %I.%I\nLANGUAGE plpgsql\nSECURITY INVOKER\nAS $BODY$\nBEGIN\n    RETURN QUERY\n    SELECT * FROM %I.%I\n    WHERE true%s;\nEND;\n$BODY$;',
        p_esquema, v_nombre, v_tipos,
        p_esquema, v_nombre, v_params,
        p_esquema, p_tabla,
        p_esquema, p_tabla,
        v_condiciones
    );
END;
$fn$;


-- ---------------------------------------------------------------------
-- Punto de entrada: devuelve el código sin ejecutarlo (vista previa).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_generar_codigo(
    p_esquema   name,
    p_tabla     name,
    p_operacion text
)
RETURNS text
LANGUAGE plpgsql
AS $fn$
BEGIN
    CASE lower(p_operacion)
        WHEN 'insertar'  THEN RETURN crud_codigo_insertar(p_esquema, p_tabla);
        WHEN 'consultar' THEN RETURN crud_codigo_consultar(p_esquema, p_tabla);
        ELSE RAISE EXCEPTION 'La operación "%" no está implementada en crud_generator', p_operacion;
    END CASE;
END;
$fn$;


-- ---------------------------------------------------------------------
-- Punto de entrada: genera y crea el procedimiento en la base de datos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE crud_generar_procedimiento(
    p_esquema   name,
    p_tabla     name,
    p_operacion text
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_sql text;
BEGIN
    v_sql := crud_generar_codigo(p_esquema, p_tabla, p_operacion);
    EXECUTE v_sql;
END;
$fn$;
