// --- START OF FILE src/agents/obsidianTools.ts ---

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as Diff from 'diff';
import MyPlugin from "../../main"; // Adjust path if needed
import {
    write_file_description,
    write_file_path_description,
    write_file_content_description,
    prompt_ghost_references
       } from "src/utils/promp"; // Adjust path if needed
import { TAbstractFile, TFolder, Vault } from "obsidian"; // Import necessary Obsidian types

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
                const prev = vault.getFiles().map((a) => a.path).sort();
                const contentWithNewlines = input.content.replace(/\\n/g, '\n');
                const folderPath = input.path.split('/').slice(0, -1).join('/');
                const filePath = input.path;

                if (folderPath) {
                    const folderExists = await vault.adapter.exists(folderPath);
                    if (!folderExists) {
                        await vault.createFolder(folderPath);
                    }
                }

                const fileExists = await vault.adapter.exists(filePath);
                // Removed unused existingContent and actionc for now
                // let existingContent = '';
                // let actionc: "change" | "create" | "delete" = 'create';
                // if (fileExists) {
                //     existingContent = await vault.adapter.read(filePath);
                //     actionc = 'change';
                // }

                try {
                    await vault.adapter.write(filePath, contentWithNewlines);

                    const post = vault.getFiles().map((a) => a.path).sort();
                    const difff = Diff.diffArrays(prev, post);

                    let files = "";
                    for (let i = 0; i < difff.length; i++) {
                        let suffix = "";
                        if (difff[i].removed) { suffix = "(file removed)"; }
                        else if (difff[i].added) { suffix = "(file added)"; }
                        for (let j = 0; j < difff[i].value.length; j++) { files += `- ${difff[i].value[j]} ${suffix}\n`; }
                    }
                    wrt_trk.updateState("complete");
                    resolve(`El llamado a funcion se completo correctamente.\nResultado:\n${files}`);

                } catch (writeError) {
                    wrt_trk.updateState("error", writeError);
                    reject(new Error(`Error al escribir archivo: ${writeError}`));
                }
            } catch (error) {
                console.error("Error preparing file write:", error);
                wrt_trk.updateState("error", error);
                reject(new Error(`Error preparing file write: ${error}`));
            }
        });
    }, {
        name: "writeFile",
        description: write_file_description,
        schema: z.object({
            path: z.string().describe(write_file_path_description),
            content: z.string().describe(write_file_content_description),
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
        description: prompt_ghost_references,
        schema: z.object({}) // No input arguments needed
    });

    const listFiles = tool(async (input: { rootPath: string, depth: number, includeFiles: boolean }) => {
        return new Promise(async (resolve, reject) => {
            const list_trk = tracker.appendStep("List Directory", `Path: ${input.rootPath}, Depth: ${input.depth}`, "folder-tree");
            try {
                const { rootPath, depth, includeFiles } = input;
                let normalizedPath = rootPath.trim();
                if (normalizedPath === '/' || normalizedPath === '') {
                    normalizedPath = '/';
                } else {
                    if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
                        normalizedPath = normalizedPath.slice(0, -1);
                    }
                }

                const rootNode = vault.getAbstractFileByPath(normalizedPath);

                if (!rootNode) {
                    const errorMsg = `Root path not found: ${normalizedPath}`;
                    list_trk.updateState("error", errorMsg);
                    reject(new Error(errorMsg));
                    return;
                }

                if (!(rootNode instanceof TFolder)) {
                    const errorMsg = `Root path is not a folder: ${normalizedPath}`;
                    list_trk.updateState("error", errorMsg);
                    reject(new Error(errorMsg));
                    return;
                }

                let treeOutputString = `${normalizedPath === '/' ? '.' : rootNode.name}\n`;

                const buildTree = async (folder: TFolder, currentDepth: number, prefix: string) => {
                    if (currentDepth > depth) { return; }

                    const children = folder.children.sort((a, b) => {
                        const aIsFolder = a instanceof TFolder;
                        const bIsFolder = b instanceof TFolder;
                        if (aIsFolder !== bIsFolder) { return aIsFolder ? -1 : 1; }
                        return a.name.localeCompare(b.name);
                    });

                    const itemsToList = includeFiles ? children : children.filter(child => child instanceof TFolder);

                    for (let i = 0; i < itemsToList.length; i++) {
                        const child = itemsToList[i];
                        const isLast = i === itemsToList.length - 1;
                        const connector = isLast ? "└───" : "├───";
                        const childPrefix = prefix + (isLast ? "    " : "│   ");
                        treeOutputString += `${prefix}${connector}${child.name}\n`;
                        if (child instanceof TFolder) {
                            await buildTree(child, currentDepth + 1, childPrefix);
                        }
                    }
                };

                await buildTree(rootNode, 1, "");

                const finalResult = `Directory structure for '${normalizedPath}' (depth ${depth}, ${includeFiles ? 'including' : 'excluding'} files):\n\`\`\`\n${treeOutputString}\`\`\``;
                console.log("listFiles Tool Output:\n", finalResult); // Keep verification log
                list_trk.updateState("complete", `Listed structure for ${normalizedPath}`);
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
        readFiles,
        moveFile,
        getGhostReferences,
        listFiles,
    };
}

// --- END OF FILE src/agents/obsidianTools.ts ---