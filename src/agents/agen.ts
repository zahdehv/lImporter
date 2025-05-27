import lImporterPlugin from "src/main";
import { createMessageslIm } from "../utils/messages";
import { GoogleGenAI } from "@google/genai";
import { FileItem } from "src/utils/files";
import { react_starter_prompt, react_system_prompt } from "./promp";
import { run_looper } from "./looper";
import { getFunctions } from "./tools";

export const models = {
    flash25: "gemini-2.5-flash-preview-05-20",
    flash2: "gemini-2.0-flash",
    flash2l: "gemini-2.0-flash-lite",
}

// El loop esta inspirado en tiny agents 
export const agentList = [
    {
        id: 'react_gem25',
        name: 'reAct with Gemini Flash 2.5',
        buildAgent: (plugin: lImporterPlugin): (files: FileItem[], additionalPrompt?: string) => Promise<void> => {
            const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
            const preprocessor = createMessageslIm(plugin, ai);
            const sendMessage = async (files: FileItem[], additionalPrompt?: string) => {
                const msg = await preprocessor(files, plugin.tracker.abortController.signal);
                msg.push({ text: react_starter_prompt });
                if (additionalPrompt) msg.push({ text: additionalPrompt });
                if (!msg) throw new Error("Error preprocessing...");
                const chat = ai.chats.create({ model: models.flash25, config: { systemInstruction: react_system_prompt } }); //ADD SYSTEM
                const { moveFX, queryFX, treeFX, writeFX } = await getFunctions(plugin.app);
                await run_looper(plugin, chat, msg, { max_retries: 7, max_turns: 23, functions: [treeFX, queryFX, writeFX, moveFX] });
            }
            return sendMessage;
        }
    },
];