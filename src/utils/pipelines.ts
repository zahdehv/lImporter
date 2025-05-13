import AutoFilePlugin from "src/main";
import { FileItem } from "src/utils/fileUploader";
import { preProcessor } from "./preprocessInput";
import { listFilesTree } from "src/utils/fileLister";
import { reActAgent } from "src/agents/reAct";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ZodObject, ZodTypeAny } from "zod";
import { createObsidianTools } from "./tools";



const buildReactParameterized = (plugin: AutoFilePlugin, model: string, tools: DynamicStructuredTool<ZodObject<{}, "strip", ZodTypeAny, {}, {}>>[]): (prompt: string, files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const reAct = new reActAgent(plugin, model, tools);
    const preprocessor = new preProcessor(plugin);

    const call = async (prompt: string, files: FileItem[], signal: AbortSignal) => {
        const msg = await preprocessor.genPrompt(files, prompt, signal);
        const tree = await listFilesTree(plugin.app, "", 3, true, true, 23)
        msg.push({ type: 'text', text: tree });
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
    
    return call;
}

const buildReact = (plugin: AutoFilePlugin, model: string): (prompt: string, files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const {writeFile, readFiles, moveFile, getGhostReferences, listFiles} = createObsidianTools(plugin);
    const agent_tools = [writeFile, readFiles, moveFile, getGhostReferences, listFiles];
    return buildReactParameterized(plugin, model, agent_tools)
}

export const models = [
            {id: "gemini-2.5-flash-preview-04-17"},
            {id: "gemini-2.0-flash"},
            {id: "gemini-2.0-flash-lite"},
        ]

export const pipelineOptions = [
{   
id: 'react', 
name: 'reAct Default',
defaultPrompt: `Sigue las siguientes instrucciones:
1. Fijate en la estructura de archivos, particularmente en la informacion brindada en los '.lim'.
2. De acuerdo a las instrucciones en esos archivos y los archivos en el contexto, debes crear o modificar notas.
3. Debes extraer la informacion de esos archivos, no copiar/pegar lo q dicen
4. Debes revisar antes de terminar el proceso que no existan referencias fantasmas.`, 
buildPipeline: buildReact 
},
            
            
            
            
            // { id: 'lite_direct', name: 'Lite Agent', pipeline: () => new LitePipe(this.plugin) },
            // { id: 'direct_call', name: 'Direct Call', pipeline: () => new DirectPipe(this.plugin) },
            // { id: 'claim_instructions', name: 'Claim Instructions', pipeline: () => new ClaimInstPipe(this.plugin) },
            // { id: 'lite_test', name: 'Lite TEST', pipeline: () => new LiteTESTPipe(this.plugin) },
];