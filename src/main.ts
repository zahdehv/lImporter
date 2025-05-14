
import { Notice, Plugin, prepareFuzzySearch, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { processTracker } from './views/tracker'; // Ensure this path is correct
import { VIEW_TYPE } from './views/lImporter';
import { LimporterView } from './views/lImporter';
import { DEFAULT_SETTINGS, AutoPluginSettings, AutoSettingTab } from './views/settings';
import { queryVault, simpleQueryVault } from './utils/filesystem';

export default class AutoFilePlugin extends Plugin {
    settings: AutoPluginSettings;
    tracker!: processTracker;
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

        this.addRibbonIcon('pen', 'TEST', async () => {
            console.log([1,2,3].slice(0,));
        new Notice("Clicked test Button!!", 10)
        });

        this.ribbonIcon = this.addRibbonIcon('bot-message-square', 'Open lImporter', () => this.openView());
        this.ribbonIcon.addClass('limporter-ribbon-icon');

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