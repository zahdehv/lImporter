// preproc prompt
export const prompt_get_claims_instructions = `Dado el archivo, debes hacer dos cosas:
1. Extraer los hechos e informaciones diferentes brindadas:
  - Estos deben estar enumerados en una lista (de markdown) que debe estar entre tags <claims></claims>.
  - Deben ser obtenidos de la fuente original.
  - Deben cubrir en conjunto la mayor parte de la información original posible.
  - Cada uno debe contar con el contexto suficiente para ser comprendido por sí solo. En caso de requerir mayor contexto, este debe ser incluido entre [corchetes, el contexto iría aquí].
  - No deben contener ambigüedad.

2. Crear una lista de instrucciones que use el contexto anteriormente brindado, con el fin de generar un conjunto de notas en una bóveda de Obsidian:
  - Deben estar enumeradas en una lista (de markdown) entre tags <instructions></instructions>.
  - Las instrucciones deben ser tan explícitas como sea posible sobre:
    * Jerarquía y contenido de las notas
    * Qué contenido incluir
    * Formato del archivo
    * Relaciones entre las notas
  - El modelo no debe tener dudas sobre qué hacer (garantizado por claridad y completitud).
  - Si la fuente original contiene instrucciones (ej: audio), tómalas en cuenta al formularlas.
  - Si no contiene instrucciones, simplemente guarda la información enunciada (por defecto siempre se debe guardar la información necesaria).
  - Si la información es muy extensa, divídela en archivos más pequeños que sigan una intencionalidad.
  - Para archivos muy cortos (ej: un solo hecho), considera incluirlo en otro archivo.
  - Se propone el estilo de toma de notas Zettelkasten para Obsidian.
La cantidad de notas no debe exceder 4 o 5 notas, y debe incluirse la especificacion de las relaciones para evitar la posterior ampliacion por el agente.
`;

// write file prompts
export const write_file_description = `Usado para crear archivos markdown(.md).`

export const write_file_path_description = `Direccion para crear o modificar el archivo.
Ejemplo de nombres (direccion) de archivo: 'arte_cubano.md' o amor/romance.md. 
No usar acentos en el titulo. Si usas un nombre de archivo existente, lo modificaras, 
usalo para rectificar errores en caso de ser necesario.
File name cannot contain any of the following characters: * " \ / < > : | ?`

export const write_file_content_description = `Contenido a ser escrito en el archivo.
Los archivos deben iniciar con el encabezado:
---
Title: "Here goes the Title"
tags: 
- tag1 (los tags no deben tener espacios)
- tag2 (los tags no deben tener espacios)
aliases:
- alias1
- alias2
---

Los links son de la forma [[nombre de archivo(no necesita incluir la direccion completa)|Nombre mostrado en la Nota]] y 
debe ser incluido en el texto, no al final ni de forma incoherente, asi como no usar un solo bracket (e.g. [example]). 
Este debe estar contenido en el texto si es posible. En caso de no serlo se puede incluir en un texto completo adicional 
que explique la relacion al archivo.

Puede usar todos los recursos disponibles del lenguaje Markdown.`

export const prompt_ghost_references = `Encuentra todos los enlaces no resueltos (ghost references)
en la bóveda de Obsidian, y los archivos donde aparecen. 
Debe ser usado al final para verificar que todo este bien conectado.

Estos pueden ser resueltos creando el archivo faltante o renombrando archivos, 
dado que el conflicto de enlace sea por errores de escritura`