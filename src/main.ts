import { App, Plugin, TFile, Modal, TAbstractFile, Setting, PluginSettingTab, Notice } from 'obsidian';
import WaveSurfer from 'wavesurfer.js';
import { setIcon } from 'obsidian';
import { FileItem } from './Utilities/fileUploader';
import { ttsBase, ttsGeminiFL } from './Agent/audioPrep';
import { reActAgentLLM } from './Agent/reActAgent';

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

        // Show waveform is not necessary to begin with
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
    plugin: AutoAudioPlugin;
    processing: boolean = false;
    private tts: ttsBase;
    private reActAgent: reActAgentLLM;
    private sendButton: HTMLButtonElement;
    private isPDF: boolean;
    private progressContainer: HTMLElement;
    private progressSteps: {[key: string]: HTMLElement} = {};
    private currentStep: string = '';

    constructor(plugin: AutoAudioPlugin, public file: TFile) {
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

            if (this.plugin.settings.showWaveform) {
                const waveformContainer = audioContainer.createDiv('limporter-waveform-container');
                const wavesurfer = WaveSurfer.create({
                    media: audioEl,
                    container: waveformContainer,
                    waveColor: 'var(--text-muted)',
                    progressColor: 'var(--interactive-accent)',
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

        // Description text
        contentContainer.createEl('p', {
            text: `This will process your ${this.isPDF ? 'PDF' : 'audio'} file and create structured notes based on its content.`,
            cls: 'limporter-description'
        });

        // Add progress tracking section
        this.createProgressTracker(contentContainer);

        // Process Button
        const buttonContainer = contentEl.createDiv('limporter-button-container');
        this.sendButton = buttonContainer.createEl('button', { 
            cls: 'limporter-button primary',
            text: 'Process File'
        });
        
        const buttonIcon = document.createElement('span');
        setIcon(buttonIcon, 'corner-down-left');
        this.sendButton.prepend(buttonIcon);

        this.sendButton.addEventListener('click', async () => {
            this.sendButton.disabled = true;
            this.processing = true;
            this.waitCLK();
            let successful = false;
            try {
                // Reset progress tracker
                this.resetProgressTracker();
                
                // Step 1: Upload and transcribe
                this.updateProgressStep('upload', 'in-progress', 'Uploading file...');
                await sleep(500); // Small delay for UI update
                
                // Step 2: Transcribe/analyze content
                this.updateProgressStep('upload', 'complete', 'File uploaded');
                this.updateProgressStep('transcribe', 'in-progress', 'Transcribing and analyzing content...');
                
                // Monitor for console logs from audioPrep.ts
                const originalConsoleLog = console.log;
                console.log = (...args) => {
                    originalConsoleLog(...args);
                    
                    // Check for specific log messages to update progress
                    if (args[0] === "--- Transcription Analysis ---") {
                        this.updateProgressStep('transcribe', 'complete', 'Content analyzed');
                        this.updateProgressStep('generate', 'in-progress', 'Generating structured notes...');
                    }
                };
                
                const prompt = await this.tts.transcribe(fileItem);
                
                // Step 3: Generate content with reActAgent
                this.updateProgressStep('generate', 'complete', 'Notes structure generated');
                this.updateProgressStep('write', 'in-progress', 'Writing files...');
                
                // Monitor for tool calls in reActAgent
                const originalConsoleLog2 = console.log;
                let fileCount = 0;
                console.log = (...args) => {
                    originalConsoleLog2(...args);
                    
                    // Check for file creation logs
                    if (typeof args[0] === 'string' && args[0].includes('Creating file')) {
                        fileCount++;
                        this.updateProgressDetail('write', `Creating file ${fileCount}...`);
                    }
                    
                    // Check for ghost references check
                    if (args[0] === "GHOST") {
                        this.updateProgressStep('write', 'complete', `${fileCount} files created`);
                        this.updateProgressStep('verify', 'in-progress', 'Verifying links...');
                    }
                };
                
                const finalState = await this.reActAgent.app.invoke({
                    messages: [{ role: "user", content: prompt }],
                }, {"recursionLimit": 100});
                
                // Restore original console.log
                console.log = originalConsoleLog;
                
                // Step 4: Complete
                this.updateProgressStep('verify', 'complete', 'Links verified');
                this.updateProgressStep('complete', 'complete', 'Processing complete!');
                
                const answer = finalState.messages[finalState.messages.length - 1].content;
                console.log(answer);
                successful = true;
            } catch (error) {
                console.error(error);
                this.updateProgressStep(this.currentStep, 'error', `Error: ${error.message || 'Unknown error'}`);
            }
            this.processing = false;
            this.sendButton.disabled = false;
            if (successful) {
                setIcon(buttonIcon, 'check');
                this.sendButton.textContent = ' Success';
                this.sendButton.prepend(buttonIcon);
            } else {
                setIcon(buttonIcon, 'x');
                this.sendButton.textContent = ' Failed';
                this.sendButton.prepend(buttonIcon);
            }
        });
    }

    private createProgressTracker(container: HTMLElement) {
        // Create progress container
        this.progressContainer = container.createDiv('limporter-progress-container');
        this.progressContainer.style.display = 'none'; // Hide initially
        
        // Create progress steps
        const steps = [
            { id: 'upload', label: 'Upload', icon: 'upload' },
            { id: 'transcribe', label: 'Transcribe', icon: 'file-audio' },
            { id: 'generate', label: 'Generate', icon: 'bot-message-square' },
            { id: 'write', label: 'Write Files', icon: 'file-text' },
            { id: 'verify', label: 'Verify Links', icon: 'link' },
            { id: 'complete', label: 'Complete', icon: 'check-circle' }
        ];
        
        for (const step of steps) {
            const stepEl = this.progressContainer.createDiv('limporter-progress-step');
            stepEl.dataset.status = 'pending';
            
            const iconContainer = stepEl.createDiv('limporter-step-icon');
            setIcon(iconContainer, step.icon);
            
            const stepContent = stepEl.createDiv('limporter-step-content');
            const stepLabel = stepContent.createDiv('limporter-step-label');
            stepLabel.textContent = step.label;
            
            const stepStatus = stepContent.createDiv('limporter-step-status');
            stepStatus.textContent = 'Pending';
            
            this.progressSteps[step.id] = stepEl;
        }
    }
    
    private resetProgressTracker() {
        this.progressContainer.style.display = 'flex';
        for (const id in this.progressSteps) {
            this.progressSteps[id].dataset.status = 'pending';
            const statusEl = this.progressSteps[id].querySelector('.limporter-step-status');
            if (statusEl) statusEl.textContent = 'Pending';
        }
    }
    
    private updateProgressStep(stepId: string, status: 'pending' | 'in-progress' | 'complete' | 'error', message?: string) {
        if (!this.progressSteps[stepId]) return;
        
        this.currentStep = stepId;
        this.progressSteps[stepId].dataset.status = status;
        
        const statusEl = this.progressSteps[stepId].querySelector('.limporter-step-status');
        if (statusEl && message) statusEl.textContent = message;
        
        // Update icon based on status
        const iconEl = this.progressSteps[stepId].querySelector('.limporter-step-icon');
        if (iconEl) {
            if (status === 'in-progress') {
                setIcon(iconEl as HTMLElement, 'loader');
            } else if (status === 'complete') {
                setIcon(iconEl as HTMLElement, 'check');
            } else if (status === 'error') {
                setIcon(iconEl as HTMLElement, 'x');
            }
        }
    }
    
    private updateProgressDetail(stepId: string, detail: string) {
        if (!this.progressSteps[stepId]) return;
        
        const statusEl = this.progressSteps[stepId].querySelector('.limporter-step-status');
        if (statusEl) statusEl.textContent = detail;
    }

    private async waitCLK() {
        const buttonIcon = this.sendButton.querySelector('span');
        this.sendButton.textContent = ' Processing';
        if (buttonIcon) this.sendButton.prepend(buttonIcon);
        
        for (let index = 0; this.processing; index++) {
            if (buttonIcon) {
                setIcon(buttonIcon, 'clock-'+((index%12)+1));
            }
            await sleep(500);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}