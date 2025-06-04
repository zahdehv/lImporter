import lImporterPlugin from "src/main";
import { createMessageslIm } from "../utils/messages";
import { GoogleGenAI } from "@google/genai";
import { FileItem } from "src/utils/files";
import { prompts } from "./promp";
import { run_looper } from "./looper";
import { getFunctions } from "./tools";
import { CPRS } from "./niche";

export enum models {
    flash25 = "gemini-2.5-flash-preview-05-20",
    flash2 = "gemini-2.0-flash",
    flash2l = "gemini-2.0-flash-lite",
}

// El loop esta inspirado en tiny agents 
export const agentList = [
    {
        id: 'hc_test998',
        buildAgent: (plugin: lImporterPlugin): (files: FileItem[], additionalPrompt?: string) => Promise<void> => {
            const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
            const preprocessor = createMessageslIm(plugin, ai);


            const sendMessage = async (files: FileItem[], additionalPrompt?: string) => {
                const { moveFX, queryFX, treeFX, writeFX } = await getFunctions(plugin.app);
                // const toolsWRITE = getFunctionDeclarations(plugin, [writeFX]);

                const files_to_process = await preprocessor(files, plugin.tracker.abortController.signal);
                // const plan_obj = await generate_plan(plugin, files_to_process, true);
                // const retrieved_data = await CPRS(plugin, plan_obj.claims_present_on_files, 4);

                const chat = ai.chats.create({ model: models.flash25 });

                // const instruction = files_to_process.concat(retrieved_data)
                // .concat("Given the retrieved items, if any, generate notes accordingly. You can create a link to any of the created items, and must NOT repeat content. If there is no new content to add, given that the vault contains all of the items, just state it. You can list the tree of the files, move items around, rewrite files, etc. Here is a plan:"+plan_obj.plan);
                // const files_wrote = await run_looper(plugin, chat, instruction, { max_retries: 7, max_turns: 7, functions: [writeFX, treeFX, moveFX] });
            }
            return sendMessage;
        }
    },
    {
        id: 'hc_test999',
        buildAgent: (plugin: lImporterPlugin): (files: FileItem[], additionalPrompt?: string) => Promise<void> => {
            const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
            const preprocessor = createMessageslIm(plugin, ai);


            const sendMessage = async (files: FileItem[], additionalPrompt?: string) => {
                const { moveFX, queryFX, treeFX, writeFX } = await getFunctions(plugin.app);
                const message = await preprocessor(files, plugin.tracker.abortController.signal);
                message.push({ text: "Given the files to process, please check using the function the related content to foresee what notes will be necessary to create." });

                const chat = ai.chats.create({ model: models.flash25, config: { systemInstruction: prompts.react_system_prompt } }); //ADD SYSTEM

                const retrieved_data = await run_looper(plugin, chat, message, { max_retries: 7, max_turns: 1, functions: [] });
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
        id: 'react_test999',
        buildAgent: (plugin: lImporterPlugin): (files: FileItem[], additionalPrompt?: string) => Promise<void> => {
            const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
            const preprocessor = createMessageslIm(plugin, ai);
            const sendMessage = async (files: FileItem[], additionalPrompt?: string) => {
                const msg = await preprocessor(files, plugin.tracker.abortController.signal);
                msg.push({ text: prompts.react_starter_prompt });
                if (additionalPrompt) msg.push({ text: additionalPrompt });
                if (!msg) throw new Error("Error preprocessing...");
                const chat = ai.chats.create({ model: models.flash25, config: { systemInstruction: prompts.react_system_prompt } }); //ADD SYSTEM
                const { moveFX, queryFX, treeFX, writeFX } = await getFunctions(plugin.app);
                await run_looper(plugin, chat, msg, { max_retries: 7, max_turns: 23, functions: [treeFX, queryFX, writeFX, moveFX] });
            }
            return sendMessage;
        }
    },
];