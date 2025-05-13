import { App, setIcon, TFile, Notice, WorkspaceLeaf, MarkdownRenderer } from "obsidian";
import AutoFilePlugin from "src/main";
import { threadId } from "worker_threads";

// Represents a single step in the progress tracker UI
export class stepItem {
    private item: HTMLDivElement; // The main div element for the step
    private oIcon: string; // Original icon specified for the step
    private pT: processTracker;

    constructor(item: HTMLDivElement, icon: string, pT: processTracker) {
        this.item = item;
        this.oIcon = icon;
        this.pT = pT;
    }

    /**
     * Updates the visual state of the step item.
     * @param status - The new status ('pending', 'in-progress', 'complete', 'error').
     * @param message - Optional message to display as the status caption.
     * @param icon - Optional specific icon to set.
     */
    public updateState(status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) {
        if (!this.item) return; // Exit if the element doesn't exist

        this.item.dataset.status = status;

        if (message) this.updateCaption(message);

        const iconEl = this.item.querySelector('.limporter-step-icon');

        if (icon && iconEl) {
            setIcon(iconEl as HTMLElement, icon);
        } else if (iconEl) {
            switch (status) {
                case 'complete':
                    setIcon(iconEl as HTMLElement, 'check');
                    break;
                case 'error':
                    setIcon(iconEl as HTMLElement, 'x');
                    if (message) {
                        this.pT.writeLog(`
### ERROR
\`\`\`diff
- ${message}
\`\`\``);   
}
                    break;
                case 'pending':
                case 'in-progress':
                default:
                    setIcon(iconEl as HTMLElement, this.oIcon);
                    break;
            }
        }
    }

    public updateCaption(caption: string) {
        if (!this.item) return;
        const statusEl = this.item.querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption;
    }

    // This method might be redundant or misnamed as it updates caption, not icon.
    public updateIcon(caption: string) {
        if (!this.item) return;
        const statusEl = this.item.querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption; // Actually updates caption
    }
}

// Manages the overall progress tracking UI component
export class processTracker {
    public progressContainer: HTMLElement; // Root element of the tracker UI, visibility managed externally
    private stepsContainer: HTMLElement;    // Container for actual step items
    public filesContainer: HTMLElement;    // Container for the files section
    private filesListContainer: HTMLElement; // Specific list element for appended files
    public logsContainer: HTMLElement;
    public logsMDContainer: HTMLElement;
    private steps: stepItem[] = [];
    private logs: string = "";
    private plugin;
    constructor(plugin: AutoFilePlugin, parentContainerForTracker: HTMLElement) {
        this.plugin = plugin;
        this.filesContainer = parentContainerForTracker.createDiv('limporter-steps-display-container');
        this.filesContainer.style.marginTop = '1rem';
        this.filesContainer.createEl('h4', { text: 'Tracked Files:', cls: 'limporter-files-tracker-title' });
        this.filesListContainer = this.filesContainer.createDiv('limporter-files-list');
        this.filesListContainer.style.display = 'flex'; // Internal layout
        this.filesListContainer.style.flexDirection = 'column';
        this.filesListContainer.style.gap = '0.3rem';
        
        // processTracker builds its UI inside the parentContainerForTracker
        this.progressContainer = parentContainerForTracker.createDiv('limporter-steps-display-container');
        // Initial display style (e.g., 'flex' or 'none') is managed by LimporterView
        this.progressContainer.style.marginTop = '1rem';
        // this.progressContainer.createEl('p', {
            //     text: `Steps tracked:`,
            //     cls: 'limporter-description'
            // });
            this.progressContainer.createEl('h4', { text: 'Tracked Steps:', cls: 'limporter-files-tracker-title' });
            
            this.stepsContainer = this.progressContainer.createDiv('limporter-steps-display-container');
            this.stepsContainer.style.display = 'flex'; // Internal layout
            this.stepsContainer.style.flexDirection = 'column';
            this.stepsContainer.style.gap = '0.1rem';
            
            this.logsContainer = parentContainerForTracker.createDiv('limporter-steps-display-container');
            this.logsContainer.style.marginTop = '1rem';
            this.logsContainer.createEl('h4', { text: 'Logs:', cls: 'limporter-files-tracker-title' });
            this.logsMDContainer = this.logsContainer.createDiv('limporter-files-list');
        MarkdownRenderer.render(this.plugin.app, this.logs, this.logsMDContainer, "", this.plugin)
    }
    
    public resetTracker() {
        this.logs = "";
        this.steps = [];
        this.stepsContainer.empty();
        // this.progressContainer.empty();
        this.filesListContainer.empty();
        this.logsMDContainer.empty()
        // Visibility of progressContainer is handled by LimporterView
    }
    
    public writeLog(log: string): void {
        this.logs +=log+"\n\n---\n\n";
        // console.log(this.logs);
        MarkdownRenderer.render(this.plugin.app, this.logs, this.logsMDContainer, "", this.plugin)
    }

    public appendStep(label: string, message: string, icon: string): stepItem {
        const stepEl = this.stepsContainer.createDiv('limporter-progress-step');
        stepEl.dataset.status = 'pending';

        const iconContainer = stepEl.createDiv('limporter-step-icon');
        setIcon(iconContainer, icon);

        const stepContent = stepEl.createDiv('limporter-step-content');
        const stepLabel = stepContent.createDiv('limporter-step-label');
        stepLabel.textContent = label;

        stepContent.createDiv('limporter-step-status'); // Placeholder, updateState will fill it

        const stepItm = new stepItem(stepEl, icon, this);
        this.steps.push(stepItm);
        stepItm.updateState("in-progress", message);
        return stepItm;
    }

    public async appendFileByPath(filePath: string): Promise<void> {
        if (!this.plugin.app) {
            console.error("ProcessTracker: App instance is not available to resolve file path.");
            new Notice("ProcessTracker error: Cannot resolve file path.");
            return;
        }
        const abstractFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
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
        this.appendFile(file);
    }

    public appendFile(file: TFile): void {
        const fileItemEl = this.filesListContainer.createDiv('limporter-tracked-file-item');
        fileItemEl.setText(file.basename);
        fileItemEl.addClass('clickable-icon');

        fileItemEl.addEventListener('click', async () => {
            // 1. Open and focus the clicked file in the main workspace
            let fileDisplayLeaf: WorkspaceLeaf | null = null;
            const markdownLeaves = this.plugin.app.workspace.getLeavesOfType("markdown");

            // Try to find an existing leaf that isn't a sidebar or special view
            // Or, use the current active leaf if it's a markdown view.
            // Otherwise, get a new leaf.
            if (this.plugin.app.workspace.activeLeaf && this.plugin.app.workspace.activeLeaf.view.getViewType() === 'markdown') {
                fileDisplayLeaf = this.plugin.app.workspace.activeLeaf;
            } else if (markdownLeaves.length > 0) {
                fileDisplayLeaf = markdownLeaves[0]; // Fallback to the first available markdown leaf
            } else {
                fileDisplayLeaf = this.plugin.app.workspace.getLeaf(true); // Create a new leaf if none suitable
            }

            if (!fileDisplayLeaf) {
                new Notice("Could not find or create a leaf to open the file.");
                console.error("ProcessTracker: Could not obtain a suitable leaf for opening file.");
                return;
            }

            await fileDisplayLeaf.openFile(file, { active: true }); // Open the file
            this.plugin.app.workspace.setActiveLeaf(fileDisplayLeaf, { focus: true }); // Ensure it's the active leaf and focused

            // new Notice(`Opened: ${file.basename}. Opening local graph...`);

            // 2. Open/update the local graph for this now active file
            let localGraphLeaf: WorkspaceLeaf | null = null;
            const existingLocalGraphLeaves = this.plugin.app.workspace.getLeavesOfType('localgraph');

            if (existingLocalGraphLeaves.length > 0) {
                localGraphLeaf = existingLocalGraphLeaves[0];
                this.plugin.app.workspace.revealLeaf(localGraphLeaf); // Ensure it's visible
            } else {
                localGraphLeaf = this.plugin.app.workspace.getRightLeaf(false); // Try to open in right split
                if (!localGraphLeaf || localGraphLeaf === fileDisplayLeaf) { // If no right split or it's the same as file display
                    localGraphLeaf = this.plugin.app.workspace.getLeaf(false); // Fallback to a new tab
                }
            }

            if (localGraphLeaf) {
                const view = localGraphLeaf.view;
                // Try to use setFile if available, otherwise use setViewState
                if (view && view.getViewType() === 'localgraph' && typeof (view as any).setFile === 'function') {
                    (view as any).setFile(file); // Pass the TFile object
                } else {
                    await localGraphLeaf.setViewState({
                        type: 'localgraph',
                        state: { file: file.path }, // Use the path of the clicked file
                        active: true, // Make the local graph leaf active
                    });
                }
                this.plugin.app.workspace.revealLeaf(localGraphLeaf); // Ensure it's revealed
            } else {
                new Notice("Could not open or find/create a leaf for the local graph.");
                console.error("ProcessTracker: Could not obtain a suitable leaf for the local graph.");
            }
        });
    }
}