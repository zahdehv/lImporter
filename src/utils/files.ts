import { App, TFolder, TFile, getAllTags, prepareFuzzySearch, FuzzySuggestModal } from 'obsidian'; // Import App
import * as Diff from 'diff';
import { GoogleGenAI, Type } from '@google/genai';
import lImporterPlugin from 'src/main';
import { describe } from 'node:test';
import { models } from 'src/agents/agen';

export class FileSuggestionModal extends FuzzySuggestModal<TFile> {
    private didSubmit: boolean = false;

    constructor(
        app: App,
        private validExtensions: string[], // This will receive all supported extensions
        private callback: (file: TFile | null) => void
    ) {
        super(app);
    }

    getItems(): TFile[] {
        return this.app.vault.getFiles().filter(file =>
            this.validExtensions.includes(file.extension.toLowerCase())
        );
    }

    getItemText(file: TFile): string {
        return file.name;
    }

    onChooseItem(file: TFile): void {
        this.didSubmit = true;
        this.callback(file);
    }

    onClose(): void {
        if (!this.didSubmit) {
            this.callback(null);
        }
    }
}

/**
 * Generates a string representation of a directory tree structure within the Obsidian vault.
 * It can optionally include:
 * - Full content for files with '.lim' in their name.
 * - 'keypoints' from frontmatter for .md files (if '.lim' is not in the name).
 *
 * @param app - The Obsidian App object. // << CHANGED
 * @param rootPath - The starting path (use '/' or '' for vault root).
 * @param depth - The maximum recursion depth (1 = immediate children only).
 * @param includeFiles - Whether to include files in the listing.
 * @param showFileDetails - Whether to include content for '.lim' files or keypoints for .md files.
 * @param maxContentLines - Max lines of content for '.lim' files. Keypoints are always shown fully.
 * @returns A Promise that resolves with the formatted tree string.
 * @throws An error if the rootPath is not found or is not a folder.
 */
export async function treeHELPER(
    app: App, // << CHANGED: Accept App instance
    rootPath: string,
    depth: number,
    includeFiles: boolean,
    showFileDetails: boolean = false,
    maxContentLines: number = 10
): Promise<string> {
    const vault = app.vault; // Get vault from app

    let normalizedPath = rootPath.trim();
    if (normalizedPath === '/' || normalizedPath === '') {
        normalizedPath = '/';
    } else {
        if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
            normalizedPath = normalizedPath.slice(0, -1);
        }
    }

    // Use app.vault here
    const rootNode = vault.getAbstractFileByPath(normalizedPath);

    if (!rootNode) {
        throw new Error(`Root path not found: ${normalizedPath}`);
    }
    if (!(rootNode instanceof TFolder)) {
        throw new Error(`Root path is not a folder: ${normalizedPath}`);
    }

    let output = `${normalizedPath === '/' ? '.' : rootNode.name}\n`;

    const buildTree = async (folder: TFolder, currentDepth: number, prefix: string) => {
        if (currentDepth > depth) {
            return;
        }

        const children = folder.children.sort((a, b) => {
            const aIsFolder = a instanceof TFolder;
            const bIsFolder = b instanceof TFolder;
            if (aIsFolder !== bIsFolder) {
                return aIsFolder ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        const itemsToList = includeFiles ? children : children.filter(child => child instanceof TFolder);

        for (let i = 0; i < itemsToList.length; i++) {
            const child = itemsToList[i];
            const isLast = i === itemsToList.length - 1;
            const connector = isLast ? "└───" : "├───";
            const childPrefix = prefix + (isLast ? "    " : "│   ");

            const fileCache = (child instanceof TFile) ? app.metadataCache.getFileCache(child) : null;

            output += `${prefix}${connector}${child.name}${(child instanceof TFile) ? ` (link con [[${child.name}|{texto visible del link}]])` : ""}\n`;

            // --- START CONTENT/KEYPOINTS HANDLING ---
            if (child instanceof TFile && showFileDetails) {
                const fileNameLower = child.name.toLowerCase();

                // Condition 1: File name contains '.lim'
                if (fileNameLower.includes('.lim')) {
                    try {
                        // Use app.vault here
                        const content = await vault.read(child);
                        const lines = content.split('\n');
                        const lineCount = lines.length;
                        const linesToShow = lines.slice(0, maxContentLines);

                        for (const line of linesToShow) {
                            output += `${childPrefix}  ${line}\n`;
                        }
                        if (lineCount > maxContentLines) {
                            output += `${childPrefix}  [...]\n`;
                        }
                    } catch (readError) {
                        console.error(`Error reading .lim file ${child.path}:`, readError);
                        output += `${childPrefix}  [Error reading .lim content]\n`;
                    }
                }
            }

            if (child instanceof TFolder) {
                await buildTree(child, currentDepth + 1, childPrefix);
            }
        }
    };

    await buildTree(rootNode, 1, "");

    const fileInclusion = includeFiles ? 'including' : 'excluding';
    let detailDisplay = 'excluding file details';
    if (showFileDetails) {
        detailDisplay = `showing details (.lim content up to ${maxContentLines} lines / .md keypoints)`;
    }
    const title = `Directory structure for '${normalizedPath}' (depth ${depth}, ${fileInclusion} files, ${detailDisplay}):`;

    return `${title}\n${output}`;
}

interface Result {
    path: string;
    content: string;
    score: number;
}

interface Results {
    results: Result[];
    response: string;
}

/**
 * Queries the Obsidian vault for markdown files where a single query string
 * fuzzily matches AT LEAST ONE of the file's metadata items
 * (where metadata items are: the combined string of all tags, or an individual keypoint string).
 *
 * @param app - The Obsidian App object.
 * @param queryString - The single string to search for.
 * @returns A Promise that resolves with a string containing the search results in an XML-like format.
 */
export async function queryHELPER(app: App, queryString: string): Promise<Results> {
    const vault = app.vault;
    const metadataCache = app.metadataCache;
    const files = vault.getMarkdownFiles();
    const response: Results = { results: [], response: '' };
    const result_parts = [];

    const trimmedQuery = queryString.trim();
    if (!trimmedQuery) {
        return { response: "No query found", results: [] }; // No query string, so no results.
    }

    const fzz = prepareFuzzySearch(trimmedQuery);

    for (const file of files) {
        const fileCache = metadataCache.getFileCache(file);
        if (!fileCache) continue;

        const searchableMetadataItems: string[] = [];

        // 1. Add combined tags string as one searchable item
        const tagsInFile = getAllTags(fileCache); // Returns tags like ["#tag1", "#tag2"]
        if (tagsInFile && tagsInFile.length > 0) {
            // For fuzzy search, it's often better to search each tag individually
            // or a string of them. The provided `queryVault` concatenated them.
            // Let's stick to the pattern of your `queryVault` where tags are treated as individual items.
            searchableMetadataItems.push(...tagsInFile);
        }

        // 2. Add each keypoint as an individual searchable item
        if (fileCache.frontmatter?.keypoints) {
            const keypoints = fileCache.frontmatter.keypoints;
            if (Array.isArray(keypoints)) {
                keypoints.forEach(kp => {
                    if (typeof kp === 'string' && kp.trim() !== "") {
                        searchableMetadataItems.push(kp);
                    } else if (typeof kp === 'number' || typeof kp === 'boolean') {
                        searchableMetadataItems.push(String(kp));
                    }
                });
            } else if (typeof keypoints === 'string' && keypoints.trim() !== "") {
                searchableMetadataItems.push(keypoints);
            }
        }

        if (searchableMetadataItems.length === 0) {
            continue; // No metadata to search in this file
        }

        let fileMatchesQuery = false;
        for (const item of searchableMetadataItems) { // Check against each metadata item
            if (fzz(item) !== null) {
                fileMatchesQuery = true;
                break; // Query string found a match in one of the items, this file is a match
            }
        }

        if (fileMatchesQuery) {
            try {
                const content = await vault.cachedRead(file);
                // Following your latest queryVault, not sanitizing path or content for XML
                result_parts.push(`<file path='${file.path}' link_to='[[${file.name}|{texto visible del link}]]'>\n${content}\n</file>`);
                response.results.push({ path: file.path, content: content, score: 1 });
            } catch (e) {
                console.error(`Error reading file ${file.path} for query result:`, e);
            }
        }
    }
    response.response = result_parts.join("\n\n");
    return response;
}

export const ghostHELPER = (app: App, file: TFile | null) => {
    const ghostRefs: string[] = [", but the following linked items does not exist in the vault:"];
    const metadataCache = app.metadataCache; // Get cache from plugin
    if (!file) return ""
    const links = metadataCache.getFileCache(file)?.links || [];

    for (const link of links) {
        const linkedFile = metadataCache.getFirstLinkpathDest(link.link, file.path);
        if (!linkedFile) ghostRefs.push("- " + link.link);
    }
    if (ghostRefs.length > 1) {
        ghostRefs.push("If the user asks for it, you know what files must be created.")
        return ghostRefs.join("\n");
    }
    return "";
}

export async function writeHELPER(app: App, path: string, content: string): Promise<{ message: string, diff: string }> {
    const vault = app.vault;
    console.log("path", path);
    if (path.includes(".lim")) return { message: `Error al escribir archivo: ${"Cannot write a .lim file"}`, diff: "" };

    const fileExists = await vault.adapter.exists(path);

    const contentWithNewlines = content.replace(/\\n/g, '\n');
    const newContent = contentWithNewlines.replace(/---\s/g, '---\n');
    const folderPath = path.split('/').slice(0, -1).join('/');
    const filePath = path;

    vault.adapter.mkdir(folderPath);

    const oldContent = fileExists ? await vault.adapter.read(filePath) : "";
    await vault.adapter.write(filePath, newContent);
    Diff.createPatch
    const diff = Diff.structuredPatch(path, path, oldContent, newContent, "", "", { ignoreNewlineAtEof: true, stripTrailingCr: true, }).hunks.map((hunk) => hunk.lines.join("\n")).join("\n");
    await sleep(1000);
    const createdFile = vault.getFileByPath(path);
    const ghostMsg = ghostHELPER(app, createdFile);
    return { message: `File '${path}' write ran succesfully${ghostMsg}`, diff: diff };

}

export async function moveHELPER(app: App, source: string, target: string) {
    if (source.includes(".lim")) return "Cannot move a .lim file";

    const file = app.vault.getAbstractFileByPath(source);
    if (!file) return `File not found: ${source}`;

    const targetDir = target.split('/').slice(0, -1).join('/');
    if (targetDir && !await app.vault.adapter.exists(targetDir)) {
        await app.vault.createFolder(targetDir);
    }

    await app.fileManager.renameFile(file, target);
    return (`File moved successfully from ${source} to ${target}`);
}

//CLOUD
export interface FileItem {
    blob: Blob;
    title: string;
    path: string;
    mimeType: string;
    local_file: TFile; // Type 'any' can be refined if after-upload data structure is known
    cloud_file: { name: string, mimeType: string, uri: string } | null; // Type 'any' can be refined if after-upload data structure is known

}

export async function prepareFileData(file: TFile): Promise<FileItem> {
    const arrayBuffer = await this.app.vault.readBinary(file);
    const typeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        m4a: 'audio/mp4',
        aac: 'audio/aac',
        flac: 'audio/flac',
        aiff: 'audio/aiff',
        png: 'image/png',
        jpg: 'image/jpg',
        jpeg: 'image/jpeg',
        pdf: 'application/pdf',
        md: 'text/markdown',
        txt: 'text/plain',
        gif: 'image/gif',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
    };

    const mime = typeMap[file.extension.toLowerCase()] || 'application/octet-stream';
    const blob = new Blob([arrayBuffer], { type: mime });
    return {
        blob: blob,
        title: file.name,
        path: file.path,
        mimeType: mime,
        local_file: file,
        cloud_file: null
    };
}


async function findFileBySha256(genAI: GoogleGenAI, localSha256: string) {
    // console.log(`Searching for file with SHA256: ${localSha256}`);
    try {
        // The `files` manager is available directly on the genAI instance
        const listFilesResponse = await genAI.files.list({
            config: {
                pageSize: 100, // Adjust as needed, max 100
            }
        });
        // const files = listFilesResponse.files || []; // Ensure files is an array

        for await (const remoteFile of listFilesResponse) {
            // console.log(remoteFile.displayName, remoteFile.sha256Hash);
            if (remoteFile.sha256Hash === localSha256) {
                // console.log(`File found on Gemini with SHA256: ${localSha256}, Name: ${remoteFile.name}, URI: ${remoteFile.uri}`);
                return remoteFile; // Found the file
            }
        }

        console.log(`No file found with SHA256: ${localSha256}`);
        return null; // File not found
    } catch (error) {
        console.error("Error listing files on Gemini:", error);
        throw error; // Re-throw to be handled by the caller
    }
}


async function getChecksumSha256(blob: Blob): Promise<string> {
    const uint8Array = new Uint8Array(await blob.arrayBuffer());
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray.map((h) => h.toString(16).padStart(2, '0')).join('');
}


export async function upload_file(app: App, file: FileItem, ai: GoogleGenAI, signal: AbortSignal) {
    const fileContentArrayBuffer = await app.vault.readBinary(file.local_file);

    const mimeType = file.mimeType;
    const blob = new Blob([fileContentArrayBuffer], { type: mimeType });
    const SHA256b64 = btoa(await getChecksumSha256(blob));

    let geminiFile = await findFileBySha256(ai, SHA256b64);

    if (geminiFile) {
        console.log(`File "${file.title}" (SHA256: ${SHA256b64}) already exists on Gemini as "${geminiFile.name}". URI: ${geminiFile.uri}`);
        file.cloud_file = (geminiFile.name && geminiFile.mimeType && geminiFile.uri) ? { name: geminiFile.name, mimeType: geminiFile.mimeType, uri: geminiFile.uri } : null;

        return geminiFile;
    } else {

        console.log(`File "${file.title}" (SHA256: ${SHA256b64}) not found on Gemini. Uploading...`);

        geminiFile = await ai.files.upload({ file: file.blob, config: { abortSignal: signal, displayName: file.path, mimeType: file.mimeType } });
        file.cloud_file = (geminiFile.name && geminiFile.mimeType && geminiFile.uri) ? { name: geminiFile.name, mimeType: geminiFile.mimeType, uri: geminiFile.uri } : null;

        console.log(`File "${file.title}" uploaded successfully. Name: ${geminiFile.name}, URI: ${geminiFile.uri}`);
        return geminiFile;
    }
}

interface res {
    retrieved_items: {
        path: string;
        summary: string;
        keypoints: string[];
    }[]
}

export async function CPRS(plugin: lImporterPlugin, query_keypoints: string[], batch_size = 10) {
    const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
    const files = plugin.app.vault.getMarkdownFiles(); // Consider using all files

    const path_to_link: Record<string, string> = {}
    // const path_to_file: Record<string, TFile> = {}

    files.forEach(file => {
        // path_to_file[file.path] = file;
        path_to_link[file.path] = plugin.app.fileManager
            .generateMarkdownLink(
                file,
                "/",
                undefined,
                "{here you can use any alias to show in the document}");
    });

    console.log(Object.keys(path_to_link));
    console.log(path_to_link);


    // here goes the batch function...
    const processBATCH = async (batch_files: TFile[], no: number) => {
        const retr_stp = plugin.tracker.appendStep("Processing Batch NO: "+no, "Retrieving data...", 'file-search', 'in-progress');
        const path_options = batch_files.map(file => file.path);
        console.log("Processing files:\n"+path_options.join("\n"));
        const context_list = [];
        for (let index = 0; index < batch_files.length; index++) {
            const b_file = batch_files[index];
            const b_file_content = await plugin.app.vault.cachedRead(b_file);
            context_list.push(`<file path='${b_file.path}'>\n${b_file_content}\n</file>`)
        }
        const context_files = context_list.join("\n\n");
        const config = {
            temperature: 0.55,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                required: ["retrieved_items"],
                properties: {
                    retrieved_items: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            required: ["path", "keypoints", "summary"],
                            properties: {
                                path: {
                                    type: Type.STRING,
                                    enum: path_options,
                                },
                                keypoints: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.STRING,
                                        enum: query_keypoints,
                                    },
                                },
                                summary: {
                                    type: Type.STRING,
                                },
                            },
                        },
                    },
                },
            },
        };

        const contents = [
            {
                role: 'user',
                parts: [
                    {
                        text: context_files+"\n\nPlease extract those files that contain content related to a greater than zero amount of the provided keypoints: \n"+ query_keypoints.map(i=>"- "+i).join("\n")+ " and sumarize why is the content of those files relevant.",
                    },
                ],
            },
        ];

        const response = await ai.models.generateContent({
            model: models.flash25,
            config,
            contents,
        });
        if (response.text) {
            const ob: res = JSON.parse(response.text);
            const answer_parts: string[] = [];
            ob.retrieved_items.forEach(item=> {
                const keypoints = item.keypoints.map(kp=>"- "+kp).join("\n");
                const retrieved = `The file '${item.path}'(link to this note using '${path_to_link[item.path]}') contains the following keypoints:\n${keypoints}\nSummary: ${item.summary}`;
                answer_parts.push(retrieved);
                retr_stp.appendFile(plugin, item.path, retrieved);
            });
            retr_stp.updateState('complete');
            
            return answer_parts.join("\n\n");
        }
        retr_stp.updateState('pending');
        return ""
    }

    // here goes the for
    const batches: Promise<string>[] = [];
    for (let s = 0; s < files.length; s += batch_size) {
        const elements = files.slice(s, s + batch_size);
        batches.push(processBATCH(elements, (s+batch_size)/batch_size));
    }
    const result = (await Promise.all(batches)).join("\n");
    return result;
    /// Consider output type here...
}


//     for await (const chunk of response) {
//       console.log(chunk.text);
//     }
//   }
