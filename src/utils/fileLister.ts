import { App, Vault, TFolder, TFile, TAbstractFile, FrontMatterCache } from 'obsidian'; // Import App

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
    try {
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

                output += `${prefix}${connector}${child.name}\n`;

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
                            const fileCache = app.metadataCache.getFileCache(child);

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

    } catch (error) {
        console.error("Error listing files tree:", error);
        throw new Error(`Error listing directory structure: ${error.message || error}`);
    }
}

// --- Example Usage (within your Obsidian plugin) ---
/*
import { listFilesTree } from './path/to/this/file'; // Adjust import path
import { App, Notice, Plugin } from 'obsidian';

export default class MyPlugin extends Plugin {
    async onload() {
        this.addRibbonIcon('dice', 'Test List Files with Details', async (evt: MouseEvent) => {
            try {
                const rootPath = '/';
                const maxDepth = 2;
                const showFiles = true;
                const showDetails = true;
                const contentLinesLimit = 7;

                console.log(`Generating tree for '${rootPath}', depth ${maxDepth}, files: ${showFiles}, details: ${showDetails} (.lim content lines: ${contentLinesLimit})`);

                // Pass the entire 'app' instance << CORRECTED
                const treeString = await listFilesTree(
                    this.app, // << Pass app directly
                    rootPath,
                    maxDepth,
                    showFiles,
                    showDetails,
                    contentLinesLimit
                );

                console.log(treeString);
                new Notice('Generated file tree with details! Check console.');

            } catch (error) {
                console.error("Failed to generate file tree:", error);
                new Notice(`Error generating tree: ${error.message}`);
            }
        });
    }
}
*/