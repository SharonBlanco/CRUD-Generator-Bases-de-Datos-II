-- =====================================================================
-- crud_generator: 1.1 -> 1.2
--
-- Cambios de esta versión:
--   1. Operaciones nuevas: actualizar (UPDATE) y eliminar (DELETE),
--      identificando el registro por su clave primaria, sea simple o
--      compuesta. Si la tabla no tiene clave primaria, se rechaza con un
--      error claro.
--   2. Seguridad: todos los procedimientos se generan como
--      SECURITY DEFINER con search_path fijo, y se les quita el permiso
--      de ejecución a PUBLIC. Así el acceso se controla solamente con
--      GRANT EXECUTE (pantalla de privilegios) y los usuarios no
--      necesitan permisos directos sobre las tablas.
--   3. insertar: las columnas con DEFAULT pasan a ser parámetros
--      opcionales; si llegan en NULL se usa el valor por defecto.
--   4. Procedimientos previos: al crear, se borran TODAS las versiones
--      anteriores con ese nombre (aunque la tabla haya cambiado y la
--      firma de parámetros sea distinta).
--
-- Solo contiene lo nuevo o lo que cambia respecto a la 1.1.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Lista de operaciones: ahora incluye actualizar y eliminar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_operaciones()
RETURNS TABLE (codigo text, etiqueta text)
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT *
    FROM (VALUES
        ('insertar',   'Insertar (CREATE)'),
        ('consultar',  'Consultar (READ)'),
        ('actualizar', 'Actualizar (UPDATE)'),
        ('eliminar',   'Eliminar (DELETE)')
    ) AS t(codigo, etiqueta);
$fn$;


-- ---------------------------------------------------------------------
-- Nombre del procedimiento generado: <tabla>_<operacion>.
-- PostgreSQL corta en silencio los nombres de más de 63 bytes, lo que
-- podría hacer que dos procedimientos distintos choquen. Mejor avisar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_nombre_procedimiento(p_tabla name, p_operacion text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    v_nombre text := p_tabla || '_' || lower(p_operacion);
BEGIN
    IF octet_length(v_nombre) > 63 THEN
        RAISE EXCEPTION 'El nombre "%" supera los 63 caracteres que permite PostgreSQL', v_nombre;
    END IF;
    RETURN v_nombre;
END;
$fn$;


-- ---------------------------------------------------------------------
-- Cláusulas de seguridad comunes a todos los procedimientos generados.
--
-- SECURITY DEFINER: el procedimiento corre con los permisos de su dueño
-- (quien lo generó), no de quien lo llama. Por eso:
--   * search_path fijo: evita que quien llama "engañe" al procedimiento
--     creando objetos con el mismo nombre en otro esquema. Los nombres
--     de tabla del cuerpo ya van calificados con el esquema.
--   * REVOKE ... FROM PUBLIC: por defecto PostgreSQL deja ejecutar
--     cualquier rutina nueva a todo el mundo; con DEFINER eso le daría
--     a cualquiera los permisos del dueño.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_clausula_seguridad()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT E'SECURITY DEFINER\nSET search_path = pg_catalog, pg_temp';
$fn$;

CREATE OR REPLACE FUNCTION crud_revocar_public(p_esquema name, p_nombre text, p_tipos text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT format(E'\n\nREVOKE ALL ON ROUTINE %I.%I(%s) FROM PUBLIC;', p_esquema, p_nombre, p_tipos);
$fn$;


-- ---------------------------------------------------------------------
-- INSERTAR (CREATE)
--   * Columnas autogeneradas (serial, identity, calculadas): se excluyen.
--   * Columnas con DEFAULT: parámetro opcional; NULL -> valor por defecto.
--   * Resto: parámetro obligatorio.
-- Los obligatorios van primero porque PostgreSQL exige que los
-- parámetros con DEFAULT queden al final.
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
    v_nombre   text := crud_nombre_procedimiento(p_tabla, 'insertar');
BEGIN
    FOR r IN
        SELECT * FROM crud_analizar_tabla(p_esquema, p_tabla)
        WHERE NOT autogenerada
        ORDER BY (valor_defecto IS NOT NULL), posicion
    LOOP
        v_columnas := v_columnas || format(', %I', r.columna);
        v_tipos    := v_tipos    || format(', %s', r.tipo);

        IF r.valor_defecto IS NULL THEN
            v_params  := v_params  || format(E',\n    %I %s', 'p_' || r.columna, r.tipo);
            v_valores := v_valores || format(', %I', 'p_' || r.columna);
        ELSE
            v_params  := v_params  || format(E',\n    %I %s DEFAULT NULL', 'p_' || r.columna, r.tipo);
            v_valores := v_valores || format(', COALESCE(%I, %s)', 'p_' || r.columna, r.valor_defecto);
        END IF;
    END LOOP;

    IF v_columnas = '' THEN
        RAISE EXCEPTION 'La tabla %.% no tiene columnas insertables (todas son autogeneradas)',
            p_esquema, p_tabla;
    END IF;

    v_params   := substr(v_params, 2);
    v_columnas := substr(v_columnas, 3);
    v_valores  := substr(v_valores, 3);
    v_tipos    := substr(v_tipos, 3);

    RETURN format(
        E'DROP PROCEDURE IF EXISTS %I.%I(%s);\n\n' ||
        E'CREATE OR REPLACE PROCEDURE %I.%I(%s\n)\n' ||
        E'LANGUAGE plpgsql\n%s\nAS $BODY$\nBEGIN\n' ||
        E'    INSERT INTO %I.%I (%s)\n' ||
        E'    VALUES (%s);\n' ||
        E'END;\n$BODY$;%s',
        p_esquema, v_nombre, v_tipos,
        p_esquema, v_nombre, v_params,
        crud_clausula_seguridad(),
        p_esquema, p_tabla, v_columnas,
        v_valores,
        crud_revocar_public(p_esquema, v_nombre, v_tipos)
    );
END;
$fn$;


-- ---------------------------------------------------------------------
-- CONSULTAR (READ): igual que en la 1.1 (cada columna es un filtro
-- opcional), pero con las cláusulas de seguridad nuevas.
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
    v_nombre      text := crud_nombre_procedimiento(p_tabla, 'consultar');
BEGIN
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
        E'DROP FUNCTION IF EXISTS %I.%I(%s);\n\n' ||
        E'CREATE OR REPLACE FUNCTION %I.%I(%s\n)\n' ||
        E'RETURNS SETOF %I.%I\n' ||
        E'LANGUAGE plpgsql\n%s\nAS $BODY$\nBEGIN\n' ||
        E'    RETURN QUERY\n' ||
        E'    SELECT * FROM %I.%I\n' ||
        E'    WHERE true%s;\n' ||
        E'END;\n$BODY$;%s',
        p_esquema, v_nombre, v_tipos,
        p_esquema, v_nombre, v_params,
        p_esquema, p_tabla,
        crud_clausula_seguridad(),
        p_esquema, p_tabla,
        v_condiciones,
        crud_revocar_public(p_esquema, v_nombre, v_tipos)
    );
END;
$fn$;


-- ---------------------------------------------------------------------
-- ACTUALIZAR (UPDATE)
--   * Parámetros obligatorios: TODAS las columnas de la clave primaria
--     (simple o compuesta). Identifican el registro en el WHERE.
--   * Parámetros opcionales: el resto de columnas no autogeneradas.
--     NULL = "no cambiar esa columna" (actualización parcial).
--   * Si la clave no existe, el procedimiento lanza un error.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_codigo_actualizar(p_esquema name, p_tabla name)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
    r          record;
    v_params   text := '';
    v_opcional text := '';
    v_set      text := '';
    v_where    text := '';
    v_tipos    text := '';
    v_tipos_op text := '';
    v_nombre   text := crud_nombre_procedimiento(p_tabla, 'actualizar');
BEGIN
    IF cardinality(crud_columnas_pk(p_esquema, p_tabla)) = 0 THEN
        RAISE EXCEPTION 'La tabla %.% no tiene clave primaria: no se puede generar "actualizar" '
                        'porque no hay forma segura de identificar un solo registro', p_esquema, p_tabla;
    END IF;

    FOR r IN
        SELECT * FROM crud_analizar_tabla(p_esquema, p_tabla)
        ORDER BY posicion
    LOOP
        IF r.es_pk THEN
            v_params := v_params || format(E',\n    %I %s', 'p_' || r.columna, r.tipo);
            v_where  := v_where  || format(' AND %I = %I', r.columna, 'p_' || r.columna);
            v_tipos  := v_tipos  || format(', %s', r.tipo);
        ELSIF NOT r.autogenerada THEN
            v_opcional := v_opcional || format(E',\n    %I %s DEFAULT NULL', 'p_' || r.columna, r.tipo);
            v_set      := v_set || format(E',\n        %I = COALESCE(%I, %I)',
                                          r.columna, 'p_' || r.columna, r.columna);
            v_tipos_op := v_tipos_op || format(', %s', r.tipo);
        END IF;
    END LOOP;

    IF v_set = '' THEN
        RAISE EXCEPTION 'La tabla %.% no tiene columnas que se puedan actualizar '
                        '(solo tiene clave primaria o columnas autogeneradas)', p_esquema, p_tabla;
    END IF;

    v_params := substr(v_params || v_opcional, 2);
    v_set    := substr(v_set, 2);
    v_where  := substr(v_where, 6);
    v_tipos  := substr(v_tipos || v_tipos_op, 3);

    RETURN format(
        E'DROP PROCEDURE IF EXISTS %I.%I(%s);\n\n' ||
        E'CREATE OR REPLACE PROCEDURE %I.%I(%s\n)\n' ||
        E'LANGUAGE plpgsql\n%s\nAS $BODY$\nBEGIN\n' ||
        E'    UPDATE %I.%I\n' ||
        E'    SET%s\n' ||
        E'    WHERE %s;\n\n' ||
        E'    IF NOT FOUND THEN\n' ||
        E'        RAISE EXCEPTION ''No existe un registro en %% con esa clave primaria'', %L;\n' ||
        E'    END IF;\n' ||
        E'END;\n$BODY$;%s',
        p_esquema, v_nombre, v_tipos,
        p_esquema, v_nombre, v_params,
        crud_clausula_seguridad(),
        p_esquema, p_tabla,
        v_set,
        v_where,
        p_esquema || '.' || p_tabla,
        crud_revocar_public(p_esquema, v_nombre, v_tipos)
    );
END;
$fn$;


-- ---------------------------------------------------------------------
-- ELIMINAR (DELETE)
--   * Parámetros: todas las columnas de la clave primaria.
--   * Si la clave no existe, el procedimiento lanza un error.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crud_codigo_eliminar(p_esquema name, p_tabla name)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
    r        record;
    v_params text := '';
    v_where  text := '';
    v_tipos  text := '';
    v_nombre text := crud_nombre_procedimiento(p_tabla, 'eliminar');
BEGIN
    FOR r IN
        SELECT * FROM crud_analizar_tabla(p_esquema, p_tabla)
        WHERE es_pk
        ORDER BY posicion
    LOOP
        v_params := v_params || format(E',\n    %I %s', 'p_' || r.columna, r.tipo);
        v_where  := v_where  || format(' AND %I = %I', r.columna, 'p_' || r.columna);
        v_tipos  := v_tipos  || format(', %s', r.tipo);
    END LOOP;

    IF v_params = '' THEN
        RAISE EXCEPTION 'La tabla %.% no tiene clave primaria: no se puede generar "eliminar" '
                        'porque no hay forma segura de identificar un solo registro', p_esquema, p_tabla;
    END IF;

    v_params := substr(v_params, 2);
    v_where  := substr(v_where, 6);
    v_tipos  := substr(v_tipos, 3);

    RETURN format(
        E'DROP PROCEDURE IF EXISTS %I.%I(%s);\n\n' ||
        E'CREATE OR REPLACE PROCEDURE %I.%I(%s\n)\n' ||
        E'LANGUAGE plpgsql\n%s\nAS $BODY$\nBEGIN\n' ||
        E'    DELETE FROM %I.%I\n' ||
        E'    WHERE %s;\n\n' ||
        E'    IF NOT FOUND THEN\n' ||
        E'        RAISE EXCEPTION ''No existe un registro en %% con esa clave primaria'', %L;\n' ||
        E'    END IF;\n' ||
        E'END;\n$BODY$;%s',
        p_esquema, v_nombre, v_tipos,
        p_esquema, v_nombre, v_params,
        crud_clausula_seguridad(),
        p_esquema, p_tabla,
        v_where,
        p_esquema || '.' || p_tabla,
        crud_revocar_public(p_esquema, v_nombre, v_tipos)
    );
END;
$fn$;


-- ---------------------------------------------------------------------
-- Punto de entrada (vista previa): ahora conoce las 4 operaciones.
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
        WHEN 'insertar'   THEN RETURN crud_codigo_insertar(p_esquema, p_tabla);
        WHEN 'consultar'  THEN RETURN crud_codigo_consultar(p_esquema, p_tabla);
        WHEN 'actualizar' THEN RETURN crud_codigo_actualizar(p_esquema, p_tabla);
        WHEN 'eliminar'   THEN RETURN crud_codigo_eliminar(p_esquema, p_tabla);
        ELSE RAISE EXCEPTION 'La operación "%" no está implementada en crud_generator', p_operacion;
    END CASE;
END;
$fn$;


-- ---------------------------------------------------------------------
-- Punto de entrada (crear): antes de crear, borra cualquier versión
-- previa del procedimiento con ese nombre, aunque tenga otra firma
-- (pasa si la tabla cambió de columnas desde la última generación).
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE crud_generar_procedimiento(
    p_esquema   name,
    p_tabla     name,
    p_operacion text
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_sql    text;
    v_previo regprocedure;
BEGIN
    -- Generar primero: si la tabla no sirve para esta operación (por
    -- ejemplo, no tiene PK), se falla antes de borrar nada.
    v_sql := crud_generar_codigo(p_esquema, p_tabla, p_operacion);

    FOR v_previo IN
        SELECT p.oid::regprocedure
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = p_esquema
          AND p.proname = crud_nombre_procedimiento(p_tabla, p_operacion)
    LOOP
        EXECUTE format('DROP ROUTINE %s', v_previo);
    END LOOP;

    EXECUTE v_sql;
END;
$fn$;
