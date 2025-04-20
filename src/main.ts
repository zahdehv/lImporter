import { setIcon, App, Plugin, TFile, Modal, TAbstractFile, Setting, PluginSettingTab, Notice, TextAreaComponent, MarkdownView, ButtonComponent } from 'obsidian';
import {  } from 'obsidian';
import { FileItem } from './fileUploader';
import { ttsBase, ttsGeminiFL } from './filePrep';
import { reActAgentLLM } from './reActAgent';
import { processTracker } from './processTracker';
import Sortable from 'sortablejs';
import { prompt_get_claims_instructions } from './promp';
import { FuzzySuggestModal } from 'obsidian';

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
                text.onChange(async (value) => {
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
    private statusBarItem:any;
    async onload() {
        await this.loadSettings();
        this.statusBarItem = this.addStatusBarItem();
        // Base styling
        this.statusBarItem.style.cssText = `
            display: none;
            padding: 2px 8px;
            border-radius: 4px;
            background-color: var(--background-secondary-alt);
            transition: all 0.2s ease;
            cursor: default;
        `;

        // Hover effects
        this.statusBarItem.onmouseover = () => {
            this.statusBarItem.style.backgroundColor = 'var(--interactive-accent)';
            this.statusBarItem.style.color = 'var(--text-on-accent)';
            this.statusBarItem.style.transform = 'scale(1.05)';
        };

        this.statusBarItem.onmouseout = () => {
            this.statusBarItem.style.backgroundColor = 'var(--background-secondary-alt)';
            this.statusBarItem.style.color = '';
            this.statusBarItem.style.transform = '';
        };

        this.statusBarItem.onClickEvent(() => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile)this.openFileProcessor(activeFile);
        });


        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(
                this.app.vault.on("create", (file: TAbstractFile) => {
                    if (file instanceof TFile && this.isSupportedFile(file)) {
                        this.openFileProcessor(file);
                    }
                })
            );
            
            // Register file menu event for supported files
            this.registerEvent(
                this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
                    if (file instanceof TFile && this.isSupportedFile(file)) {
                        menu.addItem((item) => {
                            item
                                .setTitle("Process with lImporter")
                                .setIcon("bot-message-square")
                                .onClick(() => {
                                    this.openFileProcessor(file);
                                });
                        });
                    }
                })
            );
        });
        // Initial check
    this.updateStatusBar();

    // Register events
    this.registerEvent(
        this.app.workspace.on('file-open', () => this.updateStatusBar())
    );

    this.registerEvent(
        this.app.workspace.on('active-leaf-change', () => this.updateStatusBar())
    );

    this.registerEvent(
        this.app.vault.on('modify', (file) => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile?.path === file.path) {
                this.updateStatusBar();
            }
        })
    );


        
        this.addSettingTab(new AutoSettingTab(this.app, this));
    }

    private updateStatusBar() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.statusBarItem.style.display = "none";
            return;
        }

        const hasTargetExtension = this.isSupportedFile(activeFile);
        this.statusBarItem.style.display = hasTargetExtension ? "block" : "none";
        
        // Optional: Update text to show which extension matched
        if (hasTargetExtension) {
            // this.statusBarItem.setText(`    lImporter`);
            // const icon = document.createElement('span');
            setIcon(this.statusBarItem, 'bot-message-square');
            // this.statusBarItem.prepend(icon);
        }
    }

    public SupportedFiles(): string[] {
        const supportedExtensions = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "aiff"];
        if (this.settings.allowPDF) { supportedExtensions.push("pdf"); };
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
    private processing: boolean = false;
    private tts: ttsBase;
    private reActAgent: reActAgentLLM;
    private isPDF: boolean;
    private abortController: AbortController | any;
    private prompt: string = "";
    private isVisible:boolean = false;
    

    constructor(plugin: AutoFilePlugin, public file: TFile) {
        super(plugin.app);
        this.plugin = plugin;
        this.isPDF = file.extension.toLowerCase() === 'pdf';
        this.tts = new ttsGeminiFL(plugin);
        this.reActAgent = new reActAgentLLM(plugin);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('limporter-modal');
        
        // Create header
        const headerEl = contentEl.createDiv('limporter-header');
        headerEl.createEl('h3', { 
            cls: 'limporter-title',
            text: 'Process with lImporter' 
        });
        
        
        // Prepare file data
        const arrayBuffer = await this.app.vault.readBinary(this.file);
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
        const mime = typeMap[this.file.extension] || 'application/octet-stream';
        const blob = new Blob([arrayBuffer], { type: mime });
        const objURL = URL.createObjectURL(blob);
        const fileItem: FileItem = {
            url: objURL,
            title: this.file.name,
            mimeType: mime,
            uploaded: false,
            uploadData: null
        };
        
        // Create content container
        const contentContainer = contentEl.createDiv('limporter-content');
        // File info section
        const fileHolderEl = contentContainer.createDiv('limporter-file-item');
        const fileInfoEl = fileHolderEl.createDiv('limporter-file-info');
        const iconEl = fileInfoEl.createDiv('limporter-file-icon');
        setIcon(iconEl, this.isPDF ? 'file-text' : 'file-audio');
        
        const fileDetailsEl = fileInfoEl.createDiv('limporter-file-details');
        fileDetailsEl.createEl('div', { 
            cls: 'limporter-file-name',
            text: this.file.name 
        });
        fileDetailsEl.createEl('div', { 
            cls: 'limporter-file-type',
            text: this.isPDF ? 'PDF Document' : 'Audio File' 
        });

        if (!this.isPDF) {
            // Audio player
            const audioEl = fileHolderEl.createEl('audio', {
                attr: {
                    controls: 'true',
                    src: objURL,
                    style: 'width: 100%;'
                }
            });

        }
        new Sortable(contentContainer, {handle: ".limporter-file-icon"});
        
        this.plugin.tracker = new processTracker(contentEl);        

        // Process Button
        const buttonContainer = contentEl.createDiv('limporter-button-container');

        const visibilityButton = buttonContainer.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Show PROMPT'
        });

        const addButton = buttonContainer.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Add File'
        });

        addButton.addEventListener('click', async () => {
                //here goes the add logic
                new FileSuggestionModal(this.app, this.plugin.SupportedFiles(), (file) => {
                    if (file) {
                        console.log("Selected file:", file.name);
                        // Do something with the file
                    }
                }).open();

        });

        const sendButton = buttonContainer.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Process File'
        });
        
        
        // const buttonIcon = document.createElement('span');
        // setIcon(buttonIcon, 'corner-down-left');
        // sendButton.prepend(buttonIcon);

        
        sendButton.addEventListener('click', async () => {
            if (this.processing) {
            // If already processing, this click should stop the process
                if (this.abortController) {
                    this.abortController.abort();
                    this.processing = false;
                }
                sendButton.disabled = true; // Disable while cleaning up
                return;
            }
            
            sendButton.classList.add('stop-mode');
            this.abortController = new AbortController();
            this.processing = true;

            sendButton.textContent = 'Stop Processing';
            // const stopIcon = sendButton.querySelector('span');
            // if (stopIcon) {
                // setIcon(stopIcon, "x-square");
                // sendButton.prepend(stopIcon);
            // }

            this.plugin.tracker.resetTracker();
            
            try {
                const signal = this.abortController.signal;
                const prompt = await this.tts.transcribe(fileItem, signal);
                if (prompt) {
                    if (signal.aborted) {
                        throw new Error("Process was aborted by user");
                    }
                    const finalState = await this.reActAgent.agent.invoke({
                        messages: [{ role: "user", content: prompt }],
                    }, {"recursionLimit": 113, signal: signal});// , streamMode: "debug" });


                    const answer = finalState.messages[finalState.messages.length - 1].content;
                    const answer_step = this.plugin.tracker.appendStep("Answer", answer, "bot-message-square");
                    answer_step.updateState("pending");

                    // for await (const event of this.reActAgent.agent.streamEvents(
                    //     { messages: [{ role: "user", content: prompt }] },
                    //     { version: "v2" }
                    //   )) {
                    //     if (event.event === "on_chain_stream") {
                    //         console.log(event);                            
                    //     }
                    //     // console.log(event.event);
                       
                    //   }
                      
                } 
                    
                } catch (error) {
                console.error(error);
                const errortrack = this.plugin.tracker.appendStep("General Error", error,'x');
                errortrack.updateState("error", error);
            }
            
            this.abortController = null;
            sendButton.classList.remove('stop-mode');
            sendButton.disabled = false;
            
            this.processing = false;
            
            sendButton.textContent = 'Process File';
            // const introIcon = sendButton.querySelector('span');
            // if (introIcon) {
                // setIcon(introIcon, 'corner-down-left');
                // sendButton.prepend(introIcon);
            // }
        });

        const textccc = contentEl.createDiv('limporter-content');
        textccc.style.display = 'none';
        const AdjustFunct = this.createMaterialTextArea(textccc);
        visibilityButton.addEventListener('click', async () => {
            if (this.isVisible) {
                visibilityButton.classList.remove('stop-mode');
                visibilityButton.textContent = 'Show PROMPT';
                
            } else{
                visibilityButton.classList.add('stop-mode');
                visibilityButton.textContent = 'Hide PROMPT';
                }
            
                this.isVisible = !this.isVisible;
                    // const textareaContainer = contentEl.querySelector('.textarea-container');
                    
                if (textccc) {
                    textccc.style.display = this.isVisible ? 'block' : 'none';
                    AdjustFunct();
                }
                
        });
        // const srt=new Sortable(buttonContainer, {})
        // const srt1=new Sortable(contentEl, {})
    }

    private createMaterialTextArea(containerEl: HTMLElement) {

        // Create the text area
        const textArea = new TextAreaComponent(containerEl)
        .setPlaceholder("Type your message...")
        .setValue(prompt_get_claims_instructions)
        .onChange((value) => {
            // Handle text changes
            this.prompt = value;
        });

        // Get the underlying HTML element
        const textAreaEl = textArea.inputEl;

        // Apply Material Design styling
        textAreaEl.addClass("material-textarea");
        textAreaEl.style.width = "100%";
        textAreaEl.style.minHeight = "56px";
        textAreaEl.style.padding = "1.5rem";
        textAreaEl.style.borderRadius = "4px";
        textAreaEl.style.border = "none";
        textAreaEl.style.backgroundColor = "var(--background-primary)";
        textAreaEl.style.boxShadow = "0 1px 2px 0 rgba(0,0,0,0.1)";
        textAreaEl.style.transition = "box-shadow 0.3s ease";
        textAreaEl.style.resize = "none";
        textAreaEl.style.fontFamily = "inherit";
        textAreaEl.style.maxHeight = '400px';
        textAreaEl.style.overflowY = 'auto'; 
        textAreaEl.style.transition = 'height 0.2s ease';

        textAreaEl.style.resize = 'none';
        // textAreaEl.style.overflowY = 'hidden'; // Hide scrollbar
        
        // Function to adjust height
        const adjustHeight = () => {
            textAreaEl.style.height = 'auto'; // Reset height
            textAreaEl.style.height = `${textAreaEl.scrollHeight}px`; // Set to content height
        };
  
        // Initial adjustment
        adjustHeight();
  
        // Adjust on input
        textAreaEl.addEventListener('input', adjustHeight);

        // Focus effects
        textAreaEl.addEventListener("focus", () => {
        textAreaEl.style.boxShadow = "0 2px 4px -1px rgba(0,0,0,0.2), 0 4px 5px 0 rgba(0,0,0,0.14), 0 1px 10px 0 rgba(0,0,0,0.12)";
        textAreaEl.style.outline = "none";
        });

        textAreaEl.addEventListener("blur", () => {
        textAreaEl.style.boxShadow = "0 1px 2px 0 rgba(0,0,0,0.1)";
        });


        return adjustHeight;
      }
      
    

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}