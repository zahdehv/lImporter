import { Chat, createPartFromFunctionResponse, FunctionDeclaration, FunctionResponse, GenerateContentResponse, PartUnion, Tool } from "@google/genai";
import lImporterPlugin from "src/main";

export interface FunctionArg {
    schema: FunctionDeclaration;
    run: (plugin: lImporterPlugin, args: any) => Promise<{ output: string, metadata?: any }>;
}

export const FORMAT_CALLOUT = (icon: string, expanded: "+" | "-" | "", header: string, content?: string) => {
    const newContent = content ? (content.split('\n')).map((value) => "> " + value).join("\n") : "";
    return `> [!${icon}]${expanded} ${header}
${newContent}`;
}

export interface looperConfig {
    functions?: FunctionArg[];
    max_turns: number;
    max_retries: number;
}

export const DEFAULT_LOOPER_SETTINGS: looperConfig = {
    functions: undefined,
    max_turns: 23,
    max_retries: 7,

}

export async function run_looper(plugin: lImporterPlugin, chat: Chat, initMessage: PartUnion[], loopfig?: looperConfig) {

    // { functions, max_turns, max_retries } = Object.assign({}, DEFAULT_LOOPER_SETTINGS, loopfig);
    const { functions, max_turns, max_retries } = Object.assign({}, DEFAULT_LOOPER_SETTINGS, loopfig);

    const tools: Tool[] = [{ functionDeclarations: functions?.map(value => value.schema) }];
    let currentMessage: PartUnion[] = initMessage;

    for (let index = 0; index < max_turns; index++) {
        const procss = plugin.tracker.appendStep("LLM", "thinking...", "bot", 'in-progress');
        const messageTextSpace = plugin.tracker.createMessage("AI");
        messageTextSpace.MD("...");

        let response: AsyncGenerator<GenerateContentResponse, any, any> | undefined;

        // RETROCESO
        for (let exp = 0; exp < max_retries; exp++) {
            try {
                response = await chat.sendMessageStream({ message: currentMessage, config: { tools: tools } });
                break;
            } catch (error) { await sleep((2 ** exp) * 1000); } //ms
        }
        if (!response) throw new Error("Error, could not get a response from the LLM!");
        
        currentMessage = [];

        let fullText = "";
        for await (const chunk of response) {
            if (functions && chunk.functionCalls?.length && chunk.functionCalls?.length > 0) {
                for (let index = 0; index < chunk.functionCalls.length; index++) {
                    const fc = chunk.functionCalls[index];

                    const fx = functions.find(pred => pred.schema.name === fc.name);
                    if (fx) {
                        let res: {
                            output: string;
                            metadata?: any;
                        } | undefined;
                        try {
                            res = await fx.run(plugin, fc.args)
                            const ans: FunctionResponse = { id: fc.id, name: fc.name, response: { output: res.output } };
                            const prt = createPartFromFunctionResponse(ans.id ? ans.id : "NO_ID", ans.name ? ans.name : "NO_NAME", ans.response ? ans.response : { output: "ERROR IN FUNCTION HANDLING" });
                            currentMessage.push(prt);
                        } catch (error) {
                            const ans: FunctionResponse = { id: fc.id, name: fc.name, response: { output: "Error executing function " + fc.name } };
                            const prt = createPartFromFunctionResponse(ans.id ? ans.id : "NO_ID", ans.name ? ans.name : "NO_NAME", ans.response ? ans.response : { output: "ERROR IN FUNCTION HANDLING" });
                            currentMessage.push(prt);
                        }
                    }
                }
            }
            if (chunk.text) {
                fullText += chunk.text;
                messageTextSpace.MD(fullText);
            }
        }

        //HERE THE RESETTING MESSAGE
        procss.updateState('complete');
        if (currentMessage.length <= 0) break;
    }
    return currentMessage;
}

export async function single_pass(plugin: lImporterPlugin, chat: Chat, initMessage: PartUnion[], loopfig?: looperConfig) {
    const newConf:looperConfig = {max_retries: loopfig?.max_retries || 7 ,max_turns: 1, functions: loopfig?.functions};
    return await run_looper(plugin, chat, initMessage, newConf);
}

export async function re_pass(plugin: lImporterPlugin, chat: Chat, initMessage: PartUnion[], loopfig?: looperConfig) {
    const newConf:looperConfig = {max_retries: loopfig?.max_retries || 7 ,max_turns: 2, functions: loopfig?.functions};
    return await run_looper(plugin, chat, initMessage, newConf);
}

export async function tri_pass(plugin: lImporterPlugin, chat: Chat, initMessage: PartUnion[], loopfig?: looperConfig) {
    const newConf:looperConfig = {max_retries: loopfig?.max_retries || 7 ,max_turns: 3, functions: loopfig?.functions};
    return await run_looper(plugin, chat, initMessage, newConf);
}