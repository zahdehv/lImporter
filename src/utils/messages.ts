import { FileItem, upload_file } from "./files";
import { GoogleGenAI, Part } from "@google/genai";
import AutoFilePlugin from "../main";
import { sign } from "crypto";

export const createGeminiPreprocessor = (plugin: AutoFilePlugin, ai: GoogleGenAI) => {
    const preProcess = async (tfiles: FileItem[], signal: AbortSignal) => {
        
        const msg: (Part|string)[] = []
        
        msg.push({text: "A continuacion los archivos que deben ser procesados:" });
        for (const tfile of tfiles) {
            if (!tfile.cloud_file) await upload_file(plugin.app, tfile, ai, signal);
            // if (signal.aborted) throw new Error("OP Aborted!");
            if (tfile.cloud_file) msg.push(
                {
                    fileData: 
                    {
                        fileUri: tfile.cloud_file.uri, 
                        mimeType: tfile.cloud_file.mimeType
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
            if (!tfile.cloud_file) await upload_file(plugin.app, tfile, ai, signal);
            // if (signal.aborted) throw new Error("OP Aborted!");
            if (tfile.cloud_file) context.push(
                {
                    type: 'media',
                    mimeType: tfile.cloud_file.mimeType,
                    fileUri: tfile.cloud_file.uri,
                },
            );
        }

        return context;
    }
    return preProcess
}