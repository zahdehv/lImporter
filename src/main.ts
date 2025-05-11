import { Notice, setIcon, App, Plugin, TFile, Modal, TAbstractFile, Setting, PluginSettingTab, TextAreaComponent, ItemView, WorkspaceLeaf, DropdownComponent } from 'obsidian';
import { FileItem } from './utils/fileUploader';
import { processTracker } from './utils/processTracker';
import Sortable from 'sortablejs';
import { FuzzySuggestModal } from 'obsidian';
import { ClaimInstPipe, DirectPipe, Pipeline } from './agents/pipelines';
import { listFilesTree } from './utils/filelist';
import { InteractiveProcessNotifier } from './utils/process';

interface AutoPluginSettings {
    GOOGLE_API_KEY: string;
    allowPDF: boolean;
}

const DEFAULT_SETTINGS: AutoPluginSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',
    allowPDF: true,
};

const VIEW_TYPE = "limporter-view";

class LimporterView extends ItemView {
    private plugin: AutoFilePlugin;
    private processing = false;
    private abortController?: AbortController | any;
    private prompt = "";
    private isVisible = false;
    private fileItems: FileItem[] = [];
    private currentPipeline: Pipeline | null = null;
    private textAreaComponent?: TextAreaComponent;
    private adjustPromptArea: () => void;
    private dropdown: DropdownComponent;

    constructor(leaf: WorkspaceLeaf, plugin: AutoFilePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.plugin.tracker = new processTracker(this.containerEl);
        // this.plugin.tracker = this.tracker;
        // console.log(this.tracker);
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
    
        // Create the text area container first
        const textAreaContainer = containerEl.createDiv('limporter-textarea-container');
        textAreaContainer.style.display = 'none'; // Keep hidden by default
        this.createPipelineDropdown(textAreaContainer); 

        this.createMaterialTextArea(textAreaContainer);
        
        const filesContainer = this.createFilesContainer(containerEl);
        this.renderFileItems(filesContainer);
        
        // Create the button containers
        // this.createFButtonContainer(filesContainer);
        this.createButtonContainer(containerEl);
        
        // Initialize tracker
        this.plugin.tracker = new processTracker(containerEl);
        
        (this.dropdown.selectEl as HTMLSelectElement).dispatchEvent(new Event('change'));
    }

    async addFile(file: TFile) {
        const newFileItem = await this.prepareFileData(file);
        this.fileItems.push(newFileItem);
        this.renderFileItems(
            this.containerEl.querySelector('.limporter-files-container') as HTMLElement
        );
    }

    private createFilesContainer(container: HTMLElement): HTMLElement {
        return container.createDiv('limporter-files-container');
    }

    private createButtonContainer(container: HTMLElement): void {
        const buttonContainer = container.createDiv('limporter-button-container');
        this.createVisibilityButton(buttonContainer);
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
            
            const actionContainer = fileInfoEl.createDiv('limporter-action-container');
            const trashIcon = actionContainer.createDiv('limporter-trash-icon');
            setIcon(trashIcon, 'trash-2');
            
            trashIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(fileEl.dataset.index || '0');
                this.fileItems.splice(index, 1);
                this.renderFileItems(container);
            });
        });

        // new Sortable(container, {
        //     animation: 150,
        //     handle: '.limporter-file-icon',
        //     filter: '.limporter-trash-icon',
        //     preventOnFilter: false,
        //     onStart: () => {
        //         container.querySelectorAll('.limporter-file-item').forEach(el => {
        //             el.classList.add('sortable-active');
        //         });
        //     },
        //     onEnd: () => {
        //         container.querySelectorAll('.limporter-file-item').forEach(el => {
        //             el.classList.remove('sortable-active');
        //         });
        //     }
        // });

        this.createAddButton(container);
    }

    private createVisibilityButton(container: HTMLElement): void {
        const button = container.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Show CONFIG'
        });
    
        // Find the existing textarea container instead of creating a new one
        const textAreaContainer = this.containerEl.querySelector('.limporter-textarea-container') as HTMLElement;
    
        button.addEventListener('click', () => {
            this.isVisible = !this.isVisible;
            button
                .toggleClass('stop-mode', this.isVisible);
            button.setText(this.isVisible ? 'Hide CONFIG' : 'Show CONFIG');
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
                    await this.addFile(file);
                }
            }).open();
        });
    }

    private createPipelineDropdown(container: HTMLElement): void {
        const pipelineOptions = [
            { id: 'direct_call', name: 'Direct Call', pipeline: () => new DirectPipe(this.plugin) },
            { id: 'claim_instructions', name: 'Claim Instructions', pipeline: () => new ClaimInstPipe(this.plugin) },
        ];

        const dropdownContainer = container.createDiv('limporter-dropdown-container');
        
        new Setting(dropdownContainer)
            .setName('Pipeline:')
            .addDropdown(dropdown => {
                this.dropdown = dropdown
                    // .addOption('', '- - -')
                    .addOptions(Object.fromEntries(
                        pipelineOptions.map(opt => [opt.id, opt.name])
                    ))
                    .onChange(async (value) => {
                        if (value) {
                            const selected = pipelineOptions.find(opt => opt.id === value);
                            if (selected) {
                                this.currentPipeline = selected.pipeline();
                                this.prompt = this.currentPipeline.default_prompt;
                                if (this.textAreaComponent) {
                                    this.textAreaComponent.setValue(this.prompt);
                                }
                                this.adjustPromptArea();
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

    async onClose() {
        // Clean up any resources if needed
    }
}

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
    private view: LimporterView | null = null;

    async onload() {
        await this.loadSettings();
        
        // Register the view
        this.registerView(
            VIEW_TYPE,
            (leaf) => (this.view = new LimporterView(leaf, this))
        );

        // In your plugin's onload() method
// In your plugin's onload() method
this.addRibbonIcon('dice', 'Test Process Notifier', () => {
    const notifier = new InteractiveProcessNotifier(this.app);
    
    // Simulate processing steps
    notifier.addStep("Starting test process");
    setTimeout(() => notifier.addStep("Scanning vault for files"), 1000);
    
    // Add some test files after delay
    setTimeout(() => {
        const testFiles = this.app.vault.getMarkdownFiles().slice(0, 3);
        testFiles.forEach(file => {
            notifier.addFile(file);
            notifier.addStep(`Added file: ${file.basename}`);
        });
        
        notifier.addStep("Test complete!");
    }, 2000);
});

    

        this.addRibbonIcon('pen', 'Open Local Graph', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('No active note to show local graph for');
                return;
            }
        
            // Try to find existing local graph
            const localGraphLeaves = this.app.workspace.getLeavesOfType('localgraph');
            
            if (localGraphLeaves.length > 0) {
                // Reuse existing local graph
                const leaf = localGraphLeaves[0];
                (leaf.view as any).setFile(activeFile);
                this.app.workspace.revealLeaf(leaf);
            } else {
                // Create new local graph
                const leaf = this.app.workspace.getLeaf('split');
                await leaf.setViewState({
                    type: 'localgraph',
                    state: { file: activeFile.path }
                });
                this.app.workspace.revealLeaf(leaf);
            }
        });

    this.ribbonIcon = this.addRibbonIcon(
        'bot-message-square', 
        'Open lImporter',
        () => this.openView()
    );
    this.ribbonIcon.addClass('limporter-ribbon-icon');

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

    private async openView(): Promise<void> {
        let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
        
        if (!leaf) {
            leaf = this.app.workspace.getRightLeaf(false);
            await leaf?.setViewState({ type: VIEW_TYPE });
        }
        if (leaf) {
            
            this.app.workspace.revealLeaf(leaf);
            this.view = leaf.view as LimporterView;
        }
    }


    private async openFileProcessor(file: TFile): Promise<void> {
        await this.openView();
        if (this.view) {
            await this.view.addFile(file);
        }
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