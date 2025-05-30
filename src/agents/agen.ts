import lImporterPlugin from "src/main";
import { createMessageslIm } from "../utils/messages";
import { GoogleGenAI } from "@google/genai";
import { FileItem } from "src/utils/files";
import { react_starter_prompt, react_system_prompt } from "./promp";
import { run_looper, single_pass } from "./looper";
import { getFunctions } from "./tools";

export const models = {
    flash25: "gemini-2.5-flash-preview-05-20",
    flash2: "gemini-2.0-flash",
    flash2l: "gemini-2.0-flash-lite",
}

// El loop esta inspirado en tiny agents 
export const agentList = [
    {
        id: 'test999',
        name: 'fForward agent implementation',
        buildAgent: (plugin: lImporterPlugin): (files: FileItem[], additionalPrompt?: string) => Promise<void> => {
            const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
            const preprocessor = createMessageslIm(plugin, ai);


            const sendMessage = async (files: FileItem[], additionalPrompt?: string) => {
                const { moveFX, queryFX, treeFX, writeFX, cprsFX } = await getFunctions(plugin.app);
                const message = await preprocessor(files, plugin.tracker.abortController.signal);
                message.push({ text: "Given the files to process, please check using the function the related content to foresee what notes will be necessary to create." });

                const chat = ai.chats.create({ model: models.flash25, config: { systemInstruction: react_system_prompt } }); //ADD SYSTEM

                const retrieved_data = await run_looper(plugin, chat, message, { max_retries: 7, max_turns: 1, functions: [cprsFX] });
                retrieved_data.push({
                    text: "Given the retrieved items, if any, generate notes accordingly. You can create a link to any of the created items, and must NOT repeat content." +
                        "If there is no new content to add, given that the vault contains all of the items, just state it."
                })
                const files_wrote = await run_looper(plugin, chat, retrieved_data, { max_retries: 7, max_turns: 4, functions: [writeFX] });
                //Normal end, add checking parts if applicable
            }
            return sendMessage;
        }
    },
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