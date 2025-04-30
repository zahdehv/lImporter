import { setIcon } from "obsidian";

// Represents a single step in the progress tracker UI
export class stepItem {
    private item: HTMLDivElement; // The main div element for the step
    private oIcon: string; // Original icon specified for the step

    constructor(item: HTMLDivElement, icon: string) {
        this.item = item;
        this.oIcon = icon;
    }

    /**
     * Updates the visual state of the step item.
     * @param status - The new status ('pending', 'in-progress', 'complete', 'error').
     * @param message - Optional message to display as the status caption.
     * @param icon - Optional specific icon to set.
     */
    public updateState(status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) {
        if (!this.item) return; // Exit if the element doesn't exist

        // Set the data attribute for CSS styling based on status
        this.item.dataset.status = status;

        // Update the caption text if a message is provided
        if (message) this.updateCaption(message);

        // Update the icon based on status or if a specific icon is provided
        const iconEl = this.item.querySelector('.limporter-step-icon');

        if (icon && iconEl) {
            // Set a specific icon if provided
            setIcon(iconEl as HTMLElement, icon);
        } else if (iconEl) {
            // Set default icons based on status
            switch (status) {
                case 'complete':
                    setIcon(iconEl as HTMLElement, 'check');
                    break;
                case 'error':
                    setIcon(iconEl as HTMLElement, 'x');
                    break;
                case 'pending':
                case 'in-progress': // Use original icon for pending and in-progress
                default:
                    setIcon(iconEl as HTMLElement, this.oIcon);
                    break;
            }
        }
    }

    /**
     * Updates the text content of the status caption element.
     * @param caption - The new text for the caption.
     */
    public updateCaption(caption: string) {
        if (!this.item) return; // Exit if the element doesn't exist

        const statusEl = this.item.querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption; // Update text content
    }

    /**
     * Updates the icon. (Note: This seems redundant with updateState, maybe intended for something else?)
     * Kept for compatibility, but might need review based on usage.
     * @param caption - The text to set (likely a mistake, should be icon name?).
     */
    public updateIcon(caption: string) {
        if (!this.item) return;

        // This function currently updates the *caption*, not the icon.
        // Consider renaming or refactoring if icon update logic is needed here.
        const statusEl = this.item.querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption;
    }
}

// Manages the overall progress tracking UI component
export class processTracker {
    private progressContainer: HTMLElement; // The main container for all steps
    private steps: stepItem[] = []; // Array to hold all stepItem instances
    private text: string = ""; // Seems unused, potentially for a description?

    constructor(parentContainer: HTMLElement) {
        // Create the main container div
        this.progressContainer = parentContainer.createDiv('limporter-progress-container');
        this.progressContainer.style.display = 'flex'; // Ensure container is visible

        // Add a descriptive paragraph (optional)
        this.progressContainer.createEl('p', {
            text: `This will process your file(s) and create structured notes based on its content.`,
            cls: 'limporter-description' // Class for potential styling
        });

        // NOTE: Removed click handler for toggling visibility
    }

    /**
     * Resets the tracker, clearing all steps and resetting state.
     */
    public resetTracker() {
        this.steps = []; // Clear the steps array
        this.progressContainer.empty(); // Remove all child elements from the container
        this.progressContainer.style.display = 'flex'; // Ensure container is visible after reset
        this.text = ""; // Reset text property (if used)
    }

    // NOTE: Removed toggleStepsVisibility method
    // NOTE: Removed updateStepsVisibility method

    /**
     * Appends a new step to the progress tracker.
     * @param label - The main label text for the step.
     * @param message - The initial status message for the step.
     * @param icon - The icon identifier string for the step.
     * @returns The created stepItem instance.
     */
    public appendStep(label: string, message: string, icon: string): stepItem {
        // Create the div for the new step
        const stepEl = this.progressContainer.createDiv('limporter-progress-step');
        stepEl.dataset.status = 'pending'; // Initial status

        // Create and set the icon
        const iconContainer = stepEl.createDiv('limporter-step-icon');
        setIcon(iconContainer, icon);

        // Create the content area for label and status
        const stepContent = stepEl.createDiv('limporter-step-content');
        const stepLabel = stepContent.createDiv('limporter-step-label');
        stepLabel.textContent = label; // Set the label text

        const stepStatus = stepContent.createDiv('limporter-step-status');
        stepStatus.textContent = 'Pending'; // Initial status text

        // Create the stepItem object
        const stepItm = new stepItem(stepEl, icon);
        this.steps.push(stepItm); // Add to the internal list

        // NOTE: Removed call to updateStepsVisibility()

        // Set the initial state to 'in-progress' with the provided message
        stepItm.updateState("in-progress", message);
        return stepItm; // Return the new step item
    }
}
