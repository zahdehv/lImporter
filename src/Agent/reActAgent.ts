import { tool } from "@langchain/core/tools";
import { z } from "zod";

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
      new Notice(`Creating file '${input.path}'`);
                try {
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

                      resolve(`El llamado a funcion se completo correctamente, creandose el archivo ${filePath}.`);

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
          "Usado para crear archivos markdown(.md). Ejemplo de nombres (direccion) de archivo: 'arte_cubano.md' o amor/romance.md. No usar acentos. Si usas un nombre de archivo existente, lo modificaras, usalo para rectificar errores en caso de ser necesario.",
        schema: z.object({
          path: z.string().describe("Direccion para crear o modificar el archivo."),
          content: z.string().describe("Contenido a ser escrito en el archivo."),
        }),
      });
    
     const obs_tools = [writeFile];

      
      const llm = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature: 0.2,
        maxRetries: 2,
        apiKey: plugin.settings.GOOGLE_API_KEY,
        // other params...
      }).bindTools(obs_tools);
      

const toolNodeForGraph = new ToolNode(obs_tools)
  
  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
    const { messages } = state;
    const lastMessage: any = messages[messages.length - 1];
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
  
      


  
  
  