import lImporterPlugin from "src/main";
import { createMessageslIm, geminiFormatters, langGraphFormatters, Rmedia, Rtext } from "../utils/messages";
import { createObsidianTools, createReActAgent } from "src/agents/reAct";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ZodObject, ZodTypeAny } from "zod";
import { GoogleGenAI, Part, PartListUnion, PartUnion } from "@google/genai";
import { FileItem, listFilesTree } from "src/utils/files";
import { react_starter_prompt } from "./promp";
import { createPromptChainItems } from "./promptChain";

const buildPromptChain = (plugin: lImporterPlugin, model: string): (files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const ai = new GoogleGenAI({apiKey: plugin.settings.GOOGLE_API_KEY});
    // const preprocessor = createPromptChainMessages(plugin, ai);
    const preprocessor = createMessageslIm(plugin, ai, geminiFormatters);
    
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
        const p: PartListUnion = [{text: tree}];
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

const buildReactParameterized = (plugin: lImporterPlugin, model: string, tools: DynamicStructuredTool<ZodObject<{}, "strip", ZodTypeAny, {}, {}>>[]): (files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const reAct = createReActAgent(plugin, model, tools);
    const ai = new GoogleGenAI({apiKey: plugin.settings.GOOGLE_API_KEY});
    // const preprocessor = createLangGraphMessages(plugin, ai);
    const preprocessor = createMessageslIm(plugin, ai, langGraphFormatters);

    const sendMessage = async (files: FileItem[], signal: AbortSignal) => {
        const msg = await preprocessor(files, signal);
        
        msg.push({ type: 'text', text: react_starter_prompt });
        
        if (msg) { //} && !signal.aborted) {
            const finalState = await reAct.invoke({
                messages: [{ role: "user", content: msg }],
            }, { recursionLimit: 113, signal });
                    
            const answer:any = finalState.messages[finalState.messages.length - 1].content;
            console.log('## answer\n\n'+ answer);
        }
    }
    
    return sendMessage;
}

const buildReact = (plugin: lImporterPlugin, model: string): (files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const {writeFile, moveFile, getGhostReferences, listFiles} = createObsidianTools(plugin);
    const agent_tools = [writeFile, moveFile, getGhostReferences, listFiles];
    return buildReactParameterized(plugin, model, agent_tools)
}

export const models = [
    {id: "gemini-2.5-flash-preview-04-17"},
    {id: "gemini-2.0-flash-lite"},
    {id: "gemini-2.0-flash"},
        ];

export const pipelineOptions = [
{   
id: 'gemini_ke', 
name: 'Gemini KE',
buildPipeline: buildPromptChain 
},
{
id: 'react_ke', 
name: 'reAct KE',
buildPipeline: buildReact 
},
];