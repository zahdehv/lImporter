import { Notice } from 'obsidian'; // To show notices in Obsidian

export interface AudioItem {
    url: string;
    uploaded: boolean;
    uploadData: any | null; // Type 'any' can be refined if after-upload data structure is known
}


/**
 * Class to handle audio uploads to Google AI Files API.
 */
export class AudioUploader {
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
     * Uploads an audio blob from an Obsidian blob URL to Google AI Files API.
     *
     * @param blobUrl The Obsidian blob URL of the audio file.
     * @param displayName  The desired display name for the uploaded file (optional, defaults to 'audio_recording').
     * @param mimeType The MIME type of the audio file (optional, defaults to 'audio/mpeg').
     * @returns An object containing the upload response and the file name, or null if upload fails or API key is missing.
     */
    async uploadAudioBlob(audio: AudioItem, displayName: string = 'audio_recording', mimeType: string = 'audio/mpeg'): Promise<{ uploadResponse: any, name: string } | null> {
        //blobUrl: string, 
        const blobUrl = audio.url;

        if (!this.apiKey) {
            new Notice("Google AI File Manager not initialized. API Key missing.");
            return null;
        }

        try {
            // Download data from blob URL
            const res = await fetch(blobUrl);
            if (!res.ok) {
                new Notice(`Failed to fetch blob data: ${res.status} ${res.statusText}`);
                return null;
            }
            const buffer = await res.arrayBuffer();

            // Upload the downloaded data.
            const formData = new FormData();
            const metadata = { file: { mimeType: mimeType, displayName: displayName } };
            formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: 'application/json' })); // Changed to 'type'
            formData.append("file", new Blob([buffer], { type: mimeType })); // Changed to 'type'
            const res2 = await fetch(
                `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${this.apiKey}`,
                { method: "post", body: formData }
            );

            if (!res2.ok) {
                const errorResponse = await res2.json(); // Try to get error details from response
                new Notice(`File upload failed: ${res2.status} ${res2.statusText} - ${errorResponse?.error?.message || 'No details'}`);
                return null;
            }

            const uploadResponse = await res2.json();

            // View the response and log items
            console.log(`Uploaded file ${uploadResponse.file.displayName} as: ${uploadResponse.file.uri}`);
            const name = uploadResponse.file.name;

            audio.uploadData = uploadResponse;
            audio.uploaded = true;

            return { uploadResponse, name };

        } catch (error) {
            console.error("Error during audio blob upload:", error);
            new Notice(`Error during audio upload: ${error.message}`);
            return null;
        }
    }
}

// Example usage in your Obsidian plugin:

// 1. Initialize AudioUploader with your API key (get API key from your plugin settings!)
// const apiKey = /* ... your API key from settings ... */;
// const audioUploader = new AudioUploader(apiKey);

// 2. When you want to upload an audio blob:
/*
const audioBlobUrl = /* ... your blob URL from audio recording ... */;

// audioUploader.uploadAudioBlob(audioBlobUrl, "My Obsidian Recording", "audio/webm") // Adjust mimeType if needed
//     .then(result => {
//         if (result) {
//             console.log("Upload successful!", result);
//             new Notice(`Audio uploaded successfully: ${result.uploadResponse.file.displayName}`);
//             // You can now use result.name (file name) or result.uploadResponse (full API response)
//             // for further processing.
//         } else {
//             console.warn("Audio upload failed. See console for details or notices.");
//         }
//     });
// */