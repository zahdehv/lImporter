import { Vault, TFolder, TAbstractFile } from 'obsidian';

/**
 * Generates a string representation of a directory tree structure within the Obsidian vault.
 *
 * @param vault - The Obsidian Vault object (app.vault).
 * @param rootPath - The starting path (use '/' or '' for vault root).
 * @param depth - The maximum recursion depth (1 = immediate children only).
 * @param includeFiles - Whether to include files in the listing.
 * @returns A Promise that resolves with the formatted tree string.
 * @throws An error if the root path is not found or is not a folder.
 */
export async function listFilesTree(
    vault: Vault,
    rootPath: string,
    depth: number,
    includeFiles: boolean
): Promise<string> {
    try {
        let normalizedPath = rootPath.trim();
        // Handle root path case
        if (normalizedPath === '/' || normalizedPath === '') {
            normalizedPath = '/';
        } else {
            // Ensure no trailing slash for consistency, unless it's the root
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

        // Use '.' for root, otherwise the folder name for the starting point
        let output = `${normalizedPath === '/' ? '.' : rootNode.name}\n`;

        // Recursive function to build the tree string
        // Doesn't strictly need async here, but kept for consistency with potential future async ops
        const buildTree = async (folder: TFolder, currentDepth: number, prefix: string) => {
            // Stop recursion if max depth is reached
            if (currentDepth > depth) {
                return;
            }

            // Get children and sort: folders first, then alphabetically
            // Note: TFolder.children is synchronous
            const children = folder.children.sort((a, b) => {
                const aIsFolder = a instanceof TFolder;
                const bIsFolder = b instanceof TFolder;
                if (aIsFolder !== bIsFolder) {
                    return aIsFolder ? -1 : 1; // Folders first
                }
                return a.name.localeCompare(b.name);
            });

            // Filter out files if includeFiles is false
            const itemsToList = includeFiles ? children : children.filter(child => child instanceof TFolder);

            for (let i = 0; i < itemsToList.length; i++) {
                const child = itemsToList[i];
                const isLast = i === itemsToList.length - 1;

                // Determine the connector ('├───' or '└───')
                const connector = isLast ? "└───" : "├───";
                // Determine the prefix for the next level's children ('│   ' or '    ')
                const childPrefix = prefix + (isLast ? "    " : "│   ");

                // Add the current item to the output string, correctly prefixed
                output += `${prefix}${connector}${child.name}\n`;

                // If it's a folder, recurse, passing the *NEWLY CALCULATED* childPrefix
                if (child instanceof TFolder) {
                   await buildTree(child, currentDepth + 1, childPrefix); // Pass childPrefix here
                }
            }
        };

        // Start the recursive process from the root node
        await buildTree(rootNode, 1, ""); // Initial depth is 1, initial prefix is empty

        // Return the final string, formatted as a code block
        return `Directory structure for '${normalizedPath}' (depth ${depth}, ${includeFiles ? 'including' : 'excluding'} files):\n\`\`\`\n${output}\`\`\``;

    } catch (error) {
        console.error("Error listing files tree:", error);
        // Rethrow the error so the caller can handle it (e.g., display a notice)
        throw new Error(`Error listing directory structure: ${error.message || error}`);
    }
}

// --- Example Usage (within your Obsidian plugin) ---
/*
import { listFilesTree } from './path/to/this/file'; // Adjust import path
import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

export default class MyPlugin extends Plugin {
    async onload() {
        this.addRibbonIcon('dice', 'Test List Files', async (evt: MouseEvent) => {
            try {
                const rootPath = '/'; // Or specify a subfolder like 'MyFolder'
                const maxDepth = 3;
                const showFiles = true;

                console.log(`Generating tree for '${rootPath}', depth ${maxDepth}, files: ${showFiles}`);

                const treeString = await listFilesTree(this.app.vault, rootPath, maxDepth, showFiles);

                console.log(treeString); // Log to console
                new Notice('Generated file tree! Check console (Ctrl+Shift+I).');

                // Optional: Display in a modal or temporary file
                // await this.app.workspace.openModal(...)
                // await this.app.vault.create('temp-tree-output.md', treeString);

            } catch (error) {
                console.error("Failed to generate file tree:", error);
                new Notice(`Error generating tree: ${error.message}`);
            }
        });
    }
}
*/