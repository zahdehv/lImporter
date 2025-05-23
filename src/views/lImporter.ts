import { FileItem, prepareFileData } from "src/utils/files";
import lImporterPlugin from "../main";
import { ItemView, Notice } from "obsidian";
import { models, pipelineOptions } from '../agents/pipelines';
import { FileSuggestionModal } from "../utils/fileSuggestion";
import { setIcon, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { createProcessTracker } from "../utils/tracker";

export const LIMPORT_VIEW_TYPE = "limporter-view";

export class LimporterView extends ItemView {
    private plugin: lImporterPlugin;
    private processing = false;
    private abortController?: AbortController | any;
    private isConfigVisible = false;
    private isFileVisible = true;

    private fileItems: FileItem[] = [];

    private currentAgent = pipelineOptions[0].name;
    private currentModel = models[0].id;
    private pipelineStarter: (plugin: lImporterPlugin, model: string) => (files: FileItem[], signal: AbortSignal) => Promise<void> = pipelineOptions[0].buildPipeline;
    private currentPipeline: (files: FileItem[], signal: AbortSignal) => Promise<void> | null;

    private trackerContainer: HTMLElement; // Container for the processTracker's UI

    constructor(leaf: WorkspaceLeaf, plugin: lImporterPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return LIMPORT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "lImporter";
    }

    getIcon(): string {
        return "import";
    }

    async onOpen() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('limporter-view');

        const header = containerEl.createEl('h3', { cls: 'limporter-header', text: 'lImporter' });

        this.trackerContainer = containerEl.createDiv('limporter-tracker-main-container');
        this.plugin.tracker = createProcessTracker(this.plugin, this.trackerContainer);

        this.createButtonContainer(containerEl);

        this.loadAgent();

    }

    private loadAgent(){

        new Notice(`Loaded agent
name: ${this.currentAgent}
model: ${this.currentModel}`);

        this.currentPipeline = this.pipelineStarter(this.plugin, this.currentModel);
    }

    async addFile(file: TFile) {
        const newFileItem = await prepareFileData(file);
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

        const configContainer = buttonContainer.createDiv('limporter-config-container');
        configContainer.style.display = this.isConfigVisible ? 'block' : 'none';
        new Setting(configContainer).addDropdown(dropdown => {
            dropdown
                .addOptions(Object.fromEntries(pipelineOptions.map(opt => [opt.id, opt.name])))
                .onChange(async (value) => {
                    if (value) {
                        const selected = pipelineOptions.find(opt => opt.id === value);
                        if (selected) {
                            this.pipelineStarter = selected.buildPipeline;
                            this.currentAgent = selected.name;
                        }
                    }
                });
        }).addDropdown(dropdown => {
            dropdown
                .addOptions(Object.fromEntries(models.map(opt => [opt.id, opt.name])))
                .onChange(async (value) => {
                    if (value) {
                        const selected = models.find(opt => opt.id === value);
                        if (selected) this.currentModel = selected.id;
                    }
                });
        }).addButton(button=>button.setClass('limporter-button').setIcon('hard-drive-download').onClick(()=>this.loadAgent()));

        // const SbuttonContainer = buttonContainer.createDiv('limporter-sbutton-container');

        this.createConfigFileVisibilityButton(buttonContainer);
        this.createProcessButton(buttonContainer);
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
                fileEl.createEl('audio', { attr: { controls: 'true', src: URL.createObjectURL(fileItem.blob), class: 'limporter-audio-player' } });
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
        });
        setIcon(buttonF, 'file-up');
        buttonF.toggleClass('toggled-on', this.isFileVisible);
        const filesContainer = this.containerEl.querySelector('.limporter-files-container') as HTMLElement;
        buttonF.addEventListener('click', () => {
            this.isFileVisible = !this.isFileVisible;
            buttonF.toggleClass('toggled-on', this.isFileVisible);
            if (filesContainer) {
                filesContainer.style.display = this.isFileVisible ? 'flex' : 'none';
            }
        });
        
        const buttonC = container.createEl('button', {
            cls: 'limporter-button secondary',
        });
        setIcon(buttonC, 'settings');
        buttonC.toggleClass('toggled-on', this.isConfigVisible);
        const configContainer = this.containerEl.querySelector('.limporter-config-container') as HTMLElement;
        buttonC.addEventListener('click', () => {
            this.isConfigVisible = !this.isConfigVisible;
            buttonC.toggleClass('toggled-on', this.isConfigVisible);
            if (configContainer) {
                configContainer.style.display = this.isConfigVisible ? 'block' : 'none';
            }
        });
    }
    
    private createAddButton(container: HTMLElement): void {
        const button = container.createEl('button', {
            cls: 'limporter-button secondary',
        });
        setIcon(button, 'plus');
        button.style.marginTop = "0.5rem";
        button.addEventListener('click', () => {
            new FileSuggestionModal(this.app, this.plugin.getAllSupportedExtensions(), async (file) => { // Uses plugin.getAllSupportedExtensions() which will be updated
                if (file) {
                    await this.addFile(file);
                }
            }).open();
        });
    }


    private createProcessButton(container: HTMLElement): void {
        const button = container.createEl('button', {
            cls: 'limporter-button primary',
        });
        setIcon(button, "corner-down-left")
        button.addEventListener('click', async () => {
            //THE ONLY TRY
            try {
                if (this.processing) {
                    this.abortController?.abort();
                    button.disabled = true;
                    return;
                }
                if (this.plugin.tracker) {
                    this.plugin.tracker.resetTracker();
                } else {
                    this.plugin.tracker = createProcessTracker(this.plugin, this.trackerContainer);
                }
                if (!this.currentPipeline) throw new Error('No pipeline selected');
                button.addClass('stop-mode');
                setIcon(button, 'stop-circle')
                this.abortController = new AbortController();
                this.processing = true;
                const signal: AbortSignal = this.abortController.signal;
                signal.onabort = (ev: Event): any => {throw new Error("ABORTION BUAJAJAJA");}
                
                await this.currentPipeline(this.fileItems, signal);
            } catch (error: any) {
                // console.warn(error);
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(errorMsg);
                this.plugin.tracker.setInProgressStepsToError(errorMsg);
            } finally {
                this.abortController = null;
                button.removeClass('stop-mode');
                setIcon(button, 'corner-down-left')
                button.disabled = false;
                this.processing = false;
            }
        });
    }

    async onClose() {}
}