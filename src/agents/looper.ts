import { Chat, createPartFromFunctionResponse, FunctionDeclaration, FunctionResponse, GenerateContentParameters, GenerateContentResponse, PartUnion, Tool } from "@google/genai";
import lImporterPlugin from "src/main";
import { getSpecs } from "./promp";

export interface FunctionArg {
    schema: FunctionDeclaration;
    run: (plugin: lImporterPlugin, args: any) => Promise<{ output: string, metadata?: any }>;
}

export const FORMAT_CALLOUT = (icon: string, expanded: "+" | "-" | "", header: string, content?: string) => {
    const newContent = content ? (content.split('\n')).map((value) => "> " + value).join("\n") : "";
    return `> [!${icon}]${expanded} ${header}
${newContent}`;
}

//Function formatter
export function getFunctionDeclarations(functions: FunctionArg[]): Tool[] | undefined {
    return functions.length > 0 ? [{ functionDeclarations: functions.map(value => value.schema) }] : undefined;
}

//response handler
export async function handleStream(plugin: lImporterPlugin, response: AsyncGenerator<GenerateContentResponse, any, any>, functions: FunctionArg[], cf = { preff: '', suff: '' }) {
    const { preff, suff } = cf;

    let messageTextSpace: {
        messageEl: HTMLDivElement;
        MD: (text: string) => void;
    } | undefined;

    const functionResponses: FunctionResponse[] = []
    // const functionResponses: PartUnion[] = []
    let fullText = "";
    let endFxBit = false;
    for await (const chunk of response) {
        if (functions && chunk.functionCalls?.length && chunk.functionCalls?.length > 0) {
            for (let index = 0; index < chunk.functionCalls.length; index++) {
                const fc = chunk.functionCalls[index];

                if (fc.name === 'end_session') endFxBit = true;

                const fx = functions.find(pred => pred.schema.name === fc.name);
                if (fx) {
                    let res: {
                        output: string;
                        metadata?: any;
                    } | undefined;
                    try {
                        res = await fx.run(plugin, fc.args)
                        const ans: FunctionResponse = { id: fc.id, name: fc.name, response: res };
                        functionResponses.push(ans);
                    } catch (error) {
                        const ans: FunctionResponse = { id: fc.id, name: fc.name, response: { output: "Error executing function " + fc.name } };
                        functionResponses.push(ans);
                    }
                }
            }
        }
        if (chunk.text) {
            fullText += chunk.text;
            if (!messageTextSpace) messageTextSpace = plugin.tracker.createMessage("AI");
            messageTextSpace.MD(preff + fullText + suff);
        }
    }
    return { fullText, functionResponses, endFxBit };
}

//knockback
// export async function sendMessageEKstream(fx: (params: SendMessageParameters) => Promise<AsyncGenerator<GenerateContentResponse>>, params: SendMessageParameters, max_retries: number = 3) {

// }

export async function generateContentEKstream(fx: ((params: GenerateContentParameters) => Promise<AsyncGenerator<GenerateContentResponse>>), params: GenerateContentParameters, max_retries: number = 3) {
    let response;
    for (let exp = 0; exp < max_retries; exp++) {
        try {
            response = await fx(params);
            break;
        } catch (error) { await sleep((2 ** exp) * 1000); } //ms
    }
    if (!response) throw new Error("Error, could not get a response from the LLM!");
    return response;
}

//looper
export interface looperConfig {
    functions: FunctionArg[];
    max_turns: number;
    max_retries: number;
    // signal?: AbortSignal;
}

export const DEFAULT_LOOPER_SETTINGS: looperConfig = {
    functions: [],
    max_turns: 23,
    max_retries: 7,
    // signal: undefined,
}

export function responsesToParts(responses: FunctionResponse[]) {
    return responses.map(ans => createPartFromFunctionResponse(ans.id ? ans.id : "NO_ID", ans.name ? ans.name : "NO_NAME", ans.response ? ans.response : { output: "ERROR IN FUNCTION HANDLING" }));
}

export async function run_looper(plugin: lImporterPlugin, chat: Chat, initMessage: PartUnion[], loopfig?: looperConfig) {
    const { functions, max_turns, max_retries } = Object.assign({}, DEFAULT_LOOPER_SETTINGS, loopfig);

    const tools = getFunctionDeclarations(functions);
    let currentMessage: PartUnion[] = initMessage;
    // const responsesHistory: FunctionResponse[] = [];
    const systemInstruction = await getSpecs(plugin.app, 'system');

    for (let index = 0; index < max_turns; index++) {
        let response;
        for (let exp = 0; exp < max_retries; exp++) {
            try {
                response = await chat.sendMessageStream({ message: currentMessage, config: { tools, abortSignal: plugin.tracker.abortController.signal, systemInstruction } });
                break;
            } catch (error) {
                console.error(error);
                if (plugin.tracker.abortController.signal.aborted) throw new Error("Signal aborted during EXP KNOCK");

                await sleep((2 ** exp) * 1000);
            } //ms
        }
        if (!response) throw new Error("Error, could not get a response from the LLM!");
        // return response;
        // const response = await sendMessageEKstream(chat.sendMessageStream, , max_retries);

        const { functionResponses, endFxBit } = await handleStream(plugin, response, functions ? functions : []);
        const functionResponsesAsParts = responsesToParts(functionResponses);
        // responsesHistory.push(...functionResponses);
        currentMessage = functionResponsesAsParts;
        if (endFxBit || (currentMessage.length <= 0)) {
            // currentMessage = currentMessage.concat(functionResponsesAsParts);
            break;
        }
    }
    return currentMessage;
}