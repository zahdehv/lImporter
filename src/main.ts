
import { ItemView, Notice, Plugin, TAbstractFile, TFile, View, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, lImporterSettings, lImporterSettingTab } from './views/settings';
import { ProcessTrackerInstance } from './utils/tracker';

import { ChatView, CHAT_VIEW_TYPE } from './views/chat';
import { LIMPORT_VIEW_TYPE, LimporterView } from './views/lImporter';
import { LOG_VIEW_TYPE, LogView } from './views/logs';

export default class lImporterPlugin extends Plugin {
    settings: lImporterSettings;
    tracker!: ProcessTrackerInstance;

    // Defines categories of supported files and their extensions
    public getSupportedFileTypesConfig(): { [key: string]: { extensions: string[], description: string } } {
        return {
            document: { 
                extensions: ["pdf"], 
                description: "Document files" 
            },
            audio: { 
                extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "aiff"], 
                description: "Audio files" 
            },
            image: {
                extensions: ["png", "jpg", "jpeg"],
                description: "Image files"
            },
            video: { 
                extensions: ["mp4", "mov"], 
                description: "Video files" 
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
            CHAT_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new ChatView(leaf, this)
        );

        const chatRibbon = this.addRibbonIcon("bot-message-square", "Open AI Chat", () => {
            this.activateView(CHAT_VIEW_TYPE);
        });
        chatRibbon.addClass('limporter-ribbon-icon');

        this.registerView(
            LIMPORT_VIEW_TYPE,
            (leaf) => (new LimporterView(leaf, this))
        );
        const lri = this.addRibbonIcon('import', 'lImporter', () => this.activateView(LIMPORT_VIEW_TYPE));
        lri.addClass('limporter-ribbon-icon');

        this.registerView(
            LOG_VIEW_TYPE,
            (leaf) => (new LogView(leaf, this))
        );
        const lgri = this.addRibbonIcon('logs', 'LOGS', () => this.activateView(LOG_VIEW_TYPE));
        lgri.addClass('limporter-ribbon-icon');

        this.addRibbonIcon("pen", "TEST", async () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('No active note');
                return;
            }
            new Notice(activeFile.path);
        });

        chatRibbon.addClass('limporter-ribbon-icon');
        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(this.app.vault.on("create", (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    const extension = file.extension.toLowerCase();
                    const fileTypeConfigs = this.getSupportedFileTypesConfig();
                    let shouldAutoCapture = false;

                    for (const typeKey in fileTypeConfigs) {
                        if (fileTypeConfigs[typeKey].extensions.includes(extension)) {
                            const settingKey = `autoCapture_${typeKey}` as keyof lImporterSettings;
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
                        item.setTitle("lImport").setIcon("import").onClick(() => this.openFileProcessor(file));
                    });
                }
            }));
        });
        this.addSettingTab(new lImporterSettingTab(this.app, this));
    }

    private async openFileProcessor(file: TFile): Promise<void> {
        const view = await this.activateView(LIMPORT_VIEW_TYPE);
        if (view && view instanceof LimporterView) {
            await view.addFile(file);
        } else {
            new Notice("lImporter view could not be opened or found.");
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
            const settingKey = `autoCapture_${typeKey}` as keyof lImporterSettings;
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

    async activateView(viewType: string): Promise<View | undefined> {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(viewType);

        if (leaves.length > 0) {
            // A leaf with our view already exists, use that
            leaf = leaves[0];
        } else {
            // No existing leaf, create a new one
            // Try to open in the right sidebar, or a new tab if that fails
            leaf = workspace.getRightLeaf(false); // Get a leaf in the right sidebar, don't split if it's already there
            if (!leaf) { 
                // Fallback to a new leaf in the main workspace if right sidebar is not available or suitable
                leaf = workspace.getLeaf(true); // 'true' for new tab, or 'false' for splitting current
            }
            if (leaf) { // Ensure leaf was successfully created
                await leaf.setViewState({ type: viewType, active: true });
            }
        }

        // Reveal the leaf and make it active
        if ( leaf ) {
            workspace.revealLeaf(leaf);
            return leaf.view;
        } else {
            console.error("AI Chat Plugin: Could not create or find a leaf for the view.");
        }
    }

   async onunload() {
        console.log(`Unloading plugin: ${this.manifest.name}`);

        this.app.workspace.detachLeavesOfType(LIMPORT_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(LOG_VIEW_TYPE);


    }

}