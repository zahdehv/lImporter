import { App, Plugin, TFile, Modal, TAbstractFile, Setting, PluginSettingTab, Notice } from 'obsidian';
import { setIcon } from 'obsidian';
import { FileItem } from './fileUploader';
import { ttsBase, ttsGeminiFL } from './filePrep';
import { reActAgentLLM } from './reActAgent';
import { processTracker } from './processTracker';
import { isAIMessageChunk } from '@langchain/core/messages';

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
    
    async onload() {
        await this.loadSettings();
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
        this.addSettingTab(new AutoSettingTab(this.app, this));
    }

    private isSupportedFile(file: TFile): boolean {
        const supportedExtensions = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "aiff"];
        if (this.settings.allowPDF) { supportedExtensions.push("pdf"); };
        return supportedExtensions.includes(file.extension.toLowerCase());
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

class FileProcessorModal extends Modal {
    private plugin: AutoFilePlugin;
    private processing: boolean = false;
    private tts: ttsBase;
    private reActAgent: reActAgentLLM;
    private sendButton: HTMLButtonElement;
    private isPDF: boolean;
    private abortController: AbortController | any;
    

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
        
        // Create content container
        const contentContainer = contentEl.createDiv('limporter-content');
        
        // File info section
        const fileInfoEl = contentContainer.createDiv('limporter-file-info');
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

        if (!this.isPDF) {
            // Audio player
            const audioContainer = contentContainer.createDiv('limporter-audio-container');
            const audioEl = audioContainer.createEl('audio', {
                attr: {
                    controls: 'true',
                    src: objURL,
                    style: 'width: 100%;'
                }
            });

        }
        
        this.plugin.tracker = new processTracker(contentContainer);

        // Process Button
        const buttonContainer = contentEl.createDiv('limporter-button-container');
        this.sendButton = buttonContainer.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Process File'
        });
        
        // const buttonIcon = document.createElement('span');
        // setIcon(buttonIcon, 'corner-down-left');
        // this.sendButton.prepend(buttonIcon);

        
        this.sendButton.addEventListener('click', async () => {
            if (this.processing) {
            // If already processing, this click should stop the process
                if (this.abortController) {
                    this.abortController.abort();
                    this.processing = false;
                }
                this.sendButton.disabled = true; // Disable while cleaning up
                return;
            }
            
            this.sendButton.classList.add('stop-mode');
            this.abortController = new AbortController();
            this.processing = true;

            this.sendButton.textContent = 'Stop Processing';
            // const stopIcon = this.sendButton.querySelector('span');
            // if (stopIcon) {
                // setIcon(stopIcon, "x-square");
                // this.sendButton.prepend(stopIcon);
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
            this.sendButton.classList.remove('stop-mode');
            this.sendButton.disabled = false;
            
            this.processing = false;
            
            this.sendButton.textContent = 'Process File';
            // const introIcon = this.sendButton.querySelector('span');
            // if (introIcon) {
                // setIcon(introIcon, 'corner-down-left');
                // this.sendButton.prepend(introIcon);
            // }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}