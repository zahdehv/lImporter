import { Setting, App, PluginSettingTab, Notice,  } from "obsidian";
import lImporterPlugin from "../main";

export interface lImporterSettings {
    GOOGLE_API_KEY: string;
    GEMINI_MODEL: "gemini-2.5-flash-preview-04-17"|"gemini-2.0-flash-lite"|"gemini-2.0-flash";
    LANGUAGE: string;
    autoCapture_audio: boolean;
    autoCapture_image: boolean;
    autoCapture_document: boolean;
    autoCapture_video: boolean;
    autoCapture_plain_text: boolean;
    load_graph_when_clicking_created_file: boolean;
    display_debug_messages: boolean;
    logs_view: boolean;
    chat_view: boolean;
}

export const DEFAULT_SETTINGS: lImporterSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',
    GEMINI_MODEL: "gemini-2.5-flash-preview-04-17",
    LANGUAGE: "SPANISH",
    autoCapture_audio: true,
    autoCapture_image: true,
    autoCapture_document: true,
    autoCapture_video: false,
    autoCapture_plain_text: false,
    load_graph_when_clicking_created_file: false,
    
    chat_view: false,
    
    logs_view: false,
    display_debug_messages: false,
};

export class lImporterSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: lImporterPlugin) {
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
            .setName('Load Graph')
            .setDesc('Loads the local graph instead of file when click on created files.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.load_graph_when_clicking_created_file)
                .onChange(async (value) => {
                    this.plugin.settings.load_graph_when_clicking_created_file = value;
                    await this.plugin.saveSettings();
                }));
        
        containerEl.createEl('h3', { text: 'Auto-Capture Settings' });
        const fileTypeConfigs = this.plugin.getSupportedFileTypesConfig();
        for (const typeKey in fileTypeConfigs) {
            const config = fileTypeConfigs[typeKey];
            const settingKey = `autoCapture_${typeKey}` as keyof lImporterSettings;

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
                
        containerEl.createEl('h3', { text: 'Additional Views' });

        new Setting(containerEl)
            .setName('Chat View')
            .setDesc('Enable the logs view.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.chat_view)
                .onChange(async (value) => {
                    this.plugin.settings.chat_view = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Logs View')
            .setDesc('Enable a chat view.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.logs_view)
                .onChange(async (value) => {
                    this.plugin.settings.logs_view = value;
                    await this.plugin.saveSettings();
                }));


        containerEl.createEl('h3', { text: 'DEV Settings' });

        new Setting(containerEl)
            .setName('DEBUG')
            .setDesc('Display debug messages.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.display_debug_messages)
                .onChange(async (value) => {
                    this.plugin.settings.display_debug_messages = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Reload Plugin')
            .setDesc('Click to reload this plugin. This is useful for applying changes during development or if the plugin encounters an issue.')
            .addButton(button => button
                .setButtonText('Reload Plugin')
                .setCta() // Makes the button more prominent (call to action style)
                .onClick(async () => {
                    const pluginId = this.plugin.manifest.id;
                    const pluginName = this.plugin.manifest.name;

                    button.setDisabled(true); // Disable button during reload
                    button.setButtonText('Reloading...');

                    try {
                        console.log(`Attempting to reload plugin: ${pluginName} (${pluginId})`);

                        // @ts-ignore (Obsidian's private API, but commonly used for this)
                        // More robust way:
                        // await this.app.plugins.disablePlugin(pluginId);
                        await this.plugin.unload();
                        console.log(`Plugin "${pluginName}" disabled.`);
                        // await this.app.plugins.enablePlugin(pluginId);
                        await this.plugin.load();
                        console.log(`Plugin "${pluginName}" enabled.`);
                        
                        new Notice(`Plugin "${pluginName}" reloaded successfully!`);
                    } catch (e) {
                        console.error(`Error reloading plugin "${pluginName}":`, e);
                        new Notice(`Failed to reload plugin "${pluginName}". Check console for details.`);
                    } finally {
                        // Re-enable button and restore text, even if an error occurs
                        // A short delay might be needed if the settings tab itself re-renders too quickly
                        // but usually, this is fine.
                        setTimeout(() => {
                                if (button.buttonEl.isConnected) { // Check if element is still in DOM
                                button.setDisabled(false);
                                button.setButtonText('Reload Plugin');
                            }
                        }, 100); // 100ms delay
                    }
                }));

    }
}