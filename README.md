# lImporter para Obsidian

## Descripción
lImporter es un plugin para Obsidian que permite procesar archivos de audio y PDF para convertirlos automáticamente en notas estructuradas. El plugin utiliza la API de Google Generative AI para transcribir y analizar el contenido de los archivos, extrayendo información relevante y organizándola según el estilo Zettelkasten.

## Características
- Procesamiento automático de archivos de audio (mp3, wav, ogg, m4a, aac, flac, aiff)
- Soporte para archivos PDF
- Extracción de información clave y hechos relevantes
- Generación automática de notas estructuradas
- Creación de enlaces entre notas relacionadas

## Instalación
1. Descarga la última versión desde la sección de [Releases](https://github.com/zahdehv/lImporter/releases)
2. Extrae el contenido en la carpeta `.obsidian/plugins/` de tu bóveda de Obsidian
3. Activa el plugin en la configuración de Obsidian (Ajustes > Plugins de comunidad)

## Configuración
1. Abre la configuración del plugin en Obsidian (Ajustes > Plugins de comunidad > lImporter)
2. Introduce tu clave de API de Google (puedes obtenerla en [Google AI Studio](https://makersuite.google.com/app/apikey))
3. Configura las opciones adicionales según tus preferencias

## Uso
El plugin funciona de manera automática:

1. Simplemente arrastra y suelta archivos de audio o PDF en tu bóveda de Obsidian
2. El plugin detectará automáticamente los archivos compatibles
3. Se abrirá una ventana modal para procesar el archivo
4. Haz clic en el botón de enviar para iniciar el procesamiento
5. El plugin generará notas estructuradas basadas en el contenido del archivo

## Requisitos
- Obsidian v0.15.0 o superior
- Conexión a Internet (para la comunicación con la API de Google)
- Clave de API de Google Generative AI

## Limitaciones
- El procesamiento de archivos grandes puede llevar más tiempo
- La calidad de la transcripción depende de la claridad del audio original
- Se requiere conexión a Internet para el procesamiento

## Soporte
Si encuentras algún problema o tienes sugerencias, por favor abre un issue [aquí](https://github.com/zahdehv/lImporter/issues).
