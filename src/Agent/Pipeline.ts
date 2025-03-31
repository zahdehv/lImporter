import MyPlugin from "../main";
import { ttsBase, ttsGeminiFL } from "./ttsServiss";
import { AudioItem } from "../Utilities/fileUploader";
import { reActAgentLLM } from "./reActAgent";
import { Notice } from "obsidian";

export class Pipeline {
    private tts: ttsBase;
    private reActAgent: reActAgentLLM;
    constructor(plugin: MyPlugin) {
        this.tts = new ttsGeminiFL(plugin.settings.GOOGLE_API_KEY);
        this.reActAgent = new reActAgentLLM(plugin);
    }

    public async pipe(audio: AudioItem) {
      new Notice("Started processing...")
       const inst = await this.tts.transcribe(audio);
      new Notice("Ended Transcription")
      new Notice(inst)
       const prompt = `<audio-transcription>
${inst}
</audio-transcription>

A partir de la informacion anterior genera un conjunto de notas que:
- sean lo suficientemente atomicas para encapsular una idea
- tengan un titulo sugerente
- el titulo no puede tener mayusculas y espacios (example: treasure_hunter.md, love/love_comedy.md)
- tengan relaciones entre ellas (obsidian like: [[treasure_hunter]] o [[love_comedy]] , notar que no es necesario incluir la extension ni e l path completo en el vinculo)
- no usar acentos en los nombres de archivos o menciones
- si el nombre de archivo es muy largo, probablemente estes poniendo mucha informacion en una sola nota`

      const finalState = await this.reActAgent.app.invoke({
        messages: [{ role: "user", content: prompt }],
      });
      
      const answer = finalState.messages[finalState.messages.length - 1].content;
      new Notice(answer);
      
      return answer;
    }

}