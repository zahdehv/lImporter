import lImporterPlugin from "src/main";
import { createMessageslIm } from "../utils/messages";
import { GoogleGenAI, PartUnion } from "@google/genai";
import { FileItem } from "src/utils/files";
import { prompts } from "./promp";
import { FORMAT_CALLOUT, generateContentEKstream, handleStream, run_looper } from "./looper";
import { CPRS_TL, getFunctions } from "./tools";

export enum models {
    flash25 = "gemini-2.5-flash-preview-05-20",
    flash2 = "gemini-2.0-flash",
    flash2l = "gemini-2.0-flash-lite",
}

// El loop esta inspirado en tiny agents 
const agentList = [
    {
        id: 'ra_test998',
        buildAgent: (plugin: lImporterPlugin): (files: FileItem[], additionalPrompt?: string) => Promise<void> => {
            const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
            const preprocessor = createMessageslIm(plugin, ai);

            const sendMessage = async (files: FileItem[], additionalPrompt?: string) => {
                const { planFX, askFilesFX, moveFX, treeFX, writeFX, finishFX, mkdirFX, readFX } = await getFunctions(plugin.app);
                const functions = [planFX, askFilesFX, moveFX, treeFX, writeFX, finishFX, mkdirFX, readFX];
                let files_to_process: PartUnion[] = [];
                const up = plugin.tracker.createMessage("AI");
                if (files.length > 0) {
                    up.MD(FORMAT_CALLOUT("info", '+', `uploading files`, files.map(fl => "- " + fl.path).join('\n')));
                    files_to_process = await preprocessor(files);
                }

                const chat = ai.chats.create({ model: models.flash25 });

                let prompt_base: string = prompts.plan_and_solve_innit; //change the prompt
                if (additionalPrompt) prompt_base = additionalPrompt; //change the prompt
                const message = files_to_process.concat(prompt_base);

                up.MD(FORMAT_CALLOUT("check", '-', `proceeded to call agent`, files.map(fl => "- " + fl.path).concat("\n\n" + prompt_base).join('\n')));

                // plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("quote", '+', `STARTED`));
                await run_looper(plugin, chat, message, { max_turns: 23, max_retries: 7, functions });
                // plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("quote", '+', `FINISHED`));
            }
            return sendMessage;
        }
    },
    {
        id: 'hc_test998',
        buildAgent: (plugin: lImporterPlugin): (files: FileItem[], additionalPrompt?: string) => Promise<void> => {
            const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
            const preprocessor = createMessageslIm(plugin, ai);

            const sendMessage = async (files: FileItem[], additionalPrompt?: string) => {

                const { moveFX, treeFX, writeFX, finishFX, planFX } = await getFunctions(plugin.app);
                // const toolsWRITE = getFunctionDeclarations(plugin, [writeFX]);

                const files_to_process = await preprocessor(files);
                const q = plugin.tracker.appendStep("Creating Question", "", 'text', 'in-progress');
                const question_response = await generateContentEKstream(ai.models.generateContentStream, {
                    model: models.flash25,
                    contents: files_to_process.concat(prompts.generate_question_prompt),
                    config: { abortSignal: plugin.tracker.abortController.signal }
                });
                const question = (await handleStream(plugin, question_response, [])).fullText;
                q.updateState('complete');
                const cp = plugin.tracker.appendStep("Extracting sentences", "", 'text', 'in-progress');
                const relevant_items = await CPRS_TL(plugin, question, 'sentence');
                const relevant_context: PartUnion[] = relevant_items?.map((item) => {
                    const file = plugin.app.vault.getFileByPath(item.path);
                    if (file) return `Cite ${plugin.app.fileManager.generateMarkdownLink(file, "")} to use the following information: '${item.extracted_item}'.`;
                    console.debug("FILE NOT FOUND WATS HAPENINN?");
                    return `File '${item.path}' not found.`;
                });
                cp.updateState('complete');

                const p = plugin.tracker.appendStep("Planning", "", 'text', 'in-progress');
                const planner__effector = ai.chats.create({ model: models.flash25 });
                const innitMsg = files_to_process.concat(relevant_context).concat("Create a plan to generate new notes given the files and retrieved context. End the interaction when a plan is accepted");
                await run_looper(plugin, planner__effector, innitMsg, { max_turns: 7, max_retries: 4, functions: [planFX, finishFX] });
                p.updateState('complete');
                // Just use the same chat
                // const accepted = plans.filter(fc => (fc.name === 'propose_plan' && fc.response?.output === "The user accepted the plan."));
                // if (!accepted[0].response) throw new Error("No plan response found");
                // const plan: string = (accepted[0].response as {output: string; metadata: {accepted: boolean; plan: string}}).metadata.plan;
                // const effector = ai.chats.create({ model: models.flash25 });
                const a = plugin.tracker.appendStep("Acting", "", 'text', 'in-progress');
                await run_looper(plugin, planner__effector, ["Execute the accepted plan using the necessary tools. Finish when you consider necessary."], { max_turns: 13, max_retries: 4, functions: [writeFX, moveFX, treeFX, finishFX] });
                a.updateState('complete');

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
                const { moveFX, treeFX, writeFX } = await getFunctions(plugin.app);
                const message = await preprocessor(files);
                message.push({ text: "Given the files to process, please check using the function the related content to foresee what notes will be necessary to create." });

                const chat = ai.chats.create({ model: models.flash25, config: { systemInstruction: prompts.react_system_prompt } }); //ADD SYSTEM

                const retrieved_data = await run_looper(plugin, chat, message, { max_retries: 7, max_turns: 1, functions: [] });
                // retrieved_data.push({
                //     text: "Given the retrieved items, if any, generate notes accordingly. You can create a link to any of the created items, and must NOT repeat content." +
                //         "If there is no new content to add, given that the vault contains all of the items, just state it."
                // })
                // const files_wrote = await run_looper(plugin, chat, retrieved_data, { max_retries: 7, max_turns: 4, functions: [writeFX] });
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
                const msg = await preprocessor(files);
                msg.push({ text: prompts.react_starter_prompt });
                if (additionalPrompt) msg.push({ text: additionalPrompt });
                if (!msg) throw new Error("Error preprocessing...");
                const chat = ai.chats.create({ model: models.flash25, config: { systemInstruction: prompts.react_system_prompt } }); //ADD SYSTEM
                const { moveFX, treeFX, writeFX } = await getFunctions(plugin.app);
                await run_looper(plugin, chat, msg, { max_retries: 7, max_turns: 23, functions: [treeFX, writeFX, moveFX] });
            }
            return sendMessage;
        }
    },
];

export const currentAgent = agentList[0];