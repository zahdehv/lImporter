import { GoogleGenerativeAI, GenerativeModel, ChatSession, FunctionDeclaration } from '@google/generative-ai';
import { FileItem, AudioUploader } from '../Utilities/fileUploader';
import { prompt_get_claims_instructions } from 'src/Utilities/promp';
import AutoAudioPlugin from 'src/main';

export class ttsBase {
    constructor() {}
    public async transcribe(audio: FileItem): Promise<string> {
        return "A";
    }
}
export class ttsGeminiFL extends ttsBase {
    private upldr: AudioUploader;
    private model: GenerativeModel;
    private plugin: AutoAudioPlugin
    constructor(plugin: AutoAudioPlugin) {
        super();
        this.plugin = plugin;
        const genAI = new GoogleGenerativeAI(plugin.settings.GOOGLE_API_KEY);
        
        this.model = genAI.getGenerativeModel({
                    model: "gemini-2.0-flash-thinking-exp-01-21",
                    systemInstruction: "Eres un entusiasta del manejo de informacion, siempre que obtienes nueva informacion buscas la mejor manera de ordenarla y relacionarla. Elaboras instrucciones e informaciones intuitivas y comprensivas.",
                });
        this.upldr = new AudioUploader(plugin.settings.GOOGLE_API_KEY);
    }
    public async transcribe(audio: FileItem): Promise<string> { // Update return type promise
        if (!audio.uploaded) {
            // Ensure this.upldr and uploadAudioBlob handle errors appropriately
            await this.upldr.uploadAudioBlob(audio);
        }
    
        // Add checks to ensure uploadData and file exist if upload was needed
        if (!audio.uploadData?.file) {
            // Handle error: Upload might have failed or didn't produce expected data
            console.error("Audio upload data is missing after upload attempt.");
            // Return or throw an error appropriate for your application
            return "ERROR, DO NOTHING"; // Or throw new Error(...)
        }
        const file = audio.uploadData.file;
    
        // Ensure this.model.generateContent handles potential errors
        const result = await this.model.generateContent([
            {
                fileData: {
                    mimeType: file.mimeType,
                    fileUri: file.uri,
                },
            },
            { text: prompt_get_claims_instructions },
        ]);
    
        // It's good practice to check if the response and text exist
        const txt = result?.response?.text();
    
        if (!txt) {
            console.error("No text received from the model.");
            return "ERROR, DO NOTHING"; // Return default if no text
        }
    
        // --- Extract Claims ---
        let claims: string | undefined = undefined;
       
        const claimsRegex = /<claims>([\s\S]*)<\/claims>/;
        const claimsMatch = claimsRegex.exec(txt);
    
        if (claimsMatch && claimsMatch[1] !== undefined) {
           
            claims = claimsMatch[1].trim(); // Trim whitespace from the result
        } else {
            console.log("Claims tag not found or empty in the response.");
        }
    
        let instructions: string | undefined = undefined;
        // Using the same regex logic as claims, but for the instructions tag
        const instructionsRegex = /<instructions>([\s\S]*)<\/instructions>/;
        const instructionsMatch = instructionsRegex.exec(txt);
    
        if (instructionsMatch && instructionsMatch[1] !== undefined) {
            instructions = instructionsMatch[1].trim(); // Trim whitespace
        } else {
            console.log("Instructions tag not found or empty in the response.");
        }
    
        // Logging for debugging (optional)
        console.log("--- Transcription Analysis ---");
        console.log("Original Text Length:", txt.length);
        console.log("Extracted Claims:", claims);
        console.log("Extracted Instructions:", instructions);
        console.log("--- End Transcription Analysis ---");
    
        let files = "";
        const fls = this.plugin.app.vault.getFiles().map((a)=> a.path);
        for (let index = 0; index < fls.length; index++) { files+= `- '`+fls[index]+"'\n";}
         const prompt = `Los archivos existentes son:
${files}

Se tiene la siguiente informacion y hechos:
${claims}

EFECTUA ENTONCES TODAS LAS SIGUIENTES INSTRUCCIONES:
${instructions}

Al final siempre verifica que no existan Links a archivos no existentes usando la funcion (siempre que termines de escribir un conjunto de archivos, pues otro error puede haber aparecido).

Debe seguir el flujo:
Lectura -> escritura(varias) -> Comprobacion -> Lectura -> escritura(varias) -> Comprobacion... -> Ordenacion -> Informe del resultado
`;
        // Return the extracted parts in an object
        return prompt;
    }
}