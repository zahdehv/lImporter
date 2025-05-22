import { App, TFile } from 'obsidian';

/**
 * Represents a file along with its depth in a graph traversal (e.g., BFS).
 */
interface FileWithDepth {
    /** The path of the file. */
    filePath: string;
    /** The depth or distance from the starting node. */
    depth: number;
}

/**
 * Internal helper function to find and add unique, unvisited neighbors of a given file to the processing queue.
 * Neighbors include outgoing links/embeds and incoming links (backlinks).
 * 
 * @param app - The current Obsidian App instance.
 * @param file - The file whose neighbors are to be found.
 * @param currentDepth - The depth of the current `file` in the BFS traversal.
 * @param queue - The BFS queue to which new neighbors will be added.
 * @param visitedPaths - A Set of file paths that have already been visited or added to the queue,
 *                       to prevent cycles and redundant processing.
 * @internal
 */
function addNeighborsToQueue(
    app: App,
    file: TFile,
    currentDepth: number,
    queue: { file: TFile; depth: number }[],
    visitedPaths: Set<string> 
) {
    const linkedFilePaths: Set<string> = new Set();

    // Gather outgoing links and embeds
    const fileCache = app.metadataCache.getFileCache(file);
    if (fileCache) {
        // Process outgoing links
        (fileCache.links || []).forEach(link => {
            const linkedFile = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
            if (linkedFile instanceof TFile) {
                linkedFilePaths.add(linkedFile.path);
            }
        });
        // Process outgoing embeds
        (fileCache.embeds || []).forEach(embed => {
            const embeddedFile = app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
            if (embeddedFile instanceof TFile) {
                linkedFilePaths.add(embeddedFile.path);
            }
        });
    }

    // Gather incoming links (backlinks)
    // @ts-ignore
    const backlinks = app.metadataCache.getBacklinksForFile(file);
    backlinks.data.keys().forEach((linkerFilePath: string) => {
        const linkerFile = app.vault.getAbstractFileByPath(linkerFilePath);
        if (linkerFile instanceof TFile) {
            linkedFilePaths.add(linkerFile.path);
        }
    });

    // Add valid, unvisited neighbors to the queue
    linkedFilePaths.forEach(path => {
        if (!visitedPaths.has(path)) { // Check if already visited or queued
             const fileToAdd = app.vault.getAbstractFileByPath(path);
             if (fileToAdd instanceof TFile) {
                 visitedPaths.add(path); // Mark as visited/queued *before* adding to queue
                 queue.push({ file: fileToAdd, depth: currentDepth + 1 });
             }
        }
    });
}

/**
 * Performs a Breadth-First Search (BFS) to find all files connected to a starting file
 * through outgoing or incoming links, up to a specified depth (implicitly the entire graph here).
 * 
 * @param app - The current Obsidian App instance.
 * @param startFile - The `TFile` object representing the starting point of the BFS.
 * @param includeSelf - If true, the `startFile` itself will be included in the results. Defaults to true.
 * @param ascending - If true, results are sorted by depth in ascending order; otherwise, descending. Defaults to true.
 * @returns A Promise that resolves to an array of file paths (`string[]`) representing the
 *          connected files, sorted by depth and then alphabetically.
 */
export async function bfsFileExpander(
    app: App,
    startFile: TFile,
    includeSelf: boolean = true,
    ascending: boolean = true,
    maxDepth = 13
): Promise<string[]> {
    const queue: { file: TFile; depth: number }[] = [];
    // visitedPaths tracks files that have been added to the queue or already processed.
    // This prevents cycles and redundant work.
    const visitedPaths: Set<string> = new Set(); 
    const collectedFiles: FileWithDepth[] = [];

    if (includeSelf) {
        // If including the startFile, add it to results and mark as visited.
        // Then, queue its direct neighbors.
        visitedPaths.add(startFile.path);
        collectedFiles.push({ filePath: startFile.path, depth: 0 });
        addNeighborsToQueue(app, startFile, 0, queue, visitedPaths);
    } else {
        // If not including the startFile, still mark it as visited to prevent it from being
        // "discovered" via its own neighbors. Then, queue its direct neighbors.
        visitedPaths.add(startFile.path);
        addNeighborsToQueue(app, startFile, 0, queue, visitedPaths); // Neighbors will be at depth 1
    }

    let head = 0; // Efficient queue processing by moving a head pointer.
    while(head < queue.length){
        const current = queue[head++]; // Dequeue the next file to process.
        // `current` should always be defined here due to the loop condition.
        // if (!current) continue; // This check is technically redundant but safe.

        const { file: currentFile, depth: currentDepth } = current;
        
        // Add the processed file to collectedFiles if it's not already there.
        // This check is a safeguard; with current logic (marking visited when queuing),
        // a file should only be processed once. `startFile` (if `includeSelf`) is handled before loop.
        if (!collectedFiles.some(cf => cf.filePath === currentFile.path)) {
             collectedFiles.push({ filePath: currentFile.path, depth: currentDepth });
        }
        
        // Add its neighbors to the queue for future processing.
        addNeighborsToQueue(app, currentFile, currentDepth, queue, visitedPaths);
    }
    
    // Sort the collected files: primarily by depth, secondarily by file path for stable sort.
    collectedFiles.sort((a, b) => {
        if (a.depth === b.depth) {
            return a.filePath.localeCompare(b.filePath); // Alphabetical for consistent order at same depth
        }
        return ascending ? a.depth - b.depth : b.depth - a.depth; // Sort by depth
    });

    // Return only the file paths.
    return collectedFiles.filter(file=> file.depth <= maxDepth).map(cf => cf.filePath);
}
