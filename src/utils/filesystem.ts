import { App, TFolder, TFile, getAllTags, prepareFuzzySearch } from 'obsidian'; // Import App
import * as Diff from 'diff';

export interface FileItem {
    url: string;
    blob: Blob;
    title: string;
    path: string;
    mimeType: string;
    uploaded: boolean;
    file: {name: string, mimeType: string, uri: string} | null; // Type 'any' can be refined if after-upload data structure is known
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
export async function listFilesTree(
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

            const fileCache = (child instanceof TFile)? app.metadataCache.getFileCache(child): null;
            // Tags
            let tagStr = "";
            const tags = fileCache? getAllTags(fileCache): [];
            if (tags && tags.length>0) {
                tagStr+= "-> TAGS:"
                for (let index = 0; index < tags.length; index++) tagStr += " "+tags[index];
            }

            output += `${prefix}${connector}${child.name}${(child instanceof TFile)?` (link con [[${child.name}|{texto visible del link}]])`:""} ${tagStr}\n`;

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
                // Condition 2: File is .md (and not a .lim file, implicitly by order)
                else if (child.extension?.toLowerCase() === 'md') {
                    try {
                        // Use app.metadataCache directly here << CORRECTED

                        if (fileCache?.frontmatter?.keypoints && Array.isArray(fileCache.frontmatter.keypoints)) {
                            const keypoints = fileCache.frontmatter.keypoints as any[];
                            if (keypoints.length > 0) {
                                output += `${childPrefix}  Keypoints:\n`;
                                for (const point of keypoints) {
                                    output += `${childPrefix}    - ${String(point)}\n`;
                                }
                            } else {
                                output += `${childPrefix}  [NO KEYPOINTS FOUND]\n`;
                            }
                        } else {
                            output += `${childPrefix}  [NO KEYPOINTS FOUND]\n`;
                        }
                    } catch (fmError) {
                        console.error(`Error accessing frontmatter for ${child.path}:`, fmError);
                        output += `${childPrefix}  [NO KEYPOINTS FOUND]\n`;
                    }
                }
            }
            // --- END CONTENT/KEYPOINTS HANDLING ---

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

    return `${title}\n\`\`\`\n${output}\`\`\``;
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

        
        // 1. Add combined tags string as one searchable item
        const tagsInFile = getAllTags(fileCache);
        
        // 2. Add each keypoint as an individual searchable item
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
            continue; // No metadata to search in this file
        }

        let allQueryTermsMatchFile = true;
        for (const fzz of fuzzySearchers) { // Iterate over each prepared fuzzy searcher (one per query term)
            let currentQueryTermFoundInAnyItem = false;
            for (const item of searchableMetadataItems) { // Check against each metadata item
                if (fzz(item) !== null) {
                    currentQueryTermFoundInAnyItem = true;
                    break; // This query term found a match in one of the items, move to next query term
                }
            }
            if (!currentQueryTermFoundInAnyItem) {
                allQueryTermsMatchFile = false;
                break; // This query term did not match any metadata item, so the file doesn't match the full query
            }
        }

        if (allQueryTermsMatchFile) {
            try {
                const content = await vault.cachedRead(file);
                // const sanitizedPath = _sanitizeXmlAttribute(file.path);
                results.push(`<file path='${file.path}' link_to='[[${file.name}|{texto visible del link}]]'>\n${content}\n</file>`);
            } catch (e) {
                console.error(`Error reading file ${file.path} for query result:`, e);
            }
        }
    }

    return results.join('\n\n');
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
export async function simpleQueryVault(app: App, queryString: string): Promise<string> {
    const vault = app.vault;
    const metadataCache = app.metadataCache;
    const files = vault.getMarkdownFiles();
    const results: string[] = [];

    const trimmedQuery = queryString.trim();
    if (!trimmedQuery) {
        return ""; // No query string, so no results.
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
                results.push(`<file path='${file.path}' link_to='[[${file.name}|{texto visible del link}]]'>\n${content}\n</file>`);
            } catch (e) {
                console.error(`Error reading file ${file.path} for query result:`, e);
            }
        }
    }

    return results.join('\n\n');
}

export async function writeFileMD(app:App, path: string, content: string): Promise<string|null> {
    const vault = app.vault;
   
    if (path.includes(".lim")) {
        // throw new Error("Cannot write a .lim file");
        throw new Error(`Error al escribir archivo: ${"Cannot write a .lim file"}`);
    }

    const fileExists = await vault.adapter.exists(path); 

    const contentWithNewlines = content.replace(/\\n/g, '\n');
    const newContent = contentWithNewlines.replace(/---\s/g, '---\n');
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

    const patch = Diff.createPatch(path, oldContent, newContent);
    
    return `\`\`\`diff
${patch}
\`\`\``

}

export const captureGhosts = (app: App) => {
    const files = app.vault.getMarkdownFiles();
    const ghostRefs: { sourceFile: string, unresolvedLink: string }[] = [];
    const metadataCache = app.metadataCache; // Get cache from plugin

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