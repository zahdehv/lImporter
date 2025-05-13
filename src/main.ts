
import { App, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TextAreaComponent, ItemView, WorkspaceLeaf, DropdownComponent, setIcon, prepareFuzzySearch, FuzzySuggestModal } from 'obsidian';
import { FileItem } from './utils/fileUploader';
import { processTracker } from './utils/tracker'; // Ensure this path is correct
import { ClaimInstPipe, DefaultPipe, DirectPipe, LitePipe, LiteTESTPipe, Pipeline, pipelineOptions } from './utils/pipelines';

import { listFilesTree } from './utils/fileLister';

interface AutoPluginSettings {
    GOOGLE_API_KEY: string;
    track_ReadFiles : boolean;
    autoCapture_audio: boolean;
    autoCapture_image: boolean;
    autoCapture_document: boolean;
    autoCapture_plain_text: boolean;
}

const DEFAULT_SETTINGS: AutoPluginSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',
    track_ReadFiles : true,
    autoCapture_audio: true,
    autoCapture_image: true,
    autoCapture_document: true,
    autoCapture_plain_text: false,
};

const VIEW_TYPE = "limporter-view";

class LimporterView extends ItemView {
    private plugin: AutoFilePlugin;
    private processing = false;
    private abortController?: AbortController | any;
    private isConfigVisible = false;
    private isProgressVisible = false;
    private isLogVisible = false;
    private isTrackedFilesVisible = false;

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
        if (this.plugin.tracker.progressContainer) {
            this.plugin.tracker.progressContainer.style.display = this.isProgressVisible ? 'flex' : 'none';
        }
        if (this.plugin.tracker.filesContainer) {
            this.plugin.tracker.filesContainer.style.display = this.isTrackedFilesVisible ? 'flex' : 'none';
        }
        if (this.plugin.tracker.logsContainer) {
            this.plugin.tracker.logsContainer.style.display = this.isLogVisible ? 'flex' : 'none';
        }

        const filesContainer = this.createFilesContainer(containerEl);
        this.renderFileItems(filesContainer);

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

        const textAreaContainer = buttonContainer.createDiv('limporter-config-container');
        textAreaContainer.style.display = this.isConfigVisible ? 'block' : 'none';
        this.createPipelineDropdown(textAreaContainer);
        this.createMaterialTextArea(textAreaContainer);

        const SbuttonContainer = buttonContainer.createDiv('limporter-sbutton-container');
        this.createProgressVisibilityButton(SbuttonContainer);

        SbuttonContainer.createDiv({ cls: 'my-plugin-vertical-separator' });

        this.createConfigVisibilityButton(SbuttonContainer);
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

    private createConfigVisibilityButton(container: HTMLElement): void {
        const button = container.createEl('button', {
            cls: 'limporter-button secondary',
            // text: this.isConfigVisible ? 'CONFIG' : 'CONFIG'
        });
        setIcon(button, 'settings');
        const textAreaContainer = this.containerEl.querySelector('.limporter-config-container') as HTMLElement;
        button.addEventListener('click', () => {
            this.isConfigVisible = !this.isConfigVisible;
            // button.setText(this.isConfigVisible ? 'CONFIG' : 'CONFIG');
            button.toggleClass('toggled-on', this.isConfigVisible);
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
        setIcon(this.viewButtons.files, 'file');
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
        updateToggleViews(null); // Or set this.activeToggleView to its initial desired state
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

        const models = [
            {id: "gemini-2.5-flash-preview-04-17"},
            {id: "gemini-2.0-flash"},
            {id: "gemini-2.0-flash-lite"},
        ]

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
                                this.currentPipeline = selected.buildPipeline(this.plugin, "gemini-2.0-flash");
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

class AutoSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: AutoFilePlugin) {
        super(app, plugin);
    }

    async display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h3', { text: 'API Settings' });
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

        containerEl.createEl('h3', { text: 'File Tracking Settings' });
        new Setting(containerEl)
            .setName('Track read files too')
            .setDesc('Allow tracking the files read by the agent.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.track_ReadFiles)
                .onChange(async (value) => {
                    this.plugin.settings.track_ReadFiles = value;
                    await this.plugin.saveSettings();
                }));
        
        containerEl.createEl('h3', { text: 'Auto-Capture Settings' });
        const fileTypeConfigs = this.plugin.getSupportedFileTypesConfig();
        for (const typeKey in fileTypeConfigs) {
            const config = fileTypeConfigs[typeKey];
            const settingKey = `autoCapture_${typeKey}` as keyof AutoPluginSettings;

            new Setting(containerEl)
                .setName(`Auto-capture ${config.description}`)
                .setDesc(`Automatically process new ${config.description.toLowerCase()} with lImporter.`)
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings[settingKey] === true) // Ensure it's a boolean
                    .onChange(async (value) => {
                        (this.plugin.settings as any)[settingKey] = value;
                        await this.plugin.saveSettings();
                    }));
        }
    }
}

export default class AutoFilePlugin extends Plugin {
    settings: AutoPluginSettings;
    tracker!: processTracker;
    private statusBarItem!: HTMLElement;
    private ribbonIcon!: HTMLElement;
    public view: LimporterView | null = null;

    // Defines categories of supported files and their extensions
    public getSupportedFileTypesConfig(): { [key: string]: { extensions: string[], description: string } } {
        return {
            audio: { 
                extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "aiff"], 
                description: "Audio files" 
            },
            image: {
                extensions: ["png", "jpg", "jpeg"],
                description: "Image files"
            },
            document: { 
                extensions: ["pdf"], 
                description: "Document files" 
            },
            plain_text: { 
                extensions: ["md", "txt"], 
                description: "Plain text files" 
            },
        };
    }

    // Returns a flat array of all supported extensions
    public getAllSupportedExtensions(): string[] {
        const config = this.getSupportedFileTypesConfig();
        return Object.values(config).flatMap(type => type.extensions);
    }

    async onload() {
        await this.loadSettings();
        this.registerView(
            VIEW_TYPE,
            (leaf) => (this.view = new LimporterView(leaf, this))
        );

        this.addRibbonIcon('pen', 'Open Local Graph', async () => {
        //     const activeFile = this.app.workspace.getActiveFile();
        //     if (!activeFile) {
        //         new Notice('No active note to show local graph for');
        //         return;
        //     }
        //    console.log(this.app.metadataCache.getFileCache(activeFile)?.frontmatter?.Title);
        
        // const fzz = prepareFuzzySearch("Computer  Sciences");
        // console.log(fzz("asdasfaf ComputerScience bajabajjajajajaa"));

        try {
            const rootPath = '/'; // Or specify a subfolder like 'MyFolder'
            const maxDepth = 2; // Keep depth shallow if including content
            const showFiles = true;
            const showContent = true; // <<< Set to true to include content
            const contentLines = 50;   // <<< Max lines per file

            console.log(`Generating tree for '${rootPath}', depth ${maxDepth}, files: ${showFiles}, content: ${showContent} (${contentLines} lines)`);

            const treeString = await listFilesTree(
                this.app,
                rootPath,
                maxDepth,
                showFiles,
                showContent, // Pass the flag
                contentLines // Pass max lines
            );

            console.log(treeString); // Log to console
            new Notice('Generated file tree with content! Check console (Ctrl+Shift+I).');

            // Optional: Display in a modal or temporary file
            // Be careful: Including content can make the output very large!
            // await this.app.vault.create('temp-tree-output.md', treeString);

        } catch (error) {
            console.error("Failed to generate file tree:", error);
            new Notice(`Error generating tree: ${error.message}`);
        }
        });

        this.ribbonIcon = this.addRibbonIcon('bot-message-square', 'Open lImporter', () => this.openView());
        this.ribbonIcon.addClass('limporter-ribbon-icon');

        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('limporter-status-bar');
        this.statusBarItem.onClickEvent(() => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) this.openFileProcessor(activeFile);
        });
        setIcon(this.statusBarItem, "bot");

        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(this.app.vault.on("create", (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    const extension = file.extension.toLowerCase();
                    const fileTypeConfigs = this.getSupportedFileTypesConfig();
                    let shouldAutoCapture = false;

                    for (const typeKey in fileTypeConfigs) {
                        if (fileTypeConfigs[typeKey].extensions.includes(extension)) {
                            const settingKey = `autoCapture_${typeKey}` as keyof AutoPluginSettings;
                            // Check if the setting for this file type is true
                            if (this.settings[settingKey] === true) {
                                shouldAutoCapture = true;
                                break;
                            }
                        }
                    }

                    if (shouldAutoCapture) {
                        this.openFileProcessor(file);
                    }
                }
            }));
            this.registerEvent(this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
                if (file instanceof TFile && this.isSupportedFile(file)) { // isSupportedFile uses all extensions
                    menu.addItem((item) => {
                        item.setTitle("Process with lImporter").setIcon("bot-message-square").onClick(() => this.openFileProcessor(file));
                    });
                }
            }));
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
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE, active: true });
            } else {
                new Notice("Could not create a new leaf for lImporter.");
                return;
            }
        }
        if (leaf) {
            this.app.workspace.revealLeaf(leaf);
        }
    }

    private async openFileProcessor(file: TFile): Promise<void> {
        await this.openView();
        if (this.view) {
            await this.view.addFile(file);
        } else {
            new Notice("lImporter view could not be opened or found.");
        }
    }

    private updateStatusBar() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!this.statusBarItem) return; 
        if (!activeFile) {
            this.statusBarItem.hide();
            return;
        }
        if (this.isSupportedFile(activeFile)) { // isSupportedFile uses all extensions
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    // This method now returns ALL extensions the plugin can handle, for UI elements.
    // Auto-capture logic is separate.
    public SupportedFiles(): string[] {
        return this.getAllSupportedExtensions();
    }

    // Checks if a file is generally supported by the plugin (any category)
    private isSupportedFile(file: TFile): boolean {
        return this.getAllSupportedExtensions().includes(file.extension.toLowerCase());
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        // Ensure all auto-capture settings defined in DEFAULT_SETTINGS are present
        // This handles cases where new file types are added and users upgrade
        const fileTypeConfig = this.getSupportedFileTypesConfig();
        for (const typeKey in fileTypeConfig) {
            const settingKey = `autoCapture_${typeKey}` as keyof AutoPluginSettings;
            if (this.settings[settingKey] === undefined && DEFAULT_SETTINGS[settingKey] !== undefined) {
                (this.settings as any)[settingKey] = (DEFAULT_SETTINGS as any)[settingKey];
            } else if (this.settings[settingKey] === undefined) {
                // Fallback if not in DEFAULT_SETTINGS (should be kept in sync)
                 (this.settings as any)[settingKey] = true; // Default to true if not specified
            }
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class FileSuggestionModal extends FuzzySuggestModal<TFile> {
    private didSubmit: boolean = false; 

    constructor(
        app: App,
        private validExtensions: string[], // This will receive all supported extensions
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
        this.didSubmit = true; 
        this.callback(file);
    }

    onClose(): void {
        if (!this.didSubmit) { 
            this.callback(null);
        }
    }
}