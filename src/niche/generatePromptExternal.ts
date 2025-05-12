import { GoogleGenerativeAI, GenerativeModel, ChatSession, FunctionDeclaration } from '@google/generative-ai';
import { FileItem, FileUploader } from '../utils/fileUploader';
import { prompt_get_claims_instructions } from 'src/utils/promp';
import AutoFilePlugin from 'src/main';
import { trace } from 'console';


export class geminiPREP {
    private upldr: FileUploader;
    private model: GenerativeModel;
    private plugin: AutoFilePlugin
    constructor(plugin: AutoFilePlugin) {
        this.plugin = plugin;
        const genAI = new GoogleGenerativeAI(plugin.settings.GOOGLE_API_KEY);
        
        this.model = genAI.getGenerativeModel({
                    model: "gemini-2.0-flash-thinking-exp-01-21",
                    systemInstruction: "Eres un entusiasta del manejo de informacion, siempre que obtienes nueva informacion buscas la mejor manera de ordenarla y relacionarla. Elaboras instrucciones e informaciones intuitivas y comprensivas.",
                });
        this.upldr = new FileUploader(plugin.settings.GOOGLE_API_KEY);
    }
    public async preprocess(tfiles: FileItem[], instruction: string, signal: AbortSignal): Promise<string|null> { // Update return type promise
        // await sleep(2000000);
        const context = [];
        for (const tfile of tfiles) {
            const upld_trk = this.plugin.tracker.appendStep("File Upload", tfile.title, "upload");
            if (signal.aborted) break;

        if (!tfile.uploaded) {
            try {
                await this.upldr.uploadFileBlob(tfile, signal); 
                if (signal.aborted) {
                    throw new Error("Operation Aborted");
                }
                upld_trk.updateState("complete", "File uploaded succesfully!");
            } catch (error) {
                console.error(error);
                upld_trk.updateState("error",  error); this.plugin.tracker.writeLog(`\`\`\`diff
- ${ error}
\`\`\``);
                return null;
            }
            
        } else {upld_trk.updateState("complete", "File already in the cloud!");}
        
        // Add checks to ensure uploadData and file exist if upload was needed
        if (!tfile.uploadData?.file) {
            // Handle error: Upload might have failed or didn't produce expected data
            console.error("File upload data is missing after upload attempt.");
            // Return or throw an error appropriate for your application
            upld_trk.updateState("error", "File upload data is missing after upload attempt.")
            return null; // Or throw new Error(...)
        }
        const file = tfile.uploadData.file;
        context.push({
            fileData: {
                mimeType: file.mimeType,
                fileUri: file.uri,
            },
        });
    }
    if (context.length === 0) {
        const nofile = this.plugin.tracker.appendStep("No FILES provided", "The processor will work with the PROMPT", 'file');
        nofile.updateState("pending")
        // throw new Error("No Files Provided");
    }

        context.push({ text: instruction });
        const prmpt_trk = this.plugin.tracker.appendStep("Generate Agent instruction", "Generating an input prompt...", "trending-up-down");
        // Ensure this.model.generateContent handles potential errors
        let txt;
        try {
            const result = await this.model.generateContentStream(context, {signal: signal});
            // It's good practice to check if the response and text exist
            txt = "";

            for await (const chunk of result.stream) {
                txt += chunk.text();
                prmpt_trk.updateCaption(txt.slice(-222));
              }
              
        } catch (error) {
            prmpt_trk.updateState("error", error)
            return null;
        }
        
        
        if (!txt) {
            console.error("No text received from the model.");
            prmpt_trk.updateState("error", "No text received from the model.")
            return null; // Return default if no text
        }
        // GET FILES 
        // let files = "";
        // const fls = this.plugin.app.vault.getFiles().map((a)=> a.path);
        // for (let index = 0; index < fls.length; index++) { files+= `- '`+fls[index]+"'\n";}
        const prompt = `${txt}

Al final siempre verifica que no existan Links a archivos no existentes usando la funcion (siempre que termines de escribir un conjunto de archivos, pues otro error puede haber aparecido).

Debe seguir el flujo:
Lectura -> escritura(varias) -> Comprobacion -> Lectura -> escritura(varias) -> Comprobacion... -> Ordenacion -> Informe del resultado
`;
        prmpt_trk.updateState("complete", "Prompt Generated!");
        // Return the extracted parts in an object
        return prompt;
    }
}