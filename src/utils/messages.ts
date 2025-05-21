import { FileItem, listFilesTree, upload_file } from "./files"; // Assuming upload_file is correctly imported
import { createPartFromText, createPartFromUri, GoogleGenAI, Part } from "@google/genai";
import lImporterPlugin from "../main";

// Those are for the input scheme of LangGraph (LG)
export interface Rtext {
    type: "text",
    text: string,
}
export interface Rmedia {
    type: "media",
    mimeType: string,
    fileUri: string,
}

interface Formatters<OutputType> {
    formatText: (text: string) => OutputType;
    formatMedia: (cloudFile: {mimeType: string, uri: string}) => OutputType;
}

export const createMessageslIm = <OutputType>(plugin: lImporterPlugin, ai: GoogleGenAI, formatters: Formatters<OutputType> ) => {
    const preProcess = async (tfiles: FileItem[], signal: AbortSignal): Promise<OutputType[]> => {
        const messages : OutputType[] = [];
        const tree = await listFilesTree(plugin.app, "", 3, true, true, 23);
        
        messages.push(formatters.formatText("<|VAULT DIRECTORY TREE|>"));
        messages.push(formatters.formatText(tree));
        messages.push(formatters.formatText("<|FILES TO PROCESS|>"));

        for (const tfile of tfiles) {
            if (signal.aborted) throw new Error("Operation Aborted!"); // Check signal before long operations
            
            if (!tfile.cloud_file) {
                await upload_file(plugin.app, tfile, ai, signal);
                // Re-check signal after await, as it might have been aborted during the upload
                if (signal.aborted) throw new Error("Operation Aborted during file upload!");
            }
            
            if (tfile.cloud_file) {
                messages.push(formatters.formatMedia(tfile.cloud_file));
            }
        }
        
        return messages;
    }
    return preProcess;
}

export const geminiFormatters: Formatters<Part|string> = {
    formatText: (text: string): Part => (createPartFromText(text)),
    formatMedia: (cloudFile: {mimeType: string, uri: string}): Part => (createPartFromUri(cloudFile.uri, cloudFile.mimeType))
};

export const langGraphFormatters: Formatters<Rtext|Rmedia> = {
    formatText: (text: string): Rtext => ({
        type: 'text',
        text: text,
    }),
    formatMedia: (cloudFile: {mimeType: string, uri: string}): Rmedia => ({
        type: 'media',
        mimeType: cloudFile.mimeType,
        fileUri: cloudFile.uri,
    })
};
