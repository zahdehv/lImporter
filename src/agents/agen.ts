import lImporterPlugin from "src/main";
import { createMessageslIm } from "../utils/messages";
import { GoogleGenAI } from "@google/genai";
import { FileItem } from "src/utils/files";
import { react_starter_prompt } from "./promp";
import { FunctionArg, run_node } from "./looper";
import { queryFX, treeFX, writeFX } from "./tools";

export const shortcut_models = {
    flash25: "gemini-2.5-flash-preview-05-20",
    flash2: "gemini-2.0-flash",
    flash2l: "gemini-2.0-flash-lite",
}

// El loop esta inspirado en tiny agents 
export const agentList = [
{   
id: 'react_gem25', 
name: 'reAct with Gemini Flash 2.5',
buildPipeline: (plugin: lImporterPlugin): (files: FileItem[], additionalPrompt?: string) => Promise<void> => {
    const ai = new GoogleGenAI({apiKey: plugin.settings.GOOGLE_API_KEY});
    const preprocessor = createMessageslIm(plugin, ai);
    const sendMessage = async (files: FileItem[], additionalPrompt?: string) => {
        const msg = await preprocessor(files, plugin.tracker.abortController.signal);
        msg.push({text: react_starter_prompt});
        if (additionalPrompt) msg.push({text: additionalPrompt});
        if (!msg) throw new Error("Error preprocessing...");
        const chat = ai.chats.create({model: shortcut_models.flash25, config:{systemInstruction: ""}}); //ADD SYSTEM
        const functions: FunctionArg[] = [writeFX, queryFX, treeFX];
        await run_node(plugin, chat, msg, functions);
    }
    return sendMessage;
}
}
];