export const prompt_get_claims_instructions = `Dado el archivo, debes hacer dos cosas:
1. Extraer los hechos e informaciones diferentes brindadas:
  - estos deben estar enumerados en una lista (de markdown) que debe estar entre tags <claims></claims>.
  - estos deben ser obtenidos de la fuente original
  - estos deben entre todos cubrir la mayor parte de la informacion original como sea posible.
  - estos deben cada uno contar con el contexto suficiente para ser comprendido por si solo, en caso de requerir de mayor contexto, este debe ser incluido entre [corchetes, el contexto iria aqui].
  - estos no deben contener ambiguedad.
  2. Crear una lista de instrucciones que use el contexto anteriormente brindado, con el fin de generar un conjunto de notas en una boveda de obsidian:
  - estas deben estar enumeradas en una lista (de markdown) que debe estar entre tags <instructions></instructions>.
  - Las instrucciones deben ser tan explicitas como sea posible sobre la jerarquia y contenido de las notas.
  - Las instrucciones deben especificar sobre que contenido incluir, que formato darle al archivo, y que relaciones hay entre las notas.
  - El modelo que reciba las instrucciones no debe tener ninguna duda sobre que debe hacer, garantizado por la claridad y completitud de las instrucciones.
  - En caso de que la fuente original contenga instrucciones (ejemplo, el audio), debes tomar estas en cuenta a la hora de formularlas.
  - En caso de que no contenga instrucciones, las instrucciones deben ser guardar la informacion enunciada simplemente. Por defecto siempre se debe guardar la informacion necesaria.
  - Si la informacion es muy extensa deben dividirse en archivos mas pequenos, que sigan una intensionalidad.
  - El caso contrario, archivos muy cortos (por ejemplo para dar un solo fact), se puede considerar el hecho dentro de otro archivo.
  - Se propone el estilo de toma de notas zettelkasten para Obsidian.
`;