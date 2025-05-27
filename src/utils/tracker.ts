import { setIcon, Modal, App } from "obsidian";
import lImporterPlugin from "src/main";
import * as Diff from 'diff'; // For diffing content

// Type for the object representing a single step item
export type StepItemInstance = {
    item: HTMLDivElement; // The main div element for the step
    updateState: (status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) => void;
    updateCaption: (caption: string) => void;
    appendFile: (filePath: string, originalContent: string, currentContent: string) => void;
};

// Diff Modal Class
class DiffModal extends Modal {
    filePath: string;
    originalContent: string;
    currentContent: string;

    constructor(app: App, filePath: string, originalContent: string, currentContent: string) {
        super(app);
        this.filePath = filePath;
        this.originalContent = originalContent;
        this.currentContent = currentContent;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.titleEl.setText("File Changes");
        contentEl.createEl('h4', { text: this.filePath, cls: 'limporter-diff-filepath' });

        const diffContainer = contentEl.createDiv('limporter-diff-container');
        diffContainer.style.fontFamily = 'monospace';
        diffContainer.style.whiteSpace = 'pre-wrap';
        diffContainer.style.maxHeight = '70vh';
        diffContainer.style.overflowY = 'auto';
        diffContainer.style.border = '1px solid var(--background-modifier-border)';
        diffContainer.style.padding = '10px';
        diffContainer.style.backgroundColor = 'var(--background-secondary-alt)';

        const diffResult = Diff.diffLines(this.originalContent, this.currentContent, {
            ignoreWhitespace: false,
            newlineIsToken: false,
        });

        diffResult.forEach(part => {
            const lines = part.value.split('\n');
            if (lines.length > 1 && lines[lines.length - 1] === '') {
                lines.pop();
            }

            lines.forEach((line) => {
                const linePre = diffContainer.createEl('pre');
                linePre.style.margin = '0';
                linePre.style.padding = '1px 4px';
                linePre.style.whiteSpace = 'pre-wrap';
                linePre.style.overflowX = 'auto';

                if (part.added) {
                    linePre.textContent = '+ ' + line;
                    linePre.style.color = 'var(--color-green)';
                    linePre.style.backgroundColor = 'var(--background-modifier-success)';
                } else if (part.removed) {
                    linePre.textContent = '- ' + line;
                    linePre.style.color = 'var(--color-red)';
                    linePre.style.backgroundColor = 'var(--background-modifier-error)';
                } else {
                    linePre.textContent = '  ' + line;
                }
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}


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

    const appendFile = (filePath: string, originalContent: string, currentContent: string) => {
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

        diffButton.addEventListener('click', (e) => {
            e.preventDefault();
            new DiffModal(plugin.app, filePath, originalContent, currentContent).open();
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