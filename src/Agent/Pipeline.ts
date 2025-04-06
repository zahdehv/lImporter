import MyPlugin from "../main";
import { ttsBase, ttsGeminiFL } from "./ttsServiss";
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
       const inst = await this.tts.transcribe(file);
      // new Notice("Ended Transcription")
      console.log("Ended Transcription")
      // new Notice(inst)
      console.log(inst)
      let files = "";
      const fls = this.plugin.app.vault.getFiles().map((a)=> a.path).sort();
      for (let index = 0; index < fls.length; index++) { files+= fls[index]+"\n";}
       const prompt = `Los archivos existentes actualmente son:
<files>
${files}
</files>

El audio de entrada tiene la siguiente informacion:
<instrucciones>
${inst}
</instrucciones>

A partir de la informacion anterior genera un conjunto de notas tal que:
- no se extiendan demasiado con informacion muy diversa, pero no sean tan cortas como para no contener informacion ninguna
- el titulo no puede tener mayusculas y espacios (example: treasure hunter.md, Love/love comedy.md)
- tengan relaciones entre ellas (obsidian like: [[treasure_hunter]] o [[love_comedy]] , notar que no es necesario incluir la extension ni el path completo en el vinculo)
- los vinculos preferiblemente al estar integrados deben ser con sentido en medio del texto (si no encaja en el contexto usando [[title|displayed link name]] se puede ajustar, siempre que apunte al mismo concepto)
- no usar acentos en los nombres de archivos o menciones
DEBE CREAR UNA CARPETA CON UNA NOTA PRINCIPAL, QUE EXPLIQUE LA ESTRUCTURA GENERAL DE LAS SUBCARPETAS, LA CUAL DEBE CREARSE AL FINAL PARA MAYOR CONSISTENCIA,
TODO ESTO DENTRO DE UNA CARPETA CON ESTA NOTA Y LAS RESTANTES EN SUBCARPETAS.

Inicialmente crea un TODO que requeriras leer y modificar a lo largo del proceso, idealmente aprovechando lecturas de otros archivos tambien para evitar llamados innecesarios.
- este debe ser una lista (puede incluir sublistas) en formato markdown (- [ ] item sin marcar o - [x] item marcado)`

      const finalState = await this.reActAgent.app.invoke({
        messages: [{ role: "user", content: prompt }],
      });
      
      const answer = finalState.messages[finalState.messages.length - 1].content;
      // new Notice(answer);
      console.log(answer);
      
      return answer;
    }

}