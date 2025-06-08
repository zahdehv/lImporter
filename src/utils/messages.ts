import { FileItem, upload_file } from "./files"; // Assuming upload_file is correctly imported
import { createPartFromText, createPartFromUri, GoogleGenAI, PartUnion } from "@google/genai";
import lImporterPlugin from "../main";

export const createMessageslIm = (plugin: lImporterPlugin, ai: GoogleGenAI) => {
    const preProcess = async (tfiles: FileItem[]): Promise<PartUnion[]> => {
        const messages: PartUnion[] = [];

        // const prep = plugin.tracker.appendStep("Preprocessing files...", "Uploading and building prompt...", 'upload', 'in-progress');
        // messages.push(createPartFromText("<|FILES TO PROCESS|>"));

        for (const tfile of tfiles) {
            if (plugin.tracker.abortController.signal.aborted) throw new Error("Operation Aborted!"); // Check signal before long operations

            if (!tfile.cloud_file) {
                await upload_file(plugin.app, tfile, ai, plugin.tracker.abortController.signal);
                // Re-check signal after await, as it might have been aborted during the upload
                if (plugin.tracker.abortController.signal.aborted) throw new Error("Operation Aborted during file upload!");
            }

            if (tfile.cloud_file) {
                messages.push(createPartFromUri(tfile.cloud_file.uri, tfile.cloud_file.mimeType));
                // prep.appendFile(plugin, tfile.path, "File uploaded");
            }
        }
        // prep.updateState('complete');
        return messages;
    }
    return preProcess;
}