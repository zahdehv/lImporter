import { Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import lImporterPlugin from 'src/main';

/**
 * Represents a single step in a tracked process.
 * Provides methods to update its state and appearance.
 */
export type StepItemInstance = {
    /** The main HTMLDivElement for this step item. */
    item: HTMLDivElement; 
    /** 
     * Updates the visual state of the step.
     * @param status - The new status (e.g., 'pending', 'complete').
     * @param message - Optional message to display for the status.
     * @param icon - Optional icon to set for this state.
     */
    updateState: (status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) => void;
    /** 
     * Updates the caption/message of the step.
     * @param caption - The new caption text.
     */
    updateCaption: (caption: string) => void;
};

/**
 * Creates a StepItemInstance object, encapsulating the logic for a single step's UI.
 * @param itemElement - The HTMLDivElement that represents this step.
 * @param originalIcon - The default icon name to use for pending/in-progress states.
 * @returns A StepItemInstance.
 * @internal
 */
const createStepItem = (itemElement: HTMLDivElement, originalIcon: string): StepItemInstance => {
    const oIcon = originalIcon; // Original icon for resetting
    const item = itemElement;   // The step's main div element

    // Updates the status message part of the step item
    const updateCaption = (caption: string) => {
        if (!item) return;
        const statusEl = item.querySelector<HTMLDivElement>('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption;
    };

    // Updates the overall state (data attribute, message, icon) of the step item
    const updateState = (status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) => {
        if (!item) return; 

        item.dataset.status = status; // Set data-status for CSS styling or selection

        if (message) updateCaption(message); // Update the textual message

        const iconEl = item.querySelector<HTMLElement>('.limporter-step-icon');
        if (!iconEl) return;

        // Set icon based on provided icon string or status
        if (icon) {
            setIcon(iconEl, icon);
        } else {
            switch (status) {
                case 'complete':
                    setIcon(iconEl, 'check');
                    break;
                case 'error':
                    setIcon(iconEl, 'x');
                    break;
                case 'pending':
                case 'in-progress':
                default:
                    setIcon(iconEl, oIcon); // Reset to original/default icon
                    break;
            }
        }
    };

    return {
        item,
        updateState,
        updateCaption,
    };
};

/**
 * Represents the instance of a process tracker UI.
 * Provides methods to manage and update the display of tracked files and steps.
 */
export type ProcessTrackerInstance = {
    /** HTMLElement serving as the container for step display. */
    progressContainer: HTMLElement; 
    /** HTMLElement serving as the container for tracked file display. */
    filesContainer: HTMLElement;    
    /** Resets the tracker, clearing all steps and files from the UI. */
    resetTracker: () => void;
    /** 
     * Appends a new step to the tracker.
     * @param label - The main label for the step.
     * @param message - An initial message/status for the step.
     * @param icon - The icon name for this step.
     * @param status - The initial status of the step.
     * @returns A StepItemInstance for the newly created step.
     */
    appendStep: (label: string, message: string, icon: string, status?: 'pending' | 'in-progress' | 'complete' | 'error') => StepItemInstance;
    /** 
     * Appends a file to the "Tracked Files" list in the UI.
     * @param filePath - The path of the file to append.
     */
    appendFile: (filePath: string) => Promise<void>;
    /** Sets all currently 'in-progress' steps to an 'error' state.
     * @param errorMessage - Optional message for the error state.
     */
    setInProgressStepsToError: (errorMessage?: string) => void;
    /** Returns an AbortSignal for cancelling associated operations. */
    getSignal: () => AbortSignal;
};

/**
 * Factory function to create and manage the UI component for tracking processes.
 * This includes displaying a list of tracked files and a sequence of steps with statuses.
 * 
 * @param pluginInstance - The instance of the lImporterPlugin.
 * @param parentContainerForTracker - The HTMLElement where the tracker UI will be appended.
 * @returns A ProcessTrackerInstance providing methods to interact with the tracker UI.
 */
export const createProcessTracker = (pluginInstance: lImporterPlugin, parentContainerForTracker: HTMLElement): ProcessTrackerInstance => {
    let steps: StepItemInstance[] = []; // Internal list of current step instances

    // --- Setup Tracked Files Area ---
    const filesContainer = parentContainerForTracker.createDiv('limporter-steps-display-container');
    filesContainer.style.marginTop = '1rem'; // Add some top margin
    filesContainer.createEl('h4', { text: 'Tracked Files:', cls: 'limporter-files-tracker-title' });
    const filesListContainer = filesContainer.createDiv('limporter-files-list'); // Container for individual file items
    filesListContainer.style.display = 'flex';
    filesListContainer.style.flexDirection = 'column';
    filesListContainer.style.gap = '0.3rem'; // Spacing between file items
    
    // --- Setup Tracked Steps Area ---
    const progressContainer = parentContainerForTracker.createDiv('limporter-steps-display-container');
    progressContainer.style.marginTop = '1rem';
    progressContainer.createEl('h4', { text: 'Tracked Steps:', cls: 'limporter-files-tracker-title' });
    const stepsContainer = progressContainer.createDiv('limporter-steps-display-container'); // Container for individual step items
    stepsContainer.style.display = 'flex';
    stepsContainer.style.flexDirection = 'column';
    stepsContainer.style.gap = '0.1rem'; // Spacing between step items
    
    // Method to clear all tracked files and steps from the UI
    const resetTracker = (): void => {
        steps = []; // Clear internal StepItemInstance array
        stepsContainer.empty(); // Clear steps from UI
        filesListContainer.empty(); // Clear tracked files from UI
    };
    
    // Method to add a new step to the UI
    const appendStep = (label: string, message: string, icon: string, status?: 'pending' | 'in-progress' | 'complete' | 'error'): StepItemInstance => {
        const stepEl = stepsContainer.createDiv('limporter-progress-step'); // Main element for the step
        stepEl.dataset.status = status || 'in-progress'; // Default to 'in-progress'

        const iconContainer = stepEl.createDiv('limporter-step-icon');
        setIcon(iconContainer, icon); // Set the step's icon

        const stepContent = stepEl.createDiv('limporter-step-content');
        const stepLabel = stepContent.createDiv('limporter-step-label');
        stepLabel.textContent = label; // Set the step's label

        stepContent.createDiv('limporter-step-status'); // Placeholder for status message, filled by updateState

        // --- Associate currently tracked files with this step ---
        const currentTrackedFileElements = filesListContainer.children;
        if (currentTrackedFileElements.length > 0) {
            const associatedFilesContainer = stepContent.createDiv('limporter-step-associated-files');
            associatedFilesContainer.style.marginTop = "5px"; // Add some space

            // Use HTML <details> element for a collapsible list of associated files
            const detailsEl = associatedFilesContainer.createEl('details');
            const summaryEl = detailsEl.createEl('summary');
            summaryEl.textContent = `Associated Files (${currentTrackedFileElements.length})`;
            summaryEl.addClass("limporter-associated-files-summary");

            const filesListInStepEl = detailsEl.createEl('ul');
            filesListInStepEl.addClass("limporter-associated-files-list");
            
            // Clone/copy file names from the main "Tracked Files" list
            for (let i = 0; i < currentTrackedFileElements.length; i++) {
                const fileItem = currentTrackedFileElements[i] as HTMLElement; // Assumes children are HTMLElements
                if (fileItem.textContent) {
                    const listItem = filesListInStepEl.createEl('li');
                    listItem.textContent = fileItem.textContent;
                }
            }
        }

        // Create the StepItemInstance to manage this step's state
        const stepItm = createStepItem(stepEl, icon);
        steps.push(stepItm); // Add to internal list
        stepItm.updateState(status || 'in-progress', message); // Set initial state and message
        
        return stepItm;
    };

    // Method to add a file to the "Tracked Files" list in the UI
    const appendFile = async (filePath: string): Promise<void> => {
        if (!pluginInstance.app) { // Guard against missing app instance
            console.error("ProcessTracker: App instance is not available.");
            new Notice("ProcessTracker error: Cannot resolve file path.");
            return;
        }
        // Attempt to get the file from the vault
        const abstractFile = pluginInstance.app.vault.getAbstractFileByPath(filePath);
        if (!abstractFile) {
            new Notice(`Tracked File: Not found at path: ${filePath}`);
            console.warn(`ProcessTracker: File not found at path: ${filePath}`);
            return;
        }
        if (!(abstractFile instanceof TFile)) { // Ensure it's a file, not a folder
            new Notice(`Tracked File: Item at ${filePath} is not a file.`);
            console.warn(`ProcessTracker: Item at path ${filePath} is not a TFile.`);
            return;
        }
        const file = abstractFile as TFile; // Now confirmed as TFile
        
        // Create and add the file item element to the list
        const fileItemEl = filesListContainer.createDiv('limporter-tracked-file-item');
        fileItemEl.setText(file.path); // Display file path
        fileItemEl.addClass('clickable-icon'); // Add class for pointer cursor

        // Make the file item clickable to open the file
        fileItemEl.addEventListener('click', async () => {
            let fileDisplayLeaf: WorkspaceLeaf | null = null;
            const markdownLeaves = pluginInstance.app.workspace.getLeavesOfType("markdown");

            // Prefer opening in the active markdown leaf, or an existing one, or a new one
            if (pluginInstance.app.workspace.activeLeaf && pluginInstance.app.workspace.activeLeaf.view.getViewType() === 'markdown') {
                fileDisplayLeaf = pluginInstance.app.workspace.activeLeaf;
            } else if (markdownLeaves.length > 0) {
                fileDisplayLeaf = markdownLeaves[0];
            } else {
                fileDisplayLeaf = pluginInstance.app.workspace.getLeaf(true); // Create new leaf
            }

            if (!fileDisplayLeaf) {
                new Notice("Could not find or create a leaf to open the file.");
                console.error("ProcessTracker: Could not obtain a suitable leaf for opening file.");
                return;
            }

            await fileDisplayLeaf.openFile(file, { active: true }); // Open the file
            pluginInstance.app.workspace.setActiveLeaf(fileDisplayLeaf, { focus: true }); // Focus the leaf

            // Optionally, open the local graph view for this file
            if (pluginInstance.settings.load_graph_when_clicking_created_file) {
                let localGraphLeaf: WorkspaceLeaf | null = null;
                const existingLocalGraphLeaves = pluginInstance.app.workspace.getLeavesOfType('localgraph');

                if (existingLocalGraphLeaves.length > 0) {
                    localGraphLeaf = existingLocalGraphLeaves[0]; // Use existing local graph
                    pluginInstance.app.workspace.revealLeaf(localGraphLeaf);
                } else {
                    // Create new leaf for local graph, try to avoid using the same leaf as file display
                    if (!localGraphLeaf || localGraphLeaf === fileDisplayLeaf) { 
                        localGraphLeaf = pluginInstance.app.workspace.getLeaf(false); // Try to get a new leaf without splitting, or split
                    }
                }

                if (localGraphLeaf) {
                    const view = localGraphLeaf.view;
                    // Check if the view has a 'setFile' method (common for local graph)
                    // This uses 'as any' because 'setFile' is not a universally declared method on View.
                    if (view && view.getViewType() === 'localgraph' && typeof (view as any).setFile === 'function') {
                        (view as any).setFile(file); 
                    } else {
                        // Fallback to setting view state if 'setFile' is not available
                        await localGraphLeaf.setViewState({
                            type: 'localgraph',
                            state: { file: file.path }, // State for local graph often includes the file path
                            active: true, 
                        });
                    }
                    pluginInstance.app.workspace.revealLeaf(localGraphLeaf); // Show the graph
                } else {
                    new Notice("Could not open or find/create a leaf for the local graph.");
                    console.error("ProcessTracker: Could not obtain a suitable leaf for the local graph.");
                }
            }
        });
    };
    
    const setInProgressStepsToError = (errorMessage?: string): void => {
        if (!steps || steps.length === 0) {
            return; 
        }
        steps.forEach(step => {
            if (step.item && step.item.dataset.status === 'in-progress') {
                step.updateState('error', errorMessage || "Process interrupted or timed out.");
            }
        });
    };
    
    const getSignal = () => {
        return new AbortController().signal;
    };

    return {
        progressContainer,
        filesContainer,
        resetTracker,
        appendStep,
        appendFile,
        setInProgressStepsToError,
        getSignal
    };
};
