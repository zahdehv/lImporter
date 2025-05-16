import AutoFilePlugin from "src/main";
import { createGeminiPreprocessor, createLangGraphPreprocessor, Rmedia, Rtext } from "../utils/preprocessors";
import { listFilesTree, writeFileMD } from "src/utils/filesystem";
import { createReActAgent } from "src/agents/reAct";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ZodObject, ZodTypeAny } from "zod";
import { createObsidianTools } from "src/agents/reAct";
import { GoogleGenAI, Part, Type } from "@google/genai";
import { FileItem } from "src/utils/filesystem";
import { react_starter_prompt } from "./promp";
import { createPromptChainItems } from "./promptChain";

const buildReactParameterized = (plugin: AutoFilePlugin, model: string, tools: DynamicStructuredTool<ZodObject<{}, "strip", ZodTypeAny, {}, {}>>[]): (files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const reAct = createReActAgent(plugin, model, tools);
    const ai = new GoogleGenAI({apiKey: plugin.settings.GOOGLE_API_KEY});
    const preprocessor = createLangGraphPreprocessor(plugin, ai);

    const sendMessage = async (files: FileItem[], signal: AbortSignal) => {
        console.warn("entered send");
        const tree = await listFilesTree(plugin.app, "", 3, true, true, 23)
        console.warn("listed tree");
        const p: (Rtext|Rmedia)[] = [{ type: 'text', text: tree }]
        console.warn("listed call prep");
        const s = await preprocessor(files, signal);
        console.warn("end prep");
        
        const msg = p.concat(s);
        msg.push({ type: 'text', text: react_starter_prompt });
        
        if (msg) { //} && !signal.aborted) {
            console.warn("call react");
            const finalState = await reAct.invoke({
                messages: [{ role: "user", content: msg }],
            }, { recursionLimit: 113, signal });
            console.warn("end react");
                    
            const answer:any = finalState.messages[finalState.messages.length - 1].content;
            console.log('## answer\n\n'+ answer);
        }
    }
    
    return sendMessage;
}

const buildReact = (plugin: AutoFilePlugin, model: string): (files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const {writeFile, moveFile, getGhostReferences, listFiles} = createObsidianTools(plugin);
    const agent_tools = [writeFile, moveFile, getGhostReferences, listFiles];
    return buildReactParameterized(plugin, model, agent_tools)
}

const buildGemini = (plugin: AutoFilePlugin, model: string): (files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const ai = new GoogleGenAI({apiKey: plugin.settings.GOOGLE_API_KEY});
    const preprocessor = createGeminiPreprocessor(plugin, ai);
    
    const sendMessage = async (files: FileItem[], signal: AbortSignal) => {
        const chat = ai.chats.create({model: model});

        const shackles = createPromptChainItems(plugin, chat, signal);
        
        const t_preprocessing = plugin.tracker.appendStep('Preprocess Files', "Upload files and prepare messages...", 'upload');
        const t_extraction = plugin.tracker.appendStep('Data Extraction', "Extract claims, contepts, etc...", 'scroll-text', 'pending');
        const t_query = plugin.tracker.appendStep('Query Vault', "Fuzzy search over the vault...", 'text-search', 'pending');
        const t_write = plugin.tracker.appendStep('File writing', "Write files...", 'file-diff', 'pending');
        
        //Preprocess
        const s = await preprocessor(files, signal);
        const tree = await listFilesTree(plugin.app, "", 3, true, true, 23);
        const p: (Part|string)[] = [{text: tree}];
        const msg = p.concat(s);
        if (!msg) throw new Error("Error preprocessing...");
        console.log("### Called model with:\n\n", msg)
        t_preprocessing.updateState("complete");


        //Extract
        t_extraction.updateState('in-progress');
        const extracted_json = await shackles.extract(msg);
        if (!extracted_json) throw new Error("Error extracting data...");
        t_extraction.updateState('complete');
        
        //Query
        t_query.updateState('in-progress');
        const queries = extracted_json.queries;
        const readContents = await shackles.query(queries);
        console.log(`### query results
\`\`\`json
${readContents}
\`\`\``);
        t_query.updateState('complete');
        
        //Write
        t_write.updateState('in-progress');
        const wrote = await shackles.write([`Query results:\n\n${readContents}`])
        if (!wrote) throw new Error("Error writing files");
        t_write.updateState("complete");
    }
    
    return sendMessage;
}

export const models = [
    {id: "gemini-2.0-flash"},
    {id: "gemini-2.0-flash-lite"},
    {id: "gemini-2.5-flash-preview-04-17"},
        ];

export const pipelineOptions = [
{   
id: 'gemini_ke', 
name: 'Gemini KE',
buildPipeline: buildGemini 
},
{
id: 'react_ke', 
name: 'reAct KE',
buildPipeline: buildReact 
},
];