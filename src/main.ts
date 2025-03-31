import { App, Plugin, TFile, Modal, TAbstractFile, Setting, PluginSettingTab, Notice } from 'obsidian';
import WaveSurfer from 'wavesurfer.js';
import { setIcon } from 'obsidian';
import { Pipeline } from './Agent/Pipeline';
import { AudioItem } from './Utilities/fileUploader';

interface AutoPluginSettings {
    GOOGLE_API_KEY: string;
    showWaveform: boolean;
}

const DEFAULT_SETTINGS: AutoPluginSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',
    showWaveform: false,
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
                    // Remove the password attribute to make the input visible
                    // .inputEl.setAttribute('type', 'password'); // Comment out or remove this line
                text.onChange(async (value) => {
                    this.plugin.settings.GOOGLE_API_KEY = value;
                    await this.plugin.saveSettings();
                });
            });

            // Show waveform togle
        new Setting(containerEl)
        .setName('Show Waveform')
        .setDesc('Show a cute waveform for the audio.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showWaveform)
            .onChange(async (value) => {
                this.plugin.settings.showWaveform = value;
                await this.plugin.saveSettings();
            }));
            
    }
}

export default class AutoAudioPlugin extends Plugin {
    settings: AutoPluginSettings;

    async onload() {
        await this.loadSettings()
        // Wait for vault to fully load before watching for new files
        this.app.workspace.onLayoutReady(() => {
            this.registerEvent(
                this.app.vault.on("create", (file: TAbstractFile) => {
                    if (file instanceof TFile && this.isAudioFile(file)) {
                        this.openAudioProcessor(file);
                    }
                })
            );
        });
        this.addSettingTab(new AutoSettingTab(this.app, this));
    }

    private isAudioFile(file: TFile): boolean {
        const audioExtensions = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "aiff"];
        return audioExtensions.includes(file.extension.toLowerCase());
    }

    private openAudioProcessor(file: TFile) {
        new AudioProcessorModal(this, file).open();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
    
}

class AudioProcessorModal extends Modal {
    plugin: AutoAudioPlugin;
    processing: boolean = false;
    private pipeline: Pipeline;
    private sendButton: HTMLButtonElement;

    constructor(plugin: AutoAudioPlugin, public file: TFile) {
        super(plugin.app);
        this.plugin = plugin;
        this.pipeline = new Pipeline(plugin);
    }

    async onOpen() {
        const { contentEl } = this;
        // contentEl.setText(`${this.file.name}`);
        this.setTitle(`${this.file.name}`);
        
        const arrayBuffer = await this.app.vault.readBinary(this.file);
        const typeMap: Record<string, string> = {
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            m4a: 'audio/mp4'
        };
        const mime = typeMap[this.file.extension] || 'application/octet-stream';
        const blob = new Blob([arrayBuffer], { type: mime });
        const objURL = URL.createObjectURL(blob);
        const audioItem: AudioItem = {
            url: objURL,
            uploaded: false,
            uploadData: null
        };
        // Example: Create audio player
        const audioEl = contentEl.createEl('audio', {
            attr: {
                controls: 'true',
                src: objURL
            }
        });
        
        if (this.plugin.settings.showWaveform) {
            // Waveform Container (Visualizer)
            const waveformContainer = contentEl.createDiv({
                attr: { style: 'flex: 1; height: 40px; margin-right: 10px; background: transparent; border-radius: 3px; overflow: hidden;' } // Basic styling, adjust as needed
            });
            // Initialize WaveSurfer (but don't load audio yet)
            const wavesurfer = WaveSurfer.create({
                media: audioEl,
                container: waveformContainer,
                waveColor: '#555',
                progressColor: '#9600ec',
                barWidth: 4,
                barHeight: 1,
                barGap: 1,
                height: 40, // Match container height
                cursorWidth: 0,
                barRadius:7,
                dragToSeek:true,
                interact: true,
            });
            
            // this.wavesurfer.load(objURL);
            await wavesurfer.loadBlob(blob);
            }

        //Here goes the butttttttons logic
        const buttonContainer = contentEl.createDiv('button-container');

        // // Add Send button
        // new ButtonComponent(buttonContainer)
        // .setButtonText('Send')
        // .setIcon('corner-down-left')
        //     .setCta()
        //     .onClick(() => this.handleProcess());

        this.sendButton = buttonContainer.createEl('button', { 
            text: 'Raw HTML Button',
            cls: 'mod-cta' 
        });
        setIcon(this.sendButton,'corner-down-left');
        
        this.sendButton.addEventListener('click', async () => {
            
            this.sendButton.disabled = true;
            this.processing = true;
            this.waitCLK(); // starts an async process without waiting for it, but it stops based on this.processing
            let successful = false;
            try {
                const result = await this.pipeline.pipe(audioItem);
                successful = true;
            } catch (error) {
                console.error(error);
                await sleep(4000);
            }
            this.processing=false;
            this.sendButton.disabled = false;
            if (successful) {
                setIcon(this.sendButton, 'refresh-cw')
            } else {setIcon(this.sendButton, 'corner-down-left')}
            
        });
        

    }
    private async waitCLK(){
        for (let index = 0; this.processing; index++) {
            setIcon(this.sendButton, 'clock-'+((index%12)+1))
            await sleep(500);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}