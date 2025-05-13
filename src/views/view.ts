import { FileItem } from "../utils/fileUploader";
import AutoFilePlugin from "../main";
import { ItemView } from "obsidian";
import { models, pipelineOptions } from '../utils/pipelines';
import { FileSuggestionModal } from "./fileSuggestion";
import { setIcon, Setting, TFile, TextAreaComponent, DropdownComponent, WorkspaceLeaf } from "obsidian";
import { processTracker } from "./tracker";
export const VIEW_TYPE = "limporter-view";

export class LimporterView extends ItemView {
    private plugin: AutoFilePlugin;
    private processing = false;
    private abortController?: AbortController | any;
    private isConfigVisible = false;
    private isFileVisible = true;

    // Add this to your class properties:
    private activeToggleView: 'files' | 'progress' | 'logs' | null = null;
    private viewButtons: {
        files?: HTMLButtonElement;
        progress?: HTMLButtonElement;
        logs?: HTMLButtonElement;
    } = {};

    private fileItems: FileItem[] = [];
    private currentModel = "gemini-2.5-flash-preview-04-17";
    private currentPrompt = "";
    private currentPipeline: (prompt: string, files: FileItem[], signal: AbortSignal) => Promise<void> | null;
    private textAreaComponent?: TextAreaComponent;
    private adjustPromptArea: () => void;
    private dropdown: DropdownComponent;
    private trackerContainer: HTMLElement; // Container for the processTracker's UI

    constructor(leaf: WorkspaceLeaf, plugin: AutoFilePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE;
    }

    getDisplayText(): string {
        return "lImporter";
    }

    getIcon(): string {
        return "bot-message-square";
    }

    async onOpen() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('limporter-view');

        this.trackerContainer = containerEl.createDiv('limporter-tracker-main-container');
        this.plugin.tracker = new processTracker(this.plugin, this.trackerContainer);

        this.createButtonContainer(containerEl);

        if (this.dropdown && this.dropdown.selectEl) {
            (this.dropdown.selectEl as HTMLSelectElement).dispatchEvent(new Event('change'));
        }
    }

    async addFile(file: TFile) {
        const newFileItem = await this.prepareFileData(file);
        this.fileItems.push(newFileItem);
        const filesContainerEl = this.containerEl.querySelector('.limporter-files-container') as HTMLElement;
        if (filesContainerEl) {
            this.renderFileItems(filesContainerEl);
        }
    }

    private createFilesContainer(container: HTMLElement): HTMLElement {
        const div = container.createDiv('limporter-files-container');
        return div;
    }

    private createButtonContainer(container: HTMLElement): void {
        const buttonContainer = container.createDiv('limporter-button-container');

        const filesContainer = this.createFilesContainer(buttonContainer);
        filesContainer.style.display = this.isFileVisible ? 'flex' : 'none';
        this.renderFileItems(filesContainer);

        const textAreaContainer = buttonContainer.createDiv('limporter-config-container');
        textAreaContainer.style.display = this.isConfigVisible ? 'block' : 'none';
        this.createPipelineDropdown(textAreaContainer);
        this.createMaterialTextArea(textAreaContainer);

        const SbuttonContainer = buttonContainer.createDiv('limporter-sbutton-container');
        this.createProgressVisibilityButton(SbuttonContainer);

        SbuttonContainer.createDiv({ cls: 'my-plugin-vertical-separator' });

        this.createConfigFileVisibilityButton(SbuttonContainer);
        this.createProcessButton(buttonContainer);
    }

    public async prepareFileData(file: TFile): Promise<FileItem> {
        const arrayBuffer = await this.app.vault.readBinary(file);
        const typeMap: Record<string, string> = {
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            m4a: 'audio/mp4',
            aac: 'audio/aac',
            flac: 'audio/flac',
            aiff: 'audio/aiff',
            png: 'image/png',
            jpg: 'image/jpg',
            jpeg: 'image/jpeg',
            pdf: 'application/pdf',
            md: 'text/markdown',
            txt: 'text/plain',
        };
        const mime = typeMap[file.extension.toLowerCase()] || 'application/octet-stream';
        const blob = new Blob([arrayBuffer], { type: mime });
        return {
            url: URL.createObjectURL(blob),
            blob: blob,
            title: file.name,
            path: file.path,
            mimeType: mime,
            uploaded: false,
            uploadData: null
        };
    }

    private renderFileItems(container: HTMLElement): void {
        container.empty();
        this.fileItems.forEach((fileItem, index) => {
            const fileEl = container.createDiv('limporter-file-item');
            fileEl.dataset.index = index.toString();
            const fileInfoEl = fileEl.createDiv('limporter-file-info');
            const iconEl = fileInfoEl.createDiv('limporter-file-icon');
            setIcon(iconEl, (fileItem.mimeType.includes('pdf') || fileItem.mimeType.includes('markdown')) ? 'file-text' : 'file-audio');
            const fileDetailsEl = fileInfoEl.createDiv('limporter-file-details');
            fileDetailsEl.createEl('div', { cls: 'limporter-file-name', text: fileItem.title });
            // Improved file type display
            let fileTypeDescription = 'File';
            if (fileItem.mimeType.startsWith('audio/')) {
                fileTypeDescription = 'Audio File';
            } else if (fileItem.mimeType === 'application/pdf') {
                fileTypeDescription = 'PDF Document';
            } else if (fileItem.mimeType === 'text/markdown') {
                fileTypeDescription = 'Markdown Document';
            }
            fileDetailsEl.createEl('div', { cls: 'limporter-file-type', text: fileTypeDescription });

            if (!fileItem.mimeType.includes('pdf') && !fileItem.mimeType.includes('markdown')) {
                fileEl.createEl('audio', { attr: { controls: 'true', src: fileItem.url, class: 'limporter-audio-player' } });
            }
            const actionContainer = fileInfoEl.createDiv('limporter-action-container');
            const trashIcon = actionContainer.createDiv('limporter-trash-icon');
            setIcon(trashIcon, 'trash-2');
            trashIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(fileEl.dataset.index || '0');
                this.fileItems.splice(idx, 1);
                this.renderFileItems(container);
            });
        });
        this.createAddButton(container);
    }

    private createConfigFileVisibilityButton(container: HTMLElement): void {
        const buttonF = container.createEl('button', {
            cls: 'limporter-button secondary',
            // text: this.isFileVisible ? 'CONFIG' : 'CONFIG'
        });
        setIcon(buttonF, 'file-up');
        buttonF.toggleClass('toggled-on', this.isFileVisible);
        const filesContainer = this.containerEl.querySelector('.limporter-files-container') as HTMLElement;
        buttonF.addEventListener('click', () => {
            this.isFileVisible = !this.isFileVisible;
            // buttonF.setText(this.isFileVisible ? 'CONFIG' : 'CONFIG');
            buttonF.toggleClass('toggled-on', this.isFileVisible);
            if (filesContainer) {
                filesContainer.style.display = this.isFileVisible ? 'flex' : 'none';
            }
        });
        
        const buttonC = container.createEl('button', {
            cls: 'limporter-button secondary',
            // text: this.isConfigVisible ? 'CONFIG' : 'CONFIG'
        });
        setIcon(buttonC, 'settings');
        buttonC.toggleClass('toggled-on', this.isConfigVisible);
        const textAreaContainer = this.containerEl.querySelector('.limporter-config-container') as HTMLElement;
        buttonC.addEventListener('click', () => {
            this.isConfigVisible = !this.isConfigVisible;
            // buttonC.setText(this.isConfigVisible ? 'CONFIG' : 'CONFIG');
            buttonC.toggleClass('toggled-on', this.isConfigVisible);
            if (textAreaContainer) {
                textAreaContainer.style.display = this.isConfigVisible ? 'block' : 'none';
            }
            if (this.isConfigVisible && this.textAreaComponent) {
                this.adjustPromptArea();
            }
        });
    }

    private createProgressVisibilityButton(container: HTMLElement): void {
        // Helper function to update the state of all toggleable views
        const updateToggleViews = (newActiveView: 'files' | 'progress' | 'logs' | null) => {
            this.activeToggleView = newActiveView;
    
            const views = [
                {
                    key: 'files' as const,
                    button: this.viewButtons.files,
                    containerEl: this.plugin.tracker?.filesContainer,
                },
                {
                    key: 'progress' as const,
                    button: this.viewButtons.progress,
                    containerEl: this.plugin.tracker?.progressContainer,
                },
                {
                    key: 'logs' as const,
                    button: this.viewButtons.logs,
                    containerEl: this.plugin.tracker?.logsContainer,
                },
            ];
    
            for (const view of views) {
                const isActive = this.activeToggleView === view.key;
                if (view.button) {
                    view.button.toggleClass('toggled-on', isActive);
                }
                if (view.containerEl) {
                    view.containerEl.style.display = isActive ? 'flex' : 'none';
                }
            }
        };
    
        // --- Files Button ---
        this.viewButtons.files = container.createEl('button', {
            cls: 'limporter-button secondary',
        });
        setIcon(this.viewButtons.files, 'file-down');
        this.viewButtons.files.addEventListener('click', () => {
            if (this.activeToggleView === 'files') {
                updateToggleViews(null); // Clicked active button, so toggle all off
            } else {
                updateToggleViews('files'); // Clicked inactive button, so set it as active
            }
        });
    
        // --- Progress Button ---
        this.viewButtons.progress = container.createEl('button', {
            cls: 'limporter-button secondary',
        });
        setIcon(this.viewButtons.progress, 'bug-play'); // Or your preferred icon for progress
        this.viewButtons.progress.addEventListener('click', () => {
            if (this.activeToggleView === 'progress') {
                updateToggleViews(null);
            } else {
                updateToggleViews('progress');
            }
        });
    
        // --- Logs Button ---
        this.viewButtons.logs = container.createEl('button', {
            cls: 'limporter-button secondary',
        });
        setIcon(this.viewButtons.logs, 'logs'); // Or your preferred icon for logs
        this.viewButtons.logs.addEventListener('click', () => {
            if (this.activeToggleView === 'logs') {
                updateToggleViews(null);
            } else {
                updateToggleViews('logs');
            }
        });
    
        // Initialize all views to be hidden and buttons to be off
        updateToggleViews("progress"); // Or set this.activeToggleView to its initial desired state
    }
    

    private createAddButton(container: HTMLElement): void {
        const button = container.createEl('button', {
            cls: 'limporter-button secondary',
            // text: 'Add File'
        });
        setIcon(button, 'plus');
        button.style.marginTop = "0.5rem";
        button.addEventListener('click', () => {
            new FileSuggestionModal(this.app, this.plugin.SupportedFiles(), async (file) => { // Uses plugin.SupportedFiles() which will be updated
                if (file) {
                    await this.addFile(file);
                }
            }).open();
        });
    }

    private createPipelineDropdown(container: HTMLElement): void {
        const dropdownContainer = container.createDiv('limporter-dropdown-container');

        new Setting(dropdownContainer)
            .setName('Model:')
            .addDropdown(dropdown => {
                this.dropdown = dropdown
                    .addOptions(Object.fromEntries(models.map(opt => [opt.id, opt.id])))
                    .onChange(async (value) => {
                        if (value) {
                            const selected = models.find(opt => opt.id === value);
                            if (selected) this.currentModel = selected.id;
                        }
                    });
            });
        new Setting(dropdownContainer)
            .setName('Pipeline:')
            .addDropdown(dropdown => {
                this.dropdown = dropdown
                    .addOptions(Object.fromEntries(pipelineOptions.map(opt => [opt.id, opt.name])))
                    .onChange(async (value) => {
                        if (value) {
                            const selected = pipelineOptions.find(opt => opt.id === value);
                            if (selected) {
                                this.currentPipeline = selected.buildPipeline(this.plugin, this.currentModel);
                                this.currentPrompt = selected.defaultPrompt;
                                if (this.textAreaComponent) {
                                    this.textAreaComponent.setValue(this.currentPrompt);
                                    this.adjustPromptArea();
                                }
                            }
                        }
                    });
            });
    }

    private createProcessButton(container: HTMLElement): void {
        const button = container.createEl('button', {
            cls: 'limporter-button primary',
            // text: 'Process'
        });
        setIcon(button, "play")
        button.addEventListener('click', async () => {
            if (this.processing) {
                this.abortController?.abort();
                button.disabled = true;
                return;
            }
            if (this.plugin.tracker) {
                this.plugin.tracker.resetTracker();
            } else {
                console.error("Tracker not initialized for reset");
                this.plugin.tracker = new processTracker(this.plugin, this.trackerContainer);
            }

            if (!this.currentPipeline) {
                const nopipe = this.plugin.tracker.appendStep("Pipeline Error", 'No pipeline selected', "alert-triangle");
                nopipe.updateState('error');
                console.error('No pipeline selected');
                return;
            }
            button.addClass('stop-mode');
            // button.setText('Stop');
            setIcon(button, 'square')
            this.abortController = new AbortController();
            this.processing = true;
            try {
                const signal = this.abortController.signal;
                await this.currentPipeline(this.currentPrompt, this.fileItems, signal);
            } catch (error: any) {
                console.error(error);
                const errorMsg = error instanceof Error ? error.message : String(error);
                const errorTrack = this.plugin.tracker.appendStep("General Error", errorMsg, 'x');
                errorTrack.updateState("error", errorMsg);
            } finally {
                this.abortController = null;
                button.removeClass('stop-mode');
                // button.setText('Process');
                setIcon(button, 'play')
                button.disabled = false;
                this.processing = false;
            }
        });
    }

    private createMaterialTextArea(container: HTMLElement): void {
        this.textAreaComponent = new TextAreaComponent(container)
            .setPlaceholder("Type your message...")
            .setValue("")
            .onChange((value) => this.currentPrompt = value);
        const textAreaEl = this.textAreaComponent.inputEl;
        textAreaEl.addClass("material-textarea");
        this.adjustPromptArea = () => {
            textAreaEl.style.height = 'auto';
            textAreaEl.style.height = `${textAreaEl.scrollHeight}px`;
        };
        textAreaEl.addEventListener('input', this.adjustPromptArea);
        if (this.isConfigVisible) {
            this.adjustPromptArea();
        }
    }

    async onClose() {
        // Clean up any resources if needed
    }
}