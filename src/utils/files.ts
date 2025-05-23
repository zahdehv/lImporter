import { App, TFolder, TFile, getAllTags, prepareFuzzySearch } from 'obsidian'; // Import App
import * as Diff from 'diff';
import { GoogleGenAI } from '@google/genai';


/**
 * Generates a string representation of a directory tree structure within the Obsidian vault.
 * It can optionally include:
 * - Full content for files with '.lim' in their name.
 * - 'keypoints' from frontmatter for .md files (if '.lim' is not in the name).
 *
 * @param app - The Obsidian App object.
 * @param rootPath - The starting path (use '/' or '' for vault root).
 * @param depth - The maximum recursion depth (1 = immediate children only).
 * @param includeFiles - Whether to include files in the listing.
 * @param showFileDetails - Whether to include content for '.lim' files or keypoints for .md files.
 * @param maxContentLines - Max lines of content for '.lim' files. Keypoints are always shown fully.
 * @returns A Promise that resolves with the formatted tree string.
 * @throws An error if the rootPath is not found or is not a folder.
 */
export async function listFilesTree(
    app: App, 
    rootPath: string,
    depth: number,
    includeFiles: boolean,
    showFileDetails: boolean = false,
    maxContentLines: number = 10
): Promise<string> {
    const vault = app.vault; 

    let normalizedPath = rootPath.trim();
    if (normalizedPath === '/' || normalizedPath === '') {
        normalizedPath = '/';
    } else {
        if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
            normalizedPath = normalizedPath.slice(0, -1);
        }
    }

    const rootNode = vault.getAbstractFileByPath(normalizedPath);

    if (!rootNode) {
        throw new Error(`Root path not found: ${normalizedPath}`);
    }
    if (!(rootNode instanceof TFolder)) {
        throw new Error(`Root path is not a folder: ${normalizedPath}`);
    }

    let output = `${normalizedPath === '/' ? '.' : rootNode.name}
`;

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

            const fileCache = (child instanceof TFile)? app.metadataCache.getFileCache(child): null;
            let tagStr = "";
            const tags = fileCache? getAllTags(fileCache): [];
            if (tags && tags.length>0) {
                tagStr+= "-> TAGS:"
                for (let index = 0; index < tags.length; index++) tagStr += " "+tags[index];
            }

            output += `${prefix}${connector}${child.name}${(child instanceof TFile)?` (link con [[${child.name}|{texto visible del link}]])`:""} ${tagStr}
`;

            if (child instanceof TFile && showFileDetails) {
                const fileNameLower = child.name.toLowerCase();
                if (fileNameLower.includes('.lim')) {
                    try {
                        const content = await vault.read(child);
                        const lines = content.split('
');
                        const lineCount = lines.length;
                        const linesToShow = lines.slice(0, maxContentLines);

                        for (const line of linesToShow) {
                            output += `${childPrefix}  ${line}
`;
                        }
                        if (lineCount > maxContentLines) {
                            output += `${childPrefix}  [...]
`;
                        }
                    } catch (readError) {
                        console.error(`Error reading .lim file ${child.path}:`, readError);
                        output += `${childPrefix}  [Error reading .lim content]
`;
                    }
                }
                else if (child.extension?.toLowerCase() === 'md') {
                    try {
                        if (fileCache?.frontmatter?.keypoints && Array.isArray(fileCache.frontmatter.keypoints)) {
                            const keypoints = fileCache.frontmatter.keypoints as any[];
                            if (keypoints.length > 0) {
                                output += `${childPrefix}  Keypoints:
`;
                                for (const point of keypoints) {
                                    output += `${childPrefix}    - ${String(point)}
`;
                                }
                            } else {
                                output += `${childPrefix}  [NO KEYPOINTS FOUND]
`;
                            }
                        } else {
                            output += `${childPrefix}  [NO KEYPOINTS FOUND]
`;
                        }
                    } catch (fmError) {
                        console.error(`Error accessing frontmatter for ${child.path}:`, fmError);
                        output += `${childPrefix}  [NO KEYPOINTS FOUND]
`;
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

    return `${title}
${output}`;
}

/**
 * Queries the Obsidian vault for markdown files matching a set of query terms.
 * The search is performed fuzzily. For a file to match:
 *   EACH query term must find a match in AT LEAST ONE of the file's metadata items
 *   (where metadata items are: the combined string of all tags, or an individual keypoint string).
 *
 * @param app - The Obsidian App object.
 * @param query - An array of strings, where each string is a query term.
 * @returns A Promise that resolves with a string containing the search results in an XML-like format.
 */
export async function queryVault(app: App, query: string[]): Promise<string> {
    const vault = app.vault;
    const metadataCache = app.metadataCache;
    const files = vault.getMarkdownFiles();
    const results: string[] = [];

    if (!query || query.length === 0) {
        return "";
    }

    const fuzzySearchers = query.map(term => prepareFuzzySearch(term.trim()));

    for (const file of files) {
        const fileCache = metadataCache.getFileCache(file);
        if (!fileCache) continue;

        const tagsInFile = getAllTags(fileCache);
        const keypointsInFile: string[] = [];
        if (fileCache.frontmatter?.keypoints) {
            const keypoints = fileCache.frontmatter.keypoints;
            if (Array.isArray(keypoints)) {
                keypoints.forEach(kp => {
                    if (typeof kp === 'string' && kp.trim() !== "") {
                        keypointsInFile.push(kp);
                    } else if (typeof kp === 'number' || typeof kp === 'boolean') {
                        keypointsInFile.push(String(kp));
                    }
                });
            } else if (typeof keypoints === 'string' && keypoints.trim() !== "") {
                keypointsInFile.push(keypoints);
            }
        }
        const searchableMetadataItems = keypointsInFile.concat(tagsInFile?tagsInFile:[]);
        if (searchableMetadataItems.length === 0) {
            continue; 
        }

        let allQueryTermsMatchFile = true;
        for (const fzz of fuzzySearchers) { 
            let currentQueryTermFoundInAnyItem = false;
            for (const item of searchableMetadataItems) { 
                if (fzz(item) !== null) {
                    currentQueryTermFoundInAnyItem = true;
                    break; 
                }
            }
            if (!currentQueryTermFoundInAnyItem) {
                allQueryTermsMatchFile = false;
                break; 
            }
        }

        if (allQueryTermsMatchFile) {
            try {
                const content = await vault.cachedRead(file);
                results.push(`<file path='${file.path}' link_to='[[${file.name}|{texto visible del link}]]'>
${content}
</file>`);
            } catch (e) {
                console.error(`Error reading file ${file.path} for query result:`, e);
            }
        }
    }

    return results.join('

');
}

interface Result {
    path: string;
    content: string;
    score: number;
}

interface Results {
    results: Result[];
    response:string;
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
export async function simpleQueryVault(app: App, queryString: string): Promise<Results> {
    const vault = app.vault;
    const metadataCache = app.metadataCache;
    const files = vault.getMarkdownFiles();
    const response: Results = {results: [], response:''};
    const result_parts = [];

    const trimmedQuery = queryString.trim();
    if (!trimmedQuery) {
        return {response: "No query found", results:[]}; 
    }

    const fzz = prepareFuzzySearch(trimmedQuery);

    for (const file of files) {
        const fileCache = metadataCache.getFileCache(file);
        if (!fileCache) continue;

        const searchableMetadataItems: string[] = [];
        const tagsInFile = getAllTags(fileCache); 
        if (tagsInFile && tagsInFile.length > 0) {
            searchableMetadataItems.push(...tagsInFile);
        }

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
            continue; 
        }

        let fileMatchesQuery = false;
        for (const item of searchableMetadataItems) { 
            if (fzz(item) !== null) {
                fileMatchesQuery = true;
                break; 
            }
        }

        if (fileMatchesQuery) {
            try {
                const content = await vault.cachedRead(file);
                result_parts.push(`<file path='${file.path}' link_to='[[${file.name}|{texto visible del link}]]'>
${content}
</file>`);
                response.results.push({path: file.path, content: content, score: 1});
            } catch (e) {
                console.error(`Error reading file ${file.path} for query result:`, e);
            }
        }
    }
    response.response = result_parts.join("

");
    return response;
}

export async function writeFileMD(app:App, path: string, content: string): Promise<string|null> {
    const vault = app.vault;
   console.log("path", path);

    const fileExists = await vault.adapter.exists(path); 

    const contentWithNewlines = content.replace(/\n/g, '
');
    const newContent = contentWithNewlines.replace(/---\s/g, '---
');
    const folderPath = path.split('/').slice(0, -1).join('/');
    const filePath = path;

    if (folderPath) {
        const folderExists = await vault.adapter.exists(folderPath);
        if (!folderExists) {
            await vault.createFolder(folderPath);
        }
    }
    const oldContent = fileExists? await vault.adapter.read(filePath):"";
    await vault.adapter.write(filePath, newContent);
    Diff.createPatch
    const diff = Diff.diffTrimmedLines(oldContent, newContent,{oneChangePerToken:false,});
    const patch = Diff.structuredPatch(path, path, oldContent, newContent, "XD", "XD", {ignoreNewlineAtEof: true, stripTrailingCr: true, }).hunks.map((hunk)=> hunk.lines.join("
")).join("
");
    return `\`\`\`diff
${patch}
\`\`\``

}

export const captureGhosts = (app: App) => {
    const files = app.vault.getMarkdownFiles();
    const ghostRefs: { sourceFile: string, unresolvedLink: string }[] = [];
    const metadataCache = app.metadataCache; 

    for (const file of files) {
        const links = metadataCache.getFileCache(file)?.links || [];

        for (const link of links) {
            const linkedFile = metadataCache.getFirstLinkpathDest(link.link, file.path);
            if (!linkedFile) {
                ghostRefs.push({
                    sourceFile: file.path,
                    unresolvedLink: link.link
                });
            }
        }
    }
    return ghostRefs;
}

//CLOUD
export interface FileItem {
    blob: Blob;
    title: string;
    path: string;
    mimeType: string;
    local_file: TFile; 
    cloud_file: {name: string, mimeType: string, uri: string} | null; 
}

// Corrected prepareFileData function
export async function prepareFileData(app: App, file: TFile): Promise<FileItem> { // Added app argument
        const arrayBuffer = await app.vault.readBinary(file); // Changed to use the 'app' argument
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

async function findFileBySha256(genAI: GoogleGenAI, localSha256:string) {
    try {
        const listFilesResponse = await genAI.files.list({config: {
            pageSize: 100, 
        }});

        for await(const remoteFile of listFilesResponse) {
            if (remoteFile.sha256Hash === localSha256) {
                return remoteFile; 
            }
        }
        console.log(`No file found with SHA256: ${localSha256}`);
        return null; 
    } catch (error) {
        console.error("Error listing files on Gemini:", error);
        throw error; 
    }
}

async function getChecksumSha256(blob: Blob): Promise<string> {
    const uint8Array = new Uint8Array(await blob.arrayBuffer());
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((h) => h.toString(16).padStart(2, '0')).join('');
}
  
export async function upload_file(app: App, file: FileItem, ai: GoogleGenAI, signal: AbortSignal) {
    try {
        const fileContentArrayBuffer = await app.vault.readBinary(file.local_file);
        const mimeType = file.mimeType;
        const blob = new Blob([fileContentArrayBuffer], { type: mimeType });
        const SHA256b64 = btoa(await getChecksumSha256(blob));
        let geminiFile = await findFileBySha256(ai, SHA256b64);

        if (geminiFile) {
            console.log(`File "${file.title}" (SHA256: ${SHA256b64}) already exists on Gemini as "${geminiFile.name}". URI: ${geminiFile.uri}`);
            file.cloud_file = (geminiFile.name && geminiFile.mimeType &&geminiFile.uri)?{name: geminiFile.name, mimeType: geminiFile.mimeType, uri: geminiFile.uri}: null;    
            return geminiFile;
        } else {
            console.log(`File "${file.title}" (SHA256: ${SHA256b64}) not found on Gemini. Uploading...`);           
            geminiFile = await ai.files.upload({file: file.blob, config:{abortSignal: signal, displayName: file.path, mimeType: file.mimeType}});
            file.cloud_file = (geminiFile.name && geminiFile.mimeType &&geminiFile.uri)?{name: geminiFile.name, mimeType: geminiFile.mimeType, uri: geminiFile.uri}: null;    
            console.log(`File "${file.title}" uploaded successfully. Name: ${geminiFile.name}, URI: ${geminiFile.uri}`);
            return geminiFile;
        }
    } catch (error) {
        console.error(`Error processing file "${file.title}" for Gemini:`, error);
        return null;
    }
}
