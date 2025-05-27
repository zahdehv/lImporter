import { Setting, App, PluginSettingTab, Notice, } from "obsidian";
import lImporterPlugin from "../main";

export interface lImporterSettings {
    GOOGLE_API_KEY: string;

    autoCapture_audio: boolean;
    autoCapture_image: boolean;
    autoCapture_document: boolean;
    autoCapture_video: boolean;
    autoCapture_plain_text: boolean;
}

export const DEFAULT_SETTINGS: lImporterSettings = {
    GOOGLE_API_KEY: 'your-default-api-key',

    autoCapture_audio: true,
    autoCapture_image: true,
    autoCapture_document: true,
    autoCapture_video: false,
    autoCapture_plain_text: false,
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

        containerEl.createEl('h3', { text: 'DEV Settings' });

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