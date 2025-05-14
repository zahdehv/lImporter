import AutoFilePlugin from "src/main";
import { FileItem } from "src/utils/uploader";
import { createCustomGeminiPreprocessor, createGeminiPreprocessor, createLangGraphPreprocessor } from "./preprocessors";
import { listFilesTree, simpleQueryVault, writeFileMD } from "src/utils/filesystem";
import { reActAgent } from "src/agents/reAct";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ZodObject, ZodTypeAny } from "zod";
import { createObsidianTools } from "./tools";
import { GoogleGenAI, Part, Type } from "@google/genai";

const buildReactParameterized = (plugin: AutoFilePlugin, model: string, tools: DynamicStructuredTool<ZodObject<{}, "strip", ZodTypeAny, {}, {}>>[]): (prompt: string, files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const reAct = new reActAgent(plugin, model, tools);
    const preprocessor = createLangGraphPreprocessor(plugin);

    const sendMessage = async (prompt: string, files: FileItem[], signal: AbortSignal) => {
        const msg = await preprocessor(files, prompt, signal);
        if (msg && !signal.aborted) {
            console.log("CALLING AGENT WITH MESSAGE:",msg);
            const finalState = await reAct.agent.invoke({
                messages: [{ role: "user", content: msg }],
            }, { recursionLimit: 113, signal });
                    
            const answer = finalState.messages[finalState.messages.length - 1].content;
            const answerStep = plugin.tracker.appendStep(
                `Answer`, 
                answer, 
                "bot-message-square"
            );
            answerStep.updateState("pending");
        }
    }
    
    return sendMessage;
}

const buildReact = (plugin: AutoFilePlugin, model: string): (prompt: string, files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const {writeFile, readFiles, moveFile, getGhostReferences, listFiles} = createObsidianTools(plugin);
    const agent_tools = [writeFile, readFiles, moveFile, getGhostReferences, listFiles];
    return buildReactParameterized(plugin, model, agent_tools)
}

const buildGemini = (plugin: AutoFilePlugin, model: string): (prompt: string, files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const ai = new GoogleGenAI({apiKey: plugin.settings.GOOGLE_API_KEY});
    const chat = ai.chats.create({model: model});
    const preprocessor = createGeminiPreprocessor(plugin, ai);
    const sendMessage = async (prompt: string, files: FileItem[], signal: AbortSignal) => {
        
        const t_preprocessing = plugin.tracker.appendStep('Preprocessing File', "Uploading files to cloud...", 'upload');
        const t_extraction = plugin.tracker.appendStep('Data Extraction', "Claim extraction process...", 'scroll-text', 'pending');
        const t_query = plugin.tracker.appendStep('Query Process', "Vault querying process...", 'text-search', 'pending');
        const t_write = plugin.tracker.appendStep('File writing', "Write files...", 'file-diff', 'pending');
        
        const s = await preprocessor(files, prompt, signal);
        
        //COLD START DATA
        const tree = await listFilesTree(plugin.app, "", 3, true, true, 23);
        const p: (Part|string)[] = [{text: tree}];
        
        const msg = p.concat(s);
        plugin.tracker.writeLog(`## START DATA
\`\`\`json
${JSON.stringify(msg)}
\`\`\``);

        t_preprocessing.updateState('complete', "Files preprocessed!");
        if (msg && !signal.aborted) {
            console.log("CALLING AGENT WITH MESSAGE:",msg);
            
        // Data extraction
        t_extraction.updateState('in-progress', 'Extracting data...');

        const data = await chat.sendMessage({message: msg, 
            config: {
                abortSignal: signal,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    required: ["instructions", "claims", "concepts", "queries"],
                    properties: {
                      instructions: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.STRING,
                        },
                      },
                      claims: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.STRING,
                        },
                      },
                      concepts: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.STRING,
                        },
                      },
                      queries: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.STRING,
                        },
                      },
                    },
                  },                            
            }});
        if (data.text) {
            plugin.tracker.writeLog(` ## Extraction response
\`\`\`json
${data.text}
\`\`\``);
            const data_json = JSON.parse(data.text);
            t_extraction.updateState('complete', 'Data extracted!');
            
            // Querying
            t_query.updateState('in-progress', 'Computing queries...');
            const queries: string[] = data_json.queries;
            const results = [];
            for (let index = 0; index < queries.length; index++) {
                const query = queries[index];
                results.push(await simpleQueryVault(plugin.app,query));
            }
            const fileContents = results.join("\n");
            plugin.tracker.writeLog(` ## Queries result
\`\`\`xml
${fileContents}
\`\`\``);
            t_query.updateState('complete', 'Queries executed!')

            // Notes creation
        t_write.updateState('in-progress', 'Writing files...')
        const r_write = await chat.sendMessage({message: `
Los queries resultaron en los archivos:
\`\`\`
${fileContents}
\`\`\`

Escribe ahora el nuevo archivo, que debe ser .md y tener el formato correcto:
            
Los archivos deben iniciar con el encabezado:
---
tags: 
- PrimerTag (los tags representan los conceptos (entidades conceptuales) que aparecen en el documento | los tags no deben tener espacios ni ':', ni '@')
- SegundoTag (los tags representan los conceptos (entidades conceptuales) que aparecen en el documento | los tags no deben tener espacios ni ':', ni '@')
keypoints:
- Primer punto clave, conteniendo un hecho o informacion clave mencionado en el documento (No pueden contener ':')
- Segundo punto clave, conteniendo un hecho o informacion clave mencionado en el documento (No pueden contener ':')
- Tercer punto clave, conteniendo un hecho o informacion de soporte mencionado en el documento (No pueden contener ':')
---

{AQUI VA EL CONTENIDO, LA IDEA ES QUE LOS PUNTOS CLAVE RESUMAN LA INFORMACION QUE VA AQUI (Consecuentemente, esta parte debe profundizar aun mas)}

`, 
config: {abortSignal: signal,
    responseMimeType: 'application/json',
    responseSchema: {
        type: Type.OBJECT,
        required: ["content", "path"],
        properties: {
          content: {
            type: Type.STRING,
          },
          path: {
            type: Type.STRING,
          },
        },
      },                    
    }});

        const write = JSON.parse(r_write.text? r_write.text: "{'path':'', content: ''}");
        await writeFileMD(plugin.app, write.path, write.content);
        plugin.tracker.appendFileByPath(write.path);
        
        t_write.updateState('complete', `Wrote 1 file!`)
        }
        else t_extraction.updateState('error', 'Data not found!');
        
        }
    }
    
    return sendMessage;
}

export const models = [
    {id: "gemini-2.0-flash-lite"},
    {id: "gemini-2.0-flash"},
    {id: "gemini-2.5-flash-preview-04-17"},
        ]

export const pipelineOptions = [
{   
id: 'react', 
name: 'reAct KE',
defaultPrompt: `Sigue las siguientes instrucciones:
1. Fijate en la estructura de archivos, particularmente en la informacion brindada en los '.lim'.
2. De acuerdo a las instrucciones en esos archivos y los archivos en el contexto, debes crear o modificar notas.
3. Debes extraer la informacion de esos archivos, no copiar/pegar lo q dicen
4. Debes revisar antes de terminar el proceso que no existan referencias fantasmas.`, 
buildPipeline: buildReact 
},
{   
id: 'geminiP1', 
name: 'Gemini KE',
defaultPrompt: `El usuario te ha ofrecido informacion de una boveda en Obsidian, y un conjunto de archivos a procesar, debes:
1. Extraer instrucciones:
    - De los archivos '.lim' en la jerarquia de archivos (tree view)
    - De los archivos, potencialmente algun audio contenga instrucciones
2. Extraer CLAIMS que aparezcan en los archivos
3. Extraer conceptos que aparezcan en los claims, que potencialmente vienen desde los archivos
4. Construir un conjunto de queries (son texto, sin usar ningun operador logico)`, 
buildPipeline: buildGemini 
},
];