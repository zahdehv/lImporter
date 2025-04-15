import MyPlugin from "../main";
import { ttsBase, ttsGeminiFL } from "./audioPrep";
import { FileItem } from "../Utilities/fileUploader";
import { reActAgentLLM } from "./reActAgent";
import { Notice } from "obsidian";

export class Pipeline {
    private tts: ttsBase;
    private reActAgent: reActAgentLLM;
    private plugin: MyPlugin;
    constructor(plugin: MyPlugin) {
        this.tts = new ttsGeminiFL(plugin.settings.GOOGLE_API_KEY);
        this.reActAgent = new reActAgentLLM(plugin);
        this.plugin = plugin;
    }

    public async pipe(file: FileItem) {
      // new Notice("Started processing...");
      console.log("Started processing...");
       const {claims, instructions} = await this.tts.transcribe(file);
      // new Notice("Ended Transcription")
      console.log("Ended Transcription")
      let files = "";
      const fls = this.plugin.app.vault.getFiles().map((a)=> a.path);
      for (let index = 0; index < fls.length; index++) { files+= `- '`+fls[index]+"'\n";}
       const prompt = `Los archivos existentes son:
${files}

Se tiene la siguiente informacion y hechos:
${claims}

EFECTUA ENTONCES TODAS LAS SIGUIENTES INSTRUCCIONES:
${instructions}
`;

      console.log("PROMPT", prompt);
      const finalState = await this.reActAgent.app.invoke({
        messages: [{ role: "user", content: prompt }],
      });
      
      const answer = finalState.messages[finalState.messages.length - 1].content;
      // new Notice(answer);
      console.log(answer);
      
      return answer;
    }

}