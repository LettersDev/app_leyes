# Guía de Ejecución Manual del Bot (Backfill)

Para actualizar años específicos (ej: 2000-2008) usando GitHub Actions y no consumir tu cuota local:

1.  Ve a tu repositorio en GitHub.
2.  Clic en la pestaña **Actions**.
3.  Selecciona el flujo en la izquierda ("Sincronización de Jurisprudencia TSJ").
4.  Clic en **Run workflow** (botón gris a la derecha).
5.  Verás cajas de texto para `Mode` y `Year`.
    - Mode: `historical`
    - Year: `2000` (o el año que desees)
6.  Clic en el botón verde **Run workflow**.

*Nota: Esto ejecutará el bot con el CÓDIGO NUEVO que acabamos de subir, por lo que guardará los datos correctamente con palabras clave y el campo 'ano'.*
