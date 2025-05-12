import { Notice } from 'obsidian'; // To show notices in Obsidian

export interface FileItem {
    url: string;
    blob: Blob;
    title: string;
    path: string;
    mimeType: string;
    uploaded: boolean;
    uploadData: any | null; // Type 'any' can be refined if after-upload data structure is known
}


/**
 * Class to handle t_file uploads to Google AI Files API.
 */
export class FileUploader {
    private apiKey: string;

    constructor(apiKey: string) {
        if (!apiKey) {
            new Notice("API Key is not set. Please set your Google AI API key in plugin settings.");
            this.apiKey = ""; // Initialize apiKey to empty string to avoid errors later
        } else {
            this.apiKey = apiKey;
        }
    }

    /**
     * Uploads an t_file blob from an Obsidian blob URL to Google AI Files API.
     *
     * @param blobUrl The Obsidian blob URL of the t_file file.
     * @returns An object containing the upload response and the file name, or null if upload fails or API key is missing.
     */
    async uploadFileBlob(t_file: FileItem, signal: AbortSignal): Promise<{ uploadResponse: any, name: string } | null> {
        //blobUrl: string, 
        const blobUrl = t_file.url;

        if (!this.apiKey) {
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
            `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${this.apiKey}`,
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

        return { uploadResponse, name };

        
    }
}