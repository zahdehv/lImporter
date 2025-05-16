import { FileItem } from "./filesystem";
import { GoogleGenAI, Part } from "@google/genai";
import AutoFilePlugin from "../main";

export const createGeminiPreprocessor = (plugin: AutoFilePlugin, ai: GoogleGenAI) => {
    const preProcess = async (tfiles: FileItem[], signal: AbortSignal) => {
        
        const msg: (Part|string)[] = []
        
        msg.push({text: "A continuacion los archivos que deben ser procesados:" });
        for (const tfile of tfiles) {
            if (!tfile.uploaded) {
                const response = await ai.files.upload({file: tfile.blob, config:{abortSignal: signal, displayName: tfile.path, mimeType: tfile.mimeType}});
                tfile.file = (response.name && response.mimeType &&response.uri)?{name: response.name, mimeType: response.mimeType, uri: response.uri}: null;
                tfile.uploaded = true
            }
            if (signal.aborted) throw new Error("OP Aborted!");
            if (tfile.file) msg.push(
                {
                    fileData: 
                    {
                        fileUri: tfile.file.uri, 
                        mimeType: tfile.file.mimeType
                    }
                });
        }
        
        return msg;
    }
    return preProcess;
}

// Those are for the input scheme of LG
export interface Rtext {
    type: "text",
    text: string,
}
export interface Rmedia {
    type: "media",
    mimeType: string,
    fileUri: string,
}

export const createLangGraphPreprocessor = (plugin: AutoFilePlugin, ai: GoogleGenAI) => {
    
    const preProcess = async (tfiles: FileItem[], signal: AbortSignal): Promise<(Rtext|Rmedia)[]> => {

        const context: (Rtext|Rmedia)[] = [];

        context.push({ type: 'text', text: "A continuacion los archivos que deben ser procesados:" });
        for (const tfile of tfiles) {
            if (!tfile.uploaded) {
                const response = await ai.files.upload({file: tfile.blob, config:{abortSignal: signal, displayName: tfile.path, mimeType: tfile.mimeType}});
                tfile.file = (response.name && response.mimeType &&response.uri)?{name: response.name, mimeType: response.mimeType, uri: response.uri}: null;
                tfile.uploaded = true
            }
            // if (signal.aborted) throw new Error("OP Aborted!");
            if (tfile.file) context.push(
                {
                    type: 'media',
                    mimeType: tfile.file.mimeType,
                    fileUri: tfile.file.uri,
                },
            );
        }

        return context;
    }
    return preProcess
}