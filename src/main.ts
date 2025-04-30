import { setIcon, App, Plugin, TFile, Modal, TAbstractFile, Setting, PluginSettingTab, TextAreaComponent } from 'obsidian';
import { FileItem } from './utils/fileUploader';
import { processTracker } from './utils/processTracker';
import Sortable from 'sortablejs';
import { FuzzySuggestModal } from 'obsidian';
import { ClaimInstPipe, DirectPipe, Pipeline } from './agents/pipelines';
import { listFilesTree } from './utils/filelist';

interface AutoPluginSettings {
    GOOGLE_API_KEY: string;
    allowPDF: boolean;
}

const DEFAULT_SETTINGS: AutoPluginSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',
    allowPDF: true,
};

class AutoSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: AutoFilePlugin) {
        super(app, plugin);
    }

    async display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Google API key')
            .setDesc('Enter your Google API key here.')
            .addText(text => {
                text
                    .setPlaceholder('Enter your API key')
                    .setValue(this.plugin.settings.GOOGLE_API_KEY)
                    .onChange(async (value) => {
                        this.plugin.settings.GOOGLE_API_KEY = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Allow PDF')
            .setDesc('Allow sending PDF instead of audio.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowPDF)
                .onChange(async (value) => {
                    this.plugin.settings.allowPDF = value;
                    await this.plugin.saveSettings();
                }));
    }
}

export default class AutoFilePlugin extends Plugin {
    settings: AutoPluginSettings;
    tracker: processTracker;
    private statusBarItem: HTMLElement;
    private ribbonIcon: HTMLElement;

    async onload() {
        await this.loadSettings();
        this.ribbonIcon = this.addRibbonIcon(
            'play', 
            'play',
            async () => {
                console.log(await listFilesTree(this.app.vault, "", 5, true));
            }
        );

        // Create ribbon icon
        this.ribbonIcon = this.addRibbonIcon(
            'bot-message-square', 
            'Open lImporter',
            () => new FileProcessorModal(this).open()
        );
        this.ribbonIcon.addClass('limporter-ribbon-icon');

        // Status bar item
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('limporter-status-bar');
        this.statusBarItem.onClickEvent(() => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) this.openFileProcessor(activeFile);
        });
        setIcon(this.statusBarItem,"bot");
        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(
                this.app.vault.on("create", (file: TAbstractFile) => {
                    if (file instanceof TFile && this.isSupportedFile(file)) {
                        this.openFileProcessor(file);
                    }
                })
            );
            
            this.registerEvent(
                this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
                    if (file instanceof TFile && this.isSupportedFile(file)) {
                        menu.addItem((item) => {
                            item
                                .setTitle("Process with lImporter")
                                .setIcon("bot-message-square")
                                .onClick(() => this.openFileProcessor(file));
                        });
                    }
                })
            );
        });
        
        this.updateStatusBar();
        this.registerEvent(this.app.workspace.on('file-open', () => this.updateStatusBar()));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.updateStatusBar()));
        this.registerEvent(this.app.vault.on('modify', (file) => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile?.path === file.path) {
                this.updateStatusBar();
            }
        }));
        
        this.addSettingTab(new AutoSettingTab(this.app, this));
    }

    private updateStatusBar() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.statusBarItem.hide();
            return;
        }

        if (this.isSupportedFile(activeFile)) {
            this.statusBarItem.show();
            setIcon(this.statusBarItem, 'bot-message-square');
        } else {
            this.statusBarItem.hide();
        }
    }

    public SupportedFiles(): string[] {
        const supportedExtensions = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "aiff"];
        if (this.settings.allowPDF) supportedExtensions.push("pdf");
        return supportedExtensions;
    }

    private isSupportedFile(file: TFile): boolean {
        return this.SupportedFiles().includes(file.extension.toLowerCase());
    }

    private openFileProcessor(file: TFile) {
        new FileProcessorModal(this, file).open();
    }
    
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class FileSuggestionModal extends FuzzySuggestModal<TFile> {
    constructor(
        app: App, 
        private validExtensions: string[],
        private callback: (file: TFile | null) => void
    ) {
        super(app);
    }

    getItems(): TFile[] {
        return this.app.vault.getFiles().filter(file => 
            this.validExtensions.includes(file.extension.toLowerCase())
        );
    }

    getItemText(file: TFile): string {
        return file.name;
    }

    onChooseItem(file: TFile): void {
        this.callback(file);
    }

    onClose(): void {
        this.callback(null);
    }
}

class FileProcessorModal extends Modal {
    private plugin: AutoFilePlugin;
    private processing = false;
    private abortController?: AbortController | any;
    private prompt = "";
    private isVisible = false;
    private fileItems: FileItem[] = [];
    private currentPipeline: Pipeline|null = null;
    private textAreaComponent?: TextAreaComponent; 
    private adjustPromptArea: () => void;
    
    constructor(plugin: AutoFilePlugin, public file?: TFile) {
        super(plugin.app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('limporter-modal')
        // Initialize with primary file if provided
        if (this.file) {
            const primaryFile = await this.prepareFileData(this.file);
            this.fileItems = [primaryFile];
        }
        
        this.createHeader(contentEl);
        // this.createTrashZone(contentEl);
        const filesContainer = this.createFilesContainer(contentEl);
        this.renderFileItems(filesContainer);
        this.createFButtonContainer(contentEl);
        
        this.plugin.tracker = new processTracker(contentEl);        
        this.createPButtonContainer(contentEl);
    }

    private createHeader(container: HTMLElement): void {
        const headerEl = container.createDiv('limporter-header');
        headerEl.createEl('h3', { 
            cls: 'limporter-title',
            text: 'Process with lImporter' 
        });
    }

    // private createTrashZone(container: HTMLElement): void {
    //     this.trashZone = container.createDiv('limporter-trash-zone');
    //     setIcon(this.trashZone, 'trash-2');
    //     // this.trashZone.style.display = 'none';
    // }

    private createFilesContainer(container: HTMLElement): HTMLElement {
        return container.createDiv('limporter-files-container');
    }

    private createPButtonContainer(container: HTMLElement): void {
        const buttonContainer = container.createDiv('limporter-button-container');

        this.createPipelineDropdown(buttonContainer); 
        this.createVisibilityButton(buttonContainer);
        this.createProcessButton(buttonContainer);
    }

    private createFButtonContainer(container: HTMLElement): void {
        const buttonContainer = container.createDiv('limporter-button-container');
        
        this.createAddButton(buttonContainer);
    }

    private async prepareFileData(file: TFile): Promise<FileItem> {
        const arrayBuffer = await this.app.vault.readBinary(file);
        const typeMap: Record<string, string> = {
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            m4a: 'audio/mp4',
            aac: 'audio/aac',
            flac: 'audio/flac',
            aiff: 'audio/aiff',
            pdf: 'application/pdf'
        };
        const mime = typeMap[file.extension.toLowerCase()] || 'application/octet-stream';
        const blob = new Blob([arrayBuffer], { type: mime });
        return {
            url: URL.createObjectURL(blob),
            blob: blob,
            title: file.name,
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
            setIcon(iconEl, fileItem.mimeType.includes('pdf') ? 'file-text' : 'file-audio');
    
            
            const fileDetailsEl = fileInfoEl.createDiv('limporter-file-details');
            fileDetailsEl.createEl('div', { 
                cls: 'limporter-file-name',
                text: fileItem.title 
            });
            fileDetailsEl.createEl('div', { 
                cls: 'limporter-file-type',
                text: fileItem.mimeType.includes('pdf') ? 'PDF Document' : 'Audio File' 
            });

            if (!fileItem.mimeType.includes('pdf')) {
                fileEl.createEl('audio', {
                    attr: {
                        controls: 'true',
                        src: fileItem.url,
                        class: 'limporter-audio-player'
                    }
                });
            }
            
            // Action container with BOTH drag handle and trash icon
            const actionContainer = fileInfoEl.createDiv('limporter-action-container');
            // Drag handle
            // const dragHandle = actionContainer.createDiv('limporter-drag-handle');
            // setIcon(dragHandle, 'grip-vertical'); // Using a grip icon
            
            // Trash icon (always visible)
            const trashIcon = actionContainer.createDiv('limporter-trash-icon');
            setIcon(trashIcon, 'trash-2');
            
            // Add this inside the file item loop
            trashIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(fileEl.dataset.index || '0');
                this.fileItems.splice(index, 1);
                this.renderFileItems(container);
                console.log(this.fileItems);
            });

        });

        // Initialize SortableJS with trash zone support
        new Sortable(container, {
            animation: 150,
            handle: '.limporter-file-icon', // Only the grip icon is draggable
            filter: '.limporter-trash-icon', // Prevent dragging from trash icon
            preventOnFilter: false, // Allow click events on filtered elements
            onStart: () => {
                // Visual feedback during drag
                container.querySelectorAll('.limporter-file-item').forEach(el => {
                    el.classList.add('sortable-active');
                });
            },
            onEnd: () => {
                // Clean up visual feedback
                container.querySelectorAll('.limporter-file-item').forEach(el => {
                    el.classList.remove('sortable-active');
                });
            }
        });
        
    }

    private createVisibilityButton(container: HTMLElement): void {
        const button = container.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Show PROMPT'
        });

        const textAreaContainer = this.contentEl.createDiv('limporter-textarea-container');
        textAreaContainer.style.display = 'none';
        this.createMaterialTextArea(textAreaContainer);

        button.addEventListener('click', () => {
            this.isVisible = !this.isVisible;
            button
                .toggleClass('stop-mode', this.isVisible);
            button.setText(this.isVisible ? 'Hide PROMPT' : 'Show PROMPT');
            textAreaContainer.style.display = this.isVisible ? 'block' : 'none';
            this.adjustPromptArea();
        });
    }

    private createAddButton(container: HTMLElement): void {
        const button = container.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Add File'
        });

        button.addEventListener('click', () => {
            new FileSuggestionModal(this.app, this.plugin.SupportedFiles(), async (file) => {
                if (file) {
                    const newFileItem = await this.prepareFileData(file);
                    this.fileItems.push(newFileItem);
                    this.renderFileItems(
                        this.contentEl.querySelector('.limporter-files-container')  as HTMLElement
                    );
                }
            }).open();
        });
    }
    private createPipelineDropdown(container: HTMLElement): void {
        const pipelineOptions = [
            { id: 'claim_instructions', name: 'Claim Instructions', pipeline: () => new ClaimInstPipe(this.plugin) },
            { id: 'direct_call', name: 'Direct Call', pipeline: () => new DirectPipe(this.plugin) },
            // Add more pipelines here as needed
        ];

        const dropdownContainer = container.createDiv('limporter-dropdown-container');
        
        new Setting(dropdownContainer)
            .setName('Pipeline:')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('', '- - -')
                    .addOptions(Object.fromEntries(
                        pipelineOptions.map(opt => [opt.id, opt.name])
                    ))
                    .onChange(async (value) => {
                        if (value) {
                            const selected = pipelineOptions.find(opt => opt.id === value);
                            if (selected) {
                                // console.log(value);
                                this.currentPipeline = selected.pipeline();
                                // Update the prompt with the pipeline's default
                                this.prompt = this.currentPipeline.default_prompt;
                                // Update the textarea if it exists
                                if (this.textAreaComponent) {
                                    this.textAreaComponent.setValue(this.prompt);
                                }
                                this.adjustPromptArea()
                                // console.log(this.currentPipeline);
                                // Enable the process button when a pipeline is selected
                                // const processBtn = container.querySelector('.limporter-button') as HTMLButtonElement;
                                // if (processBtn) processBtn.disabled = false;
                            }
                        }
                    });
            });
    }


    private createProcessButton(container: HTMLElement): void {
        const button = container.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Process'
        });
        // button.disabled = true;

        button.addEventListener('click', async () => {
            if (this.processing) {
                this.abortController?.abort();
                button.disabled = true;
                return;
            }

            this.plugin.tracker.resetTracker();
            
            if (!this.currentPipeline) {
                const nopipe = this.plugin.tracker.appendStep("Pipeline Error", 'No pipeline selected', "test");
                nopipe.updateState('error');
                console.error('No pipeline selected');
                return;
            }
            button.addClass('stop-mode');
            button.setText('Stop');
            this.abortController = new AbortController();
            this.processing = true;
            
            
            try {
                const signal = this.abortController.signal;
                await this.currentPipeline.call(this.prompt, this.fileItems, signal);
            } catch (error) {
                console.error(error);
                const errorTrack = this.plugin.tracker.appendStep("General Error", error, 'x');
                errorTrack.updateState("error", error);
            } finally {
                this.abortController = null;
                button.removeClass('stop-mode');
                button.setText('Process');
                button.disabled = false;
                this.processing = false;
            }
        });
    }

    private createMaterialTextArea(container: HTMLElement): void {
        this.textAreaComponent = new TextAreaComponent(container)
            .setPlaceholder("Type your message...")
            .setValue("")
            .onChange((value) => this.prompt = value);

        const textAreaEl = this.textAreaComponent.inputEl;
        textAreaEl.addClass("material-textarea");
        
        this.adjustPromptArea = () => {
            textAreaEl.style.height = 'auto';
            textAreaEl.style.height = `${textAreaEl.scrollHeight}px`;
        };

        this.adjustPromptArea();
        textAreaEl.addEventListener('input', this.adjustPromptArea);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}