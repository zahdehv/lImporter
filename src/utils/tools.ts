// --- START OF FILE src/agents/obsidianTools.ts ---

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import MyPlugin from "../main"; // Adjust path if needed
import { listFilesTree, writeFileMD } from "./filesystem";

/**
 * Creates a collection of Obsidian-specific tools for LangChain agents.
 * Each tool function will have access to the provided plugin instance.
 *
 * @param plugin - The instance of MyPlugin providing access to Obsidian API (vault, tracker, etc.).
 * @returns An object containing the configured LangChain tools.
 */
export function createObsidianTools(plugin: MyPlugin) {

    // Access vault and tracker via the passed plugin instance
    const vault = plugin.app.vault;
    const tracker = plugin.tracker;

    // --- Tool Definitions (using 'plugin' parameter instead of 'this.plugin') ---

    const writeFile = tool(async (input: { path: string, content: string }) => {
        return new Promise(async (resolve, reject) => {
            const wrt_trk = tracker.appendStep("Write File", input.path, "file-edit");
            try {
                const diff = await writeFileMD(plugin.app, input.path, input.content);
                if (diff) tracker.writeLog(diff);
                else reject(new Error("Error writing file"));
                
                wrt_trk.updateState("complete");
                tracker.appendFileByPath(input.path);
                resolve(`El llamado a funcion se completo correctamente.`);

                
            } catch (error) {
                console.error("Error preparing file write:", error);
                wrt_trk.updateState("error", error);
                reject(new Error(`Error preparing file write: ${error}`));
            }
        });
    }, {
        name: "writeFile",
        description: `Usado para crear archivos markdown(.md).`,
        schema: z.object({
            path: z.string().describe(`Direccion para crear o modificar el archivo.
Ejemplo de nombres (direccion) de archivo: 'arte_cubano.md' o amor/romance.md. 
No usar acentos en el titulo. Si usas un nombre de archivo existente, lo modificaras, 
usalo para rectificar errores en caso de ser necesario.
File name cannot contain any of the following characters: * " \ / < > : | ?`),
            content: z.string().describe(`Contenido a ser escrito en el archivo.
Los archivos deben iniciar con el encabezado:
---
tags: 
- PrimerTag (los tags representan los conceptos (entidades conceptuales) que aparecen en el documento | los tags no deben tener espacios)
- SegundoTag (los tags representan los conceptos (entidades conceptuales) que aparecen en el documento | los tags no deben tener espacios)
keypoints:
- Primer punto clave, conteniendo un hecho o informacion clave mencionado en el documento
- Segundo punto clave, conteniendo un hecho o informacion clave mencionado en el documento
- Tercer punto clave, conteniendo un hecho o informacion de soporte mencionado en el documento
---

Los links son de la forma [[nombre de archivo(no necesita incluir la direccion completa)|Nombre mostrado en la Nota]] y 
debe ser incluido en el texto, no al final ni de forma incoherente, asi como no usar un solo bracket (e.g. [example]). 
Este debe estar contenido en el texto si es posible. En caso de no serlo se puede incluir en un texto completo adicional 
que explique la relacion al archivo.

Puede usar todos los recursos disponibles del lenguaje Markdown.`),
        }),
    });

    const readFiles = tool(async (input: { paths: string[] }) => {
        return new Promise(async (resolve, reject) => {
            const read_trk = tracker.appendStep("Read Files", "Match filenames", "file-search");
           
            try {
                const allFiles = vault.getFiles();
                const matchedFiles = allFiles.filter(file => {
                    return input.paths.some(pathPattern => {
                        if (pathPattern.includes('*')) {
                            const regex = new RegExp('^' + pathPattern.replace(/\*/g, '.*') + '$');
                            return regex.test(file.path);
                        }
                        return file.path === pathPattern;
                    });
                });

                if (matchedFiles.length === 0) {
                    read_trk.updateState("pending", "No files matched the specified paths.");
                    resolve("No files matched the specified paths.");
                    return;
                }

                const fileContents = await Promise.all(matchedFiles.map(async file => {
                    try {
                        const content = await vault.read(file);
                        return {
                            path: file.path,
                            content: content,
                            size: file.stat.size,
                            lastModified: new Date(file.stat.mtime).toISOString()
                        };
                    } catch (readError) {
                        return {
                            path: file.path,
                            error: `Failed to read file: ${readError}`,
                            size: file.stat.size
                        };
                    }
                }));

                const result = fileContents.map(file => {
                    const stepTitle = `File Read: ${file.path}`;
                    if (file.error) {
                        const fl_trk = tracker.appendStep(stepTitle, "Error reading", "file-x");
                        fl_trk.updateState("error", file.error); // Use error state
                        return `File: ${file.path}\nError: ${file.error}\nSize: ${file.size} bytes\n`;
                    }
                    const fl_trk = tracker.appendStep(stepTitle, `Size: ${file.size} bytes`, "file-check");
                    fl_trk.updateState("complete"); // Mark as complete since read succeeded
                    if (plugin.settings.track_ReadFiles) tracker.appendFileByPath(file.path);
                    return `File: ${file.path}\nSize: ${file.size} bytes\nLast Modified: ${file.lastModified}\nContent:\n${file.content}\n`;
                }).join('\n---\n');

                read_trk.updateState("complete", `Read ${fileContents.length} files`);
                resolve(`Successfully read ${matchedFiles.length} file(s):\n\n${result}`);

            } catch (error) {
                read_trk.updateState("error", error);
                console.error("Error reading files:", error);
                reject(new Error(`Error reading files: ${error}`));
            }
        });
    }, {
        name: "readFiles",
        description: "Lee los contenidos de archivos en la boveda, pudiendo abrir mas de uno.",
        schema: z.object({
            paths: z.array(z.string()).describe("Lista de las direcciones de los archivos, cada una un string (e.g., ['daily/notes/*.md', 'projects/current.md']")
        }),
    });

    const moveFile = tool(async (input: { sourcePath: string, targetPath: string }) => {
        return new Promise(async (resolve, reject) => {
            const move_trk = tracker.appendStep("Move File", `${input.sourcePath} -> ${input.targetPath}`, "scissors");
            try {
                if (input.sourcePath.includes(".lim")) {
                    // throw new Error("Cannot move a .lim file");
                    move_trk.updateState("error", "Cannot move a .lim file");
                    reject(new Error("Cannot move a .lim file"));
                    return;
                }
                
                const file = vault.getAbstractFileByPath(input.sourcePath);
                if (!file) {
                    const errorMsg = `File not found: ${input.sourcePath}`;
                    move_trk.updateState("error", errorMsg);
                    reject(new Error(errorMsg));
                    return;
                }

                const targetDir = input.targetPath.split('/').slice(0, -1).join('/');
                if (targetDir && !await vault.adapter.exists(targetDir)) {
                    await vault.createFolder(targetDir);
                }

                await vault.rename(file, input.targetPath);
                move_trk.updateState("complete");
                if (plugin.settings.track_ReadFiles) tracker.appendFileByPath(input.targetPath);
                resolve(`File moved successfully from ${input.sourcePath} to ${input.targetPath}`);
            } catch (error) {
                move_trk.updateState("error", error);
                console.error("Error moving file:", error);
                reject(new Error(`Error moving file: ${error}`));
            }
        });
    }, {
        name: "moveFile",
        description: "Mueve un archivo de una ubicación a otra en la bóveda de Obsidian.",
        schema: z.object({
            sourcePath: z.string().describe("Ruta actual del archivo a mover."),
            targetPath: z.string().describe("Nueva ruta destino para el archivo. (Puede usar la misma ruta base para renombrar el archivo, o moverlo a .trash para eliminarlo)")
        }),
    });

    const getGhostReferences = tool(async () => {
        return new Promise(async (resolve, reject) => {
            const ghost_track = tracker.appendStep("Search ghosts", "Unresolved Links Check", "ghost");
            try {
                const files = vault.getMarkdownFiles();
                const ghostRefs: { sourceFile: string, unresolvedLink: string }[] = [];
                const metadataCache = plugin.app.metadataCache; // Get cache from plugin

                for (const file of files) {
                    // No need to read content if only checking links via cache
                    // const content = await vault.read(file);
                    const links = metadataCache.getFileCache(file)?.links || [];

                    for (const link of links) {
                        const linkedFile = metadataCache.getFirstLinkpathDest(link.link, file.path);
                        if (!linkedFile) {
                            ghostRefs.push({
                                sourceFile: file.path,
                                unresolvedLink: link.link
                            });
                        }
                    }
                }

                if (ghostRefs.length === 0) {
                    ghost_track.updateState("complete");
                    resolve("No se encontraron referencias no resueltas (ghost references) en la bóveda.");
                } else {
                    const result = ghostRefs.map(ref =>
                        `Archivo: ${ref.sourceFile}\nEnlace no resuelto: ${ref.unresolvedLink}`
                    ).join('\n---\n');
                    // Ghost refs found is a 'pending' state for the overall check, action might be needed
                    ghost_track.updateState("pending", `Found ${ghostRefs.length} unresolved links`);
                    resolve(`Referencias no resueltas encontradas:\n\n${result}`);
                }
            } catch (error) {
                ghost_track.updateState("error", error);
                console.error("Error searching ghost references:", error);
                reject(new Error(`Error buscando referencias no resueltas: ${error}`));
            }
        });
    }, {
        name: "getGhostReferences",
        description: `Encuentra todos los enlaces no resueltos (ghost references)
en la bóveda de Obsidian, y los archivos donde aparecen. 
Debe ser usado al final para verificar que todo este bien conectado.

Estos pueden ser resueltos creando el archivo faltante o renombrando archivos, 
dado que el conflicto de enlace sea por errores de escritura`,
        schema: z.object({}) // No input arguments needed
    });

    const listFiles = tool(async (input: { rootPath: string, depth: number, includeFiles: boolean }) => {
        return new Promise(async (resolve, reject) => {
            const list_trk = tracker.appendStep("List Directory", `Path: ${input.rootPath}, Depth: ${input.depth}`, "folder-tree");
            try {
                const { rootPath, depth, includeFiles } = input;
                
                const finalResult = await listFilesTree(plugin.app, rootPath, depth, includeFiles, true, 23);
                list_trk.updateState("complete", `Listed structure for ${rootPath}`);
                tracker.writeLog(finalResult);
                resolve(finalResult);

            } catch (error) {
                list_trk.updateState("error", error);
                console.error("Error in listFiles tool:", error);
                reject(new Error(`Error listing directory structure: ${error.message || error}`));
            }
        });
    }, {
        name: "listFiles",
        description: `Lista la estructura de directorios y archivos (opcionalmente) a partir de una ruta raíz, similar al comando 'tree'.`,
        schema: z.object({
            rootPath: z.string().describe("La ruta de la carpeta raíz desde donde comenzar a listar. Usa '/' o '' para la raíz de la bóveda."),
            depth: z.number().int().min(1).describe("La profundidad máxima de recursión. 1 significa listar solo el contenido directo de rootPath."),
            includeFiles: z.boolean().describe("Si es true, incluye archivos en el listado además de las carpetas.")
        }),
    });

    // --- Return the collection of tools ---
    return {
        writeFile,
        readFiles, // Change to query
        moveFile,
        getGhostReferences,
        listFiles,
    };
}

// --- END OF FILE src/agents/obsidianTools.ts ---