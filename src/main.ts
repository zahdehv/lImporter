import { App, Plugin, TFile, Modal, TAbstractFile, Setting, PluginSettingTab, Notice } from 'obsidian';
import WaveSurfer from 'wavesurfer.js';
import { setIcon } from 'obsidian';
import { Pipeline } from './Agent/Pipeline';
import { FileItem } from './Utilities/fileUploader';
import * as pdfjsLib from 'pdfjs-dist';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';

interface AutoPluginSettings {
    GOOGLE_API_KEY: string;
    showWaveform: boolean;
    allowPDF: boolean;
}

const DEFAULT_SETTINGS: AutoPluginSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',
    showWaveform: false,
    allowPDF: true,
};

class AutoSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: AutoAudioPlugin) {
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

        // new Setting(containerEl)
        //     .setName('Show Waveform')
        //     .setDesc('Show a cute waveform for the audio.')
        //     .addToggle(toggle => toggle
        //         .setValue(this.plugin.settings.showWaveform)
        //         .onChange(async (value) => {
        //             this.plugin.settings.showWaveform = value;
        //             await this.plugin.saveSettings();
        //         }));

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

export default class AutoAudioPlugin extends Plugin {
    settings: AutoPluginSettings;

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
    plugin: AutoAudioPlugin;
    processing: boolean = false;
    private pipeline: Pipeline;
    private sendButton: HTMLButtonElement;
    private isPDF: boolean;

    constructor(plugin: AutoAudioPlugin, public file: TFile) {
        super(plugin.app);
        this.plugin = plugin;
        this.pipeline = new Pipeline(plugin);
        this.isPDF = file.extension.toLowerCase() === 'pdf';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.setTitle(`process file?`);

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

        if (this.isPDF) {
            // PDF Display
            const pdfContainer = contentEl.createDiv({ cls: 'pdf-preview-container' });
            
            // PDF Icon and Name
            const pdfInfo = pdfContainer.createDiv({ cls: 'pdf-info' });
            setIcon(pdfInfo.createDiv({ cls: 'pdf-icon' }), 'file-text');
            pdfInfo.createEl('div', { 
                cls: 'pdf-name',
                text: this.file.name 
            });

        } else {
            // Audio Display
            contentEl.createEl('div', { 
                cls: 'pdf-name',
                text: this.file.name 
            });
            const audioEl = contentEl.createEl('audio', {
                attr: {
                    controls: 'true',
                    src: objURL
                }
            });

            if (this.plugin.settings.showWaveform) {
                const waveformContainer = contentEl.createDiv({ cls: 'waveform-container' });
                const wavesurfer = WaveSurfer.create({
                    media: audioEl,
                    container: waveformContainer,
                    waveColor: '#555',
                    progressColor: '#9600ec',
                    barWidth: 4,
                    barHeight: 1,
                    barGap: 1,
                    height: 40,
                    cursorWidth: 0,
                    barRadius: 7,
                    dragToSeek: true,
                    interact: true,
                });
                await wavesurfer.loadBlob(blob);
            }
        }

        // Process Button
        const buttonContainer = contentEl.createDiv('button-container');
        this.sendButton = buttonContainer.createEl('button', { 
            cls: 'mod-cta' 
        });
        setIcon(this.sendButton, 'corner-down-left');

        this.sendButton.addEventListener('click', async () => {
            this.sendButton.disabled = true;
            this.processing = true;
            this.waitCLK();
            let successful = false;
            try {
                const result = await this.pipeline.pipe(fileItem);
                successful = true;
            } catch (error) {
                console.error(error);
            }
            this.processing = false;
            this.sendButton.disabled = false;
            if (successful) {
                setIcon(this.sendButton, 'check');
                // setTimeout(() => {
                //     setIcon(this.sendButton, 'corner-down-left');
                // }, 2000);
            } else {
                setIcon(this.sendButton, 'x');
                // setTimeout(() => {
                //     setIcon(this.sendButton, this.isPDF ? 'file-text' : 'corner-down-left');
                // }, 2000);
            }
        });
    }

    private async waitCLK() {
        for (let index = 0; this.processing; index++) {
            setIcon(this.sendButton, 'clock-'+((index%12)+1));
            await sleep(500);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}