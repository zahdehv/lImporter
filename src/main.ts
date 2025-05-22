
import { Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian'; 
// Removed MarkdownView as it wasn't used.
import { LIMPORT_VIEW_TYPE } from './views/lImporter';
import { LimporterView } from './views/lImporter';
import { LOG_VIEW_TYPE, LogView, patchConsole, unpatchConsole } from './views/logView';
import { DEFAULT_SETTINGS, lImporterSettings, lImporterSettingTab } from './views/settings';
// Removed ProcessTrackerInstance as this.tracker was unused.
import { ChatView, CHAT_VIEW_TYPE } from './views/chat';
// Removed upload_file as it wasn't used directly in main.ts.

/**
 * lImporterPlugin is the main class for the L-Importer plugin.
 * It handles the plugin's lifecycle, settings, view registrations,
 * command additions, and event listeners.
 */
export default class lImporterPlugin extends Plugin {
    /** Current plugin settings. */
    settings: lImporterSettings;
    // tracker!: ProcessTrackerInstance; // Removed as it was unused.
    /** Reference to the main ribbon icon for the lImporter view. */
    private ribbonIconEl!: HTMLElement; // Renamed from ribbonIcon for clarity (El suffix for HTMLElements)
    /** Reference to the active LimporterView instance, if any. */
    public limporterView: LimporterView | null = null; // Renamed from 'view' for clarity

    /**
     * Defines the configuration for supported file types, including their extensions and descriptions.
     * This configuration is used for auto-capture settings and file menu integrations.
     * @returns An object where keys are category names (e.g., 'document', 'audio')
     *          and values are objects containing 'extensions' (array of strings)
     *          and 'description' (string).
     */
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

    /**
     * Returns a flat array of all supported file extensions across all categories.
     * @returns An array of lowercase file extension strings.
     */
    public getAllSupportedExtensions(): string[] {
        const config = this.getSupportedFileTypesConfig();
        return Object.values(config).flatMap(type => type.extensions);
    }

    /**
     * Plugin lifecycle method called when Obsidian loads the plugin.
     * Responsible for initializing settings, views, commands, and event listeners.
     */
    async onload() {
        await this.loadSettings();

        // --- Register Views ---
        // Register AI Chat View
        this.registerView(
            CHAT_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new ChatView(leaf, this)
        );
        // Register lImporter View (main functionality)
        this.registerView(
            LIMPORT_VIEW_TYPE,
            (leaf) => (this.limporterView = new LimporterView(leaf, this))
        );
        // Register Log View
        this.registerView(
            LOG_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new LogView(leaf, this)
        );

        // --- Add Ribbon Icons ---
        // Ribbon icon for AI Chat View
        const chatRibbon = this.addRibbonIcon("bot-message-square", "Open AI Chat", () => {
            this.activateChatView();
        });
        chatRibbon.addClass('limporter-ribbon-icon'); // Optional: for custom styling

        // Ribbon icon for lImporter View
        this.ribbonIconEl = this.addRibbonIcon('import', 'lImporter', () => this.openLimporterView());
        this.ribbonIconEl.addClass('limporter-ribbon-icon'); // Optional: for custom styling

        // Ribbon icon for Log View
        this.addRibbonIcon("scroll-text", "Open System Logs", () => {
            this.activateView(LOG_VIEW_TYPE);
        });
        
        // --- Setup Event Listeners (onLayoutReady ensures workspace is ready) ---
        this.app.workspace.onLayoutReady(() => {
            // Auto-capture: Listen for new file creation in the vault
            this.registerEvent(this.app.vault.on("create", (file: TAbstractFile) => {
                if (file instanceof TFile) { // Ensure it's a file
                    const extension = file.extension.toLowerCase();
                    const fileTypeConfigs = this.getSupportedFileTypesConfig();
                    let shouldAutoCapture = false;

                    // Check if auto-capture is enabled for this file type
                    for (const typeKey in fileTypeConfigs) {
                        if (fileTypeConfigs[typeKey].extensions.includes(extension)) {
                            const settingKey = `autoCapture_${typeKey}` as keyof lImporterSettings;
                            if (this.settings[settingKey] === true) {
                                shouldAutoCapture = true;
                                break;
                            }
                        }
                    }

                    if (shouldAutoCapture) {
                        this.openFileProcessor(file); // Open lImporter view with the new file
                    }
                }
            }));

            // File Menu Integration: Add "lImport" option to context menu for supported files
            this.registerEvent(this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
                if (file instanceof TFile && this.isSupportedFile(file)) {
                    menu.addItem((item) => {
                        item.setTitle("lImport")
                            .setIcon("import")
                            .onClick(() => this.openFileProcessor(file));
                    });
                }
            }));
        });
        
        // --- Add Settings Tab ---
        this.addSettingTab(new lImporterSettingTab(this.app, this));

        // --- Patch Console for LogView ---
        patchConsole(this.settings.display_debug_messages); // Enable console capturing

        // --- Add Commands ---
        // Command to open LogView
        this.addCommand({
            id: 'open-system-logs',
            name: 'Open System Logs',
            callback: () => {
                this.activateView(LOG_VIEW_TYPE);
            }
        });
        // Add other commands as needed, e.g., for lImporter, ChatView
    }

    // simulateLLMProcessing method removed as it was unused/placeholder.

    /**
     * Opens the main lImporter view in the workspace.
     * If the view is already open, it reveals it. Otherwise, it creates a new leaf.
     * @private
     */
    private async openLimporterView(): Promise<void> { // Renamed from openView
        let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(LIMPORT_VIEW_TYPE)[0];
        if (!leaf) {
            leaf = this.app.workspace.getRightLeaf(false); // Try to open in right sidebar
            if (leaf) {
                await leaf.setViewState({ type: LIMPORT_VIEW_TYPE, active: true });
            } else {
                new Notice("Could not create a new leaf for lImporter.");
                return;
            }
        }
        if (leaf) {
            this.app.workspace.revealLeaf(leaf); // Focus the view
        }
    }

    /**
     * Opens the lImporter view and adds a specific file to its processing list.
     * @param file - The TFile to add to the lImporter view.
     * @private
     */
    private async openFileProcessor(file: TFile): Promise<void> {
        await this.openLimporterView(); // Ensure the lImporter view is open
        if (this.limporterView) {
            await this.limporterView.addFile(file); // Add the file to the view
        } else {
            new Notice("lImporter view could not be opened or found.");
        }
    }

    /**
     * Activates a specified view type in the workspace.
     * If a view of this type exists, it's revealed. Otherwise, a new leaf is created for it.
     * @param viewType - The string identifier of the view to activate.
     */
    async activateView(viewType: string) {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);

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
                await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
            }
        }

        // Reveal the leaf and make it active
        if (leaf) {
            workspace.revealLeaf(leaf);
        } else {
            console.error("AI Chat Plugin: Could not create or find a leaf for the chat view.");
        }
    }
   async onunload() {
        console.log(`Unloading plugin: ${this.manifest.name}`);

        // 1. Detach (close) any custom views
        //    Obsidian <1.5.0: this.app.workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE).forEach((leaf) => leaf.detach());
        //    Obsidian >=1.5.0:
        this.app.workspace.detachLeavesOfType(LIMPORT_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(LOG_VIEW_TYPE); // Detach LogView

        // 2. Nullify references to views to help with garbage collection
        this.view = null;

        // 3. Unpatch console
        unpatchConsole();

        // 3. Clean up any other resources or listeners YOUR plugin specifically created
        //    that are NOT automatically handled by Obsidian's lifecycle methods
        //    (e.g., intervals, global event listeners, external library instances).
        //    For example, if `ProcessTrackerInstance` had a `destroy` method:
        //    if (this.tracker) {
        //        this.tracker.destroy();
        //    }
        
        // Obsidian automatically handles:
        // - Unregistering events registered with `this.registerEvent()`
        // - Removing ribbon icons added with `this.addRibbonIcon()`
        // - Removing commands added with `this.addCommand()`
        // - Removing setting tabs added with `this.addSettingTab()`
        // - Unregistering views registered with `this.registerView()` (detaching them is still good practice)
    }

}