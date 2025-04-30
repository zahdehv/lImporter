import AutoFilePlugin from "src/main";
import { FileItem } from "src/utils/fileUploader";
import { direct_default_prompt, prompt_get_claims_instructions } from "src/utils/promp";
import { geminiPREP } from "./utils/generatePromptExternal";
import { reActAgentClaimI } from "./ClaimInstAgent";
import { reActAgentDirect } from "./DirectAgent";
import { MSGBLD } from "./utils/genMessageMultimodalLG";

export abstract class Pipeline {
    protected plugin: AutoFilePlugin;
    public default_prompt: string;
    name: string;

    constructor(plugin:AutoFilePlugin) {
        this.plugin = plugin;
    }

    async call(prompt: string, files: FileItem[], signal: AbortSignal){}
}

export class ClaimInstPipe extends Pipeline {
    private preprocessor: geminiPREP;
    private reAct: reActAgentClaimI;
    constructor(plugin: AutoFilePlugin) {
        super(plugin);
        this.preprocessor = new geminiPREP(this.plugin);
        this.reAct = new reActAgentClaimI(this.plugin);
        this.default_prompt = prompt_get_claims_instructions;
        this.name = "claim_instruction_sep_pipeline"
    }
    async call(prompt: string, files: FileItem[], signal: AbortSignal){
        const claims_instructions = await this.preprocessor.preprocess(files, prompt, signal);
                if (claims_instructions && !signal.aborted) {
                    const finalState = await this.reAct.agent.invoke({
                        messages: [{ role: "user", content: claims_instructions }],
                    }, { recursionLimit: 113, signal });

                    const answer = finalState.messages[finalState.messages.length - 1].content;
                    const answerStep = this.plugin.tracker.appendStep(
                        `Answer`, 
                        answer, 
                        "bot-message-square"
                    );
                    answerStep.updateState("pending");
                }
    }

}

export class DirectPipe extends Pipeline {
    private preprocessor: MSGBLD;
    private reAct: reActAgentDirect;
    constructor(plugin: AutoFilePlugin) {
        super(plugin);
        this.reAct = new reActAgentDirect(this.plugin);
        this.default_prompt = direct_default_prompt;
        this.name = "direct_pipeline"
    }
    async call(prompt: string, files: FileItem[], signal: AbortSignal){
        const msgbld = new MSGBLD(this.plugin);
                const msg = await msgbld.genPrompt(files, prompt, signal);
                if (msg && !signal.aborted) {
                    const finalState = await this.reAct.agent.invoke({
                        messages: [{ role: "user", content: msg }],
                    }, { recursionLimit: 113, signal });
                          
                    const answer = finalState.messages[finalState.messages.length - 1].content;
                    const answerStep = this.plugin.tracker.appendStep(
                        `Answer`, 
                        answer, 
                        "bot-message-square"
                    );
                    answerStep.updateState("pending");
                }
    }

}
