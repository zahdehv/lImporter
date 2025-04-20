import { setIcon } from "obsidian";

export class stepItem {
    private item: HTMLDivElement;
    private oIcon: string;
    constructor(item: HTMLDivElement, icon: string) {
        this.item = item;
        this.oIcon = icon;
    }
    public updateState(status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string, icon?: string) {
        if (!this.item) return;
        
        this.item.dataset.status = status;
        
        const statusEl = this.item.querySelector('.limporter-step-status');
        if (statusEl && message) this.updateCaption(message);
        
        // Update icon based on status
        const iconEl = this.item.querySelector('.limporter-step-icon');
        
        if (icon && iconEl) 
            {setIcon(iconEl as HTMLElement, icon);} else 
        {if (iconEl) {
            if (status === 'complete') {
                setIcon(iconEl as HTMLElement, 'check');
            } else if (status === 'error') {
                setIcon(iconEl as HTMLElement, 'x');
            } else if (status === 'pending') {
                setIcon(iconEl as HTMLElement, this.oIcon);
            }
        }}
    }
    public updateCaption(caption: string) {
        if (!this.item) return;
        
        const statusEl = this.item.querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption;
    }
    public updateIcon(caption: string) {
        if (!this.item) return;
        
        const statusEl = this.item.querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = caption;
    }
}

export class processTracker {
    private progressContainer: HTMLElement;
    private steps: stepItem[] = [];
    private showAllSteps: boolean = false;

    constructor(parentContainer: HTMLElement) {
        this.progressContainer = parentContainer.createDiv('limporter-progress-container');
        this.progressContainer.style.display = 'flex';
        // Description text
        this.progressContainer.createEl('p', {
            text: `This will process your file and create structured notes based on its content.`,
            cls: 'limporter-description'
        });

        // Add click handler to toggle step visibility
        this.progressContainer.addEventListener('click', () => {
            this.toggleStepsVisibility();
        });
    }

    public resetTracker() {
        this.steps = [];
        this.showAllSteps = false;
        this.progressContainer.empty();
        this.progressContainer.style.display = 'flex';
    }

    private toggleStepsVisibility() {
        this.showAllSteps = !this.showAllSteps;
        this.updateStepsVisibility();
    }

    private updateStepsVisibility() {
        if (this.steps.length === 0) return;
        
        // Always show the last step
        const lastStep = this.steps[this.steps.length - 1];
        lastStep.updateState(lastStep['item'].dataset.status as any);
        
        // Show/hide other steps based on showAllSteps flag
        for (let i = 0; i < this.steps.length - 1; i++) {
            const step = this.steps[i];
            if (this.showAllSteps) {
                step['item'].style.display = 'flex';
            } else {
                step['item'].style.display = 'none';
            }
        }
    }

    public appendStep(label: string, message: string, icon: string): stepItem {
        const stepEl = this.progressContainer.createDiv('limporter-progress-step');
        stepEl.dataset.status = 'pending';

        const iconContainer = stepEl.createDiv('limporter-step-icon');
        setIcon(iconContainer, icon);

        const stepContent = stepEl.createDiv('limporter-step-content');
        const stepLabel = stepContent.createDiv('limporter-step-label');
        stepLabel.textContent = label;
        
        const stepStatus = stepContent.createDiv('limporter-step-status');
        stepStatus.textContent = 'Pending';
        
        const stepItm = new stepItem(stepEl, icon);
        this.steps.push(stepItm);
        
        // Update visibility of all steps
        this.updateStepsVisibility();
        
        stepItm.updateState("in-progress", message);
        return stepItm;
    }
}