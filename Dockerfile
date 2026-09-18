FROM postgres:16

# Copia los archivos de la extensión crud_generator al directorio de
# extensiones de Postgres, y deja ese directorio con permiso de escritura
# para cualquier usuario. Así, en desarrollo, se pueden copiar parches
# nuevos con "docker exec" mientras el contenedor sigue corriendo, sin
# tener que reconstruir la imagen ni reiniciar Postgres (lo cual mataría
# la conexión que tenga abierta el backend).
COPY extension/ /extension-custom/
RUN cp /extension-custom/crud_generator* /usr/share/postgresql/16/extension/ \
    && chmod -R a+rwX /usr/share/postgresql/16/extension
