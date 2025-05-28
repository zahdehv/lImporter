import { setIcon, App, WorkspaceLeaf, MarkdownView, Notice, TFile } from "obsidian";
import lImporterPlugin from "src/main";

import { normalizePath } from 'obsidian'; // Important for path consistency

const TEMP_DIFF_FILE_NAME = "_diff.md";

/**
 * Shows diff content by writing it to a temporary file and opening that file.
 *
 * @param pluginInstance The instance of your plugin.
 * @param diffContent The full diff string content (including ```diff ... ```).
 * @param tabTitle Optional title for the tab (will be the file name by default).
 */
export async function showDiffInTempFile(
    pluginInstance: lImporterPlugin,
    diffContent: string,
    // tabTitle is less relevant here as the tab will show the file name,
    // but we could use it if we wanted to rename the leaf display name after opening.
    // For simplicity, we'll let it use the file name.
): Promise<void> {
    const app: App = pluginInstance.app;
    const pluginId = pluginInstance.manifest.id;
    const tempFilePath = normalizePath(TEMP_DIFF_FILE_NAME); // Ensures consistent path separators

    console.log(`[${pluginId}] Using temporary diff file: ${tempFilePath}`);
    // For more detailed debugging, you can log the absolute path:
    // console.log(`[${pluginId}] Absolute path for temp file: ${normalizePath(vaultBasePath + '/' + tempFilePath)}`);


    let file: TFile | null = app.vault.getAbstractFileByPath(tempFilePath) as TFile;

    try {
        if (file) {
            // File exists, clear its content first then write new content
            console.log(`[${pluginId}] Temporary file exists. Clearing and writing new content.`);
            await app.vault.modify(file, diffContent);
        } else {
            // File does not exist, create it with the content
            console.log(`[${pluginId}] Temporary file does not exist. Creating with content.`);
            file = await app.vault.create(tempFilePath, diffContent);
        }

        if (!file) {
            new Notice("Failed to create or modify the temporary diff file.");
            console.error(`[${pluginId}] Could not get a TFile handle for ${tempFilePath} after create/modify.`);
            return;
        }

        // Open the file in a new leaf
        let leaf: WorkspaceLeaf | null = app.workspace.getLeaf(true); // true for new tab
        if (!leaf) {
            new Notice("Failed to get a new leaf to open the diff file.");
            console.error(`[${pluginId}] Failed to get a new leaf.`);
            return;
        }

        await leaf.openFile(file, { active: true }); // { active: true } makes the new tab focused
        console.log(`[${pluginId}] Successfully opened ${tempFilePath} in a new tab.`);

        // Optional: Consider when/how to clean up this file.
        // 1. On plugin unload (simplest).
        // 2. A command to "close and delete diff view".
        // 3. If the leaf showing this file is closed (more complex, needs event listeners).
        // For now, we'll assume cleanup happens elsewhere or manually.

    } catch (error) {
        new Notice("Error showing diff in temporary file. Check console.");
        console.error(`[${pluginId}] Error in showDiffInTempFile:`, error);
        // If the file was created but opening failed, it will remain.
    }
}


// Type for the object representing a single step item
export type StepItemInstance = {
    item: HTMLDivElement; // The main div element for the step
    updateState: (status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) => void;
    updateCaption: (caption: string) => void;
    appendFile: (plugin: lImporterPlugin, filePath: string, diff: string) => void;
};

// Factory function to create a step item object
const createStepItem = (
    itemElement: HTMLDivElement,
    originalIcon: string,
    plugin: lImporterPlugin // Plugin instance for Obsidian API access
): StepItemInstance => {
    const oIcon = originalIcon;
    const item = itemElement;
    let filesDiv: HTMLDivElement | null = null;

    const updateCaption = (caption: string) => {
        if (!item) return;
        const statusEl = item.querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption;
    };

    const updateState = (status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) => {
        if (!item) return;
        item.dataset.status = status;
        if (message) updateCaption(message);
        const iconEl = item.querySelector('.limporter-step-icon');
        if (icon && iconEl) {
            setIcon(iconEl as HTMLElement, icon);
        } else if (iconEl) {
            switch (status) {
                case 'complete': setIcon(iconEl as HTMLElement, 'check'); break;
                case 'error': setIcon(iconEl as HTMLElement, 'x'); break;
                case 'pending': case 'in-progress': default: setIcon(iconEl as HTMLElement, oIcon); break;
            }
        }
    };

    const appendFile = (plugin: lImporterPlugin, filePath: string, diff: string) => {
        if (!item) return;
        const stepContentEl = item.querySelector('.limporter-step-content');
        if (!stepContentEl) {
            console.error("LImporter Error: '.limporter-step-content' not found. Cannot append file.");
            return;
        }

        if (!filesDiv) {
            filesDiv = stepContentEl.querySelector('.limporter-step-files') as HTMLDivElement | null;
            if (!filesDiv) {
                filesDiv = stepContentEl.createDiv({ cls: 'limporter-step-files' });
                filesDiv.style.marginTop = '0.3rem';
                filesDiv.style.fontSize = 'var(--font-ui-smaller)';
                filesDiv.style.paddingLeft = '10px';
            }
        }

        const fileEntry = filesDiv.createDiv({ cls: 'limporter-step-file-entry' });
        fileEntry.style.display = 'flex';
        fileEntry.style.alignItems = 'center';
        fileEntry.style.justifyContent = 'space-between';
        fileEntry.style.padding = "2px 0";

        const fileLink = fileEntry.createEl('a', {
            text: filePath.split('/').pop() || filePath,
            href: '#'
        });
        fileLink.title = `Open: ${filePath}`;
        fileLink.style.flexGrow = "1";
        fileLink.style.marginRight = "8px";
        fileLink.style.overflow = "hidden";
        fileLink.style.textOverflow = "ellipsis";
        fileLink.style.whiteSpace = "nowrap";

        fileLink.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const abstractFile = plugin.app.vault.getAbstractFileByPath(filePath);
                if (abstractFile) {
                    await plugin.app.workspace.openLinkText(filePath, filePath, false);
                } else {
                    console.warn(`LImporter: File not found, cannot open: ${filePath}`);
                    // new Notice(`File not found: ${filePath}`); // Optional user notification
                }
            } catch (error) {
                console.error(`LImporter: Error opening file ${filePath}:`, error);
            }
        });

        const diffButton = fileEntry.createSpan({ cls: 'limporter-diff-button clickable-icon' });
        diffButton.title = `Show changes for: ${filePath}`;
        setIcon(diffButton, 'diff'); // Using Lucide 'diff' icon
        diffButton.style.padding = '2px 4px'; // Adjust padding for icon button
        diffButton.style.cursor = 'pointer';
        // Removed explicit border/background for clickable-icon, it should inherit some styling

        diffButton.addEventListener('click', async (e) => {
            e.preventDefault();
            await showDiffInTempFile(plugin, diff)
        });
    };

    return { item, updateState, updateCaption, appendFile };
};

// Type for the object returned by createProcessTracker
export type ProcessTrackerInstance = {
    appendStep: (label: string, message: string, icon: string, status?: 'pending' | 'in-progress' | 'complete' | 'error') => StepItemInstance;
    setInProgressStepsToError: (errorMessage?: string) => void;
    abortController: AbortController;
    createMessage: (sender: "User" | "AI") => {
        messageEl: HTMLDivElement;
        MD: (text: string) => void;
    };
};

// Factory function to create and manage the overall progress tracking UI component
export const createProcessTracker = (pluginInstance: lImporterPlugin, createMessage: (sender: "User" | "AI") => {
    messageEl: HTMLDivElement;
    MD: (text: string) => void;
}): ProcessTrackerInstance => {
    let steps: StepItemInstance[] = [];
    const plugin = pluginInstance;

    const setInProgressStepsToError = (errorMessage?: string): void => {
        steps.forEach(step => {
            if (step.item?.dataset.status === 'in-progress') {
                step.updateState('error', errorMessage || "Process interrupted or timed out.");
            }
        });
    };


    const appendStep = (label: string, message: string, icon: string, status?: 'pending' | 'in-progress' | 'complete' | 'error'): StepItemInstance => {
        const msg = createMessage("AI");
        // const progressContainer = msg.messageEl.createDiv('limporter-steps-display-container');
        // progressContainer.style.marginTop = '1rem';
        const stepsContainer = msg.messageEl.createDiv('limporter-steps-container-inner');
        stepsContainer.style.display = 'flex';
        stepsContainer.style.flexDirection = 'column';
        stepsContainer.style.gap = '0.1rem';

        const stepEl = stepsContainer.createDiv('limporter-progress-step');
        stepEl.dataset.status = status || 'pending';

        const iconContainer = stepEl.createDiv('limporter-step-icon');
        setIcon(iconContainer, icon);

        const stepContent = stepEl.createDiv('limporter-step-content');
        stepContent.createDiv('limporter-step-label').textContent = label;
        stepContent.createDiv('limporter-step-status');

        const stepItm = createStepItem(stepEl, icon, plugin);
        steps.push(stepItm);

        if (!status) stepItm.updateState("in-progress", message);
        else stepItm.updateState(status, message);

        return stepItm;
    };

    // const appendStep = (label: string, message: string, icon: string, status?: 'pending' | 'in-progress' | 'complete' | 'error'): StepItemInstance => {
    //     const stepEl = stepsContainer.createDiv('limporter-progress-step');
    //     stepEl.dataset.status = status || 'pending';

    //     const iconContainer = stepEl.createDiv('limporter-step-icon');
    //     setIcon(iconContainer, icon);

    //     const stepContent = stepEl.createDiv('limporter-step-content');
    //     stepContent.createDiv('limporter-step-label').textContent = label;
    //     stepContent.createDiv('limporter-step-status');

    //     const stepItm = createStepItem(stepEl, icon, plugin);
    //     steps.push(stepItm);

    //     if (!status) stepItm.updateState("in-progress", message);
    //     else stepItm.updateState(status, message);

    //     return stepItm;
    // };

    const abortController = new AbortController();

    return { appendStep, setInProgressStepsToError, abortController, createMessage };
};