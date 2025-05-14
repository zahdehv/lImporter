import { Notice } from 'obsidian'; // To show notices in Obsidian

export interface FileItem {
    url: string;
    blob: Blob;
    title: string;
    path: string;
    mimeType: string;
    uploaded: boolean;
    uploadData: {file: {name: string, mimeType: string, uri: string}} | null; // Type 'any' can be refined if after-upload data structure is known
}

export const createCustomFileUploader = (apiKey: string) => {
    if (!apiKey) {
        throw new Error("API Key is not set. Please set your Google AI API key in plugin settings.");
    }
    const fileUploader = async (t_file: FileItem, signal: AbortSignal): Promise<{file: {name: string, mimeType: string, uri: string}}|null> => {
        //blobUrl: string, 
        const blobUrl = t_file.url;

        if (!apiKey) {
            throw new Error("Google AI File Manager not initialized. API Key missing.");
        }

      
        // Download data from blob URL
        const res = await fetch(blobUrl,{signal: signal});
        if (!res.ok) {
            throw new Error(`Faissled to fetch blob data: ${res.status} ${res.statusText}`);
            return null;
        }
        const buffer = await res.arrayBuffer();

        // Upload the downloaded data.
        const formData = new FormData();
        const metadata = { file: { mimeType: t_file.mimeType, displayName: t_file.path } };
        formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: 'application/json' })); // Changed to 'type'
        formData.append("file", new Blob([buffer], { type: t_file.mimeType })); // Changed to 'type'
        const res2 = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${apiKey}`,
            { method: "post", body: formData, signal: signal }
        );

        if (!res2.ok) {
            const errorResponse = await res2.json(); // Try to get error details from response
            throw new Error(`File upload failed: ${res2.status} ${res2.statusText} - ${errorResponse?.error?.message || 'No details'}`);
            return null;
        }

        const uploadResponse = await res2.json();

        // View the response and log items
        // console.log(`Uploaded file ${uploadResponse.file.displayName} as: ${uploadResponse.file.uri}`);
        const name = uploadResponse.file.name;

        t_file.uploadData = uploadResponse;
        t_file.uploaded = true;

        if (signal.aborted) {
            throw new Error("Aborted!");
            
        }

        return uploadResponse;
    }
    return fileUploader;
}