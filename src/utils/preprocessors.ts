import { FileItem } from "./uploader";
import { GoogleGenAI, Part } from "@google/genai";
import { createCustomFileUploader } from "./uploader";
import AutoFilePlugin from "../main";
import { listFilesTree } from "./filesystem";

export const createGeminiPreprocessor = (plugin: AutoFilePlugin, ai: GoogleGenAI) => {
    const preProcess = async (tfiles: FileItem[], prompt: string, signal: AbortSignal) => {
        const msg: (Part|string)[] = []
        
        // Uploaded files
        msg.push({text: "A continuacion los archivos que deben ser procesados:" });
        for (let index = 0; index < tfiles.length; index++) {
            const element = tfiles[index];
            if (!element.uploaded) {
                const response = await ai.files.upload({file: element.blob, config:{abortSignal: signal, displayName: element.path, mimeType: element.mimeType}});
                element.uploadData = (response.name && response.mimeType &&response.uri)?{file: {name: response.name, mimeType: response.mimeType, uri: response.uri}}: null;
                element.uploaded = true
            }
            if (signal.aborted) throw new Error("OP Aborted!");
            if (element.uploadData) msg.push({fileData: {fileUri: element.uploadData.file.uri, mimeType: element.uploadData.file.mimeType}});
        }
        // Prompt
        msg.push({text: "A continuacion la peticion del usuario respecto a los archivos:"});
        msg.push({text: prompt});
        return msg;
    }
    return preProcess;
}

export const createCustomGeminiPreprocessor = (plugin: AutoFilePlugin) => {
    const upload = createCustomFileUploader(plugin.settings.GOOGLE_API_KEY);
    const preProcess = async (tfiles: FileItem[], prompt: string, signal: AbortSignal) => {
        const msg: (Part|string)[] = []
        for (let index = 0; index < tfiles.length; index++) {
            const element = tfiles[index];
            const response = await upload(element, signal);
            if (signal.aborted) throw new Error("OP Aborted!");
            if (response) {
                msg.push({fileData: {fileUri: response?.file.uri, mimeType: response?.file.mimeType}});
            } else throw new Error("File Response ERROR!");
        }
        //COLD START DATA
        const tree = await listFilesTree(plugin.app, "", 3, true, true, 23)
        msg.push({text: tree });
        msg.push(prompt);
        return msg;}
    return preProcess;
}

// Those are for the input scheme of LG
interface Rtext {
    type: "text",
    text: string,
}
interface Rmedia {
    type: "media",
    mimeType: string,
    fileUri: string,
}

export const createLangGraphPreprocessor = (plugin: AutoFilePlugin) => {
    const uploader = createCustomFileUploader(plugin.settings.GOOGLE_API_KEY)
    const preProcess = async (tfiles: FileItem[], prompt: string, signal: AbortSignal): Promise<(Rtext|Rmedia)[]> => {
        // await sleep(2000000);
        const context: (Rtext|Rmedia)[] = [];
        for (const tfile of tfiles) {
            const upld_trk = plugin.tracker.appendStep("File Upload", tfile.title, "upload");
            if (signal.aborted) break;

        if (!tfile.uploaded) {
            try {
                await uploader(tfile, signal); 
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
        const nofile = plugin.tracker.appendStep("No FILES provided", "The processor will work with the PROMPT", 'file');
        nofile.updateState("pending")
        // throw new Error("No Files Provided");
    }
        const tree = await listFilesTree(plugin.app, "", 3, true, true, 23)
        context.push({ type: 'text', text: tree });
        context.push({ type: 'text', text: prompt });
        // Return the extracted parts in an object
        return context;
    }
    return preProcess
}