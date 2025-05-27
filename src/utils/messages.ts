import { FileItem, upload_file } from "./files"; // Assuming upload_file is correctly imported
import { createPartFromText, createPartFromUri, GoogleGenAI, PartUnion } from "@google/genai";
import lImporterPlugin from "../main";

export const createMessageslIm = (plugin: lImporterPlugin, ai: GoogleGenAI) => {
    const preProcess = async (tfiles: FileItem[], signal: AbortSignal): Promise<PartUnion[]> => {
        const messages: PartUnion[] = [];

        messages.push(createPartFromText("<|FILES TO PROCESS|>"));

        for (const tfile of tfiles) {
            if (signal.aborted) throw new Error("Operation Aborted!"); // Check signal before long operations

            if (!tfile.cloud_file) {
                await upload_file(plugin.app, tfile, ai, signal);
                // Re-check signal after await, as it might have been aborted during the upload
                if (signal.aborted) throw new Error("Operation Aborted during file upload!");
            }

            if (tfile.cloud_file) {
                messages.push(createPartFromUri(tfile.cloud_file.uri, tfile.cloud_file.mimeType));
            }
        }

        return messages;
    }
    return preProcess;
}