import { Setting, App, PluginSettingTab, Notice } from "obsidian";
import AutoFilePlugin from "../main";

export interface AutoPluginSettings {
    GOOGLE_API_KEY: string;
    LANGUAGE: string;
    track_ReadFiles : boolean;
    autoCapture_audio: boolean;
    autoCapture_image: boolean;
    autoCapture_document: boolean;
    autoCapture_plain_text: boolean;
    load_graph_when_clicking_created_file: boolean;
    display_debug_messages: boolean;
}

export const DEFAULT_SETTINGS: AutoPluginSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',
    LANGUAGE: "SPANISH",
    track_ReadFiles : true,
    autoCapture_audio: true,
    autoCapture_image: true,
    autoCapture_document: true,
    autoCapture_plain_text: false,
    load_graph_when_clicking_created_file: false,
    display_debug_messages: false,
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
        
        new Setting(containerEl)
        .setName('LANGUAGE')
        .setDesc('Select note creation language.')
        .addDropdown(text => {
            text
                .addOptions({"SPANISH":"SPANISH","ENGLISH":"ENGLISH"})
                .setValue(this.plugin.settings.LANGUAGE)
                .onChange(async (value) => {
                    this.plugin.settings.LANGUAGE = value;
                    new Notice(value);
                    await this.plugin.saveSettings();
                });
        });

        containerEl.createEl('h3', { text: 'Process Settings' });
        new Setting(containerEl)
            .setName('Track read files too')
            .setDesc('Allow tracking the files read by the agent.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.track_ReadFiles)
                .onChange(async (value) => {
                    this.plugin.settings.track_ReadFiles = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Load Graph')
            .setDesc('Loads the local graph instead of file when click on created files.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.load_graph_when_clicking_created_file)
                .onChange(async (value) => {
                    this.plugin.settings.load_graph_when_clicking_created_file = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('DEBUG')
            .setDesc('Display debug messages.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.display_debug_messages)
                .onChange(async (value) => {
                    this.plugin.settings.display_debug_messages = value;
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