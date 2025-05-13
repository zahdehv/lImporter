import { direct_default_prompt, lim_default_prompt, prompt_get_claims_instructions } from "src/utils/promp";
import AutoFilePlugin from "src/main";
import { FileItem } from "src/utils/fileUploader";
import { preProcessor } from "./preprocessInput";
import { listFilesTree } from "src/utils/fileLister";
import { reActAgent } from "src/agents/reAct";

const buildReact = (plugin: AutoFilePlugin, model: string): (prompt: string, files: FileItem[], signal: AbortSignal) => Promise<void> => {
    const reAct = new reActAgent(plugin, model);
    const preprocessor = new preProcessor(plugin);

    const call = async (prompt: string, files: FileItem[], signal: AbortSignal) => {
        const msg = await preprocessor.genPrompt(files, prompt, signal);
        const tree = await listFilesTree(plugin.app, "", 3, true, true, 23)
        msg.push({ type: 'text', text: tree });
        if (msg && !signal.aborted) {
            const finalState = await reAct.agent.invoke({
                messages: [{ role: "user", content: msg }],
            }, { recursionLimit: 113, signal });
                    
            const answer = finalState.messages[finalState.messages.length - 1].content;
            const answerStep = plugin.tracker.appendStep(
                `Answer`, 
                answer, 
                "bot-message-square"
            );
            answerStep.updateState("pending");
        }
    }

    return call;
}

export const models = [
            {id: "gemini-2.5-flash-preview-04-17"},
            {id: "gemini-2.0-flash"},
            {id: "gemini-2.0-flash-lite"},
        ]

export const pipelineOptions = [
            { id: 'react', name: 'reAct Agent', defaultPrompt: lim_default_prompt, buildPipeline: buildReact },
            // { id: 'lite_direct', name: 'Lite Agent', pipeline: () => new LitePipe(this.plugin) },
            // { id: 'direct_call', name: 'Direct Call', pipeline: () => new DirectPipe(this.plugin) },
            // { id: 'claim_instructions', name: 'Claim Instructions', pipeline: () => new ClaimInstPipe(this.plugin) },
            // { id: 'lite_test', name: 'Lite TEST', pipeline: () => new LiteTESTPipe(this.plugin) },
        ];