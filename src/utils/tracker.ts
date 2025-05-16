
import { setIcon, TFile, Notice, WorkspaceLeaf, MarkdownRenderer } from "obsidian";
import AutoFilePlugin from "src/main";
import { writeFileMD } from "./files";

const getMessageParts = (...args: any[]) => {
    const messageParts = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                return "```json\n" + JSON.stringify(arg) + "\n```";
            } catch (e) {
                // Handle potential circular references or other stringify errors
                return '[Object (serialization error)]';
            }
        }
        return String(arg); // Convert primitives and other types to string
    });
    return messageParts;
}

const replaceConsole = (writemd: (log: string) => void, clearlg: ()=>void, debug_enabled: boolean) => {
    const clear = console.clear
    console.clear = ()=>{
        clear();
        clearlg();
    }

    if (debug_enabled) {
        
        const debug = console.debug;
        console.debug = (...args: any[]): void => {
    
            debug("additional debug");
            debug(...args);
    
            const messageParts = getMessageParts(...args);
            
            const combinedMessage = messageParts.join(' ');
            // or bug
            writemd("> [!tldr]+ [debug] [" + new Date().toISOString() + "]\n" + combinedMessage.split("\n").map((value)=> {return "> " + value}).join("\n"));
        };
    }

    const info = console.info;
    console.info = (...args: any[]): void => {

        info("additional info");
        info(...args);

        const messageParts = getMessageParts(...args);
        
        const combinedMessage = messageParts.join(' ');
        
        writemd("> [!info]+ [info] [" + new Date().toISOString() + "]\n" + combinedMessage.split("\n").map((value)=> {return "> " + value}).join("\n"));
    };

    const log = console.log;
    console.log = (...args: any[]): void => {

        log("additional log");
        log(...args);

        const messageParts = getMessageParts(...args);
        
        const combinedMessage = messageParts.join(' ');
        
        writemd("> [!quote]+ [log] [" + new Date().toISOString() + "]\n" + combinedMessage.split("\n").map((value)=> {return "> " + value}).join("\n"));
    };

    const error = console.error;
    console.error = (...args: any[]): void => {

        error("additional error");
        error(...args);

        const messageParts = getMessageParts(...args);
        
        const combinedMessage = messageParts.join(' ');
        
        writemd("> [!fail]+ [error] [" + new Date().toISOString() + "]\n" + combinedMessage.split("\n").map((value)=> {return "> " + value}).join("\n"));
    };
        
    const warn = console.warn;
    console.warn = (...args: any[]): void => {

        warn("additional warn");
        warn(...args);

        const messageParts = getMessageParts(...args);
        
        const combinedMessage = messageParts.join(' ');
        
        writemd("> [!warning]+ [warn] [" + new Date().toISOString() + "]\n" + combinedMessage.split("\n").map((value)=> {return "> " + value}).join("\n"));
    };
}

// Type for the object representing a single step item
export type StepItemInstance = {
    item: HTMLDivElement; // The main div element for the step
    updateState: (status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) => void;
    updateCaption: (caption: string) => void;
};

// Factory function to create a step item object
const createStepItem = (itemElement: HTMLDivElement, originalIcon: string): StepItemInstance => {
    const oIcon = originalIcon; // Closed-over original icon
    const item = itemElement;   // Closed-over HTMLDivElement

    const updateCaption = (caption: string) => {
        if (!item) return;
        const statusEl = item.querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption;
    };

    const updateState = (status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) => {
        if (!item) return; // Exit if the element doesn't exist

        item.dataset.status = status;

        if (message) updateCaption(message);

        const iconEl = item.querySelector('.limporter-step-icon');

        if (icon && iconEl) {
            setIcon(iconEl as HTMLElement, icon);
        } else if (iconEl) {
            switch (status) {
                case 'complete':
                    setIcon(iconEl as HTMLElement, 'check');
                    break;
                case 'error':
                    setIcon(iconEl as HTMLElement, 'x');
                    break;
                case 'pending':
                case 'in-progress':
                default:
                    setIcon(iconEl as HTMLElement, oIcon);
                    break;
            }
        }
    };

    // This method might be redundant or misnamed as it updates caption, not icon.
    // Kept original behavior.
    

    return {
        item,
        updateState,
        updateCaption,
    };
};

// Type for the object returned by createProcessTracker
export type ProcessTrackerInstance = {
    progressContainer: HTMLElement; // Root element of the tracker UI for steps
    filesContainer: HTMLElement;    // Root element of the tracker UI for files
    logsContainer: HTMLElement;     // Root element of the tracker UI for logs
    resetTracker: () => void;
    appendStep: (label: string, message: string, icon: string, status?: 'pending' | 'in-progress' | 'complete' | 'error') => StepItemInstance;
    appendFile: (filePath: string) => Promise<void>;
    setInProgressStepsToError: (errorMessage?: string) => void;
    getSignal: () => AbortSignal;
    saveLogs: ()=> void;
};

// Factory function to create and manage the overall progress tracking UI component
export const createProcessTracker = (pluginInstance: AutoFilePlugin, parentContainerForTracker: HTMLElement): ProcessTrackerInstance => {
    // Internal state variables
    let steps: StepItemInstance[] = [];
    let logs: string[] = [];
    const plugin = pluginInstance; // Capture the plugin instance

    // DOM Elements (created once when createProcessTracker is called)
    const filesContainer = parentContainerForTracker.createDiv('limporter-steps-display-container');
    filesContainer.style.marginTop = '1rem';
    filesContainer.createEl('h4', { text: 'Tracked Files:', cls: 'limporter-files-tracker-title' });
    const filesListContainer = filesContainer.createDiv('limporter-files-list');
    filesListContainer.style.display = 'flex';
    filesListContainer.style.flexDirection = 'column';
    filesListContainer.style.gap = '0.3rem';
    
    const progressContainer = parentContainerForTracker.createDiv('limporter-steps-display-container');
    progressContainer.style.marginTop = '1rem';
    progressContainer.createEl('h4', { text: 'Tracked Steps:', cls: 'limporter-files-tracker-title' });
    const stepsContainer = progressContainer.createDiv('limporter-steps-display-container');
    stepsContainer.style.display = 'flex';
    stepsContainer.style.flexDirection = 'column';
    stepsContainer.style.gap = '0.1rem';
    
    const logsContainer = parentContainerForTracker.createDiv('limporter-steps-display-container');
    logsContainer.style.marginTop = '1rem';
    logsContainer.createEl('h4', { text: 'Logs:', cls: 'limporter-files-tracker-title' });
    const logsMDContainer = logsContainer.createDiv('limporter-files-list');

    // Internal lambda for writing logs
    const writeLog = (logEntry: string): void => {
        logs.push(logEntry);
        // logsMDContainer.empty(); // To save to a file, must keep the full log!
        MarkdownRenderer.render(plugin.app, logEntry, logsMDContainer, "/", plugin);
    };

    const saveLogs = async () => {
        await writeFileMD(plugin.app, "_logs/"+new Date().toDateString(), logs.join("\n\n"))
    }

    const button = logsContainer.createEl('button', {
        cls: 'limporter-button secondary',
    });
    button.setText("Save logs");
    button.addEventListener('click', () => {
        saveLogs();
    });

    const clearLogs = () => {
        logs = [];
        logsMDContainer.empty();
    }
    // Initialize console replacement to use our logging function
    replaceConsole(writeLog, clearLogs, plugin.settings.display_debug_messages);

    // Internal lambda for appending a file item to the UI
    const appendFileItem = (file: TFile): void => {
        const fileItemEl = filesListContainer.createDiv('limporter-tracked-file-item');
        fileItemEl.setText(file.path);
        fileItemEl.addClass('clickable-icon');

        fileItemEl.addEventListener('click', async () => {
            let fileDisplayLeaf: WorkspaceLeaf | null = null;
            const markdownLeaves = plugin.app.workspace.getLeavesOfType("markdown");

            if (plugin.app.workspace.activeLeaf && plugin.app.workspace.activeLeaf.view.getViewType() === 'markdown') {
                fileDisplayLeaf = plugin.app.workspace.activeLeaf;
            } else if (markdownLeaves.length > 0) {
                fileDisplayLeaf = markdownLeaves[0];
            } else {
                fileDisplayLeaf = plugin.app.workspace.getLeaf(true);
            }

            if (!fileDisplayLeaf) {
                new Notice("Could not find or create a leaf to open the file.");
                console.error("ProcessTracker: Could not obtain a suitable leaf for opening file.");
                return;
            }

            await fileDisplayLeaf.openFile(file, { active: true });
            plugin.app.workspace.setActiveLeaf(fileDisplayLeaf, { focus: true });

            if (plugin.settings.load_graph_when_clicking_created_file) {
                let localGraphLeaf: WorkspaceLeaf | null = null;
                const existingLocalGraphLeaves = plugin.app.workspace.getLeavesOfType('localgraph');

                if (existingLocalGraphLeaves.length > 0) {
                    localGraphLeaf = existingLocalGraphLeaves[0];
                    plugin.app.workspace.revealLeaf(localGraphLeaf);
                } else {
                    // localGraphLeaf = plugin.app.workspace.getLeftLeaf(true);
                    // localGraphLeaf = plugin.app.workspace.getLeftLeaf(false);
                    if (!localGraphLeaf || localGraphLeaf === fileDisplayLeaf) {
                        localGraphLeaf = plugin.app.workspace.getLeaf(false);
                    }
                }

                if (localGraphLeaf) {
                    const view = localGraphLeaf.view;
                    if (view && view.getViewType() === 'localgraph' && typeof (view as any).setFile === 'function') {
                        (view as any).setFile(file);
                    } else {
                        await localGraphLeaf.setViewState({
                            type: 'localgraph',
                            state: { file: file.path },
                            active: true,
                        });
                    }
                    plugin.app.workspace.revealLeaf(localGraphLeaf);
                } else {
                    new Notice("Could not open or find/create a leaf for the local graph.");
                    console.error("ProcessTracker: Could not obtain a suitable leaf for the local graph.");
                }
            }
        });
    };

    // Publicly exposed lambdas
    const setInProgressStepsToError = (errorMessage?: string): void => {
        if (!steps || steps.length === 0) {
            return; // No steps to update
        }

        steps.forEach(step => {
            if (step.item && step.item.dataset.status === 'in-progress') {
                step.updateState('error', errorMessage || "Process interrupted or timed out.");
            }
        });
    };
    
    const resetTracker = (): void => {
        // logs = "";
        steps = [];
        stepsContainer.empty();
        filesListContainer.empty();
        // logsMDContainer.empty();
    };
    
    const appendStep = (label: string, message: string, icon: string, status?: 'pending' | 'in-progress' | 'complete' | 'error'): StepItemInstance => {
        const stepEl = stepsContainer.createDiv('limporter-progress-step');
        stepEl.dataset.status = 'pending';

        const iconContainer = stepEl.createDiv('limporter-step-icon');
        setIcon(iconContainer, icon);

        const stepContent = stepEl.createDiv('limporter-step-content');
        const stepLabel = stepContent.createDiv('limporter-step-label');
        stepLabel.textContent = label;

        stepContent.createDiv('limporter-step-status'); // Placeholder, updateState will fill it

        const stepItm = createStepItem(stepEl, icon); // Use the factory function
        steps.push(stepItm);
        if (!status) stepItm.updateState("in-progress", message);
        else stepItm.updateState(status, message);
        
        return stepItm;
    };

    const appendFile = async (filePath: string): Promise<void> => {
        if (!plugin.app) {
            console.error("ProcessTracker: App instance is not available to resolve file path.");
            new Notice("ProcessTracker error: Cannot resolve file path.");
            return;
        }
        const abstractFile = plugin.app.vault.getAbstractFileByPath(filePath);
        if (!abstractFile) {
            new Notice(`Tracked File: Not found at path: ${filePath}`);
            console.warn(`ProcessTracker: File not found at path: ${filePath}`);
            return;
        }
        if (!(abstractFile instanceof TFile)) {
            new Notice(`Tracked File: Item at ${filePath} is not a file.`);
            console.warn(`ProcessTracker: Item at path ${filePath} is not a TFile.`);
            return;
        }
        const file = abstractFile as TFile;
        appendFileItem(file); // Call the internal lambda
    };

    const getSignal = () => {
        return new AbortController().signal;
    }

    // Return the public interface of the process tracker
    return {
        progressContainer,
        filesContainer,
        logsContainer,
        resetTracker,
        appendStep,
        appendFile,
        setInProgressStepsToError,
        getSignal,
        saveLogs
    };
};
