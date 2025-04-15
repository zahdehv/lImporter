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
import { Notice } from "obsidian";

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
          `Usado para crear archivos markdown(.md). Ejemplo de nombres (direccion) de archivo: 'arte_cubano.md' o amor/romance.md. No usar acentos. Si usas un nombre de archivo existente, lo modificaras, usalo para rectificar errores en caso de ser necesario.
Los archivos deben iniciar con el encabezado:
---
Title: "Here goes the Title"
tags: 
- tag1 (los tags no deben tener espacios)
- tag2
aliases:
- alias1
- alias2
---

Los links son de la forma [[nombre de archivo(no necesita incluir la direccion completa)|Nombre mostrado en la Nota]] y debe ser incluido en el texto, no al final ni de forma incoherente.

Puede usar todos los recursos disponibles del lenguaje Markdown.

File name cannot contain any of the following characters: * " \ / < > : | ?
`,
        schema: z.object({
          path: z.string().describe("Direccion para crear o modificar el archivo."),
          content: z.string().describe("Contenido a ser escrito en el archivo."),
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
    
     const obs_tools = [writeFile, readFiles];

      
      const llm = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature: 0,
        maxRetries: 4,
        apiKey: plugin.settings.GOOGLE_API_KEY,
        // other params...
      }).bindTools(obs_tools);
      

const toolNodeForGraph = new ToolNode(obs_tools)
  
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