// export const lim_default_prompt = 

// // preproc prompt
// export const direct_default_prompt = `Crea una jerarquia de notas basado en el contenido.`;

// export const prompt_get_claims_instructions = `Dado el archivo, debes hacer dos cosas:
// 1. Extraer los hechos e informaciones diferentes brindadas:
//   - Estos deben estar enumerados en una lista (de markdown) que debe estar entre tags <claims></claims>.
//   - Deben ser obtenidos de la fuente original.
//   - Deben cubrir en conjunto la mayor parte de la información original posible.
//   - Cada uno debe contar con el contexto suficiente para ser comprendido por sí solo. En caso de requerir mayor contexto, este debe ser incluido entre [[corchetes, el contexto iría aquí]].
//   - No deben contener ambigüedad.

// 2. Crear una lista de instrucciones que use el contexto anteriormente brindado, con el fin de generar un conjunto de notas en una bóveda de Obsidian:
//   - Deben estar enumeradas en una lista (de markdown) entre tags <instructions></instructions>.
//   - Las instrucciones deben ser tan explícitas como sea posible sobre:
//     * Jerarquía y contenido de las notas
//     * Qué contenido incluir
//     * Formato del archivo
//     * Relaciones entre las notas
//   - El modelo no debe tener dudas sobre qué hacer (garantizado por claridad y completitud).
//   - Si la fuente original contiene instrucciones (ej: audio), tómalas en cuenta al formularlas.
//   - Si no contiene instrucciones, simplemente guarda la información enunciada (por defecto siempre se debe guardar la información necesaria).
//   - Si la información es muy extensa, divídela en archivos más pequeños que sigan una intencionalidad.
//   - Para archivos muy cortos (ej: un solo hecho), considera incluirlo en otro archivo.
//   - Se propone el estilo de toma de notas Zettelkasten para Obsidian.
// La cantidad de notas no debe exceder 4 o 5 notas, y debe incluirse la especificacion de las relaciones para evitar la posterior ampliacion por el agente.
// `;