import { App, Notice, TFile, TFolder } from 'obsidian';
import lImporterPlugin from 'src/main'; // Keep for type, though plugin instance not directly used in this file anymore

/**
 * Type definition for a single log entry.
 */
export type LogEntry = {
    timestamp: Date;
    level: string;
    messages: any[];
};

/**
 * Stores all captured log messages. Can be useful for other purposes
 * or if you want to add a command to "dump all logs".
 * @internal
 */
let globalLogStore: LogEntry[] = [];

/**
 * Stores the original console methods before they are patched.
 * This allows for unpatching and restoring original behavior.
 * @internal
 */
const originalConsoleMethods = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
    clear: console.clear,
};

let obsidianApp: App | null = null;
const LOG_FILE_PATH = "_.lim/logs.lim.md"; // Centralized log file
let logFileInitialized = false;

/**
 * Ensures the log directory and file exist.
 * Writes a header to the log file if it's newly created or cleared.
 */
async function ensureLogFile(): Promise<void> {
    if (!obsidianApp) {
        originalConsoleMethods.error("Obsidian app instance not available for logging.");
        return;
    }
    try {
        const logFolder = "_lim_logs";
        if (!(await obsidianApp.vault.adapter.exists(logFolder))) {
            await obsidianApp.vault.createFolder(logFolder);
            originalConsoleMethods.log(`Created log folder: ${logFolder}`);
        }

        let file = obsidianApp.vault.getAbstractFileByPath(LOG_FILE_PATH);
        if (!file) {
            originalConsoleMethods.log(`Creating log file: ${LOG_FILE_PATH}`);
            await obsidianApp.vault.create(LOG_FILE_PATH, `--- Log Session Start: ${new Date().toISOString()} ---\n`);
        } else if (!(file instanceof TFile)) {
            originalConsoleMethods.error(`Log path ${LOG_FILE_PATH} exists but is not a file. Logging disabled.`);
            obsidianApp = null; // Disable further logging attempts
            return;
        }
        logFileInitialized = true;
    } catch (error) {
        originalConsoleMethods.error("Error ensuring log file:", error);
        obsidianApp = null; // Disable further logging attempts
        logFileInitialized = false;
    }
}

/**
 * Formats a log entry for writing to the Markdown file.
 * Uses a simpler format for file logs, but can be adapted to use callouts if preferred.
 */
function formatLogEntryForFile(logEntry: LogEntry): string {
    const messageParts = logEntry.messages.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                return `\n\`\`\`json\n${JSON.stringify(arg, null, 2)}\n\`\`\``; // Pretty print JSON
            } catch (e) {
                return '[Object (serialization error)]';
            }
        }
        return String(arg);
    });
    const combinedMessage = messageParts.join(' ');

    // Simple format: [TIMESTAMP] [LEVEL] Message
    // return `[${logEntry.timestamp.toISOString()}] [${logEntry.level.toUpperCase()}] ${combinedMessage}`;

    // Callout format (similar to original view):
    let calloutType = "quote";
    switch (logEntry.level) {
        case "info": calloutType = "info"; break;
        case "warn": calloutType = "warning"; break;
        case "error": calloutType = "error"; break; // 'fail' is also an option
        case "debug": calloutType = "note"; break; // 'tldr', 'abstract', 'todo' are also options
    }
    return `> [!${calloutType}|${logEntry.level.toUpperCase()}] ${logEntry.timestamp.toLocaleTimeString()}\n` +
        `> ${combinedMessage.replace(/\n/g, '\n> ')}\n`; // Ensure multi-line messages are prefixed
}


/**
 * Appends a log entry to the Markdown log file.
 * @param logEntry - The log entry to append.
 */
async function appendToLogFile(logEntry: LogEntry): Promise<void> {
    if (!obsidianApp || !logFileInitialized) {
        // If not initialized, queue it or drop it. For simplicity, we're dropping.
        // originalConsoleMethods.log("Log queueing/dropping because file system not ready:", logEntry);
        return;
    }

    const formattedLog = formatLogEntryForFile(logEntry);
    try {
        const file = obsidianApp.vault.getAbstractFileByPath(LOG_FILE_PATH);
        if (file && file instanceof TFile) {
            await obsidianApp.vault.append(file, formattedLog + "\n");
        } else {
            // Attempt to re-initialize if file got deleted
            originalConsoleMethods.warn(`Log file ${LOG_FILE_PATH} not found. Re-initializing.`);
            logFileInitialized = false;
            await ensureLogFile();
            if (logFileInitialized) { // Retry append if re-initialization was successful
                const newFile = obsidianApp.vault.getAbstractFileByPath(LOG_FILE_PATH);
                if (newFile && newFile instanceof TFile) {
                    await obsidianApp.vault.append(newFile, formattedLog + "\n");
                }
            }
        }
    } catch (error) {
        originalConsoleMethods.error("Error appending to log file:", error);
        // Consider disabling further attempts if errors persist
    }
}

/**
 * Captures a log message, stores it, and appends it to the log file.
 *
 * @param level - The log level (e.g., 'log', 'info', 'warn', 'error', 'debug').
 * @param args - The arguments passed to the original console method.
 */
export function captureLog(level: string, ...args: any[]): void {
    const logEntry: LogEntry = { timestamp: new Date(), level, messages: args };
    globalLogStore.push(logEntry);
    appendToLogFile(logEntry); // Asynchronously append to file
}

/**
 * Patches the global `console` object to intercept log messages.
 * Original console methods are preserved and called. Captured logs are
 * stored in `globalLogStore` and written to the log file.
 *
 * @param app - The Obsidian App instance.
 * @param debug_enabled - If true, `console.debug` messages will also be captured.
 *                        Otherwise, `console.debug` will be a no-op.
 */
export async function initializeAndPatchConsole(app: App, debug_enabled: boolean): Promise<void> {
    obsidianApp = app;
    new Notice("LImP: Patching console for file logging.");
    originalConsoleMethods.log("LImP: Console patching initiated."); // Use original before patch

    await ensureLogFile(); // Ensure log file is ready before patching

    // Defensive checks for re-patching (same as original)
    if (console.log !== originalConsoleMethods.log && console.log.name !== 'captureLog') {
        originalConsoleMethods.log = console.log;
    }
    if (console.info !== originalConsoleMethods.info && console.info.name !== 'captureLog') {
        originalConsoleMethods.info = console.info;
    }
    if (console.warn !== originalConsoleMethods.warn && console.warn.name !== 'captureLog') {
        originalConsoleMethods.warn = console.warn;
    }
    if (console.error !== originalConsoleMethods.error && console.error.name !== 'captureLog') {
        originalConsoleMethods.error = console.error;
    }
    if (console.debug !== originalConsoleMethods.debug && console.debug.name !== 'captureLog') {
        originalConsoleMethods.debug = console.debug;
    }
    if (console.clear !== originalConsoleMethods.clear && console.clear.name !== 'captureLog') {
        originalConsoleMethods.clear = console.clear;
    }

    console.clear = async () => {
        originalConsoleMethods.clear();
        globalLogStore = [];
        if (obsidianApp && logFileInitialized) {
            const clearMessage = `--- CONSOLE CLEARED: ${new Date().toISOString()} ---\n`;
            const file = obsidianApp.vault.getAbstractFileByPath(LOG_FILE_PATH);
            if (file && file instanceof TFile) {
                try {
                    // Option 1: Append a clear marker
                    // await obsidianApp.vault.append(file, clearMessage);

                    // Option 2: Clear the file and add a new header (more like a true clear)
                    await obsidianApp.vault.modify(file, `--- Log Session Start (after clear): ${new Date().toISOString()} ---\n`);
                    new Notice("LImP: Log file cleared.");
                } catch (error) {
                    originalConsoleMethods.error("Error clearing log file:", error);
                }
            }
        }
        captureLog('info', 'Console cleared'); // Log the clear action itself
    };

    console.log = (...args: any[]) => {
        originalConsoleMethods.log.apply(console, args);
        captureLog('log', ...args);
    };
    console.info = (...args: any[]) => {
        originalConsoleMethods.info.apply(console, args);
        captureLog('info', ...args);
    };
    console.warn = (...args: any[]) => {
        originalConsoleMethods.warn.apply(console, args);
        captureLog('warn', ...args);
    };
    console.error = (...args: any[]) => {
        originalConsoleMethods.error.apply(console, args);
        captureLog('error', ...args);
    };

    if (debug_enabled) {
        console.debug = (...args: any[]) => {
            originalConsoleMethods.debug.apply(console, args);
            captureLog('debug', ...args);
        };
    } else {
        console.debug = () => { };
    }
    originalConsoleMethods.log("LImP: Console patched for file logging.");
}

/**
 * Restores the original `console` methods, removing the patches.
 */
export function unpatchConsole(): void {
    if (console.log.name === 'captureLog') { // Check if it was actually our patch
        new Notice("LImP: Unpatching console.");
        originalConsoleMethods.log("LImP: Console unpatching."); // Log before it's unpatched

        console.log = originalConsoleMethods.log;
        console.info = originalConsoleMethods.info;
        console.warn = originalConsoleMethods.warn;
        console.error = originalConsoleMethods.error;
        console.debug = originalConsoleMethods.debug;
        console.clear = originalConsoleMethods.clear;

        // Log one last time using the now-restored console.log
        console.log("LImP: Console unpatched.");
    } else {
        originalConsoleMethods.warn("LImP: Console was not patched by this plugin or already unpatched.");
    }
    obsidianApp = null; // Clear app reference
    logFileInitialized = false;
}

/**
 * Provides a way to save the current globalLogStore to a new, timestamped file.
 * This is different from the continuous logging to LOG_FILE_PATH.
 */
export async function saveGlobalLogStoreToFile(app: App | null = obsidianApp): Promise<void> {
    if (!app) {
        originalConsoleMethods.error("Cannot save global log store: Obsidian App instance not available.");
        new Notice("Error: Could not save log store.");
        return;
    }
    const content = globalLogStore.map(entry =>
        `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] ${entry.messages.map(m => {
            if (typeof m === 'object' && m !== null) {
                try { return JSON.stringify(m); } catch { return "[Object]"; }
            }
            return String(m);
        }).join(" ")}`
    ).join("\n\n"); // Add extra newline for readability between entries

    try {
        const logFolder = "_.lim";
        if (!(await app.vault.adapter.exists(logFolder))) {
            await app.vault.createFolder(logFolder);
        }
        const filePath = `${logFolder}/limporter-log-dump-${Date.now()}.md`;
        await app.vault.create(filePath, content);
        new Notice(`Global log store saved to ${filePath}`);
    } catch (error) {
        originalConsoleMethods.error("Error saving global log store:", error);
        new Notice("Error saving global log store. See console.");
    }
}