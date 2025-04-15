import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as Diff from 'diff';

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ToolNode } from '@langchain/langgraph/prebuilt';
import {
    StateGraph,
    MessagesAnnotation,
    END,
    START
} from "@langchain/langgraph/web";
import MyPlugin from "../main";
import { write_file_description, write_file_path_description, write_file_content_description } from "src/Utilities/promp";

export class reActAgentLLM {
    public app: any;
    private plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
      this.plugin = plugin;
      // WRITEFILE FUNCTION
    const writeFile = tool(async (input) => {
    //Implement here
    return new Promise(async (resolve, reject) => {
      // new Notice(`Creating file '${input.path}'`);
      console.log(`Creating file '${input.path}'`);
                try {
                    const prev = this.plugin.app.vault.getFiles().map((a)=> a.path).sort();
                    
                    const contentWithNewlines = input.content.replace(/\\n/g, '\n');
                    const folderPath = input.path.split('/').slice(0, -1).join('/');
                    const filePath = input.path;
        
                    if (folderPath) {
                        const folderExists = await this.plugin.app.vault.adapter.exists(folderPath);
                        if (!folderExists) {
                            await this.plugin.app.vault.createFolder(folderPath);
                        }
                    }
                    
                    let existingContent = '';
                    let actionc: "change" | "create" | "delete" = 'create';
                    const fileExists = await this.plugin.app.vault.adapter.exists(filePath);
                    if (fileExists) {
                      existingContent = await this.plugin.app.vault.adapter.read(filePath);
                      actionc = 'change';
                    }
                    
                    try {
                      await this.plugin.app.vault.adapter.write(filePath, contentWithNewlines);
                      
                      //here post
                      const post = this.plugin.app.vault.getFiles().map((a)=> a.path).sort();
                      const difff = Diff.diffArrays(prev, post)
                    
                    let files = ""
                    for (let i = 0; i < difff.length; i++) {
                        let suffix = "";
                        if (difff[i].removed) {suffix = "(file removed)";}
                        else if (difff[i].added) {suffix = "(file added)";}
                        for (let j = 0; j < difff[i].value.length; j++) { files+= `- ${difff[i].value[j]} ${suffix}\n`; }
                    }
                    console.log(`${files}`);

                      resolve(`El llamado a funcion se completo correctamente.
Resultado:
${files}
`);

                  } catch (writeError) {
                      reject(new Error(`Error al escribir archivo: ${writeError}`));
                  }
                } catch (error) {
                    console.log(error);
                }
            });

    }, {
        name: "writeFile",
        description:
          write_file_description,
        schema: z.object({
          path: z.string().describe(write_file_path_description),
          content: z.string().describe(write_file_content_description),
        }),
      });

      const readFiles = tool(async (input) => {
        return new Promise(async (resolve, reject) => {
          console.log("Reading some files");
          console.log(input.paths);
            try {
                console.log(`Reading files matching '${input.paths}'`);
                
                // Get all files in vault
                const allFiles = this.plugin.app.vault.getFiles();
                
                // Filter files based on input paths (supports glob patterns)
                const matchedFiles = allFiles.filter(file => {
                    return input.paths.some(pathPattern => {
                        // Simple glob pattern matching (can be enhanced with a proper library if needed)
                        if (pathPattern.includes('*')) {
                            const regex = new RegExp('^' + pathPattern.replace(/\*/g, '.*') + '$');
                            return regex.test(file.path);
                        }
                        return file.path === pathPattern;
                    });
                });
    
                if (matchedFiles.length === 0) {
                    resolve("No files matched the specified paths.");
                    return;
                }
    
                // Read contents of all matched files
                const fileContents = await Promise.all(matchedFiles.map(async file => {
                    try {
                        const content = await this.plugin.app.vault.read(file);
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
    
                // Format the output
                const result = fileContents.map(file => {
                    if (file.error) {
                        return `File: ${file.path}\nError: ${file.error}\nSize: ${file.size} bytes\n`;
                    }
                    return `File: ${file.path}\nSize: ${file.size} bytes\nLast Modified: ${file.lastModified}\nContent:\n${file.content}\n`;
                }).join('\n---\n');
    
                resolve(`Successfully read ${matchedFiles.length} file(s):\n\n${result}`);
    
            } catch (error) {
                console.error(error);
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
             try {
                 const file = this.plugin.app.vault.getAbstractFileByPath(input.sourcePath);
                 if (!file) {
                     reject(new Error(`File not found: ${input.sourcePath}`));
                     return;
                 }
     
                 // Create target directory if it doesn't exist
                 const targetDir = input.targetPath.split('/').slice(0, -1).join('/');
                 if (targetDir && !await this.plugin.app.vault.adapter.exists(targetDir)) {
                     await this.plugin.app.vault.createFolder(targetDir);
                 }
     
                 await this.plugin.app.vault.rename(file, input.targetPath);
                 resolve(`File moved successfully from ${input.sourcePath} to ${input.targetPath}`);
             } catch (error) {
                 reject(new Error(`Error moving file: ${error}`));
             }
         });
     }, {
         name: "moveFile",
         description: "Mueve un archivo de una ubicación a otra en la bóveda de Obsidian.",
         schema: z.object({
             sourcePath: z.string().describe("Ruta actual del archivo a mover."),
             targetPath: z.string().describe("Nueva ruta destino para el archivo.")
         }),
     });
     
     const renameFile = tool(async (input: { path: string, newName: string }) => {
         return new Promise(async (resolve, reject) => {
             try {
                 const file = this.plugin.app.vault.getAbstractFileByPath(input.path);
                 if (!file) {
                     reject(new Error(`File not found: ${input.path}`));
                     return;
                 }
     
                 // Get the directory path and construct the new full path
                 const dirPath = input.path.split('/').slice(0, -1).join('/');
                 const newPath = dirPath ? `${dirPath}/${input.newName}` : input.newName;
                 
                 // Check if target already exists
                 const targetExists = await this.plugin.app.vault.adapter.exists(newPath);
                 if (targetExists) {
                     reject(new Error(`Cannot rename: A file already exists at ${newPath}`));
                     return;
                 }
     
                 await this.plugin.app.vault.rename(file, newPath);
                 resolve(`File renamed successfully from ${input.path} to ${newPath}`);
             } catch (error) {
                 reject(new Error(`Error renaming file: ${error}`));
             }
         });
     }, {
         name: "renameFile",
         description: "Renombra un archivo en la bóveda de Obsidian manteniendo su ubicación.",
         schema: z.object({
             path: z.string().describe("Ruta completa del archivo a renombrar."),
             newName: z.string().describe("Nuevo nombre del archivo (incluyendo extensión).")
         }),
     });
     
     const getGhostReferences = tool(async () => {
         return new Promise(async (resolve, reject) => {
          console.log("GHOST");
          console.log("GHOST");
          console.log("GHOST");
             try {
                 const files = this.plugin.app.vault.getMarkdownFiles();
                 const ghostRefs: {sourceFile: string, unresolvedLink: string}[] = [];
     
                 for (const file of files) {
                     const content = await this.plugin.app.vault.read(file);
                     const links = this.plugin.app.metadataCache.getFileCache(file)?.links || [];
                     
                     for (const link of links) {
                         const linkedFile = this.plugin.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                         if (!linkedFile) {
                             ghostRefs.push({
                                 sourceFile: file.path,
                                 unresolvedLink: link.link
                             });
                         }
                     }
                 }
     
                 if (ghostRefs.length === 0) {
                     resolve("No se encontraron referencias no resueltas (ghost references) en la bóveda.");
                 } else {
                     const result = ghostRefs.map(ref => 
                         `Archivo: ${ref.sourceFile}\nEnlace no resuelto: ${ref.unresolvedLink}`
                     ).join('\n---\n');
                     resolve(`Referencias no resueltas encontradas:\n\n${result}`);
                 }
             } catch (error) {
                 reject(new Error(`Error buscando referencias no resueltas: ${error}`));
             }
         });
     }, {
         name: "getGhostReferences",
         description: "Encuentra todos los enlaces no resueltos (ghost references) en la bóveda de Obsidian y los archivos donde aparecen. Debe ser usado al final para verificar que todo este bien conectado.",
         schema: z.object({})
     });

     const obs_tools = [writeFile, readFiles, moveFile, renameFile, getGhostReferences];
      
     const llm = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature: 0,
        maxRetries: 4,
        apiKey: plugin.settings.GOOGLE_API_KEY,
        // other params...
      }).bindTools(obs_tools);
      


const toolNodeForGraph = new ToolNode(obs_tools);
  
  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
    const { messages } = state;
    const lastMessage: any = messages[messages.length - 1];
    console.log("LASTMESSAGE");
    console.log(lastMessage);
    if ("tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls?.length) {
        return "tools";
    }
    return END;
  }
  
  const callModel = async (state: typeof MessagesAnnotation.State) => {
    console.log("ENTERED CALLMODEL");
    const { messages } = state;
    const response = await llm.invoke(messages);
    return { messages: response };
  }
  
  
  const workflow = new StateGraph(MessagesAnnotation)
    // Define the two nodes we will cycle between
    .addNode("agent", callModel)
    .addNode("tools", toolNodeForGraph)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, ["tools", END])
    .addEdge("tools", "agent");
  
  this.app = workflow.compile()

    }
    
 }