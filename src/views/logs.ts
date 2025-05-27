import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon, Notice, Setting } from 'obsidian';
import lImporterPlugin from 'src/main';

/**
 * Unique identifier for the Log View.
 */
export const LOG_VIEW_TYPE = "log-view";

/**
 * Type definition for a single log entry.
 */
export type LogEntry = {
    timestamp: Date;
    level: string;
    messages: any[];
};

/**
 * Stores all captured log messages.
 * @internal
 */
let globalLogStore: LogEntry[] = [];

/**
 * Reference to the active (currently visible) LogView instance.
 * Used to update the view live when new logs are captured.
 * @internal
 */
let logViewInstance: LogView | null = null;

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

/**
 * Captures a log message and stores it.
 * If a LogView instance is active, it also adds the log entry to the view.
 * This function is called by the patched console methods.
 * 
 * @param level - The log level (e.g., 'log', 'info', 'warn', 'error', 'debug').
 * @param args - The arguments passed to the original console method.
 */
export function captureLog(level: string, ...args: any[]): void {
    const logEntry: LogEntry = { timestamp: new Date(), level, messages: args };
    globalLogStore.push(logEntry);

    if (logViewInstance) {
        logViewInstance.addLogEntryToView(logEntry);
    }
}

/**
 * Patches the global `console` object to intercept log messages.
 * Original console methods are preserved and called. Captured logs are
 * stored in `globalLogStore` and displayed in the active `LogView`.
 * 
 * @param debug_enabled - If true, `console.debug` messages will also be captured. 
 *                        Otherwise, `console.debug` will be a no-op.
 */
export function patchConsole(debug_enabled: boolean): void {
    new Notice("PATCHING CONSOLE");
    // Ensure original methods are only captured once, or re-capture if somehow overridden elsewhere.
    // This check helps if patchConsole were accidentally called multiple times,
    // or if another part of Obsidian or a plugin also patches console.log.
    if (console.log !== originalConsoleMethods.log && console.log.name !== 'captureLog') {
        originalConsoleMethods.log = console.log; // Re-capture the current console.log if it changed
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
    if (console.clear !== originalConsoleMethods.clear && console.clear.name !== 'captureLog') { // Assuming clear might also be wrapped
        originalConsoleMethods.clear = console.clear;
    }

    console.clear = () => {
        originalConsoleMethods.clear(); // Call original clear
        globalLogStore = []; // Clear the internal store
        if (logViewInstance) {
            logViewInstance.clearLogsInView(); // Clear the view if active
        }
    };

    console.log = (...args: any[]) => {
        originalConsoleMethods.log(...args); // Call original log
        captureLog('log', ...args); // Capture for LogView
    };
    console.info = (...args: any[]) => {
        originalConsoleMethods.info(...args);
        captureLog('info', ...args);
    };
    console.warn = (...args: any[]) => {
        originalConsoleMethods.warn(...args);
        captureLog('warn', ...args);
    };
    console.error = (...args: any[]) => {
        originalConsoleMethods.error(...args);
        captureLog('error', ...args);
    };

    if (debug_enabled) {
        console.debug = (...args: any[]) => {
            originalConsoleMethods.debug(...args);
            captureLog('debug', ...args);
        };
    } else {
        // If not enabled, console.debug calls will be a no-op (do nothing)
        console.debug = () => { };
    }
}

/**
 * Restores the original `console` methods, removing the patches
 * applied by `patchConsole`.
 */
export function unpatchConsole(): void {
    new Notice("UNPATCHING CONSOLE");

    console.log = originalConsoleMethods.log;
    console.info = originalConsoleMethods.info;
    console.warn = originalConsoleMethods.warn;
    console.error = originalConsoleMethods.error;
    console.debug = originalConsoleMethods.debug;
    console.clear = originalConsoleMethods.clear;
}

/**
 * Represents a view that displays captured console logs.
 * It uses Obsidian's `ItemView` to integrate into the workspace.
 */
export class LogView extends ItemView {
    /** Reference to the main plugin instance. */
    plugin: lImporterPlugin;
    /** HTMLElement that contains the rendered log messages. */
    private logsMDContainer: HTMLElement;

    /**
     * Constructs a new LogView.
     * @param leaf - The workspace leaf this view is associated with.
     * @param plugin - The main plugin instance.
     */
    constructor(leaf: WorkspaceLeaf, plugin: lImporterPlugin) {
        super(leaf);
        patchConsole(true);
        this.plugin = plugin;
        this.icon = "scroll-text";
        logViewInstance = this; // Register this instance as the active one
    }

    /**
     * Returns the unique type identifier for this view.
     * @returns The view type string.
     */
    getViewType(): string {
        return LOG_VIEW_TYPE;
    }

    /**
     * Returns the display text for this view (e.g., shown in the tab).
     * @returns The display text.
     */
    getDisplayText(): string {
        return "System Logs";
    }

    /**
     * Returns the icon name for this view.
     * @returns The icon name.
     */
    getIcon(): string {
        return "scroll-text";
    }

    /**
     * Called when the view is opened. Sets up the UI elements.
     */
    async onOpen() {
        const container = this.containerEl.children[1]; // Standard way to get the content container
        container.empty();
        container.addClass("log-view-container");

        new Setting(container as HTMLElement).setName("Captured Logs")
            .addButton(button => button
                .setIcon("trash")
                .onClick(() => console.clear()))
            .addButton(button => button
                .setIcon("save")
                .onClick(async () => await this.saveLogsToFile()));
        // --- Log Messages Container ---
        this.logsMDContainer = container.createDiv('log-messages-container');

        // Display any logs captured before this view was opened
        globalLogStore.forEach(logEntry => this.addLogEntryToView(logEntry));
    }

    /**
     * Adds a single log entry to the view, formatting it as Markdown.
     * @param logEntry - The log entry to add.
     */
    addLogEntryToView(logEntry: LogEntry): void {
        if (!this.logsMDContainer) return; // Should not happen if onOpen completed

        // Format arguments for display. Objects are JSON.stringified.
        const messageParts = logEntry.messages.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    // Attempt to pretty-print JSON
                    return "```json\n" + JSON.stringify(arg, null, 2) + "\n```";
                } catch (e) {
                    // Fallback for objects that can't be stringified (e.g., circular refs)
                    return '[Object (serialization error)]';
                }
            }
            return String(arg); // Convert primitives to string
        });
        const combinedMessage = messageParts.join(' '); // Join arguments with a space

        // Determine Markdown callout type based on log level for visual distinction
        let calloutType = "quote"; // Default callout type
        switch (logEntry.level) {
            case "info": calloutType = "info"; break;
            case "warn": calloutType = "warning"; break; // Obsidian's 'warn' callout is 'warning'
            case "error": calloutType = "fail"; break;    // Obsidian's 'error' callout is 'fail' or 'error'
            case "debug": calloutType = "tldr"; break;   // Using 'tldr' for debug, could be 'note' or 'abstract'
        }

        // Construct the Markdown string for the log entry
        const formattedLog = `> [!${calloutType}]+ [${logEntry.level.toUpperCase()}] [${logEntry.timestamp.toISOString()}]\n` +
            combinedMessage.split("\n").map(line => `> ${line}`).join("\n");

        // Render the formatted log entry as Markdown.
        // Each entry is rendered in a new div to ensure proper spacing and allow individual manipulation if needed.
        const entryDiv = this.logsMDContainer.createDiv();
        MarkdownRenderer.render(this.app, formattedLog, entryDiv, this.getViewType(), this);

        // Auto-scroll to the bottom to show the latest log
        this.logsMDContainer.scrollTop = this.logsMDContainer.scrollHeight;
    }

    /**
     * Clears all log messages from the view.
     */
    clearLogsInView(): void {
        if (this.logsMDContainer) {
            this.logsMDContainer.empty();
        }
    }

    /**
     * Called when the view is closed.
     */
    async onClose() {
        logViewInstance = null;
        unpatchConsole();
    }

    // TODO: Implement saveLogsToFile functionality
    // /**
    //  * Saves all captured logs to a Markdown file in the vault.
    //  */
    async saveLogsToFile(): Promise<void> {
        const content = globalLogStore.map(entry =>
            `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] ${entry.messages.map(String).join(" ")}`
        ).join("\n");
        // Use Obsidian API to save content to a file
        // Example: await this.app.vault.create('_SYSTEM_LOGS/ obsidian-importer-logs-' + Date.now() + '.md', content);
        // await this.app.vault.adapter.mkdir("a/b/c/d/e/f");
        await this.app.vault.adapter.mkdir("_lim_logs");
        await this.app.vault.create('_lim_logs/limporter-logs-' + Date.now() + '.md', content);
        new Notice("Logs saved.");
    }
}
