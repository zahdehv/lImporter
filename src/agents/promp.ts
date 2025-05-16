import AutoFilePlugin from "src/main";

//Language Specification
export const getLanguageSpecification = (plugin: AutoFilePlugin) => {
    //Agregar opcion de idioma aqui!!!
    return `Todos los archivos deben ser escritos en ${"SPANISH"}`
}

//FILE ESPECIFICATIONS
const file_content_specifications = `Los archivos deben iniciar con el encabezado:
---
tags: 
- PrimerTag (los tags representan los conceptos (entidades conceptuales) que aparecen en el documento | los tags no deben tener espacios)
- SegundoTag (los tags representan los conceptos (entidades conceptuales) que aparecen en el documento | los tags no deben tener espacios)
keypoints:
- Primer punto clave, conteniendo un hecho o informacion clave mencionado en el documento
- Segundo punto clave, conteniendo un hecho o informacion clave mencionado en el documento
- Tercer punto clave, conteniendo un hecho o informacion de soporte mencionado en el documento
---

Otros detalles:
- Los keypoints deben ser atajos al contenido principal (Breve informacion factual que permita el rapido conocimiento del contenido del archivo,
    por tanto el archivo debe ir en mayor profundidad)
- Los links son de la forma [[nombre de archivo(no necesita incluir la direccion completa)|Nombre mostrado en la Nota]]
- Puede usar todos los recursos disponibles del lenguaje Markdown.`



//reAct
//prompts
export const react_starter_prompt = `Sigue las siguientes instrucciones:
1. Fijate en la estructura de archivos, particularmente en la informacion brindada en los '.lim'.
2. De acuerdo a las instrucciones en esos archivos y los archivos en el contexto, debes crear o modificar notas.
3. Debes extraer la informacion de esos archivos, no copiar/pegar lo q dicen
4. Debes revisar antes de terminar el proceso que no existan referencias fantasmas.`

//tools
export const write_description = `Usado para crear archivos markdown(.md).`;
export const write_path = `Direccion para crear o modificar el archivo.
Ejemplo de nombres (direccion) de archivo: 'arte_cubano.md' o amor/romance.md. 
No usar acentos en el titulo. Si usas un nombre de archivo existente, lo modificaras, 
usalo para rectificar errores en caso de ser necesario.
File name cannot contain any of the following characters: * " \ / < > : | ?`
export const write_content = `Contenido a ser escrito en el archivo.
Especificaciones para escribir contenido:
\`\`\`
${file_content_specifications}
\`\`\``

export const move_file_description = "Mueve un archivo de una ubicación a otra en la bóveda de Obsidian."
export const move_file_source = "Ruta actual del archivo a mover."
export const move_file_destination = "Nueva ruta destino para el archivo. (Puede usar la misma ruta base para renombrar el archivo, o moverlo a .trash para eliminarlo)"

export const get_ghosts_description = `Encuentra todos los enlaces no resueltos (ghost references)
en la bóveda de Obsidian, y los archivos donde aparecen. 
Debe ser usado al final para verificar que todo este bien conectado.

Estos pueden ser resueltos creando el archivo faltante o renombrando archivos, 
dado que el conflicto de enlace sea por errores de escritura`

export const list_files_description = `Lista la estructura de directorios y archivos (opcionalmente) a partir de una ruta raíz, similar al comando 'tree'.`
export const list_files_root = "La ruta de la carpeta raíz desde donde comenzar a listar. Usa '/' o '' para la raíz de la bóveda."
export const list_files_depth = "La profundidad máxima de recursión. 1 significa listar solo el contenido directo de rootPath."
export const list_files_includeFiles = "Si es true, incluye archivos en el listado además de las carpetas."



//hcGem
//prompts
export const gem_extract_prompt = `De los archivos A PROCESAR extrae:
- Claims
- Conceptos
- Instrucciones

y genera, para expandir la informacion que tienes:
- Queries (se busca sobre los keypoints, tags, y titulos de los archivos)`

export const gem_write_prompt = `Escriba ahora los archivos .md, siguiendo las especificaciones:
${file_content_specifications}`