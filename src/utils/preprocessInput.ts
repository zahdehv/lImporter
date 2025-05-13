import { FileItem } from "./fileUploader";
import { GoogleGenAI, Part } from "@google/genai";
import { FileUploader } from "./fileUploader";
import AutoFilePlugin from "../main";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface Rtext {
    type: "text",
    text: string,
}
interface Rmedia {
    type: "media",
    mimeType: string,
    fileUri: string,
}
export class MsgBuilder {
    private ai: GoogleGenAI;
    constructor(apiKey: string) {
        const ai = new GoogleGenAI({apiKey: apiKey});
    }
    async generatePrompt(prompt: string, files: FileItem[]) {
    
        const msg: (Part|string)[] = []
        for (let index = 0; index < files.length; index++) {
            const element = files[index];
            const file = await this.ai.files.upload({file: element.blob});
            element.uploaded = true;
            msg.push({fileData: {fileUri: file.uri, mimeType: file.mimeType}});
        }
    
        msg.push(prompt);}
}

export class preProcessor {
    private upldr: FileUploader;
    private plugin: AutoFilePlugin
    constructor(plugin: AutoFilePlugin) {
        this.plugin = plugin;
        const genAI = new GoogleGenerativeAI(plugin.settings.GOOGLE_API_KEY);
        this.upldr = new FileUploader(plugin.settings.GOOGLE_API_KEY);
    }
    public async genPrompt(tfiles: FileItem[], instruction: string, signal: AbortSignal): Promise<(Rtext|Rmedia)[]> { // Update return type promise
        // await sleep(2000000);
        const context: (Rtext|Rmedia)[] = [];
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
                upld_trk.updateState("error", error);
                throw new Error(error);
            }
            
        } else {upld_trk.updateState("complete", "File already in the cloud!");}
        
        // Add checks to ensure uploadData and file exist if upload was needed
        if (!tfile.uploadData?.file) {
            // Handle error: Upload might have failed or didn't produce expected data
            console.error("File upload data is missing after upload attempt.");
            // Return or throw an error appropriate for your application
            upld_trk.updateState("error", "File upload data is missing after upload attempt.")
            throw new Error("File upload data is missing after upload attempt."); // Or throw new Error(...)
        }
        const file = tfile.uploadData.file;
        context.push(
            {
                type: 'media',
                mimeType: file.mimeType,
                fileUri: file.uri,
            },
        );
    }
    if (context.length === 0) {
        const nofile = this.plugin.tracker.appendStep("No FILES provided", "The processor will work with the PROMPT", 'file');
        nofile.updateState("pending")
        // throw new Error("No Files Provided");
    }

        context.push({ type: 'text', text: instruction });
        // Return the extracted parts in an object
        return context;
    }
}
 
