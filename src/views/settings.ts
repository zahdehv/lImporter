import { Setting, App, PluginSettingTab } from "obsidian";
import AutoFilePlugin from "../main";

export interface AutoPluginSettings {
    GOOGLE_API_KEY: string;
    track_ReadFiles : boolean;
    autoCapture_audio: boolean;
    autoCapture_image: boolean;
    autoCapture_document: boolean;
    autoCapture_plain_text: boolean;
}

export const DEFAULT_SETTINGS: AutoPluginSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',
    track_ReadFiles : true,
    autoCapture_audio: true,
    autoCapture_image: true,
    autoCapture_document: true,
    autoCapture_plain_text: false,
};

export class AutoSettingTab extends PluginSettingTab {
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